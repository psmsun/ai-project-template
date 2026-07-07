#!/usr/bin/env node
/**
 * Release-time stamp: write the current git HEAD into CHANGELOG.md's `template-commit:` marker.
 *
 * Run this in the TEMPLATE repo when cutting a release, then commit CHANGELOG.md:
 *
 *   node scripts/stamp-release.mjs
 *   git commit -am "release: vX.Y.Z"
 *
 * `init` reads this marker (never the generated project's git HEAD, which is not a template
 * revision) and records it as `templateCommit` in each generated project's template.config.json,
 * so the README upgrade-diff always references a real, diffable commit on the template's main.
 *
 * The stamp points at HEAD at stamp time — i.e. the parent of the release commit you make next.
 * That is intentional and diffable; do not try to make it self-referential.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const cl = readFileSync("CHANGELOG.md", "utf8");
if (!/template-commit:\s*[0-9a-f]*/.test(cl)) {
  console.error("CHANGELOG.md: no `template-commit:` marker to stamp — add one (see the header comment).");
  process.exit(1);
}
writeFileSync("CHANGELOG.md", cl.replace(/template-commit:\s*[0-9a-f]*/, `template-commit: ${head}`));
console.log(`stamped template-commit: ${head}\nNow commit CHANGELOG.md as the release commit.`);
