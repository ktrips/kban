import { me, bad } from "@/lib/access";
import { handle } from "@/lib/route";
import { fillRepoWebUrls } from "@/lib/github";
import { boardsFor, createBoard, githubToken, saveBoard } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    const u = await me();
    const { own, shared } = await boardsFor(u.uid, u.email);
    const mine = u.github ? await githubToken(u.uid) : null;
    await Promise.all([
      ...own.map(async (b) => { if (mine && await fillRepoWebUrls(mine, b.repos)) await saveBoard(b); }),
      ...shared.filter((b) => b.members[u.email] === "editor").map(async (b) => {
        const t = await githubToken(b.owner);
        if (t && await fillRepoWebUrls(t, b.repos)) await saveBoard(b);
      }),
    ]);
    const view = (b: (typeof own)[number]) => ({ id: b.id, name: b.name, ownerEmail: b.ownerEmail, repos: b.repos.map((r) => ({ full: r.full, name: r.name, about: r.about, target: r.target, url: r.url, appUrl: r.appUrl })), members: Object.keys(b.members).length });
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
