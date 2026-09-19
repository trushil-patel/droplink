import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createFolderArchive, MAX_FOLDER_BYTES } from "../lib/folder-archive";

function entry(path: string, data: string | Uint8Array) {
  const file = new File([typeof data === "string" ? data : new Uint8Array(data).buffer], path.split("/").pop()!);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

test("folder ZIP preserves nested paths, duplicate basenames, Unicode and binary contents", async () => {
  const files = [entry("project/a/code.txt", "\tfirst\n"), entry("project/b/code.txt", "  second\n"), entry("project/日本語.bin", new Uint8Array([0, 255, 3])), entry("project/empty.txt", "")];
  const archive = await createFolderArchive(files);
  assert.equal(archive.name, "project.zip");
  assert.equal(archive.type, "application/zip");
  const zip = await JSZip.loadAsync(await archive.arrayBuffer(), { checkCRC32: true });
  for (const file of files) {
    assert.deepEqual(await zip.file(file.webkitRelativePath)!.async("uint8array"), new Uint8Array(await file.arrayBuffer()));
  }
});

test("folder packaging rejects empty selections, unsafe paths, duplicates and oversized folders", async () => {
  await assert.rejects(createFolderArchive([]), /at least one file/);
  for (const path of ["../bad.txt", "project/../bad.txt", "/project/file.txt", "file.txt"]) {
    await assert.rejects(createFolderArchive([entry(path, "x")]), /paths/);
  }
  await assert.rejects(createFolderArchive([entry("p/a", "a"), entry("p/a", "b")]), /duplicate/);
  const large = entry("p/large", "");
  Object.defineProperty(large, "size", { value: MAX_FOLDER_BYTES + 1 });
  await assert.rejects(createFolderArchive([large]), /250 MiB/);
});
