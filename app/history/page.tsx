"use client";

import { useEffect, useState } from "react";
import { SentimentBadge } from "@/components/SentimentBadge";
import type { Sentiment, StoredAnalysis } from "@/lib/types";

type SentimentFilter = "all" | Sentiment;
type SortOrder = "newest" | "oldest";

export default function HistoryPage() {
  const [items, setItems] = useState<StoredAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<SentimentFilter>("all");
  const [sort, setSort] = useState<SortOrder>("newest");

  // Refetch whenever the filter or sort changes — the server does the work,
  // so the query params map straight to the /api/analyses contract.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ sort });
    if (sentiment !== "all") params.set("sentiment", sentiment);

    fetch(`/api/analyses?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load analyses");
        if (active) setItems(data.analyses);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load analyses");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sentiment, sort]);

  return (
    <main className="container">
      <h1>History</h1>

      <div className="controls">
        <label>
          <span className="muted small">Sentiment</span>
          <select value={sentiment} onChange={(e) => setSentiment(e.target.value as SentimentFilter)}>
            <option value="all">All</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
        </label>
        <label>
          <span className="muted small">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortOrder)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="muted">No analyses match. Analyze an article to add one.</p>
      )}

      <ul className="results">
        {items.map((item) => (
          <li key={item.url} className="result">
            <div className="result-head">
              <a className="result-title" href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
              <SentimentBadge sentiment={item.sentiment} />
            </div>
            <p className="summary">{item.summary}</p>
            <span className="meta">
              {item.source} · {new Date(item.analyzedAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
