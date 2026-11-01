import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { TEMPLATES } from "./templates.generated.ts";
import { planInstall } from "./install.ts";

test("embedded templates are up to date (run: npm run sync-templates)", () => {
  if (!existsSync("../templates")) return;
  for (const [f, content] of Object.entries(TEMPLATES)) assert.equal(content, readFileSync(`../templates/${f}`, "utf8"), f);
});

test("planInstall mirrors install.sh", async () => {
  const none = async () => null;
  const web = await planInstall("web", "", none);
  assert.ok(web[".github/workflows/kban-ci.yml"] && !web[".github/workflows/kban-testflight.yml"]);
  assert.match(web[".github/workflows/kban-claude.yml"], /runs-on: ubuntu-latest/);
  assert.ok(!web[".github/workflows/kban-claude.yml"].includes("__RUNNER__"));
  assert.match(web[".github/workflows/kban-plan.yml"], /workflow_dispatch/); // 「AIで進め方を作る」を Claude Code(契約)で

  const both = await planInstall("both", "Komb", async (p) => (p === "CLAUDE.md" ? "# mine\n" : p === "fastlane/Fastfile" ? "lane" : null));
  assert.ok(both[".github/workflows/kban-ci-web.yml"] && both[".github/workflows/kban-testflight.yml"]);
  assert.equal(both["fastlane/Fastfile"], undefined); // 既存の Fastfile は上書きしない
  assert.match(both["CLAUDE.md"], /^# mine\n\n/);
  assert.match(both[".github/workflows/kban-claude.yml"], /runs-on: macos-15/);
  assert.match(both[".github/kban/config.json"], /"scheme": "Komb"/);

  const again = await planInstall("web", "", async (p) => (p === "CLAUDE.md" ? "x\n## kban のルール\n" : null));
  assert.equal(again["CLAUDE.md"], undefined); // 重複して追記しない
  await assert.rejects(planInstall("ios", "", none));
});
