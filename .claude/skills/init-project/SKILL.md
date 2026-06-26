---
name: init-project
description: "Bootstrap a new project from this template: interview the stack, scaffold a runnable best-practice toolchain, install workflow skills, generate the project's coding-standards skill, and optionally wire up sandcastle. Use ONCE when starting a new project from the ai-project-template (e.g. user says 'init the project', 'bootstrap this template', 'set up a new project')."
---

# Init Project

Run this **once**, in a fresh copy of the template, before writing any application code. It is interactive — confirm each external install with the user **(y/n)**. Do not batch-install silently.

Read [coding-standards-guidance.md](coding-standards-guidance.md) and [skills-manifest.md](skills-manifest.md) first — they are the source of truth for baselines and skill sources.

## Workflow

### 1. Interview the stack (language first)

Ask, one decision at a time:

1. **Language** — TypeScript or Python? (drives everything below)
2. **TypeScript only:** framework — Vite (SPA/library), React Router v7, or Next.js (App Router)?
3. **Database** — SQLite (default), Postgres, or none?
4. **Package manager** — pnpm (default for TS) / npm / yarn; uv (default for Python) / poetry.
5. **Deploy target** (optional) — note it for the README; no action required now.
6. **Sandcastle** — set up the AFK autonomous runner now? If yes, Docker sandbox or no-sandbox?

Record answers; you'll write them to `template.config.json` at the end.

### 2. Scaffold the toolchain (each step y/n)

Use the **recommended baseline for the chosen ecosystem** from `coding-standards-guidance.md`. Prefer official scaffolders; then layer the baseline deps. Confirm each install (y/n).

> **The repo is non-empty** (it already has `.claude/`, `CLAUDE.md`, `README.md`, `templates/`). Most scaffolders refuse to run in a non-empty dir. Scaffold into a temp subdir (e.g. `_scaffold/`), then move its files up, letting the **template's** `CLAUDE.md`, `README.md`, `.gitignore`, and `.claude/` win on conflict; set the package `name` to the repo name. Delete `_scaffold/` after merging.

- **TypeScript:** run the official scaffolder (`npm create vite@latest _scaffold -- --template react-ts`, `npx create-next-app@latest`, or `npx create-react-router@latest`), merge as above, then add baseline deps (zod; drizzle-orm + drizzle-kit + the chosen driver if a DB was selected; vitest; husky + lint-staged; **tailwind + shadcn** — install for any project with a UI, including a Vite React SPA; skip only for a headless library/CLI). See `coding-standards-guidance.md` → "TypeScript gotchas" for the **pnpm native-build approval**, the **`~/*` alias location**, and **husky v9** steps — getting these wrong silently breaks the build. Configure a pre-commit hook running typecheck + test.
- **Python:** init with the chosen manager (`uv init` / `poetry new`), add baseline deps (pydantic, ruff, pytest), set up `src/` layout, and a `pre-commit` config running the type checker (mypy/pyright) + pytest.

### 3. Resolve the `coding-standards` skill

This project needs its own `coding-standards` skill matching what was just installed.

1. Unless the user already decided to generate, `npx skills find coding-standards` (and stack terms). If a strong remote match exists, offer to `npx skills add <owner/repo>` (y/n). (Skip this network call if generation is already the chosen path.)
2. Otherwise, **generate** one: using the conventions section of `coding-standards-guidance.md` for the chosen ecosystem (and the `write-a-skill` skill), author `.claude/skills/coding-standards/SKILL.md` (+ reference files) describing the conventions for the **actual** installed stack. Keep it accurate to what's installed — no SQLite rules in a Postgres project, etc.

### 4. Install the remaining workflow skills (each y/n)

Per [skills-manifest.md](skills-manifest.md): install the **remote** skills that have no vendored
equivalent — by default `to-prd`, `handoff`, `grill-me`. Do **not** install `to-issues` by default
(the vendored `prd-to-issues` already fills that role; offer the swap only if the user prefers the
remote one, and if they take it, remove the vendored `prd-to-issues` to avoid two overlapping
skills). Confirm each (y/n), then:

```
npx skills add mattpocock/skills -s <skill> --copy -y
```

`--copy` keeps `.claude/skills/<name>` self-contained; `-y` skips the CLI's own prompt (you
already asked). This writes `skills-lock.json` (commit it). The CLI also creates `.agents/`
(git-ignored mirror). The **vendored** skills (`do-work`, `prd-to-issues`,
`improve-codebase-architecture`, `write-a-skill`, this one) already ship — leave them, and avoid
installing their remote analogs (`tdd`/`implement`, `to-issues` vs `prd-to-issues`,
`writing-great-skills`) unless the user wants to swap. Do NOT run `npx skills update` here; that's
a later maintenance step (see README).

### 5. Optionally set up sandcastle

If the user opted in (step 1.6):

1. `npx @ai-hero/sandcastle init` to scaffold `.sandcastle/`.
2. Set the sandbox in `main.ts` / `interactive.ts`: `docker()` for sandboxed, or `noSandbox()` (import from `@ai-hero/sandcastle/sandboxes/no-sandbox`) for direct host execution.
3. Replace the scaffolded `.sandcastle/prompt.md` with `templates/sandcastle-prompt.md` from the template root, adjusting the feedback-loop commands to the project's actual typecheck/test scripts.
4. Fill `.sandcastle/.env` from `.env.example` (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`, plus `GH_TOKEN`).

### 6. Wire up and finalize

- Update `CLAUDE.md`: keep it tiny — point at the generated `coding-standards` skill.
- Write `template.config.json` recording the chosen stack (copy `template.config.example.json`).
- Fill the README "How to run" section with the project's real dev/test/build commands.
- **Self-remove**: delete `.claude/skills/init-project/` and the `templates/` dir, then tell the user init is complete and summarize what was installed. (init must not run again.)

## Notes

- Stay interactive. If the user declines an install, note it and continue; don't silently skip steps that depend on it — call out the consequence.
- The whole point is: a runnable, best-practice project + the full workflow (`to-prd` → `prd-to-issues` → `.sandcastle` → `do-work` → `handoff`) with standards that match the installed tools.
