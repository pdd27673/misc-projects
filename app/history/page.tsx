"use client";

import { useEffect, useState } from "react";
import { SentimentBadge } from "@/components/SentimentBadge";
import type { StoredAnalysis } from "@/lib/types";

export default function HistoryPage() {
  const [items, setItems] = useState<StoredAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/analyses");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load analyses");
        setItems(data.analyses);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analyses");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="container">
      <h1>History</h1>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="muted">No analyses yet. Analyze an article and it will show up here.</p>
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
