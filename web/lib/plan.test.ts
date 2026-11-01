import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBody, parseMarkers, renderBody } from "./body.ts";

// kban-plan.yml が使う templates/.github/kban/resolve.js(アプリのリポジトリで動く)
const path = "../templates/.github/kban/resolve.js";
const k = existsSync(path) ? createRequire(import.meta.url)(`../${path}`) : null;
const opts = { skip: !k && "templates がない環境" };

const plan = {
  title: "腹筋の動画を外す", spec: "- 目的\n- 仕様", steps: ["読む", "直す"], criteria: ["動画が4本"], size: "S", dependsOn: [3], prompt: "直して PR を作る",
};

test("renderPlanBody writes the same body as kban's renderBody", opts, () => {
  const before = renderBody({ idea: "腹筋を外す", spec: "", steps: [], criteria: [], dependsOn: [], prompt: "" }, { rank: 2, runner: "local", planning: 1700000000 });
  const out = k.renderPlanBody(before, plan, 5);
  assert.equal(out, renderBody(
    { idea: "腹筋を外す", spec: plan.spec, steps: plan.steps.map((text) => ({ text, done: false })), criteria: plan.criteria.map((text) => ({ text, done: false })), dependsOn: [3], prompt: plan.prompt },
    { runner: "local", rank: 5 },
  ));
  const m = parseMarkers(out);
  assert.equal(m.planning, undefined); // 作成中の印は消える
  assert.equal(parseBody(out).idea, "腹筋を外す");
});

test("renderPlanBody keeps a plain (non-kban) body as the idea", opts, () => {
  assert.equal(parseBody(k.renderPlanBody("ただのメモ", plan, undefined)).idea, "ただのメモ");
});

test("parsePlan trims and validates Claude's JSON", opts, () => {
  const p = k.parsePlan(`説明\n{"title":" t ","steps":["a",""],"criteria":["c"],"size":"XL","dependsOn":[7,"x",3,0]}\n`, 7);
  assert.deepEqual({ ...p }, { title: "t", spec: "", steps: ["a"], criteria: ["c"], size: "", dependsOn: [3], prompt: "" });
  assert.throws(() => k.parsePlan("JSON なし", 1));
});

/** applyPlan に渡す最小の GitHub のまね */
function fakeGithub(issue: { body: string; labels: string[]; title: string }, ready: { body: string }[] = []) {
  const calls: { update: Record<string, unknown>[]; comment: string[] } = { update: [], comment: [] };
  const github = {
    paginate: async () => ready,
    rest: {
      issues: {
        get: async () => ({ data: { ...issue, labels: issue.labels.map((name) => ({ name })) } }),
        update: async (u: Record<string, unknown>) => { calls.update.push(u); if (typeof u.body === "string") issue.body = u.body; },
        createComment: async (c: { body: string }) => { calls.comment.push(c.body); },
        listForRepo: async () => ({ data: ready }),
      },
    },
  };
  const context = { repo: { owner: "o", repo: "r" }, serverUrl: "https://github.com", runId: 1, issue: {}, payload: {}, eventName: "workflow_dispatch" };
  const core = { info: () => {}, warning: () => {}, failed: "", setFailed(m: string) { this.failed = m; } };
  return { github, context, core, calls };
}

test("applyPlan writes the plan and moves a backlog card to the end of ready", opts, async () => {
  const dir = mkdtempSync(join(tmpdir(), "kban-plan-"));
  const file = join(dir, "out.json");
  writeFileSync(file, JSON.stringify({ type: "result", is_error: false, result: JSON.stringify(plan), usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.01 }));
  const before = renderBody({ idea: "腹筋を外す", spec: "", steps: [], criteria: [], dependsOn: [], prompt: "" }, { rank: 9, planning: 1700000000 });
  const g = fakeGithub({ body: before, labels: ["kban", "kban:backlog", "kban:size-L"], title: "元" }, [{ body: "<!-- kban:rank=4 -->" }, { body: "<!-- kban:rank=100001 -->" }]);
  await k.applyPlan(g, 12, file);
  const first = g.calls.update[0];
  assert.equal(first.title, plan.title);
  assert.deepEqual(first.labels, ["kban", "kban:size-S", "kban:ready"]);
  const m = parseMarkers(String(first.body));
  assert.equal(m.rank, 5);
  assert.equal(m.planning, undefined);
  assert.deepEqual(parseBody(String(first.body)).steps.map((s) => s.text), plan.steps);
  assert.equal(parseMarkers(g.calls.update.at(-1)!.body as string).tokens, 15); // 使用量も記録
  assert.equal(g.core.failed, "");
});

test("applyPlan clears 'planning' and reports when Claude Code failed", opts, async () => {
  const before = renderBody({ idea: "x", spec: "", steps: [], criteria: [], dependsOn: [], prompt: "" }, { planning: 1700000000 });
  const g = fakeGithub({ body: before, labels: ["kban", "kban:backlog"], title: "x" });
  await k.applyPlan(g, 3, "/nonexistent/out.json");
  assert.equal(parseMarkers(String(g.calls.update[0].body)).planning, undefined);
  assert.equal(g.calls.update[0].labels, undefined); // 工程は動かさない
  assert.match(g.calls.comment[0], /進め方を作れませんでした/);
  assert.match(g.core.failed, /結果を返しませんでした/);
});
