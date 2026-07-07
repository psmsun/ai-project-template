# AI Project Template

A reusable starter template for **AI-assisted software development**, encoding the workflow and
best practices from Matt Pocock's *AI Coding for Real Engineers* (AI Hero cohort 004).

It is **stack-agnostic as shipped** but **language-aware**: it carries no application code.
Instead it ships a deterministic bootstrapper that, on first run, scaffolds a runnable,
best-practice project for your chosen stack (**TypeScript**, **Python**, or **both** —
`web/` + `api/` mixed-stack), installs the workflow skills, wires the CI gate + org defaults
(LICENSE, CODEOWNERS, dependabot, CodeQL), and generates a `coding-standards` skill matched
to what's actually installed.

---

## Prerequisites

```bash
npm install -g dev-browser
dev-browser install
```

## Start a new project

Either:

- **GitHub:** click **“Use this template”** (this repo is set up as a *template repository*), or
- **degit:** `npx degit psmsun/ai-project-template my-app && cd my-app`

Then open the project in Claude Code.

## Step 1 — run init (do this first)

In Claude Code, run the **`init-project`** skill (e.g. say *“init the project”* or
*“bootstrap this template”*). The agent interviews you, then the deterministic
**`scripts/init.mjs`** does the mechanical work in two passes:

1. **Interview** (agent) — language (`typescript` / `python` / `both`), project type, scaffold
   location, database, package manager (pnpm / uv), deploy target (docker / aws), skill
   location, sandcastle — recorded to `.init-answers.json`.
2. **Main pass** (`node scripts/init.mjs .init-answers.json`) — scaffold the toolchain with
   every validated gotcha baked in (TS: vitest, husky pre-commit, `~/*` alias, `allowBuilds`
   map, exact pnpm pin · Python: pydantic, ruff, mypy, pytest, pre-commit, `src/` layout ·
   both: `web/` + `api/` + root pre-commit), write the **CI gate** (`.github/workflows/ci.yml`,
   matrix for mixed) plus a non-blocking scheduled `audit.yml`, install the workflow skills
   (only when `skillLocation: project` — `global` uses your global copies and skips in-repo
   installs), optionally wire **sandcastle** (Docker; from `templates/<stack>/`), drop the
   **org overlay** (LICENSE per your `org` + `license` choice, CODEOWNERS, PR/issue templates,
   dependabot, CodeQL), and stamp `template.config.json` with the template version + commit.
3. **Author `coding-standards`** (agent) — a per-project skill matching what was actually
   installed (or a close remote match from skills.sh).
4. **Cleanup pass** (`node scripts/init.mjs .init-answers.json --cleanup`) — runs the real
   feedback loops (typecheck+test+build / ruff+mypy+pytest), then **self-removes** the
   template meta (`init-project/`, `templates/`, init scripts) so init can't run twice.

## The workflow

The template wires up this loop end-to-end:

| Stage             | Skill / tool                  | What it does                                               |
| ----------------- | ----------------------------- | --------------------------------------------------------- |
| 1. Spec           | `to-prd`                      | Turn a conversation/idea into a PRD.                      |
| 2. Slice          | `prd-to-issues`               | Break the PRD into vertical tracer-bullet GitHub issues (vendored; `to-issues` is a manual remote alternative). |
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
   `templateCommit` is a real revision on the template's `main` (stamped at release time — see
   the `template-commit:` marker in `CHANGELOG.md`). If it's `null` (a template built before the
   marker existed), diff by the `templateVersion` tag/date instead.
3. Port what applies (usually `.sandcastle/` artifacts, `ci.yml`, and skills), then update the
   stamp in `template.config.json` to the new version/commit.

## What ships in this template

```
.claude/
  settings.json                # minimal safe permissions (gh, npx skills, sandcastle)
  skills/
    init-project/              # bootstrapper skill (self-removes after init)
      SKILL.md
      coding-standards-guidance.md   # generator playbook: per-ecosystem deps + conventions
      skills-manifest.md             # which skills are remote vs vendored
    do-work/                   # vendored, stack-neutral
    prd-to-issues/             # vendored
    improve-codebase-architecture/
    write-a-skill/             # offline fallback (also available remotely)
    pnpm-not-found/            # vendored troubleshooting (pnpm/corepack)
    pnpm-ignored-builds/       # vendored troubleshooting (native build approval)
    better-sqlite3-rebuild/    # vendored troubleshooting (native module)
    uv-troubleshooting/        # vendored troubleshooting (uv/venv/mypy/pytest)
scripts/
  init.mjs                     # deterministic init (two-pass; self-removes at cleanup)
  validate-template.mjs        # template self-check (run by template-ci on every PR)
templates/
  ts/                          # TypeScript/pnpm: ci.yml + sandcastle loop/doctor/prompt
  py/                          # Python/uv twins (validator enforces the ts/py mirror)
.github/workflows/template-ci.yml  # CI for the template repo itself
CHANGELOG.md                   # template versions; init stamps version+commit into projects
template.config.example.json   # stack record; init writes template.config.json
CLAUDE.md                      # tiny; points at the coding-standards skill
```

The vendored troubleshooting skills ship in every generated project so AFK agents can
self-heal; `.sandcastle/` itself is scaffolded on demand only when sandcastle is enabled.
