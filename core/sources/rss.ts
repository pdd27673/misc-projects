import { XMLParser } from "fast-xml-parser";
import { UpstreamError } from "@/core/util/errors";
import { withRetry } from "@/core/util/retry";
import type { NewsSourceAdapter } from "./types";

// Hacker News front page as an RSS feed. Swap this URL to point the adapter
// at any other RSS feed — the rest of the adapter is feed-agnostic.
const HN_FEED_URL = "https://hnrss.org/frontpage";

const parser = new XMLParser();

// Only the item fields we use from a standard RSS feed.
interface RssItem {
  title: string;
  link: string;
  description?: string;
  pubDate: string;
}
interface RssFeed {
  rss?: { channel?: { item?: RssItem | RssItem[] } };
}

// RSS descriptions are HTML; strip tags so we store/show plain text.
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

// Second source, shipped to prove the config-driven pattern works end to end.
export const rssAdapter: NewsSourceAdapter = {
  id: "hackernews",
  displayName: "Hacker News",

  async search(query, limit) {
    const xml = await withRetry(async () => {
      const res = await fetch(HN_FEED_URL, { cache: "no-store" });
      if (!res.ok) throw new UpstreamError("hackernews", `Hacker News feed request failed: ${res.status}`);
      return res.text();
    });

    const feed = parser.parse(xml) as RssFeed;
    const raw = feed.rss?.channel?.item;
    // fast-xml-parser returns a single object (not an array) when the feed has one item.
    const items: RssItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

    // RSS has no server-side search, so the adapter filters the feed locally by query.
    const q = query.toLowerCase();
    return items
      .filter((it) => `${it.title} ${it.description ?? ""}`.toLowerCase().includes(q))
      .slice(0, limit)
      .map((it) => ({
        title: it.title,
        url: it.link,
        description: stripHtml(it.description ?? ""),
        source: "hackernews",
        publishedAt: new Date(it.pubDate).toISOString(),
      }));
  },
};
