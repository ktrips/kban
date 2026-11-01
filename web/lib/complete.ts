import { createCard, listCards, updateCard, gh } from "./github";
import type { RepoSettings } from "./store";

/** 手元の Claude での作業が終わったカードを完了にして、フォローアップを新しいアイデア(バックログ)にする。 */
export async function completeCard(token: string, repo: RepoSettings, number: number, summary: string, followups: string[]) {
  const [owner, name] = repo.full.split("/");
  const cards = await listCards(token, repo);
  const card = cards.find((c) => c.number === number);
  if (!card) throw Object.assign(new Error("カードが見つかりません"), { status: 404 });
  if (summary.trim()) {
    await gh(token).issues.createComment({ owner, repo: name, issue_number: number, body: `✅ 手元の Claude での作業が完了しました。\n\n${summary.trim().slice(0, 6000)}` });
  }
  await updateCard(token, repo.full, number, { stage: "done" });
  let rank = Math.max(0, ...cards.filter((c) => c.stage === "backlog").map((c) => (c.rank < 100000 ? c.rank : 0)));
  const made: number[] = [];
  for (const f of followups.map((x) => x.trim()).filter(Boolean).slice(0, 10)) {
    made.push(await createCard(token, repo.full, f.split("\n")[0].slice(0, 80), repo.target, ++rank, `${f}\n\n(#${number} 「${card.title}」のフォローアップ)`));
  }
  return { number, followups: made };
}
