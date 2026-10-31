import { access, bad, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { createCard, listCards } from "@/lib/github";

export const dynamic = "force-dynamic";
type P = Ctx<{ id: string; owner: string; repo: string }>;

export const GET = async (_: Request, { params }: P) => {
  const { id, owner, repo } = await params;
  return handle(async () => {
    const a = await access(id, "view");
    return { cards: await listCards(a.token, repoOn(a, `${owner}/${repo}`)) };
  });
};

export const POST = async (req: Request, { params }: P) => {
  const { id, owner, repo } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const r = repoOn(a, `${owner}/${repo}`);
    const { title } = await req.json();
    if (!String(title || "").trim()) throw bad("タイトルが空です");
    const cards = await listCards(a.token, r);
    const rank = Math.max(0, ...cards.filter((c) => c.stage === "backlog").map((c) => (c.rank < 100000 ? c.rank : 0))) + 1;
    return { number: await createCard(a.token, r.full, String(title).trim(), r.target, rank) };
  });
};
