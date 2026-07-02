# YOUR ASSIGNED ISSUE

You are an autonomous coding agent. You have been assigned **exactly one** GitHub issue this
iteration. Do that issue and nothing else.

```json
<<ISSUE_JSON>>
```

The runner has already cut a fresh branch off `main` for you and will open the PR for you after
you finish — so **do NOT** open a pull request, **do NOT** `git push`, and **do NOT** close the
issue. Your job is: implement the issue, get the feedback loops green, and commit.

# EXPLORATION

Explore the repo. **Load the project's `coding-standards` skill before writing any code.** Read the
issue carefully; pull in the parent PRD if it references one; read the relevant source + tests first.

# IMPLEMENTATION

Implement the issue as a small, focused change. Follow the project's coding standards. Use RGR
(Red → Green → Refactor) where it fits: a failing test first, then the implementation.

# FEEDBACK LOOPS

Before committing, run the project's feedback loops and fix every failure — your work will be
blocked from merging by CI if these are red. This is a pnpm-managed TypeScript project:

- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run build`

If a run reports `ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds --all` once, then retry.

# COMMIT

Make a single git commit. The message must:

1. Reference the issue (e.g. `Closes #<number>` is added by the runner's PR, but name the issue).
2. State the key decisions made and the files changed.
3. Note any blocker or follow-up for a future iteration.

Do not leave commented-out code or TODOs in committed code.

# IF YOU CANNOT COMPLETE IT

If you are blocked (missing context, a failing test you cannot fix, an external dependency), do
**not** commit a half-finished change. Leave a comment on the issue with `gh issue comment` saying
what's blocking, and stop — the runner will leave the issue open for a human or a later loop.

# FINAL RULE

Work ONLY on the single assigned issue above. Do not touch other issues, do not open a PR, do not
close the issue. Commit your work and stop.
