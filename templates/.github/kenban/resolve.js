// Shared by kenban workflows (actions/github-script).
// Finds the kenban issue behind a PR / commit and moves its kenban:<stage> label forward.
const ORDER = ["idea", "spec", "queued", "building", "testing", "deploying", "verifying", "done"];

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
  if (!n) return core.info(`PR #${pr.number} に kenban の Issue が紐付いていません`);
  return moveIssue({ github, context, core }, n, stage, marker);
}

async function moveIssue({ github, context, core }, n, stage, marker) {
  const { owner, repo } = context.repo;
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: n });
  const names = issue.labels.map((l) => (typeof l === "string" ? l : l.name));
  if (!names.includes("kenban")) return core.info(`#${n} は kenban のカードではありません`);
  const cur = Math.max(0, ...names.map((l) => ORDER.indexOf(String(l).replace(/^kenban:/, ""))));
  if (ORDER.indexOf(stage) <= cur) return core.info(`#${n} はすでに ${ORDER[cur]} です`);

  const labels = names.filter((l) => !ORDER.some((s) => l === `kenban:${s}`)).concat(`kenban:${stage}`);
  let body = issue.body || "";
  if (marker) {
    body = body.replace(new RegExp(`\\n?<!-- kenban:${marker.key}=.*? -->`, "g"), "");
    body += `\n<!-- kenban:${marker.key}=${marker.value} -->`;
  }
  await github.rest.issues.update({ owner, repo, issue_number: n, labels, body });
  core.info(`#${n}: ${ORDER[cur]} → ${stage}`);
  return n;
}

module.exports = { linkedIssue, prFromSha, moveFromPr, moveIssue, ORDER };
