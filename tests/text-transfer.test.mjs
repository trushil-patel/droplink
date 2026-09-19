import assert from "node:assert/strict";
import test from "node:test";

test("chunked UTF-8 transfer preserves code formatting and Unicode", async () => {
  for (const text of [
    "function test() {\n\treturn 42;  \n}\n\n",
    "  nested\r\n\tcode\r\n",
    " ".repeat(16383) + "🚀" + "\n  code\t\n".repeat(5000),
    "\t \n\n",
  ]) {
    const source = new Blob([text]);
    const chunks = [];
    for (let offset = 0; offset < source.size; offset += 16384) {
      chunks.push(await source.slice(offset, offset + 16384).arrayBuffer());
    }
    assert.equal(await new Blob(chunks).text(), text);
  }
});
