import { Analysis, type AnalysisDoc } from "@/core/db/analysis.model";
import { connectToDb } from "@/core/db/connect";

// Lists stored analyses, newest first. Filtering/sorting options are added in Layer 5.
export async function listAnalyses(): Promise<AnalysisDoc[]> {
  await connectToDb();
  return Analysis.find().sort({ analyzedAt: -1 }).lean<AnalysisDoc[]>();
}
