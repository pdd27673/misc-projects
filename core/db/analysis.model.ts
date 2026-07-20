import { Schema, model, models } from "mongoose";
import { SENTIMENTS, type Sentiment } from "@/core/ai/openai";

// One stored analysis. Flat and denormalized — matches how it's queried
// (list, filter by sentiment, sort by date); no joins needed.
export interface AnalysisDoc {
  url: string;
  title: string;
  summary: string;
  sentiment: Sentiment;
  source: string;
  analyzedAt: Date;
}

const analysisSchema = new Schema<AnalysisDoc>({
  // url is unique: it's the article's identity AND our cache key (one analysis per article).
  // `unique: true` already creates the index we look the cache up by.
  url: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  summary: { type: String, required: true },
  sentiment: { type: String, enum: SENTIMENTS, required: true },
  source: { type: String, required: true },
  analyzedAt: { type: Date, required: true, default: Date.now },
});

// Indexes for the History view: filter by sentiment, sort by date, and the
// common combined query "filter by sentiment, newest first".
analysisSchema.index({ sentiment: 1 });
analysisSchema.index({ analyzedAt: -1 });
analysisSchema.index({ sentiment: 1, analyzedAt: -1 });

// Reuse the compiled model across Next hot reloads instead of recompiling it.
export const Analysis = models.Analysis ?? model<AnalysisDoc>("Analysis", analysisSchema);
