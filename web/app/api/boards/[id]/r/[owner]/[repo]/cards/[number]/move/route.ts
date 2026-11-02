import { access, bad, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { listCards } from "@/lib/github";
import { moveCard } from "@/lib/move";

type P = Ctx<{ id: string; owner: string; repo: string; number: string }>;

/** カードを、同じボードの別のリポジトリへ移す。body: { to: "owner/repo" } */
export const POST = async (req: Request, { params }: P) => {
  const { id, owner, repo, number } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const from = repoOn(a, `${owner}/${repo}`);
    const { to } = await req.json();
    if (!to) throw bad("移し先のリポジトリを選んでください");
    const dest = repoOn(a, String(to));
    const cards = await listCards(a.token, dest);
    const rank = Math.max(0, ...cards.filter((c) => c.stage === "backlog").map((c) => (c.rank < 100000 ? c.rank : 0))) + 1;
    return moveCard(a.token, from.full, Number(number), dest, rank);
  });
};
