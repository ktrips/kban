"use client";

import { useEffect } from "react";

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-h"><input value={title} readOnly aria-label="見出し" /><button className="btn small ghost" onClick={onClose}>閉じる</button></div>
        {children}
      </aside>
    </div>
  );
}
