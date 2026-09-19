import assert from "node:assert/strict";
import test from "node:test";
import { removeTransferredFile } from "../lib/transfer-files";

test("receipt removes only its exact file, preserving new files with the same name", () => {
  const sent = { name: "code.txt", size: 20 };
  const newlyAdded = { name: "code.txt", size: 20 };
  const pending = { name: "pending.txt", size: 30 };
  const files = [sent, pending, newlyAdded];
  const remaining = removeTransferredFile(files, sent);
  assert.deepEqual(remaining, [pending, newlyAdded]);
  assert.equal(files.length, 3);
  assert.equal(removeTransferredFile(remaining, sent), remaining);
});
