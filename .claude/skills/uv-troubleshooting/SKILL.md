---
name: uv-troubleshooting
description: "Fix common uv (Python package manager) failures: uv not found, uv sync/lock errors, wrong Python version in .venv, imports failing under pytest or mypy, pre-commit mypy missing dependencies. Use when uv commands fail, the venv seems broken, or a uv-managed project can't resolve imports."
---

# uv Troubleshooting

Work through the matching symptom. All commands are idempotent.

## `uv: command not found`

- macOS/Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh` (installs to `~/.local/bin` — ensure it's on PATH), or `brew install uv`.
- In CI use `astral-sh/setup-uv@v5`. In Docker: `COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/`.

## `uv sync` fails or the lockfile is stale

- `No solution found` → a dependency conflict; read the trace bottom-up, relax the offending pin in `pyproject.toml`, then `uv lock && uv sync`.
- `uv.lock` out of date warning → `uv lock` (commit the result). CI and sandcastle install from the lockfile.
- A half-broken venv (moved repo, switched Python) → delete and rebuild: `rm -rf .venv && uv sync`. Venvs are NOT relocatable across paths — never copy `.venv` between worktrees.

## Wrong Python version

- `uv python install 3.12` then `uv sync`. The pinned version lives in `.python-version` / `pyproject.toml` `requires-python`; make them agree.

## Imports fail under pytest (src layout)

- The package is importable via the editable install: run tests as `uv run pytest` (never bare `pytest`).
- Safety net in `pyproject.toml`: `[tool.pytest.ini_options]` → `pythonpath = ["src"]`.

## mypy passes locally but fails in pre-commit

- The `mirrors-mypy` hook runs in an isolated venv and can't see project deps. Add them under the hook:
  `additional_dependencies: [pydantic]` (plus any other typed runtime deps).

## Native/build failures (`error: command 'gcc' failed`, missing wheels)

- Prefer packages with prebuilt wheels; check `uv pip debug` for the platform tag.
- If a source build is unavoidable, install build tooling (Xcode CLT / `build-essential` / the lib's `-dev` package named in the error), then `uv sync` again.
- Unlike pnpm, uv has **no build-approval step** — a failure is a real toolchain gap, not a permission gate.
