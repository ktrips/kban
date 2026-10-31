"use client";

import { ACTIVE, STAGES, StageId } from "@/lib/stages";
import type { Card } from "@/lib/github";

export { ACTIVE, STAGES };
export type { StageId, Card };

/* ---------------- helpers ---------------- */
export async function api<T = Record<string, unknown>>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as T;
}
export const SI = Object.fromEntries(STAGES.map((s, i) => [s.id, i])) as Record<StageId, number>;
export const stageName = (s: StageId) => STAGES[SI[s]].name;
export const tLabel = (t: "web" | "ios" | "both") => (t === "ios" ? "iOS" : t === "both" ? "iOS+Web" : "Web");
export const cssVar = (s: StageId) => ({ ["--c" as string]: `var(--s-${s})` }) as React.CSSProperties;
export const ordered = (s: StageId) => s === "backlog" || s === "ready";
export const sortStage = (list: Card[], s: StageId) =>
  list.slice().sort(ordered(s) ? (a, b) => a.rank - b.rank || a.number - b.number : (a, b) => b.updatedAt.localeCompare(a.updatedAt));
export const blockersOf = (c: Card, all: Card[]) => c.dependsOn.map((n) => all.find((x) => x.repo === c.repo && x.number === n)).filter((x): x is Card => !!x && x.stage !== "done");
export function progress(c: Card) {
  if (c.stage === "done") return 1;
  const tot = c.steps.length + c.criteria.length;
  const done = c.steps.filter((s) => s.done).length + c.criteria.filter((s) => s.done).length;
  const base = SI[c.stage] / (STAGES.length - 1);
  return tot ? Math.max(base * 0.5, done / tot) : base;
}
export const ago = (iso?: string) => {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  return d < 1 ? "今日" : d < 30 ? `${Math.floor(d)}日前` : `${Math.floor(d / 30)}か月前`;
};
export function StagesBar({ list }: { list: Card[] }) {
  const total = list.length || 1;
  return (
    <div className="prog" aria-hidden>
      {STAGES.map((s) => {
        const n = list.filter((c) => c.stage === s.id).length;
        return n ? <i key={s.id} style={{ width: `${(n / total) * 100}%`, background: `var(--s-${s.id})` }} /> : null;
      })}
    </div>
  );
}


export function Toast({ msg }: { msg: string }) {
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}
