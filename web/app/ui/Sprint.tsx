"use client";

import { Card, cssVar, stageName } from "./common";
import { addWeeks, sprintLoad, weekLabel, weekOf, weekRange, remaining } from "@/lib/sprint";
import { fmtTokens } from "@/lib/usage";
import { ageText, resetText, type ClaudeLimits } from "@/lib/limits";

const dates = (w: string) => {
  const [s, e] = weekRange(w).map((t) => new Date(t * 1000));
  e.setDate(e.getDate() - 1);
  return `${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}`;
};

/**
 * スプリント(週)のパネル。バックログ等のカードをここへドラッグ(スマホは長押しして指で動かす)すると、その週のタスクになる。
 * 量は「これから使う見込み(目安)+その週にすでに使った分」を、ボード設定の週の上限に対する % で出す。上限はボード全体で共通。
 */
export function SprintPanel({ week, setWeek, all, repo, limit, claude, canEdit, onOpen, onRemove, onDrop }: {
  week: string; setWeek: (w: string) => void; all: Card[]; repo: string; limit?: number; claude?: ClaudeLimits | null; canEdit: boolean;
  onOpen: (c: Card) => void; onRemove: (c: Card) => void; onDrop: () => void;
}) {
  const l = sprintLoad(week, all, limit, new Date(), claude);
  const fromClaude = l.usedFrom === "claude";
  const usedText = fromClaude
    ? <>Claude の週の枠 使用済み <b>{l.usedPct}%</b>(実際の値・{ageText(claude!.at)}に取得・リセット {resetText(l.resetsAt!)})</>
    : <>使用済み {fmtTokens(l.used)}{l.usedPct !== undefined ? `(${l.usedPct}%)` : ""}<span className="note">(kban から動かした分)</span></>;
  const mine = l.cards.filter((c) => c.repo === repo);
  const others = l.cards.length - mine.length;
  const w = (n?: number) => `${Math.min(100, Math.max(0, n || 0))}%`;
  return (
    <section className={`sprint ${l.over ? "over" : ""}`} data-drop={canEdit ? `sprint:${week}` : undefined}
      onDragOver={(e) => { if (canEdit) { e.preventDefault(); e.currentTarget.classList.add("dragover"); } }}
      onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
      onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("dragover"); if (canEdit) onDrop(); }}>
      <div className="sp-head">
        <h2>スプリント</h2>
        <div className="sp-week">
          <button type="button" className="btn icon" onClick={() => setWeek(addWeeks(week, -1))} aria-label="前の週">◀</button>
          <button type="button" className="btn ghost" onClick={() => setWeek(weekOf())} title="今週に戻る"><b>{weekLabel(week)}</b> <span className="note">{dates(week)}</span></button>
          <button type="button" className="btn icon" onClick={() => setWeek(addWeeks(week, 1))} aria-label="次の週">▶</button>
        </div>
        <span className="note">{l.cards.length} 件{l.done ? `(完了 ${l.done})` : ""}{others > 0 ? ` · ほかのリポジトリ ${others} 件を含む` : ""}</span>
      </div>

      <div className="sp-load">
        {l.totalPct !== undefined
          ? <div><b className={l.over ? "err" : ""}>週の上限の {l.totalPct}%</b><span className="note"> = 使用済み {l.usedPct}% + このスプリントの見込み {l.plannedPct}%({fmtTokens(l.planned)})</span></div>
          : fromClaude ? <div><b className={l.over ? "err" : ""}>週の上限の {l.usedPct}% を使用済み</b></div> : null}
        <div className="note">{usedText}</div>
        {(l.usedPct !== undefined || l.plannedPct !== undefined) &&
          <div className="meter" role="img" aria-label={`使用済み ${l.usedPct ?? 0}%、見込み ${l.plannedPct ?? 0}%`}><i style={{ width: w(l.usedPct) }} /><i className="plus" style={{ width: w(Math.min(l.plannedPct || 0, 100 - Math.min(100, l.usedPct || 0))) }} /></div>}
        {!limit && <div className="note">このスプリントの見込み {fmtTokens(l.planned)} トークン。見込みを % にするには、「ボード設定」で週の上限をトークン換算で入れてください(Claude からは % しか取れないため)</div>}
        {!claude && week === weekOf() && <div className="note">Claude の実際の使用率を出すには、トップの「Claude の使用率を kban に送る」を設定してください</div>}
        {l.over && <div className="err">上限を超える見込みです。タスクを来週に回すか、サイズを小さく分けましょう</div>}
      </div>

      {mine.length === 0
        ? <div className="empty">{canEdit ? "バックログのカードをここへドラッグ(スマホは長押しして指で動かす)" : "この週のタスクはまだありません"}</div>
        : <ul className="sp-list">{mine.map((c) => (
            <li key={c.id} style={cssVar(c.stage)} className={c.stage === "done" ? "done" : ""}>
              <button type="button" className="sp-t" onClick={() => onOpen(c)}><span className="dot" />{c.title}</button>
              <span className="chip">{stageName(c.stage)}</span>
              {c.size && <span className="chip">{c.size}</span>}
              <span className="note mono">{c.stage === "done" ? "済" : `約 ${fmtTokens(remaining(c, all))}${limit ? `(${Math.round((remaining(c, all) / limit) * 100)}%)` : ""}`}</span>
              {canEdit && <button type="button" className="btn icon" onClick={() => onRemove(c)} aria-label={`${c.title} をスプリントから外す`}>×</button>}
            </li>
          ))}</ul>}
    </section>
  );
}

/** ボードのトップ用: 今週のスプリントの件数と、週の上限に対する % */
export function SprintChip({ cards, limit, claude }: { cards: Card[]; limit?: number; claude?: ClaudeLimits | null }) {
  const l = sprintLoad(weekOf(), cards, limit, new Date(), claude);
  if (!l.cards.length && !limit) return null;
  return (
    <div className={`chip ${l.over ? "wait" : ""}`} title="今週のスプリントの「これから使う見込み+使用済み」。上限はボード設定で入れた値">
      今週のスプリント {l.cards.length} 件{l.totalPct !== undefined ? ` · 上限の ${l.totalPct}%` : ` · 見込み ${fmtTokens(l.planned)}`}{l.over ? " · 超過しそう" : ""}
    </div>
  );
}
