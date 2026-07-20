import type { Article, NewsSourceAdapter } from "./types";

const GNEWS_ENDPOINT = "https://gnews.io/api/v4/search";

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
    if (!apiKey) throw new Error("GNEWS_API_KEY is not set");

    const url = new URL(GNEWS_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("max", String(limit));
    url.searchParams.set("lang", "en");
    url.searchParams.set("apikey", apiKey);

    // no-store: news is time-sensitive and we do our own caching at the analyze layer.
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`GNews request failed: ${res.status}`);

    const data = (await res.json()) as GNewsResponse;
    return data.articles.map((a) => ({
      title: a.title,
      url: a.url,
      description: a.description ?? "",
      source: "gnews",
      publishedAt: a.publishedAt,
    }));
  },
};
