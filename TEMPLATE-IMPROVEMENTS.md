# Template Improvements — Backlog

Running list of improvements to the ai-project-template, surfaced by dogfooding it on real
projects (e.g. `MarkdownConverterV2` / markitdown Phase 0). Newest findings at the top of TODO.

## TODO (batched — fix together, then re-verify)

- [ ] **T1 — Make init mostly deterministic (token/time win).** ~80% of `init-project` is
  deterministic (scaffold, `npx skills add` loop, sandcastle init, finalize) but the LLM agent
  runs every command + writes every file by hand, burning tokens and minutes. Ship a
  parameterized `init.mjs`/`init.sh` that takes the interview answers and does scaffold +
  skill-installs + sandcastle + finalize in one pass. Reserve the LLM for ONLY: the interview
  and authoring `coding-standards`. (Aligns with write-a-skill: "scripts for deterministic ops.")
- [ ] **T2 — Support a local-file PRD.** `to-prd`/`prd-to-issues` assume a PRD lives as a GitHub
  issue. Real projects often have `docs/PRDs/*.md`. Let `prd-to-issues` accept a local markdown
  PRD as input (read file → slice → create issues).
- [ ] **T3 — Verify sandcastle end-to-end.** Neither Docker nor no-sandbox mode has been run e2e
  yet (both prior tests skipped it). Verify both modes actually execute a loop, and confirm
  `claude setup-token` (CLAUDE_CODE_OAUTH_TOKEN) works inside the Docker sandbox.
- [ ] **T4 — Init completion robustness.** When run interactively, init stalled / didn't run to
  completion twice (loaded the skill but didn't execute all steps). Investigate whether SKILL
  wording invites early stop; consider an explicit "execute, don't just plan; finish all steps"
  directive and a final self-check that core/ + coding-standards exist and init-project is gone.
- [ ] **T5 — (maybe) Trim coding-standards LLM cost.** Could ship a per-ecosystem skeleton the
  LLM only fills/prunes, instead of authoring from scratch. Evaluate token saving vs quality.
- [ ] **T6 — First-class library section in coding-standards-guidance.** From the Matt-vs-generated
  comparison (98% fidelity, but library support is just a scaffolder bullet today). Add: purity-rules
  template (globals to ban + anti-patterns like `import fs`), contract-as-single-source-of-truth
  (semver-major on change), golden/determinism/purity test templates, dual-build + `verbatimModuleSyntax`
  note. Also note the Result pattern may be a typed error class (not only a discriminated union) for libs.
- [ ] **T7 — Make generated standards example-driven.** The generated lib standards were correct but
  prosier than Matt's, which pair every rule with a code example. Generator should emit short code
  snippets (Result pattern, a vitest boundary-test setup, purity anti-pattern) — more actionable.
- [ ] **T9 — Sandcastle runtime not installed by init.** init runs `npx @ai-hero/sandcastle init`
  (scaffolds `.sandcastle/`) but never installs `@ai-hero/sandcastle` + `tsx` at the repo root, so
  `npx tsx .sandcastle/main.mts` fails on the import. init must create/extend a root `package.json`
  and `pnpm add -D @ai-hero/sandcastle tsx` (and ideally add a `sandcastle` script). (cf. sandcastle
  issue #191.)
- [ ] **T10 — Sandcastle config defaults wrong for a real backlog.** Generated `main.mts` has
  `maxIterations: 3` (too low — a real backlog has 10+ issues) and **no `completionSignal`**, so it
  defaults to `<promise>COMPLETE</promise>` while the generated `prompt.md` emits
  `<promise>NO MORE TASKS</promise>` — mismatch means it never detects "done" and burns all
  iterations. init should set `completionSignal` to match the prompt and pick a sensible
  maxIterations (e.g. derive from open AFK issue count, or default ~15).
- [ ] **T11 — init generates INVALID pnpm-workspace.yaml.** It wrote `allowBuilds: { esbuild: true }`
  (not a real pnpm key) and omitted the required `packages:` field, so `pnpm install` dies with
  "packages field missing or empty". Plus a stray broken **root** `pnpm-workspace.yaml` with an
  unfilled `set this to true or false` placeholder. Use the proven form:
  `packages: [.]` + `onlyBuiltDependencies: [esbuild]`. Don't emit a root workspace file unless it's
  actually a workspace.
- [ ] **T12 — pnpm version pin mismatch breaks Docker.** init pinned `core` `packageManager` to
  `pnpm@11.5.3` while the env had 9.12.3; the sandcastle Docker image (`corepack enable`) then tried
  to download 11.5.3 and **aborted non-interactively**. init must pin to the *detected* pnpm, and the
  generated Dockerfile should `corepack prepare pnpm@<v> --activate` + `ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.
- [ ] **T13 — sandcastle install hook hangs on the purge prompt.** `onSandboxReady: cd core && pnpm install`
  copies darwin `node_modules` into a linux container → pnpm wants to reinstall and **blocks on a
  "remove node_modules?" prompt** (no TTY). The generated command must pass
  `--config.confirmModulesPurge=false` (or set CI=true).
- [ ] **T14 — husky hook blocks root-level commits.** core's `prepare: cd .. && husky core/.husky`
  installs a pre-commit that runs lint-staged/pnpm assuming the `core` cwd; committing root-level files
  (e.g. `.sandcastle/*`) fails with "packages field missing or empty". Scope the hook so root commits
  don't trip it (or run lint-staged with the correct package dir).
- [ ] **T8 — Generator self-check + modular-vs-monolithic guidance.** (a) After generating, verify the
  standards match what was installed (typecheck script exists, vitest `globals:true`, `~/*` in tsconfig
  AND bundler, dual-build tool for libs). (b) Apps → split reference files by layer (Matt's pattern);
  libraries → keep one SKILL.md < ~100 lines.

## DONE (shipped to template main)

- [x] **D1 — Headless TS library project type.** Added a real library scaffold (pnpm init + tsup
  dual ESM/CJS + vitest, no React/tailwind), distinct from the Vite/Next/RR7 app path.
- [x] **D2 — Subfolder / monorepo scaffold target.** init can scaffold into a chosen subdir
  (e.g. `core/`, `packages/x`) while `.claude/` + `docs/` stay shared at the repo root.
- [x] **D3 — In-project skills by default.** Explicit in-project-vs-global decision in step 0;
  default `--copy` into the repo (global skills aren't visible to sandcastle Docker / collaborators).
- [x] **D4 — pnpm native-build approval.** Guidance mandates `pnpm approve-builds --all` /
  `onlyBuiltDependencies` in `pnpm-workspace.yaml` (was wrongly `pnpm rebuild`).
- [x] **D5 — `~/*` alias location.** `paths` in `tsconfig.app.json`, no `baseUrl` (TS6 deprecation).
- [x] **D6 — husky v9.** `husky init` + `prepare` script (no `husky install`).
- [x] **D7 — Python path hardening.** `uv init --package`, PEP 695 generics for ruff `UP`,
  full dev dep set, mypy hook `additional_dependencies: [pydantic]`, pytest src-layout config.
- [x] **D8 — Planning & verification skills.** init installs writing-plans, executing-plans,
  verification-before-completion from obra/superpowers.
- [x] **D9 — grill-me before the interview.** Installed in step 0 so the interview can use it.
