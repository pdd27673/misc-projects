import type { AnalysisResult } from "@/lib/types";
import { SentimentBadge } from "./SentimentBadge";

// Shows the result of analyzing an article: sentiment + summary.
// The "cached" note makes the free-re-analyze behavior visible to the user.
export function AnalysisCard({ result }: { result: AnalysisResult }) {
  return (
    <div className="analysis">
      <div className="analysis-head">
        <SentimentBadge sentiment={result.sentiment} />
        {result.cached && <span className="muted small">cached — no OpenAI call</span>}
      </div>
      <p className="summary">{result.summary}</p>
    </div>
  );
}
