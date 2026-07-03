#!/usr/bin/env node
/**
 * Sandcastle pre-flight doctor — Python/uv variant (mirrors templates/ts/sandcastle-doctor.mjs).
 *
 * Verifies — and auto-fixes where safe — the environment so an AFK run cold-starts with ZERO
 * manual intervention. Run it before launching: `node .sandcastle/doctor.mjs`
 * (or call it from main.mts before run()).
 *
 * The sandcastle RUNNER is Node-based even for a Python project: the loop is tsx + the
 * @ai-hero/sandcastle package at the repo root; only the project under build is uv-managed.
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

// 1. Required tools on PATH (node runs the launcher; uv runs the project)
for (const t of ["node", "uv", "git", "docker", "gh"]) {
  has(t) ? ok.push(`${t} present`) : errors.push(`${t} not found on PATH`);
}

// 2. Root package.json — hosts the sandcastle runtime. A packageManager *range* breaks corepack.
if (!existsSync("package.json")) {
  errors.push("no root package.json — the runner needs one (`pnpm init` or minimal {\"type\":\"module\"}) with a 'sandcastle' script");
} else {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  if (pkg.packageManager && /[\^~]|>=|\bx\b|\*/.test(pkg.packageManager)) {
    delete pkg.packageManager;
    writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
    fixed.push("removed invalid packageManager range from root (host pnpm runs the launcher)");
  } else ok.push(pkg.packageManager ? `root packageManager ${pkg.packageManager}` : "root packageManager unpinned (host pnpm)");
}

// 3. Sandcastle runtime installed at root (the runner imports it)
for (const dep of ["@ai-hero/sandcastle", "tsx"]) {
  if (!existsSync(`node_modules/${dep}`)) {
    try { sh(`pnpm add -D ${dep}`); fixed.push(`installed ${dep} at root`); }
    catch { errors.push(`could not install ${dep} — run \`pnpm add -D ${dep}\``); }
  } else ok.push(`${dep} installed`);
}

// 4. Python project sanity: pyproject + a lockfile + a green `uv sync`.
if (!existsSync(`${PKG_DIR}/pyproject.toml`)) {
  errors.push(`${PKG_DIR}/pyproject.toml not found (set SC_PKG_DIR, or run \`uv init --package\`)`);
} else {
  ok.push(`${PKG_DIR}/pyproject.toml present`);
  if (!existsSync(`${PKG_DIR}/uv.lock`)) {
    try { sh(`cd ${PKG_DIR} && uv lock`); fixed.push("wrote uv.lock (commit it — the container installs from it)"); }
    catch { errors.push("no uv.lock and `uv lock` failed — resolve dependency conflicts first"); }
  } else ok.push("uv.lock present");
  try { sh(`cd ${PKG_DIR} && uv sync`); ok.push("uv sync clean"); }
  catch (e) { errors.push(`\`uv sync\` fails in ${PKG_DIR}: ${String(e.stderr || e.message).split("\n")[0]}`); }
}

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
  const proj = (tryout("basename \"$PWD\"") || "").toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const imgTag = `sandcastle:${proj}`;
  const img = tryout(`docker images --format '{{.Repository}}:{{.Tag}}' | grep -ix '${imgTag}'`);
  if (!img) {
    try { sh("npx @ai-hero/sandcastle docker build-image"); fixed.push(`built sandcastle Docker image (${imgTag})`); }
    catch { errors.push(`sandcastle image '${imgTag}' missing — run \`npx @ai-hero/sandcastle docker build-image\``); }
  } else ok.push(`docker image present (${imgTag})`);
}

// 7. main file sanity (A2 PR-per-issue loop expected).
const mainPath = [".sandcastle/main.mts", ".sandcastle/main.ts"].find(existsSync);
if (mainPath) {
  const f = mainPath.split("/").pop();
  const m = readFileSync(mainPath, "utf8");
  // strip comments first — only CODE mentioning npm/pnpm install is a real problem
  const code = m.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/\b(npm|pnpm) install\b/.test(code)) errors.push(`${f}: install hook uses npm/pnpm but this is a uv project — the onSandboxReady hook should run \`uv sync\``);
  if (!/uv sync/.test(code)) errors.push(`${f}: onSandboxReady hook must run \`uv sync\` so the agent starts with a ready venv`);
  if (/gh pr create/.test(code)) {
    if (!/branchStrategy/.test(m)) errors.push(`${f}: PR-per-issue model needs a branchStrategy (commits land on a per-issue branch)`);
    ok.push(`${f}: PR-per-issue (A2) model`);
  } else {
    errors.push(`${f}: expected the PR-per-issue loop (copy templates/py/sandcastle-main.mts) — legacy merge-to-head is not supported for the py path`);
  }
}

// 7b. CI gate (A3): the runner merges only when the `ci` check is green.
if (mainPath && /gh pr create/.test(readFileSync(mainPath, "utf8"))) {
  if (existsSync(".github/workflows/ci.yml")) ok.push("CI workflow present (.github/workflows/ci.yml)");
  else errors.push("PR-per-issue needs a CI gate — copy templates/py/ci.yml → .github/workflows/ci.yml and push it to main");
}

// 7c. Dockerfile must provide uv inside the container (the scaffold ships node/npm only).
if (existsSync(".sandcastle/Dockerfile")) {
  const df = readFileSync(".sandcastle/Dockerfile", "utf8");
  if (!/(astral-sh\/uv|pip install uv|curl .*astral\.sh\/uv)/.test(df)) {
    errors.push(".sandcastle/Dockerfile: uv not installed in the image — add `COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/` (before any USER switch)");
  } else ok.push("Dockerfile installs uv");
}

// Report
const line = (s) => console.log("  " + s);
console.log("\n🩺 Sandcastle doctor (py)\n");
if (ok.length)    { console.log("✅ OK");      ok.forEach(line); }
if (fixed.length) { console.log("\n🔧 Auto-fixed"); fixed.forEach(line); }
if (errors.length){ console.log("\n❌ Needs you"); errors.forEach(line); }
console.log(errors.length ? "\nNot ready — resolve the ❌ items above.\n" : "\n✅ Ready for an AFK run.\n");
process.exit(errors.length ? 1 : 0);
