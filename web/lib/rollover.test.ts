import { test } from "node:test";
import assert from "node:assert/strict";
import { rolloverTargets, exitTargets } from "./sprint.ts";

const c = (sprint: string | undefined, stage: string) => ({ sprint, stage }) as never;

test("only cards whose implementation is unfinished roll over to this week", () => {
  const week = "2026-11-02";
  const cards = [c("2026-10-26", "building"), c("2026-10-26", "done"), c("2026-10-26", "verifying"), c("2026-11-02", "ready"), c("2026-11-09", "backlog"), c(undefined, "ready"), c("2026-10-19", "backlog")];
  assert.deepEqual(rolloverTargets(cards, week).map((x: { sprint?: string }) => x.sprint), ["2026-10-26", "2026-10-19"]);
});

test("cards that reached 確認 or 完了 leave the sprint", () => {
  const cards = [c("2026-11-02", "verifying"), c("2026-11-02", "done"), c("2026-11-02", "testing"), c(undefined, "done"), c("2026-11-02", "building")];
  assert.deepEqual(exitTargets(cards).map((x: { stage?: string }) => x.stage), ["verifying", "done"]);
});
