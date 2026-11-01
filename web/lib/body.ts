/**
 * kban stores a card's content in the GitHub Issue body as fixed Markdown sections,
 * so the same issue is readable by humans, by Claude Code, and by this app.
 * Machine-only values (rank, reason, PR, preview) live in HTML comments: <!-- kban:key=value -->
 */
export type Check = { text: string; done: boolean };
export type CardBody = {
  idea: string;
  spec: string;
  steps: Check[];
  criteria: Check[];
  dependsOn: number[];
  prompt: string;
};
export type Markers = { rank?: number; reason?: string; pr?: string; preview?: string; parallel?: boolean; tokens?: number; cost?: number; usage?: string; runner?: "local" };

const H = { idea: "背景", spec: "仕様", steps: "進め方", criteria: "受入条件", deps: "前提", prompt: "Claude Codeへの指示" } as const;

const checks = (content: string): Check[] =>
  content
    .split("\n")
    .map((l) => /^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m && !/^\(未記入\)$/.test(m[2].trim()))
    .map((m) => ({ text: m[2].trim(), done: m[1].toLowerCase() === "x" }));

export function parseBody(md: string | null | undefined): CardBody {
  const out: CardBody = { idea: "", spec: "", steps: [], criteria: [], dependsOn: [], prompt: "" };
  if (!md) return out;
  const text = md.replace(/\r\n/g, "\n");
  let found = false;
  for (const part of text.split(/^## +/m).slice(1)) {
    const nl = part.indexOf("\n");
    const head = (nl < 0 ? part : part.slice(0, nl)).trim();
    const content = (nl < 0 ? "" : part.slice(nl + 1)).split(/^---\s*$/m)[0].replace(/<!--[\s\S]*?-->/g, "").trim();
    const clean = content === "(未記入)" ? "" : content;
    if (head === H.idea) { out.idea = clean; found = true; }
    else if (head === H.spec) { out.spec = clean; found = true; }
    else if (head === H.prompt) { out.prompt = clean; found = true; }
    else if (head === H.steps) { out.steps = checks(content); found = true; }
    else if (head === H.criteria) { out.criteria = checks(content); found = true; }
    else if (head === H.deps) { out.dependsOn = [...content.matchAll(/#(\d+)/g)].map((m) => Number(m[1])); found = true; }
  }
  if (!found) out.idea = text.replace(/<!--[\s\S]*?-->/g, "").trim();
  return out;
}

export function renderBody(b: CardBody, m: Markers = {}): string {
  const list = (xs: Check[]) => (xs.length ? xs.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`).join("\n") : "- [ ] (未記入)");
  return [
    "<!-- kban:v1 -->",
    `## ${H.idea}`, b.idea || "(未記入)", "",
    `## ${H.spec}`, b.spec || "(未記入)", "",
    `## ${H.steps}`, list(b.steps), "",
    `## ${H.criteria}`, list(b.criteria), "",
    `## ${H.deps}`, b.dependsOn.length ? b.dependsOn.map((n) => `- #${n}`).join("\n") : "- なし", "",
    `## ${H.prompt}`,
    b.prompt || "上記の仕様・進め方・受入条件を満たす実装を行い、PRを作成してください。",
    "",
    "---",
    "kban で管理されています。工程は `kban:*` ラベルで進みます。",
    renderMarkers(m),
  ].filter((l) => l !== null).join("\n").trimEnd();
}

export function parseMarkers(body: string | null | undefined): Markers {
  const get = (k: string) => new RegExp(`<!-- kban:${k}=(.*?) -->`).exec(body || "")?.[1];
  const rank = get("rank");
  const par = get("parallel");
  const num = (k: string) => { const v = get(k); return v ? Number(v) || undefined : undefined; };
  return {
    runner: get("runner") === "local" ? ("local" as const) : undefined,
    tokens: num("tokens"),
    cost: num("cost"),
    usage: get("usage") || undefined,
    rank: rank !== undefined && rank !== "" ? Number(rank) : undefined,
    reason: get("reason") || undefined,
    pr: get("pr") || undefined,
    preview: get("preview") || undefined,
    parallel: par === undefined ? undefined : par === "true",
  };
}

function renderMarkers(m: Markers): string {
  return (Object.entries(m) as [string, unknown][])
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `<!-- kban:${k}=${String(v).replace(/-->/g, "").replace(/\n/g, " ")} -->`)
    .join("\n");
}

/** Issue number Claude Code is working on, from a PR body ("Closes #12") or branch ("claude/issue-12-…"). */
export function linkedIssue(prBody: string | null | undefined, branch: string | null | undefined): number | null {
  const m = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(prBody || "");
  if (m) return Number(m[1]);
  const b = /issue-(\d+)/.exec(branch || "");
  return b ? Number(b[1]) : null;
}
