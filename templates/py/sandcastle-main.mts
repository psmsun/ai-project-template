/**
 * Sandcastle AFK runner — PR-per-issue loop (backlog A2 + A3), Python/uv variant.
 *
 * Identical loop to templates/ts/sandcastle-main.mts; only the sandbox install hook differs
 * (`uv sync` instead of the pnpm install/approve-builds dance — uv has no native-build
 * approval step). The RUNNER itself is still Node (tsx + @ai-hero/sandcastle at the repo root).
 *
 * The loop, NOT merge-to-head:
 *   fetch → pick the next open AFK issue (priority label, then number) → run the agent on that
 *   ONE issue on its own branch → host pushes the branch, opens a PR "Closes #N", enables
 *   auto-merge → GitHub's CI gate (A3) merges it when green → "issue closed" ⇔ "green code on main".
 *
 * Config via env: SC_PKG_DIR (default "."), SC_MODEL, SC_MAX_ISSUES (safety cap),
 * SC_MERGE_TIMEOUT_S (how long to wait for a PR's CI+merge before moving on).
 */
import { run, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PKG_DIR = process.env.SC_PKG_DIR || ".";
const MODEL = process.env.SC_MODEL || "claude-opus-4-8";
const MAX_ISSUES = Number(process.env.SC_MAX_ISSUES || 20);
const MERGE_TIMEOUT_S = Number(process.env.SC_MERGE_TIMEOUT_S || 600);

const sh = (c: string) => execSync(c, { stdio: "inherit" });
const out = (c: string) => execSync(c, { encoding: "utf8" }).trim();
const sleep = (s: number) => execSync(`sleep ${s}`);

// Priority by label (lower = sooner); unlabeled issues sort after, then by number.
const PRIORITY = ["bug", "infra", "tracer", "polish", "refactor"];
const prio = (i: { labels: { name: string }[] }) => {
  const idx = i.labels.map((l) => l.name).reduce((m, n) => Math.min(m, PRIORITY.indexOf(n) < 0 ? 99 : PRIORITY.indexOf(n)), 99);
  return idx;
};

// Pre-flight: re-check & auto-fix the environment (runtime, uv project, Dockerfile, image, .env).
execSync("node .sandcastle/doctor.mjs", { stdio: "inherit", env: { ...process.env, SC_PKG_DIR: PKG_DIR } });

const promptTemplate = readFileSync("./.sandcastle/prompt.md", "utf8");
const seen = new Set<number>(); // issues we've already attempted this run (don't re-pick a stuck one)

type Issue = { number: number; title: string; body: string; labels: { name: string }[] };

function nextIssue(): Issue | null {
  sh("git fetch -q origin");
  const all: Issue[] = JSON.parse(out(`gh issue list --state open --json number,title,body,labels --limit 200`));
  const afk = all
    .filter((i) => !i.labels.some((l) => l.name.toUpperCase() === "HITL"))
    .filter((i) => !seen.has(i.number));
  if (!afk.length) return null;
  afk.sort((a, b) => prio(a) - prio(b) || a.number - b.number);
  return afk[0];
}

// The runner IS the CI gate (works on any plan — branch protection is a paid feature on private
// repos). Poll the PR's checks; merge only when ALL pass. Red/blocked → leave the PR open.
function gateAndMerge(prNumber: string, issue: number): "merged" | "open" {
  const start = Date.now();
  let sawChecks = false;
  while ((Date.now() - start) / 1000 < MERGE_TIMEOUT_S) {
    // bucket ∈ {pass, fail, pending, skipping, cancel}; empty until CI registers.
    let checks: { bucket: string }[] = [];
    try { checks = JSON.parse(out(`gh pr checks ${prNumber} --json bucket 2>/dev/null || echo '[]'`)); } catch { checks = []; }
    if (checks.length) {
      sawChecks = true;
      const pending = checks.some((c) => c.bucket === "pending");
      const failed = checks.some((c) => c.bucket === "fail" || c.bucket === "cancel");
      if (failed) {
        console.log(`   ✗ CI red on PR #${prNumber} (issue #${issue}) — leaving it open for review.`);
        return "open";
      }
      if (!pending) {
        // No --delete-branch: the per-issue branch is checked out in the sandcastle worktree, so
        // gh's local-branch delete fails and returns non-zero even though the merge succeeded.
        // Merge, then trust the PR's actual state — not gh's exit code.
        try { execSync(`gh pr merge ${prNumber} --squash`, { stdio: "inherit" }); } catch { /* verify below */ }
        const merged = out(`gh pr view ${prNumber} --json state --jq .state`) === "MERGED";
        if (merged) { out(`git push origin --delete sc/issue-${issue} 2>/dev/null || true`); return "merged"; }
        console.log(`   ✗ merge of PR #${prNumber} did not take — leaving it open.`);
        return "open";
      }
    }
    sleep(15);
  }
  console.log(`   ⏱ PR #${prNumber} (issue #${issue}) checks ${sawChecks ? "still pending" : "never reported"} after ${MERGE_TIMEOUT_S}s — leaving open.`);
  return "open";
}

let processed = 0;
while (processed < MAX_ISSUES) {
  const issue = nextIssue();
  if (!issue) {
    console.log("\n✅ No more open AFK issues. Loop complete.\n");
    break;
  }
  seen.add(issue.number);
  processed++;
  const branch = `sc/issue-${issue.number}`;
  console.log(`\n▶ Issue #${issue.number}: ${issue.title}  →  branch ${branch}\n`);

  // Fill the prompt with THIS single assigned issue and run one agent iteration on its own branch.
  const prompt = promptTemplate.replace("<<ISSUE_JSON>>", JSON.stringify(issue, null, 2));
  writeFileSync("./.sandcastle/.prompt.effective.md", prompt);

  try {
    await run({
      name: `issue-${issue.number}`,
      sandbox: docker(),
      agent: claudeCode(MODEL),
      promptFile: "./.sandcastle/.prompt.effective.md",
      maxIterations: 1,
      // No merge-to-head: land commits on a per-issue branch cut from the freshly-fetched main.
      branchStrategy: { type: "branch", branch, baseBranch: "origin/main" },
      // No node_modules to copy; a venv is NOT relocatable across worktree paths — the hook
      // rebuilds it from uv.lock (fast: uv's cache is warm after the first issue).
      copyToWorktree: [],
      hooks: {
        sandbox: {
          onSandboxReady: [{ command: `cd ${PKG_DIR} && uv sync` }],
        },
      },
    });

    // Host owns delivery: push the branch, open the PR (Closes #N), enable auto-merge.
    // If the agent produced no commits, there's nothing to push — skip and leave the issue open.
    const ahead = out(`git rev-list --count origin/main..${branch} 2>/dev/null || echo 0`);
    if (ahead === "0") {
      console.log(`⚠ Issue #${issue.number}: no commits on ${branch} — skipping PR (left open for review).`);
      continue;
    }
    sh(`git push -u origin ${branch} --force-with-lease`);
    // Open the PR (Closes #N makes the close atomic — the issue closes iff the PR merges).
    out(
      `gh pr create --head ${branch} --base main ` +
        `--title ${JSON.stringify(issue.title)} ` +
        `--body ${JSON.stringify(`Closes #${issue.number}\n\nAutomated by the sandcastle AFK runner.`)} 2>/dev/null || true`,
    );
    const prNumber = out(`gh pr view ${branch} --json number --jq .number`);
    const result = gateAndMerge(prNumber, issue.number); // runner enforces CI green before merge
    console.log(`   issue #${issue.number}: PR #${prNumber} → ${result}`);
  } catch (err) {
    console.error(`✗ Issue #${issue.number} failed this iteration — leaving it open, continuing.`, (err as Error).message);
  }
}

if (processed >= MAX_ISSUES) console.log(`\nReached SC_MAX_ISSUES=${MAX_ISSUES} cap — stopping.\n`);
