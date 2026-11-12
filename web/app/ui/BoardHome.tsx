"use client";

import { useEffect, useState } from "react";
import { ACTIVE, STAGES, StageId, Card, api, ago, stageName, cssVar, sortStage, blockersOf, progress, StagesBar, tLabel } from "./common";
import type { RepoSettings, Role } from "@/lib/store";
import { ClaudeLink } from "./ClaudeLink";
import { useRollover } from "./useRollover";
import { BoardAdd, BoardSprint } from "./BoardSprint";
import { BoardCardSheet } from "./RepoBoard";
import { Sheet } from "./Sheet";
import { RepoSettingsSheet } from "./RepoSettings";
export { Sheet };
import type { ClaudeLimits } from "@/lib/limits";

export type BoardData = {
  board: { id: string; name: string; ownerEmail: string; weekTokens?: number; repos: RepoSettings[]; members?: Record<string, Role> };
  role: "owner" | Role; canEdit: boolean; cards: Card[]; failed: string[]; limits?: ClaudeLimits | null;
};

/** One board: its repositories with progress, everything in flight across them, and sharing. */
export function BoardHome({ data, go, reload, toast }: { data: BoardData; go: (full: string | null) => void; reload: () => Promise<void>; toast: (m: string) => void }) {
  const { board, cards, canEdit, role } = data;
  useRollover(board.id, cards, canEdit, reload, toast);
  const [sheet, setSheet] = useState<null | "pick" | "settings" | { repo: string }>(null);
  const [openCard, setOpenCard] = useState<{ repo: string; number: number } | null>(null);
  const active = sortStage(cards.filter((c) => ACTIVE.includes(c.stage)), "building");

  return (
    <>
      <header>
        <div className="crumb">
          <a className="logo" href="#" aria-label="ボード一覧へ" style={{ color: "inherit", textDecoration: "none" }}><b>K</b>ban</a>
          <span className="sep">/</span>
          <h1 style={{ fontFamily: "var(--f-display)", fontSize: 20, fontWeight: 400 }}>{board.name}</h1>
        </div>
        {role !== "owner" && <span className="chip">{board.ownerEmail} のボード · {canEdit ? "編集できる" : "見るだけ"}</span>}
        <div className="spacer" />
        {role === "owner" && <button className="btn small" onClick={() => setSheet("settings")}>ボード設定</button>}
      </header>
      {data.failed.length > 0 && <div className="banner">読み込めなかったリポジトリ: {data.failed.join("、")}(GitHub の権限を確認してください)</div>}

      <BoardAdd data={data} reload={reload} toast={toast} />
      <BoardSprint data={data} reload={reload} toast={toast} onOpen={(c) => setOpenCard({ repo: c.repo, number: c.number })} />

      <div className="home-grid">
        {board.repos.map((r) => {
          const l = cards.filter((c) => c.repo === r.full);
          const n = (s: StageId) => l.filter((c) => c.stage === s).length;
          const nexts = [...sortStage(l.filter((c) => c.stage === "ready"), "ready"), ...sortStage(l.filter((c) => c.stage === "backlog"), "backlog")].slice(0, 2);
          return (
            <div key={r.full} className="repo" role="button" tabIndex={0} onClick={() => go(r.full)} onKeyDown={(e) => e.key === "Enter" && go(r.full)}>
              <div className="btns" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div><div className="nm">{r.name}</div><div className="full">{r.about || `${r.full} · ${tLabel(r.target)}`}</div></div>
                {canEdit && <button className="btn icon" onClick={(e) => { e.stopPropagation(); setSheet({ repo: r.full }); }}>設定</button>}
              </div>
              <div className="counts">
                <div><b>{n("backlog") + n("ready")}</b><span>未着手</span></div>
                <div><b>{l.filter((c) => ACTIVE.includes(c.stage)).length}</b><span>進行中</span></div>
                <div><b>{n("done")}</b><span>完了</span></div>
                <div><b>{l.length ? Math.round((n("done") / l.length) * 100) : 0}<small>%</small></b><span>完了率</span></div>
              </div>
              <StagesBar list={l} />
              <div className="btns" onClick={(e) => e.stopPropagation()}>
                {r.url && <a className="btn small" href={r.url} target="_blank" rel="noreferrer">Web を開く ↗</a>}
                {r.appUrl && <a className="btn small" href={r.appUrl} target="_blank" rel="noreferrer">アプリを開く ↗</a>}
                <a className="btn small ghost" href={`https://github.com/${r.full}`} target="_blank" rel="noreferrer">GitHub ↗</a>
              </div>
              <div className="nexts">{nexts.length ? nexts.map((c, i) => <div key={c.id}>{i ? "その次" : "次にやる"}: {c.title}</div>) : <div>バックログは空です。アイデアを書き込みましょう</div>}</div>
            </div>
          );
        })}
        {canEdit && <button type="button" className="repo add" onClick={() => setSheet("pick")}><b>+ リポジトリを追加</b><span className="note">GitHub のリポジトリから選ぶ</span></button>}
      </div>
      <div className="legend">{STAGES.map((s) => <span key={s.id}><i style={{ background: `var(--s-${s.id})` }} />{s.name}</span>)}</div>

      <section className="overview" aria-label="並行して進めている作業">
        <div className="btns" style={{ justifyContent: "space-between" }}>
          <h1>並行して進めている作業 <span className="num note">{active.length}件</span></h1>
          <span className="note">このボードのすべてのリポジトリの AI実装中〜確認</span>
        </div>
        {active.length ? active.map((c) => (
          <div key={c.id} className="ov-row" role="button" tabIndex={0} onClick={() => setOpenCard({ repo: c.repo, number: c.number })} onKeyDown={(e) => e.key === "Enter" && setOpenCard({ repo: c.repo, number: c.number })}>
            <span className="r">{board.repos.find((r) => r.full === c.repo)?.name}</span>
            <span className="t">{c.title} {blockersOf(c, cards).length > 0 && <span className="chip wait">前提待ち</span>}</span>
            <span className="stagepill" style={cssVar(c.stage)}>{stageName(c.stage)} {Math.round(progress(c) * 100)}%</span>
          </div>
        )) : <div className="note">いま進行中の作業はありません。各リポジトリの「次にやる」から AI に渡しましょう。</div>}
      </section>

      <BoardCardSheet repos={board.repos} boardId={board.id} open={openCard} allCards={cards} canEdit={canEdit} weekLimit={board.weekTokens} reload={reload} toast={toast} onClose={() => setOpenCard(null)} />
      {sheet === "pick" && <Picker boardId={board.id} have={board.repos.map((r) => r.full)} onClose={() => setSheet(null)} done={async (full) => { setSheet(null); await reload(); toast(`${full} を追加しました`); }} toast={toast} />}
      {sheet === "settings" && <BoardSettings data={data} onClose={() => setSheet(null)} reload={reload} toast={toast} />}
      {sheet && typeof sheet === "object" && <RepoSettingsSheet isOwner={role === "owner"} boardId={board.id} repo={board.repos.find((r) => r.full === sheet.repo)!} onClose={() => setSheet(null)} reload={reload} toast={toast} />}
    </>
  );
}

type GhRepo = { full: string; name: string; description: string; pushedAt?: string; private: boolean };
function Picker({ boardId, have, onClose, done, toast }: { boardId: string; have: string[]; onClose: () => void; done: (full: string) => void; toast: (m: string) => void }) {
  const [all, setAll] = useState<GhRepo[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState("");
  useEffect(() => { api<{ repos: GhRepo[] }>("/api/github/repos").then((j) => setAll(j.repos)).catch((e) => setErr(e.message)); }, []);
  const list = (all || []).filter((r) => !have.includes(r.full) && (!q || r.full.toLowerCase().includes(q.toLowerCase())));
  async function add(full: string) {
    setAdding(full);
    try { await api(`/api/boards/${boardId}/repos`, "POST", { full }); done(full); }
    catch (e) { toast((e as Error).message); setAdding(""); }
  }
  return (
    <Sheet title="リポジトリを追加" onClose={onClose}>
      <div className="section">
        <p className="note">連携している GitHub アカウントで push できるリポジトリです。追加すると kban のラベルを作ります。Claude Code との連携は <code>scripts/install.sh</code> で入れます。</p>
        <div className="field"><label htmlFor="pkQ">検索</label><input id="pkQ" value={q} onChange={(e) => setQ(e.target.value)} placeholder="例: kfit" autoFocus /></div>
        {err && <p className="err">{err}</p>}
        {!all && !err && <p className="note">GitHub のリポジトリを読み込み中…</p>}
        <div className="picker-list">
          {list.map((r) => (
            <button key={r.full} type="button" className="pick" disabled={!!adding} onClick={() => add(r.full)}>
              <span><span className="nm">{r.name}</span> <span className="note">{r.full.split("/")[0]}{r.private ? " · 非公開" : ""}{adding === r.full ? " · 追加中…" : ""}</span></span>
              <span className="when">{ago(r.pushedAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** 共有(ボード設定の中に表示する) */
function ShareSection({ data, reload, toast }: { data: BoardData; reload: () => Promise<void>; toast: (m: string) => void }) {
  const b = data.board;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [github, setGithub] = useState("");
  const [busy, setBusy] = useState(false);
  const members = Object.entries(b.members || {});
  async function invite(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api<{ invited: string[]; failed: string[] }>(`/api/boards/${b.id}/members`, "POST", { email, role, github: role === "editor" ? github.trim() : "" });
      toast(r.failed.length ? `共有しました。GitHub の招待に失敗: ${r.failed.join("、")}` : r.invited.length ? `共有し、GitHub の ${r.invited.length} リポジトリに招待しました` : "共有しました");
      setEmail(""); setGithub(""); await reload();
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  async function change(m: string, r: Role | null) {
    try {
      if (r) await api(`/api/boards/${b.id}/members`, "POST", { email: m, role: r });
      else await api(`/api/boards/${b.id}/members?email=${encodeURIComponent(m)}`, "DELETE");
      await reload(); toast(r ? "権限を変えました" : "共有をやめました");
    } catch (e) { toast((e as Error).message); }
  }
  return (
    <>
      <form className="section" onSubmit={invite}>
        <h3>Google アカウントで共有</h3>
        <p className="note">相手がそのメールアドレスの Google アカウントで kban にログインすると、このボードが「共有されたボード」に出ます。GitHub 上の操作はあなたのアカウントで行われるので、相手に GitHub の権限は要りません。</p>
        <div className="row2">
          <div className="field"><label htmlFor="shEmail">メールアドレス</label><input id="shEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" /></div>
          <div className="field"><label htmlFor="shRole">権限</label><select id="shRole" value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="editor">編集できる</option><option value="viewer">見るだけ</option></select></div>
        </div>
        {role === "editor" && <div className="field"><label htmlFor="shGh">GitHub ユーザー名(任意)</label><input id="shGh" value={github} onChange={(e) => setGithub(e.target.value)} placeholder="入れると、このボードの全リポジトリにコラボレーターとして招待します" /></div>}
        <div className="btns"><button className="btn primary" type="submit" disabled={busy}>{busy ? "共有中…" : "共有"}</button></div>
      </form>
      <div className="section">
        <h3>共有している人</h3>
        {members.length ? members.map(([m, r]) => (
          <div key={m} className="btns" style={{ justifyContent: "space-between" }}>
            <span style={{ overflowWrap: "anywhere" }}>{m}</span>
            <div className="btns">
              <select value={r} onChange={(e) => change(m, e.target.value as Role)} aria-label={`${m} の権限`} className="flt"><option value="editor">編集できる</option><option value="viewer">見るだけ</option></select>
              <button className="btn small" onClick={() => change(m, null)}>外す</button>
            </div>
          </div>
        )) : <p className="note">まだ誰とも共有していません。</p>}
        <p className="note">リポジトリ1つだけを共有したいときは、そのリポジトリだけを入れたボードを作って共有してください。</p>
      </div>
    </>
  );
}

function BoardSettings({ data, onClose, reload, toast }: { data: BoardData; onClose: () => void; reload: () => Promise<void>; toast: (m: string) => void }) {
  const [name, setName] = useState(data.board.name);
  const [confirm, setConfirm] = useState(false);
  const [week, setWeek] = useState(data.board.weekTokens ? String(Math.round(data.board.weekTokens / 10000)) : "");
  const man = (v: string) => (v.trim() ? Number(v) * 10000 : null);
  async function save() { try { await api(`/api/boards/${data.board.id}`, "PATCH", { name, weekTokens: man(week) }); await reload(); onClose(); toast("保存しました"); } catch (e) { toast((e as Error).message); } }
  async function del() { try { await api(`/api/boards/${data.board.id}`, "DELETE"); location.hash = ""; toast("ボードを削除しました"); } catch (e) { toast((e as Error).message); } }
  return (
    <Sheet title="ボード設定" onClose={onClose}>
      <div className="section">
        <div className="field"><label htmlFor="bsName">ボード名</label><input id="bsName" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="bsWeek">週の上限のトークン換算(万トークン・任意)</label><input id="bsWeek" inputMode="numeric" value={week} onChange={(e) => setWeek(e.target.value.replace(/\D/g, ""))} placeholder="例: 300(= 300万)" />
          <span className="note">スプリントの見込み(トークン)を「週の上限の何%か」に直すための値です。使用済みの % は Claude から取得できますが(トップ右上のアカウント → 設定 →「Claude の使用率を kban に送る」)、上限のトークン数は取得できないため、目安を入れてください。</span></div>
        <div className="btns"><button className="btn primary" onClick={save} disabled={!name.trim()}>保存</button></div>
      </div>
      <ShareSection data={data} reload={reload} toast={toast} />
      <div className="section">
        <h3>ボードを削除</h3>
        <p className="note">GitHub の Issue は残ります。共有も解除されます。</p>
        {confirm
          ? <div className="btns"><span className="err">本当に削除しますか?</span><button className="btn small" onClick={del}>削除する</button><button className="btn small" onClick={() => setConfirm(false)}>やめる</button></div>
          : <div className="btns"><button className="btn" onClick={() => setConfirm(true)}>削除…</button></div>}
      </div>
    </Sheet>
  );
}

