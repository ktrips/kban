"use client";

import { useState } from "react";
import { api } from "./common";

/** 貼り付ける指示を作る。ドロップやタップの操作の中で呼ぶ(iPhone の Safari は操作の直後でないとコピーできないため、Promise のまま渡す)。 */
export type HandoffResult = { prompt: string; claudeUrl: string };

export function startHandoff(url: string): { result: Promise<HandoffResult>; copied: Promise<boolean> } {
  const result = api<HandoffResult>(url, "POST");
  const copied = (async () => {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": result.then((r) => new Blob([r.prompt], { type: "text/plain" })) })]);
      } else {
        await navigator.clipboard.writeText((await result).prompt);
      }
      return true;
    } catch { return false; }
  })();
  return { result, copied };
}

export function HandoffSheet({ title, r, copied, onClose, toast }: { title: string; r: HandoffResult; copied: boolean; onClose: () => void; toast: (m: string) => void }) {
  const [ok, setOk] = useState(copied);
  async function copy() {
    try { await navigator.clipboard.writeText(r.prompt); setOk(true); toast("コピーしました"); } catch { toast("コピーできませんでした。下の文を長押しでコピーしてください"); }
  }
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label="Claude に貼り付ける">
        <div className="sheet-h"><input value="Claude に貼り付ける" readOnly aria-label="見出し" /><button className="btn small ghost" onClick={onClose}>閉じる</button></div>
        <div className="section">
          <p style={{ margin: 0 }}><b>{title}</b> を進行中にしました。{ok ? "指示をコピー済みです。" : "指示をコピーしてください。"}Claude(VS Code・アプリ・claude.ai)に貼り付けて始めます。</p>
          <div className="btns">
            <button className="btn primary" onClick={copy}>{ok ? "もう一度コピー" : "指示をコピー"}</button>
            <a className="btn" href={r.claudeUrl} target="_blank" rel="noreferrer">claude.ai で開く</a>
          </div>
          <p className="note" style={{ margin: 0 }}>終わったら、Claude が最後のコマンドで kban に報告すると、カードが完了になり、残った課題が新しいアイデアになります。報告されなかったときは、カードの「完了にする」から貼り付けて完了できます。</p>
          <textarea readOnly value={r.prompt} rows={10} style={{ width: "100%", fontFamily: "var(--f-mono, monospace)", fontSize: 12 }} aria-label="貼り付ける指示" onFocus={(e) => e.currentTarget.select()} />
        </div>
      </aside>
    </div>
  );
}
