import { NextResponse } from "next/server";
import { httpStatusFor } from "@/core/util/errors";
import { analyze } from "@/services/analyze.service";

// POST /api/analyze
// Body: { url, title, description?, source }
// Thin route: validate body, call the service, return its result.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const { url, title, description, source } = (body ?? {}) as Record<string, unknown>;
  if (typeof url !== "string" || typeof title !== "string" || typeof source !== "string") {
    return NextResponse.json({ error: "url, title and source are required" }, { status: 400 });
  }

  try {
    const result = await analyze({
      url,
      title,
      description: typeof description === "string" ? description : "",
      source,
    });
    return NextResponse.json(result);
  } catch (err) {
    // ConfigError -> 500, UpstreamError (OpenAI) -> 502.
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: httpStatusFor(err) });
  }
}
