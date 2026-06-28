#!/usr/bin/env node
/**
 * Sandcastle pre-flight doctor.
 *
 * Verifies — and auto-fixes where safe — the environment so an AFK run cold-starts
 * with ZERO manual intervention. Run it before launching: `node .sandcastle/doctor.mjs`
 * (or call it from main.mts before run()).
 *
 * Encodes the failures found while dogfooding the template (backlog T9–T15):
 *   - sandcastle runtime not installed at root
 *   - packageManager pinned to a range / a version the env can't run
 *   - invalid pnpm-workspace.yaml (allowBuilds / missing packages field)
 *   - Docker image not built
 *   - missing .env secrets
 *
 * Config via env: SC_PKG_DIR (the package the agent builds; default "core").
 * Exit code 0 = ready to run; non-zero = unresolved problems (printed).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PKG_DIR = process.env.SC_PKG_DIR || "core";
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

// 4. Valid pnpm-workspace.yaml in the package dir (packages: field + onlyBuiltDependencies)
const wsPath = `${PKG_DIR}/pnpm-workspace.yaml`;
if (existsSync(PKG_DIR)) {
  const ws = existsSync(wsPath) ? readFileSync(wsPath, "utf8") : "";
  const bad = !ws || /allowBuilds/.test(ws) || !/packages\s*:/.test(ws);
  if (bad) {
    writeFileSync(wsPath,
      "# pnpm build-script allow-list (onlyBuiltDependencies, NOT allowBuilds).\n" +
      "packages:\n  - .\n\nonlyBuiltDependencies:\n  - esbuild\n");
    fixed.push(`rewrote ${wsPath} (was missing 'packages:' or used invalid 'allowBuilds')`);
  } else ok.push(`${wsPath} valid`);
  // stray root workspace file confuses pnpm
  if (existsSync("pnpm-workspace.yaml") && !/packages\s*:/.test(readFileSync("pnpm-workspace.yaml", "utf8"))) {
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
  const img = tryout(`docker images --format '{{.Repository}}:{{.Tag}}' | grep -i sandcastle`);
  if (!img) {
    try { sh("npx @ai-hero/sandcastle docker build-image"); fixed.push("built sandcastle Docker image"); }
    catch { errors.push("sandcastle image missing — run `npx @ai-hero/sandcastle docker build-image`"); }
  } else ok.push(`docker image present (${img.split("\n")[0]})`);
}

// 7. main.mts sanity (warn-only — these are correctness, not blockers to detect here)
const mainPath = ".sandcastle/main.mts";
if (existsSync(mainPath)) {
  const m = readFileSync(mainPath, "utf8");
  if (!/completionSignal/.test(m)) errors.push("main.mts: missing completionSignal (must match prompt's <promise>...)");
  if (!/confirmModulesPurge=false/.test(m)) errors.push("main.mts: install hook should pass --config.confirmModulesPurge=false");
  if (!/git push/.test(m)) errors.push("main.mts: no post-run `git push` — closed issues won't reach origin");
  if (/maxIterations:\s*[1-3]\b/.test(m)) fixed.push("main.mts: maxIterations is low (<=3) — raise to >= open AFK issue count");
}

// Report
const line = (s) => console.log("  " + s);
console.log("\n🩺 Sandcastle doctor\n");
if (ok.length)    { console.log("✅ OK");      ok.forEach(line); }
if (fixed.length) { console.log("\n🔧 Auto-fixed"); fixed.forEach(line); }
if (errors.length){ console.log("\n❌ Needs you"); errors.forEach(line); }
console.log(errors.length ? "\nNot ready — resolve the ❌ items above.\n" : "\n✅ Ready for an AFK run.\n");
process.exit(errors.length ? 1 : 0);
