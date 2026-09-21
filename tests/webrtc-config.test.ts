import assert from "node:assert/strict";
import test from "node:test";
import { getWebRtcConfig } from "../lib/webrtc-config";

test("without TURN credentials, direct-only configuration remains available", () => {
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

test("TURN fallback retains direct candidates and TLS port 443", () => {
  const relay = { urls: ["turn:global.relay.metered.ca:80?transport=tcp", "turns:global.relay.metered.ca:443?transport=tcp"], username: "user", credential: "password" };
  const config = getWebRtcConfig([relay]);
  assert.equal(config.iceTransportPolicy, "all");
  assert.equal(config.iceServers?.length, 2);
  assert.deepEqual(config.iceServers?.[1], relay);
});
