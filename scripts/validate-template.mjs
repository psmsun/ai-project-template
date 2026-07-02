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
const REQUIRED_TEMPLATE_FILES = ["ci.yml", "sandcastle-prompt.md", "sandcastle-doctor.mjs", "sandcastle-main.mts"];
for (const stack of readdirSync("templates")) {
  const dir = join("templates", stack);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of REQUIRED_TEMPLATE_FILES) {
    if (!existsSync(join(dir, f))) errors.push(`${dir}: missing required template file ${f}`);
  }
  ok(`templates/${stack} structure`);
}

// 4. JS templates parse.
for (const stack of readdirSync("templates")) {
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

if (errors.length) {
  console.error(`\nFAIL (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nTemplate validation PASSED");
