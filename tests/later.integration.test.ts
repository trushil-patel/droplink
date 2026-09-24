// Explicit opt-in: this creates a real encrypted test object and three test inboxes.
import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/later/route";
import { adminClient, BUCKET, hash } from "../lib/later/server";
import { createIdentity, encryptFile, decryptFile, type LocalIdentity } from "../lib/later/crypto";

test("configured Supabase: upload, inbox, authorization, decrypt, complete, expiry", { skip: process.env.RUN_LATER_INTEGRATION !== "1" }, async () => {
  const db = adminClient();
  const identities = await Promise.all([createIdentity(), createIdentity(), createIdentity()]);
  let transferId: string | undefined;
  const api = async (identity: LocalIdentity, body: object, expected = 200) => {
    const response = await POST(new Request("https://test/api/later", { method: "POST", headers: { Authorization: `Bearer ${identity.token}` }, body: JSON.stringify(body) }));
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data)); return data;
  };
  try {
    const [sender, receiver, stranger] = identities;
    const accounts = await Promise.all(identities.map((identity) => api(identity, { action: "register", publicKey: identity.publicKey })));
    const destination = await api(sender, { action: "lookup", code: accounts[1].code });
    const sealed = await encryptFile(new File(["\tasync transfer\n"], "test.txt"), destination.public_key, "text");
    const ticket = await api(sender, { action: "prepare", code: accounts[1].code, envelope: sealed.envelope, size: sealed.blob.size, kind: "text" });
    transferId = ticket.id;
    await api(sender, { action: "commit", id: transferId }, 409);
    const upload = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: sealed.blob });
    assert.ok(upload.ok, `Upload HTTP ${upload.status}`);
    await api(sender, { action: "commit", id: transferId });
    await api(stranger, { action: "download", id: transferId }, 404);
    await api(sender, { action: "download", id: transferId }, 404);
    await api(stranger, { action: "reject", id: transferId }, 404);
    const inbox = await api(receiver, { action: "inbox" });
    assert.ok(inbox.items.some((item: { id: string }) => item.id === transferId));
    const download = await api(receiver, { action: "download", id: transferId });
    const bytes = await (await fetch(download.url)).arrayBuffer();
    assert.equal(await (await decryptFile(bytes, download.envelope, receiver)).file.text(), "\tasync transfer\n");
    await api(receiver, { action: "complete", id: transferId });
    assert.equal((await api(receiver, { action: "inbox" })).items.length, 0);
    await api(receiver, { action: "download", id: transferId }, 409);
    await db.from("dl_transfers").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", transferId);
    await api(receiver, { action: "download", id: transferId }, 410);
  } finally {
    if (transferId) {
      await db.storage.from(BUCKET).remove([`${transferId}/payload.bin`]);
      await db.from("dl_transfers").delete().eq("id", transferId);
    }
    await db.from("dl_devices").delete().in("token_hash", identities.map((identity) => hash(identity.token)));
  }
});
