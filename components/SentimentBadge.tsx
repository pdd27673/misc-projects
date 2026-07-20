import type { Sentiment } from "@/lib/types";

const LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

// Colored pill for a sentiment. Color comes from the badge-<sentiment> CSS class.
export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  return <span className={`badge badge-${sentiment}`}>{LABEL[sentiment]}</span>;
}
