#!/usr/bin/env node
/**
 * Deterministic init (backlog T1) — the mechanical ~80% of the init-project skill.
 *
 * The LLM agent's job shrinks to: interview the user, write the answers file, run this
 * script, author the coding-standards skill, then run the cleanup pass:
 *
 *   node scripts/init.mjs .init-answers.json            # scaffold + skills + sandcastle + config
 *   ... (agent authors .claude/skills/coding-standards/) ...
 *   node scripts/init.mjs .init-answers.json --cleanup   # self-check, then self-remove template meta
 *
 * The answers file is the template.config.json shape (see template.config.example.json).
 * Every command this script runs was validated by the A1/A2 dogfooding runs; the gotchas it
 * encodes (packageManager pin, allowBuilds, ignoreDeprecations, husky v9, mypy hook deps, …)
 * live in .claude/skills/init-project/coding-standards-guidance.md.
 */
import { execSync, spawnSync } from "node:child_process";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync,
  rmSync, renameSync, copyFileSync, appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const ANSWER_FIELDS = [
  "language", "projectType", "framework", "scaffoldLocation", "skillLocation",
  "database", "packageManager", "deployTarget", "sandcastle", "codingStandards",
  "org", "license",
];
// Written by finalize(), not asked in the interview.
export const STAMPED_FIELDS = ["templateVersion", "templateCommit"];

const LICENSES = ["proprietary", "mit", "none"]; // org overlay license (default: proprietary, scoped to `org`)
const LANGUAGES = ["typescript", "python", "both"]; // both = web/ (TS) + api/ (Python), shared .claude/ + docs/
// UI-facing = renders pages: a TS app framework, or mixed-stack (has web/). Libraries + Python are headless.
const isUiStack = (a) => a.language === "both" || (a.language === "typescript" && a.projectType !== "library");
const log = (m) => console.log(`\n[init] ${m}`);
const die = (m) => { console.error(`\n[init] FATAL: ${m}`); process.exit(1); };

const run = (cmd, opts = {}) => {
  log(`$ ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: "inherit", ...opts });
  if (r.status !== 0 && !opts.allowFail) die(`command failed (exit ${r.status}): ${cmd}`);
  return r.status;
};
const out = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + "\n");

// ---------------------------------------------------------------- answers
function loadAnswers(path) {
  if (!path || !existsSync(path)) die(`answers file not found: ${path}\nusage: node scripts/init.mjs <answers.json> [--cleanup]`);
  const a = readJson(path);
  for (const f of ANSWER_FIELDS) if (!(f in a)) die(`answers missing field: ${f}`);
  if (!LANGUAGES.includes(a.language)) die(`language must be one of ${LANGUAGES.join("/")}`);
  if (a.language === "typescript" && a.packageManager !== "pnpm")
    die(`only pnpm is encoded for TypeScript (answers say ${a.packageManager}); npm/yarn need the manual SKILL path`);
  if (a.language === "python" && a.packageManager !== "uv")
    die(`only uv is encoded for Python (answers say ${a.packageManager})`);
  if (a.language === "both" && a.packageManager !== "pnpm+uv")
    die(`mixed-stack projects use packageManager "pnpm+uv" (answers say ${a.packageManager})`);
  if (a.sandcastle?.enabled) {
    // The runner/doctor templates assume Docker end-to-end (main.mts hardcodes docker(),
    // the doctor requires the daemon + image). no-sandbox is unvalidated — backlog T3b.
    if (a.sandcastle.mode !== "docker")
      die(`sandcastle mode "${a.sandcastle.mode}" is not yet supported (backlog T3b) — use mode "docker" or disable sandcastle`);
    // The container only sees repo-committed files: global skills are invisible to the
    // in-container agent, so a global-skills sandcastle project would run skill-less.
    if (a.skillLocation !== "project")
      die(`sandcastle requires skillLocation "project" (answers say "${a.skillLocation}") — the Docker container only sees repo-committed skills`);
  }
  if (typeof a.org !== "string" || !a.org.trim())
    die(`org must be a non-empty string (the GitHub org/owner for LICENSE + CODEOWNERS)`);
  if (!LICENSES.includes(a.license))
    die(`license must be one of ${LICENSES.join("/")} (answers say ${a.license})`);
  a.dir = a.scaffoldLocation && a.scaffoldLocation !== "." ? a.scaffoldLocation : ".";
  return a;
}

// ---------------------------------------------------------------- TS library
function scaffoldTsLibrary(a) {
  const dir = a.dir;
  const pnpmV = out("pnpm --version");
  if (dir !== ".") mkdirSync(dir, { recursive: true });
  const at = (f) => join(dir, f);

  if (!existsSync(at("package.json"))) run(`pnpm init`, { cwd: dir });
  const pkg = readJson(at("package.json"));
  delete pkg.devEngines; // pnpm init writes a range corepack rejects
  pkg.packageManager = `pnpm@${pnpmV}`; // exact pin, never a range
  pkg.type = "module";
  pkg.main = "./dist/index.cjs";
  pkg.module = "./dist/index.js";
  pkg.types = "./dist/index.d.ts";
  pkg.exports = { ".": { import: "./dist/index.js", require: "./dist/index.cjs" } };
  pkg.scripts = {
    ...pkg.scripts,
    typecheck: "tsc --noEmit",
    test: "vitest run",
    build: "tsup",
    prepare: "husky",
  };
  writeJson(at("package.json"), pkg);

  // allowBuilds BEFORE install: pnpm 11.5.x exits non-zero until native builds are approved.
  const builds = ["esbuild"];
  if (a.database === "sqlite") builds.push("better-sqlite3");
  writeFileSync(at("pnpm-workspace.yaml"),
    `packages:\n  - .\nallowBuilds:\n${builds.map((b) => `  ${b}: true`).join("\n")}\n`);

  writeFileSync(at("tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "ESNext", moduleResolution: "bundler",
      strict: true, verbatimModuleSyntax: true, skipLibCheck: true, noEmit: true,
      ignoreDeprecations: "6.0", // TS6 + tsup DTS: TS5101 baseUrl (injected by rollup-plugin-dts)
      paths: { "~/*": ["./src/*"] },
    },
    include: ["src"],
  }, null, 2) + "\n");

  writeFileSync(at("tsup.config.ts"),
`import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
});
`);
  mkdirSync(at("src"), { recursive: true });
  if (!existsSync(at("src/index.ts")))
    writeFileSync(at("src/index.ts"), `export const hello = (name: string): string => \`hello \${name}\`;\n`);
  if (!existsSync(at("src/index.test.ts")))
    writeFileSync(at("src/index.test.ts"),
`import { hello } from "~/index";

test("hello", () => {
  expect(hello("world")).toBe("hello world");
});
`);
  // ~/* must resolve in the test runner too, not just tsc.
  run(`pnpm add -D typescript tsup vitest @types/node vite-tsconfig-paths husky`, { cwd: dir });
  writeFileSync(at("vitest.config.ts"),
`import { defineConfig, configDefaults } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    exclude: [...configDefaults.exclude, "**/.sandcastle/**", "dist/**"],
  },
});
`);
  // vitest globals need ambient types
  const tc = readJson(at("tsconfig.json"));
  tc.compilerOptions.types = ["vitest/globals"];
  writeJson(at("tsconfig.json"), tc);

  if (a.database === "sqlite") run(`pnpm add drizzle-orm better-sqlite3 && pnpm add -D drizzle-kit @types/better-sqlite3`, { cwd: dir });
  if (a.database === "postgres") run(`pnpm add drizzle-orm pg && pnpm add -D drizzle-kit @types/pg`, { cwd: dir });

  run(`pnpm exec husky init`, { cwd: dir });
  writeFileSync(at(".husky/pre-commit"), `pnpm run typecheck && pnpm run test\n`);
  run(`pnpm approve-builds --all`, { cwd: dir, allowFail: true });
}

// ---------------------------------------------------------------- TS app
const PROTECTED = ["CLAUDE.md", "README.md", ".gitignore", ".claude", "docs", "templates", "scripts", "template.config.example.json", "TEMPLATE-IMPROVEMENTS.md"];

function scaffoldTsApp(a) {
  const pnpmV = out("pnpm --version");
  const target = a.dir === "." ? "_scaffold" : a.dir;
  // stdin closed (< /dev/null): scaffolders must never hang on a prompt in a non-TTY run
  const scaffolders = {
    "vite-react": `npm create -y vite@latest ${target} -- --template react-ts < /dev/null`,
    "react-router": `npx -y create-react-router@latest ${target} --no-install --no-git-init --yes < /dev/null`,
    "nextjs": `npx -y create-next-app@latest ${target} --ts --app --eslint --tailwind --src-dir --use-pnpm --yes < /dev/null`,
  };
  const cmd = scaffolders[a.framework];
  if (!cmd) die(`unknown TS app framework: ${a.framework} (expected vite-react | react-router | nextjs)`);
  run(cmd);
  if (!existsSync(join(target, "package.json"))) die(`scaffolder did not produce ${target}/package.json — see its output above`);

  if (a.dir === ".") {
    // Move scaffold up; template files win on conflict.
    for (const entry of readdirSync(target)) {
      if (PROTECTED.includes(entry)) {
        // merge .gitignore lines instead of dropping them
        if (entry === ".gitignore") {
          const extra = readFileSync(join(target, entry), "utf8");
          const ours = readFileSync(".gitignore", "utf8");
          const add = extra.split("\n").filter((l) => l.trim() && !ours.includes(l.trim()));
          if (add.length) appendFileSync(".gitignore", `\n# from scaffolder\n${add.join("\n")}\n`);
        }
        continue;
      }
      if (existsSync(entry)) rmSync(entry, { recursive: true });
      renameSync(join(target, entry), entry);
    }
    rmSync(target, { recursive: true, force: true });
  }

  const dir = a.dir;
  const at = (f) => join(dir, f);
  const pkg = readJson(at("package.json"));
  pkg.packageManager = `pnpm@${pnpmV}`;
  // Vite's react-ts template makes tsconfig.json a project-references stub — `tsc -b` is the
  // correct whole-project typecheck there; plain --noEmit only for single-tsconfig setups.
  const typecheck = existsSync(at("tsconfig.app.json")) ? "tsc -b" : "tsc --noEmit";
  pkg.scripts = { typecheck, ...pkg.scripts };
  if (!a.skipHooks) pkg.scripts.prepare = "husky";
  if (pkg.scripts.test === undefined || /no test specified/.test(pkg.scripts.test || "")) pkg.scripts.test = "vitest run";
  writeJson(at("package.json"), pkg);
  // vitest exits non-zero with zero test files — ship a smoke test so `pnpm test` is green from commit one
  if (!existsSync(at("src/smoke.test.ts")))
    writeFileSync(at("src/smoke.test.ts"),
`import { test, expect } from "vitest";

test("smoke", () => {
  expect(1 + 1).toBe(2);
});
`);

  const builds = ["esbuild"];
  if (a.database === "sqlite") builds.push("better-sqlite3");
  writeFileSync(at("pnpm-workspace.yaml"),
    `packages:\n  - .\nallowBuilds:\n${builds.map((b) => `  ${b}: true`).join("\n")}\n`);

  run(`pnpm add zod && pnpm add -D vitest husky vite-tsconfig-paths`, { cwd: dir });
  if (a.database === "sqlite") run(`pnpm add drizzle-orm better-sqlite3 && pnpm add -D drizzle-kit @types/better-sqlite3`, { cwd: dir });
  if (a.database === "postgres") run(`pnpm add drizzle-orm pg && pnpm add -D drizzle-kit @types/pg`, { cwd: dir });

  // ~/* alias: in the APP tsconfig (Vite's root tsconfig is a references stub); bare paths, no baseUrl.
  const appTc = ["tsconfig.app.json", "tsconfig.json"].map(at).find(existsSync);
  // vite ships JSONC: strip /* */ and // comments + trailing commas before parsing
  const jsonc = readFileSync(appTc, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1");
  const tc = JSON.parse(jsonc);
  tc.compilerOptions = { ...tc.compilerOptions, paths: { "~/*": ["./src/*"] } };
  writeJson(appTc, tc);

  if (!a.skipHooks) {
    run(`pnpm exec husky init`, { cwd: dir });
    writeFileSync(at(".husky/pre-commit"), `pnpm run typecheck && pnpm run test\n`);
  }
  run(`pnpm approve-builds --all`, { cwd: dir, allowFail: true });
  log(`NOTE: tailwind + shadcn for ${a.framework}: run \`npx shadcn@latest init\` interactively if the design needs it (UI choice, not mechanical).`);
}

// ---------------------------------------------------------------- Python
function scaffoldPython(a) {
  const dir = a.dir;
  if (dir !== ".") mkdirSync(dir, { recursive: true });
  const at = (f) => join(dir, f);
  const name = (a.projectName || out("basename $(git rev-parse --show-toplevel 2>/dev/null || pwd)")).replace(/[^a-zA-Z0-9_-]/g, "-");

  run(`uv init --package --name ${name}${dir === "." ? " ." : ""}`, dir === "." ? {} : { cwd: dir });
  run(`uv add pydantic`, { cwd: dir });
  run(`uv add --dev ruff pytest mypy pre-commit`, { cwd: dir });

  // pytest + src layout safety net, ruff UP rules, strict-ish mypy
  appendFileSync(at("pyproject.toml"),
`
[tool.pytest.ini_options]
pythonpath = ["src"]

[tool.ruff]
target-version = "py312"

[tool.ruff.lint]
extend-select = ["UP", "I"]

[tool.mypy]
strict = true
`);
  if (!a.skipHooks) writeFileSync(at(".pre-commit-config.yaml"),
`repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.15.20
    hooks:
      - id: ruff-check
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v2.1.0
    hooks:
      - id: mypy
        additional_dependencies: [pydantic]  # isolated venv can't resolve pydantic otherwise
        args: [--strict]
        files: ^src/
  - repo: local
    hooks:
      - id: pytest
        name: pytest
        entry: uv run pytest
        language: system
        pass_filenames: false
`);
  // `uv init --package` creates exactly one package dir under src/; pick it by directory,
  // never by readdir order (a stray .DS_Store or hidden file would sort first and the smoke
  // test would import garbage).
  const pkgDir = readdirSync(at("src"), { withFileTypes: true })
    .find((e) => e.isDirectory() && !e.name.startsWith("."))?.name;
  if (!pkgDir) die(`no package directory under ${at("src")} — \`uv init --package\` should have created one`);
  mkdirSync(at("tests"), { recursive: true });
  if (!existsSync(at("tests/test_smoke.py")))
    writeFileSync(at("tests/test_smoke.py"),
`from ${pkgDir.replace(/-/g, "_")} import __name__ as pkg_name


def test_package_imports() -> None:
    assert pkg_name
`);
  if (!a.skipHooks) run(`uv run pre-commit install`, { cwd: dir, allowFail: true });
}

// ---------------------------------------------------------------- mixed stack (both)
function scaffoldBoth(a) {
  // web/ (TS app) + api/ (Python), shared .claude/ + docs/ at the root. Per-package git hooks
  // conflict (husky and pre-commit both own core.hooksPath), so hooks live in ONE root
  // .pre-commit-config.yaml running both suites.
  scaffoldTsApp({ ...a, dir: "web", scaffoldLocation: "web", skipHooks: true,
    framework: !a.framework || a.framework === "none" ? "vite-react" : a.framework });
  scaffoldPython({ ...a, dir: "api", scaffoldLocation: "api", skipHooks: true });

  writeFileSync(".pre-commit-config.yaml",
`repos:
  - repo: local
    hooks:
      - id: web-checks
        name: web typecheck + test
        entry: bash -c 'cd web && pnpm run typecheck && pnpm run test'
        language: system
        pass_filenames: false
      - id: api-checks
        name: api lint + typecheck + test
        entry: bash -c 'cd api && uv run ruff check . && uv run mypy src && uv run pytest'
        language: system
        pass_filenames: false
`);
  run(`./api/.venv/bin/pre-commit install`, { allowFail: true });

  // CI matrix + scheduled audit over both packages (written even without sandcastle — ci is the
  // merge gate). Built by the shared, asserted assembler so a template reformat fails loudly
  // instead of emitting a malformed workflow (B3.1).
  mkdirSync(".github/workflows", { recursive: true });
  const mixed = buildMixedWorkflows();
  writeFileSync(".github/workflows/ci.yml", mixed.ci);
  writeFileSync(".github/workflows/audit.yml", mixed.audit);
}

// ---------------------------------------------------------------- workflow assembly (B3.1)
// Isolate the single job under a stack template's `jobs:` key and rename it, injecting the
// subfolder working-directory (+ pnpm cache path for the TS stack). Structured + asserted: a
// template that grows a second job, a stray top-level key after `jobs:`, or loses its `jobs:`
// key throws HERE rather than silently producing a broken mixed workflow.
export function stackJob(yamlText, jobName, { dir } = {}) {
  const lines = yamlText.split("\n");
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsIdx < 0) throw new Error("stack template has no top-level `jobs:` key");
  const after = lines.slice(jobsIdx + 1);
  const stray = after.find((l) => /^\S/.test(l) && l.trim() && !l.startsWith("#"));
  if (stray) throw new Error(`unexpected top-level content after jobs: ${JSON.stringify(stray)}`);
  const headers = after.filter((l) => /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l));
  if (headers.length !== 1) throw new Error(`expected exactly one job under jobs:, found ${headers.length}`);
  let block = after.join("\n").replace(/^ {2}[A-Za-z0-9_-]+:/m, `  ${jobName}:`);
  if (dir) {
    block = block
      .replace("runs-on: ubuntu-latest", `runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: ${dir}`)
      .replace("cache: pnpm", `cache: pnpm\n          cache-dependency-path: ${dir}/pnpm-lock.yaml`);
  }
  return block.replace(/\n+$/, "");
}

// Assemble the mixed-stack ci.yml (ci-web + ci-api merge gate) and audit.yml (audit-web +
// audit-api, schedule-only) from the single-stack templates. Pure: returns strings, writes
// nothing — validate-template.mjs calls this to YAML-check the emitted workflows.
export function buildMixedWorkflows() {
  const ciWeb = stackJob(readFileSync("templates/ts/ci.yml", "utf8"), "ci-web", { dir: "web" });
  const ciApi = stackJob(readFileSync("templates/py/ci.yml", "utf8"), "ci-api", { dir: "api" });
  const auditWeb = stackJob(readFileSync("templates/ts/audit.yml", "utf8"), "audit-web", { dir: "web" });
  const auditApi = stackJob(readFileSync("templates/py/audit.yml", "utf8"), "audit-api", { dir: "api" });
  const ci =
`# CI gate — mixed-stack matrix: web/ (pnpm) + api/ (uv). Both jobs must be green to merge.
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
${ciWeb}
${ciApi}
`;
  const audit =
`# Non-blocking scheduled dependency audit — web/ (pnpm) + api/ (uv). Schedule-only (never a PR
# check) so a new advisory can't freeze the runner's auto-merge; the merge gate is ci.yml.
name: audit

on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
${auditWeb}
${auditApi}
`;
  return { ci, audit };
}

// The CI gate ships with EVERY generated project (it's the merge gate, not a sandcastle
// accessory — QA on #11 caught single-stack/no-sandcastle projects shipping without one).
function writeCiGate(a) {
  mkdirSync(".github/workflows", { recursive: true });
  if (a.language === "both") return; // scaffoldBoth already wrote the ci-web/ci-api matrix
  const stackDir = a.language === "typescript" ? "templates/ts" : "templates/py";
  let ci = readFileSync(`${stackDir}/ci.yml`, "utf8");
  if (a.dir !== ".") {
    ci = ci.replace("runs-on: ubuntu-latest", `runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: ${a.dir}`)
      .replace("cache: pnpm", `cache: pnpm\n          cache-dependency-path: ${a.dir}/pnpm-lock.yaml`);
  }
  writeFileSync(".github/workflows/ci.yml", ci);
}

// The dependency audit ships as a SEPARATE, schedule-only workflow (never a PR check) so a new
// transitive advisory can't turn a green PR red and freeze the runner's auto-merge — see B2.3.
function writeAuditWorkflow(a) {
  mkdirSync(".github/workflows", { recursive: true });
  if (a.language === "both") return; // scaffoldBoth writes the combined audit-web/audit-api file
  const stackDir = a.language === "typescript" ? "templates/ts" : "templates/py";
  let audit = readFileSync(`${stackDir}/audit.yml`, "utf8");
  if (a.dir !== ".") {
    audit = audit.replace("runs-on: ubuntu-latest", `runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: ${a.dir}`)
      .replace("cache: pnpm", `cache: pnpm\n          cache-dependency-path: ${a.dir}/pnpm-lock.yaml`);
  }
  writeFileSync(".github/workflows/audit.yml", audit);
}

// ---------------------------------------------------------------- skills
// The remote workflow skills installSkills() is expected to land (installs are best-effort,
// so both install time and the --cleanup self-check verify this set actually exists).
const REMOTE_SKILLS = ["grill-me", "to-prd", "handoff", "writing-plans", "executing-plans", "verification-before-completion"];
const missingSkills = () => REMOTE_SKILLS.filter((s) => !existsSync(`.claude/skills/${s}/SKILL.md`));

function installSkills(a) {
  if (a.skillLocation !== "project") {
    log("skillLocation=global — skipping in-project installs (use global copies).");
    return;
  }
  // remote skills with no vendored equivalent + the obra planning/verification trio
  run(`npx -y skills add mattpocock/skills -s grill-me -s to-prd -s handoff --copy -y`, { allowFail: true });
  run(`npx -y skills add obra/superpowers -s writing-plans -s executing-plans -s verification-before-completion --copy -y`, { allowFail: true });
  const missing = missingSkills();
  if (missing.length)
    log(`WARNING: workflow skills missing after install: ${missing.join(", ")} — the skills registry may be unreachable. Re-run the two \`npx skills add\` commands above; --cleanup will FAIL until they exist.`);
}

// ---------------------------------------------------------------- sandcastle
function setupSandcastle(a) {
  if (!a.sandcastle?.enabled) return;
  // mixed-stack AFK builds the web package by default (override per-run via SC_PKG_DIR)
  const stackDir = a.language === "python" ? "templates/py" : "templates/ts";
  const pnpmV = out("pnpm --version");

  // runtime at repo ROOT (the runner imports it from the root)
  if (!existsSync("package.json")) {
    writeJson("package.json", { name: "root", private: true, type: "module", packageManager: `pnpm@${pnpmV}` });
  } else {
    const pkg = readJson("package.json");
    pkg.type = "module"; pkg.packageManager = `pnpm@${pnpmV}`;
    writeJson("package.json", pkg);
  }
  if (!existsSync("pnpm-workspace.yaml"))
    writeFileSync("pnpm-workspace.yaml", "packages:\n  - .\nallowBuilds:\n  esbuild: true\n");
  run(`pnpm add -D @ai-hero/sandcastle tsx`);
  const pkg = readJson("package.json");
  pkg.scripts = { ...pkg.scripts, sandcastle: "tsx .sandcastle/main.mts", "sandcastle:doctor": "node .sandcastle/doctor.mjs" };
  writeJson("package.json", pkg);

  run(`npx -y @ai-hero/sandcastle init --agent claude-code --sandbox ${a.sandcastle.mode === "docker" ? "docker" : "none"} --issue-tracker github-issues --template simple-loop --build-image false --create-label false`, { allowFail: true });
  rmSync(".sandcastle/main.ts", { force: true }); // replaced by the validated A2 loop

  copyFileSync(`${stackDir}/sandcastle-main.mts`, ".sandcastle/main.mts");
  if (a.language === "both") {
    const m = readFileSync(".sandcastle/main.mts", "utf8")
      .replace('process.env.SC_PKG_DIR || "."', 'process.env.SC_PKG_DIR || "web"');
    writeFileSync(".sandcastle/main.mts", m);
  }
  copyFileSync(`${stackDir}/sandcastle-prompt.md`, ".sandcastle/prompt.md");
  copyFileSync(`${stackDir}/sandcastle-doctor.mjs`, ".sandcastle/doctor.mjs");
  mkdirSync(".github/workflows", { recursive: true });
  // ci.yml is written by writeCiGate() for every project, sandcastle or not.

  // 0.10.0 scaffold ships an npm-only Dockerfile; the container needs the project's real toolchain.
  if (a.sandcastle.mode === "docker" && existsSync(".sandcastle/Dockerfile")) {
    let df = readFileSync(".sandcastle/Dockerfile", "utf8");
    const setup = a.language === "typescript"
      ? (df.includes("corepack prepare pnpm") ? null
        : `ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0\nRUN corepack enable && corepack prepare pnpm@${pnpmV} --activate\n`)
      : (/astral-sh\/uv/.test(df) ? null
        : `COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/\n`);
    if (setup) {
      df = df.includes("\nUSER ") ? df.replace(/\nUSER /, `\n${setup}\nUSER `) : df + `\n${setup}`;
      writeFileSync(".sandcastle/Dockerfile", df);
    }
    df = readFileSync(".sandcastle/Dockerfile", "utf8");
    if (/npm install/.test(df)) log("WARNING: .sandcastle/Dockerfile still contains an `npm install` hook — replace with the project's package manager.");
  }
  log("sandcastle wired. REMAINING (secrets, can't be scripted): fill .sandcastle/.env — CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`) or ANTHROPIC_API_KEY, plus GH_TOKEN (`gh auth token`). Build the image with `npx @ai-hero/sandcastle docker build-image` or let the doctor do it.");
}

// ---------------------------------------------------------------- finalize + cleanup
// Org overlay (Q3 answers): license, ownership, PR/issue templates, dependency scanning.
function dropOrgFiles(a) {
  const year = new Date().getFullYear();
  const LICENSE_TEXT = {
    proprietary:
`Copyright (c) ${year} ${a.org}. All rights reserved.

This software is proprietary. No license, express or implied, is granted to any
party for any use, reproduction, modification, or distribution without prior
written permission from the copyright holder.
`,
    mit:
`MIT License

Copyright (c) ${year} ${a.org}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  };
  // license "none" ships no LICENSE file (project is unlicensed / owner decides later).
  if (a.license !== "none" && !existsSync("LICENSE"))
    writeFileSync("LICENSE", LICENSE_TEXT[a.license]);
  mkdirSync(".github/ISSUE_TEMPLATE", { recursive: true });
  if (!existsSync(".github/CODEOWNERS")) writeFileSync(".github/CODEOWNERS", `* @${a.org}\n`);
  if (!existsSync(".github/pull_request_template.md"))
    writeFileSync(".github/pull_request_template.md",
`## What

## Why

## Verification

- [ ] Feedback loops green locally (typecheck/lint + tests + build)
- [ ] Closes #<issue>
`);
  if (!existsSync(".github/ISSUE_TEMPLATE/task.md"))
    writeFileSync(".github/ISSUE_TEMPLATE/task.md",
`---
name: Task
about: A vertical slice of work (tracer bullet)
labels: []
---

## What to build

## Acceptance criteria

- [ ]

## Blocked by

None - can start immediately
`);
  // dependabot: ecosystems per stack + actions
  const eco = [];
  const npmDir = a.language === "both" ? "/web" : a.dir === "." ? "/" : `/${a.dir}`;
  const pipDir = a.language === "both" ? "/api" : a.dir === "." ? "/" : `/${a.dir}`;
  if (a.language !== "python") eco.push(`  - package-ecosystem: npm\n    directory: "${npmDir}"\n    schedule:\n      interval: weekly`);
  if (a.language !== "typescript") eco.push(`  - package-ecosystem: uv\n    directory: "${pipDir}"\n    schedule:\n      interval: weekly`);
  eco.push(`  - package-ecosystem: github-actions\n    directory: "/"\n    schedule:\n      interval: weekly`);
  writeFileSync(".github/dependabot.yml", `version: 2\nupdates:\n${eco.join("\n")}\n`);
  // CodeQL — requires a public repo or GitHub Advanced Security on private; delete if neither.
  const langs = a.language === "both" ? ["javascript-typescript", "python"]
    : a.language === "typescript" ? ["javascript-typescript"] : ["python"];
  mkdirSync(".github/workflows", { recursive: true });
  writeFileSync(".github/workflows/codeql.yml",
`# CodeQL static analysis. NOTE: free on public repos; private repos need GitHub Advanced
# Security — if this workflow errors with a licensing message, delete it.
name: codeql
on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "0 4 * * 1"
permissions:
  security-events: write
  contents: read
jobs:
  analyze:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        language: [${langs.join(", ")}]
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: \${{ matrix.language }}
      - uses: github/codeql-action/analyze@v3
`);
  log(`org overlay written (LICENSE ${a.license === "none" ? "omitted" : `${a.license}/${a.org}`}, CODEOWNERS @${a.org}, PR/issue templates, dependabot, codeql).`);
}

function templateStamp() {
  let version = null, commit = null;
  try {
    const cl = readFileSync("CHANGELOG.md", "utf8");
    version = (cl.match(/^## \[([\d.]+)\]/m) || [])[1] || null;
    // Commit comes from a COMMITTED marker the release process fills (scripts/stamp-release.mjs),
    // NOT `git rev-parse HEAD`. init runs inside the generated project, whose HEAD is never a
    // template revision — degit strips history, and "Use this template" mints a fresh initial
    // commit — so stamping it would make the README upgrade-diff reference a commit that does
    // not exist on the template. An unstamped marker (all zeros / absent) → null, never a guess.
    const m = cl.match(/template-commit:\s*([0-9a-f]{7,40})/);
    commit = m && !/^0+$/.test(m[1]) ? m[1] : null;
  } catch {}
  return { version, commit };
}

function finalize(a, answersPath) {
  dropOrgFiles(a);
  const cfg = {};
  for (const f of ANSWER_FIELDS) cfg[f] = a[f];
  const stamp = templateStamp();
  cfg.templateVersion = stamp.version;
  cfg.templateCommit = stamp.commit;
  writeJson("template.config.json", cfg);

  // README "How to run"
  if (existsSync("README.md")) {
    const cmds = a.language === "both"
      ? "- **web/**: `pnpm install` · `pnpm test` · `pnpm run typecheck` · `pnpm run build`\n- **api/**: `uv sync` · `uv run pytest` · `uv run ruff check .` · `uv run mypy src`"
      : a.language === "typescript"
      ? "- `pnpm install` · `pnpm test` · `pnpm run typecheck` · `pnpm run build`"
      : "- `uv sync` · `uv run pytest` · `uv run ruff check .` · `uv run mypy src`";
    let readme = readFileSync("README.md", "utf8")
      .replace(/> _Filled in by `init-project`[^\n]*\n(>[^\n]*\n)*/m, `${cmds}\n`);
    // dev-browser only matters to UI-facing stacks; drop its prerequisite for headless projects.
    if (!isUiStack(a))
      readme = readme.replace(/## Prerequisites\n\n```bash\nnpm install -g dev-browser\ndev-browser install\n```\n\n/, "");
    writeFileSync("README.md", readme);
  }
  // Likewise strip the CLAUDE.md browser-automation section for headless stacks.
  if (!isUiStack(a) && existsSync("CLAUDE.md")) {
    const md = readFileSync("CLAUDE.md", "utf8").replace(/\n## Browser automation\n[\s\S]*$/m, "\n");
    writeFileSync("CLAUDE.md", md);
  }
  log(`wrote template.config.json. Answers file kept at ${answersPath} until --cleanup.`);
  log("NEXT (agent): author .claude/skills/coding-standards/ per coding-standards-guidance.md, then run: node scripts/init.mjs " + answersPath + " --cleanup");
}

function selfCheck(a) {
  log("self-check: running the project's feedback loops…");
  const ts = (dir) => { run(`pnpm run typecheck`, { cwd: dir }); run(`pnpm run test`, { cwd: dir }); run(`pnpm run build`, { cwd: dir }); };
  const py = (dir) => { run(`uv run ruff check .`, { cwd: dir }); run(`uv run mypy src`, { cwd: dir }); run(`uv run pytest`, { cwd: dir }); };
  if (a.language === "both") { ts("web"); py("api"); }
  else if (a.language === "typescript") ts(a.dir);
  else py(a.dir);
  if (!existsSync(".claude/skills/coding-standards/SKILL.md"))
    die("coding-standards skill missing — author it before --cleanup (see coding-standards-guidance.md).");
  if (a.skillLocation === "project") {
    const missing = missingSkills();
    if (missing.length)
      die(`workflow skills missing: ${missing.join(", ")} — re-run the \`npx skills add\` installs (see installSkills in this script) before --cleanup self-removes the retry path.`);
  }
  log("self-check PASSED");
}

function cleanup(a, answersPath) {
  selfCheck(a);
  for (const p of [".claude/skills/init-project", "templates", "template.config.example.json", "TEMPLATE-IMPROVEMENTS.md", "CHANGELOG.md", "docs/superpowers", answersPath, "scripts/init.mjs", "scripts/validate-template.mjs", "scripts/stamp-release.mjs"]) {
    rmSync(p, { recursive: true, force: true });
    log(`removed ${p}`);
  }
  // the template's own CI validates template structure; a generated project doesn't have it
  rmSync(".github/workflows/template-ci.yml", { force: true });
  if (existsSync("CLAUDE.md")) {
    const md = readFileSync("CLAUDE.md", "utf8").replace(/> \*\*New project\?\*\*[\s\S]*?After init, delete this note\.\n*/m, "");
    writeFileSync("CLAUDE.md", md);
  }
  log("cleanup done — init cannot run again. Commit the result.");
}

// init is a ONE-TIME bootstrap and is NOT transactional (a scaffolder can fail partway on a
// network hiccup). Refuse to run over a completed or partial prior run rather than mutating
// existing state via the scattered existsSync guards (B3.2). INIT_FORCE=1 overrides for a
// deliberate in-place resume (the scaffolders are individually idempotent).
function assertCleanForInit(a) {
  const found = [];
  if (existsSync("template.config.json")) found.push("template.config.json — a previous init completed finalize()");
  if (existsSync(".sandcastle")) found.push(".sandcastle/ — sandcastle already wired");
  if (existsSync("LICENSE")) found.push("LICENSE — org overlay already dropped");
  if (existsSync(".github/workflows/ci.yml")) found.push(".github/workflows/ci.yml — CI gate already written");
  if (a.language === "both") {
    if (existsSync("web/package.json")) found.push("web/package.json — web/ already scaffolded");
    if (existsSync("api/pyproject.toml")) found.push("api/pyproject.toml — api/ already scaffolded");
  } else {
    const marker = a.language === "python" ? "pyproject.toml" : "package.json";
    if (existsSync(join(a.dir, marker))) found.push(`${join(a.dir, marker)} — project already scaffolded`);
  }
  if (found.length && process.env.INIT_FORCE !== "1")
    die(`init looks already-run or partially-run — found:\n  - ${found.join("\n  - ")}\n\n` +
        `init is a one-time bootstrap. Reset with a fresh template clone (or \`git checkout . && git clean -fdx\`), then re-run.\n` +
        `To resume a genuinely partial run IN PLACE, re-run with INIT_FORCE=1 after reviewing the artifacts above.`);
}

// ---------------------------------------------------------------- main
function main() {
  const [answersPath, flag] = process.argv.slice(2);
  const a = loadAnswers(answersPath);
  if (flag === "--cleanup") return cleanup(a, answersPath);
  assertCleanForInit(a);

  log(`stack: ${a.language}/${a.projectType} → ${a.dir === "." ? "repo root" : a.dir + "/"}`);
  if (a.language === "both") {
    scaffoldBoth(a);
  } else if (a.language === "typescript") {
    if (a.projectType === "library") scaffoldTsLibrary(a);
    else scaffoldTsApp(a);
  } else {
    scaffoldPython(a);
  }
  writeCiGate(a);
  writeAuditWorkflow(a);
  installSkills(a);
  setupSandcastle(a);
  finalize(a, answersPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
