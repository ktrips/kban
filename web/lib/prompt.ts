import type { Card } from "./github";

type P = Pick<Card, "title" | "number" | "repo" | "idea" | "spec" | "steps" | "criteria" | "prompt" | "url">;

const IMG = /!\[[^\]]*\]\(https:\/\/github\.com\/[^)\s]+\/blob\/kban-attachments\/attachments\/([\w.-]+)\?raw=true\)/g;

/**
 * 手元の Claude(VS Code / アプリ / claude.ai)に貼り付ける指示。カードの内容と、
 * 終わったら kban に完了を報告するコマンド(このカード専用の使い捨てトークン)を含める。
 */
export function composePrompt(c: P, done?: { origin: string; token: string }): string {
  const shots = [...c.idea.matchAll(IMG)].map((m) => m[1]);
  const idea = c.idea.replace(IMG, "").trim();
  const list = (xs: { text: string }[]) => xs.map((x) => `- ${x.text}`).join("\n");
  const out = [
    `# ${c.title}`,
    `リポジトリ: ${c.repo}  /  kban カード: ${c.url}`,
    idea && `## 背景\n${idea}`,
    shots.length && `## スクリーンショット\n${shots.length}枚あります(${c.repo} の \`kban-attachments\` ブランチの \`attachments/\` 配下): ${shots.join(", ")}\n見るには \`gh api repos/${c.repo}/contents/attachments/<ファイル名>?ref=kban-attachments\` で取得してください。`,
    c.spec && `## 仕様\n${c.spec}`,
    c.steps.length && `## 進め方\n${list(c.steps)}`,
    c.criteria.length && `## 受入条件\n${list(c.criteria)}`,
    c.prompt && `## 指示\n${c.prompt}`,
    done && [
      "## 終わったら kban に報告",
      "作業が終わったら(PR を作る場合はその後)、次のコマンドで kban のカードを完了にしてください。",
      "`summary` に変更の要約と PR の URL、`followups` に **今回やらなかったこと・気づき・次にやるとよいこと**(1件1行、なければ空配列)を入れます。followups は kban の新しいアイデアになります。",
      "```bash",
      `curl -sS -X POST ${done.origin}/api/done \\`,
      `  -H 'Authorization: Bearer ${done.token}' -H 'content-type: application/json' \\`,
      `  -d '{"summary":"...","followups":["..."]}'`,
      "```",
    ].join("\n"),
  ];
  return out.filter(Boolean).join("\n\n");
}
