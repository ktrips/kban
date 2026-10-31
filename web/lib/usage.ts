import type { Card } from "./github";

/**
 * Claude Code に渡す前の使用量の目安。
 * 実績(ワークフローが Issue に記録した tokens)があれば同じサイズの完了済みカードの中央値、なければサイズ別の既定値。
 * 「%」は、ボードに設定した月の予算に対する割合。Claude の契約の残り枠は API で取れないので、予算は自分で決める。
 */
export const DEFAULT_TOKENS = { S: 150_000, M: 500_000, L: 1_500_000 } as const;
export type Estimate = { tokens: number; low: number; high: number; basis: "history" | "default"; samples: number };

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function estimate(card: Pick<Card, "size" | "number" | "repo">, all: Pick<Card, "size" | "tokens" | "stage" | "repo" | "number">[]): Estimate {
  const size = card.size || "M";
  const past = all.filter((c) => c.stage === "done" && (c.size || "M") === size && c.tokens && !(c.repo === card.repo && c.number === card.number)).map((c) => c.tokens!);
  const tokens = Math.round(past.length >= 2 ? median(past) : DEFAULT_TOKENS[size]);
  return { tokens, low: Math.round(tokens * 0.6), high: Math.round(tokens * 1.8), basis: past.length >= 2 ? "history" : "default", samples: past.length };
}

/** 今月に更新されたカードの実績の合計(更新日ベースの概算) */
export function monthUsed(cards: Pick<Card, "tokens" | "updatedAt">[], now = new Date()) {
  const ym = now.toISOString().slice(0, 7);
  return cards.filter((c) => c.tokens && c.updatedAt.startsWith(ym)).reduce((a, c) => a + c.tokens!, 0);
}

export const fmtTokens = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(1)}億` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString("ja-JP")}万` : `${n.toLocaleString("ja-JP")}`);
export const pct = (n: number, of: number) => Math.round((n / of) * 100);
