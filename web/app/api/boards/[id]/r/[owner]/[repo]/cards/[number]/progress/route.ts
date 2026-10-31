import { access, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { cardProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

/** Claude Code の実行状況(ワークフロー、進捗コメント、PR とチェック)。見るだけの人にも見える。 */
export const GET = async (_: Request, { params }: Ctx<{ id: string; owner: string; repo: string; number: string }>) => {
  const { id, owner, repo, number } = await params;
  return handle(async () => {
    const a = await access(id, "view");
    return cardProgress(a.token, repoOn(a, `${owner}/${repo}`).full, Number(number));
  });
};
