import { gh } from "./github";

/**
 * Screenshots attached to an idea are committed to a side branch of the repo (kban-attachments),
 * so the card keeps everything in GitHub and `main` stays clean. The Issue body references them with
 * a normal GitHub URL (works for people logged in to GitHub); kban itself shows them through
 * the board's attachment route so shared members see them without GitHub access.
 */
export const ATTACH_BRANCH = "kban-attachments";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic" };

export type Upload = { type: string; data: Buffer };

export async function ensureAttachBranch(token: string, owner: string, repo: string) {
  const o = gh(token);
  try { await o.git.getRef({ owner, repo, ref: `heads/${ATTACH_BRANCH}` }); return; }
  catch (e) { if ((e as { status?: number }).status !== 404) throw e; }
  const { data: r } = await o.repos.get({ owner, repo });
  const { data: base } = await o.git.getRef({ owner, repo, ref: `heads/${r.default_branch}` });
  await o.git.createRef({ owner, repo, ref: `refs/heads/${ATTACH_BRANCH}`, sha: base.object.sha });
}

/** Returns Markdown image lines for the uploaded files. */
export async function uploadImages(token: string, full: string, files: Upload[]): Promise<string[]> {
  const [owner, repo] = full.split("/");
  if (!files.length) return [];
  await ensureAttachBranch(token, owner, repo);
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const out: string[] = [];
  for (const [i, f] of files.entries()) {
    const ext = EXT[f.type];
    if (!ext) throw new Error(`この画像形式は追加できません: ${f.type || "不明"}`);
    if (f.data.length > MAX_IMAGE_BYTES) throw new Error("画像が大きすぎます(8MBまで)");
    const name = `${stamp}-${Math.random().toString(36).slice(2, 7)}-${i + 1}.${ext}`;
    await gh(token).repos.createOrUpdateFileContents({
      owner, repo, branch: ATTACH_BRANCH, path: `attachments/${name}`,
      message: `kban: スクリーンショットを追加 (${name})`, content: f.data.toString("base64"),
    });
    out.push(`![スクリーンショット](https://github.com/${full}/blob/${ATTACH_BRANCH}/attachments/${name}?raw=true)`);
  }
  return out;
}

export async function readImage(token: string, full: string, name: string) {
  if (!/^[\w.-]+\.(jpg|png|webp|gif|heic)$/.test(name)) throw new Error("不正なファイル名です");
  const [owner, repo] = full.split("/");
  const { data } = await gh(token).repos.getContent({ owner, repo, ref: ATTACH_BRANCH, path: `attachments/${name}`, mediaType: { format: "raw" } });
  return Buffer.from(data as unknown as ArrayBuffer);
}
