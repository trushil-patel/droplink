// Direct connections only. STUN discovers reachable addresses; it never relays files.
export function getWebRtcConfig(): RTCConfiguration {
  return {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    iceTransportPolicy: "all",
  };
}
