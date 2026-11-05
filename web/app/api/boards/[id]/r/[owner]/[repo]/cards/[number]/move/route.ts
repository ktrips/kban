import { access, bad, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { listCards } from "@/lib/github";
import { graduateCard, moveCard } from "@/lib/move";
import { saveBoard } from "@/lib/store";

type P = Ctx<{ id: string; owner: string; repo: string; number: string }>;

/** カードを、同じボードの別のリポジトリへ移す。body: { to: "owner/repo" }。
 * { create: { name, private? } } はボードの持ち主だけ: 新しいリポジトリを作ってその最初のタスクにし、ボードにも追加する */
export const POST = async (req: Request, { params }: P) => {
  const { id, owner, repo, number } = await params;
  return handle(async () => {
    const b = await req.clone().json();
    if (b.create) {
      const a = await access(id, "owner");
      const from = repoOn(a, `${owner}/${repo}`);
      const name = String(b.create.name || "").trim();
      if (!/^[\w.-]{1,100}$/.test(name)) throw bad("リポジトリ名は英数字・-・_・. で入力してください");
      const out = await graduateCard(a.token, from.full, Number(number), { name, description: b.create.description, private: b.create.private !== false, target: from.target });
      if (!a.board.repos.some((x) => x.full === out.dest.full)) { a.board.repos.push(out.dest); await saveBoard(a.board); }
      return { repo: out.dest.full, number: out.number, setupPr: out.setupPr };
    }
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
