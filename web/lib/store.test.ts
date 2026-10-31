import { test } from "node:test";
import assert from "node:assert/strict";
import { createBoard, boardsFor, setMember, getBoard, deleteBoard, seal, open } from "./store.ts";

test("GitHub token is sealed and opens again", () => {
  const s = seal("gho_secret");
  assert.notEqual(s, "gho_secret");
  assert.equal(open(s), "gho_secret");
});

test("boards: own, shared by email, unshare, delete", async () => {
  const ken = { uid: "google:1", email: "ken@example.com", name: "Ken" };
  const b = await createBoard(ken, "個人アプリ");
  assert.deepEqual((await boardsFor(ken.uid, ken.email)).own.map((x) => x.id), [b.id]);

  await setMember((await getBoard(b.id))!, "Friend@Example.com", "viewer");
  const f = await boardsFor("google:2", "friend@example.com");
  assert.equal(f.shared.length, 1);
  assert.equal(f.shared[0].members["friend@example.com"], "viewer");

  await setMember((await getBoard(b.id))!, "friend@example.com", null);
  assert.equal((await boardsFor("google:2", "friend@example.com")).shared.length, 0);

  await deleteBoard((await getBoard(b.id))!);
  assert.equal((await boardsFor(ken.uid, ken.email)).own.length, 0);
});

test("capture token: works once issued, old one is revoked, login code is single use", async () => {
  const { ensureUser, issueCaptureToken, userByCaptureToken, makeLoginCode, takeLoginCode } = await import("./store.ts");
  const u = await ensureUser("google:cap", "cap@example.com", "Cap");
  const t1 = await issueCaptureToken(u.uid);
  assert.equal((await userByCaptureToken(t1))?.uid, u.uid);
  const t2 = await issueCaptureToken(u.uid);
  assert.equal(await userByCaptureToken(t1), null);
  assert.equal((await userByCaptureToken(t2))?.uid, u.uid);
  const code = await makeLoginCode(u.uid);
  assert.equal(await takeLoginCode(code), u.uid);
  assert.equal(await takeLoginCode(code), null);
});
