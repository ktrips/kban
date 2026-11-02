"use client";

import type { Card } from "./common";
import { estimate, fmtTokens } from "@/lib/usage";

/** Claude Code に渡す前の使用量の目安(1行) */
export function EstimateBox({ card, all }: { card: Card; all: Card[] }) {
  const e = estimate(card, all);
  const why = e.basis === "history" ? `同じサイズ(${card.size || "M"})の完了済み ${e.samples} 件の実績から` : `サイズ ${card.size || "M"} の既定値から。実績が2件たまると実績ベースに`;
  return (
    <div className="estimate" title={why}>
      <b>目安 約 {fmtTokens(e.tokens)}</b> <span className="note">({fmtTokens(e.low)}〜{fmtTokens(e.high)} トークン)</span>
    </div>
  );
}

export const usedBy = (c: Card) => (c.tokens ? `${fmtTokens(c.tokens)} トークン${c.cost ? `(約 $${c.cost.toFixed(2)})` : ""}` : "");
