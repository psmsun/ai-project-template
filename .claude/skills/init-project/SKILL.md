---
name: init-project
description: "Bootstrap a new project from this template: interview the stack, run the deterministic init script (scaffold + skills + sandcastle), generate the project's coding-standards skill, then clean up. Use ONCE when starting a new project from the ai-project-template (e.g. user says 'init the project', 'bootstrap this template', 'set up a new project')."
---

# Init Project

Run this **once**, in a fresh copy of the template, before writing any application code.

**EXECUTE every step — run the commands; do not just describe the plan and stop.** Carry on
through all steps in one session until the cleanup pass succeeds. (Init has previously been
*loaded* but not *run to completion* — don't repeat that.)

The mechanical work (scaffold, deps, config files, skill installs, sandcastle wiring, finalize,
self-remove) is done by **`scripts/init.mjs`** — deterministic, validated, cheap. Your job is
ONLY: (1) the interview, (2) writing the answers file, (3) authoring `coding-standards`,
(4) the two script invocations. Do NOT hand-run the commands the script performs.

Read [coding-standards-guidance.md](coding-standards-guidance.md) first — it is the source of
truth for baselines and the standards you'll generate. [skills-manifest.md](skills-manifest.md)
documents which workflow skills the script installs and why.

## Workflow

### 1. Interview the stack (language first)

Make `grill-me` available first if the user wants the decisions pressure-tested:
`npx skills add mattpocock/skills -s grill-me --copy -y`.

Conduct a light grilling — for each non-default choice ask *why* and surface the trade-off
(e.g. "Postgres over SQLite — do you need concurrent writes / a hosted DB, or is this
local-first?"). Ask one decision at a time:

1. **Language** — `typescript` or `python`? (mixed-stack `both` is coming — Phase 3b; until then init one stack, add the second manually)
2. **Project type** — TS: `library` (headless package — no UI, no React) or app (`vite-react`, `react-router`, `nextjs` → set `framework`); Python: `library`, `cli`, or `service`.
3. **Scaffold location** — `.` (repo root) or a subfolder (e.g. `core/`) for monorepo layouts where `.claude/` + `docs/` stay shared at the root.
4. **Database** — `none` (default for libraries), `sqlite`, `postgres`.
5. **Package manager** — `pnpm` (TS) / `uv` (Python). These are the encoded defaults; npm/yarn/poetry fall back to manual setup (rare — confirm the user really needs it).
6. **Deploy target** — `docker`, `aws`, or `null` (recorded for the README; no action now).
7. **Skill location** — `project` (committed, `--copy`; **required for sandcastle Docker runs** which only see repo-committed skills) or `global`. Default: `project`.
8. **Sandcastle** — set up the AFK runner? `{ "enabled": true|false, "mode": "docker"|"no-sandbox" }`.

### 2. Write the answers file and run init

Write the answers to `.init-answers.json` (exact shape of `template.config.example.json` — the
script validates the fields):

```json
{
  "language": "typescript",
  "projectType": "library",
  "framework": "none",
  "scaffoldLocation": ".",
  "skillLocation": "project",
  "database": "none",
  "packageManager": "pnpm",
  "deployTarget": "docker",
  "sandcastle": { "enabled": true, "mode": "docker" },
  "codingStandards": { "source": "generated", "remoteSlug": null }
}
```

Then:

```
node scripts/init.mjs .init-answers.json
```

The script scaffolds the toolchain (with every validated gotcha: exact `packageManager` pin,
`allowBuilds` map, `ignoreDeprecations: "6.0"`, `~/*` alias, husky v9, mypy hook deps, pytest
src-layout…), installs the workflow skills, wires sandcastle from `templates/<stack>/`, and
writes `template.config.json`. Watch its output — it prints any remaining manual steps
(sandcastle `.env` secrets, optional shadcn init).

### 3. Author the `coding-standards` skill

1. Unless generation is already the chosen path: `npx skills find coding-standards` (+ stack
   terms). If a strong remote match exists, offer `npx skills add <owner/repo>` (y/n) and set
   `codingStandards.source: "remote"` in the answers file.
2. Otherwise **generate** `.claude/skills/coding-standards/SKILL.md` (+ reference files) from
   the conventions in `coding-standards-guidance.md` for the chosen ecosystem — accurate to what
   was **actually installed** (no SQLite rules in a Postgres project). Follow the generator
   notes at the bottom of the guidance (example-driven, "Use when…" description, app-vs-library
   structure).

### 4. Cleanup pass (self-check + self-remove)

```
node scripts/init.mjs .init-answers.json --cleanup
```

This runs the project's real feedback loops (TS: typecheck + test + build · Python: ruff +
mypy + pytest), verifies `coding-standards` exists, then removes the template meta
(`init-project/`, `templates/`, the example config, `TEMPLATE-IMPROVEMENTS.md`, the init
scripts, template-ci) and strips the bootstrap note from `CLAUDE.md`. **If the self-check
fails, fix the cause and re-run — do NOT report success on a red check.**

Then: commit the baseline and push to `main` (PR-per-issue branches off `origin/main`, so the
scaffold + `.github/workflows/ci.yml` must be on `main` before the first AFK run — confirm the
`ci` workflow is green on that push). Tell the user init is complete and summarize what was
installed.

### Manual-path fallback

If the user needs a stack the script doesn't encode (npm/yarn/poetry, or an exotic scaffold),
fall back to hand-running the equivalent steps using `coding-standards-guidance.md` gotchas as
the checklist — and say so explicitly in the final summary.
