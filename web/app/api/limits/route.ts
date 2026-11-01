import { HttpError } from "@/lib/access";
import { handle } from "@/lib/route";
import { parseLimits } from "@/lib/limits";
import { saveLimitsByToken } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * 手元の Claude Code のステータスライン(public/kban-statusline.sh)から、契約の使用率を受け取る。
 * Authorization: Bearer kbl_… / 本文: { rate_limits: { five_hour, seven_day } }(ステータスラインの形のまま)
 */
export const POST = (req: Request) =>
  handle(async () => {
    const m = /^Bearer (kbl_\S+)$/.exec(req.headers.get("authorization") || "");
    if (!m) throw new HttpError(401, "トークンがありません");
    const limits = parseLimits(await req.json().catch(() => null));
    if (!limits) throw new HttpError(400, "rate_limits がありません(Claude の契約でログインした Claude Code で、最初の応答のあとに届きます)");
    if (!(await saveLimitsByToken(m[1], limits))) throw new HttpError(401, "トークンが無効です。kban でトークンを作り直してください");
    return { ok: true };
  });
