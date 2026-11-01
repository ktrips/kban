import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBody, renderBody, parseMarkers, linkedIssue } from "./body.ts";
import { stageFromLabels, targetFromLabels, sizeFromLabels } from "./stages.ts";

test("body and markers round-trip", () => {
  const b = {
    idea: "倍速を保存したい",
    spec: "- 1.5倍を既定に\n- 1つ追加できる",
    steps: [{ text: "モデルを作る", done: true }, { text: "UIを作る", done: false }],
    criteria: [{ text: "反映される", done: true }, { text: "再起動後も残る", done: false }],
    dependsOn: [3, 8],
    prompt: "UserDefaultsに保存すること",
  };
  const md = renderBody(b, { rank: 2, reason: "小さく早く出せる", pr: "https://github.com/o/r/pull/9" });
  assert.deepEqual(parseBody(md), b);
  assert.deepEqual(parseMarkers(md), { rank: 2, reason: "小さく早く出せる", pr: "https://github.com/o/r/pull/9", preview: undefined, parallel: undefined, tokens: undefined, cost: undefined, usage: undefined, runner: undefined, planning: undefined, sprint: undefined });
});

test("empty sections stay empty", () => {
  const md = renderBody({ idea: "x", spec: "", steps: [], criteria: [], dependsOn: [], prompt: "" });
  const b = parseBody(md);
  assert.equal(b.spec, "");
  assert.deepEqual(b.steps, []);
  assert.deepEqual(b.dependsOn, []);
});

test("plain issue body becomes the idea", () => {
  assert.equal(parseBody("サムネで並べ替えたい").idea, "サムネで並べ替えたい");
});

test("labels", () => {
  assert.equal(stageFromLabels(["kban", "kban:ready", "kban:testing"]), "testing");
  assert.equal(stageFromLabels(["kban"]), "backlog");
  assert.equal(stageFromLabels(["kban:building"], true), "done");
  assert.equal(targetFromLabels(["kban:ios"]), "ios");
  assert.equal(targetFromLabels(["kban"]), null);
  assert.equal(sizeFromLabels(["kban:size-M"]), "M");
});

test("linked issue from PR body or branch", () => {
  assert.equal(linkedIssue("Implements it.\n\nCloses #12", "x"), 12);
  assert.equal(linkedIssue("", "claude/issue-34-20261030-0912"), 34);
  assert.equal(linkedIssue("nothing", "main"), null);
});

test("idea with screenshot markdown survives render → parse", () => {
  const idea = "ホームのボタンが切れる\n\n![スクリーンショット](https://github.com/ktrips/kfit/blob/kban-attachments/attachments/a.jpg?raw=true)";
  const md = renderBody({ idea, spec: "", steps: [], criteria: [], dependsOn: [], prompt: "" }, { rank: 1 });
  assert.equal(parseBody(md).idea, idea);
});

test("usage markers round-trip", () => {
  const md = renderBody({ idea: "x", spec: "", steps: [], criteria: [], dependsOn: [], prompt: "" }, { rank: 2, tokens: 123456, cost: 1.23 });
  const m = parseMarkers(md);
  assert.equal(m.tokens, 123456);
  assert.equal(m.cost, 1.23);
  assert.equal(parseMarkers(renderBody({ idea: "x", spec: "", steps: [], criteria: [], dependsOn: [], prompt: "" }, { usage: "100:5,200:7" })).usage, "100:5,200:7");
  assert.equal(parseMarkers("<!-- kban:rank=1 -->").tokens, undefined);
});
