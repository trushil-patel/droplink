import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminClient, BUCKET } from "../../../../lib/later/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (!secret || secret.length < 32 || providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = adminClient();
    // Upload tickets expire in two hours. Rows live 24 hours, so cleanup cannot
    // race an unexpired upload ticket and leave a recreated orphan object.
    const rows = await db.from("dl_transfers").select("id,object_path").lte("expires_at", new Date().toISOString()).limit(500);
    if (rows.error) throw rows.error;
    if (rows.data.length) {
      const removed = await db.storage.from(BUCKET).remove(rows.data.map((row) => row.object_path));
      if (removed.error) throw removed.error;
      const deleted = await db.from("dl_transfers").delete().in("id", rows.data.map((row) => row.id));
      if (deleted.error) throw deleted.error;
    }
    const pruned = await db.from("dl_rate_limits").delete().lt("created_at", new Date(Date.now() - 2 * 86400000).toISOString());
    if (pruned.error) throw pruned.error;
    return NextResponse.json({ deleted: rows.data.length }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Cleanup failed; retry and check service configuration." }, { status: 503 }); }
}
