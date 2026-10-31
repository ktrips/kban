import { access, bad, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { updateCard, Patch } from "@/lib/github";
import { isStage } from "@/lib/stages";

type P = Ctx<{ id: string; owner: string; repo: string; number: string }>;
const KEYS = ["title", "stage", "size", "target", "idea", "spec", "steps", "criteria", "dependsOn", "prompt", "rank", "reason", "parallel"] as const;

export const PATCH = async (req: Request, { params }: P) => {
  const { id, owner, repo, number } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const r = repoOn(a, `${owner}/${repo}`);
    const b = await req.json();
    if (b.stage !== undefined && !isStage(b.stage)) throw bad("不明な工程です");
    const patch = Object.fromEntries(KEYS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]])) as Patch;
    await updateCard(a.token, r.full, Number(number), patch);
  });
};
