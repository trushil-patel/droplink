import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const domain = process.env.METERED_DOMAIN?.trim().replace(/^https:\/\//, "").replace(/\/$/, "");
  const apiKey = process.env.METERED_TURN_API_KEY?.trim();
  const headers = { "Cache-Control": "no-store" };
  if (!domain || !/^[a-z0-9-]+\.metered\.live$/i.test(domain) || !apiKey) {
    return NextResponse.json({ error: "TURN fallback is not configured. Set METERED_DOMAIN and METERED_TURN_API_KEY in Vercel and redeploy." }, { status: 503, headers });
  }
  try {
    const url = new URL(`https://${domain}/api/v1/turn/credentials`);
    url.searchParams.set("apiKey", apiKey);
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Provider unavailable");
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid provider response");
    const iceServers: RTCIceServer[] = [];
    for (const entry of data) {
      if (!entry || typeof entry.username !== "string" || !entry.username || typeof entry.credential !== "string" || !entry.credential) continue;
      const urls = (Array.isArray(entry.urls) ? entry.urls : [entry.urls]).filter(
        (url: unknown): url is string => typeof url === "string" && /^turns?:[^\s]+$/.test(url),
      );
      if (urls.length) iceServers.push({ urls, username: entry.username, credential: entry.credential });
    }
    if (!iceServers.length) throw new Error("No TURN servers");
    return NextResponse.json({ iceServers }, { headers });
  } catch {
    return NextResponse.json({ error: "Metered TURN fallback is unavailable. Check your credential, quota and Metered service status." }, { status: 502, headers });
  }
}
