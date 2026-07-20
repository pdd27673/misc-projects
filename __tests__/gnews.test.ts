import { beforeEach, describe, expect, it, vi } from "vitest";

// The GNews adapter records quota via the DB; stub it so tests need no database.
vi.mock("@/core/db/quota.model", () => ({ recordCall: vi.fn().mockResolvedValue(undefined) }));

import { gnewsAdapter } from "@/core/sources/gnews";

describe("gnewsAdapter.search", () => {
  beforeEach(() => {
    process.env.GNEWS_API_KEY = "test-key";
    // Only clean up the fetch stub — restoreAllMocks would also wipe the
    // recordCall mock's resolved value set in the vi.mock factory above.
    vi.unstubAllGlobals();
  });

  it("maps GNews API results into the Article contract", async () => {
    const apiResponse = {
      totalArticles: 1,
      articles: [
        {
          title: "Markets rally",
          description: "Stocks rose today.",
          url: "https://example.com/a",
          publishedAt: "2026-01-01T00:00:00Z",
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => apiResponse });
    vi.stubGlobal("fetch", fetchMock);

    const out = await gnewsAdapter.search("markets", 5);

    expect(out).toEqual([
      {
        title: "Markets rally",
        url: "https://example.com/a",
        description: "Stocks rose today.",
        source: "gnews",
        publishedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    // query and limit are forwarded to the GNews endpoint.
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("q=markets");
    expect(calledUrl).toContain("max=5");
  });

  it("throws when the API responds with a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    // retries are fast here (default backoff) but still resolve to a thrown error.
    await expect(gnewsAdapter.search("x", 5)).rejects.toThrow(/GNews request failed/);
  });
});
