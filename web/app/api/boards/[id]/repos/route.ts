import { access, bad } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { saveBoard } from "@/lib/store";
import { ensureLabels, gh } from "@/lib/github";
import type { Target } from "@/lib/stages";

type P = Ctx<{ id: string }>;
const TARGETS: Target[] = ["web", "ios", "both"];

/** Add a GitHub repository to the board (creates the kban labels in it). */
export const POST = async (req: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const { full } = await req.json();
    if (!/^[\w.-]+\/[\w.-]+$/.test(full || "")) throw bad("owner/repo を指定してください");
    if (a.board.repos.some((r) => r.full === full)) return;
    const [owner, repo] = full.split("/");
    const { data } = await gh(a.token).repos.get({ owner, repo });
    await ensureLabels(a.token, full);
    a.board.repos.push({ full: data.full_name, name: data.name, target: "web", about: data.description || "" });
    await saveBoard(a.board);
  });
};

/** Update a repo's display name, target (web/ios/both) and description for the AI. */
export const PATCH = async (req: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const { full, name, target, about } = await req.json();
    const r = a.board.repos.find((x) => x.full === full);
    if (!r) throw bad("このボードにないリポジトリです");
    if (name) r.name = String(name).slice(0, 40);
    if (TARGETS.includes(target)) r.target = target;
    if (about !== undefined) r.about = String(about).slice(0, 1000);
    await saveBoard(a.board);
  });
};

/** Remove from the board. Issues on GitHub stay. */
export const DELETE = async (req: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "edit");
    const full = new URL(req.url).searchParams.get("full");
    a.board.repos = a.board.repos.filter((r) => r.full !== full);
    await saveBoard(a.board);
  });
};
