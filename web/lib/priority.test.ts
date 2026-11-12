import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { parseProposal, collectProposal } from "./priority.ts";
import { parseMarkers, renderBody } from "./body.ts";

const path = "../templates/.github/kban/resolve.js";
const k = existsSync(path) ? createRequire(import.meta.url)(`../${path}`) : null;

test("parseProposal reads the marker (reason may contain ';')", () => {
  assert.deepEqual(parseProposal(7, "1700000000;2;S;1;3,5;先に土台を作る;理由"), {
    number: 7, ts: 1700000000, order: 2, size: "S", parallel: true, dependsOn: [3, 5], reason: "先に土台を作る;理由",
  });
  assert.equal(parseProposal(7, "壊れた"), null);
  assert.equal(parseProposal(7, undefined), null);
});

test("collectProposal returns the latest round in order, only for backlog / ready", () => {
  const cards = [
    { number: 1, stage: "backlog" as const, proposal: "200;2;M;0;;b" },
    { number: 2, stage: "ready" as const, proposal: "200;1;S;1;1;a" },
    { number: 3, stage: "backlog" as const, proposal: "100;1;L;0;;old" }, // 前の回
    { number: 4, stage: "building" as const, proposal: "300;1;S;0;;moved" }, // もう着手済み
    { number: 5, stage: "backlog" as const },
  ];
  assert.deepEqual(collectProposal(cards)?.map((x) => [x.number, x.size, x.parallel, x.dependsOn, x.reason]), [[2, "S", true, [1], "a"], [1, "M", false, [], "b"]]);
  assert.equal(collectProposal([{ number: 1, stage: "backlog" }]), null);
});

test("resolve.js proposalMarker round-trips through the issue body", { skip: !k && "templates がない環境" }, () => {
  const v = k.proposalMarker(1700000000, 3, { size: "M", parallel: false, dependsOn: [9], reason: "画面が同じ; --> 先に" });
  const body = renderBody({ idea: "x", spec: "", steps: [], criteria: [], dependsOn: [], prompt: "" }, { proposal: v });
  const p = parseProposal(4, parseMarkers(body).proposal);
  assert.deepEqual(p, { number: 4, ts: 1700000000, order: 3, size: "M", parallel: false, dependsOn: [9], reason: "画面が同じ; 先に" });
});

/** applyPriorities に渡す最小の GitHub のまね */
function fake(issues: { number: number; title: string; body: string; labels: string[] }[]) {
  const updates: { issue_number: number; body: string }[] = [];
  const github = {
    paginate: async () => issues.map((i) => ({ ...i, labels: i.labels.map((name) => ({ name })) })),
    rest: { issues: { listForRepo: async () => ({}), update: async (u: { issue_number: number; body: string }) => { updates.push(u); } }, repos: { get: async () => ({ data: {} }) } },
  };
  const core = { info: () => {}, failed: "", setFailed(m: string) { this.failed = m; } };
  return { ctx: { github, context: { repo: { owner: "o", repo: "r" } }, core }, updates, core };
}

test("applyPriorities writes a proposal marker on every backlog / ready card (missing ones go last)", { skip: !k && "templates がない環境" }, async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const file = `${mkdtempSync(`${tmpdir()}/kban-pri-`)}/out.json`;
  const items = [{ number: 12, size: "S", reason: "小さく早い", dependsOn: [99, 11], parallel: true }, { number: 11, size: "L", reason: "大きい" }, { number: 999, reason: "ない" }];
  writeFileSync(file, JSON.stringify({ type: "result", is_error: false, result: JSON.stringify({ items }) }));
  const f = fake([
    { number: 11, title: "a", body: "<!-- kban:rank=1 -->\n<!-- kban:proposal=1;1;;0;;old -->", labels: ["kban", "kban:backlog"] },
    { number: 12, title: "b", body: "<!-- kban:rank=2 -->", labels: ["kban", "kban:ready"] },
    { number: 13, title: "c", body: "", labels: ["kban", "kban:backlog"] },
    { number: 14, title: "d", body: "", labels: ["kban", "kban:building"] },
  ]);
  await k.applyPriorities(f.ctx, file);
  assert.equal(f.core.failed, "");
  const got = f.updates.map((u) => parseProposal(u.issue_number, parseMarkers(u.body).proposal)!);
  assert.deepEqual(got.map((p) => [p.number, p.order, p.size, p.parallel, p.dependsOn]), [[12, 1, "S", true, [11]], [11, 2, "L", false, []], [13, 3, "", false, []]]);
  assert.equal(f.updates[1].body.match(/kban:proposal=/g)!.length, 1); // 前回の提案は置き換え
});

test("applyPriorities fails without touching cards when Claude Code returned nothing", { skip: !k && "templates がない環境" }, async () => {
  const f = fake([{ number: 1, title: "a", body: "", labels: ["kban", "kban:backlog"] }, { number: 2, title: "b", body: "", labels: ["kban", "kban:backlog"] }]);
  await k.applyPriorities(f.ctx, "/nonexistent.json");
  assert.match(f.core.failed, /結果を返しませんでした/);
  assert.equal(f.updates.length, 0);
});
