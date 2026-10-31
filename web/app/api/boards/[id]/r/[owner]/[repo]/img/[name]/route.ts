import { access, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { readImage } from "@/lib/attach";

export const dynamic = "force-dynamic";
const TYPE: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic" };

/** カードのスクリーンショット。ボードを見られる人なら GitHub 権限がなくても表示できる。 */
export const GET = async (_: Request, { params }: Ctx<{ id: string; owner: string; repo: string; name: string }>) => {
  const { id, owner, repo, name } = await params;
  let img: Buffer | null = null;
  const res = await handle(async () => {
    const a = await access(id, "view");
    img = await readImage(a.token, repoOn(a, `${owner}/${repo}`).full, name);
  });
  if (!img) return res;
  return new Response(new Uint8Array(img), { headers: { "content-type": TYPE[name.split(".").pop()!] || "application/octet-stream", "cache-control": "private, max-age=86400" } });
};
