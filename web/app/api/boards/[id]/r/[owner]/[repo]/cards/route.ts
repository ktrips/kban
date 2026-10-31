import { access, bad, repoOn } from "@/lib/access";
import { addIdea, filesOf } from "@/lib/capture";
import { handle, Ctx } from "@/lib/route";
import { listCards } from "@/lib/github";

export const dynamic = "force-dynamic";
type P = Ctx<{ id: string; owner: string; repo: string }>;

export const GET = async (_: Request, { params }: P) => {
  const { id, owner, repo } = await params;
  return handle(async () => {
    const a = await access(id, "view");
    return { cards: await listCards(a.token, repoOn(a, `${owner}/${repo}`)) };
  });
};

/** JSON {title} (従来) か multipart {memo, images[]}(スクリーンショット付き)で、バックログに追加 */
export const POST = async (req: Request, { params }: P) => {
  const { id, owner, repo } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const full = `${owner}/${repo}`;
    if ((req.headers.get("content-type") || "").startsWith("multipart/")) {
      const form = await req.formData();
      return addIdea(a, full, String(form.get("memo") || ""), await filesOf(form));
    }
    const { title } = await req.json();
    if (!String(title || "").trim()) throw bad("タイトルが空です");
    return addIdea(a, full, String(title), []);
  });
};
