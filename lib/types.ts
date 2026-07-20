// Types the client (React components) uses. Kept separate from the server-side
// core types so client code never imports server modules (mongoose/openai).
// Article mirrors core/sources/types.ts Article on purpose.

export type Sentiment = "positive" | "neutral" | "negative";

export interface Article {
  title: string;
  url: string;
  description: string;
  source: string;
  publishedAt: string;
}

// A stored analysis as returned by GET /api/analyses (dates arrive as ISO strings).
export interface StoredAnalysis {
  url: string;
  title: string;
  summary: string;
  sentiment: Sentiment;
  source: string;
  analyzedAt: string;
}

// The POST /api/analyze response adds whether it came from cache.
export interface AnalysisResult extends StoredAnalysis {
  cached: boolean;
}
