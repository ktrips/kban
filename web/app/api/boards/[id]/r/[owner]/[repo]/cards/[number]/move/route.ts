import { access, bad, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { graduateCard, transferCard } from "@/lib/github";
import { saveBoard } from "@/lib/store";

type P = Ctx<{ id: string; owner: string; repo: string; number: string }>;

/**
 * カードを別のリポジトリへ移す。
 * { to: "owner/repo" }: ボードにある別のリポジトリへ(編集者)
 * { create: { name, description?, private? } }: 新しいリポジトリを作ってその最初のタスクにする(ボードの持ち主だけ。ボードにも追加する)
 */
export const POST = async (req: Request, { params }: P) => {
  const { id, owner, repo, number } = await params;
  return handle(async () => {
    const b = await req.json();
    const n = Number(number);
    if (b.create) {
      const a = await access(id, "owner");
      const r = repoOn(a, `${owner}/${repo}`);
      const name = String(b.create.name || "").trim();
      if (!/^[\w.-]{1,100}$/.test(name)) throw bad("リポジトリ名は英数字・-・_・. で入力してください");
      const out = await graduateCard(a.token, r.full, n, { name, description: b.create.description, private: b.create.private !== false, target: r.target });
      if (!a.board.repos.some((x) => x.full === out.repo.full)) {
        a.board.repos.push({ full: out.repo.full, name: out.repo.name, target: r.target, about: out.repo.about });
        await saveBoard(a.board);
      }
      return out;
    }
    const a = await access(id, "edit");
    const from = repoOn(a, `${owner}/${repo}`);
    const to = String(b.to || "");
    if (to === from.full) throw bad("同じリポジトリです");
    if (!a.board.repos.some((x) => x.full === to)) throw bad("このボードにないリポジトリです");
    return { card: await transferCard(a.token, from.full, n, to) };
  });
};
