import { NextResponse } from "next/server";
import { listAnalyses } from "@/services/analyses.service";

// GET /api/analyses — all stored analyses, newest first.
export async function GET() {
  try {
    const analyses = await listAnalyses();
    return NextResponse.json({ analyses });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load analyses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
