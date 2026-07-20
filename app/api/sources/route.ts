import { NextResponse } from "next/server";
import { listSources } from "@/services/sources.service";

// GET /api/sources — the enabled news sources for the UI's source picker.
export function GET() {
  return NextResponse.json({ sources: listSources() });
}
