"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STAGES, StageId } from "@/lib/stages";
import type { Card, Project } from "@/lib/github";

const api = async (url: string, method = "GET", body?: unknown) => {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};
const cardUrl = (c: Card) => `/api/cards/${c.repo}/${c.number}`;
const tLabel = (t: Card["target"]) => (t === "ios" ? "iOS" : t === "both" ? "iOS+Web" : "Web");

export default function Board() {
  const [cards, setCards] = useState<Card[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState<StageId>("idea");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [idea, setIdea] = useState("");
  const [addRepo, setAddRepo] = useState("");

  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2400); };

  const load = useCallback(async () => {
    try {
      const j = await api("/api/cards");
      setCards(j.cards); setProjects(j.projects); setErr("");
      setAddRepo((r) => r || j.projects[0]?.repo || "");
    } catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // GitHub Actions move labels; poll to follow them
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const visible = useMemo(() => cards.filter((c) => !filter || c.repo === filter), [cards, filter]);
  const by = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s.id, [] as Card[]])) as Record<StageId, Card[]>;
    const pr = { 高: 0, 中: 1, 低: 2 };
    visible.forEach((c) => m[c.stage].push(c));
    Object.values(m).forEach((a) => a.sort((x, y) => pr[x.priority] - pr[y.priority] || y.updatedAt.localeCompare(x.updatedAt)));
    return m;
  }, [visible]);
  const open = cards.find((c) => c.id === openId) || null;

  async function run(c: Card, key: string, fn: () => Promise<unknown>, done: string) {
    setBusy((b) => ({ ...b, [c.id]: key }));
    try { await fn(); toast(done); await load(); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy((b) => { const n = { ...b }; delete n[c.id]; return n; }); }
  }
  const move = (c: Card, stage: StageId) =>
    run(c, "move", () => api(cardUrl(c), "PATCH", { stage }), `${STAGES.find((s) => s.id === stage)?.name}に移動しました`);
  const patch = (c: Card, body: Record<string, unknown>) => run(c, "save", () => api(cardUrl(c), "PATCH", body), "保存しました");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim() || !addRepo) return;
    try { await api("/api/cards", "POST", { repo: addRepo, title: idea.trim() }); setIdea(""); setActive("idea"); toast("アイデアを追加しました"); load(); }
    catch (e) { toast((e as Error).message); }
  }

  return (
    <div className="wrap">
      <header>
        <div>
          <div className="logo">ken<b>ban</b></div>
          <div className="sub">アイデア → AI実装 → テスト → デプロイ → 確認</div>
        </div>
        <div className="spacer" />
        <select className="flt" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="プロジェクトで絞り込み">
          <option value="">すべてのプロジェクト</option>
          {projects.map((p) => <option key={p.repo} value={p.repo}>{p.name}</option>)}
        </select>
        <button className="btn" type="button" onClick={load}>更新</button>
      </header>

      <form className="add" onSubmit={add}>
        <input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="アイデアをひとこと… Issueとして保存されます" aria-label="新しいアイデア" />
        <select value={addRepo} onChange={(e) => setAddRepo(e.target.value)} aria-label="プロジェクト">
          {projects.map((p) => <option key={p.repo} value={p.repo}>{p.name}</option>)}
        </select>
        <button className="btn primary" type="submit">追加</button>
      </form>

      {err && <div className="banner">読み込めませんでした: {err}</div>}

      <div className="strip-scroll"><div className="strip">
        {STAGES.map((s, i) => {
          const n = by[s.id].length; const wip = "wip" in s ? s.wip : 0;
          return (
            <span key={s.id} style={{ display: "contents" }}>
              {i > 0 && <span className="arrow" aria-hidden>›</span>}
              <button type="button" className="st" style={{ ["--c" as string]: `var(--s-${s.id})` }} aria-pressed={active === s.id} onClick={() => setActive(s.id)}>
                <span className="dot" />{s.name}<span className={`n ${wip && n > wip ? "wip" : ""}`}>{n}{wip ? `/${wip}` : ""}</span>
              </button>
            </span>
          );
        })}
      </div></div>

      <div className="board-scroll"><div className="board">
        {STAGES.map((s) => (
          <section key={s.id} className={`lane ${active === s.id ? "active" : ""}`} style={{ ["--c" as string]: `var(--s-${s.id})` }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { const c = cards.find((x) => x.id === e.dataTransfer.getData("text/plain")); if (c && c.stage !== s.id) move(c, s.id); }}>
            <h2>{s.name}<span className="n">{by[s.id].length}</span></h2>
            <div className="hint">{s.hint}</div>
            {by[s.id].length === 0 && <div className="empty">{s.id === "idea" ? "上の入力欄からアイデアを追加" : "ここに来るカードはまだありません"}</div>}
            {by[s.id].map((c) => (
              <article key={c.id} className="card" tabIndex={0} draggable style={{ ["--c" as string]: `var(--s-${c.stage})` }}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                onClick={() => setOpenId(c.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(c.id)}>
                <div className="t">{c.title}</div>
                <div className="meta">
                  <span className="chip">{c.project}</span>
                  <span className="chip">{tLabel(c.target)}</span>
                  {c.priority === "高" && <span className="chip p-高">優先度 高</span>}
                  <span className="chip mono">#{c.number}</span>
                </div>
                {(c.stage === "testing" || c.stage === "verifying") && c.criteria.length > 0 && (
                  <div className="prog"><i style={{ width: `${(c.criteria.filter((x) => x.done).length / c.criteria.length) * 100}%` }} /></div>
                )}
                {busy[c.id] && <div className="note">処理中…</div>}
              </article>
            ))}
          </section>
        ))}
      </div></div>

      {open && <Sheet key={open.id} card={open} busy={busy[open.id]} onClose={() => setOpenId(null)} move={move} patch={patch} run={run} />}
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  );
}

function Sheet({ card: c, busy, onClose, move, patch, run }: {
  card: Card; busy?: string; onClose: () => void;
  move: (c: Card, s: StageId) => void; patch: (c: Card, b: Record<string, unknown>) => void;
  run: (c: Card, k: string, fn: () => Promise<unknown>, done: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(c.title);
  const [ideaT, setIdeaT] = useState(c.idea);
  const [spec, setSpec] = useState(c.spec);
  const [crit, setCrit] = useState(c.criteria.map((x) => x.text).join("\n"));
  const [prompt, setPrompt] = useState(c.prompt);
  const [feedback, setFeedback] = useState("");
  const stage = STAGES.find((s) => s.id === c.stage)!;

  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const dirty = title !== c.title || ideaT !== c.idea || spec !== c.spec || prompt !== c.prompt || crit !== c.criteria.map((x) => x.text).join("\n");
  const saveAll = () => patch(c, {
    title, idea: ideaT, spec, prompt,
    criteria: crit.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: c.criteria.find((x) => x.text === text)?.done ?? false })),
  });
  const toggle = (i: number) => patch(c, { criteria: c.criteria.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) });
  const aiSpec = () => run(c, "spec", () => fetch("/api/ai/spec", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id }) }).then((r) => { if (!r.ok) throw new Error("AIで仕様化できませんでした"); }), "仕様と受入条件を作りました");
  const aiFix = () => run(c, "fix", () => fetch("/api/ai/fix", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id, feedback }) }).then((r) => { if (!r.ok) throw new Error("差し戻せませんでした"); }), "Claude Code に修正を依頼しました");

  const checks = (
    <ul className="checks">
      {c.criteria.length === 0 && <li className="note">受入条件がありません</li>}
      {c.criteria.map((x, i) => (
        <li key={i}><input type="checkbox" id={`ck${i}`} checked={x.done} onChange={() => toggle(i)} /><label htmlFor={`ck${i}`}>{x.text}</label></li>
      ))}
    </ul>
  );

  let action: React.ReactNode = null;
  switch (c.stage) {
    case "idea": action = <>
      <h3>1. AIで仕様化</h3>
      <p className="note">アイデアから仕様・受入条件・Claude Code への指示を作り、Issue 本文に書き込みます。</p>
      <div className="btns"><button className="btn primary" disabled={!!busy} onClick={aiSpec}>{busy === "spec" ? "仕様化中…" : "AIで仕様化"}</button><button className="btn" onClick={() => move(c, "spec")}>手で書く</button></div>
    </>; break;
    case "spec": action = <>
      <h3>2. Claude Code に渡す</h3>
      <p className="note">Issue に <code>claude</code> ラベルを付けます。GitHub Actions の Claude Code が実装を始め、PR を作ります。</p>
      <div className="btns"><button className="btn primary" disabled={!!busy} onClick={() => move(c, "queued")}>AIに指示する</button></div>
    </>; break;
    case "queued": case "building": action = <>
      <h3>{c.stage === "queued" ? "3. Claude Code の起動待ち" : "4. 実装中"}</h3>
      <p className="note">PR が開くと自動で「テスト」に進みます。</p>
      <div className="btns"><a className="btn" href={c.url} target="_blank" rel="noreferrer">Issue を開く</a>{c.pr && <a className="btn" href={c.pr} target="_blank" rel="noreferrer">PR を開く</a>}</div>
    </>; break;
    case "testing": case "verifying": action = <>
      <h3>{c.stage === "testing" ? "5. テスト" : "7. 確認"}</h3>
      <div className="btns">
        {c.pr && <a className="btn" href={c.pr} target="_blank" rel="noreferrer">PR を開く</a>}
        {c.preview && (/^https?:/.test(c.preview) ? <a className="btn" href={c.preview} target="_blank" rel="noreferrer">プレビューを開く</a> : <span className="chip">{c.preview}</span>)}
      </div>
      {checks}
      <div className="field"><label htmlFor="fb">指摘(差し戻すとき)</label><textarea id="fb" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="例: 横向きでボタンが切れる" /></div>
      <div className="btns">
        {c.stage === "testing"
          ? <button className="btn primary" disabled={!!busy} onClick={() => move(c, "deploying")}>テスト合格 → デプロイへ</button>
          : <button className="btn primary" disabled={!!busy} onClick={() => move(c, "done")}>OK → 完了(Issue を閉じる)</button>}
        <button className="btn" disabled={!!busy} onClick={aiFix}>{busy === "fix" ? "依頼中…" : "AIに差し戻す"}</button>
      </div>
      <p className="note">差し戻すと、PR に <code>@claude</code> 付きの修正指示をコメントします。</p>
    </>; break;
    case "deploying": action = <>
      <h3>6. デプロイ</h3>
      <p className="note">Web は Vercel のプレビュー、iOS は TestFlight へのアップロードが終わると「確認」に進みます。</p>
      <div className="btns">{c.pr && <a className="btn" href={c.pr} target="_blank" rel="noreferrer">PR を開く</a>}<button className="btn" onClick={() => move(c, "verifying")}>手動で確認へ</button></div>
    </>; break;
    case "done": action = <><h3>完了</h3><a className="btn" href={c.url} target="_blank" rel="noreferrer">Issue を開く</a></>;
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label="カードの詳細" style={{ ["--c" as string]: `var(--s-${c.stage})` }}>
        <div className="sheet-h"><input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="タイトル" /><button className="btn small ghost" onClick={onClose}>閉じる</button></div>
        <div className="meta"><span className="chip" style={{ color: `var(--s-${c.stage})`, borderColor: "currentColor" }}>{stage.name}</span><span className="chip">{c.project}</span><span className="chip mono">#{c.number}</span></div>
        <div className="section act">{action}</div>
        <div className="row2">
          <div className="field"><label htmlFor="pri">優先度</label><select id="pri" value={c.priority} onChange={(e) => patch(c, { priority: e.target.value })}>{["高", "中", "低"].map((v) => <option key={v}>{v}</option>)}</select></div>
          <div className="field"><label htmlFor="stg">工程</label><select id="stg" value={c.stage} onChange={(e) => move(c, e.target.value as StageId)}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="idea">アイデア</label><textarea id="idea" value={ideaT} onChange={(e) => setIdeaT(e.target.value)} /></div>
        <div className="field"><label htmlFor="spec">仕様</label><textarea id="spec" style={{ minHeight: 110 }} value={spec} onChange={(e) => setSpec(e.target.value)} /></div>
        <div className="field"><label htmlFor="crit">受入条件(1行に1つ)</label><textarea id="crit" value={crit} onChange={(e) => setCrit(e.target.value)} /></div>
        <div className="field"><label htmlFor="prompt">Claude Code への指示</label><textarea id="prompt" className="code" value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>
        <div className="btns">
          <button className="btn primary" disabled={!dirty || !!busy} onClick={saveAll}>Issue に保存</button>
          {c.stage !== "idea" && <button className="btn" disabled={!!busy} onClick={aiSpec}>AIで仕様を作り直す</button>}
        </div>
      </aside>
    </div>
  );
}
