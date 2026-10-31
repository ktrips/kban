import { access, bad } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { deleteBoard, saveBoard } from "@/lib/store";
import { listCards } from "@/lib/github";

export const dynamic = "force-dynamic";
type P = Ctx<{ id: string }>;

/** The board, its repos and all their cards. */
export const GET = async (_: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "view");
    const failed: string[] = [];
    const cards = (await Promise.all(a.board.repos.map((r) => listCards(a.token, r).catch(() => { failed.push(r.full); return []; })))).flat();
    const b = a.board;
    return {
      board: { id: b.id, name: b.name, ownerEmail: b.ownerEmail, repos: b.repos, members: a.role === "owner" ? b.members : undefined },
      role: a.role, canEdit: a.canEdit, cards, failed,
    };
  });
};

export const PATCH = async (req: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "owner");
    const { name } = await req.json();
    if (!String(name || "").trim()) throw bad("ボード名を入れてください");
    a.board.name = String(name).trim().slice(0, 60);
    await saveBoard(a.board);
  });
};

export const DELETE = async (_: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => deleteBoard((await access(id, "owner")).board));
};
