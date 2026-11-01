/**
 * Claude の契約の使用率(5時間枠・7日枠)。kban のサーバーから Claude に問い合わせる公開 API はないため、
 * 手元の Claude Code のステータスライン(web/public/kban-statusline.sh)が受け取る rate_limits を kban に送ってもらう。
 * 形式は Claude Code のステータスラインの rate_limits と同じ: { five_hour: { used_percentage, resets_at }, seven_day: {...} }
 */
export type Window = { pct: number; resetsAt: number };
export type ClaudeLimits = { fiveHour?: Window; sevenDay?: Window; at: number };

const win = (v: unknown): Window | undefined => {
  const o = v as { used_percentage?: unknown; resets_at?: unknown } | null;
  const pct = Number(o?.used_percentage);
  const resetsAt = Number(o?.resets_at);
  if (!o || !Number.isFinite(pct) || pct < 0 || pct > 1000 || !Number.isFinite(resetsAt) || resetsAt <= 0) return undefined;
  return { pct: Math.round(pct * 10) / 10, resetsAt: Math.round(resetsAt) };
};

/** ステータスラインの rate_limits(またはそれを含む JSON 全体)から取り出す。どちらの枠もなければ null */
export function parseLimits(body: unknown, now = Date.now()): ClaudeLimits | null {
  const b = body as { rate_limits?: unknown } | null;
  const r = (b && typeof b === "object" && "rate_limits" in b ? b.rate_limits : b) as { five_hour?: unknown; seven_day?: unknown } | null;
  if (!r || typeof r !== "object") return null;
  const fiveHour = win(r.five_hour);
  const sevenDay = win(r.seven_day);
  if (!fiveHour && !sevenDay) return null;
  return { fiveHour, sevenDay, at: Math.floor(now / 1000) };
}

/** リセット時刻を過ぎた枠は、使用率が 0 に戻っているので表示しない */
export function current(l: ClaudeLimits | null | undefined, now = Date.now()): ClaudeLimits | null {
  if (!l) return null;
  const t = now / 1000;
  const live = (w?: Window) => (w && w.resetsAt > t ? w : undefined);
  const fiveHour = live(l.fiveHour);
  const sevenDay = live(l.sevenDay);
  return fiveHour || sevenDay ? { fiveHour, sevenDay, at: l.at } : null;
}

export function ageText(at: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now / 1000 - at) / 60));
  return m < 1 ? "たった今" : m < 60 ? `${m}分前` : m < 60 * 24 ? `${Math.round(m / 60)}時間前` : `${Math.round(m / 1440)}日前`;
}

export function resetText(resetsAt: number) {
  const d = new Date(resetsAt * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
