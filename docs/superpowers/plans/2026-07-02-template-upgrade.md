# Template Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the company-readiness gaps in ai-project-template: hygiene fixes + self-CI now (Phase 1, fully specified below), then deterministic init, Python/mixed-stack parity, and versioning/org overlay (Phases 2–4, scoped here; each gets its own plan once the open questions are answered).

**Architecture:** Phase 1 makes the template repo test itself (a validation script run locally and in a GitHub Actions workflow) and isolates the TS-specific templates under `templates/ts/` so Phase 3 can add `templates/py/` symmetrically. Later phases build on that gate: every subsequent PR merges only when template CI is green.

**Tech Stack:** Node 22 (plain `.mjs`, no build step), GitHub Actions, existing `.claude/skills/*` layout.

---

## Phase 0 — Answers (recorded 2026-07-02, interactive session)

**Q1. GitHub org:** `psmsun` (where the template lives; degit examples + CODEOWNERS use it).
**Q2. Skill supply chain:** keep upstream (live installs from `mattpocock/skills` + `obra/superpowers`). No forks — Phase 4's fork work is DROPPED.
**Q3. Org defaults:** license **proprietary** ("All rights reserved"); CODEOWNERS default `@psmsun`; deploy-target interview options: **Docker (generic)** and **AWS**; security scanning in generated CI: **Dependabot + audit step (pnpm audit / pip-audit) + CodeQL**.
**Q4. Validation runs:** approved, but run them **sparingly** — only at phase acceptance points (one TS run after Phase 2; py + mixed after Phase 3), never after individual edits, and on **cheaper models where possible** (sandcastle validation runs use the SC_MODEL default, not Fable).
**Q5. Mixed-stack layout:** `web/` (TS) + `api/` (Python), shared `.claude/` + `docs/` at root, CI matrix over both.
**Q6. Sandcastle model default:** `claude-opus-4-8`.

---

## Phase 1 — Hygiene + template self-CI (executable now)

### Task 1: Fix stale model default and unify PKG_DIR defaults

**Files:**
- Modify: `templates/sandcastle-main.mts:22`
- Modify: `templates/sandcastle-doctor.mjs:18,24`

- [ ] **Step 1.1: Update the model fallback in `templates/sandcastle-main.mts`**

Replace line 22:

```ts
const MODEL = process.env.SC_MODEL || "claude-opus-4-7";
```

with:

```ts
const MODEL = process.env.SC_MODEL || "claude-opus-4-8";
```

- [ ] **Step 1.2: Unify the doctor's PKG_DIR default with main.mts (`"."`, not `"core"`)**

In `templates/sandcastle-doctor.mjs`, replace line 24:

```js
const PKG_DIR = process.env.SC_PKG_DIR || "core";
```

with:

```js
const PKG_DIR = process.env.SC_PKG_DIR || ".";
```

and update the doc comment on line 18 from:

```js
 * Config via env: SC_PKG_DIR (the package the agent builds; default "core").
```

to:

```js
 * Config via env: SC_PKG_DIR (the package the agent builds; default ".").
```

- [ ] **Step 1.3: Verify both files still parse**

Run: `node --check templates/sandcastle-doctor.mjs && echo OK`
Expected: `OK` (`.mts` can't be node-checked without tsx; it is covered by the validator in Task 3.)

- [ ] **Step 1.4: Commit**

```bash
git add templates/sandcastle-main.mts templates/sandcastle-doctor.mjs
git commit -m "fix(templates): current model default; unify SC_PKG_DIR default to '.'"
```

### Task 2: Restructure `templates/` → `templates/ts/`

**Files:**
- Move: `templates/ci.yml`, `templates/sandcastle-doctor.mjs`, `templates/sandcastle-main.mts`, `templates/sandcastle-prompt.md` → `templates/ts/`
- Modify: every file referencing a `templates/<file>` path (found by grep in Step 2.2 — expected: `.claude/skills/init-project/SKILL.md`, `README.md`, possibly `.claude/skills/init-project/skills-manifest.md`)

- [ ] **Step 2.1: Move the files**

```bash
mkdir -p templates/ts
git mv templates/ci.yml templates/sandcastle-doctor.mjs templates/sandcastle-main.mts templates/sandcastle-prompt.md templates/ts/
```

- [ ] **Step 2.2: Find and update every reference to the old paths**

Run: `grep -rn "templates/" --include="*.md" --include="*.json" --include="*.mjs" --include="*.mts" . | grep -v node_modules | grep -v "templates/ts/"`

For each hit that names a moved file (e.g. `templates/sandcastle-prompt.md`), rewrite it to the `templates/ts/` path (e.g. `templates/ts/sandcastle-prompt.md`). Bare references to the `templates/` directory as a whole (e.g. README's "deletes `init-project/` and `templates/`") stay unchanged.

- [ ] **Step 2.3: Verify no stale references remain**

Run: `grep -rn "templates/sandcastle\|templates/ci.yml" . | grep -v node_modules | grep -v "templates/ts/"`
Expected: no output.

- [ ] **Step 2.4: Commit**

```bash
git add -A
git commit -m "refactor(templates): move TS-specific templates under templates/ts/ (prep for templates/py/)"
```

### Task 3: Template self-validation script

**Files:**
- Create: `scripts/validate-template.mjs`
- Test: the script IS the test — it must fail on a seeded error, pass on clean tree.

- [ ] **Step 3.1: Write the validator**

Create `scripts/validate-template.mjs`:

```js
#!/usr/bin/env node
/**
 * Template self-check: run locally (`node scripts/validate-template.mjs`) and in CI.
 * Validates skills, templates, and config examples without needing any toolchain installed.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const errors = [];
const ok = (msg) => console.log(`  ok: ${msg}`);

// 1. Every skill has a SKILL.md with name + description frontmatter.
const skillsDir = ".claude/skills";
for (const skill of readdirSync(skillsDir)) {
  const dir = join(skillsDir, skill);
  if (!statSync(dir).isDirectory()) continue;
  const md = join(dir, "SKILL.md");
  if (!existsSync(md)) { errors.push(`${dir}: missing SKILL.md`); continue; }
  const src = readFileSync(md, "utf8");
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { errors.push(`${md}: missing frontmatter`); continue; }
  for (const field of ["name:", "description:"]) {
    if (!fm[1].includes(field)) errors.push(`${md}: frontmatter missing ${field.slice(0, -1)}`);
  }
  // 2. Markdown links to local files inside the skill dir must resolve.
  for (const m of src.matchAll(/\]\((?!https?:|#)([^)\s]+)\)/g)) {
    const target = join(dir, m[1]);
    if (!existsSync(target)) errors.push(`${md}: broken local link → ${m[1]}`);
  }
  ok(`skill ${skill}`);
}

// 3. Every stack dir under templates/ carries the same required file roles.
const REQUIRED_TEMPLATE_FILES = ["ci.yml", "sandcastle-prompt.md"];
for (const stack of readdirSync("templates")) {
  const dir = join("templates", stack);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of REQUIRED_TEMPLATE_FILES) {
    if (!existsSync(join(dir, f))) errors.push(`${dir}: missing required template file ${f}`);
  }
  ok(`templates/${stack} structure`);
}

// 4. JS templates parse.
for (const f of ["templates/ts/sandcastle-doctor.mjs"]) {
  try { execSync(`node --check ${f}`, { stdio: "pipe" }); ok(`${f} parses`); }
  catch (e) { errors.push(`${f}: syntax error\n${e.stderr}`); }
}

// 5. Config example is valid JSON with the documented fields.
try {
  const cfg = JSON.parse(readFileSync("template.config.example.json", "utf8"));
  for (const field of ["language", "projectType", "packageManager", "sandcastle"]) {
    if (!(field in cfg)) errors.push(`template.config.example.json: missing field ${field}`);
  }
  ok("template.config.example.json");
} catch (e) { errors.push(`template.config.example.json: ${e.message}`); }

if (errors.length) {
  console.error(`\nFAIL (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nTemplate validation PASSED");
```

- [ ] **Step 3.2: Run it — expect PASS on the current tree**

Run: `node scripts/validate-template.mjs`
Expected: `ok:` line per skill + templates + config, ending `Template validation PASSED`, exit 0.

- [ ] **Step 3.3: Prove it can fail (seeded-error test)**

```bash
mv .claude/skills/do-work/SKILL.md /tmp/SKILL.md.bak
node scripts/validate-template.mjs; echo "exit=$?"
mv /tmp/SKILL.md.bak .claude/skills/do-work/SKILL.md
```

Expected: `FAIL (1): - .claude/skills/do-work: missing SKILL.md` and `exit=1`; then restored.

- [ ] **Step 3.4: Run once more to confirm the restore**

Run: `node scripts/validate-template.mjs`
Expected: `Template validation PASSED`.

- [ ] **Step 3.5: Commit**

```bash
git add scripts/validate-template.mjs
git commit -m "test(template): self-validation script (skills, templates, config)"
```

### Task 4: Template self-CI workflow

**Files:**
- Create: `.github/workflows/template-ci.yml`

- [ ] **Step 4.1: Write the workflow**

Create `.github/workflows/template-ci.yml`:

```yaml
# CI for the template repo ITSELF (generated projects get templates/<stack>/ci.yml).
name: template-ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Validate template (skills, templates, config)
        run: node scripts/validate-template.mjs
```

- [ ] **Step 4.2: Commit and push the branch, open the PR**

```bash
git add .github/workflows/template-ci.yml
git commit -m "ci(template): validate skills/templates/config on every PR and main push"
git push -u origin HEAD
gh pr create --title "Phase 1: template hygiene + self-CI" --body "Stale model default fixed, SC_PKG_DIR unified, templates/ -> templates/ts/, self-validation script + CI gate. Per docs/superpowers/plans/2026-07-02-template-upgrade.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4.3: Verify the workflow runs green on the PR**

Run: `gh pr checks --watch`
Expected: `template-ci / validate` → pass. Merge only when green.

---

## Phases 2–4 — Roadmap (each becomes its own plan after Phase 0 answers)

### Phase 2 — T1: Deterministic init (`init.mjs`)

**Deliverable:** `scripts/init.mjs` executing the mechanical ~80% of `init-project` from a single answers object (the `template.config.json` shape): scaffold command, baseline deps, hooks, `npx skills add` loop, sandcastle drop-in from `templates/<stack>/`, finalize + self-remove. `SKILL.md` shrinks to: interview → write answers file → run `node scripts/init.mjs answers.json` → author `coding-standards` only.
**Acceptance:** headless clean-init on a throwaway TS repo produces green `typecheck`/`test`/`build` with zero manual fixes (A1 bar); `validate-template.mjs` gains a check that `init.mjs` parses and its answers schema matches `template.config.example.json`. Gated on Q4 (budget) only.

### Phase 3 — Python parity + mixed-stack init

**Deliverable:** `templates/py/` mirroring `templates/ts/` file-for-file — `ci.yml` (uv sync → ruff → mypy → pytest), `sandcastle-prompt.md`, `sandcastle-doctor.mjs` twin (uv/venv checks instead of pnpm/corepack) — validator's structure check (Task 3, check #3) enforces the mirror automatically. New vendored skill `uv-troubleshooting`. Interview gains **both** answer → layout per Q5, shared `.claude/` + `docs/`, CI matrix over both packages; init self-removal deferred until the stack question is fully resolved.
**Acceptance:** headless clean-init smoke runs green for ts / py / both (Q4); the py run includes one sandcastle AFK issue built end-to-end.

### Phase 4 — Versioning + org overlay

**Deliverable:** template version + commit stamped into `template.config.json` at init; `CHANGELOG.md`; documented upgrade procedure in README ("diff your project against template@<stamped-commit>"); proprietary LICENSE + CODEOWNERS (`@psmsun`) + PR/issue templates dropped in; interview deploy-target options → Docker (generic) / AWS; skill sources unchanged (upstream live, per Q2); Dependabot + audit step + CodeQL added to both `templates/*/ci.yml`.
**Acceptance:** a fresh init produces a repo containing the org files and a stamped `template.config.json`; `validate-template.mjs` checks CHANGELOG has an entry for the current version.

**Out of scope (separate backlog items):** A4 review-agent gate, A5 scheduled triggering.

---

## Final acceptance (your end-to-end test, one sitting)

```bash
# after all phases merge — three throwaway inits:
npx degit <org>/ai-project-template t-ts   && cd t-ts   # init headless: TS   → pnpm typecheck+test+build green
npx degit <org>/ai-project-template t-py   && cd t-py   # init headless: Py   → ruff+mypy+pytest green
npx degit <org>/ai-project-template t-mix  && cd t-mix  # init headless: both → both suites green, one CI matrix
```

Each repo: open a trivial PR, confirm the generated CI goes green. Exact headless-init commands will be finalized in the Phase 2 plan (they depend on `init.mjs`'s answers-file interface).
