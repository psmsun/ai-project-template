#!/usr/bin/env node
/**
 * Sandcastle pre-flight doctor.
 *
 * Verifies — and auto-fixes where safe — the environment so an AFK run cold-starts
 * with ZERO manual intervention. Run it before launching: `node .sandcastle/doctor.mjs`
 * (or call it from main.mts before run()).
 *
 * Encodes the failures found while dogfooding the template (backlog T9–T15, A1):
 *   - sandcastle runtime not installed at root
 *   - packageManager pinned to a range / a version the env can't run
 *   - pnpm-workspace.yaml missing `packages:` or native builds not approved
 *     (pnpm 11.5.x honors the `allowBuilds` map, NOT `onlyBuiltDependencies`)
 *   - Dockerfile missing pnpm setup (the sandcastle 0.10.0 scaffold ships npm-only)
 *   - Docker image not built (or a different project's image masking it)
 *   - missing .env secrets
 *
 * Config via env: SC_PKG_DIR (the package the agent builds; default ".").
 * Exit code 0 = ready to run; non-zero = unresolved problems (printed).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PKG_DIR = process.env.SC_PKG_DIR || ".";
const ok = [], fixed = [], errors = [];

const sh = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryout = (c) => { try { return sh(c); } catch { return null; } };
const has = (c) => tryout(`command -v ${c}`) != null;

// 1. Required tools on PATH
for (const t of ["node", "pnpm", "git", "docker", "gh"]) {
  has(t) ? ok.push(`${t} present`) : errors.push(`${t} not found on PATH`);
}

// 2. Root package.json — a packageManager *range* breaks corepack; an exact pin can mismatch
//    the package dir / Dockerfile. Safest: leave root UNpinned (the host's pnpm runs the
//    launcher) and only strip an invalid range.
if (!existsSync("package.json")) {
  errors.push("no root package.json — run `pnpm init` and add a 'sandcastle' script");
} else {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  if (pkg.packageManager && /[\^~]|>=|\bx\b|\*/.test(pkg.packageManager)) {
    delete pkg.packageManager;
    writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
    fixed.push("removed invalid packageManager range from root (host pnpm runs the launcher)");
  } else ok.push(pkg.packageManager ? `root packageManager ${pkg.packageManager}` : "root packageManager unpinned (host pnpm)");
}

// 2b. The package dir's pnpm pin and the Dockerfile's baked pnpm must AGREE (else the
//     container corepack tries to download a different version and aborts).
if (existsSync(`${PKG_DIR}/package.json`) && existsSync(".sandcastle/Dockerfile")) {
  const corePin = (JSON.parse(readFileSync(`${PKG_DIR}/package.json`, "utf8")).packageManager || "").replace("pnpm@", "");
  const df = readFileSync(".sandcastle/Dockerfile", "utf8");
  const bake = (df.match(/corepack prepare pnpm@([\d.]+)/) || [])[1];
  if (corePin && bake && corePin !== bake)
    errors.push(`${PKG_DIR} pins pnpm@${corePin} but Dockerfile bakes pnpm@${bake} — make them match (rebuild image after)`);
  else if (corePin) ok.push(`pnpm pin consistent (${corePin})`);
}

// 3. Sandcastle runtime installed at root (the runner imports it)
for (const dep of ["@ai-hero/sandcastle", "tsx"]) {
  if (!existsSync(`node_modules/${dep}`)) {
    try { sh(`pnpm add -D ${dep}`); fixed.push(`installed ${dep} at root`); }
    catch { errors.push(`could not install ${dep} — run \`pnpm add -D ${dep}\``); }
  } else ok.push(`${dep} installed`);
}

// 4. pnpm-workspace.yaml: `packages:` field + native-build approval.
//    VERIFIED on pnpm 11.5.x: `pnpm install` exits NON-ZERO on un-approved native build
//    scripts (ERR_PNPM_IGNORED_BUILDS), and pnpm honors the `allowBuilds:` MAP (what
//    `pnpm approve-builds` writes) — NOT `onlyBuiltDependencies` (a list pnpm 11.5.x ignores).
//    So: ensure `allowBuilds: { <native>: true }` is committed (deterministic, churn-free), then
//    run approve-builds to actually compile on this host. esbuild (tsup/vitest) always; better-sqlite3 if used.
const wsPath = `${PKG_DIR}/pnpm-workspace.yaml`;
if (existsSync(PKG_DIR)) {
  const natives = ["esbuild"];
  try {
    const p = JSON.parse(readFileSync(`${PKG_DIR}/package.json`, "utf8"));
    const deps = { ...p.dependencies, ...p.devDependencies };
    if (deps["better-sqlite3"]) natives.push("better-sqlite3");
  } catch {}
  let ws = existsSync(wsPath) ? readFileSync(wsPath, "utf8") : "";
  const hasPackages = /packages\s*:/.test(ws);
  const missing = natives.filter((n) => !new RegExp(`^\\s*${n}\\s*:\\s*true`, "m").test(ws));
  if (!ws || !hasPackages || missing.length || /onlyBuiltDependencies/.test(ws)) {
    writeFileSync(wsPath,
      "# pnpm build-script approval. pnpm 11.5.x honors the `allowBuilds` MAP (not the\n" +
      "# `onlyBuiltDependencies` list), and `pnpm install` exits non-zero until native builds\n" +
      "# are approved. Keep this committed so installs are clean (exit 0) with no runtime churn.\n" +
      "packages:\n  - .\n\nallowBuilds:\n" + natives.map((n) => `  ${n}: true`).join("\n") + "\n");
    fixed.push(`ensured ${wsPath} (packages: + allowBuilds for ${natives.join(", ")})`);
  } else ok.push(`${wsPath} valid (allowBuilds: ${natives.join(", ")})`);
  // Actually run any pending approved builds on this host (idempotent; no-op once compiled).
  try { sh(`cd ${PKG_DIR} && pnpm approve-builds --all`); } catch {}
  // stray root workspace file confuses pnpm (only when the package lives in a subdir)
  if (PKG_DIR !== "." && existsSync("pnpm-workspace.yaml") &&
      !/packages\s*:/.test(readFileSync("pnpm-workspace.yaml", "utf8"))) {
    execSync("rm -f pnpm-workspace.yaml"); fixed.push("removed stray/invalid root pnpm-workspace.yaml");
  }
} else errors.push(`package dir '${PKG_DIR}' not found (set SC_PKG_DIR)`);

// 5. .env secrets (cannot auto-fill — human action)
const envPath = ".sandcastle/.env";
const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
if (!/^(CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY)=.+/m.test(env))
  errors.push(`${envPath}: set CLAUDE_CODE_OAUTH_TOKEN (\`claude setup-token\`) or ANTHROPIC_API_KEY`);
else ok.push("auth token set");
if (!/^GH_TOKEN=.+/m.test(env)) errors.push(`${envPath}: set GH_TOKEN (e.g. \`gh auth token\`)`);
else ok.push("GH_TOKEN set");

// 6. Docker daemon + image (Docker mode)
if (tryout("docker info") == null) {
  errors.push("Docker daemon not running — start Docker Desktop");
} else {
  ok.push("docker daemon up");
  // Project-specific tag — sandcastle names the image `sandcastle:<repo-dir>` (lowercased).
  // A loose `grep sandcastle` would match ANOTHER project's image and skip building this one.
  const proj = (tryout("basename \"$PWD\"") || "").toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const imgTag = `sandcastle:${proj}`;
  const img = tryout(`docker images --format '{{.Repository}}:{{.Tag}}' | grep -ix '${imgTag}'`);
  if (!img) {
    try { sh("npx @ai-hero/sandcastle docker build-image"); fixed.push(`built sandcastle Docker image (${imgTag})`); }
    catch { errors.push(`sandcastle image '${imgTag}' missing — run \`npx @ai-hero/sandcastle docker build-image\``); }
  } else ok.push(`docker image present (${imgTag})`);
}

// 7. main file sanity (model-aware: A2 PR-per-issue loop, or legacy merge-to-head).
const mainPath = [".sandcastle/main.mts", ".sandcastle/main.ts"].find(existsSync);
if (mainPath) {
  const f = mainPath.split("/").pop();
  const m = readFileSync(mainPath, "utf8");
  if (/\bnpm install\b/.test(m) && !/pnpm install/.test(m)) errors.push(`${f}: onSandboxReady uses \`npm install\` but this is a pnpm project — use \`pnpm install\``);
  if (!/confirmModulesPurge=false/.test(m)) errors.push(`${f}: install hook should pass --config.confirmModulesPurge=false`);
  if (/gh pr create/.test(m)) {
    // A2 PR-per-issue: host loop opens a PR per issue; one iteration per run, no completionSignal.
    if (!/branchStrategy/.test(m)) errors.push(`${f}: PR-per-issue model needs a branchStrategy (commits land on a per-issue branch)`);
    ok.push(`${f}: PR-per-issue (A2) model`);
  } else {
    // Legacy merge-to-head: needs a completionSignal, a post-run push, and enough iterations.
    if (!/completionSignal/.test(m)) errors.push(`${f}: missing completionSignal (must match prompt's <promise>...)`);
    if (!/git push/.test(m)) errors.push(`${f}: no post-run \`git push\` — closed issues won't reach origin`);
    if (/maxIterations:\s*[1-3]\b/.test(m)) fixed.push(`${f}: maxIterations is low (<=3) — raise to >= open AFK issue count`);
  }
}

// 7c. CI gate (A3): the PR-per-issue runner merges only when the `ci` check is green, so the
//     workflow must exist (and be on main) for PRs to gate. Warn-only — can't auto-create reliably.
if (mainPath && /gh pr create/.test(readFileSync(mainPath, "utf8"))) {
  if (existsSync(".github/workflows/ci.yml")) ok.push("CI workflow present (.github/workflows/ci.yml)");
  else errors.push("PR-per-issue needs a CI gate — copy templates/ci.yml → .github/workflows/ci.yml and push it to main");
}

// 7b. Dockerfile must set up the project's package manager (the 0.10.0 scaffold ships npm-only).
if (existsSync(".sandcastle/Dockerfile")) {
  const df = readFileSync(".sandcastle/Dockerfile", "utf8");
  if (!/corepack (enable|prepare)/.test(df))
    errors.push(".sandcastle/Dockerfile: no pnpm setup (add `corepack enable && corepack prepare pnpm@<v> --activate` + `ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0`)");
  else ok.push("Dockerfile sets up pnpm (corepack)");
}

// Report
const line = (s) => console.log("  " + s);
console.log("\n🩺 Sandcastle doctor\n");
if (ok.length)    { console.log("✅ OK");      ok.forEach(line); }
if (fixed.length) { console.log("\n🔧 Auto-fixed"); fixed.forEach(line); }
if (errors.length){ console.log("\n❌ Needs you"); errors.forEach(line); }
console.log(errors.length ? "\nNot ready — resolve the ❌ items above.\n" : "\n✅ Ready for an AFK run.\n");
process.exit(errors.length ? 1 : 0);
