"use client";

import { useState } from "react";
import { api, tLabel } from "./common";
import type { RepoSettings } from "@/lib/store";

/** リポジトリページの上部: 説明(AI にも渡る概要)と、Web / アプリ / GitHub へのリンク。その場で編集できる */
export function RepoInfo({ boardId, repo, canEdit, reload, toast }: { boardId: string; repo: RepoSettings; canEdit: boolean; reload: () => Promise<void>; toast: (m: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ about: repo.about, url: repo.url || "", appUrl: repo.appUrl || "" });
  const start = () => { setF({ about: repo.about, url: repo.url || "", appUrl: repo.appUrl || "" }); setEdit(true); };
  async function save() {
    setBusy(true);
    try { await api(`/api/boards/${boardId}/repos`, "PATCH", { full: repo.full, ...f }); await reload(); setEdit(false); toast("保存しました"); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  }
  const links = (
    <div className="btns">
      {repo.url && <a className="btn small" href={repo.url} target="_blank" rel="noreferrer">Web を開く ↗</a>}
      {repo.appUrl && <a className="btn small" href={repo.appUrl} target="_blank" rel="noreferrer">アプリを開く ↗</a>}
      <a className="btn small ghost" href={`https://github.com/${repo.full}`} target="_blank" rel="noreferrer">GitHub ↗</a>
    </div>
  );
  if (!edit) return (
    <section className="section repo-info">
      <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{repo.about || <span className="note">説明はまだありません{canEdit ? "。「編集」から書くと、AI が優先順位や仕様を考えるときにも使います" : ""}</span>}</p>
      <div className="btns" style={{ justifyContent: "space-between", alignItems: "center" }}>
        {links}
        <span className="note">{tLabel(repo.target)}</span>
        {canEdit && <button type="button" className="btn small" onClick={start}>編集</button>}
      </div>
    </section>
  );
  return (
    <section className="section repo-info">
      <div className="field"><label htmlFor="riAbout">説明(AI が優先順位や仕様を考えるときにも使います)</label><textarea id="riAbout" value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} /></div>
      <div className="row2">
        <div className="field"><label htmlFor="riUrl">Web の URL</label><input id="riUrl" type="url" inputMode="url" placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></div>
        <div className="field"><label htmlFor="riApp">アプリの URL(TestFlight / App Store)</label><input id="riApp" type="url" inputMode="url" placeholder="https://testflight.apple.com/join/…" value={f.appUrl} onChange={(e) => setF({ ...f, appUrl: e.target.value })} /></div>
      </div>
      <div className="btns"><button className="btn primary" disabled={busy} onClick={save}>{busy ? "保存中…" : "保存"}</button><button className="btn" disabled={busy} onClick={() => setEdit(false)}>キャンセル</button></div>
    </section>
  );
}
