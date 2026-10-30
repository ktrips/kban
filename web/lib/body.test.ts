import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBody, renderBody, linkedIssue } from "./body.ts";
import { stageFromLabels, targetFromLabels } from "./stages.ts";

test("body round-trips", () => {
  const b = {
    idea: "倍速を保存したい",
    spec: "- 1.5倍を既定に\n- 1つ追加できる",
    criteria: [{ text: "反映される", done: true }, { text: "再起動後も残る", done: false }],
    prompt: "UserDefaultsに保存すること",
  };
  assert.deepEqual(parseBody(renderBody(b)), b);
});

test("plain issue body becomes the idea", () => {
  assert.equal(parseBody("サムネで並べ替えたい").idea, "サムネで並べ替えたい");
});

test("stage is the furthest label; closed is done", () => {
  assert.equal(stageFromLabels(["kenban", "kenban:spec", "kenban:testing"]), "testing");
  assert.equal(stageFromLabels(["kenban"]), "idea");
  assert.equal(stageFromLabels(["kenban:queued"], true), "done");
  assert.equal(targetFromLabels(["kenban:ios"]), "ios");
});

test("linked issue from PR body or branch", () => {
  assert.equal(linkedIssue("Implements it.\n\nCloses #12", "x"), 12);
  assert.equal(linkedIssue("", "claude/issue-34-20261030-0912"), 34);
  assert.equal(linkedIssue("nothing", "main"), null);
});
