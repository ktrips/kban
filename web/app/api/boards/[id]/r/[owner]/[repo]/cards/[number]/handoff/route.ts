import { access, bad, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { listCards, updateCard } from "@/lib/github";
import { makeDoneToken } from "@/lib/store";
import { composePrompt } from "@/lib/prompt";
import { publicOrigin } from "@/lib/origin";

type P = Ctx<{ id: string; owner: string; repo: string; number: string }>;

/** 手元の Claude で進める: カードを「進行中」にして(Actions は動かさない)、貼り付ける指示を返す。 */
export const POST = async (req: Request, { params }: P) => {
  const { id, owner, repo, number } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const r = repoOn(a, `${owner}/${repo}`);
    const n = Number(number);
    const card = (await listCards(a.token, r)).find((c) => c.number === n);
    if (!card) throw bad("カードが見つかりません");
    if (card.stage === "done") throw bad("完了したカードです");
    const token = await makeDoneToken({ uid: a.user.uid, board: id, repo: r.full, number: n });
    if (card.stage !== "building" || card.runner !== "local") await updateCard(a.token, r.full, n, { stage: "building", runner: "local" });
    const prompt = composePrompt(card, { origin: publicOrigin(req), token });
    return { prompt, claudeUrl: prompt.length < 6000 ? `https://claude.ai/new?q=${encodeURIComponent(prompt)}` : "https://claude.ai/new" };
  });
};
