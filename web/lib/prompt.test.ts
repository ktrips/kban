import { test } from "node:test";
import assert from "node:assert/strict";
import { composePrompt } from "./prompt.ts";

const card = {
  title: "横向きでボタンが切れる", number: 12, repo: "ktrips/kfit", url: "https://github.com/ktrips/kfit/issues/12",
  idea: "ホームのボタンが切れる\n\n![スクリーンショット](https://github.com/ktrips/kfit/blob/kban-attachments/attachments/a.jpg?raw=true)",
  spec: "- 横向きでも収まる", steps: [{ text: "原因を調べる", done: false }], criteria: [{ text: "横向きで切れない", done: false }], prompt: "PR を作る",
};

test("prompt has the card, screenshot hint and the completion command", () => {
  const p = composePrompt(card, { origin: "https://kban.ktrips.net", token: "kbc_abc" });
  assert.match(p, /^# 横向きでボタンが切れる/);
  assert.match(p, /ホームのボタンが切れる/);
  assert.ok(!p.includes("![スクリーンショット]"));
  assert.match(p, /1枚あります.*a\.jpg/);
  assert.match(p, /- 横向きで切れない/);
  assert.match(p, /curl -sS -X POST https:\/\/kban\.ktrips\.net\/api\/done/);
  assert.match(p, /Bearer kbc_abc/);
});

test("without a completion grant there is no report section", () => {
  assert.ok(!composePrompt({ ...card, idea: "x", spec: "", steps: [], criteria: [], prompt: "" }).includes("/api/done"));
});

test("claudeCodeUrl: Claude Code のクラウドをリポジトリ指定+指示つきで開く。長すぎる指示はリポジトリだけ", async () => {
  const { claudeCodeUrl } = await import("./prompt.ts");
  const u = new URL(claudeCodeUrl("ktrips/kban", "直して & 確認"));
  assert.equal(u.origin + u.pathname, "https://claude.ai/code/new");
  assert.equal(u.searchParams.get("repo"), "ktrips/kban");
  assert.equal(u.searchParams.get("q"), "直して & 確認");
  const long = new URL(claudeCodeUrl("ktrips/kban", "あ".repeat(6000)));
  assert.equal(long.searchParams.get("repo"), "ktrips/kban");
  assert.equal(long.searchParams.get("q"), null);
});
