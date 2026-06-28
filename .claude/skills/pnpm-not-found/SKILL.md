---
name: pnpm-not-found
description: Fix "pnpm command not found" errors by enabling corepack. Use when pnpm cannot be found, corepack errors appear, or package manager is missing.
---

# pnpm Not Found Fix

When you encounter errors like `pnpm: command not found` or `pnpm: not found`, enable pnpm via
corepack. `corepack enable` alone only installs the shim; also activate the pinned version so a
fresh shell/container has the exact pnpm the repo expects:

```sh
corepack enable
corepack prepare pnpm@<version> --activate   # use the repo's "packageManager" pin (e.g. pnpm@11.5.3)
```

In a non-interactive/container context, set `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` first so corepack
doesn't hang waiting to confirm a download. Do this without asking the user first — just enable,
activate, and retry.
