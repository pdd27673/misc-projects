import { recordCall } from "@/core/db/quota.model";
import { ConfigError, UpstreamError } from "@/core/util/errors";
import { withRetry } from "@/core/util/retry";
import type { NewsSourceAdapter } from "./types";

const GNEWS_ENDPOINT = "https://gnews.io/api/v4/search";

// GNews free tier allows 100 requests/day. Lives here because the limit is a
// GNews-specific fact; the quota endpoint reads it from this adapter.
export const GNEWS_DAILY_LIMIT = 100;

// Only the fields we actually use from the GNews response.
interface GNewsArticle {
  title: string;
  description: string | null;
  url: string;
  publishedAt: string;
}
interface GNewsResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

// Default news source. Reads its own API key so the adapter is fully self-contained.
export const gnewsAdapter: NewsSourceAdapter = {
  id: "gnews",
  displayName: "GNews",

  async search(query, limit) {
    const apiKey = process.env.GNEWS_API_KEY;
    if (!apiKey) throw new ConfigError("GNEWS_API_KEY is not set");

    const url = new URL(GNEWS_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("max", String(limit));
    url.searchParams.set("lang", "en");
    url.searchParams.set("apikey", apiKey);

    const data = await withRetry(async () => {
      // no-store: news is time-sensitive; caching happens at the analyze layer.
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new UpstreamError("gnews", `GNews request failed: ${res.status}`);
      return (await res.json()) as GNewsResponse;
    });

    // Record one call per successful search (retries are rare and not counted
    // separately). Best-effort: never fail a search because tracking failed.
    recordCall("gnews").catch(() => {});

    return data.articles.map((a) => ({
      title: a.title,
      url: a.url,
      description: a.description ?? "",
      source: "gnews",
      publishedAt: a.publishedAt,
    }));
  },
};
