"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./common";
import { LimitsSetup } from "./Limits";
import { Sheet } from "./BoardHome";
import { logout } from "../actions";
import type { ClaudeLimits } from "@/lib/limits";
import type { RepoSettings } from "@/lib/store";

export type Me = { user: { email: string; name: string }; github: { login: string } | null; limits?: ClaudeLimits | null; limitsLinked?: boolean };
type BoardItem = { id: string; name: string; ownerEmail: string; repos: RepoSettings[]; members: number; role?: "editor" | "viewer" };

/** Same repository, same color, wherever it appears. */
const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

/** 「Web」「iOS+Web」の表記。URL がある側だけボタンにする。 */
function Platform({ repo }: { repo: RepoSettings }) {
  const web = repo.url ? <a href={repo.url} target="_blank" rel="noreferrer">Web</a> : "Web";
  const ios = repo.appUrl ? <a href={repo.appUrl} target="_blank" rel="noreferrer">iOS</a> : "iOS";
  if (repo.target === "ios") return <span className="life-kind">{ios}</span>;
  if (repo.target === "both") return <span className="life-kind">{ios}+{web}</span>;
  return <span className="life-kind">{web}</span>;
}

/** Start screen: what I want to make and keep track of, one big card per repository. */
export function Boards({ me, reloadMe, toast }: { me: Me; reloadMe: () => void; toast: (m: string) => void }) {
  const [list, setList] = useState<{ own: BoardItem[]; shared: BoardItem[] } | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [settings, setSettings] = useState(false);
  const load = () => api<{ own: BoardItem[]; shared: BoardItem[] }>("/api/boards").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try { const { id } = await api<{ id: string }>("/api/boards", "POST", { name }); location.hash = `b/${id}`; }
    catch (e) { toast((e as Error).message); }
  }

  const board = (b: BoardItem) => (
    <section key={b.id} className="life">
      <div className="life-h">
        <a className="life-board" href={`#b/${b.id}`}>{b.name}</a>
        <span className="note">{b.role ? `${b.ownerEmail} のボード · ${b.role === "editor" ? "編集できる" : "見るだけ"}` : b.members ? `${b.members}人と共有中` : "自分だけ"}</span>
        <div className="spacer" />
        <a className="btn small" href={`#b/${b.id}`}>ボードを開く</a>
      </div>
      {b.repos.length ? (
        <div className="life-grid">
          {b.repos.map((r) => (
            <article key={r.full} className="life-repo" style={{ ["--h" as string]: hue(r.full) } as React.CSSProperties}>
              <a className="life-hit" href={`#b/${b.id}/${r.full}`} aria-label={`${r.name} を開く`} />
              <div className="life-nm">{r.name}</div>
              {r.about
                ? <p className="life-about">{r.about}</p>
                : <p className="life-about none">何を作りたいか、何を続けたいかを書きましょう。ボードのリポジトリの「設定」→ アプリの概要</p>}
              <div className="life-foot"><span className="num">{r.full}</span><Platform repo={r} /></div>
            </article>
          ))}
        </div>
      ) : <a className="life-repo add" href={`#b/${b.id}`}><b>+ リポジトリを追加</b><span className="note">ボードを開いて GitHub のリポジトリを選ぶ</span></a>}
    </section>
  );

  return (
    <>
      <header>
        <span className="logo"><b>K</b>ban</span><span className="tagline">Kanban for Life</span>
        <div className="spacer" />
        <Account me={me} onSettings={() => setSettings(true)} />
      </header>
      {err && <div className="banner">{err}</div>}

      <div className="life-hero">
        <h1>人生で作りたいモノ、続けたいコト</h1>
        <p>次に作りたい物を積み上げて、すぐAIで実現する</p>
      </div>

      {!me.github && (
        <div className="banner btns">
          <span>ボードを作ってリポジトリを選ぶには、GitHub の連携が必要です。共有されたボードは連携なしで使えます。</span>
          <a className="btn small primary" href="/api/github/connect">GitHub を連携</a>
        </div>
      )}

      {list?.own.map(board)}
      {!!list?.shared.length && <><h2 className="life-sec">共有されたボード</h2>{list.shared.map(board)}</>}
      {!list && !err && <p className="note">読み込み中…</p>}

      <form className="add" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="+ 新しいボード(例: 個人アプリ)" aria-label="ボード名" disabled={!me.github} />
        <button className="btn primary small" type="submit" disabled={!me.github || !name.trim()}>作成</button>
      </form>

      {settings && <Settings me={me} toast={toast} onClose={() => setSettings(false)} />}
    </>
  );
}

/** Top-right account icon: settings and sign-out. */
function Account({ me, onSettings }: { me: Me; onSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away); window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  const initial = (me.user.name || me.user.email || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="acct" ref={ref}>
      <button className="acct-btn" aria-label="アカウント" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{initial}</button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-who"><b>{me.user.name || me.user.email}</b><span className="note">{me.user.email}</span>{me.github && <span className="note">GitHub: {me.github.login}</span>}</div>
          <a role="menuitem" href="/api/github/connect">{me.github ? "GitHub 再連携" : "GitHub を連携"}</a>
          <button role="menuitem" onClick={() => { setOpen(false); onSettings(); }}>設定</button>
          <form action={logout}><button role="menuitem" type="submit">ログアウト</button></form>
        </div>
      )}
    </div>
  );
}

function Settings({ me, toast, onClose }: { me: Me; toast: (m: string) => void; onClose: () => void }) {
  const [token, setToken] = useState("");
  async function makeToken() {
    if (token || confirm("iPhone 用のトークンを作ります。前に作ったトークンは使えなくなります。")) {
      try { setToken((await api<{ token: string }>("/api/me/capture", "POST")).token); } catch (e) { toast((e as Error).message); }
    }
  }
  return (
    <Sheet title="設定" onClose={onClose}>
      <section className="section">
        <h3>iPhone から追加</h3>
        <p className="note" style={{ margin: 0 }}>iOS アプリを入れると、写真やスクリーンショットの「共有」から kban を選ぶだけでバックログに入ります。アプリの「トークン」欄に貼ることもできます。</p>
        <div className="btns">
          <button className="btn small" onClick={makeToken}>{token ? "トークンを作り直す" : "iPhone 用トークンを作る"}</button>
          {token && <><input className="mono" readOnly value={token} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 200, border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", background: "var(--panel)" }} aria-label="iPhone 用トークン" />
            <button className="btn small" onClick={() => navigator.clipboard.writeText(token).then(() => toast("コピーしました"))}>コピー</button></>}
        </div>
      </section>

      <LimitsSetup me={me} toast={toast} />
    </Sheet>
  );
}
