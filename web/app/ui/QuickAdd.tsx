"use client";

import { useRef, useState } from "react";

/** 長辺 1600px の JPEG に縮める(iPhone のスクリーンショット/写真をそのまま送らない) */
async function shrink(f: File): Promise<File> {
  if (f.type === "image/gif" || !f.type.startsWith("image/")) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch { return f; } // HEIC などブラウザが読めない形式はそのまま送る(サーバーが判断)
}

/** バックログへの追加欄: メモ + スクリーンショット(選ぶ/貼り付け/ドロップ)。 */
/** lead: 1行目(📷・追加の左)に置くもの。ボード画面では追加先のリポジトリの選択。 */
export function QuickAdd({ placeholder, busy, onAdd, lead }: { placeholder: string; busy: boolean; onAdd: (memo: string, files: File[]) => Promise<void>; lead?: React.ReactNode }) {
  const [memo, setMemo] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const pick = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | File[] | null) {
    const imgs = [...(list || [])].filter((f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name));
    const small = await Promise.all(imgs.map(shrink));
    setFiles((cur) => [...cur, ...small.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!memo.trim() && !files.length) return;
    const m = memo, fs = files;
    setMemo(""); setFiles([]);
    await onAdd(m, fs.map((x) => x.file));
  }

  return (
    <form className="add quick" onSubmit={submit}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
      <textarea value={memo} rows={2} onChange={(e) => setMemo(e.target.value)} placeholder={placeholder} aria-label="バックログに追加"
        onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }} />
      {!!files.length && <div className="thumbs">
        {files.map((x, i) => (
          <span key={x.url} className="thumb"><img src={x.url} alt="追加するスクリーンショット" />
            <button type="button" aria-label="この画像を外す" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}>×</button></span>
        ))}
      </div>}
      <div className="row">
        <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        {lead}
        {!lead && <div className="spacer" />}
        <button type="button" className="btn" onClick={() => pick.current?.click()} aria-label="スクリーンショットを追加" title="スクリーンショットを追加">📷{files.length ? ` ${files.length}` : ""}</button>
        <button className="btn primary" type="submit" disabled={busy || (!memo.trim() && !files.length)} title="バックログに追加">{busy ? "追加中…" : "追加"}</button>
      </div>
    </form>
  );
}

export { splitIdea } from "@/lib/idea";
