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
export function QuickAdd({ placeholder, busy, onAdd }: { placeholder: string; busy: boolean; onAdd: (memo: string, files: File[]) => Promise<void> }) {
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
        <button type="button" className="btn" onClick={() => pick.current?.click()}>📷 スクリーンショット</button>
        <div className="spacer" />
        <button className="btn primary" type="submit" disabled={busy || (!memo.trim() && !files.length)}>{busy ? "追加中…" : "バックログに追加"}</button>
      </div>
    </form>
  );
}

/** アイデア本文から kban の添付画像を取り出す(表示は kban の画像ルート経由)。 */
export function splitIdea(idea: string, imgBase: string) {
  const re = /!\[[^\]]*\]\(https:\/\/github\.com\/[^)\s]+\/blob\/kban-attachments\/attachments\/([\w.-]+)\?raw=true\)/g;
  const images = [...idea.matchAll(re)].map((m) => `${imgBase}/${m[1]}`);
  return { text: idea.replace(re, "").trim(), images };
}
