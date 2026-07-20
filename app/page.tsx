"use client";

import { useState } from "react";
import { AnalysisCard } from "@/components/AnalysisCard";
import { QuotaBadge } from "@/components/QuotaBadge";
import { SourcePicker } from "@/components/SourcePicker";
import type { Article, AnalysisResult } from "@/lib/types";

// Per-article analyze state, so each result row can show its own loading/result/error.
type AnalyzeState = {
  status: "idle" | "loading" | "done" | "error";
  result?: AnalysisResult;
  error?: string;
};

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<Article[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, AnalyzeState>>({});
  // Bumped after each search so the quota badge re-fetches its remaining count.
  const [quotaKey, setQuotaKey] = useState(0);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const params = new URLSearchParams({ q: query.trim() });
      if (source) params.set("source", source);
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.articles);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
      setSearched(true);
      setQuotaKey((k) => k + 1);
    }
  }

  async function handleAnalyze(article: Article) {
    setAnalyses((prev) => ({ ...prev, [article.url]: { status: "loading" } }));
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: article.url,
          title: article.title,
          description: article.description,
          source: article.source,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setAnalyses((prev) => ({ ...prev, [article.url]: { status: "done", result: data } }));
    } catch (err) {
      setAnalyses((prev) => ({
        ...prev,
        [article.url]: { status: "error", error: err instanceof Error ? err.message : "Analysis failed" },
      }));
    }
  }

  return (
    <main className="container">
      <h1>Search news</h1>

      <form className="searchbar" onSubmit={handleSearch}>
        <SourcePicker value={source} onChange={setSource} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recent news…"
          aria-label="Search query"
        />
        <button className="btn" type="submit" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      <QuotaBadge refreshKey={quotaKey} />

      {searchError && <p className="error">{searchError}</p>}
      {searched && !searching && !searchError && results.length === 0 && (
        <p className="muted">No articles found.</p>
      )}

      <ul className="results">
        {results.map((article) => {
          const state = analyses[article.url] ?? { status: "idle" as const };
          return (
            <li key={article.url} className="result">
              <div className="result-head">
                <a className="result-title" href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
                <span className="meta">
                  {article.source} · {new Date(article.publishedAt).toLocaleDateString()}
                </span>
              </div>

              {article.description && <p className="muted">{article.description}</p>}

              <button
                className="btn btn-sm"
                onClick={() => handleAnalyze(article)}
                disabled={state.status === "loading"}
              >
                {state.status === "loading"
                  ? "Analyzing…"
                  : state.status === "done"
                    ? "Re-analyze"
                    : "Analyze"}
              </button>

              {state.status === "error" && <p className="error">{state.error}</p>}
              {state.status === "done" && state.result && <AnalysisCard result={state.result} />}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
