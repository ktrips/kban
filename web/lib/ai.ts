import Anthropic from "@anthropic-ai/sdk";
import type { Card } from "./github";
import type { RepoSettings as Repo } from "./store";
import type { Size } from "./stages";

const MODEL = process.env.KBAN_MODEL || "claude-sonnet-5";
let client: Anthropic | null = null;
const ai = () => (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY

const targetText = (t: Repo["target"]) => (t === "ios" ? "iOSアプリ" : t === "both" ? "iOSアプリ+Web" : "Webアプリ");
const repoContext = (r: Repo) => `リポジトリ: ${r.full}(${targetText(r.target)})${r.about ? `\n概要: ${r.about}` : ""}`;

async function ask(prompt: string, maxTokens = 2500) {
  const res = await ai().messages.create({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}
const json = (text: string) => JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
const size = (v: unknown): Size => (["S", "M", "L"].includes(String(v)) ? (v as Size) : "");

export type Plan = { title: string; spec: string; steps: string[]; criteria: string[]; size: Size; dependsOn: number[]; prompt: string };

export async function makePlan(repo: Repo, card: Card, others: Card[]): Promise<Plan> {
  const v = json(await ask(`あなたはモバイル/Webアプリ開発のテックリードです。次のアイデアを、GitHub Actions 上の Claude Code にそのまま渡せる開発タスクに整え、進め方を決めてください。
${repoContext(repo)}
Issue: #${card.number}
アイデア: ${card.idea || card.title}
同じリポジトリの他のタスク(#番号: タイトル):
${others.map((o) => `#${o.number}: ${o.title}`).join("\n") || "なし"}

JSONだけを返す(コードフェンス不要):
{"title":"40字以内の具体的なタスク名","spec":"目的と仕様の箇条書き。各行'- 'で始め4〜7行","steps":["進め方を3〜6ステップ。順番に並べる"],"criteria":["検証できる受入条件を3〜5個"],"size":"S|M|L","dependsOn":[先に終わっている必要がある他タスクの番号],"prompt":"Claude Codeへの指示。変更範囲、触る場所の見当、進め方、追加するテスト、完了の定義を含め、『受入条件をすべて満たしたら gh pr create でPRを作成し、本文に Closes #${card.number}、テスト結果、確認手順を書くこと』で締める"}`));
  const known = new Set(others.map((o) => o.number));
  return {
    title: String(v.title || card.title).slice(0, 80),
    spec: String(v.spec || ""),
    steps: (Array.isArray(v.steps) ? v.steps : []).map(String).slice(0, 8),
    criteria: (Array.isArray(v.criteria) ? v.criteria : []).map(String).slice(0, 8),
    size: size(v.size),
    dependsOn: (Array.isArray(v.dependsOn) ? v.dependsOn : []).map(Number).filter((n: number) => known.has(n)),
    prompt: String(v.prompt || ""),
  };
}

export type Priority = { number: number; reason: string; size: Size; dependsOn: number[]; parallel: boolean };

export async function prioritize(repo: Repo, pool: Card[], active: Card[]): Promise<Priority[]> {
  const v = json(await ask(`あなたは個人開発者のプロダクトマネージャーです。次のバックログについて、何から着手すべきかを決めてください。
${repoContext(repo)}
いま進行中: ${active.map((c) => c.title).join(" / ") || "なし"}
基準: ユーザーへの価値が大きい、小さく早く出せる、他の作業の前提になるものを先に。同時に進めても同じ画面やファイルを触らないものは並行可能にする。

バックログ(#番号: タイトル — 内容):
${pool.map((c) => `#${c.number}: ${c.title} — ${c.idea.slice(0, 160)}`).join("\n")}

JSONだけを返す。全件を含め、先にやる順に並べる:
{"items":[{"number":12,"size":"S|M|L","reason":"なぜこの順番か(40字以内)","dependsOn":[先に終わっている必要がある番号],"parallel":true}]}`, 3000));
  const nums = new Set(pool.map((c) => c.number));
  const items: Priority[] = (Array.isArray(v.items) ? v.items : [])
    .filter((x: { number: unknown }) => nums.has(Number(x.number)))
    .map((x: Record<string, unknown>) => ({
      number: Number(x.number),
      reason: String(x.reason || "").slice(0, 80),
      size: size(x.size),
      dependsOn: (Array.isArray(x.dependsOn) ? x.dependsOn : []).map(Number).filter((n: number) => nums.has(n) || active.some((a) => a.number === n)),
      parallel: x.parallel === true,
    }));
  for (const c of pool) if (!items.some((x) => x.number === c.number)) items.push({ number: c.number, reason: "", size: c.size, dependsOn: c.dependsOn, parallel: false });
  return items;
}

export async function makeFix(card: Card, feedback: string) {
  const unmet = card.criteria.filter((c) => !c.done).map((c) => c.text);
  return ask(
    `Claude Code への差し戻し修正指示を書いてください。日本語で200〜400字、指示文だけを返す。
タスク: ${card.title}
満たしていない受入条件: ${unmet.join(" / ") || "なし"}
確認での指摘: ${feedback || "なし"}
元の指示: ${card.prompt}`,
    800,
  );
}

/** Claude の作業報告から、今回やらずに残したこと・次にやるとよいことを、新しいアイデアとして取り出す。 */
export async function extractFollowups(title: string, summary: string): Promise<string[]> {
  const v = json(await ask(`開発タスク「${title}」を Claude が終えたときの報告です。ここから、今回は実装しなかった/残った課題・気づき・次にやるとよいことだけを、バックログの新しいアイデアとして取り出してください。完了した内容や、すでに対応済みのものは含めない。

報告:
${summary.slice(0, 6000)}

JSONだけを返す(コードフェンス不要)。なければ空配列:
{"followups":["1件ずつ単独で読めるアイデア(80字以内)"]}`, 1200));
  return (Array.isArray(v.followups) ? v.followups : []).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 10);
}
