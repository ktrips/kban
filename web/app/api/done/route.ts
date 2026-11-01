import { handle } from "@/lib/route";
import { getBoard, githubToken, readDoneToken, dropDoneToken } from "@/lib/store";
import { completeCard } from "@/lib/complete";

export const dynamic = "force-dynamic";

/**
 * 手元の Claude が作業後に呼ぶ。Authorization: Bearer kbc_…(カードごとの使い捨てトークン)
 * body: { summary, followups: string[] } → カードを完了にし、followups を新しいアイデアにする。
 */
export const POST = (req: Request) =>
  handle(async () => {
    const raw = /^Bearer (kbc_\S+)$/.exec(req.headers.get("authorization") || "")?.[1];
    const g = raw ? await readDoneToken(raw) : null;
    if (!raw || !g) throw Object.assign(new Error("トークンが無効か、期限切れです。kban のカードから指示をコピーし直してください"), { status: 401 });
    const board = await getBoard(g.board);
    const repo = board?.repos.find((r) => r.full === g.repo);
    const token = board && (await githubToken(board.owner));
    if (!board || !repo || !token) throw Object.assign(new Error("ボードかリポジトリが見つかりません"), { status: 404 });
    const b = await req.json().catch(() => ({}));
    const r = await completeCard(token, repo, g.number, String(b.summary || ""), Array.isArray(b.followups) ? b.followups.map(String) : []);
    await dropDoneToken(raw);
    return r;
  });
