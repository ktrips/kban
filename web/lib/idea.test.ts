import { test } from "node:test";
import assert from "node:assert/strict";
import { splitIdea, joinIdea, imageCount, replaceImage, imageNames } from "./idea.ts";
import { readImageWith, sniffImageType } from "./image.ts";

const md = "![スクリーンショット](https://github.com/ktrips/kban/blob/kban-attachments/attachments/a-1.jpg?raw=true)";

test("images are separated from the text and put back on save", () => {
  const idea = `ホームが切れる\n\n${md}\n\n${md.replace("a-1", "a-2")}`;
  const s = splitIdea(idea, "/api/img");
  assert.equal(s.text, "ホームが切れる");
  assert.deepEqual(s.images, ["/api/img/a-1.jpg", "/api/img/a-2.jpg"]);
  assert.equal(joinIdea("ホームが切れる(追記)", s.md), `ホームが切れる(追記)\n\n${md}\n\n${md.replace("a-1", "a-2")}`);
  assert.equal(imageCount(idea), 2);
  assert.deepEqual(splitIdea("画像なし", "/x").images, []);
});

test("readImage returns the exact bytes (base64 file, and blob API for large files)", async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x80, 0x81, 0xfe, 0x00]);
  const small = { repos: { getContent: async () => ({ data: { type: "file", content: bytes.toString("base64"), sha: "s" } }) }, git: {} };
  assert.ok((await readImageWith(small as never, "o/r", "a.jpg")).equals(bytes));
  const large = { repos: { getContent: async () => ({ data: { type: "file", content: "", sha: "big" } }) }, git: { getBlob: async ({ file_sha }: { file_sha: string }) => ({ data: { content: file_sha === "big" ? bytes.toString("base64") : "" } }) } };
  assert.ok((await readImageWith(large as never, "o/r", "a.png")).equals(bytes));
  await assert.rejects(readImageWith(small as never, "o/r", "../x.jpg"));
});

test("sniffImageType reads the real format from the bytes", () => {
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), "image/png");
  assert.equal(sniffImageType(Buffer.from("GIF89a")), "image/gif");
  assert.equal(sniffImageType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")])), "image/webp");
  assert.equal(sniffImageType(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypheic"), Buffer.alloc(4)])), "image/heic");
  assert.equal(sniffImageType(Buffer.from("hello world!")), null);
});

test("replaceImage points one attachment at its copy in the new repo", () => {
  const a = "![スクリーンショット](https://github.com/ktrips/kfit/blob/kban-attachments/attachments/a-1.jpg?raw=true)";
  const b = "![スクリーンショット](https://github.com/ktrips/kfit/blob/kban-attachments/attachments/b-2.png?raw=true)";
  const idea = `メモ\n\n${a}\n\n${b}`;
  assert.deepEqual(imageNames(idea), ["a-1.jpg", "b-2.png"]);
  const moved = "![スクリーンショット](https://github.com/ktrips/kmap/blob/kban-attachments/attachments/new-1.jpg?raw=true)";
  assert.equal(replaceImage(idea, "a-1.jpg", moved), `メモ\n\n${moved}\n\n${b}`);
  assert.equal(replaceImage(idea, "zzz.jpg", moved), idea);
});
