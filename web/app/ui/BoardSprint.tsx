"use client";

import { useEffect, useState } from "react";
import { Card, api, stageName, cssVar } from "./common";
import { QuickAdd } from "./QuickAdd";
import type { BoardData } from "./BoardHome";
import { addWeeks, remaining, sprintLoad, weekLabel, weekOf, weekRange } from "@/lib/sprint";
import { fmtTokens } from "@/lib/usage";
import { ageText, resetText } from "@/lib/limits";

const dates = (w: string) => {
  const [s, e] = weekRange(w).map((t) => new Date(t * 1000));
  e.setDate(e.getDate() - 1);
  return `${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}`;
};
const KEY = "kban:addRepo";

/**
 * ボード画面のスプリント。全リポジトリのカードを、リポジトリのタグ付きで一覧し、その週に入れる/外す。
 * アイデアの追加(リポジトリを選ぶ)と、その週の Claude の使用量(超過しそうか)もここで見る。
 */
export function BoardSprint({ data, reload, toast }: { data: BoardData; reload: () => Promise<void>; toast: (m: string) => void }) {
  const { board, cards, canEdit, limits } = data;
  const [week, setWeek] = useState(() => weekOf());
  const [addTo, setAddTo] = useState(board.repos[0]?.full || "");
  const [tag, setTag] = useState(""); // 候補を絞り込むリポジトリ("" = すべて)
  const [busy, setBusy] = useState("");

  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v && board.repos.some((r) => r.full === v)) setAddTo(v); } catch { /* 使えなくてもよい */ }
  }, [board.repos]);

  const name = (full: string) => board.repos.find((r) => r.full === full)?.name || full;
  const hue = (full: string) => (Math.max(0, board.repos.findIndex((r) => r.full === full)) * 67 + 200) % 360;
  const Tag = ({ full }: { full: string }) => (
    <span className="chip" style={{ background: `hsl(${hue(full)} 55% 45% / .18)`, color: `hsl(${hue(full)} 60% 55%)`, fontWeight: 600 }}>{name(full)}</span>
  );

  const l = sprintLoad(week, cards, board.weekTokens, new Date(), limits);
  const inSprint = l.cards;
  const pool = cards.filter((c) => c.stage !== "done" && c.sprint !== week && (!tag || c.repo === tag))
    .sort((a, b) => Number(b.stage === "ready") - Number(a.stage === "ready") || a.rank - b.rank);
  const perRepo = board.repos.map((r) => ({ full: r.full, n: inSprint.filter((c) => c.repo === r.full).length, t: inSprint.filter((c) => c.repo === r.full).reduce((a, c) => a + remaining(c, cards), 0) })).filter((x) => x.n);

  async function setSprint(c: Card, w: string) {
    setBusy(String(c.id));
    try {
      await api(`/api/boards/${board.id}/r/${c.repo}/cards/${c.number}`, "PATCH", { sprint: w });
      await reload();
      toast(w ? `${weekLabel(w)}のスプリントに入れました` : "スプリントから外しました");
    } catch (e) { toast((e as Error).message); }
    setBusy("");
  }
  async function add(memo: string, files: File[]) {
    const form = new FormData();
    form.set("memo", memo);
    files.forEach((f) => form.append("images", f));
    setBusy("add");
    try {
      const r = await fetch(`/api/boards/${board.id}/r/${addTo}/cards`, { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await reload();
      toast(`${name(addTo)} のバックログに追加しました`);
    } catch (e) { toast((e as Error).message); }
    setBusy("");
  }

  const w = (n?: number) => `${Math.min(100, Math.max(0, n || 0))}%`;
  const total = l.totalPct;
  const verdict = total === undefined
    ? (l.usedPct !== undefined && l.usedPct >= 100 ? "すでに上限に達しています" : "")
    : total > 100 ? `超過しそうです(上限の ${total}%)` : total >= 85 ? `ぎりぎりです(上限の ${total}%)` : `収まりそうです(上限の ${total}%)`;

  return (
    <section className={`sprint ${l.over ? "over" : ""}`} aria-label="スプリント(全リポジトリ)">
      <div className="sp-head">
        <h2>スプリント</h2>
        <div className="sp-week">
          <button type="button" className="btn icon" onClick={() => setWeek(addWeeks(week, -1))} aria-label="前の週">◀</button>
          <button type="button" className="btn ghost" onClick={() => setWeek(weekOf())} title="今週に戻る"><b>{weekLabel(week)}</b> <span className="note">{dates(week)}</span></button>
          <button type="button" className="btn icon" onClick={() => setWeek(addWeeks(week, 1))} aria-label="次の週">▶</button>
        </div>
        <span className="note">全リポジトリ {inSprint.length} 件{l.done ? `(完了 ${l.done})` : ""}</span>
      </div>

      <div className="sp-load">
        {verdict && <div className={`chip ${l.over ? "wait" : ""}`} style={{ fontSize: 15, padding: "4px 10px" }}>{l.over ? "⚠ " : total !== undefined && total >= 85 ? "△ " : "✓ "}{verdict}</div>}
        <div className="note">
          見込み {fmtTokens(l.planned)}{l.plannedPct !== undefined ? `(${l.plannedPct}%)` : ""}
          {l.usedFrom === "claude" ? <> + Claude の週の枠 使用済み <b>{l.usedPct}%</b>({ageText(limits!.at)}に取得・リセット {resetText(l.resetsAt!)})</>
            : <> + 使用済み {fmtTokens(l.used)}{l.usedPct !== undefined ? `(${l.usedPct}%)` : ""}(kban から動かした分)</>}
        </div>
        {(l.usedPct !== undefined || l.plannedPct !== undefined) &&
          <div className="meter" role="img" aria-label={`使用済み ${l.usedPct ?? 0}%、見込み ${l.plannedPct ?? 0}%`}><i style={{ width: w(l.usedPct) }} /><i className="plus" style={{ width: w(Math.min(l.plannedPct || 0, 100 - Math.min(100, l.usedPct || 0))) }} /></div>}
        {!board.weekTokens && <div className="note">%で見るには、「ボード設定」で週の上限(トークン換算)を入れてください</div>}
        {!limits && week === weekOf() && <div className="note">Claude の実際の使用率を出すには、トップの「Claude の使用率を kban に送る」を設定してください</div>}
        {l.over && <div className="err">タスクを来週に回すか、サイズを小さく分けましょう</div>}
        {perRepo.length > 0 && <div className="btns">{perRepo.map((x) => <span key={x.full} className="note"><Tag full={x.full} /> {x.n} 件 · 約 {fmtTokens(x.t)}</span>)}</div>}
      </div>

      {inSprint.length === 0
        ? <div className="empty">{canEdit ? "下の候補から「入れる」で、この週のタスクにします" : "この週のタスクはまだありません"}</div>
        : <ul className="sp-list">{inSprint.map((c) => (
            <li key={c.id} style={cssVar(c.stage)} className={c.stage === "done" ? "done" : ""}>
              <a className="sp-t" href={`#b/${board.id}/${c.repo}`} style={{ color: "inherit", textDecoration: "none" }}><span className="dot" />{c.title}</a>
              <Tag full={c.repo} />
              <span className="chip">{stageName(c.stage)}</span>
              {c.size && <span className="chip">{c.size}</span>}
              <span className="note mono">{c.stage === "done" ? "済" : `約 ${fmtTokens(remaining(c, cards))}`}</span>
              {canEdit && <button type="button" className="btn icon" disabled={busy === String(c.id)} onClick={() => setSprint(c, "")} aria-label={`${c.title} をスプリントから外す`}>×</button>}
            </li>
          ))}</ul>}

      <div className="sp-head" style={{ marginTop: 14 }}>
        <h2>スプリントに入れる候補</h2>
        <select className="flt" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="リポジトリで絞り込む">
          <option value="">すべてのリポジトリ</option>
          {board.repos.map((r) => <option key={r.full} value={r.full}>{r.name}</option>)}
        </select>
        <span className="note">{pool.length} 件(次にやるを先に表示)</span>
      </div>
      {pool.length === 0
        ? <div className="empty">入れられるカードはありません</div>
        : <ul className="sp-list">{pool.slice(0, 40).map((c) => (
            <li key={c.id} style={cssVar(c.stage)}>
              <a className="sp-t" href={`#b/${board.id}/${c.repo}`} style={{ color: "inherit", textDecoration: "none" }}><span className="dot" />{c.title}</a>
              <Tag full={c.repo} />
              <span className="chip">{stageName(c.stage)}</span>
              {c.sprint && <span className="chip wk">{weekLabel(c.sprint)}</span>}
              {c.size && <span className="chip">{c.size}</span>}
              <span className="note mono">約 {fmtTokens(remaining(c, cards))}</span>
              {canEdit && <button type="button" className="btn small" disabled={busy === String(c.id)} onClick={() => setSprint(c, week)}>{weekLabel(week)}に入れる</button>}
            </li>
          ))}</ul>}
      {pool.length > 40 && <div className="note">ほか {pool.length - 40} 件。リポジトリで絞り込んでください</div>}

      {canEdit && board.repos.length > 0 && (
        <div className="section">
          <h3>アイデアを追加(バックログ)</h3>
          <div className="field"><label htmlFor="bsRepo">追加先のリポジトリ</label>
            <select id="bsRepo" value={addTo} onChange={(e) => { setAddTo(e.target.value); try { localStorage.setItem(KEY, e.target.value); } catch { /* 使えなくてもよい */ } }}>
              {board.repos.map((r) => <option key={r.full} value={r.full}>{r.name}</option>)}
            </select></div>
          <QuickAdd placeholder={`${name(addTo)} で次に作りたいことを書く…`} busy={busy === "add"} onAdd={add} />
        </div>
      )}
    </section>
  );
}
