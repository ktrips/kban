// Shared by kban workflows (actions/github-script).
// Finds the kban issue behind a PR / commit and moves its kban:<stage> label forward.
const ORDER = ["backlog", "ready", "building", "testing", "deploying", "verifying", "done"];

function linkedIssue(body, branch) {
  const m = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(body || "");
  if (m) return Number(m[1]);
  const b = /issue-(\d+)/.exec(branch || "");
  return b ? Number(b[1]) : null;
}

async function prFromSha({ github, context }, sha) {
  const { owner, repo } = context.repo;
  const { data } = await github.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha: sha });
  return data.find((p) => p.state === "open") || data[0] || null;
}

/** Move the issue linked to `pr` to `stage` (forward only, except explicit backward moves by the board). */
async function moveFromPr({ github, context, core }, pr, stage, marker) {
  if (!pr) return core.info("PR が見つかりません");
  const n = linkedIssue(pr.body, pr.head && pr.head.ref);
  if (!n) return core.info(`PR #${pr.number} に kban の Issue が紐付いていません`);
  return moveIssue({ github, context, core }, n, stage, marker);
}

async function moveIssue({ github, context, core }, n, stage, marker) {
  const { owner, repo } = context.repo;
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: n });
  const names = issue.labels.map((l) => (typeof l === "string" ? l : l.name));
  if (!names.includes("kban")) return core.info(`#${n} は kban のカードではありません`);
  const cur = Math.max(0, ...names.map((l) => ORDER.indexOf(String(l).replace(/^kban:/, ""))));
  if (ORDER.indexOf(stage) <= cur) return core.info(`#${n} はすでに ${ORDER[cur]} です`);

  const labels = names.filter((l) => !ORDER.some((s) => l === `kban:${s}`)).concat(`kban:${stage}`);
  let body = issue.body || "";
  if (marker) {
    body = body.replace(new RegExp(`\\n?<!-- kban:${marker.key}=.*? -->`, "g"), "");
    body += `\n<!-- kban:${marker.key}=${marker.value} -->`;
  }
  await github.rest.issues.update({ owner, repo, issue_number: n, labels, body });
  core.info(`#${n}: ${ORDER[cur]} → ${stage}`);
  return n;
}

/**
 * Add what Claude Code just used to the card (<!-- kban:tokens=… --> / cost). `file` is claude-code-action's
 * execution_file: a JSON array (or JSON lines) of messages whose last `result` has usage and total_cost_usd.
 * tokens = input + output + cache creation (cache reads are cheap and left out).
 */
async function recordUsage({ github, context, core }, file) {
  const fs = require("fs");
  if (!file || !fs.existsSync(file)) return core.info("実行ログがないので使用量は記録しません");
  const raw = fs.readFileSync(file, "utf8");
  let msgs;
  try { msgs = JSON.parse(raw); } catch { msgs = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
  const r = [].concat(msgs).reverse().find((m) => m && m.type === "result");
  if (!r || !r.usage) return core.info("結果に使用量がありません");
  const u = r.usage;
  const tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const cost = Number(r.total_cost_usd || 0);

  const { owner, repo } = context.repo;
  let n = context.issue && context.issue.number;
  if (context.eventName === "pull_request_review_comment" || (context.payload.issue && context.payload.issue.pull_request)) {
    const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: n });
    n = linkedIssue(pr.body, pr.head.ref);
  }
  if (!n) return core.info("紐付く Issue がないので使用量は記録しません");
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: n });
  const get = (k) => Number((new RegExp(`<!-- kban:${k}=(.*?) -->`).exec(issue.body || "") || [])[1]) || 0;
  let body = (issue.body || "").replace(/\n?<!-- kban:(tokens|cost)=.*? -->/g, "");
  body += `\n<!-- kban:tokens=${get("tokens") + tokens} -->\n<!-- kban:cost=${(get("cost") + cost).toFixed(2)} -->`;
  await github.rest.issues.update({ owner, repo, issue_number: n, body });
  core.info(`#${n}: +${tokens} tokens, +$${cost.toFixed(2)}`);
}

module.exports = { recordUsage, linkedIssue, prFromSha, moveFromPr, moveIssue, ORDER };
