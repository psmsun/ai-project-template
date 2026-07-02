# Changelog

Template versions. `init` stamps the current version + commit into the generated project's
`template.config.json`, so you can always diff a project against the template revision it
came from (see README → "Upgrading an existing project").

## [0.2.0] — 2026-07-02

Template-upgrade epic (PRD #4): company-ready hardening.

- **Self-CI**: `scripts/validate-template.mjs` + `template-ci` workflow — the template tests itself on every PR.
- **Deterministic init (T1)**: `scripts/init.mjs` two-pass init (scaffold/skills/sandcastle/finalize + `--cleanup` self-check/self-remove); LLM scope reduced to interview + coding-standards authoring.
- **Python parity**: `templates/py/` (uv ci.yml, sandcastle prompt/doctor/main twins), `uv-troubleshooting` skill; validator enforces ts/py mirror.
- **Mixed-stack**: `language: "both"` → `web/` (TS) + `api/` (Python), root pre-commit, `ci-web`+`ci-api` matrix.
- **Versioning**: this CHANGELOG; version+commit stamped into `template.config.json` at init.
- **Org overlay**: proprietary LICENSE, CODEOWNERS (@psmsun), PR/issue templates, dependabot, audit CI steps, CodeQL template.
- Hygiene: sandcastle model default `claude-opus-4-8`; `SC_PKG_DIR` default unified to `.`; TS templates under `templates/ts/`.

## [0.1.0] — 2026-06 (pre-versioning baseline)

The dogfooded template as of backlog A1–A3: clean-init zero-touch bootstrap, PR-per-issue
sandcastle loop, CI gate, vendored workflow skills.
