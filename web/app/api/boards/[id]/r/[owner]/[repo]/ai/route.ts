import { access, bad, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { listCards, updateCard, requestFix, requestPlan, requestPrioritize, latestRun, PRIORITIZE_WORKFLOW } from "@/lib/github";
import { makePlan, prioritize, makeFix } from "@/lib/ai";
import { ACTIVE } from "@/lib/stages";

type P = Ctx<{ id: string; owner: string; repo: string }>;

/** 「AIで優先順位」の Actions のいちばん新しい実行(失敗を画面に出すため) */
export const GET = async (_: Request, { params }: P) => {
  const { id, owner, repo } = await params;
  return handle(async () => {
    const a = await access(id, "view");
    return { run: await latestRun(a.token, repoOn(a, `${owner}/${repo}`).full, PRIORITIZE_WORKFLOW) };
  });
};

/**
 * body: { action: "plan" | "prioritize" | "dismiss" | "fix", number?, feedback? }。
 * plan / prioritize は Actions(Claude の契約)に頼めたら { queued: true }。結果はワークフローが Issue に書く。
 * dismiss は「AIで優先順位」の提案の印を消す
 */
export const POST = async (req: Request, { params }: P) => {
  const { id, owner, repo } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const r = repoOn(a, `${owner}/${repo}`);
    const { action, number, feedback } = await req.json();
    const cards = await listCards(a.token, r);

    if (action === "prioritize") {
      const pool = cards.filter((c) => c.stage === "backlog" || c.stage === "ready").sort((x, y) => x.rank - y.rank);
      if (pool.length < 2) throw bad("並べ替えるには2件以上必要です");
      if (await requestPrioritize(a.token, r.full)) return { queued: true };
      if (!process.env.ANTHROPIC_API_KEY) {
        throw bad("このリポジトリに kban-prioritize.yml がありません。「リポジトリの設定 → Claude Code 連携」で「ワークフローを更新する PR を作る」を押し、PR をマージしてください");
      }
      return { items: await prioritize(r, pool, cards.filter((c) => ACTIVE.includes(c.stage))) };
    }
    if (action === "dismiss") {
      for (const c of cards.filter((c) => c.proposal)) await updateCard(a.token, r.full, c.number, { proposal: "" });
      return { ok: true };
    }
    const card = cards.find((c) => c.number === Number(number));
    if (!card) throw bad("カードが見つかりません");
    if (action === "plan") {
      // まずアプリのリポジトリの Actions(kban-plan.yml)で、登録済みの Claude の契約を使って作る。結果はワークフローが Issue に書く
      if (await requestPlan(a.token, r.full, card.number)) return { queued: true };
      if (!process.env.ANTHROPIC_API_KEY) {
        throw bad("このリポジトリに kban-plan.yml がありません。「リポジトリの設定 → Claude Code 連携」で「ワークフローを更新する PR を作る」を押し、PR をマージしてください");
      }
      const p = await makePlan(r, card, cards.filter((c) => c.number !== card.number && c.stage !== "done"));
      const rank = card.stage === "backlog" ? Math.max(0, ...cards.filter((c) => c.stage === "ready").map((c) => (c.rank < 100000 ? c.rank : 0))) + 1 : undefined;
      await updateCard(a.token, r.full, card.number, {
        title: p.title, spec: p.spec, prompt: p.prompt, size: p.size, dependsOn: p.dependsOn, rank,
        steps: p.steps.map((text) => ({ text, done: false })),
        criteria: p.criteria.map((text) => ({ text, done: false })),
        stage: card.stage === "backlog" ? "ready" : undefined,
      });
      return { plan: p };
    }
    if (action === "fix") {
      const fb = String(feedback || "");
      // AI が使えないときは、満たしていない受入条件と指摘をそのまま指示にする
      const text = await makeFix(card, fb).catch(() => `前回の実装を修正してください。\n${fb ? `確認での指摘: ${fb}\n` : ""}満たしていない受入条件: ${card.criteria.filter((c) => !c.done).map((c) => c.text).join(" / ") || "なし"}\n修正したら同じ PR に push してください。`);
      await requestFix(a.token, r.full, card.number, text, card.pr);
      return { ok: true };
    }
    throw bad("不明な操作です");
  });
};
