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
- **Hooks:** `husky` v9; pre-commit runs typecheck + test.
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

- **pnpm blocks native build scripts by default, and `pnpm install` EXITS NON-ZERO until they're
  approved (pnpm 11.5.x — verified).** `pnpm add esbuild`/`better-sqlite3` finishes with
  `ERR_PNPM_IGNORED_BUILDS` **and exit code 1**, and the native module's postinstall never runs.
  `pnpm rebuild` is gated too, so it does **not** fix it. **The mechanism pnpm 11.5.x actually
  honors is the `allowBuilds` MAP in `pnpm-workspace.yaml`** — `pnpm approve-builds --all` writes it
  (`allowBuilds:\n  esbuild: true`) and runs the postinstall. **`onlyBuiltDependencies` (a list) is
  NOT honored in 11.5.x** — an install with it present still exits 1 and skips the build. So:
  - Commit a `pnpm-workspace.yaml` with `packages: [.]` + `allowBuilds: { esbuild: true }` (add
    `better-sqlite3: true` etc. if used) so installs are clean (exit 0) with no runtime churn.
  - **Never make a bare `pnpm install` the exit-gating step of a hook/CI when native builds exist** —
    it returns 1. Either commit the `allowBuilds` map, or chain `... || true; pnpm approve-builds --all`.
  - The `pnpm` field in `package.json` is **not** read for this. Verify a native dep with e.g.
    `node -e "new (require('better-sqlite3'))(':memory:')"`.
  - This inverts older advice (`onlyBuiltDependencies`); it was correct for pnpm 10/early-11, but
    11.5.x switched to interactive `approve-builds` + the `allowBuilds` map.
- **tsup's DTS build fails on TypeScript 6.x with `TS5101: 'baseUrl' is deprecated`.** A headless
  library scaffold (`pnpm add -D typescript tsup`) now pulls **typescript@6**, which turns the
  `baseUrl` deprecation into a hard error. tsup's DTS step (rollup-plugin-dts) injects `baseUrl`
  internally, so the build fails **even if your tsconfig has no baseUrl** (`tsc --noEmit` passes;
  only the dual-build DTS step breaks). Fix: add **`"ignoreDeprecations": "6.0"`** to the library
  `tsconfig.json` (forward-compatible; the error's own suggestion). Do not chase it by removing
  `paths` — that isn't the cause.
- **`~/*` path alias goes in the app tsconfig, not the root.** The Vite `react-ts` template makes
  `tsconfig.json` a project-references stub; put `paths` in **`tsconfig.app.json`** (and the bundler
  resolver, e.g. `vite-tsconfig-paths` or `resolve.alias`). Do **not** set `baseUrl` — TypeScript 6
  deprecates it (`TS5101`); use bare `paths` like `"~/*": ["./src/*"]`.
- **husky v9.** Use `npx husky init` (adds a `prepare: "husky"` script); there is no `husky install`.
  It writes a default `.husky/pre-commit` you then overwrite with your typecheck + test commands.
- **shadcn applies to a Vite React SPA too** — it's a UI project. Run `npx shadcn@latest init`.
  Skip tailwind/shadcn only for a headless library or CLI.
- **`pnpm-workspace.yaml` must have a `packages:` field.** A workspace file without `packages:`
  makes pnpm error "packages field missing or empty". The native-build approval lives in the same
  file as the **`allowBuilds` map** (see the gotcha above — pnpm 11.5.x honors `allowBuilds`, not
  `onlyBuiltDependencies`). Minimal correct file: `packages: [.]` + `allowBuilds: { esbuild: true }`.
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

## Headless library projects (extra conventions)

When the project type is a library (e.g. `@scope/core`), the generated standards should add:

- **Purity rules.** Ban environment globals: no `window`/`document`/`chrome.*`/`fs`/`process` I/O
  /`fetch`/`__dirname`. The public entry takes serializable input (e.g. `Uint8Array` + string),
  never `File`/`Blob` or functions in options. The core never writes files — it returns a
  descriptor and the client decides where bytes go. Include an anti-pattern: *don't* `import fs`.
- **A single contract as source of truth.** Identify the public type (e.g. `Result<T,E>`,
  `ApiResponse`, a domain `XxxResult`), document it as THE source of truth, and state that changing
  it is **semver-major**. Pin its file path.
- **Test categories** (not just "has tests"): golden-file (input → normalized snapshot),
  contract (valid result shape), determinism (byte-identical across runs), purity (runs with
  globals unavailable), harness. Dual ESM+CJS build with `.d.ts`/`.d.cts` (`verbatimModuleSyntax`
  requires correct `import type`).

## Notes for the generator

- The generated skill's `description` MUST include "Use when..." triggers (writing/reviewing
  code in this repo) so it loads on demand. `CLAUDE.md` should be a one-line pointer to it —
  keep detail in the skill, not in always-on context.
- Tailor every rule to what was actually installed. If the user declined a dependency, don't
  write standards that assume it.
- **Be example-driven, not prose-only.** Pair each non-obvious rule with a SHORT code snippet
  (the Result type, a minimal boundary test / `vi.mock` setup, a purity anti-pattern). Standards
  with examples get followed; prose alone gets skimmed.
- **App vs library structure:** for a full-stack **app**, split reference files by layer
  (typescript / database / routes / frontend); for a **library/CLI**, keep one SKILL.md (< ~100 lines).
- **Self-check after generating:** confirm the standards match what's installed —
  `typecheck`/`test` scripts exist; vitest `globals: true` (if used); `~/*` alias in BOTH tsconfig
  and the bundler/test resolver; dual-build tool present (libraries). Don't document a tool that
  isn't installed.
- **vitest must exclude `.sandcastle/worktrees/`** (and `dist`). After an AFK run, preserved
  worktrees each hold a copy of `src/*.test.ts`; without an `exclude`, host `pnpm test` scans them
  and reports phantom failures. Generate `vitest.config.ts` with
  `test.exclude: [...configDefaults.exclude, "**/.sandcastle/**", "dist/**"]`.
