import { gh } from "./github";
import { parseMarkers } from "./body";

export type Progress = {
  runs: { name: string; status: string; conclusion: string | null; url: string; startedAt: string; event: string }[];
  claude: { text: string; url: string; updatedAt: string } | null;
  pr: {
    number: number; url: string; state: "open" | "merged" | "closed"; draft: boolean;
    commits: number; files: number; additions: number; deletions: number;
    checks: { name: string; status: string; conclusion: string | null; url: string }[];
  } | null;
};

/**
 * Where Claude Code is on a card, from GitHub: kban-claude workflow runs for the issue,
 * the progress comment claude-code-action keeps updating on the issue, and the PR with its checks.
 */
export async function cardProgress(token: string, full: string, number: number): Promise<Progress> {
  const [owner, repo] = full.split("/");
  const o = gh(token);
  const { data: issue } = await o.issues.get({ owner, repo, issue_number: number });
  const prNo = Number(/\/pull\/(\d+)/.exec(parseMarkers(issue.body).pr || "")?.[1]);

  const [runs, comments, pr] = await Promise.all([
    o.actions.listWorkflowRuns({ owner, repo, workflow_id: "kban-claude.yml", per_page: 30 })
      .then((r) => r.data.workflow_runs).catch(() => []),
    o.issues.listComments({ owner, repo, issue_number: number, per_page: 100 }).then((r) => r.data).catch(() => []),
    Number.isFinite(prNo) ? o.pulls.get({ owner, repo, pull_number: prNo }).then((r) => r.data).catch(() => null) : Promise.resolve(null),
  ]);

  const mine = runs.filter((r) => r.display_title === issue.title || (pr && r.head_branch === pr.head.ref)).slice(0, 4);
  const bot = comments.filter((c) => /claude/i.test(c.user?.login || "") && c.user?.type === "Bot").pop();

  let checks: NonNullable<Progress["pr"]>["checks"] = [];
  if (pr) {
    checks = await o.checks.listForRef({ owner, repo, ref: pr.head.sha, per_page: 30 })
      .then((r) => r.data.check_runs.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url || "" })))
      .catch(() => []);
  }
  return {
    runs: mine.map((r) => ({ name: r.name || "kban-claude", status: r.status || "", conclusion: r.conclusion, url: r.html_url, startedAt: r.run_started_at || r.created_at, event: r.event })),
    claude: bot ? { text: (bot.body || "").replace(/<!--[\s\S]*?-->/g, "").trim().slice(0, 2000), url: bot.html_url, updatedAt: bot.updated_at } : null,
    pr: pr ? {
      number: pr.number, url: pr.html_url, state: pr.merged ? "merged" : pr.state === "open" ? "open" : "closed", draft: !!pr.draft,
      commits: pr.commits, files: pr.changed_files, additions: pr.additions, deletions: pr.deletions, checks,
    } : null,
  };
}
