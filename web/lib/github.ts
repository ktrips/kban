import { Octokit } from "@octokit/rest";
import { STAGE_IDS, StageId, Target, Size, stageFromLabels, stageLabel, targetFromLabels, sizeFromLabels } from "./stages";
import { parseBody, renderBody, parseMarkers, CardBody, Markers } from "./body";
import type { RepoSettings } from "./store";

export type GhRepo = { full: string; name: string; description: string; pushedAt?: string; private: boolean };
export type Card = CardBody & {
  id: string; // owner/repo#number
  repo: string;
  number: number;
  title: string;
  stage: StageId;
  target: Target;
  size: Size;
  rank: number;
  reason: string;
  parallel?: boolean;
  url: string;
  pr?: string;
  preview?: string;
  /** Claude Code が使った量(ワークフローが記録): input+output+cache作成 のトークンと概算USD */
  tokens?: number;
  cost?: number;
  createdAt: string;
  updatedAt: string;
};

const clients = new Map<string, Octokit>();
/** One Octokit per GitHub token (a board always acts with its owner's token). */
export function gh(token: string): Octokit {
  let c = clients.get(token);
  if (!c) { c = new Octokit({ auth: token, userAgent: "kban" }); clients.set(token, c); }
  return c;
}
const split = (full: string) => {
  const [owner, repo] = full.split("/");
  if (!owner || !repo) throw new Error(`owner/repo の形式ではありません: ${full}`);
  return { owner, repo };
};
const labelNames = (labels: (string | { name?: string })[]) =>
  labels.map((l) => (typeof l === "string" ? l : l.name || "")).filter(Boolean);

/* ---------------- repositories ---------------- */

const LABELS: [string, string, string][] = [
  ["kban", "18212B", "kban のカード"],
  ["claude", "D9480F", "Claude Code に実装を依頼"],
  ["kban:backlog", "8A94A3", "バックログ"],
  ["kban:ready", "5C7CFA", "次にやる"],
  ["kban:building", "AE3EC9", "AI実装中"],
  ["kban:testing", "B86E00", "テスト"],
  ["kban:deploying", "1C7ED6", "デプロイ"],
  ["kban:verifying", "0C8599", "確認"],
  ["kban:done", "2B8A3E", "完了"],
  ["kban:web", "868E96", "対象: Web"],
  ["kban:ios", "868E96", "対象: iOS"],
  ["kban:both", "868E96", "対象: iOS+Web"],
  ["kban:size-S", "ADB5BD", "サイズ S(半日)"],
  ["kban:size-M", "ADB5BD", "サイズ M(1〜2日)"],
  ["kban:size-L", "ADB5BD", "サイズ L(3日〜)"],
];

/** Repositories the linked GitHub account can push to, most recently pushed first. */
export async function listUserRepos(token: string): Promise<GhRepo[]> {
  const all = await gh(token).paginate(gh(token).repos.listForAuthenticatedUser, { per_page: 100, sort: "pushed" });
  return all
    .filter((r) => !r.archived && r.permissions?.push)
    .map((r) => ({ full: r.full_name, name: r.name, description: r.description || "", pushedAt: r.pushed_at || undefined, private: r.private }));
}

export async function githubLogin(token: string) {
  return (await gh(token).users.getAuthenticated()).data.login;
}

/** Invite someone to the repository on GitHub (push access). */
export async function inviteCollaborator(token: string, full: string, login: string) {
  const { owner, repo } = split(full);
  await gh(token).repos.addCollaborator({ owner, repo, username: login, permission: "push" });
}

/** Start using kban in a repo: create its labels. */
export async function ensureLabels(token: string, full: string) {
  const { owner, repo } = split(full);
  for (const [name, color, description] of LABELS) {
    try {
      await gh(token).issues.createLabel({ owner, repo, name, color, description });
    } catch (e) {
      if ((e as { status?: number }).status !== 422) throw e; // 422 = already exists
    }
  }
}

/* ---------------- cards ---------------- */

export async function listCards(token: string, repoInfo: RepoSettings): Promise<Card[]> {
  const full = repoInfo.full;
  const { owner, repo } = split(full);
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString();
  const [open, closed] = await Promise.all([
    gh(token).paginate(gh(token).issues.listForRepo, { owner, repo, labels: "kban", state: "open", per_page: 100 }),
    gh(token).paginate(gh(token).issues.listForRepo, { owner, repo, labels: "kban", state: "closed", since, per_page: 100 }),
  ]);
  return [...open, ...closed]
    .filter((i) => !i.pull_request && i.state_reason !== "not_planned")
    .map((i): Card => {
      const labels = labelNames(i.labels);
      const m = parseMarkers(i.body);
      return {
        ...parseBody(i.body),
        id: `${full}#${i.number}`,
        repo: full,
        number: i.number,
        title: i.title,
        stage: stageFromLabels(labels, i.state === "closed"),
        target: targetFromLabels(labels) || repoInfo.target || "web",
        size: sizeFromLabels(labels),
        rank: m.rank ?? 100000 + i.number,
        reason: m.reason || "",
        parallel: m.parallel,
        pr: m.pr,
        preview: m.preview,
        tokens: m.tokens,
        cost: m.cost,
        url: i.html_url,
        createdAt: i.created_at,
        updatedAt: i.updated_at,
      };
    });
}

export async function createCard(token: string, full: string, title: string, target: Target, rank: number, idea = title) {
  const { owner, repo } = split(full);
  const body = renderBody({ idea, spec: "", steps: [], criteria: [], dependsOn: [], prompt: "" }, { rank });
  const { data } = await gh(token).issues.create({
    owner, repo, title: title.slice(0, 120), body, labels: ["kban", stageLabel("backlog"), `kban:${target}`],
  });
  return data.number;
}

export type Patch = Partial<CardBody> & Partial<Pick<Markers, "rank" | "reason" | "parallel">> & {
  title?: string; stage?: StageId; size?: Size; target?: Target;
};

export async function updateCard(token: string, full: string, number: number, patch: Patch) {
  const { owner, repo } = split(full);
  const { data: issue } = await gh(token).issues.get({ owner, repo, issue_number: number });
  const update: Parameters<Octokit["issues"]["update"]>[0] = { owner, repo, issue_number: number };
  if (patch.title) update.title = patch.title.slice(0, 120);

  const bodyKeys = ["idea", "spec", "steps", "criteria", "dependsOn", "prompt", "rank", "reason", "parallel"] as const;
  if (bodyKeys.some((k) => patch[k] !== undefined)) {
    const cur = parseBody(issue.body);
    const marks = parseMarkers(issue.body);
    const pick = <T,>(v: T | undefined, d: T) => (v === undefined ? d : v);
    update.body = renderBody(
      {
        idea: pick(patch.idea, cur.idea), spec: pick(patch.spec, cur.spec), steps: pick(patch.steps, cur.steps),
        criteria: pick(patch.criteria, cur.criteria), dependsOn: pick(patch.dependsOn, cur.dependsOn), prompt: pick(patch.prompt, cur.prompt),
      },
      { ...marks, rank: pick(patch.rank, marks.rank), reason: pick(patch.reason, marks.reason), parallel: pick(patch.parallel, marks.parallel) },
    );
  }

  const before = labelNames(issue.labels);
  let labels = [...before];
  if (patch.stage) {
    labels = labels.filter((l) => !STAGE_IDS.some((s) => l === stageLabel(s)));
    labels.push(stageLabel(patch.stage));
    if (patch.stage === "done") update.state = "closed";
    else if (issue.state === "closed") update.state = "open";
    if (patch.stage === "backlog" || patch.stage === "ready") labels = labels.filter((l) => l !== "claude");
  }
  if (patch.size !== undefined) {
    labels = labels.filter((l) => !/^kban:size-/.test(l));
    if (patch.size) labels.push(`kban:size-${patch.size}`);
  }
  if (patch.target) {
    labels = labels.filter((l) => !/^kban:(web|ios|both)$/.test(l));
    labels.push(`kban:${patch.target}`);
  }
  if (labels.join() !== before.join()) update.labels = labels;
  await gh(token).issues.update(update);

  // Handing the card to AI = a fresh `claude` label event, which starts claude-code-action.
  if (patch.stage === "building" && !before.includes("claude")) {
    await gh(token).issues.addLabels({ owner, repo, issue_number: number, labels: ["claude"] });
  }
}

/** Renumber a list of issues (top = 1). Only touches issues whose rank changed. */
export async function setRanks(token: string, full: string, order: { number: number; rank: number }[], items?: { number: number; reason?: string; size?: Size; dependsOn?: number[]; parallel?: boolean }[]) {
  const extra = new Map((items || []).map((x) => [x.number, x]));
  for (const { number, rank } of order) {
    const x = extra.get(number);
    await updateCard(token, full, number, { rank, reason: x?.reason, size: x?.size, dependsOn: x?.dependsOn, parallel: x?.parallel });
  }
}

/** Send a fix request to Claude Code on the PR (or the issue if no PR yet). */
export async function requestFix(token: string, full: string, number: number, instruction: string, prUrl?: string) {
  const { owner, repo } = split(full);
  const prNumber = prUrl ? Number(/\/pull\/(\d+)/.exec(prUrl)?.[1]) : NaN;
  await gh(token).issues.createComment({
    owner, repo, issue_number: Number.isFinite(prNumber) ? prNumber : number,
    body: `@claude 確認で差し戻します。次の点を修正して、同じPRに追加コミットしてください。\n\n${instruction}\n\n(kban #${number})`,
  });
  await gh(token).issues.update({
    owner, repo, issue_number: number,
    labels: labelNames((await gh(token).issues.get({ owner, repo, issue_number: number })).data.labels)
      .filter((l) => !STAGE_IDS.some((s) => l === stageLabel(s)))
      .concat(stageLabel("building")),
  });
}
