import OpenAI from "openai";
import { ConfigError, UpstreamError } from "@/core/util/errors";
import { withRetry } from "@/core/util/retry";

// Single source of truth for sentiment values, reused by the DB schema.
export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export interface AnalysisResult {
  summary: string;
  sentiment: Sentiment;
}

// One combined call returns both fields as JSON — cheaper and atomic vs. two calls.
const SYSTEM_PROMPT = `You analyze a news article and respond with JSON only, matching exactly:
{ "summary": string, "sentiment": "positive" | "neutral" | "negative" }
"summary" is a neutral 2-3 sentence summary. "sentiment" is the overall tone of the article's subject.`;

// Lazily created so importing this module (e.g. at build time) doesn't require the key.
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ConfigError("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function analyzeArticle(title: string, description: string): Promise<AnalysisResult> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-nano";

  const res = await withRetry(() =>
    getClient()
      .chat.completions.create({
        model,
        response_format: { type: "json_object" }, // force valid JSON we can parse
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Title: ${title}\n\nDescription: ${description}` },
        ],
      })
      .catch((err) => {
        throw new UpstreamError("openai", err instanceof Error ? err.message : "OpenAI request failed");
      }),
  );

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { summary?: unknown; sentiment?: unknown };

  // Validate the model output before trusting it — narrow, explicit checks.
  if (typeof parsed.summary !== "string" || !isSentiment(parsed.sentiment)) {
    throw new Error("OpenAI returned an unexpected shape");
  }
  return { summary: parsed.summary, sentiment: parsed.sentiment };
}

function isSentiment(v: unknown): v is Sentiment {
  return typeof v === "string" && (SENTIMENTS as readonly string[]).includes(v);
}
