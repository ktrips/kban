import { access, bad } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { listCards, updateCard } from "@/lib/github";
import { addWeeks, exitTargets, isWeek, rolloverTargets, weekOf } from "@/lib/sprint";

type P = Ctx<{ id: string }>;

/**
 * スプリントの自動整理。実装が終わって確認以降に進んだカードをスプリントから外し、週が終わっても終わっていないカードを、いまの週のスプリントへ回す。body: { week }(開いた端末の「今週」の月曜)。
 * 週の区切りは端末の時刻なので、画面が週を決めて呼ぶ。未来すぎる週は受け付けない。
 */
export const POST = async (req: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const { week } = await req.json();
    if (!isWeek(week) || week > weekOf(new Date(Date.now() + 36 * 3600_000)) || week < addWeeks(weekOf(), -2)) throw bad("週が正しくありません");
    const all = (await Promise.all(a.board.repos.map((r) => listCards(a.token, r).catch(() => [])))).flat();
    const out = exitTargets(all); // 確認以降に進んだカードはスプリントから外す
    const roll = rolloverTargets(all, week); // 実装が終わっていないカードは今週に回す
    for (const c of out) await updateCard(a.token, c.repo, c.number, { sprint: "" });
    for (const c of roll) await updateCard(a.token, c.repo, c.number, { sprint: week });
    return { moved: roll.length, cleared: out.length };
  });
};
