/**
 * kenban stores a card's content in the GitHub Issue body as fixed Markdown sections,
 * so the same issue is readable by humans, by Claude Code, and by this app.
 */
export type CardBody = {
  idea: string;
  spec: string;
  criteria: { text: string; done: boolean }[];
  prompt: string;
};

const H = { idea: "背景", spec: "仕様", criteria: "受入条件", prompt: "Claude Codeへの指示" } as const;

export function parseBody(md: string | null | undefined): CardBody {
  const out: CardBody = { idea: "", spec: "", criteria: [], prompt: "" };
  if (!md) return out;
  const text = md.replace(/\r\n/g, "\n");
  const parts = text.split(/^## +/m);
  let found = false;
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    const head = (nl < 0 ? part : part.slice(0, nl)).trim();
    const content = (nl < 0 ? "" : part.slice(nl + 1)).split(/^---\s*$/m)[0].trim();
    if (head === H.idea) { out.idea = content; found = true; }
    else if (head === H.spec) { out.spec = content; found = true; }
    else if (head === H.prompt) { out.prompt = content; found = true; }
    else if (head === H.criteria) {
      found = true;
      out.criteria = content
        .split("\n")
        .map((l) => /^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/.exec(l))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => ({ text: m[2].trim(), done: m[1].toLowerCase() === "x" }));
    }
  }
  if (!found) out.idea = text.replace(/<!--[\s\S]*?-->/g, "").trim();
  return out;
}

export function renderBody(b: CardBody): string {
  const crit = b.criteria.length
    ? b.criteria.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`).join("\n")
    : "- [ ] (未記入)";
  return [
    "<!-- kenban:v1 -->",
    `## ${H.idea}`, b.idea || "(未記入)", "",
    `## ${H.spec}`, b.spec || "(未記入)", "",
    `## ${H.criteria}`, crit, "",
    `## ${H.prompt}`,
    b.prompt || "上記の仕様と受入条件を満たす実装を行い、PRを作成してください。",
    "",
    "---",
    "kenban で管理されています。工程は `kenban:*` ラベルで進みます。",
  ].join("\n");
}

/** Issue number Claude Code is working on, from a PR body ("Closes #12") or branch ("claude/issue-12-…"). */
export function linkedIssue(prBody: string | null | undefined, branch: string | null | undefined): number | null {
  const m = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(prBody || "");
  if (m) return Number(m[1]);
  const b = /issue-(\d+)/.exec(branch || "");
  return b ? Number(b[1]) : null;
}
