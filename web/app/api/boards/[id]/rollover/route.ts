import { access, bad } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { listCards, updateCard } from "@/lib/github";
import { addWeeks, isWeek, rolloverTargets, weekOf } from "@/lib/sprint";

type P = Ctx<{ id: string }>;

/**
 * 週が終わっても終わっていないカードを、いまの週のスプリントへ回す。body: { week }(開いた端末の「今週」の月曜)。
 * 週の区切りは端末の時刻なので、画面が週を決めて呼ぶ。未来すぎる週は受け付けない。
 */
export const POST = async (req: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const { week } = await req.json();
    if (!isWeek(week) || week > weekOf(new Date(Date.now() + 36 * 3600_000)) || week < addWeeks(weekOf(), -2)) throw bad("週が正しくありません");
    const all = (await Promise.all(a.board.repos.map((r) => listCards(a.token, r).catch(() => [])))).flat();
    const targets = rolloverTargets(all, week);
    for (const c of targets) await updateCard(a.token, c.repo, c.number, { sprint: week });
    return { moved: targets.length };
  });
};
