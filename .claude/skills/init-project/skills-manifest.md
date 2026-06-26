# Skills Manifest

The workflow skills this template relies on, and where each comes from. `init-project` uses
this to install skills **remote-first** (confirm each with the user, y/n), and leaves the
vendored ones in place.

Install remote skills with **`--copy`** so `.claude/skills/<name>` contains real files (a
self-contained repo), and **`-y`** to skip the CLI's own prompt (you've already asked the user):

```
npx skills add mattpocock/skills -s <skill> --copy -y
```

This also writes/updates **`skills-lock.json`** (source + content hash) — commit it; it makes
installs reproducible via `npx skills experimental_install`. The CLI also creates an `.agents/`
mirror, which is git-ignored.

> Verified against `mattpocock/skills` (35 skills). Re-check with
> `npx skills add mattpocock/skills -l` if availability changes. If a remote skill is gone,
> fall back to generating one with the `write-a-skill` skill.

## Remote — confirmed available in `mattpocock/skills`

| Skill         | Purpose in the workflow                                  |
| ------------- | ------------------------------------------------------- |
| `to-prd`      | Turn conversation/context into a PRD.                   |
| `to-issues`   | PRD → independently-grabbable tracer-bullet issues.    |
| `handoff`     | Compact context into a handoff doc for another agent.  |
| `grill-me`    | Stress-test a plan/design by relentless questioning.   |

### Remote — planning & verification (`obra/superpowers`)

These close the loop on what the cohort teaches about planning logical sprints and verifying
before claiming done. Install with `npx skills add obra/superpowers -s <skill> --copy -y`.

| Skill                          | Purpose in the workflow                                        |
| ------------------------------ | ------------------------------------------------------------- |
| `writing-plans`                | Turn a spec/sprint into a written, step-wise implementation plan. |
| `executing-plans`              | Execute a written plan with review checkpoints between steps.  |
| `verification-before-completion` | Run the checks and show output BEFORE claiming done/fixed/passing. |

Also useful from the same repo (offer if relevant): `test-driven-development`,
`requesting-code-review`, `systematic-debugging`, `subagent-driven-development`,
`dispatching-parallel-agents`, `brainstorming`.

### Remote — optional extras (`mattpocock/skills`)

Offer if the user wants them (they overlap with / extend the vendored skills, so ask before
installing to avoid duplicates):

| Skill                          | Note                                                        |
| ------------------------------ | ---------------------------------------------------------- |
| `tdd` / `implement`            | Remote analogs of the vendored `do-work` (red/green/build).|
| `writing-great-skills`         | Remote analog of the vendored `write-a-skill`.             |
| `improve-codebase-architecture`| Newer remote version (HTML report + grilling) vs vendored. |
| `setup-pre-commit`             | Helps wire pre-commit hooks during toolchain scaffold.     |
| `diagnosing-bugs`, `domain-modeling`, `codebase-design`, `review` | Useful extras from the same repo. |

## NOT on `mattpocock/skills` — generate if the stack needs them

| Skill                    | When needed                | Action                                  |
| ------------------------ | -------------------------- | --------------------------------------- |
| `coding-standards`       | always                     | generate (see coding-standards-guidance)|
| `pnpm-not-found`         | pkg manager is pnpm        | generate a tiny one, or skip            |
| `better-sqlite3-rebuild` | TS + better-sqlite3        | generate a tiny one (fix = `pnpm approve-builds --all`, NOT `pnpm rebuild`; see guidance "TypeScript gotchas"), or skip |

## Vendored (ship in `.claude/skills/`, no install needed)

| Skill                          | Why vendored                                            |
| ------------------------------ | ------------------------------------------------------- |
| `init-project`                 | This bootstrapper (self-removes after init).            |
| `do-work`                      | Cohort version; stack-neutralized. Remote analog: `tdd`/`implement`. |
| `prd-to-issues`                | Cohort version. Remote analog: `to-issues` (prefer one).|
| `improve-codebase-architecture`| Cohort (issue-RFC) version. Remote analog exists too.   |
| `write-a-skill`                | Offline fallback. Remote analog: `writing-great-skills`.|

> Note on overlap: the cohort vendored skills and their remote analogs do similar things. Pick
> one per role during init to avoid two skills competing to trigger. Default: keep the vendored
> cohort versions (they capture this template's intended workflow) and install only the remote
> skills with no vendored equivalent (`to-prd`, `to-issues` or `prd-to-issues`, `handoff`,
> `grill-me`).

## After init (maintenance, NOT during init)

- `npx skills list` — see installed skills.
- `npx skills update` — refresh installed skills to latest.
- `npx skills experimental_install` — restore from `skills-lock.json`.
