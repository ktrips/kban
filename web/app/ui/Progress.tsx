"use client";

import { useEffect, useState } from "react";
import { api, ago } from "./common";
import type { Progress } from "@/lib/progress";

const state = (status: string, conclusion: string | null) =>
  status !== "completed" ? { t: "実行中", c: "run" } : conclusion === "success" ? { t: "成功", c: "ok" } : conclusion === "skipped" || conclusion === "neutral" ? { t: "スキップ", c: "" } : conclusion === "cancelled" ? { t: "中止", c: "" } : { t: "失敗", c: "ng" };

/** Claude Code の実行状況。開いている間は15秒ごとに更新(実行中でなければ止める)。 */
export function ProgressPanel({ base, number, active }: { base: string; number: number; active: boolean }) {
  const [p, setP] = useState<Progress | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await api<Progress>(`${base}/cards/${number}/progress`);
        if (stop) return;
        setP(r); setErr("");
        const running = r.runs.some((x) => x.status !== "completed") || r.pr?.checks.some((x) => x.status !== "completed");
        if (running || active) timer = setTimeout(tick, 15000);
      } catch (e) { if (!stop) setErr((e as Error).message); }
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [base, number, active]);

  if (err) return <p className="note">進捗を取得できません: {err}</p>;
  if (!p) return <p className="note">進捗を読み込み中…</p>;
  const latest = p.runs[0];
  return (
    <div className="progress">
      <div className="btns">
        {latest
          ? <a className={`chip st ${state(latest.status, latest.conclusion).c}`} href={latest.url} target="_blank" rel="noreferrer">Claude Code: {state(latest.status, latest.conclusion).t} · {ago(latest.startedAt)}</a>
          : <span className="chip">Claude Code はまだ動いていません</span>}
        {p.pr && <a className="chip" href={p.pr.url} target="_blank" rel="noreferrer">PR #{p.pr.number} {p.pr.state === "merged" ? "マージ済み" : p.pr.state === "closed" ? "閉じた" : p.pr.draft ? "下書き" : "オープン"} · {p.pr.commits}コミット +{p.pr.additions} −{p.pr.deletions}</a>}
      </div>
      {!!p.pr?.checks.length && <div className="btns">{p.pr.checks.map((c) => <a key={c.name} className={`chip st ${state(c.status, c.conclusion).c}`} href={c.url} target="_blank" rel="noreferrer">{c.name}: {state(c.status, c.conclusion).t}</a>)}</div>}
      {p.claude && <details open={!p.pr}><summary>Claude Code の進捗メモ <span className="note">{ago(p.claude.updatedAt)}</span></summary>
        <pre className="claude-note">{p.claude.text}</pre><a className="note" href={p.claude.url} target="_blank" rel="noreferrer">GitHub で見る</a></details>}
      {p.runs.length > 1 && <details><summary className="note">過去の実行 ({p.runs.length})</summary>
        <div className="btns">{p.runs.slice(1).map((r) => <a key={r.url} className={`chip st ${state(r.status, r.conclusion).c}`} href={r.url} target="_blank" rel="noreferrer">{state(r.status, r.conclusion).t} · {ago(r.startedAt)}</a>)}</div></details>}
    </div>
  );
}
