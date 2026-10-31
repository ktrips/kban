import { auth } from "@/auth";
import { Board, Role, ensureUser, getBoard, githubToken, userByCaptureToken, User } from "./store";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const bad = (m: string) => new HttpError(400, m);

export async function me(): Promise<User> {
  const s = await auth();
  if (!s?.user?.id || !s.user.email) throw new HttpError(401, "ログインしてください");
  return ensureUser(s.user.id, s.user.email.toLowerCase(), s.user.name || s.user.email);
}

export type Level = "view" | "edit" | "owner";
export type Access = { user: User; board: Board; role: "owner" | Role; canEdit: boolean; token: string };

/**
 * Who may do what on a board. GitHub calls on a board always use the board owner's linked
 * GitHub account, so people the board is shared with don't need GitHub access themselves.
 */
export async function access(boardId: string, need: Level): Promise<Access> {
  return accessFor(await me(), boardId, need);
}

/** Session user, or the owner of a capture token sent as `Authorization: Bearer kbt_…` (iPhone share sheet). */
export async function meOrCapture(req: Request): Promise<User> {
  const m = /^Bearer (kbt_\S+)$/.exec(req.headers.get("authorization") || "");
  if (!m) return me();
  const u = await userByCaptureToken(m[1]);
  if (!u) throw new HttpError(401, "トークンが無効です。kban でトークンを作り直してください");
  return u;
}

export async function accessFor(user: User, boardId: string, need: Level): Promise<Access> {
  const board = await getBoard(boardId);
  if (!board) throw new HttpError(404, "ボードが見つかりません");
  const role: Access["role"] | undefined = board.owner === user.uid ? "owner" : board.members[user.email];
  if (!role) throw new HttpError(404, "ボードが見つかりません");
  const canEdit = role === "owner" || role === "editor";
  if (need === "edit" && !canEdit) throw new HttpError(403, "このボードは見るだけの権限です");
  if (need === "owner" && role !== "owner") throw new HttpError(403, "ボードの持ち主だけができる操作です");
  const token = await githubToken(board.owner);
  if (!token) throw new HttpError(409, "ボードの持ち主が GitHub を連携していません");
  return { user, board, role, canEdit, token };
}

/** Repo must be on the board. */
export function repoOn(a: Access, full: string) {
  const r = a.board.repos.find((x) => x.full === full);
  if (!r) throw new HttpError(404, "このボードにないリポジトリです");
  return r;
}
