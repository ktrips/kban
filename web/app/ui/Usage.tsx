"use client";

import type { Card } from "./common";
import { estimate, monthUsed, windowUsed, fmtTokens, pct } from "@/lib/usage";

/** Claude Code に渡す前の使用量の目安と、月の予算に対する割合。 */
export function EstimateBox({ card, all, budget }: { card: Card; all: Card[]; budget?: number }) {
  const e = estimate(card, all);
  const used = monthUsed(all);
  const left = budget ? Math.max(0, budget - used) : 0;
  const over = budget ? used + e.tokens > budget : false;
  return (
    <div className="estimate">
      <div><b>目安 約 {fmtTokens(e.tokens)} トークン</b> <span className="note">({fmtTokens(e.low)}〜{fmtTokens(e.high)})</span></div>
      <div className="note">{e.basis === "history" ? `同じサイズ(${card.size || "M"})の完了済み ${e.samples} 件の実績から` : `サイズ ${card.size || "M"} の既定値から。実績が2件たまると、実績ベースになります`}</div>
      {budget
        ? <>
            <div className={over ? "err" : ""}>月の予算 {fmtTokens(budget)} の <b>{pct(e.tokens, budget)}%</b> を使う見込み(今月は {fmtTokens(used)} 使用済み・残り {fmtTokens(left)}){over && " — 予算を超えます"}</div>
            <div className="meter"><i style={{ width: `${Math.min(100, pct(used, budget))}%` }} /><i className="plus" style={{ width: `${Math.min(100 - Math.min(100, pct(used, budget)), pct(e.tokens, budget))}%` }} /></div>
          </>
        : <div className="note">月の予算を決めると「%」が出ます(ボード設定)。Claude の契約の残り枠は取得できないため、自分で決めた枠に対する割合です。</div>}
    </div>
  );
}

/** ボード全体の今月の使用量 */
export function MonthMeter({ cards, budget }: { cards: Card[]; budget?: number }) {
  const used = monthUsed(cards);
  if (!used && !budget) return null;
  return (
    <div className="chip" title="今月に更新されたカードの Claude Code 実績の合計">
      今月 {fmtTokens(used)} トークン{budget ? ` / ${fmtTokens(budget)}(${pct(used, budget)}%)` : ""}
    </div>
  );
}

/** 直近5時間・直近7日の使用量(kban から Claude Code を動かした分) */
export function WindowMeters({ cards }: { cards: Card[] }) {
  const h5 = windowUsed(cards, 5);
  const d7 = windowUsed(cards, 24 * 7);
  return (
    <>
      <div className="chip" title="直近5時間に kban から動かした Claude Code のトークン合計。Claude の契約の枠(%)そのものではありません">5時間 {fmtTokens(h5)}</div>
      <div className="chip" title="直近7日間に kban から動かした Claude Code のトークン合計。Claude の契約の枠(%)そのものではありません">1週間 {fmtTokens(d7)}</div>
    </>
  );
}

export const usedBy = (c: Card) => (c.tokens ? `${fmtTokens(c.tokens)} トークン${c.cost ? `(約 $${c.cost.toFixed(2)})` : ""}` : "");
