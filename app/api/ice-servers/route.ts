import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const domain = process.env.METERED_DOMAIN?.trim().replace(/^https:\/\//, "").replace(/\/$/, "");
  const key = process.env.METERED_TURN_API_KEY?.trim();
  const headers = { "Cache-Control": "no-store" };
  if (!domain || !key || !/^[a-z0-9-]+\.metered\.live$/i.test(domain)) {
    return NextResponse.json({ error: "TURN is not configured. Set METERED_DOMAIN and METERED_TURN_API_KEY in Vercel, then redeploy." }, { status: 503, headers });
  }
  try {
    const url = new URL(`https://${domain}/api/v1/turn/credentials`);
    url.searchParams.set("apiKey", key);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Provider rejected credentials");
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid response");
    const iceServers = data.flatMap((entry) => {
      if (!entry || typeof entry.username !== "string" || typeof entry.credential !== "string") return [];
      const urls = (Array.isArray(entry.urls) ? entry.urls : [entry.urls]).filter((url: unknown) => typeof url === "string" && /^turns?:/.test(url));
      return urls.length ? [{ urls, username: entry.username, credential: entry.credential }] : [];
    });
    if (!iceServers.length) throw new Error("No TURN servers");
    return NextResponse.json({ iceServers }, { headers });
  } catch {
    return NextResponse.json({ error: "TURN credentials unavailable. Check your Metered credential and quota, then retry." }, { status: 502, headers });
  }
}
