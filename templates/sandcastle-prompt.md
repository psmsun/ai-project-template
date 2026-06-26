# ISSUES

Here are a set of GitHub issues:

!`gh issue list --state open --json number,title,body,comments`

You will work on the AFK issues only, not the HITL ones.

If all AFK tasks are complete, output <promise>NO MORE TASKS</promise>.

# TASK SELECTION

Pick the next task. Prioritize tasks in this order:

1. Critical bugfixes
2. Development infrastructure

Getting development infrastructure like tests, types, and dev scripts ready is an important precursor to building features.

3. Tracer bullets for new features

Tracer bullets are small slices of functionality that go through all layers of the system, allowing you to test and validate your approach early. Build a tiny, end-to-end slice of the feature first, then expand it out.

4. Polish and quick wins
5. Refactors

# EXPLORATION

Explore the repo. Load the project's `coding-standards` skill before writing any code.

# IMPLEMENTATION

Complete the task. Follow the project's coding standards.

# FEEDBACK LOOPS

Before committing, run the project's feedback loops and fix any failures. Use the scripts the
project actually defines (check `package.json` for TS/JS, or `pyproject.toml`/`Makefile` for
Python). Typical examples — adjust to this project during init:

- TypeScript: `pnpm run test` and `pnpm run typecheck`
- Python: `pytest` and `mypy` (or `pyright`)

# COMMIT

Make a git commit. The commit message must:

1. Include key decisions made
2. Include files changed
3. Note blockers or follow-ups for the next iteration

# THE ISSUE

If the task is complete, close the original GitHub issue.

If the task is not complete, leave a comment on the GitHub issue with what was done.

# FINAL RULES

ONLY WORK ON A SINGLE TASK. If you receive a multi-phase plan, only work on a single phase of that plan.
