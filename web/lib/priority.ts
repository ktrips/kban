import type { Card } from "./github";
import type { Size } from "./stages";
import type { Priority } from "./ai";

/**
 * 「AIで優先順位」の提案。Actions(kban-prioritize.yml)の Claude Code が、各カードの Issue に
 * <!-- kban:proposal=時刻;順番;サイズ;並行可(1/0);前提(番号,番号);理由 --> を書く(templates/.github/kban/resolve.js の proposalMarker)。
 * ここで集めて画面に出し、「この順番にする」で順番を確定、「やめる」で印を消す。
 */
export type Proposed = Priority & { ts: number; order: number };

export function parseProposal(number: number, raw?: string): Proposed | null {
  if (!raw) return null;
  const parts = raw.split(";");
  if (parts.length < 6) return null;
  const [ts, order, size, par, deps] = parts;
  const reason = parts.slice(5).join(";").trim();
  if (!Number.isFinite(Number(ts)) || !Number.isFinite(Number(order))) return null;
  return {
    number, ts: Number(ts), order: Number(order), reason,
    size: (["S", "M", "L"].includes(size) ? size : "") as Size,
    parallel: par === "1",
    dependsOn: deps.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0),
  };
}

/** カードに書かれた提案のうち、いちばん新しい回のものを順番どおりに。なければ null */
export function collectProposal(cards: Pick<Card, "number" | "proposal" | "stage">[]): (Priority & { ts: number })[] | null {
  const all = cards.filter((c) => c.stage === "backlog" || c.stage === "ready").map((c) => parseProposal(c.number, c.proposal)).filter((x): x is Proposed => !!x);
  if (!all.length) return null;
  const ts = Math.max(...all.map((x) => x.ts));
  return all.filter((x) => x.ts === ts).sort((a, b) => a.order - b.order)
    .map(({ number, reason, size, dependsOn, parallel }) => ({ number, reason, size, dependsOn, parallel, ts }));
}
