# Template Improvements — Backlog

Running list of improvements to the ai-project-template, surfaced by dogfooding it on real
projects (e.g. `MarkdownConverterV2` / markitdown Phase 0).

## Epic: Toward complete AFK (human writes the PRD; system delivers tested, merged code)

The loop: PRD (human) → prd-to-issues → **self-healing sandcastle run** → PR-per-issue →
CI gate → review-agent → auto-merge → loop-until-dry; HITL issues are hard stops.

- [~] **A1 — Zero-touch self-healing bootstrap.** `templates/sandcastle-doctor.mjs` checks + auto-fixes
  T9–T15 (runtime, pnpm pins, workspace, image, secrets) and runs pre-flight from `main.mts`.
  **First fresh clean-init proof (base64-codec-demo, real Opus AFK run) surfaced gaps the template/doctor
  did NOT cover — now fixed in this commit:**
  - **GAP-2 (critical):** pnpm 11.5.x exits non-zero on `ERR_PNPM_IGNORED_BUILDS` and honors the
    `allowBuilds` map, NOT `onlyBuiltDependencies` — the doctor's old rewrite was *backwards* and killed
    the first run. Fixed: doctor writes `allowBuilds` + runs `approve-builds`; guidance/SKILL/skills corrected.
  - **GAP-1:** tsup DTS build fails `TS5101 baseUrl` on TypeScript 6 → `ignoreDeprecations: "6.0"`.
  - **GAP-4:** sandcastle 0.10.0 scaffold is npm-first (no pnpm in Dockerfile, `npm install` hook) →
    SKILL step 5 rewritten; doctor asserts Dockerfile pnpm + flags `npm install` hooks.
  - **GAP-3/5/6/7/9:** main.ts↔.mts, completionSignal slot, project-specific image grep, headless init
    flags, vitest `.sandcastle/worktrees` exclude — all addressed.
  - **GAP-8 (merge-to-head non-atomicity):** one failed merge aborts the run; "closed" issue's code can miss
    `main`; runtime workspace churn caused the conflict (now removed by committing `allowBuilds`). **Structural
    fix is A2 (PR-per-issue).**
  - **✅ Re-run PASSED (base64-codec-zt, fixed template):** clean-init green with zero ad-hoc fixes; AFK run
    built all 3 issues, 33 tests green, merged each to `main`, closed all 3, and pushed to origin — `WRAPPER_EXIT=0`.
    GAP-8 did not recur (committed `allowBuilds` removed the churn). **A1 is proven** for the merge-to-head model;
    A2 remains for atomic PR-per-issue robustness.
- [ ] **A2 — PR-per-issue** (replace merge-to-head): agent pushes a branch + opens a PR "Closes #N";
  issue closes only when the PR merges → "closed" ⇔ "code on main" atomic, and a review surface.
- [ ] **A3 — CI gate** (GitHub Actions): typecheck+test+build on each PR; branch protection blocks
  merge unless green. The agent then *cannot* land broken code unattended.
- [ ] **A4 — Verification loop**: a `code-review` agent reviews each PR; real findings → a fix issue
  (next loop picks it up) instead of merging. Quality guardrail for unattended runs.
- [ ] **A5 — Triggering**: scheduled cron (nightly) or GitHub Action on the `AFK` label; loop-until-dry
  with a budget cap. Removes the manual `npx tsx main.mts` launch.

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
