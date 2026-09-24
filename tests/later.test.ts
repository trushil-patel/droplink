import assert from "node:assert/strict";
import test from "node:test";
import { createIdentity, encryptFile, decryptFile, LATER_MAX_BYTES } from "../lib/later/crypto";
import { requireOwner, validPublicKey } from "../lib/later/server";
import { POST } from "../app/api/later/route";
import { GET as cleanup } from "../app/api/later/cleanup/route";

test("offline encryption preserves text, Unicode, empty and binary files; rejects tampering and wrong receiver", async () => {
  const receiver = await createIdentity();
  const stranger = await createIdentity();
  assert.match(receiver.token, /^[a-f0-9]{64}$/);
  assert.equal(validPublicKey(receiver.publicKey), true);
  assert.equal(validPublicKey(receiver.privateKey), false);
  for (const file of [new File(["\tcode 🚀\r\n  next\n\n"], "code.txt", { type: "text/plain" }), new File([new Uint8Array([0, 255, 128, 3])], "folder.zip", { type: "application/zip" }), new File([], "empty")]) {
    const sealed = await encryptFile(file, receiver.publicKey, "file");
    const bytes = await sealed.blob.arrayBuffer();
    const opened = await decryptFile(bytes, sealed.envelope, receiver);
    assert.equal(opened.file.name, file.name);
    assert.equal(opened.file.type, file.type);
    assert.deepEqual(new Uint8Array(await opened.file.arrayBuffer()), new Uint8Array(await file.arrayBuffer()));
    await assert.rejects(decryptFile(bytes, sealed.envelope, stranger));
    const modified = new Uint8Array(bytes.slice(0)); modified[modified.length - 1] ^= 1;
    await assert.rejects(decryptFile(modified.buffer, sealed.envelope, receiver));
  }
  const text = new File(["\t hello\n"], "snippet.txt");
  const encrypted = await encryptFile(text, receiver.publicKey, "text");
  assert.equal((await decryptFile(await encrypted.blob.arrayBuffer(), encrypted.envelope, receiver)).kind, "text");
  const huge = new File([], "huge"); Object.defineProperty(huge, "size", { value: LATER_MAX_BYTES + 1 });
  await assert.rejects(encryptFile(huge, receiver.publicKey, "file"), /25 MiB/);
});

test("private owner checks cannot be replaced with a public code or another device", () => {
  const row = { sender_id: "sender", receiver_id: "receiver" };
  requireOwner(row, "sender", "sender"); requireOwner(row, "receiver", "receiver");
  assert.throws(() => requireOwner(row, "sender", "receiver"));
  assert.throws(() => requireOwner(row, "receiver", "sender"));
  assert.throws(() => requireOwner(null, "receiver", "receiver"));
});

test("offline API and cleanup reject requests without private credentials", async () => {
  assert.equal((await POST(new Request("https://test/api/later", { method: "POST", body: JSON.stringify({ action: "inbox" }) }))).status, 401);
  assert.equal((await POST(new Request("https://test/api/later", { method: "POST", headers: { Authorization: "Bearer 123456" }, body: "{}" }))).status, 401);
  assert.equal((await cleanup(new Request("https://test/api/later/cleanup"))).status, 401);
});
