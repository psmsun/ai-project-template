# Coding-Standards Guidance (generator playbook)

This is the **durable, reusable asset** of the template. It is NOT the project's coding
standards — it is the source from which `init-project` (a) installs a dependency baseline and
(b) generates the project's concrete `coding-standards` skill, so the standards always match
what is actually installed.

When generating the per-project `coding-standards` skill, use the section for the chosen
ecosystem. Drop rules that don't apply (e.g. no SQLite rules in a Postgres project). Keep the
generated skill concise (SKILL.md < 100 lines; split into reference files per layer if needed).

---

## How to resolve the standards skill (remote-vs-build)

1. **Prefer remote.** `npx skills find coding-standards` plus stack terms. If a well-maintained
   skill matches the stack closely, `npx skills add` it (with the user's y/n).
2. **Otherwise build.** Generate `.claude/skills/coding-standards/` from the conventions below,
   tailored to the installed framework/DB. Use the `write-a-skill` skill for structure.

Bias toward a generated, stack-accurate skill over a loosely-matching remote one — wrong
standards are worse than none.

---

## TypeScript

### Recommended dependency baseline

- **Scaffolder:**
  - *Headless library* (no UI, e.g. `@scope/core`): no React scaffolder — `pnpm init` +
    `pnpm add -D typescript tsup vitest @types/node`, `tsup` for dual ESM+CJS builds
    (`format: ["esm","cjs"]`, `dts: true`) so it imports in both browser and node. Add only the
    libraries the package actually needs; no zod/drizzle/tailwind/shadcn by default.
  - *App*: `npm create vite@latest` (SPA) · `npx create-react-router@latest` ·
    `npx create-next-app@latest` (App Router).
- **Validation:** `zod`.
- **Database (if any):** `drizzle-orm` + `drizzle-kit` + driver — `better-sqlite3` (SQLite,
  default) or `pg`/`postgres` (Postgres).
- **Testing:** `vitest` (globals mode).
- **UI (framework projects):** `tailwindcss` + `shadcn` (`npx shadcn@latest init`).
- **Hooks:** `husky` + `lint-staged`; pre-commit runs typecheck + test.
- **Config:** `~/*` path alias → app source root in `tsconfig.json` (and bundler resolver).

### Conventions (universal core)

- **No `any`.** Infer from the schema/ORM or use `typeof`.
- **Object params** when a function takes multiple args of the same type (avoid positional
  `(string, string)`).
- **Imports:** always use the `~/*` alias for app imports — never deep relative `../../`.
- **Result pattern:** services return a discriminated result, not throws for expected failures:
  `{ ok: true, data } | { ok: false, error: string }`.
- **Service layer owns business logic.** Routes/pages/handlers parse input, call a service,
  render the result — no business logic in the framework layer.
- **Every service has a matching `.test.ts`.**
- **Testing:** vitest globals; when a service imports the db, mock the db module **before**
  importing the service under test. Use a shared test-db factory + seed helper in `beforeEach`.

### Conventions (database — Drizzle, if used)

- IDs: `integer().primaryKey({ autoIncrement: true })` (SQLite) / serial/identity (Postgres).
- Timestamps: ISO strings via `$defaultFn(() => new Date().toISOString())` (SQLite text) or
  native timestamp columns (Postgres).
- Booleans: `integer({ mode: "boolean" })` on SQLite.
- Soft deletes: nullable `deleted_at`.
- Money: store integer cents; format for display via a single helper.
- One db instance/module; don't open extra connections.

### Conventions (framework layer — adapt to the chosen framework)

- File-based routing where the framework provides it; validate all input with zod helpers
  (`parseFormData` / `parseParams` / `parseJsonBody` style returning `{ success, data, errors }`).
- Multiple form intents: zod discriminated union on an `intent` field.
- Auth: a single session helper returning the current user id (or null → redirect to login).

### Conventions (frontend/UI)

- Merge Tailwind classes via a `cn()` helper (clsx + tailwind-merge).
- shadcn components in `components/ui/`; custom components one level up in `components/`.

### TypeScript gotchas (verified during init testing — getting these wrong silently breaks the build)

- **pnpm blocks native build scripts by default (pnpm 10/11).** `pnpm add better-sqlite3`
  finishes with `ERR_PNPM_IGNORED_BUILDS` and the native module is never compiled — and
  `pnpm rebuild` is gated too, so it does **not** fix it. The correct fix is to approve builds:
  `pnpm approve-builds --all`, or add an allow-list. On pnpm 11 the allow-list lives in
  **`pnpm-workspace.yaml`** (`onlyBuiltDependencies: [better-sqlite3]`) — the `pnpm` field in
  `package.json` is **no longer read**. Verify with `node -e "new (require('better-sqlite3'))(':memory:')"`.
- **`~/*` path alias goes in the app tsconfig, not the root.** The Vite `react-ts` template makes
  `tsconfig.json` a project-references stub; put `paths` in **`tsconfig.app.json`** (and the bundler
  resolver, e.g. `vite-tsconfig-paths` or `resolve.alias`). Do **not** set `baseUrl` — TypeScript 6
  deprecates it (`TS5101`); use bare `paths` like `"~/*": ["./src/*"]`.
- **husky v9.** Use `npx husky init` (adds a `prepare: "husky"` script); there is no `husky install`.
  It writes a default `.husky/pre-commit` you then overwrite with your typecheck + test commands.
- **shadcn applies to a Vite React SPA too** — it's a UI project. Run `npx shadcn@latest init`.
  Skip tailwind/shadcn only for a headless library or CLI.
- **`pnpm-workspace.yaml` must have a `packages:` field.** A workspace file with only
  `onlyBuiltDependencies` (and no `packages:`) makes pnpm error "packages field missing or empty".
  The build allow-list key is `onlyBuiltDependencies:` (a list) — `allowBuilds:` is NOT a real pnpm
  key. Minimal valid file: `packages: [.]` + `onlyBuiltDependencies: [esbuild]`.
- **pin `packageManager` to the installed pnpm.** `pnpm init` may write a `devEngines` range
  (e.g. `pnpm@^11.5.3`) that corepack rejects; set an exact `"packageManager": "pnpm@<version>"`
  matching the version actually on the machine, and never pin a version the environment can't run.

---

## Python

### Recommended dependency baseline

- **Manager/scaffolder:** `uv init` (default) or `poetry new`.
- **Validation/models:** `pydantic` (v2).
- **Lint + format:** `ruff` (with formatter).
- **Type checking:** `mypy` or `pyright`.
- **Testing:** `pytest` (+ `pytest-asyncio` if async).
- **Hooks:** `pre-commit` running ruff + type checker + pytest.
- **Layout:** `src/` package layout.

### Conventions (core)

- **Type everything at boundaries.** Public functions and module interfaces are fully typed;
  no untyped `dict` soup crossing module lines.
- **Pydantic models** for external input / config / serialized data — validate at the edge.
- **Service layer owns business logic.** Entry points (CLI/handlers/routes) are thin.
- **Result discipline:** raise typed exceptions for exceptional cases; return explicit values
  (or a small `Result`/`Ok`/`Err` type) for expected failures — be consistent, document which.
- **Every service/module has matching `tests/` (`test_*.py`).** Test at the public boundary.
- **ruff** governs style; don't hand-format. Keep functions small and named for intent.

### Python gotchas (verified during init testing — these fail lint/type-check on a fresh repo)

- **Use a package/src layout from the start:** `uv init --package --name <repo>`. Bare `uv init`
  scaffolds a flat `main.py`, not `src/<pkg>/`, and you'd have to tear it down.
- **PEP 695 generics are required once ruff `UP` rules are on (Python 3.12+, which `uv` pins).**
  The old `Generic`/`TypeVar`/`Union[...]` style fails `ruff check` (`UP046`, `UP007`). Write the
  Result type as: `class Ok[T]: ...`, `class Err: ...`, `type Result[T] = Ok[T] | Err`.
- **Full dev dep set:** `uv add pydantic` (runtime); `uv add --dev ruff pytest mypy pre-commit`
  (the type checker and pre-commit are easy to forget but the hook needs them).
- **pre-commit runs ruff + ruff-format + mypy + pytest** (keep SKILL.md and this file in sync).
- **mypy in pre-commit needs `additional_dependencies: [pydantic]`** under the `mirrors-mypy`
  hook — it runs in an isolated venv and can't resolve pydantic under `--strict` otherwise
  (even though `uv run mypy src` passes locally).
- **pytest + src layout:** rely on the editable install (`uv run pytest`), or add
  `[tool.pytest.ini_options]\npythonpath = ["src"]` to `pyproject.toml` as a safety net.
- Unlike pnpm, **uv has no native-build approval step** — it's clean.

---

## Notes for the generator

- The generated skill's `description` MUST include "Use when..." triggers (writing/reviewing
  code in this repo) so it loads on demand. `CLAUDE.md` should be a one-line pointer to it —
  keep detail in the skill, not in always-on context.
- Tailor every rule to what was actually installed. If the user declined a dependency, don't
  write standards that assume it.
