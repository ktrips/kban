import { access, bad } from "@/lib/access";
import { handle, Ctx } from "@/lib/route";
import { setMember, Role } from "@/lib/store";
import { inviteCollaborator } from "@/lib/github";

type P = Ctx<{ id: string }>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Share the board with a Google account.
 * body: { email, role: "editor" | "viewer", github?: "login" }  — github also invites them to every repo on the board.
 */
export const POST = async (req: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "owner");
    const { email, role, github } = await req.json();
    if (!EMAIL.test(String(email || ""))) throw bad("メールアドレスの形式ではありません");
    if (String(email).toLowerCase() === a.user.email) throw bad("自分自身は追加できません");
    if (!["editor", "viewer"].includes(role)) throw bad("権限は editor か viewer です");
    await setMember(a.board, email, role as Role);
    const invited: string[] = [], failed: string[] = [];
    if (github && /^[\w-]+$/.test(github)) {
      for (const r of a.board.repos) {
        try { await inviteCollaborator(a.token, r.full, github); invited.push(r.full); }
        catch { failed.push(r.full); }
      }
    }
    return { invited, failed };
  });
};

export const DELETE = async (req: Request, { params }: P) => {
  const { id } = await params;
  return handle(async () => {
    const a = await access(id, "owner");
    const email = new URL(req.url).searchParams.get("email");
    if (!email) throw bad("email が必要です");
    await setMember(a.board, email, null);
  });
};
