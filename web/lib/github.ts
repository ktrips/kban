import { Octokit } from "@octokit/rest";
import { STAGE_IDS, StageId, Target, stageFromLabels, stageLabel, targetFromLabels } from "./stages";
import { parseBody, renderBody, CardBody } from "./body";
import config from "../kenban.config.json";

export type Project = { name: string; repo: string; target: Target };
export type Card = CardBody & {
  id: string; // owner/repo#number
  repo: string;
  project: string;
  number: number;
  title: string;
  stage: StageId;
  target: Target;
  priority: "高" | "中" | "低";
  url: string;
  pr?: string;
  preview?: string;
  updatedAt: string;
};

export const projects: Project[] = config.projects as Project[];

let client: Octokit | null = null;
export function gh(): Octokit {
  if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN が設定されていません");
  client ??= new Octokit({ auth: process.env.GITHUB_TOKEN, userAgent: "kenban" });
  return client;
}

export function split(repo: string) {
  const [owner, name] = repo.split("/");
  if (!owner || !name || !projects.some((p) => p.repo === repo)) throw new Error(`未登録のリポジトリ: ${repo}`);
  return { owner, repo: name };
}

const labelNames = (labels: (string | { name?: string })[]) =>
  labels.map((l) => (typeof l === "string" ? l : l.name || "")).filter(Boolean);

function priorityFrom(labels: string[]): Card["priority"] {
  if (labels.includes("kenban:p-high")) return "高";
  if (labels.includes("kenban:p-low")) return "低";
  return "中";
}

export async function listCards(): Promise<Card[]> {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
  const all = await Promise.all(
    projects.map(async (p) => {
      const { owner, repo } = split(p.repo);
      const issues = await gh().paginate(gh().issues.listForRepo, {
        owner, repo, labels: "kenban", state: "all", since, per_page: 100,
      });
      return issues
        .filter((i) => !i.pull_request && !(i.state === "closed" && i.state_reason === "not_planned"))
        .map((i): Card => {
          const labels = labelNames(i.labels);
          const meta = markers(i.body || "");
          return {
            ...parseBody(i.body),
            id: `${p.repo}#${i.number}`,
            repo: p.repo,
            project: p.name,
            number: i.number,
            title: i.title,
            stage: stageFromLabels(labels, i.state === "closed"),
            target: labels.some((l) => /^kenban:(web|ios|both)$/.test(l)) ? targetFromLabels(labels) : p.target,
            priority: priorityFrom(labels),
            url: i.html_url,
            pr: meta.pr,
            preview: meta.preview,
            updatedAt: i.updated_at,
          };
        });
    }),
  );
  return all.flat();
}

/** The flow workflow writes `<!-- kenban:pr=… -->` / `<!-- kenban:preview=… -->` into the issue body. */
export function markers(body: string) {
  const get = (k: string) => new RegExp(`<!-- kenban:${k}=(.+?) -->`).exec(body)?.[1];
  return { pr: get("pr"), preview: get("preview") };
}
function keepMarkers(oldBody: string, newBody: string) {
  const kept = (oldBody.match(/<!-- kenban:(?:pr|preview)=.+? -->/g) || []).join("\n");
  return kept ? `${newBody}\n${kept}` : newBody;
}

export async function createCard(repoFull: string, title: string, idea: string, target: Target) {
  const { owner, repo } = split(repoFull);
  const body = renderBody({ idea, spec: "", criteria: [], prompt: "" });
  const { data } = await gh().issues.create({
    owner, repo, title, body, labels: ["kenban", stageLabel("idea"), `kenban:${target}`],
  });
  return data.number;
}

export async function updateCard(
  repoFull: string,
  number: number,
  patch: Partial<CardBody> & { title?: string; stage?: StageId; priority?: Card["priority"] },
) {
  const { owner, repo } = split(repoFull);
  const { data: issue } = await gh().issues.get({ owner, repo, issue_number: number });
  const update: Parameters<Octokit["issues"]["update"]>[0] = { owner, repo, issue_number: number };

  if (patch.title) update.title = patch.title;
  if (patch.idea !== undefined || patch.spec !== undefined || patch.criteria !== undefined || patch.prompt !== undefined) {
    const cur = parseBody(issue.body);
    update.body = keepMarkers(issue.body || "", renderBody({ ...cur, ...stripUndefined(patch) }));
  }

  let labels = labelNames(issue.labels);
  if (patch.stage) {
    labels = labels.filter((l) => !STAGE_IDS.some((s) => l === stageLabel(s)));
    labels.push(stageLabel(patch.stage));
    // Handing the card to AI = adding the label that triggers claude-code-action.
    if (patch.stage === "queued" && !labels.includes("claude")) labels.push("claude");
    if (patch.stage === "done") update.state = "closed";
    else if (issue.state === "closed") update.state = "open";
  }
  if (patch.priority) {
    labels = labels.filter((l) => !/^kenban:p-/.test(l));
    if (patch.priority === "高") labels.push("kenban:p-high");
    if (patch.priority === "低") labels.push("kenban:p-low");
  }
  if (patch.stage || patch.priority) update.labels = labels;

  // Re-adding `claude` must be a fresh `labeled` event, so remove it first when re-queuing.
  if (patch.stage === "queued" && labelNames(issue.labels).includes("claude")) {
    await gh().issues.removeLabel({ owner, repo, issue_number: number, name: "claude" }).catch(() => {});
    await gh().issues.update({ ...update, labels: labels.filter((l) => l !== "claude") });
    await gh().issues.addLabels({ owner, repo, issue_number: number, labels: ["claude"] });
    return;
  }
  await gh().issues.update(update);
}

/** Send a fix request to Claude Code on the PR (or the issue if no PR yet). */
export async function requestFix(repoFull: string, number: number, instruction: string, prUrl?: string) {
  const { owner, repo } = split(repoFull);
  const prNumber = prUrl ? Number(/\/pull\/(\d+)/.exec(prUrl)?.[1]) : NaN;
  const target = Number.isFinite(prNumber) ? prNumber : number;
  await gh().issues.createComment({
    owner, repo, issue_number: target,
    body: `@claude 確認で差し戻します。次の点を修正して、同じPRに追加コミットしてください。\n\n${instruction}\n\n(kenban #${number})`,
  });
  await updateCard(repoFull, number, { stage: "building" });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
