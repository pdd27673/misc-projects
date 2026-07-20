import { NextResponse } from "next/server";
import { getGnewsQuota } from "@/services/quota.service";

// GET /api/quota — today's GNews usage vs. the free-tier daily limit.
export async function GET() {
  try {
    const quota = await getGnewsQuota();
    return NextResponse.json(quota);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load quota";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
