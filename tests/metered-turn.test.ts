import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/ice-servers/route";

test("Metered endpoint handles config, preserves relay transports and hides upstream errors", async () => {
  const fetchBefore = globalThis.fetch;
  const domainBefore = process.env.METERED_DOMAIN;
  const keyBefore = process.env.METERED_TURN_API_KEY;
  try {
    delete process.env.METERED_DOMAIN;
    delete process.env.METERED_TURN_API_KEY;
    assert.equal((await GET()).status, 503);
    process.env.METERED_DOMAIN = "https://example.metered.live/";
    process.env.METERED_TURN_API_KEY = "private-test-key";
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "example.metered.live");
      assert.equal(url.pathname, "/api/v1/turn/credentials");
      assert.equal(url.searchParams.get("apiKey"), "private-test-key");
      assert.equal(options?.cache, "no-store");
      assert.equal(options?.redirect, "error");
      return Response.json([
        { urls: "stun:stun.relay.metered.ca:80" },
        { urls: ["turn:global.relay.metered.ca:80?transport=tcp", "turns:global.relay.metered.ca:443?transport=tcp", "https://invalid.test"], username: "user", credential: "password" },
      ]);
    };
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.json();
    assert.deepEqual(body.iceServers[0].urls, ["turn:global.relay.metered.ca:80?transport=tcp", "turns:global.relay.metered.ca:443?transport=tcp"]);
    assert.ok(!JSON.stringify(body).includes("private-test-key"));
    for (const invalid of [{}, [], [null], [{ urls: "turn:x", username: "", credential: "" }]]) {
      globalThis.fetch = async () => Response.json(invalid);
      assert.equal((await GET()).status, 502);
    }
    globalThis.fetch = async () => new Response("secret upstream detail", { status: 401 });
    const failure = await GET();
    assert.equal(failure.status, 502);
    assert.ok(!(await failure.text()).includes("secret upstream detail"));
    globalThis.fetch = async () => { throw new Error("timeout"); };
    assert.equal((await GET()).status, 502);
    process.env.METERED_DOMAIN = "example.com/unsafe";
    assert.equal((await GET()).status, 503);
  } finally {
    globalThis.fetch = fetchBefore;
    if (domainBefore === undefined) delete process.env.METERED_DOMAIN;
    else process.env.METERED_DOMAIN = domainBefore;
    if (keyBefore === undefined) delete process.env.METERED_TURN_API_KEY;
    else process.env.METERED_TURN_API_KEY = keyBefore;
  }
});
