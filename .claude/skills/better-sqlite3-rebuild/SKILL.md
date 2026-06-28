---
name: better-sqlite3-rebuild
description: Use when seeing errors about better-sqlite3 native module, NODE_MODULE_VERSION mismatch, "was compiled against a different Node.js version", or similar native binding errors.
---

# better-sqlite3 Rebuild

When you encounter errors related to `better-sqlite3` and Node.js version mismatches
(`NODE_MODULE_VERSION` mismatch, "was compiled against a different Node.js version", native module
load failures), the native module was never compiled (or was compiled for a different Node).

On **pnpm 10/11 a bare `pnpm rebuild` is gated and does NOT fix this** — pnpm blocks the build
script. Approve the build first, then it compiles:

```sh
pnpm approve-builds --all      # writes `allowBuilds: { better-sqlite3: true }` and runs the build
# if it still reports a stale binary after a Node upgrade:
pnpm rebuild better-sqlite3
```

Make it durable so future installs don't regress: ensure `pnpm-workspace.yaml` has
`allowBuilds: { better-sqlite3: true }` (pnpm 11.5.x honors the `allowBuilds` map, **not**
`onlyBuiltDependencies`). Verify: `node -e "new (require('better-sqlite3'))(':memory:')"`.

Do this without asking the user first — just approve/rebuild and retry. See also `pnpm-ignored-builds`.
