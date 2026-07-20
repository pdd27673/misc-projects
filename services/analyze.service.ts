import { analyzeArticle, type AnalysisResult } from "@/core/ai/openai";
import { Analysis, type AnalysisDoc } from "@/core/db/analysis.model";
import { connectToDb } from "@/core/db/connect";

export interface AnalyzeInput {
  url: string;
  title: string;
  description: string;
  source: string;
}

export interface AnalyzeOutput extends AnalysisResult {
  url: string;
  title: string;
  source: string;
  analyzedAt: string;
  cached: boolean; // true when we returned a stored analysis instead of calling OpenAI
}

// Core analyze flow: cache lookup -> OpenAI -> save. This is the piece a unit
// test exercises (with OpenAI mocked), so it stays small and linear.
export async function analyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
  await connectToDb();

  // Cache: if this URL was analyzed before, return it and skip the OpenAI call
  // (saves cost and, for GNews-sourced articles, avoids burning quota on repeats).
  const existing = await Analysis.findOne({ url: input.url }).lean<AnalysisDoc | null>();
  if (existing) return toOutput(existing, true);

  const result = await analyzeArticle(input.title, input.description);

  // Upsert by url so two concurrent analyze calls for the same article can't
  // create duplicate rows — the unique index would reject the second insert anyway.
  const saved = await Analysis.findOneAndUpdate(
    { url: input.url },
    {
      url: input.url,
      title: input.title,
      summary: result.summary,
      sentiment: result.sentiment,
      source: input.source,
      analyzedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean<AnalysisDoc | null>();

  if (!saved) throw new Error("Failed to save analysis");
  return toOutput(saved, false);
}

function toOutput(doc: AnalysisDoc, cached: boolean): AnalyzeOutput {
  return {
    url: doc.url,
    title: doc.title,
    summary: doc.summary,
    sentiment: doc.sentiment,
    source: doc.source,
    analyzedAt: new Date(doc.analyzedAt).toISOString(),
    cached,
  };
}
