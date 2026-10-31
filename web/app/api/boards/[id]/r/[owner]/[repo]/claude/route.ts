import { access, bad, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { claudeStatus, installClaude, setClaudeSecret } from "@/lib/github";

export const dynamic = "force-dynamic";
type P = Ctx<{ id: string; owner: string; repo: string }>;

/** このリポジトリが Claude Code と連携できているか(ワークフロー・認証)。ボードを見られる人なら誰でも。 */
export const GET = async (_: Request, { params }: P) => {
  const { id, owner, repo } = await params;
  return handle(async () => {
    const a = await access(id, "view");
    return claudeStatus(a.token, repoOn(a, `${owner}/${repo}`).full);
  });
};

/** ボードの持ち主だけ: { action: "install", scheme? } でワークフローを入れる PR を作る / { action: "secret", name, value } で認証を登録 */
export const POST = async (req: Request, { params }: P) => {
  const { id, owner, repo } = await params;
  return handle(async () => {
    const a = await access(id, "owner");
    const r = repoOn(a, `${owner}/${repo}`);
    const b = await req.json();
    try {
      if (b.action === "install") {
        const scheme = String(b.scheme || r.name.replace(/^./, (c: string) => c.toUpperCase())).trim();
        return await installClaude(a.token, r.full, r.target, scheme);
      }
      if (b.action === "secret") {
        await setClaudeSecret(a.token, r.full, String(b.name), String(b.value || ""));
        return { ok: true };
      }
    } catch (e) {
      const st = (e as { status?: number }).status;
      if (st === 403 || st === 404) throw Object.assign(new Error("GitHub の権限が足りません。トップの「連携し直す」で GitHub を連携し直してください(ワークフローとシークレットの書き込み権限が要ります)"), { status: 409 });
      throw e;
    }
    throw bad("不明な操作です");
  });
};
