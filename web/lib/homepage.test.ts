import { test } from "node:test";
import assert from "node:assert/strict";
import { homepageUrl } from "./homepage.ts";

test("homepageUrl keeps http(s) websites and drops the rest", () => {
  assert.equal(homepageUrl("https://fit.ktrips.net"), "https://fit.ktrips.net");
  assert.equal(homepageUrl("  http://blog.ktrips.net/yomi-skill-bot/  "), "http://blog.ktrips.net/yomi-skill-bot/");
  assert.equal(homepageUrl(""), undefined);
  assert.equal(homepageUrl(null), undefined);
  assert.equal(homepageUrl("fit.ktrips.net"), undefined);
  assert.equal(homepageUrl("javascript:alert(1)"), undefined);
});
