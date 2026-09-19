import assert from "node:assert/strict";
import test from "node:test";
import { getWebRtcConfig } from "../lib/webrtc-config";

test("direct WebRTC uses STUN only, without TURN credentials or relay-only policy", () => {
  const config = getWebRtcConfig();
  assert.equal(config.iceTransportPolicy, "all");
  assert.ok(config.iceServers?.length);
  for (const server of config.iceServers!) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    assert.ok(urls.length);
    for (const url of urls) assert.match(url, /^stun:/);
    assert.equal(server.username, undefined);
    assert.equal(server.credential, undefined);
  }
});
