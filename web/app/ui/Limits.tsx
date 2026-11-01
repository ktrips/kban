"use client";

import { useState } from "react";
import { api } from "./common";
import { ageText, resetText, type ClaudeLimits } from "@/lib/limits";
import type { Me } from "./Boards";

/** Claude の契約の使用率(手元の Claude Code が送ったもの)。5時間枠・7日枠の % とリセット時刻 */
export function LimitsChips({ limits }: { limits?: ClaudeLimits | null }) {
  if (!limits) return null;
  const t = `Claude から取得(${ageText(limits.at)})。手元の Claude Code のステータスラインが送った値`;
  return <>
    {limits.fiveHour && <div className={`chip ${limits.fiveHour.pct >= 80 ? "wait" : ""}`} title={`${t}。リセット ${resetText(limits.fiveHour.resetsAt)}`}>Claude 5時間 {Math.round(limits.fiveHour.pct)}%</div>}
    {limits.sevenDay && <div className={`chip ${limits.sevenDay.pct >= 80 ? "wait" : ""}`} title={`${t}。リセット ${resetText(limits.sevenDay.resetsAt)}`}>Claude 週 {Math.round(limits.sevenDay.pct)}%</div>}
  </>;
}

/** トップ画面: 手元の Claude Code から、契約の使用率を kban に送る設定 */
export function LimitsSetup({ me, toast }: { me: Me; toast: (m: string) => void }) {
  const [token, setToken] = useState("");
  const origin = typeof location === "undefined" ? "" : location.origin;
  async function make() {
    if (!me.limitsLinked || confirm("新しいトークンを作ります。前に作ったトークンは使えなくなります。")) {
      try { setToken((await api<{ token: string }>("/api/me/limits", "POST")).token); } catch (e) { toast((e as Error).message); }
    }
  }
  const dl = `mkdir -p ~/.claude && curl -fsSL ${origin}/kban-statusline.sh -o ~/.claude/kban-statusline.sh`;
  const settings = JSON.stringify({ statusLine: { type: "command", command: `KBAN_URL=${origin} KBAN_TOKEN=${token || "kbl_…"} bash ~/.claude/kban-statusline.sh` } }, null, 2);
  const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast("コピーしました"));
  const l = me.limits;
  return (
    <section className="section">
      <h3>Claude の使用率を kban に送る</h3>
      <p className="note" style={{ margin: 0 }}>
        スプリントの「今週の上限の何%か」を、Claude の契約の実際の使用率(5時間枠・週の枠)で出します。Claude の使用率を外から取る公開 API はないため、
        手元の Claude Code のステータスラインが受け取る値を kban に送ってもらいます。送るのは使用率とリセット時刻だけで、1分に1回までです。
      </p>
      <div className="note">{l
        ? <>最後に受け取った値: {l.fiveHour && `5時間 ${Math.round(l.fiveHour.pct)}%(リセット ${resetText(l.fiveHour.resetsAt)})`}{l.fiveHour && l.sevenDay && " · "}{l.sevenDay && `週 ${Math.round(l.sevenDay.pct)}%(リセット ${resetText(l.sevenDay.resetsAt)})`} — {ageText(l.at)}</>
        : token ? "トークンを作りました。下の 1・2 を手元のパソコンで行い、Claude Code で一度やりとりすると値が届きます。" : me.limitsLinked ? "トークンは作成済みです。Claude Code で一度やりとりすると、値が届きます。" : "まだ設定していません。"}</div>
      <div className="btns"><button className="btn small" onClick={make}>{token || me.limitsLinked ? "トークンを作り直す" : "トークンを作る"}</button></div>
      {token && <>
        <div className="field"><span className="step">1. スクリプトを入れる(ターミナルで実行)</span>
          <div className="btns"><code className="mono" style={{ flex: 1, minWidth: 200, overflowX: "auto", whiteSpace: "nowrap", padding: "6px 8px" }}>{dl}</code><button className="btn small" onClick={() => copy(dl)}>コピー</button></div></div>
        <div className="field"><span className="step">2. <code>~/.claude/settings.json</code> に追加(すでに statusLine があるときは、そのコマンドを <code>KBAN_NEXT=&apos;…&apos;</code> に入れると後ろに % が付きます)</span>
          <textarea className="code" readOnly value={settings} onFocus={(e) => e.target.select()} style={{ minHeight: 150 }} aria-label="settings.json に追加する内容" />
          <div className="btns"><button className="btn small" onClick={() => copy(settings)}>コピー</button></div></div>
        <p className="note" style={{ margin: 0 }}>トークンはこの画面を閉じると二度と表示されません。Claude の契約(Pro / Max / Ultra)でログインした Claude Code で動きます。</p>
      </>}
    </section>
  );
}
