import { gh, ensureLabels, updateCard, installClaude } from "./github";
import type { Target } from "./stages";
import { parseBody } from "./body";
import { stageFromLabels } from "./stages";
import { uploadImages } from "./attach";
import { readImageWith, sniffImageType } from "./image";
import { imageNames, replaceImage } from "./idea";
import type { RepoSettings } from "./store";

const names = (labels: (string | { name?: string })[]) => labels.map((l) => (typeof l === "string" ? l : l.name || "")).filter(Boolean);

/**
 * カードのリポジトリを変える(GitHub の Issue の transfer)。番号は移した先の新しい番号になる。
 * 履歴・コメント・ラベルは引き継がれる。画像は移し先にコピーして URL を差し替え、前提(番号)は外す。
 * 移せるのは同じオーナーのリポジトリで、「バックログ」「次にやる」のカードだけ(PR や実行中の作業を持たないため)。
 */
export async function moveCard(token: string, from: string, number: number, to: RepoSettings, rank: number) {
  const [fo, fr] = from.split("/");
  const [to_o, to_r] = to.full.split("/");
  if (from === to.full) throw new Error("いまのリポジトリと同じです");
  if (fo !== to_o) throw new Error("同じオーナー(ユーザー/組織)のリポジトリにだけ移せます");
  const o = gh(token);
  const { data: issue } = await o.issues.get({ owner: fo, repo: fr, issue_number: number });
  const stage = stageFromLabels(names(issue.labels), issue.state === "closed");
  if (stage !== "backlog" && stage !== "ready") throw new Error("移せるのは「バックログ」「次にやる」のカードだけです");

  const { data: dest } = await o.repos.get({ owner: to_o, repo: to_r });
  await ensureLabels(token, to.full);
  const res = await o.graphql<{ transferIssue: { issue: { number: number } } }>(
    `mutation($issueId: ID!, $repoId: ID!) { transferIssue(input: { issueId: $issueId, repositoryId: $repoId, createLabelsIfMissing: true }) { issue { number } } }`,
    { issueId: issue.node_id, repoId: dest.node_id },
  );
  const newNo = res.transferIssue.issue.number;

  // 画像は元のリポジトリの kban-attachments にあるので、移し先にコピーして差し替える
  let idea = parseBody(issue.body).idea;
  for (const name of imageNames(idea)) {
    const data = await readImageWith(o, from, name);
    const [md] = await uploadImages(token, to.full, [{ type: sniffImageType(data) || "image/jpeg", data }]);
    idea = replaceImage(idea, name, md);
  }
  await updateCard(token, to.full, newNo, { idea, dependsOn: [], rank, target: to.target });
  return { repo: to.full, number: newNo };
}

/**
 * アイデアが育ったとき: 新しいリポジトリ(自分のアカウント)を作り、カードをその最初のタスクにする。
 * kban 連携のワークフローを入れる PR も作る(失敗しても作成とカードの移動は残す)。
 */
export async function graduateCard(
  token: string, from: string, number: number,
  opts: { name: string; description?: string; private?: boolean; target: Target },
) {
  const { data: repo } = await gh(token).repos.createForAuthenticatedUser({
    name: opts.name, description: (opts.description || "").slice(0, 300), private: opts.private ?? true, auto_init: true,
  });
  const dest: RepoSettings = { full: repo.full_name, name: repo.name, target: opts.target, about: repo.description || "" };
  const moved = await moveCard(token, from, number, dest, 1);
  let setupPr: string | undefined;
  try {
    setupPr = (await installClaude(token, dest.full, opts.target, repo.name.replace(/^./, (c) => c.toUpperCase()))).pr;
  } catch { /* 連携 PR は後からリポジトリ設定でも作れる */ }
  return { dest, ...moved, setupPr };
}
