import { test } from "node:test";
import assert from "node:assert/strict";
import { estimate, monthUsed, DEFAULT_TOKENS } from "./usage.ts";

const c = (o: Record<string, unknown>) => ({ repo: "a/b", number: 1, stage: "done", size: "M", ...o }) as never;

test("estimate: default by size, then median of finished cards of the same size", () => {
  assert.deepEqual(estimate(c({ size: "S", stage: "backlog" }), []).tokens, DEFAULT_TOKENS.S);
  const one = estimate(c({ number: 9, stage: "ready" }), [c({ number: 2, tokens: 100 })]);
  assert.equal(one.basis, "default");
  const e = estimate(c({ number: 9, stage: "ready" }), [c({ number: 2, tokens: 100 }), c({ number: 3, tokens: 300 }), c({ number: 4, size: "L", tokens: 9999 }), c({ number: 9, tokens: 5 })]);
  assert.equal(e.basis, "history");
  assert.equal(e.tokens, 200);
  assert.equal(e.samples, 2);
});

test("monthUsed counts only this month", () => {
  const now = new Date("2026-10-31T00:00:00Z");
  assert.equal(monthUsed([{ tokens: 5, updatedAt: "2026-10-02T00:00:00Z" }, { tokens: 7, updatedAt: "2026-09-30T00:00:00Z" }, { updatedAt: "2026-10-03T00:00:00Z" }], now), 5);
});
