import { bad, repoOn, Access } from "./access";
import { createCard, listCards } from "./github";
import { uploadImages, Upload } from "./attach";

/** メモ(+スクリーンショット)から backlog のカードを作る。Web の追加欄・iPhone の共有シートの共通処理。 */
export async function addIdea(a: Access, full: string, memo: string, files: Upload[]) {
  const r = repoOn(a, full);
  const text = memo.trim();
  if (!text && !files.length) throw bad("メモか画像を入れてください");
  const first = text.split("\n").find((l) => l.trim())?.trim() || "スクリーンショットから";
  const title = first.length > 80 ? `${first.slice(0, 79)}…` : first;
  const imgs = await uploadImages(a.token, r.full, files);
  const idea = [text, ...imgs].filter(Boolean).join("\n\n");
  const cards = await listCards(a.token, r);
  const rank = Math.max(0, ...cards.filter((c) => c.stage === "backlog").map((c) => (c.rank < 100000 ? c.rank : 0))) + 1;
  return { number: await createCard(a.token, r.full, title, r.target, rank, idea), title };
}

/** multipart/form-data の画像(files / image)を取り出す */
export async function filesOf(form: FormData): Promise<Upload[]> {
  const out: Upload[] = [];
  for (const k of ["images", "image", "files"]) {
    for (const v of form.getAll(k)) {
      if (typeof v !== "string" && v.size) out.push({ type: v.type || "image/jpeg", data: Buffer.from(await v.arrayBuffer()) });
    }
  }
  return out;
}
