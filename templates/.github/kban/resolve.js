// Shared by kban workflows (actions/github-script).
// Finds the kban issue behind a PR / commit and moves its kban:<stage> label forward.
const ORDER = ["backlog", "ready", "building", "testing", "deploying", "verifying", "done"];

function linkedIssue(body, branch) {
  const m = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(body || "");
  if (m) return Number(m[1]);
  const b = /issue-(\d+)/.exec(branch || "");
  return b ? Number(b[1]) : null;
}

async function prFromSha({ github, context }, sha) {
  const { owner, repo } = context.repo;
  const { data } = await github.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha: sha });
  return data.find((p) => p.state === "open") || data[0] || null;
}

/** Move the issue linked to `pr` to `stage` (forward only, except explicit backward moves by the board). */
async function moveFromPr({ github, context, core }, pr, stage, marker) {
  if (!pr) return core.info("PR が見つかりません");
  const n = linkedIssue(pr.body, pr.head && pr.head.ref);
  if (!n) return core.info(`PR #${pr.number} に kban の Issue が紐付いていません`);
  return moveIssue({ github, context, core }, n, stage, marker);
}

async function moveIssue({ github, context, core }, n, stage, marker) {
  const { owner, repo } = context.repo;
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: n });
  const names = issue.labels.map((l) => (typeof l === "string" ? l : l.name));
  if (!names.includes("kban")) return core.info(`#${n} は kban のカードではありません`);
  const cur = Math.max(0, ...names.map((l) => ORDER.indexOf(String(l).replace(/^kban:/, ""))));
  if (ORDER.indexOf(stage) <= cur) return core.info(`#${n} はすでに ${ORDER[cur]} です`);

  const labels = names.filter((l) => !ORDER.some((s) => l === `kban:${s}`)).concat(`kban:${stage}`);
  let body = issue.body || "";
  if (marker) {
    body = body.replace(new RegExp(`\\n?<!-- kban:${marker.key}=.*? -->`, "g"), "");
    body += `\n<!-- kban:${marker.key}=${marker.value} -->`;
  }
  await github.rest.issues.update({ owner, repo, issue_number: n, labels, body });
  core.info(`#${n}: ${ORDER[cur]} → ${stage}`);
  return n;
}

/**
 * Add what Claude Code just used to the card (<!-- kban:tokens=… --> / cost). `file` is claude-code-action's
 * execution_file: a JSON array (or JSON lines) of messages whose last `result` has usage and total_cost_usd.
 * tokens = input + output + cache creation (cache reads are cheap and left out).
 */
async function recordUsage({ github, context, core }, file, issueNumber) {
  const fs = require("fs");
  if (!file || !fs.existsSync(file)) return core.info("実行ログがないので使用量は記録しません");
  const raw = fs.readFileSync(file, "utf8");
  let msgs;
  try { msgs = JSON.parse(raw); } catch { msgs = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
  const r = [].concat(msgs).reverse().find((m) => m && m.type === "result");
  if (!r || !r.usage) return core.info("結果に使用量がありません");
  const u = r.usage;
  const tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const cost = Number(r.total_cost_usd || 0);

  const { owner, repo } = context.repo;
  let n = issueNumber || (context.issue && context.issue.number);
  if (!issueNumber && (context.eventName === "pull_request_review_comment" || (context.payload.issue && context.payload.issue.pull_request))) {
    const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: n });
    n = linkedIssue(pr.body, pr.head.ref);
  }
  if (!n) return core.info("紐付く Issue がないので使用量は記録しません");
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: n });
  const get = (k) => Number((new RegExp(`<!-- kban:${k}=(.*?) -->`).exec(issue.body || "") || [])[1]) || 0;
  // 直近5時間・7日の集計用に「秒:トークン」の履歴も残す(8日より古いものは捨てる)
  const now = Math.floor(Date.now() / 1000);
  const prev = ((/<!-- kban:usage=(.*?) -->/.exec(issue.body || "") || [])[1] || "").split(",").filter(Boolean)
    .filter((e) => now - Number(e.split(":")[0]) < 8 * 86400);
  const usage = [...prev, `${now}:${tokens}`].join(",");
  let body = (issue.body || "").replace(/\n?<!-- kban:(tokens|cost|usage)=.*? -->/g, "");
  body += `\n<!-- kban:tokens=${get("tokens") + tokens} -->\n<!-- kban:cost=${(get("cost") + cost).toFixed(2)} -->\n<!-- kban:usage=${usage} -->`;
  await github.rest.issues.update({ owner, repo, issue_number: n, body });
  core.info(`#${n}: +${tokens} tokens, +$${cost.toFixed(2)}`);
}

/* ---------------- 「AIで進め方を作る」(kban-plan.yml) ---------------- */
// Issue 本文の形式は kban の web/lib/body.ts(renderBody / parseBody)と同じ。変えるときは両方を合わせる(web/lib/plan.test.ts が確認)
const H = { idea: "背景", spec: "仕様", steps: "進め方", criteria: "受入条件", deps: "前提", prompt: "Claude Codeへの指示" };
const DEFAULT_PROMPT = "上記の仕様・進め方・受入条件を満たす実装を行い、PRを作成してください。";
const RANK_UNSET = 100000;

/** "## 見出し" の中身。見出しがなければ null。 */
function section(body, head) {
  const text = (body || "").replace(/\r\n/g, "\n");
  for (const part of text.split(/^## +/m).slice(1)) {
    const nl = part.indexOf("\n");
    if ((nl < 0 ? part : part.slice(0, nl)).trim() !== head) continue;
    const c = (nl < 0 ? "" : part.slice(nl + 1)).split(/^---\s*$/m)[0].replace(/<!--[\s\S]*?-->/g, "").trim();
    return c === "(未記入)" ? "" : c;
  }
  return null;
}
/** カードのアイデア(背景)。kban の形式でない本文は全体をアイデアとみなす(parseBody と同じ)。 */
function ideaOf(body) {
  const hasSections = Object.values(H).some((h) => section(body, h) !== null);
  return hasSections ? section(body, H.idea) || "" : (body || "").replace(/<!--[\s\S]*?-->/g, "").trim();
}
const markerOf = (body, k) => (new RegExp(`<!-- kban:${k}=(.*?) -->`).exec(body || "") || [])[1];

/** Claude の返答から JSON を取り出し、kban のカードの形に整える(web/lib/ai.ts の makePlan と同じ制限)。 */
function parsePlan(text, n) {
  const v = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  const list = (x) => (Array.isArray(x) ? x : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
  return {
    title: String(v.title || "").trim().slice(0, 80),
    spec: String(v.spec || "").trim(),
    steps: list(v.steps),
    criteria: list(v.criteria),
    size: ["S", "M", "L"].includes(String(v.size)) ? String(v.size) : "",
    dependsOn: (Array.isArray(v.dependsOn) ? v.dependsOn : []).map(Number).filter((x) => Number.isInteger(x) && x > 0 && x !== n),
    prompt: String(v.prompt || "").trim(),
  };
}

/** 本文の背景と kban の印(rank 以外)を残し、仕様・進め方・受入条件・前提・指示を plan で置き換える。 */
function renderPlanBody(body, plan, rank) {
  const list = (xs) => (xs.length ? xs.map((t) => `- [ ] ${t}`).join("\n") : "- [ ] (未記入)");
  const marks = ((body || "").match(/<!-- kban:[\w-]+=.*? -->/g) || []).filter((m) => !/^<!-- kban:(rank|planning)=/.test(m));
  if (rank !== undefined) marks.push(`<!-- kban:rank=${rank} -->`);
  return [
    "<!-- kban:v1 -->",
    `## ${H.idea}`, ideaOf(body) || "(未記入)", "",
    `## ${H.spec}`, plan.spec || "(未記入)", "",
    `## ${H.steps}`, list(plan.steps), "",
    `## ${H.criteria}`, list(plan.criteria), "",
    `## ${H.deps}`, plan.dependsOn.length ? plan.dependsOn.map((x) => `- #${x}`).join("\n") : "- なし", "",
    `## ${H.prompt}`, plan.prompt || DEFAULT_PROMPT, "",
    "---",
    "kban で管理されています。工程は `kban:*` ラベルで進みます。",
    marks.join("\n"),
  ].join("\n").trimEnd();
}

const TARGET_TEXT = { ios: "iOSアプリ", both: "iOSアプリ+Web", web: "Webアプリ" };

/** Claude Code に渡す指示(web/lib/ai.ts の makePlan と同じ内容に、コードを読む指示を足したもの)。 */
async function planPrompt({ github, context }, n) {
  const fs = require("fs");
  const { owner, repo } = context.repo;
  const [{ data: issue }, { data: info }, open] = await Promise.all([
    github.rest.issues.get({ owner, repo, issue_number: n }),
    github.rest.repos.get({ owner, repo }),
    github.paginate(github.rest.issues.listForRepo, { owner, repo, labels: "kban", state: "open", per_page: 100 }),
  ]);
  const labels = issue.labels.map((l) => (typeof l === "string" ? l : l.name));
  let target = ["ios", "both", "web"].find((t) => labels.includes(`kban:${t}`));
  if (!target) { try { target = JSON.parse(fs.readFileSync(".github/kban/config.json", "utf8")).target; } catch { /* なし */ } }
  const others = open.filter((i) => !i.pull_request && i.number !== n).map((i) => `#${i.number}: ${i.title}`);
  return `あなたはモバイル/Webアプリ開発のテックリードです。作業ディレクトリはこのリポジトリです。コードを Read / Glob / Grep で必要なだけ確認したうえで、次のアイデアを、GitHub Actions 上の Claude Code にそのまま渡せる開発タスクに整え、進め方を決めてください。コードやファイルは変更しないこと。
リポジトリ: ${owner}/${repo}(${TARGET_TEXT[target] || TARGET_TEXT.web})${info.description ? `\n概要: ${info.description}` : ""}
Issue: #${n}
タイトル: ${issue.title}
アイデア: ${ideaOf(issue.body) || issue.title}
同じリポジトリの他のタスク(#番号: タイトル):
${others.join("\n") || "なし"}

最後の返答は JSON だけにする(コードフェンス不要・前後に説明を書かない):
{"title":"40字以内の具体的なタスク名","spec":"目的と仕様の箇条書き。各行'- 'で始め3〜5行。各行は短く簡潔に","steps":["進め方を3〜5ステップ。各ステップは1行で簡潔に"],"criteria":["検証できる受入条件を3〜4個。各1行で簡潔に"],"size":"S|M|L","dependsOn":[先に終わっている必要がある他タスクの番号],"prompt":"Claude Codeへの指示。変更範囲、触る場所(実在するファイルのパス)、進め方、追加するテスト、完了の定義を含め、『受入条件をすべて満たしたら gh pr create でPRを作成し、本文に Closes #${n}、テスト結果、確認手順を書くこと』で締める"}`;
}

/** kban-plan.yml の結果(claude -p --output-format json)をカードに書き込む。バックログのカードは「次にやる」の末尾へ。 */
async function applyPlan({ github, context, core }, n, file) {
  const fs = require("fs");
  const { owner, repo } = context.repo;
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: n });
  const body = (issue.body || "").replace(/\n?<!-- kban:planning=.*? -->/g, "");
  let plan = null;
  let why = "";
  try {
    if (!file || !fs.existsSync(file)) throw new Error("Claude Code が結果を返しませんでした");
    const out = JSON.parse(fs.readFileSync(file, "utf8"));
    if (out.is_error) throw new Error(String(out.result || out.subtype || "Claude Code がエラーで終わりました"));
    plan = parsePlan(String(out.result || ""), n);
  } catch (e) {
    why = e.message;
  }
  if (!plan) {
    await github.rest.issues.update({ owner, repo, issue_number: n, body });
    const run = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
    await github.rest.issues.createComment({ owner, repo, issue_number: n, body: `kban: 進め方を作れませんでした(${why})。\n実行ログ: ${run}` });
    return core.setFailed(why);
  }

  const names = issue.labels.map((l) => (typeof l === "string" ? l : l.name));
  let labels = names.filter((l) => !/^kban:size-/.test(l));
  if (plan.size) labels.push(`kban:size-${plan.size}`);
  let rank;
  if (names.includes("kban:backlog")) {
    const ready = await github.paginate(github.rest.issues.listForRepo, { owner, repo, labels: "kban:ready", state: "open", per_page: 100 });
    rank = Math.max(0, ...ready.map((i) => Number(markerOf(i.body, "rank"))).filter((r) => r > 0 && r < RANK_UNSET)) + 1;
    labels = labels.filter((l) => l !== "kban:backlog").concat("kban:ready");
  }
  await github.rest.issues.update({
    owner, repo, issue_number: n, labels,
    title: plan.title || issue.title,
    body: renderPlanBody(body, plan, rank ?? (markerOf(body, "rank") !== undefined ? Number(markerOf(body, "rank")) : undefined)),
  });
  core.info(`#${n}: 進め方を書き込みました(${plan.steps.length} ステップ、受入条件 ${plan.criteria.length} 件)`);
  try { await recordUsage({ github, context, core }, file, n); } catch (e) { core.warning(`使用量の記録に失敗: ${e.message}`); }
}

/* ---------------- 「AIで優先順位」(kban-prioritize.yml) ---------------- */
// 提案は各カードの <!-- kban:proposal=時刻;順番;サイズ;並行可(1/0);前提(番号,番号);理由 --> に書く。
// kban(web/lib/priority.ts)がこれを集めて「AIの提案」として出し、「この順番にする」で確定・「やめる」で消す
const POOL = ["kban:backlog", "kban:ready"];
const ACTIVE_LABELS = ["kban:building", "kban:testing", "kban:deploying", "kban:verifying"];
const labelsOf = (i) => i.labels.map((l) => (typeof l === "string" ? l : l.name));

async function openCards({ github, context }) {
  const { owner, repo } = context.repo;
  const all = await github.paginate(github.rest.issues.listForRepo, { owner, repo, labels: "kban", state: "open", per_page: 100 });
  return all.filter((i) => !i.pull_request);
}
const rankOf = (i) => { const r = Number(markerOf(i.body, "rank")); return Number.isFinite(r) && markerOf(i.body, "rank") !== undefined ? r : RANK_UNSET + i.number; };
const poolOf = (cards) => cards.filter((i) => labelsOf(i).some((l) => POOL.includes(l))).sort((a, b) => rankOf(a) - rankOf(b));

/** Claude Code に渡す指示(web/lib/ai.ts の prioritize と同じ内容に、コードを読む指示を足したもの) */
async function prioritizePrompt(ctx) {
  const { owner, repo } = ctx.context.repo;
  const [cards, { data: info }] = await Promise.all([openCards(ctx), ctx.github.rest.repos.get({ owner, repo })]);
  const pool = poolOf(cards);
  if (pool.length < 2) throw new Error("並べ替えるには、バックログと「次にやる」に2件以上必要です");
  const active = cards.filter((i) => labelsOf(i).some((l) => ACTIVE_LABELS.includes(l))).map((i) => i.title);
  let target;
  try { target = JSON.parse(require("fs").readFileSync(".github/kban/config.json", "utf8")).target; } catch { /* なし */ }
  return `あなたは個人開発者のプロダクトマネージャーです。作業ディレクトリはこのリポジトリです。必要ならコードを Read / Glob / Grep で確認し(変更はしない)、次のバックログについて何から着手すべきかを決めてください。
リポジトリ: ${owner}/${repo}(${TARGET_TEXT[target] || TARGET_TEXT.web})${info.description ? `\n概要: ${info.description}` : ""}
いま進行中: ${active.join(" / ") || "なし"}
基準: ユーザーへの価値が大きい、小さく早く出せる、他の作業の前提になるものを先に。同時に進めても同じ画面やファイルを触らないものは並行可能にする。

バックログ(#番号: タイトル — 内容):
${pool.map((i) => `#${i.number}: ${i.title} — ${ideaOf(i.body).slice(0, 160)}`).join("\n")}

最後の返答は JSON だけにする(コードフェンス不要・前後に説明を書かない)。全件を含め、先にやる順に並べる:
{"items":[{"number":12,"size":"S|M|L","reason":"なぜこの順番か(40字以内)","dependsOn":[先に終わっている必要がある番号],"parallel":true}]}`;
}

/** 提案の印の値。";" 区切りで、理由は最後(";" を含んでもよい) */
function proposalMarker(ts, order, x) {
  const reason = String(x.reason || "").replace(/-->/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${ts};${order};${x.size || ""};${x.parallel ? 1 : 0};${(x.dependsOn || []).join(",")};${reason}`;
}

/** kban-prioritize.yml の結果(claude -p --output-format json)を、各カードの提案の印として書く */
async function applyPriorities(ctx, file) {
  const fs = require("fs");
  const { github, context, core } = ctx;
  const { owner, repo } = context.repo;
  const cards = await openCards(ctx);
  const pool = poolOf(cards);
  const nums = new Set(pool.map((i) => i.number));
  const activeNums = new Set(cards.filter((i) => labelsOf(i).some((l) => ACTIVE_LABELS.includes(l))).map((i) => i.number));
  let items;
  try {
    if (!file || !fs.existsSync(file)) throw new Error("Claude Code が結果を返しませんでした");
    const out = JSON.parse(fs.readFileSync(file, "utf8"));
    if (out.is_error) throw new Error(String(out.result || out.subtype || "Claude Code がエラーで終わりました"));
    const text = String(out.result || "");
    const v = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    items = (Array.isArray(v.items) ? v.items : [])
      .filter((x) => nums.has(Number(x.number)))
      .map((x) => ({
        number: Number(x.number),
        size: ["S", "M", "L"].includes(String(x.size)) ? String(x.size) : "",
        reason: String(x.reason || ""),
        dependsOn: (Array.isArray(x.dependsOn) ? x.dependsOn : []).map(Number).filter((n) => n !== Number(x.number) && (nums.has(n) || activeNums.has(n))),
        parallel: x.parallel === true,
      }));
    if (!items.length) throw new Error("提案に、バックログのカードが1件も含まれていませんでした");
  } catch (e) {
    return core.setFailed(`優先順位を作れませんでした: ${e.message}`);
  }
  const seen = new Set();
  items = items.filter((x) => !seen.has(x.number) && seen.add(x.number));
  for (const i of pool) if (!seen.has(i.number)) items.push({ number: i.number, size: "", reason: "", dependsOn: [], parallel: false }); // 漏れたものは末尾
  const ts = Math.floor(Date.now() / 1000);
  for (const [k, x] of items.entries()) {
    const issue = pool.find((i) => i.number === x.number);
    const body = (issue.body || "").replace(/\n?<!-- kban:proposal=.*? -->/g, "") + `\n<!-- kban:proposal=${proposalMarker(ts, k + 1, x)} -->`;
    await github.rest.issues.update({ owner, repo, issue_number: x.number, body });
  }
  core.info(`${items.length} 件に優先順位の提案を書きました`);
}

module.exports = { recordUsage, linkedIssue, prFromSha, moveFromPr, moveIssue, ORDER, planPrompt, applyPlan, parsePlan, renderPlanBody, prioritizePrompt, applyPriorities, proposalMarker };
