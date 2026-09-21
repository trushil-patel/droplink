// Allow direct paths alongside TURN; never force all file traffic through a relay.
export function getWebRtcConfig(turnServers: RTCIceServer[] = []): RTCConfiguration {
  return {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }, ...turnServers],
    iceTransportPolicy: "all",
  };
}
