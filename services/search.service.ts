import { getSource, sources } from "@/core/sources/registry";
import type { Article } from "@/core/sources/types";

const DEFAULT_LIMIT = 10;

// Orchestrates a search: pick the requested source (or the first enabled one by
// default) from the registry and delegate to its adapter. All source-specific
// logic lives in the adapter — this stays tiny on purpose.
export async function searchArticles(query: string, sourceId?: string): Promise<Article[]> {
  const source = sourceId ? getSource(sourceId) : sources[0];
  if (!source) {
    throw new Error(`Unknown or disabled source: ${sourceId ?? "(none enabled)"}`);
  }
  return source.search(query, DEFAULT_LIMIT);
}
