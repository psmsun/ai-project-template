# AI Project Template

A reusable starter template for **AI-assisted software development**, encoding the workflow and
best practices from Matt Pocock's *AI Coding for Real Engineers* (AI Hero cohort 004).

It is **stack-agnostic as shipped** but **language-aware**: it carries no application code.
Instead it ships an interactive bootstrapper that, on first run, scaffolds a runnable,
best-practice project for your chosen stack (**TypeScript** or **Python**), installs the
workflow skills, and generates a `coding-standards` skill matched to what's actually installed.

---

## Prerequisites

```bash
npm install -g dev-browser
dev-browser install
```

## Start a new project

Either:

- **GitHub:** click **“Use this template”** (this repo is set up as a *template repository*), or
- **degit:** `npx degit <your-org>/ai-project-template my-app && cd my-app`

Then open the project in Claude Code.

## Step 1 — run init (do this first)

In Claude Code, run the **`init-project`** skill (e.g. say *“init the project”* or
*“bootstrap this template”*). It is interactive and asks you to confirm each install **(y/n)**.

It will:

1. **Interview the stack** — language first (TypeScript / Python), then framework, database,
   package manager, deploy target, and whether to set up sandcastle.
2. **Scaffold the toolchain** — run the official scaffolder, then add the recommended baseline
   (TS: zod, drizzle, vitest, tailwind+shadcn, husky+lint-staged, `~/*` alias · Python: pydantic,
   ruff, pytest, pre-commit, `src/` layout), with pre-commit hooks running typecheck + test.
3. **Generate `coding-standards`** — a per-project skill matching the installed stack
   (preferring a remote skill from skills.sh if a close match exists).
4. **Install the workflow skills** — remote-first via `npx skills add`, one y/n at a time.
5. **Optionally set up sandcastle** — `npx @ai-hero/sandcastle init`, Docker **or** no-sandbox.
6. **Finalize** — wire `CLAUDE.md`, write `template.config.json`, fill the “How to run” section
   below, then **self-remove** (deletes `init-project/` and `templates/` so it can't run twice).

## The workflow

The template wires up this loop end-to-end:

| Stage             | Skill / tool                  | What it does                                               |
| ----------------- | ----------------------------- | --------------------------------------------------------- |
| 1. Spec           | `to-prd`                      | Turn a conversation/idea into a PRD.                      |
| 2. Slice          | `prd-to-issues` / `to-issues` | Break the PRD into vertical tracer-bullet GitHub issues.  |
| 3. Autonomy (opt) | `.sandcastle/`                | Run an agent AFK over the AFK issues (Docker or local).   |
| 4. Build          | `do-work`                     | Plan → implement (TDD for core) → typecheck+test → commit.|
| 5. Handoff        | `handoff`                     | Compact context for the next session/agent.              |

Planning & verification (from `obra/superpowers`): `writing-plans` + `executing-plans` (plan and
execute logical sprints with checkpoints) and `verification-before-completion` (run the checks and
show output before claiming done).

Supporting skills: `improve-codebase-architecture` (deepen shallow modules), `write-a-skill`
(author new skills), `coding-standards` (generated, enforced throughout), plus `grill-me` for
stress-testing plans.

## How to run

> _Filled in by `init-project` for your chosen stack._ Typical commands:
>
> - **TypeScript:** `pnpm install` · `pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm build`
> - **Python:** `uv sync` · `uv run <app>` · `pytest` · `mypy` (or `pyright`)

## Maintenance

- `npx skills list` — see installed skills.
- `npx skills update` — refresh installed skills to their latest versions.
- `npx skills experimental_install` — restore skills from the committed `skills-lock.json`.

### Upgrading an existing project

Init stamps `templateVersion` + `templateCommit` into your project's `template.config.json`.
To pull template improvements into a project created earlier:

1. Check `CHANGELOG.md` in this repo for what changed since your stamped version.
2. Diff the relevant files against your stamped revision:
   `git clone https://github.com/psmsun/ai-project-template && cd ai-project-template && git diff <templateCommit>..main -- templates/ .claude/skills/`
3. Port what applies (usually `.sandcastle/` artifacts, `ci.yml`, and skills), then update the
   stamp in `template.config.json` to the new version/commit.

## What ships in this template

```
.claude/
  settings.json                # minimal safe permissions (gh, npx skills, sandcastle)
  skills/
    init-project/              # interactive bootstrapper (self-removes after init)
      SKILL.md
      coding-standards-guidance.md   # generator playbook: per-ecosystem deps + conventions
      skills-manifest.md             # which skills are remote vs vendored
    do-work/                   # vendored, stack-neutral
    prd-to-issues/             # vendored
    improve-codebase-architecture/
    write-a-skill/             # offline fallback (also available remotely)
templates/
  ts/                          # TypeScript/pnpm stack templates (ci.yml, sandcastle loop + doctor + prompt)
template.config.example.json   # stack record; init writes template.config.json
CLAUDE.md                      # tiny; points at the coding-standards skill
```

Stack-specific skills (`pnpm-not-found`, `better-sqlite3-rebuild`) and `.sandcastle/` itself are
**not** vendored — `init-project` installs/scaffolds them on demand only if your stack needs them.
