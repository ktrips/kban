import { me } from "@/lib/access";
import { handle } from "@/lib/route";
import { issueLimitsToken } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Claude の使用率を送るトークン(ステータスライン用)を(再)発行。前のトークンは使えなくなる。 */
export const POST = () => handle(async () => ({ token: await issueLimitsToken((await me()).uid) }));
