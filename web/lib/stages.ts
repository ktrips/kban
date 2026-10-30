export const STAGES = [
  { id: "idea", name: "アイデア", hint: "思いつきを書き溜める" },
  { id: "spec", name: "仕様化", hint: "AIが仕様と受入条件に整える" },
  { id: "queued", name: "AIに指示", hint: "claude ラベルで Claude Code が起動" },
  { id: "building", name: "実装中", hint: "Claude Code が実装して PR を作成", wip: 3 },
  { id: "testing", name: "テスト", hint: "CI と受入条件をチェック" },
  { id: "deploying", name: "デプロイ", hint: "Vercel プレビュー / TestFlight" },
  { id: "verifying", name: "確認", hint: "実画面・実機で確かめる" },
  { id: "done", name: "完了", hint: "マージ済み" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export type Target = "web" | "ios" | "both";

export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];
export const stageLabel = (s: StageId) => `kenban:${s}`;
export const isStage = (v: unknown): v is StageId => STAGE_IDS.includes(v as StageId);

/** Stage is the furthest kenban:<stage> label present; closed issues are done. */
export function stageFromLabels(labels: string[], closed = false): StageId {
  if (closed) return "done";
  let best: StageId = "idea";
  for (const l of labels) {
    const m = /^kenban:(\w+)$/.exec(l);
    if (m && isStage(m[1]) && STAGE_IDS.indexOf(m[1]) > STAGE_IDS.indexOf(best)) best = m[1];
  }
  return best;
}

export function targetFromLabels(labels: string[]): Target {
  if (labels.includes("kenban:both")) return "both";
  if (labels.includes("kenban:ios")) return "ios";
  return "web";
}
