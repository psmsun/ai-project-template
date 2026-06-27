---
name: init-project
description: "Bootstrap a new project from this template: interview the stack, scaffold a runnable best-practice toolchain, install workflow skills, generate the project's coding-standards skill, and optionally wire up sandcastle. Use ONCE when starting a new project from the ai-project-template (e.g. user says 'init the project', 'bootstrap this template', 'set up a new project')."
---

# Init Project

Run this **once**, in a fresh copy of the template, before writing any application code. It is interactive — confirm each external install with the user **(y/n)**. Do not batch-install silently.

Read [coding-standards-guidance.md](coding-standards-guidance.md) and [skills-manifest.md](skills-manifest.md) first — they are the source of truth for baselines and skill sources.

## Workflow

### 0. Decide skill location, then get the interviewing skill

**Skill location (ask once, applies to all installs below).** Skills can live **in the project**
(`.claude/skills/`, committed) or **globally** (`~/.claude/skills/`). Default to **in the project
with `--copy`** — a self-contained repo travels to other machines and collaborators, and
**sandcastle Docker runs only see repo-committed skills, not your global ones**. Global-only is
lighter for solo local work but makes the repo non-portable. Recommend in-project; confirm with
the user.

> Note: a skill already present **globally** still works in this project, so it won't *appear* in
> `.claude/skills/`. If the user chose in-project, install it with `--copy` anyway (so it's
> committed) even when a global copy exists — don't skip it just because it's globally available.

Then make `grill-me` available first (the stack decisions benefit from being pressure-tested):
install it now per the chosen location — `npx skills add mattpocock/skills -s grill-me --copy -y`
(in-project), or rely on the global copy if the user chose global-only.

### 1. Interview the stack (language first)

Conduct this as a light grilling — for each non-default choice, ask *why* and surface the
trade-off (e.g. "Postgres over SQLite — do you need concurrent writes / a hosted DB, or is this
local-first?"). Ask one decision at a time:

1. **Language** — TypeScript or Python? (drives everything below)
2. **Project type:**
   - TypeScript: **headless library** (a pure package, no UI — e.g. `@scope/core`), **Vite React SPA**, **React Router v7**, or **Next.js (App Router)**.
   - Python: **library/package**, **CLI**, or **service/API** (e.g. FastAPI).
   A *headless library* gets NO framework, NO tailwind/shadcn — see the library scaffold in step 2.
3. **Scaffold location** — repo **root**, or a **subfolder** (e.g. `core/`, `packages/<name>`)? Use a subfolder for a monorepo / multi-package repo where `.claude/` + `docs/` stay shared at the root. Default: root.
4. **Database** — SQLite (default), Postgres, or none? (usually none for a headless library)
5. **Package manager** — pnpm (default for TS) / npm / yarn; uv (default for Python) / poetry.
6. **Deploy target** (optional) — note it for the README; no action required now.
7. **Sandcastle** — set up the AFK autonomous runner now? If yes, Docker sandbox or no-sandbox?

Record answers; you'll write them to `template.config.json` at the end. (Use `grill-me` again
later when shaping the actual project plan/PRD — that's where it earns the most.)

### 2. Scaffold the toolchain (each step y/n)

Use the **recommended baseline for the chosen ecosystem** from `coding-standards-guidance.md`. Prefer official scaffolders; then layer the baseline deps. Confirm each install (y/n).

> **Where to scaffold (from step 1.3):**
> - **Subfolder** (e.g. `core/`): create it and scaffold *inside* it — the package's `package.json`/`src/`/config live there; `.claude/` + `docs/` stay at the repo root. The subfolder may be empty, so a scaffolder can run in it directly (no `_scaffold/` dance). Set the package `name` to the subfolder/package name (e.g. `@scope/core`).
> - **Root**: the repo root is **non-empty** (`.claude/`, `CLAUDE.md`, `README.md`, `templates/`), and most scaffolders refuse a non-empty dir. Scaffold into a temp `_scaffold/`, then move files up, letting the **template's** `CLAUDE.md`, `README.md`, `.gitignore`, `.claude/` win on conflict; delete `_scaffold/` after.

- **TypeScript — headless library** (no UI): do **not** run a React scaffolder. Set up a minimal package: `pnpm init`; `pnpm add -D typescript tsup vitest @types/node`; a `tsconfig.json` (strict, `~/*` alias); `tsup.config.ts` for **dual ESM+CJS builds** (`format: ["esm","cjs"]`, `dts: true`) so it imports cleanly in both browser and node clients; vitest config. Add only the libraries the package needs (e.g. conversion deps) — **no** zod/drizzle/tailwind/shadcn unless the design calls for them. husky + lint-staged with a pre-commit running typecheck + test.
- **TypeScript — app** (Vite SPA / React Router / Next): run the official scaffolder (`npm create vite@latest _scaffold -- --template react-ts`, `npx create-next-app@latest`, or `npx create-react-router@latest`), merge per the root/subfolder note, then add baseline deps (zod; drizzle-orm + drizzle-kit + driver if a DB was chosen; vitest; husky + lint-staged; **tailwind + shadcn** for the UI). See `coding-standards-guidance.md` → "TypeScript gotchas" for the **pnpm native-build approval**, **`~/*` alias location**, and **husky v9** steps — getting these wrong silently breaks the build. Pre-commit runs typecheck + test.
- **Python:** init **with a package/src layout** — `uv init --package --name <repo>` (bare `uv init` makes a flat `main.py`, not `src/<pkg>/`). Add deps: `uv add pydantic`; `uv add --dev ruff pytest mypy pre-commit`. Write a `.pre-commit-config.yaml` running **ruff + ruff-format + mypy + pytest**. See `coding-standards-guidance.md` → "Python gotchas" for the PEP 695 typing requirement, the mypy-hook `additional_dependencies`, and pytest src-layout config — getting these wrong fails lint/type-check on a fresh repo.

### 3. Resolve the `coding-standards` skill

This project needs its own `coding-standards` skill matching what was just installed.

1. Unless the user already decided to generate, `npx skills find coding-standards` (and stack terms). If a strong remote match exists, offer to `npx skills add <owner/repo>` (y/n). (Skip this network call if generation is already the chosen path.)
2. Otherwise, **generate** one: using the conventions section of `coding-standards-guidance.md` for the chosen ecosystem (and the `write-a-skill` skill), author `.claude/skills/coding-standards/SKILL.md` (+ reference files) describing the conventions for the **actual** installed stack. Keep it accurate to what's installed — no SQLite rules in a Postgres project, etc.

### 4. Install the remaining workflow skills (each y/n)

Per [skills-manifest.md](skills-manifest.md): install the **remote** skills that have no vendored
equivalent — by default `to-prd`, `handoff` (`grill-me` was already installed in step 0). Do
**not** install `to-issues` by default
(the vendored `prd-to-issues` already fills that role; offer the swap only if the user prefers the
remote one, and if they take it, remove the vendored `prd-to-issues` to avoid two overlapping
skills). Confirm each (y/n), then:

```
npx skills add mattpocock/skills -s <skill> --copy -y
```

Also install the **planning & verification** skills from `obra/superpowers` (these complete what
the cohort teaches — plan logical sprints, verify before claiming done), each y/n:

```
npx skills add obra/superpowers -s writing-plans -s executing-plans -s verification-before-completion --copy -y
```

Use `--copy` if the user chose **in-project** (step 0) — even for skills that already exist
globally — so they're committed; omit the install entirely for skills the user wants **global-only**.
`-y` skips the CLI's own prompt (you already asked). In-project installs write `skills-lock.json`
(commit it). The CLI also creates `.agents/`
(git-ignored mirror). The **vendored** skills (`do-work`, `prd-to-issues`,
`improve-codebase-architecture`, `write-a-skill`, this one) already ship — leave them, and avoid
installing their remote analogs (`tdd`/`implement`, `to-issues` vs `prd-to-issues`,
`writing-great-skills`) unless the user wants to swap. Do NOT run `npx skills update` here; that's
a later maintenance step (see README).

### 5. Optionally set up sandcastle

If the user opted in (step 1.7):

1. `npx @ai-hero/sandcastle init` to scaffold `.sandcastle/`.
2. Set the sandbox in `main.ts` / `interactive.ts`: `docker()` for sandboxed, or `noSandbox()` (import from `@ai-hero/sandcastle/sandboxes/no-sandbox`) for direct host execution.
3. Replace the scaffolded `.sandcastle/prompt.md` with `templates/sandcastle-prompt.md` from the template root, adjusting the feedback-loop commands to the project's actual typecheck/test scripts.
4. Fill `.sandcastle/.env` from `.env.example` (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`, plus `GH_TOKEN`).

### 6. Wire up and finalize

- Update `CLAUDE.md`: keep it tiny — point at the generated `coding-standards` skill.
- Write `template.config.json` recording the chosen stack (copy `template.config.example.json`).
- Fill the README "How to run" section with the project's real dev/test/build commands.
- **Self-remove**: delete `.claude/skills/init-project/`, the `templates/` dir, and `template.config.example.json` (the real `template.config.json` stays). Then tell the user init is complete and summarize what was installed. (init must not run again.)

## Notes

- Stay interactive. If the user declines an install, note it and continue; don't silently skip steps that depend on it — call out the consequence.
- The whole point is: a runnable, best-practice project + the full workflow (`to-prd` → `prd-to-issues` → `.sandcastle` → `do-work` → `handoff`) with standards that match the installed tools.
