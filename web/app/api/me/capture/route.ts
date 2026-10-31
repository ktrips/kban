import { me } from "@/lib/access";
import { handle } from "@/lib/route";
import { issueCaptureToken } from "@/lib/store";

export const dynamic = "force-dynamic";

/** iPhone 用トークンを(再)発行。前のトークンは使えなくなる。 */
export const POST = () => handle(async () => ({ token: await issueCaptureToken((await me()).uid) }));
