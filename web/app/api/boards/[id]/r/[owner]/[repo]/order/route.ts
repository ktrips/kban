import { access, bad, repoOn } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { setRanks } from "@/lib/github";

type P = Ctx<{ id: string; owner: string; repo: string }>;

/** body: { numbers: [12, 7, 9], items?: [{number, reason, size, dependsOn, parallel}] } — top first */
export const POST = async (req: Request, { params }: P) => {
  const { id, owner, repo } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const r = repoOn(a, `${owner}/${repo}`);
    const { numbers, items } = await req.json();
    if (!Array.isArray(numbers)) throw bad("numbers が必要です");
    await setRanks(a.token, r.full, numbers.map((n: number, i: number) => ({ number: Number(n), rank: i + 1 })), items);
  });
};
