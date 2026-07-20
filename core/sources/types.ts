// The normalized article shape every news source must return.
// Flat and minimal on purpose: only what the results list needs to show and
// what the analyze step saves. Each source adapter maps its own API/feed
// response into this shape so the rest of the app never sees source-specific data.
export interface Article {
  title: string;
  url: string; // canonical identity of the article — also our cache / dedupe key
  description: string; // short snippet shown in results and fed to the summarizer
  source: string; // id of the adapter that produced it, e.g. "gnews"
  publishedAt: string; // ISO date string
}

// The contract a news source must implement to plug into the app.
// Adding a source = implement this interface + add one line to the registry.
export interface NewsSourceAdapter {
  id: string; // stable machine id — used in ENABLED_SOURCES and the registry
  displayName: string; // human-readable label for the source picker in the UI
  search(query: string, limit: number): Promise<Article[]>;
}
