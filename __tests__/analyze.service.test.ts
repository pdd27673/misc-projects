import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock every external dependency so the test exercises only the service's logic.
vi.mock("@/core/db/connect", () => ({ connectToDb: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/core/ai/openai", () => ({ analyzeArticle: vi.fn() }));
vi.mock("@/core/db/analysis.model", () => ({
  Analysis: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));

import { analyze } from "@/services/analyze.service";
import { analyzeArticle } from "@/core/ai/openai";
import { Analysis } from "@/core/db/analysis.model";

const input = { url: "https://example.com/a", title: "Title", description: "Desc", source: "gnews" };

// Mongoose calls end in .lean(); return an object with a lean() that resolves to `value`.
const leanReturning = (value: unknown) => ({ lean: () => Promise.resolve(value) });

describe("analyze service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls OpenAI and saves when the article has not been analyzed before", async () => {
    vi.mocked(Analysis.findOne).mockReturnValue(leanReturning(null) as never);
    vi.mocked(analyzeArticle).mockResolvedValue({ summary: "A summary", sentiment: "positive" });
    vi.mocked(Analysis.findOneAndUpdate).mockReturnValue(
      leanReturning({
        ...input,
        summary: "A summary",
        sentiment: "positive",
        analyzedAt: new Date("2026-01-01T00:00:00Z"),
      }) as never,
    );

    const out = await analyze(input);

    expect(analyzeArticle).toHaveBeenCalledOnce();
    expect(out.summary).toBe("A summary");
    expect(out.sentiment).toBe("positive");
    expect(out.cached).toBe(false);
  });

  it("returns the cached analysis and does NOT call OpenAI when the URL exists", async () => {
    vi.mocked(Analysis.findOne).mockReturnValue(
      leanReturning({
        ...input,
        summary: "Cached summary",
        sentiment: "neutral",
        analyzedAt: new Date("2026-01-01T00:00:00Z"),
      }) as never,
    );

    const out = await analyze(input);

    expect(analyzeArticle).not.toHaveBeenCalled();
    expect(out.cached).toBe(true);
    expect(out.sentiment).toBe("neutral");
    expect(out.summary).toBe("Cached summary");
  });
});
