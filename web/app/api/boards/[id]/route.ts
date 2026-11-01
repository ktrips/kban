import { access, bad } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { deleteBoard, getUser, saveBoard } from "@/lib/store";
import { current } from "@/lib/limits";
import { listCards } from "@/lib/github";

export const dynamic = "force-dynamic";
type P = Ctx<{ id: string }>;

/** The board, its repos and all their cards. */
export const GET = async (_: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "view");
    const failed: string[] = [];
    // Claude の契約の使用率はボードの持ち主のもの(Claude Code は持ち主の契約で動く)
    const limits = current((await getUser(a.board.owner))?.limits);
    const cards = (await Promise.all(a.board.repos.map((r) => listCards(a.token, r).catch(() => { failed.push(r.full); return []; })))).flat();
    const b = a.board;
    return {
      board: { id: b.id, name: b.name, ownerEmail: b.ownerEmail, budgetTokens: b.budgetTokens, weekTokens: b.weekTokens, repos: b.repos, members: a.role === "owner" ? b.members : undefined },
      role: a.role, canEdit: a.canEdit, cards, failed, limits,
    };
  });
};

export const PATCH = async (req: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "owner");
    const { name, budgetTokens, weekTokens } = await req.json();
    if (name !== undefined) {
      if (!String(name || "").trim()) throw bad("ボード名を入れてください");
      a.board.name = String(name).trim().slice(0, 60);
    }
    if (budgetTokens !== undefined) {
      const n = Number(budgetTokens);
      if (budgetTokens !== null && !(n >= 0)) throw bad("予算は0以上の数で入れてください");
      a.board.budgetTokens = budgetTokens === null || n === 0 ? undefined : Math.round(n);
    }
    if (weekTokens !== undefined) {
      const n = Number(weekTokens);
      if (weekTokens !== null && !(n >= 0)) throw bad("週の上限は0以上の数で入れてください");
      a.board.weekTokens = weekTokens === null || n === 0 ? undefined : Math.round(n);
    }
    await saveBoard(a.board);
  });
};

export const DELETE = async (_: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => deleteBoard((await access(id, "owner")).board));
};
