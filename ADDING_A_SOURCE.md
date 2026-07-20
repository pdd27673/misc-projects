# Adding a news source

Every news source plugs in through one interface, so adding one touches **exactly two
files**: a new adapter, and one line in the registry. Here's the whole process, using a
made-up "Example News" API as the example.

## 1. Write the adapter

Create `core/sources/example.ts`. It implements `NewsSourceAdapter` from
`core/sources/types.ts` and maps the source's response into the shared `Article` shape:

```ts
import type { NewsSourceAdapter } from "./types";

export const exampleAdapter: NewsSourceAdapter = {
  id: "example",              // machine id — used in ENABLED_SOURCES and the registry
  displayName: "Example News", // label shown in the source picker

  async search(query, limit) {
    const res = await fetch(`https://api.example.com/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`Example News request failed: ${res.status}`);
    const data = await res.json();

    // Map the source's items into our Article shape. url is required and must be
    // the article's canonical link — it's used as the cache/dedupe key.
    return data.items.slice(0, limit).map((item) => ({
      title: item.headline,
      url: item.link,
      description: item.summary ?? "",
      source: "example",
      publishedAt: item.date,
    }));
  },
};
```

Notes:
- The adapter is **self-contained**: read any API key it needs from `process.env` right
  here, so nothing outside the file knows about this source's config.
- If the source has no server-side search (e.g. an RSS feed), fetch everything and filter
  locally by `query` — see `core/sources/rss.ts` for the pattern.
- To be a good citizen, wrap the network call in `withRetry` (`core/util/retry.ts`) and
  throw the narrow errors from `core/util/errors.ts`, like the GNews and RSS adapters do.

## 2. Register it (the one line)

In `core/sources/registry.ts`, import the adapter and add it to the `allSources` array:

```ts
import { exampleAdapter } from "./example";

const allSources: NewsSourceAdapter[] = [gnewsAdapter, rssAdapter, exampleAdapter];
//                                                                  ^^^^^^^^^^^^^^ the one line
```

That's it. The source now appears in the picker, is searchable via `GET /api/search`, and
can be toggled with `ENABLED_SOURCES`.

## 3. (Optional) enable/disable per deploy

`ENABLED_SOURCES` is a comma-separated list of ids. Unset means all sources are on.

```
ENABLED_SOURCES=gnews,example      # hide Hacker News in this deploy
```

## 4. (Optional) add a contract test

Copy `__tests__/rss.test.ts`, stub `fetch` with a sample response, and assert your adapter
returns the `Article` shape. This is the one test worth having per adapter — it pins the
mapping so a future API change is caught.

---

**Why this works:** the app only ever talks to sources through the `NewsSourceAdapter`
interface and reads them from the registry. No route, service, or component references a
specific source by name, so a new source needs no changes anywhere else.
