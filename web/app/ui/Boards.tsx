"use client";

import { useEffect, useState } from "react";
import { api } from "./common";

export type Me = { user: { email: string; name: string }; github: { login: string } | null };
type BoardItem = { id: string; name: string; ownerEmail: string; repos: string[]; members: number; role?: "editor" | "viewer" };

/** Start screen: who I am, GitHub link, my boards and boards shared with me. */
export function Boards({ me, reloadMe, toast }: { me: Me; reloadMe: () => void; toast: (m: string) => void }) {
  const [list, setList] = useState<{ own: BoardItem[]; shared: BoardItem[] } | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const load = () => api<{ own: BoardItem[]; shared: BoardItem[] }>("/api/boards").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try { const { id } = await api<{ id: string }>("/api/boards", "POST", { name }); location.hash = `b/${id}`; }
    catch (e) { toast((e as Error).message); }
  }
  async function unlink() {
    try { await api("/api/me", "DELETE"); reloadMe(); toast("GitHub の連携を外しました"); } catch (e) { toast((e as Error).message); }
  }

  const tile = (b: BoardItem) => (
    <a key={b.id} className="repo" href={`#b/${b.id}`} style={{ color: "inherit", textDecoration: "none" }}>
      <div><div className="nm">{b.name}</div><div className="full">{b.role ? `${b.ownerEmail} のボード · ${b.role === "editor" ? "編集できる" : "見るだけ"}` : b.members ? `${b.members}人と共有中` : "自分だけ"}</div></div>
      <div className="meta">{b.repos.length ? b.repos.map((r) => <span key={r} className="chip">{r}</span>) : <span className="note">リポジトリはまだありません</span>}</div>
    </a>
  );

  return (
    <>
      <header>
        <span className="logo">k<b>ban</b></span>
        <div className="sub">リポジトリごとのバックログから、AIで実装・テスト・デプロイ・確認まで</div>
        <div className="spacer" />
        <span className="note">{me.user.email}</span>
        <a className="btn small" href="/api/auth/signout">ログアウト</a>
      </header>
      {err && <div className="banner">{err}</div>}

      <section className="section">
        <h3>GitHub</h3>
        {me.github
          ? <div className="btns"><span>連携中: <b className="num">{me.github.login}</b></span><a className="btn small" href="/api/github/connect">連携し直す</a><button className="btn small ghost" onClick={unlink}>連携を外す</button></div>
          : <div className="btns"><span className="note">ボードを作ってリポジトリを選ぶには、GitHub アカウントの連携が必要です。共有されたボードは連携なしで使えます。</span><a className="btn primary" href="/api/github/connect">GitHub を連携</a></div>}
      </section>

      <h1>自分のボード</h1>
      <div className="home-grid">
        {list?.own.map(tile)}
        <form className="repo add" onSubmit={create} style={{ cursor: "default" }}>
          <b>+ 新しいボード</b>
          <input className="flt" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 個人アプリ" aria-label="ボード名" disabled={!me.github} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", background: "var(--panel)", width: "80%" }} />
          <button className="btn primary small" type="submit" disabled={!me.github || !name.trim()}>作成</button>
          {!me.github && <span className="note">先に GitHub を連携してください</span>}
        </form>
      </div>

      {!!list?.shared.length && <>
        <h1>共有されたボード</h1>
        <div className="home-grid">{list.shared.map(tile)}</div>
      </>}
      {!list && !err && <p className="note">読み込み中…</p>}
    </>
  );
}
