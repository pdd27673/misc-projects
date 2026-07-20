# Requirements mapping

Each case-study requirement and the file(s) that satisfy it.

## Base version (the brief)

| Requirement | Where |
| --- | --- |
| Search recent news via a public API | `core/sources/gnews.ts`, `services/search.service.ts`, `app/api/search/route.ts` |
| Select an article and trigger a summary | `app/page.tsx` (Analyze button) → `app/api/analyze/route.ts` → `core/ai/openai.ts` |
| Sentiment score (positive / neutral / negative) | `core/ai/openai.ts` (same combined call; validated against the sentiment enum) |
| Store results in a DB | `core/db/analysis.model.ts`, `services/analyze.service.ts` (auto-saves on analyze) |
| Display all past results + analysis | `app/history/page.tsx` → `app/api/analyses/route.ts` → `services/analyses.service.ts` |
| Clean REST API (search / analyze / analyses) | `app/api/search`, `app/api/analyze`, `app/api/analyses` |
| Loading + error states in the UI | `app/page.tsx`, `app/history/page.tsx` (per-action status) |

## Focus areas being graded

| Area | Where |
| --- | --- |
| Product design / UX | `app/page.tsx`, `app/history/page.tsx`, `components/*`, `app/globals.css` |
| REST API design | `app/api/*/route.ts` (thin handlers, deliberate status codes) |
| AI features | `core/ai/openai.ts` (one combined structured-JSON call, output validated) |

## Architecture requirement — config-driven sources

| Requirement | Where |
| --- | --- |
| `NewsSourceAdapter` interface (id, displayName, search) | `core/sources/types.ts` |
| Central registry | `core/sources/registry.ts` |
| Adding a source touches only two files | `ADDING_A_SOURCE.md` (proof: adapter + one registry line) |
| Ship GNews as default | `core/sources/gnews.ts` |
| Ship a second working adapter (RSS) | `core/sources/rss.ts` (Hacker News) |

## Data model

| Requirement | Where |
| --- | --- |
| Flat documents `{ url, title, summary, sentiment, source, analyzedAt }` | `core/db/analysis.model.ts` |
| Shaped/indexed for how it's queried | `core/db/analysis.model.ts` (unique `url`; `sentiment`, `analyzedAt`, compound indexes) |

## Expanded version (bells and whistles)

| Requirement | Where |
| --- | --- |
| Second source toggleable via `ENABLED_SOURCES` | `core/sources/registry.ts`, `.env.example` |
| Source-picker in the UI | `components/SourcePicker.tsx`, `app/api/sources/route.ts`, `services/sources.service.ts` |
| Cache so re-analyzing is free | `services/analyze.service.ts` (lookup by unique `url` on `analyses`) |
| Retry-with-backoff around external calls | `core/util/retry.ts` (used in `gnews.ts`, `rss.ts`, `openai.ts`) |
| Narrow error types (no swallow-alls) | `core/util/errors.ts` (`ConfigError`, `UpstreamError`, `httpStatusFor`) |
| "Quota remaining today" indicator | `core/db/quota.model.ts`, `services/quota.service.ts`, `app/api/quota/route.ts`, `components/QuotaBadge.tsx` |
| Filter/sort History by sentiment + date | `services/analyses.service.ts`, `app/api/analyses/route.ts`, `app/history/page.tsx` |
| Unit tests (per adapter + analyze service) | `__tests__/gnews.test.ts`, `__tests__/rss.test.ts`, `__tests__/analyze.service.test.ts` |
| GitHub Actions running the tests | `.github/workflows/test.yml` |

## Code-quality rules

| Rule | How it's met |
| --- | --- |
| Thin API routes | Every `app/api/*/route.ts` validates + calls one service fn + shapes the response |
| Logic in `core` / `services`, not routes | `services/*` orchestrate; `core/*` are the building blocks |
| No abstraction beyond the adapter pattern | Plain object adapters + a plain array registry; no plugin system / reflection / dynamic imports |
| One-line WHY comments on non-obvious decisions | e.g. cached connection in `connect.ts`, upsert-by-url in `analyze.service.ts`, best-effort quota in `gnews.ts` |
| Small, single-responsibility files | See the file tree in `README.md` |
