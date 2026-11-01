import { access, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { completeCard } from "@/lib/complete";
import { extractFollowups } from "@/lib/ai";
import { listCards } from "@/lib/github";

type P = Ctx<{ id: string; owner: string; repo: string; number: string }>;

/** 画面から完了にする。summary(Claude の報告を貼る)だけ渡すと、AI がフォローアップを取り出す。followups を渡せばそのまま使う。 */
export const POST = async (req: Request, { params }: P) => {
  const { id, owner, repo, number } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const r = repoOn(a, `${owner}/${repo}`);
    const b = await req.json();
    const summary = String(b.summary || "");
    let followups: string[] | null = Array.isArray(b.followups) ? b.followups.map(String) : null;
    if (!followups) {
      const title = (await listCards(a.token, r)).find((c) => c.number === Number(number))?.title || "";
      followups = summary.trim() ? await extractFollowups(title, summary) : [];
    }
    return completeCard(a.token, r, Number(number), summary, followups);
  });
};
