import { gnewsAdapter } from "./gnews";
import { rssAdapter } from "./rss";
import type { NewsSourceAdapter } from "./types";

// Every source the app knows about.
// Adding a source = import it above + add ONE line to this array. That's the whole contract.
const allSources: NewsSourceAdapter[] = [gnewsAdapter, rssAdapter];

// ENABLED_SOURCES lets each deploy turn sources on/off without a code change.
// Unset/empty = all sources enabled (dev-friendly default).
const enabled = (process.env.ENABLED_SOURCES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const sources: NewsSourceAdapter[] =
  enabled.length === 0 ? allSources : allSources.filter((s) => enabled.includes(s.id));

export function getSource(id: string): NewsSourceAdapter | undefined {
  return sources.find((s) => s.id === id);
}
