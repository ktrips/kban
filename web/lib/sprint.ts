import type { Card } from "./github";
import { estimate } from "./usage.ts";

/**
 * スプリント = 1 週間(月曜〜日曜、見ている人の端末の時刻)。カードは Issue の <!-- kban:sprint=YYYY-MM-DD(月曜) --> でその週に入る。
 * 工程(バックログ・次にやる・実装中…)とは別の軸で、「今週やると決めたもの」を表す。
 */
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (w: string) => { const [y, m, d] = w.split("-").map(Number); return new Date(y, m - 1, d); };

export const isWeek = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && parse(v).getDay() === 1;

/** その日を含む週の月曜(YYYY-MM-DD) */
export function weekOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return ymd(x);
}
export const addWeeks = (w: string, n: number) => { const d = parse(w); d.setDate(d.getDate() + 7 * n); return ymd(d); };
/** 週の始まりと終わり(epoch 秒、終わりは含まない) */
export const weekRange = (w: string) => { const s = parse(w); const e = parse(addWeeks(w, 1)); return [s.getTime() / 1000, e.getTime() / 1000] as const; };

export function weekLabel(w: string, now = new Date()) {
  const cur = weekOf(now);
  if (w === cur) return "今週";
  if (w === addWeeks(cur, 1)) return "来週";
  if (w === addWeeks(cur, -1)) return "先週";
  const s = parse(w); const e = parse(addWeeks(w, 1)); e.setDate(e.getDate() - 1);
  return `${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}`;
}

/** [from, to) に kban から Claude Code を動かした分(Issue に記録した「秒:トークン」の履歴)の合計 */
export function usedBetween(cards: Pick<Card, "usage">[], from: number, to: number) {
  let sum = 0;
  for (const c of cards) {
    for (const e of (c.usage || "").split(",")) {
      const [t, n] = e.split(":").map(Number);
      if (t >= from && t < to && Number.isFinite(n)) sum += n;
    }
  }
  return sum;
}

/** カードを終えるまでに、これから使う見込み(完了済みは 0。実装中は目安から使った分を引く) */
export function remaining(c: Card, all: Card[]) {
  if (c.stage === "done") return 0;
  return Math.max(0, estimate(c, all).tokens - (c.stage === "backlog" || c.stage === "ready" ? 0 : c.tokens || 0));
}

export type SprintLoad = {
  week: string; cards: Card[]; done: number;
  /** これから使う見込みの合計 */ planned: number;
  /** その週にすでに使った分(ボード全体。未来の週は 0) */ used: number;
  limit?: number; plannedPct?: number; usedPct?: number; totalPct?: number; over: boolean;
};

/** その週のスプリントの量。limit(週の上限)があれば % も。used はボード全体のカード(all)から数える */
export function sprintLoad(week: string, all: Card[], limit?: number, now = new Date()): SprintLoad {
  const cards = all.filter((c) => c.sprint === week);
  const planned = cards.reduce((a, c) => a + remaining(c, all), 0);
  const [from, to] = weekRange(week);
  const used = usedBetween(all, from, Math.min(to, now.getTime() / 1000 + 1));
  const p = (n: number) => (limit ? Math.round((n / limit) * 100) : undefined);
  return {
    week, cards, done: cards.filter((c) => c.stage === "done").length, planned, used, limit,
    plannedPct: p(planned), usedPct: p(used), totalPct: p(planned + used), over: !!limit && planned + used > limit,
  };
}
