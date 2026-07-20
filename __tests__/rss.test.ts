import { beforeEach, describe, expect, it, vi } from "vitest";
import { rssAdapter } from "@/core/sources/rss";

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>Rust 2.0 released</title>
    <link>https://example.com/rust</link>
    <description>&lt;p&gt;A big update to Rust.&lt;/p&gt;</description>
    <pubDate>Thu, 01 Jan 2026 00:00:00 +0000</pubDate>
  </item>
  <item>
    <title>Cooking tips</title>
    <link>https://example.com/cooking</link>
    <description>Recipes and more.</description>
    <pubDate>Thu, 01 Jan 2026 00:00:00 +0000</pubDate>
  </item>
</channel></rss>`;

describe("rssAdapter.search", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("filters feed items by query and maps them to the Article contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_FEED }));

    const out = await rssAdapter.search("rust", 10);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: "Rust 2.0 released",
      url: "https://example.com/rust",
      description: "A big update to Rust.", // HTML tags stripped
      source: "hackernews",
    });
  });

  it("respects the limit (empty query matches everything)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE_FEED }));

    const out = await rssAdapter.search("", 1);

    expect(out).toHaveLength(1);
  });
});
