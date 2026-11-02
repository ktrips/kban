import type { Octokit } from "@octokit/rest";

const ATTACH_BRANCH = "kban-attachments";

type Reader = Pick<Octokit, "repos" | "git">;

/**
 * 画像のバイト列。`mediaType: raw` は使わない: GitHub が charset=utf-8 付きで返すため Octokit が文字列にしてしまい、
 * 画像が壊れて表示されなくなる。base64 で受け取る(1MB を超えるファイルは content が空なので blob API で取る)。
 */
export async function readImageWith(o: Reader, full: string, name: string) {
  if (!/^[\w.-]+\.(jpg|png|webp|gif|heic)$/.test(name)) throw new Error("不正なファイル名です");
  const [owner, repo] = full.split("/");
  const { data } = await o.repos.getContent({ owner, repo, ref: ATTACH_BRANCH, path: `attachments/${name}` });
  if (Array.isArray(data) || data.type !== "file") throw new Error("画像が見つかりません");
  if (data.content) return Buffer.from(data.content, "base64");
  const { data: blob } = await o.git.getBlob({ owner, repo, file_sha: data.sha });
  return Buffer.from(blob.content, "base64");
}

/** 画像の本当の形式(先頭のバイトから)。端末が type を空で送ってくる(HEIC など)と、中身と拡張子が食い違って表示できなくなるため。 */
export function sniffImageType(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image/png";
  if (b.length >= 4 && b.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length >= 12 && b.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)/.test(b.subarray(8, 12).toString("latin1"))) return "image/heic";
  return null;
}
