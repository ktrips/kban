export const STAGES = [
  { id: "backlog", name: "バックログ", hint: "次に作りたいこと。上ほど先にやる" },
  { id: "ready", name: "次にやる", hint: "仕様と進め方が決まったもの" },
  { id: "building", name: "AI実装中", hint: "Claude Code が実装して PR を作成", wip: 3 },
  { id: "testing", name: "テスト", hint: "CI と受入条件をチェック" },
  { id: "deploying", name: "デプロイ", hint: "Vercel プレビュー / TestFlight" },
  { id: "verifying", name: "確認", hint: "実画面・実機で確かめる" },
  { id: "done", name: "完了", hint: "マージ済み" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export type Target = "web" | "ios" | "both";
export type Size = "S" | "M" | "L" | "";

export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];
export const ACTIVE: StageId[] = ["building", "testing", "deploying", "verifying"];
export const ORDERED: StageId[] = ["backlog", "ready"];
export const stageLabel = (s: StageId) => `kban:${s}`;
export const isStage = (v: unknown): v is StageId => STAGE_IDS.includes(v as StageId);

/** Stage is the furthest kban:<stage> label present; closed issues are done. */
export function stageFromLabels(labels: string[], closed = false): StageId {
  if (closed) return "done";
  let best: StageId = "backlog";
  for (const l of labels) {
    const m = /^kban:(\w+)$/.exec(l);
    if (m && isStage(m[1]) && STAGE_IDS.indexOf(m[1]) > STAGE_IDS.indexOf(best)) best = m[1];
  }
  return best;
}

export function targetFromLabels(labels: string[]): Target | null {
  if (labels.includes("kban:both")) return "both";
  if (labels.includes("kban:ios")) return "ios";
  if (labels.includes("kban:web")) return "web";
  return null;
}

export function sizeFromLabels(labels: string[]): Size {
  const m = labels.map((l) => /^kban:size-([SML])$/.exec(l)).find(Boolean);
  return (m ? m[1] : "") as Size;
}
