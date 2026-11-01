import { test } from "node:test";
import assert from "node:assert/strict";
import { weekOf, addWeeks, weekLabel, weekRange, isWeek, usedBetween, sprintLoad, remaining } from "./sprint.ts";
import type { Card } from "./github.ts";

test("weekOf returns the Monday of the week", () => {
  assert.equal(weekOf(new Date(2026, 10, 1)), "2026-10-26"); // 日曜 → 前の月曜
  assert.equal(weekOf(new Date(2026, 10, 2)), "2026-11-02"); // 月曜
  assert.equal(weekOf(new Date(2026, 10, 7, 23, 59)), "2026-11-02"); // 土曜
  assert.equal(addWeeks("2026-12-28", 1), "2027-01-04");
  assert.ok(isWeek("2026-11-02") && !isWeek("2026-11-03") && !isWeek("x"));
});

test("weekLabel names this / next / last week, otherwise the dates", () => {
  const now = new Date(2026, 10, 4);
  assert.equal(weekLabel("2026-11-02", now), "今週");
  assert.equal(weekLabel("2026-11-09", now), "来週");
  assert.equal(weekLabel("2026-10-26", now), "先週");
  assert.equal(weekLabel("2026-11-16", now), "11/16〜11/22");
});

const card = (over: Partial<Card>): Card => ({
  id: "o/r#1", repo: "o/r", number: 1, title: "t", stage: "backlog", target: "web", size: "S", rank: 1, reason: "", url: "",
  idea: "", spec: "", steps: [], criteria: [], dependsOn: [], prompt: "", createdAt: "", updatedAt: "", ...over,
});

test("usedBetween sums usage events inside [from, to)", () => {
  const [from, to] = weekRange("2026-11-02");
  const c = card({ usage: `${from - 1}:100,${from}:10,${to - 1}:20,${to}:1000` });
  assert.equal(usedBetween([c], from, to), 30);
});

test("sprintLoad: estimates for not-done cards, actual use this week, and % of the weekly limit", () => {
  const now = new Date(2026, 10, 4, 12);
  const [from] = weekRange("2026-11-02");
  const all = [
    card({ number: 1, sprint: "2026-11-02", size: "S" }), // 既定 15万
    card({ number: 2, sprint: "2026-11-02", size: "M", stage: "building", tokens: 200_000, usage: `${from + 60}:200000` }), // 50万 - 20万
    card({ number: 3, sprint: "2026-11-02", stage: "done", tokens: 90_000 }),
    card({ number: 4, sprint: "2026-11-09", size: "L" }),
    card({ number: 5, size: "L" }),
  ];
  assert.equal(remaining(all[1], all), 300_000);
  const l = sprintLoad("2026-11-02", all, 1_000_000, now);
  assert.deepEqual(l.cards.map((c) => c.number), [1, 2, 3]);
  assert.equal(l.done, 1);
  assert.equal(l.planned, 450_000);
  assert.equal(l.used, 200_000);
  assert.deepEqual([l.plannedPct, l.usedPct, l.totalPct, l.over], [45, 20, 65, false]);

  const next = sprintLoad("2026-11-09", all, 1_000_000, now);
  assert.deepEqual([next.planned, next.used, next.totalPct, next.over], [1_500_000, 0, 150, true]);
  assert.equal(sprintLoad("2026-11-02", all, undefined, now).totalPct, undefined);
});
