import { NextResponse } from "next/server";
import { httpStatusFor } from "@/core/util/errors";
import { searchArticles } from "@/services/search.service";

// GET /api/search?q=<query>&source=<sourceId>
// Thin route: validate input, call the service, shape the response.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const source = searchParams.get("source") ?? undefined;

  if (!query) {
    return NextResponse.json({ error: "Missing required query parameter: q" }, { status: 400 });
  }

  try {
    const articles = await searchArticles(query, source);
    return NextResponse.json({ articles });
  } catch (err) {
    // ConfigError -> 500, UpstreamError (news API) -> 502.
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: httpStatusFor(err) });
  }
}
