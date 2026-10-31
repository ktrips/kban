"use client";

import { useMemo, useState, useEffect } from "react";
import { ACTIVE, STAGES, StageId, Card, api, SI, stageName, cssVar, ordered, sortStage, blockersOf, progress, StagesBar } from "./common";
import type { Size } from "@/lib/stages";
import type { Priority } from "@/lib/ai";
import type { RepoSettings } from "@/lib/store";
import { QuickAdd, splitIdea } from "./QuickAdd";
import { ProgressPanel } from "./Progress";
import { EstimateBox, usedBy } from "./Usage";
import { useClaudeStatus, linked } from "./ClaudeLink";

/* ---------------- repo board ---------------- */
type BoardProps = {
  budget?: number; boardId: string; boardName: string; canEdit: boolean; repo: RepoSettings; repos: RepoSettings[]; cards: Card[];
  go: (full: string | null) => void; reload: () => Promise<void>; toast: (m: string) => void;
};

export function RepoBoard({ budget, boardId, boardName, canEdit, repo, repos, cards: allCards, go, reload, toast }: BoardProps) {
  const cards = useMemo(() => allCards.filter((c) => c.repo === repo.full), [allCards, repo.full]);
  const [stage, setStage] = useState<StageId>("backlog");
  const [openNo, setOpenNo] = useState<number | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [proposal, setProposal] = useState<Priority[] | "loading" | null>(null);
  const base = `/api/boards/${boardId}/r/${repo.full}`;

  const by = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.id, sortStage(cards.filter((c) => c.stage === s.id), s.id)])) as Record<StageId, Card[]>, [cards]);
  const act = cards.filter((c) => ACTIVE.includes(c.stage));
  const waiting = act.filter((c) => blockersOf(c, cards).length).length;
  const next = by.ready[0] || by.backlog[0];
  const rate = cards.length ? Math.round((cards.reduce((a, c) => a + progress(c), 0) / cards.length) * 100) : 0;
  const open = cards.find((c) => c.number === openNo) || null;

  async function run(key: string, label: string, fn: () => Promise<unknown>, done: string) {
    setBusy((b) => ({ ...b, [key]: label }));
    try { await fn(); await reload(); toast(done); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy((b) => { const n = { ...b }; delete n[key]; return n; }); }
  }
  const patch = (c: Card, body: Record<string, unknown>, done = "保存しました") => run(String(c.number), "save", () => api(`${base}/cards/${c.number}`, "PATCH", body), done);
  const move = (c: Card, s: StageId) => {
    if (s === "building" && blockersOf(c, cards).length) toast(`先に「${blockersOf(c, cards)[0].title}」が終わっている必要があります`);
    const rank = ordered(s) ? Math.max(0, ...by[s].map((x) => (x.rank < 100000 ? x.rank : 0))) + 1 : undefined;
    return patch(c, { stage: s, rank }, s === "building" ? "Claude Code に渡しました" : `${stageName(s)}に移動しました`);
  };
  const reorder = (c: Card, to: number) => {
    const list = by[c.stage].filter((x) => x.number !== c.number);
    list.splice(Math.max(0, Math.min(to, list.length)), 0, c);
    return run("order", "order", () => api(`${base}/order`, "POST", { numbers: list.map((x) => x.number) }), "順番を変えました");
  };
  const plan = (c: Card) => run(String(c.number), "plan", () => api(`${base}/ai`, "POST", { action: "plan", number: c.number }), "仕様と進め方を作りました");
  const fix = (c: Card, feedback: string) => run(String(c.number), "fix", () => api(`${base}/ai`, "POST", { action: "fix", number: c.number, feedback }), "Claude Code に修正を依頼しました");
  async function prioritize() {
    setProposal("loading");
    try { setProposal((await api<{ items: Priority[] }>(`${base}/ai`, "POST", { action: "prioritize" })).items); }
    catch (e) { setProposal(null); toast((e as Error).message); }
  }
  async function applyProposal(items: Priority[]) {
    setProposal(null);
    // backlog and ready keep their own lanes; each lane takes the proposed relative order
    const order = (s: StageId) => items.filter((x) => by[s].some((c) => c.number === x.number));
    await run("order", "order", async () => {
      for (const s of ["ready", "backlog"] as StageId[]) {
        const o = order(s);
        if (o.length) await api(`${base}/order`, "POST", { numbers: o.map((x) => x.number), items: o });
      }
    }, "提案の順番にしました");
  }
  async function add(memo: string, files: File[]) {
    const form = new FormData();
    form.set("memo", memo);
    files.forEach((f) => form.append("images", f));
    await run("add", "add", async () => {
      const r = await fetch(`${base}/cards`, { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    }, "バックログに追加しました");
    setStage("backlog");
  }

  const [dragNo, setDragNo] = useState<number | null>(null);
  const drop = (s: StageId, overNo?: number) => {
    const c = cards.find((x) => x.number === dragNo); setDragNo(null);
    if (!c) return;
    if (c.stage !== s) { move(c, s); return; }
    if (ordered(s) && overNo !== undefined && overNo !== c.number) reorder(c, by[s].filter((x) => x.number !== c.number).findIndex((x) => x.number === overNo));
  };

  return (
    <>
      <header>
        <div className="crumb">
          <a className="logo" href="#" aria-label="ボード一覧へ" style={{ color: "inherit", textDecoration: "none" }}><b>K</b>ban</a>
          <span className="sep">/</span>
          <button type="button" className="btn ghost" onClick={() => go(null)}>{boardName}</button>
          <span className="sep">/</span>
          <select value={repo.full} onChange={(e) => go(e.target.value)} aria-label="リポジトリを切り替え">
            {repos.map((r) => <option key={r.full} value={r.full}>{r.name}</option>)}
          </select>
        </div>
        <span className="chip mono">{repo.full}</span>
        {!canEdit && <span className="chip">見るだけ</span>}
        <div className="spacer" />
        <a className="btn small" href={`https://github.com/${repo.full}/issues?q=label%3Akban`} target="_blank" rel="noreferrer">GitHub の Issue</a>
      </header>

      {canEdit && <QuickAdd placeholder={`${repo.name} で次に作りたいことを書く…`} busy={!!busy.add} onAdd={add} />}

      <div className="summary">
        <div className="sum next">
          <span className="lbl">次にやる</span>
          {next ? <>
            <span className="t">{next.title}</span>
            <span className="note">{next.reason || (next.stage === "ready" ? "仕様と進め方ができています" : "まず仕様と進め方を作りましょう")}</span>
            <div className="btns">{!canEdit ? null : next.stage === "ready"
              ? <button className="btn small primary" onClick={() => setOpenNo(next.number)}>AIに渡す</button>
              : <button className="btn small primary" disabled={!!busy[next.number]} onClick={() => plan(next)}>{busy[next.number] === "plan" ? "作成中…" : "AIで進め方を作る"}</button>}</div>
          </> : <span className="note">バックログにアイデアを書き込むと、ここに次の一手が出ます</span>}
        </div>
        <div className="sum"><span className="lbl">並行して進行中</span><span className="big">{act.length}<small className="note"> / WIP 3</small></span>
          <span className="note">{waiting ? `${waiting}件が前提待ち` : act.length > 3 ? "多すぎます。絞りましょう" : "同時に進めるのは3件まで"}</span></div>
        <div className="sum"><span className="lbl">どこまで終わったか</span><span className="big">{rate}<small className="note">%</small></span><StagesBar list={cards} /><span className="note">完了 {by.done.length} / 全 {cards.length} 件</span></div>
      </div>

      <div className="strip-scroll"><div className="strip">
        {STAGES.map((s, i) => {
          const n = by[s.id].length; const wip = "wip" in s ? s.wip : 0;
          return (
            <span key={s.id} style={{ display: "contents" }}>
              {i > 0 && <span className="arrow" aria-hidden>›</span>}
              <button type="button" className="st" style={cssVar(s.id)} aria-pressed={stage === s.id} onClick={() => setStage(s.id)}>
                <span className="dot" />{s.name}<span className={`n ${wip && n > wip ? "wip" : ""}`}>{n}{wip ? `/${wip}` : ""}</span>
              </button>
            </span>
          );
        })}
      </div></div>

      {proposal === "loading" && <div className="proposal"><h1>AIが優先順位を考えています…</h1></div>}
      {Array.isArray(proposal) && (
        <div className="proposal">
          <div className="btns" style={{ justifyContent: "space-between" }}><h1>AIの提案: この順番で進める</h1>
            <div className="btns"><button className="btn small primary" onClick={() => applyProposal(proposal)}>この順番にする</button><button className="btn small" onClick={() => setProposal(null)}>やめる</button></div></div>
          <ol>{proposal.map((x) => {
            const c = cards.find((y) => y.number === x.number); if (!c) return null;
            const deps = x.dependsOn.map((n) => cards.find((y) => y.number === n)).filter(Boolean) as Card[];
            return <li key={x.number}><b>{c.title}</b> {x.size && <span className="chip">{x.size}</span>} {x.parallel && <span className="chip par">並行可</span>}
              <small>{x.reason}{deps.length ? ` · 前提: ${deps.map((d) => d.title).join("、")}` : ""}</small></li>;
          })}</ol>
        </div>
      )}

      <div className="board-scroll"><div className="board">
        {STAGES.map((s) => (
          <section key={s.id} className={`lane ${stage === s.id ? "active" : ""}`} style={cssVar(s.id)}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); drop(s.id); }}>
            <h2>{s.name}<span className="n">{by[s.id].length}{"wip" in s ? ` / ${s.wip}` : ""}</span></h2>
            <div className="hint">{s.hint}
              {s.id === "backlog" && canEdit && <button className="btn icon" disabled={by.backlog.length + by.ready.length < 2 || proposal === "loading"} onClick={prioritize}>AIで優先順位</button>}</div>
            {by[s.id].length === 0 && <div className="empty">{s.id === "backlog" ? "上の欄から書き込む" : "まだありません"}</div>}
            {by[s.id].map((c, i) => <CardView key={c.id} canEdit={canEdit} c={c} i={i} n={by[s.id].length} all={cards} busy={busy[c.number]}
              onOpen={() => setOpenNo(c.number)} onPlan={() => plan(c)} onMove={(d) => reorder(c, i + d)}
              onDragStart={() => setDragNo(c.number)} onDropOn={() => drop(s.id, c.number)} />)}
          </section>
        ))}
      </div></div>

      {open && <Sheet imgBase={`${base}/img`} base={base} budget={budget} boardCards={allCards} canEdit={canEdit} key={`${open.id}:${open.updatedAt}`} c={open} all={cards} busy={busy[open.number]} onClose={() => setOpenNo(null)} move={move} patch={patch} plan={plan} fix={fix} />}
    </>
  );
}

function CardView({ canEdit, c, i, n, all, busy, onOpen, onPlan, onMove, onDragStart, onDropOn }: {
  canEdit: boolean; c: Card; i: number; n: number; all: Card[]; busy?: string; onOpen: () => void; onPlan: () => void; onMove: (d: number) => void; onDragStart: () => void; onDropOn: () => void;
}) {
  const ord = ordered(c.stage);
  const edit = canEdit;
  const bl = blockersOf(c, all);
  const sd = c.steps.filter((s) => s.done).length;
  const pct = Math.round(progress(c) * 100);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <article className="card" tabIndex={0} draggable={edit} style={cssVar(c.stage)} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(c.number)); onDragStart(); }}
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("dragover"); }}
      onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove("dragover"); onDropOn(); }}>
      <div className="top">
        {ord && <span className={`rank ${i === 0 ? "first" : ""}`}>{i + 1}</span>}
        <div className="t">{c.title}</div>
        {ord && edit && <div className="ord" onClick={stop}>
          <button className="btn icon" disabled={i === 0} onClick={() => onMove(-1)} aria-label="上へ">▲</button>
          <button className="btn icon" disabled={i === n - 1} onClick={() => onMove(1)} aria-label="下へ">▼</button>
        </div>}
      </div>
      <div className="meta">
        {c.size && <span className="chip">{c.size}</span>}
        {c.steps.length > 0 && <span className="chip">進め方 {sd}/{c.steps.length}</span>}
        {(c.stage === "testing" || c.stage === "verifying") && c.criteria.length > 0 && <span className="chip">受入 {c.criteria.filter((x) => x.done).length}/{c.criteria.length}</span>}
        {bl.length ? <span className="chip wait" title={bl.map((x) => x.title).join("、")}>前提待ち {bl.length}</span> : c.parallel && ord ? <span className="chip par">並行可</span> : null}
        <span className="chip mono">#{c.number}</span>
      </div>
      {c.reason && ord && <div className="why">{c.reason}</div>}
      {!ord && c.stage !== "done" && <div className="prog"><i style={{ width: `${pct}%`, background: "var(--c)" }} /></div>}
      {edit && c.stage === "backlog" && <div className="next" onClick={stop}><button className="btn small" disabled={!!busy} onClick={onPlan}>{busy === "plan" ? "作成中…" : "AIで進め方を作る"}</button></div>}
      {edit && c.stage === "ready" && <div className="next"><button className="btn small primary">AIに渡す</button></div>}
      {busy && busy !== "plan" && <div className="note">更新中…</div>}
    </article>
  );
}

function Sheet({ imgBase, base, budget, boardCards, canEdit, c, all, busy, onClose, move, patch, plan, fix }: {
  imgBase: string; base: string; budget?: number; boardCards: Card[]; canEdit: boolean; c: Card; all: Card[]; busy?: string; onClose: () => void;
  move: (c: Card, s: StageId) => Promise<void>; patch: (c: Card, b: Record<string, unknown>, done?: string) => Promise<void>;
  plan: (c: Card) => Promise<void>; fix: (c: Card, feedback: string) => Promise<void>;
}) {
  const [f, setF] = useState({
    title: c.title, idea: c.idea, spec: c.spec, prompt: c.prompt,
    steps: c.steps.map((x) => x.text).join("\n"), criteria: c.criteria.map((x) => x.text).join("\n"),
  });
  const shots = splitIdea(c.idea, imgBase).images;
  const [feedback, setFeedback] = useState("");
  const [extra, setExtra] = useState("");
  const [cs] = useClaudeStatus(base);
  const handOff = () => {
    // 追加の指示は「Claude Codeへの指示」の末尾に足してから渡す(Issue 本文に残るので Claude Code が読む)
    if (extra.trim()) patch(c, { prompt: `${f.prompt}\n\n追加の指示: ${extra.trim()}`, stage: "building" }, "Claude Code に渡しました");
    else move(c, "building");
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const lines = (s: string, prev: { text: string; done: boolean }[]) => s.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: prev.find((p) => p.text === text)?.done ?? false }));
  const dirty = f.title !== c.title || f.idea !== c.idea || f.spec !== c.spec || f.prompt !== c.prompt || f.steps !== c.steps.map((x) => x.text).join("\n") || f.criteria !== c.criteria.map((x) => x.text).join("\n");
  const save = () => patch(c, { title: f.title, idea: f.idea, spec: f.spec, prompt: f.prompt, steps: lines(f.steps, c.steps), criteria: lines(f.criteria, c.criteria) });
  const toggle = (k: "steps" | "criteria", i: number) => patch(c, { [k]: c[k].map((x, j) => (j === i ? { ...x, done: !x.done } : x)) });
  const bl = blockersOf(c, all);
  const others = all.filter((x) => x.number !== c.number && x.stage !== "done");
  const checklist = (k: "steps" | "criteria", empty: string) => (
    <ul className="checks">
      {c[k].length === 0 && <li className="note">{empty}</li>}
      {c[k].map((x, i) => <li key={i}><input type="checkbox" id={`${k}${i}`} checked={x.done} disabled={!!busy} onChange={() => toggle(k, i)} /><label htmlFor={`${k}${i}`}>{x.text}</label></li>)}
    </ul>
  );

  let action: React.ReactNode;
  switch (c.stage) {
    case "backlog": action = <>
      <h3>1. 仕様と進め方を決める</h3>
      <p className="note">AI がアイデアを仕様・進め方・受入条件・Claude Code への指示にまとめ、Issue に書き込んで「次にやる」に移します。</p>
      <div className="btns"><button className="btn primary" disabled={!!busy} onClick={() => plan(c)}>{busy === "plan" ? "作成中…" : "AIで進め方を作る"}</button><button className="btn" disabled={!!busy} onClick={() => move(c, "ready")}>手で書いて次にやるへ</button></div>
    </>; break;
    case "ready": action = <>
      <h3>2. Claude Code に渡す</h3>
      {bl.length > 0 && <p className="err">前提がまだ終わっていません: {bl.map((x) => x.title).join("、")}</p>}
      <p className="note">Issue に <code>claude</code> ラベルを付けます。GitHub Actions の Claude Code が実装を始め、PR を作ります。</p>
      {cs && !linked(cs) && <p className="err">このリポジトリは Claude Code と未連携です({!cs.workflows ? "ワークフロー" : "認証"}が未設定)。ボードのリポジトリ設定の「Claude Code 連携」で設定してください。</p>}
      <EstimateBox card={c} all={boardCards} budget={budget} />
      <div className="field"><label htmlFor="extra">追加の指示(任意)</label><textarea id="extra" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="例: まず既存のテストを読んでから。UI は変えない" /></div>
      <div className="btns"><button className="btn primary" disabled={!!busy} onClick={handOff}>AIに渡す</button></div>
    </>; break;
    case "building": action = <>
      <h3>3. AI実装中</h3><p className="note">PR が開くと自動で「テスト」に進みます。</p>
      <ProgressPanel base={base} number={c.number} active />
      {c.tokens ? <p className="note">ここまでの使用量: {usedBy(c)}</p> : null}
      <div className="btns"><a className="btn" href={c.url} target="_blank" rel="noreferrer">Issue を開く</a>{c.pr && <a className="btn" href={c.pr} target="_blank" rel="noreferrer">PR を開く</a>}</div>
    </>; break;
    case "testing": case "verifying": action = <>
      <h3>{c.stage === "testing" ? "4. テスト" : "6. 確認"}</h3>
      <ProgressPanel base={base} number={c.number} active={false} />
      <div className="btns">
        {c.pr && <a className="btn" href={c.pr} target="_blank" rel="noreferrer">PR を開く</a>}
        {c.preview && (/^https?:/.test(c.preview) ? <a className="btn" href={c.preview} target="_blank" rel="noreferrer">プレビューを開く</a> : <span className="chip">{c.preview}</span>)}
      </div>
      {checklist("criteria", "受入条件がありません")}
      <div className="field"><label htmlFor="fb">指摘(差し戻すとき)</label><textarea id="fb" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="例: 横向きでボタンが切れる" /></div>
      <div className="btns">
        {c.stage === "testing"
          ? <button className="btn primary" disabled={!!busy} onClick={() => move(c, "deploying")}>合格 → デプロイへ</button>
          : <button className="btn primary" disabled={!!busy} onClick={() => move(c, "done")}>OK → 完了(Issue を閉じる)</button>}
        <button className="btn" disabled={!!busy} onClick={() => fix(c, feedback)}>{busy === "fix" ? "依頼中…" : "AIに差し戻す"}</button>
      </div>
      <p className="note">差し戻すと、PR に <code>@claude</code> 付きの修正指示をコメントします。</p>
    </>; break;
    case "deploying": action = <>
      <h3>5. デプロイ</h3><p className="note">Web はプレビューのデプロイ、iOS は TestFlight へのアップロードが終わると「確認」に進みます。</p>
      <ProgressPanel base={base} number={c.number} active={false} />
      <div className="btns">{c.pr && <a className="btn" href={c.pr} target="_blank" rel="noreferrer">PR を開く</a>}<button className="btn" disabled={!!busy} onClick={() => move(c, "verifying")}>手動で確認へ</button></div>
    </>; break;
    default: action = <><h3>完了</h3><a className="btn" href={c.url} target="_blank" rel="noreferrer">Issue を開く</a></>;
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label="カードの詳細" style={cssVar(c.stage)}>
        <div className="sheet-h"><input value={f.title} readOnly={!canEdit} onChange={set("title")} aria-label="タイトル" /><button className="btn small ghost" onClick={onClose}>閉じる</button></div>
        <div className="meta"><span className="stagepill" style={cssVar(c.stage)}>{stageName(c.stage)}</span><span className="chip mono">#{c.number}</span><span className="note">進み具合 {Math.round(progress(c) * 100)}%</span></div>
        <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {!canEdit && <p className="note">このボードは見るだけの権限です。</p>}
        <div className="section act">{action}</div>
        <div className="section"><h3>進め方</h3>{checklist("steps", "まだありません。AI で作るか、下の欄に1行ずつ書きます")}</div>
        <div className="row3">
          <div className="field"><label htmlFor="stg">工程</label><select id="stg" value={c.stage} disabled={!!busy} onChange={(e) => move(c, e.target.value as StageId)}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="field"><label htmlFor="size">サイズ</label><select id="size" value={c.size} disabled={!!busy} onChange={(e) => patch(c, { size: e.target.value as Size })}><option value="">未定</option><option value="S">S 半日</option><option value="M">M 1〜2日</option><option value="L">L 3日〜</option></select></div>
          <div className="field"><label htmlFor="tgt">対象</label><select id="tgt" value={c.target} disabled={!!busy} onChange={(e) => patch(c, { target: e.target.value })}><option value="web">Web</option><option value="ios">iOS</option><option value="both">iOS+Web</option></select></div>
        </div>
        <div className="field"><label>前提(先に終わっている必要があるもの)</label><div className="deps">
          {others.length ? others.map((o) => (
            <label key={o.number}><input type="checkbox" disabled={!!busy} checked={c.dependsOn.includes(o.number)}
              onChange={(e) => patch(c, { dependsOn: e.target.checked ? [...c.dependsOn, o.number] : c.dependsOn.filter((n) => n !== o.number) })} /> #{o.number} {o.title} <span className="note">{stageName(o.stage)}</span></label>
          )) : <span className="note">他のタスクはありません</span>}
        </div></div>
        <div className="field"><label htmlFor="idea">アイデア</label><textarea id="idea" value={f.idea} onChange={set("idea")} />
          {!!shots.length && <div className="thumbs">{shots.map((u) => <a key={u} className="thumb big" href={u} target="_blank" rel="noreferrer"><img src={u} alt="スクリーンショット" /></a>)}</div>}</div>
        <div className="field"><label htmlFor="spec">仕様</label><textarea id="spec" style={{ minHeight: 100 }} value={f.spec} onChange={set("spec")} /></div>
        <div className="field"><label htmlFor="steps">進め方(1行に1ステップ)</label><textarea id="steps" value={f.steps} onChange={set("steps")} /></div>
        <div className="field"><label htmlFor="crit">受入条件(1行に1つ)</label><textarea id="crit" value={f.criteria} onChange={set("criteria")} /></div>
        <div className="field"><label htmlFor="prompt">Claude Code への指示</label><textarea id="prompt" className="code" value={f.prompt} onChange={set("prompt")} /></div>
        <div className="btns">
          <button className="btn primary" disabled={!dirty || !!busy} onClick={save}>Issue に保存</button>
          {c.stage !== "backlog" && c.stage !== "done" && <button className="btn" disabled={!!busy} onClick={() => plan(c)}>AIで作り直す</button>}
          <a className="btn" href={c.url} target="_blank" rel="noreferrer">Issue を開く</a>
        </div>
        </fieldset>
      </aside>
    </div>
  );
}
