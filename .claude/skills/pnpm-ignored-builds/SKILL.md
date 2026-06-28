---
name: pnpm-ignored-builds
description: Fix pnpm refusing to run native build scripts (ERR_PNPM_IGNORED_BUILDS) and `pnpm install` exiting non-zero. Use when an install reports "Ignored build scripts", esbuild/better-sqlite3/native modules aren't compiled, or a pnpm install/CI step fails on un-approved builds.
---

# pnpm ignored builds (ERR_PNPM_IGNORED_BUILDS)

pnpm blocks native build scripts (postinstall) by default. The symptom:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.x.y
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

**Two facts about pnpm 11.5.x (verified):**

1. **`pnpm install` EXITS NON-ZERO (1)** while builds are ignored — so a bare `pnpm install` must
   never be the exit-gating step of a hook/CI when native builds exist; it will fail the step even
   though deps resolved fine.
2. **pnpm honors the `allowBuilds` MAP, NOT `onlyBuiltDependencies`.** `pnpm approve-builds --all`
   writes `allowBuilds: { <pkg>: true }` into `pnpm-workspace.yaml` and runs the postinstall.
   An `onlyBuiltDependencies:` list is ignored in 11.5.x (install still exits 1, build still skipped).

## Fix (do this without asking — just run it)

```sh
pnpm approve-builds --all                     # compiles the native deps; exit 0 afterwards
```

## Make it durable (so installs are clean everywhere, no runtime churn)

Commit a `pnpm-workspace.yaml` in the package dir with the approval baked in:

```yaml
packages:
  - .
allowBuilds:
  esbuild: true
  # better-sqlite3: true   # add any other native dep with a postinstall
```

With that committed, every fresh `pnpm install` exits 0 without modifying the file — important inside
sandcastle, where runtime churn on this file causes merge-to-head conflicts.

## In a hook / CI step

If you can't pre-commit the map, make the install resilient (hooks run via `sh -c`):

```sh
pnpm install --config.confirmModulesPurge=false || true; pnpm approve-builds --all || true; pnpm install --config.confirmModulesPurge=false
```

The first install tolerates the ignored-builds exit, `approve-builds` compiles, the final install is
the real exit gate. See also `better-sqlite3-rebuild` and `pnpm-not-found`.
