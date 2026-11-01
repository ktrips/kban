import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLimits, current } from "./limits.ts";

const now = 1_800_000_000_000;

test("parseLimits reads Claude Code's status line rate_limits (whole JSON or just rate_limits)", () => {
  const rl = { five_hour: { used_percentage: 23.46, resets_at: 1_800_003_600 }, seven_day: { used_percentage: 41.2, resets_at: 1_800_300_000 } };
  const want = { fiveHour: { pct: 23.5, resetsAt: 1_800_003_600 }, sevenDay: { pct: 41.2, resetsAt: 1_800_300_000 }, at: 1_800_000_000 };
  assert.deepEqual(parseLimits({ model: { id: "x" }, rate_limits: rl }, now), want);
  assert.deepEqual(parseLimits(rl, now), want);
  assert.deepEqual(parseLimits({ seven_day: rl.seven_day }, now), { fiveHour: undefined, sevenDay: want.sevenDay, at: want.at });
});

test("parseLimits rejects missing or broken windows", () => {
  assert.equal(parseLimits({}, now), null);
  assert.equal(parseLimits(null, now), null);
  assert.equal(parseLimits({ rate_limits: { seven_day: { used_percentage: "x", resets_at: 1 } } }, now), null);
  assert.equal(parseLimits({ seven_day: { used_percentage: 10 } }, now), null);
});

test("current drops windows that have already reset", () => {
  const l = { fiveHour: { pct: 90, resetsAt: 1_799_999_000 }, sevenDay: { pct: 40, resetsAt: 1_800_100_000 }, at: 1 };
  assert.deepEqual(current(l, now), { fiveHour: undefined, sevenDay: l.sevenDay, at: 1 });
  assert.equal(current({ ...l, sevenDay: { pct: 1, resetsAt: 1 } }, now), null);
});
