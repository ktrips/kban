import Anthropic from "@anthropic-ai/sdk";
import type { Card } from "./github";

const MODEL = process.env.KENBAN_MODEL || "claude-sonnet-5-5";
let client: Anthropic | null = null;
const ai = () => (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY

function targetText(t: Card["target"]) {
  return t === "ios" ? "iOSアプリ(SwiftUI)" : t === "both" ? "iOSアプリとWeb" : "Webアプリ";
}

async function ask(prompt: string, maxTokens = 2000) {
  const res = await ai().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

export type Spec = { title: string; spec: string; criteria: string[]; prompt: string };

export async function makeSpec(card: Pick<Card, "title" | "idea" | "repo" | "target">, feedback?: string): Promise<Spec> {
  const text = await ask(`あなたはモバイル/Webアプリ開発のプロダクトマネージャー兼テックリードです。
次のアイデアを、GitHub Actions 上の Claude Code にそのまま渡せる開発タスクに整えてください。
リポジトリ: ${card.repo}
対象: ${targetText(card.target)}
アイデア: ${card.idea || card.title}
${feedback ? `前回の確認で出た指摘: ${feedback}` : ""}

JSONだけを返してください(コードフェンス不要)。
{"title":"40字以内の具体的なタスク名","spec":"目的と仕様の箇条書き。各行'- 'で始め5〜8行","criteria":["検証できる受入条件を3〜6個"],"prompt":"Claude Codeへの指示。変更範囲、触る場所の見当、追加するテスト、完了の定義を含め、『受入条件をすべて満たしたら gh pr create でPRを作成し、本文に Closes #<issue番号>、テスト結果、確認手順を書くこと』で締める"}`);
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const v = JSON.parse(json);
  return {
    title: String(v.title || card.title).slice(0, 80),
    spec: String(v.spec || ""),
    criteria: Array.isArray(v.criteria) ? v.criteria.map(String).slice(0, 8) : [],
    prompt: String(v.prompt || ""),
  };
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
