import { NextResponse } from "next/server";
import { SENTIMENTS } from "@/core/ai/openai";
import { listAnalyses, type ListOptions } from "@/services/analyses.service";

// GET /api/analyses?sentiment=positive|neutral|negative&sort=newest|oldest
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Only accept known values; ignore anything else rather than erroring.
  const sentimentParam = searchParams.get("sentiment");
  const sentiment = SENTIMENTS.find((s) => s === sentimentParam);
  const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";

  const opts: ListOptions = { sort };
  if (sentiment) opts.sentiment = sentiment;

  try {
    const analyses = await listAnalyses(opts);
    return NextResponse.json({ analyses });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load analyses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
