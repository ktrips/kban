import { test } from "node:test";
import assert from "node:assert/strict";
import { rolloverTargets } from "./sprint.ts";

const c = (sprint: string | undefined, stage: string) => ({ sprint, stage }) as never;

test("only unfinished cards from past weeks roll over to this week", () => {
  const week = "2026-11-02";
  const cards = [c("2026-10-26", "building"), c("2026-10-26", "done"), c("2026-11-02", "ready"), c("2026-11-09", "backlog"), c(undefined, "ready"), c("2026-10-19", "backlog")];
  assert.equal(rolloverTargets(cards, week).length, 2);
  assert.deepEqual(rolloverTargets(cards, week).map((x: { sprint?: string }) => x.sprint), ["2026-10-26", "2026-10-19"]);
});
