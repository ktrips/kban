import { me, bad } from "@/lib/access";
import { handle } from "@/lib/route";
import { boardsFor, createBoard } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    const u = await me();
    const { own, shared } = await boardsFor(u.uid, u.email);
    const view = (b: (typeof own)[number]) => ({ id: b.id, name: b.name, ownerEmail: b.ownerEmail, repos: b.repos.map((r) => r.name), members: Object.keys(b.members).length });
    return { own: own.map(view), shared: shared.map((b) => ({ ...view(b), role: b.members[u.email] })) };
  });

export const POST = (req: Request) =>
  handle(async () => {
    const u = await me();
    if (!u.github) throw bad("ボードを作るには GitHub の連携が必要です");
    const { name } = await req.json();
    if (!String(name || "").trim()) throw bad("ボード名を入れてください");
    const b = await createBoard(u, String(name).trim().slice(0, 60));
    return { id: b.id };
  });
