import { access, bad, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { updateCard, Patch } from "@/lib/github";
import { isStage } from "@/lib/stages";
import { isWeek } from "@/lib/sprint";

type P = Ctx<{ id: string; owner: string; repo: string; number: string }>;
const KEYS = ["title", "stage", "size", "target", "idea", "spec", "steps", "criteria", "dependsOn", "prompt", "rank", "reason", "parallel", "sprint"] as const;

export const PATCH = async (req: Request, { params }: P) => {
  const { id, owner, repo, number } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const r = repoOn(a, `${owner}/${repo}`);
    const b = await req.json();
    if (b.stage !== undefined && !isStage(b.stage)) throw bad("不明な工程です");
    if (b.sprint !== undefined && b.sprint !== "" && !isWeek(b.sprint)) throw bad("スプリントは週の月曜の日付(YYYY-MM-DD)で指定してください"); // "" で外す
    const patch = Object.fromEntries(KEYS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]])) as Patch;
    await updateCard(a.token, r.full, Number(number), patch);
  });
};
