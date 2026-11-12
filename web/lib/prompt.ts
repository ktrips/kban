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
      "終わったら(PR を作る場合はその後)、カードを「確認」に進めてください(kban で確認して OK すると完了になります)。`summary` は変更の要約と PR の URL を簡潔に、`followups` は今回やらなかったこと・気づき(1件1行、なければ空配列。kban の新しいアイデアになります)。",
      "```bash",
      `curl -sS -X POST ${done.origin}/api/done \\`,
      `  -H 'Authorization: Bearer ${done.token}' -H 'content-type: application/json' \\`,
      `  -d '{"summary":"...","followups":["..."]}'`,
      "```",
    ].join("\n"),
  ];
  return out.filter(Boolean).join("\n\n");
}

/**
 * 「claude.ai で開く」のリンク: Claude Code(クラウド)の新しいセッションを、そのリポジトリを選び、指示を入れた状態で開く。
 * https://claude.ai/code/new?q=指示&repo=owner/name(公式ヘルプのリンク形式)。リポジトリが Claude アカウントに連携されていないと repo は無視される。
 * 指示が長すぎるとリンクが切れるので、その場合はリポジトリだけ選んで(指示はコピー済みを貼る)開く。
 */
export function claudeCodeUrl(repo: string, prompt: string): string {
  const base = `https://claude.ai/code/new?repo=${encodeURIComponent(repo)}`;
  return prompt.length < 6000 ? `${base}&q=${encodeURIComponent(prompt)}` : base;
}
