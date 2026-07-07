#!/usr/bin/env node
/**
 * Template self-check: run locally (`node scripts/validate-template.mjs`) and in CI.
 * Validates skills, templates, and config examples without needing any toolchain installed.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const errors = [];
const ok = (msg) => console.log(`  ok: ${msg}`);

// 1. Every skill has a SKILL.md with name + description frontmatter.
const skillsDir = ".claude/skills";
for (const skill of readdirSync(skillsDir)) {
  const dir = join(skillsDir, skill);
  if (!statSync(dir).isDirectory()) continue;
  const md = join(dir, "SKILL.md");
  if (!existsSync(md)) { errors.push(`${dir}: missing SKILL.md`); continue; }
  const src = readFileSync(md, "utf8");
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { errors.push(`${md}: missing frontmatter`); continue; }
  for (const field of ["name:", "description:"]) {
    if (!fm[1].includes(field)) errors.push(`${md}: frontmatter missing ${field.slice(0, -1)}`);
  }
  // 2. Markdown links to local files inside the skill dir must resolve.
  //    (fenced code blocks are example content, not real links)
  const prose = src.replace(/^```[\s\S]*?^```/gm, "");
  for (const m of prose.matchAll(/\]\((?!https?:|#)([^)\s]+)\)/g)) {
    const target = join(dir, m[1]);
    if (!existsSync(target)) errors.push(`${md}: broken local link → ${m[1]}`);
  }
  ok(`skill ${skill}`);
}

// 3. Every stack dir under templates/ carries the same required file roles.
const STACKS = ["ts", "py"];
const REQUIRED_TEMPLATE_FILES = ["ci.yml", "audit.yml", "sandcastle-prompt.md", "sandcastle-doctor.mjs", "sandcastle-main.mts"];
for (const stack of STACKS) {
  const dir = join("templates", stack);
  if (!existsSync(dir)) { errors.push(`missing stack dir ${dir}`); continue; }
  for (const f of REQUIRED_TEMPLATE_FILES) {
    if (!existsSync(join(dir, f))) errors.push(`${dir}: missing required template file ${f}`);
  }
  ok(`templates/${stack} structure`);
}

// 4. JS templates parse.
for (const stack of STACKS) {
  const f = join("templates", stack, "sandcastle-doctor.mjs");
  if (!existsSync(f)) continue; // absence already reported by check 3
  try { execSync(`node --check ${f}`, { stdio: "pipe" }); ok(`${f} parses`); }
  catch (e) { errors.push(`${f}: syntax error\n${e.stderr}`); }
}

// 5. Config example is valid JSON with the documented fields.
try {
  const cfg = JSON.parse(readFileSync("template.config.example.json", "utf8"));
  for (const field of ["language", "projectType", "packageManager", "sandcastle"]) {
    if (!(field in cfg)) errors.push(`template.config.example.json: missing field ${field}`);
  }
  ok("template.config.example.json");
} catch (e) { errors.push(`template.config.example.json: ${e.message}`); }

// 6. init.mjs parses and its answers schema matches the config example exactly.
try {
  execSync("node --check scripts/init.mjs", { stdio: "pipe" });
  const { ANSWER_FIELDS, STAMPED_FIELDS } = await import(new URL("./init.mjs", import.meta.url));
  const cfg = JSON.parse(readFileSync("template.config.example.json", "utf8"));
  for (const f of ANSWER_FIELDS) if (!(f in cfg)) errors.push(`init.mjs expects answers field '${f}' missing from template.config.example.json`);
  const known = [...ANSWER_FIELDS, ...STAMPED_FIELDS];
  for (const f of Object.keys(cfg)) {
    if (f.startsWith("_")) continue; // _comment etc.
    if (!known.includes(f)) errors.push(`template.config.example.json field '${f}' unknown to init.mjs ANSWER_FIELDS/STAMPED_FIELDS`);
  }
  ok("scripts/init.mjs (parse + answers schema)");
} catch (e) { errors.push(`scripts/init.mjs: ${e.message}`); }

// 7. CHANGELOG: top entry must be a parseable version + carry the template-commit marker
//    (init stamps both into generated projects; the marker must never be dropped).
try {
  const cl = readFileSync("CHANGELOG.md", "utf8");
  const top = (cl.match(/^## \[([\d.]+)\]/m) || [])[1];
  if (!top) errors.push("CHANGELOG.md: no '## [x.y.z]' entry at top — init cannot stamp templateVersion");
  else ok(`CHANGELOG current version ${top}`);
  if (!/template-commit:\s*[0-9a-f]*/.test(cl))
    errors.push("CHANGELOG.md: missing `template-commit:` marker — run scripts/stamp-release.mjs (init reads it for templateCommit)");
  else ok("CHANGELOG template-commit marker present");
} catch { errors.push("CHANGELOG.md missing"); }

// 8. The generated workflows are valid YAML — the stack templates AND the synthesized mixed-stack
//    ci.yml/audit.yml (the assembler that used to string-splice, B3.1). Parsed with python3+PyYAML
//    (present on GitHub runners; #29 guarantees it in template-ci). If the toolchain is absent we
//    WARN rather than silently pass — never report coverage we didn't run.
function yamlVerdict(text) {
  try {
    execSync('python3 -c "import sys,yaml; yaml.safe_load(sys.stdin.read())"',
      { input: text, stdio: ["pipe", "ignore", "pipe"] });
    return { ok: true };
  } catch (e) {
    const msg = String(e.stderr || e.message || "");
    if (e.code === "ENOENT" || /No module named 'yaml'|not found/.test(msg)) return { unavailable: true };
    return { ok: false, msg: msg.split("\n").filter(Boolean).pop() || "parse error" };
  }
}
try {
  const targets = [];
  for (const stack of STACKS) for (const wf of ["ci.yml", "audit.yml"]) {
    const f = join("templates", stack, wf);
    if (existsSync(f)) targets.push([f, readFileSync(f, "utf8")]);
  }
  try {
    const { buildMixedWorkflows } = await import(new URL("./init.mjs", import.meta.url));
    const m = buildMixedWorkflows();
    targets.push(["<synthesized mixed ci.yml>", m.ci], ["<synthesized mixed audit.yml>", m.audit]);
  } catch (e) { errors.push(`mixed-stack workflow assembly threw: ${e.message}`); }

  let unavailable = false;
  for (const [label, text] of targets) {
    const v = yamlVerdict(text);
    if (v.unavailable) { unavailable = true; break; }
    if (v.ok) ok(`${label} valid YAML`);
    else errors.push(`${label}: invalid YAML — ${v.msg}`);
  }
  if (unavailable) {
    const msg = "python3+PyYAML unavailable — skipped workflow YAML validation";
    // template-ci sets VALIDATE_STRICT=1 so a missing toolchain fails CI instead of silently
    // passing; local runs without PyYAML just warn.
    if (process.env.VALIDATE_STRICT === "1") errors.push(`${msg} (VALIDATE_STRICT=1 requires it)`);
    else console.log(`  warn: ${msg} (template-ci guarantees it)`);
  }
} catch (e) { errors.push(`workflow YAML check failed: ${e.message}`); }

// 9. The sandcastle runners are valid TypeScript-syntax .mts. node --check (check 4) can't parse
//    TS, so use esbuild's transform when importable. The template repo is toolchain-free, so this
//    runs in template-ci (which installs esbuild); VALIDATE_STRICT=1 makes its absence fail CI.
try {
  const mts = STACKS.map((s) => join("templates", s, "sandcastle-main.mts")).filter(existsSync);
  let esbuild = null;
  try { esbuild = await import("esbuild"); } catch {}
  if (esbuild) {
    for (const f of mts) {
      try { await esbuild.transform(readFileSync(f, "utf8"), { loader: "ts", format: "esm" }); ok(`${f} parses (esbuild)`); }
      catch (e) { errors.push(`${f}: TS syntax error — ${String(e.message).split("\n")[0]}`); }
    }
  } else if (process.env.VALIDATE_STRICT === "1") {
    errors.push("esbuild unavailable — skipped .mts syntax check (VALIDATE_STRICT=1 requires it)");
  } else {
    console.log("  warn: esbuild unavailable — skipped .mts syntax check (template-ci installs it)");
  }
} catch (e) { errors.push(`.mts syntax check failed: ${e.message}`); }

if (errors.length) {
  console.error(`\nFAIL (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nTemplate validation PASSED");
