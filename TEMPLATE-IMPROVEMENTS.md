# Template Improvements — Backlog

Running list of improvements to the ai-project-template, surfaced by dogfooding it on real
projects (e.g. `MarkdownConverterV2` / markitdown Phase 0).

## TODO

- [ ] **T1 — Make init mostly deterministic (token/time win).** ~80% of `init-project` is
  deterministic (scaffold, `npx skills add` loop, sandcastle patches, finalize) but the LLM agent
  runs every command + writes every file by hand, burning tokens and minutes. Ship a parameterized
  `init.mjs` that takes the interview answers and does scaffold + skill-installs + sandcastle +
  finalize in one pass; reserve the LLM for ONLY the interview and authoring `coding-standards`.
  **Larger refactor — build + test on its own cycle** (a wrong script makes init worse than the
  current SKILL-driven flow, which now works).
- [ ] **T3b — Verify sandcastle *no-sandbox* mode e2e.** Docker mode is now verified end-to-end
  (real run: 9 issues built, `claude setup-token` confirmed working in the container). The
  `noSandbox()` path is still unrun.
- [ ] **T5 — (maybe) Trim coding-standards LLM cost.** Ship a per-ecosystem skeleton the LLM only
  fills/prunes instead of authoring from scratch. Evaluate token saving vs quality. (Depends on T1.)

## DONE (shipped to template main)

- [x] **D1 — Headless TS library project type** — real library scaffold (pnpm init + tsup dual
  ESM/CJS + vitest, no React/tailwind), distinct from the Vite/Next/RR7 app path.
- [x] **D2 — Subfolder / monorepo scaffold target** — scaffold into a chosen subdir; `.claude/` +
  `docs/` stay shared at the root.
- [x] **D3 — In-project skills by default** — explicit in-project-vs-global decision; default `--copy`.
- [x] **D4 — pnpm native-build approval** — `pnpm approve-builds` / `onlyBuiltDependencies` (not `pnpm rebuild`).
- [x] **D5 — `~/*` alias location** — `tsconfig.app.json`, no `baseUrl` (TS6 deprecation).
- [x] **D6 — husky v9** — `husky init` + `prepare` script.
- [x] **D7 — Python path hardening** — `uv init --package`, PEP 695 generics, full dev deps, mypy
  hook `additional_dependencies`, pytest src-layout.
- [x] **D8 — Planning & verification skills** — writing-plans/executing-plans/verification-before-completion.
- [x] **D9 — grill-me before the interview.**
- [x] **T2 — Local-file PRD support** — `prd-to-issues` reads `docs/PRDs/*.md`, publishes it as an issue first.
- [x] **T3 — Sandcastle verified e2e (Docker)** — real AFK run built 9 slices; setup-token works in-container.
- [x] **T4 — Init completion robustness** — "EXECUTE don't just plan" directive + finalize self-check.
- [x] **T6 — First-class library section** in guidance (purity/contract/test-category templates).
- [x] **T7 — Example-driven standards** — generator mandate to pair rules with code snippets.
- [x] **T8 — Generator self-check + app(modular)-vs-library(monolithic)** SKILL.md guidance.
- [x] **T9 — Sandcastle runtime installed at root** — init adds root `package.json` + `pnpm add -D @ai-hero/sandcastle tsx`.
- [x] **T10 — Sandcastle config defaults** — `completionSignal` matches prompt; `maxIterations` ≥ AFK count.
- [x] **T11 — Valid pnpm-workspace.yaml** — `packages: [.]` + `onlyBuiltDependencies` (not `allowBuilds`); no stray root file.
- [x] **T12 — pnpm pin/corepack for Docker** — pin detected pnpm; Dockerfile `corepack prepare --activate` + `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.
- [x] **T13 — Non-interactive install hook** — `pnpm install --config.confirmModulesPurge=false`.
- [x] **T14 — Root-commit hook** — resolved by T11 (the broken workspace was the cause; valid workspace lets the hook run from root).
- [x] **T15 — AFK run pushes code** — `git push origin HEAD` after `run()`; PR-per-issue noted as the stronger future model.

> Note: all T-fixes are baked into the **init-project instructions** (the agent applies them when
> generating a project). They have NOT been re-verified by a fresh end-to-end init run since batching
> — a clean `init` on a throwaway repo is the recommended next validation.
