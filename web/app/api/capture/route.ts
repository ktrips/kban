import { accessFor, meOrCapture } from "@/lib/access";
import { handle } from "@/lib/route";
import { addIdea, filesOf } from "@/lib/capture";
import { boardsFor, getUser, setLastCapture } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 共有シートの投稿先の候補(編集できるボードのリポジトリ)と、前回の投稿先 */
export const GET = (req: Request) =>
  handle(async () => {
    const u = await meOrCapture(req);
    const { own, shared } = await boardsFor(u.uid, u.email);
    const targets = [...own.map((b) => ({ b, role: "owner" })), ...shared.map((b) => ({ b, role: b.members[u.email] }))]
      .filter((x) => x.role !== "viewer")
      .flatMap(({ b }) => b.repos.map((r) => ({ board: b.id, boardName: b.name, repo: r.full, name: r.name })));
    return { targets, last: (await getUser(u.uid))?.capture?.last ?? null };
  });

/**
 * スクリーンショット+メモを1回の送信でバックログに入れる。multipart: memo, images[], board?, repo?
 * board/repo を省くと前回の投稿先。
 */
export const POST = (req: Request) =>
  handle(async () => {
    const u = await meOrCapture(req);
    const form = await req.formData();
    const last = (await getUser(u.uid))?.capture?.last;
    const board = String(form.get("board") || last?.board || "");
    const repo = String(form.get("repo") || last?.repo || "");
    if (!board || !repo) throw Object.assign(new Error("投稿先のリポジトリを選んでください"), { status: 400 });
    const a = await accessFor(u, board, "edit");
    const r = await addIdea(a, repo, String(form.get("memo") || ""), await filesOf(form));
    await setLastCapture(u.uid, board, repo);
    return { ...r, board, repo };
  });
