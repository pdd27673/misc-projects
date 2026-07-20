import { Analysis, type AnalysisDoc } from "@/core/db/analysis.model";
import { connectToDb } from "@/core/db/connect";
import type { Sentiment } from "@/core/ai/openai";

export interface ListOptions {
  sentiment?: Sentiment; // filter to one sentiment
  sort?: "newest" | "oldest"; // by analyzedAt; defaults to newest
}

// Lists stored analyses with optional sentiment filter and date sort.
// The { sentiment, analyzedAt } compound index backs the common filtered+sorted query.
export async function listAnalyses(opts: ListOptions = {}): Promise<AnalysisDoc[]> {
  await connectToDb();

  const filter = opts.sentiment ? { sentiment: opts.sentiment } : {};
  const direction = opts.sort === "oldest" ? 1 : -1;

  return Analysis.find(filter).sort({ analyzedAt: direction }).lean<AnalysisDoc[]>();
}
