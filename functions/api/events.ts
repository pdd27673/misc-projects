// Cloudflare Pages Function — edge handler for GET /api/events.
// Fetches all supported sports from TheSportsDB in parallel, deduplicates,
// and falls back to mock data if TheSportsDB returns nothing at all.
import { TheSportsDBProvider, MockProvider } from '../../src/lib/gametime/data-sources';
import { deduplicateEvents } from '../../src/lib/gametime/normalizers';
import type { SportEvent } from '../../src/lib/gametime/types';

const ALL_SPORTS = ['football', 'basketball', 'nfl', 'tennis', 'cricket', 'rugby', 'f1'] as const;

export const onRequestGet = async () => {
  const tsdb = new TheSportsDBProvider();

  // Fetch every sport in parallel so active seasons aren't missed.
  // TheSportsDB is free and keyless; stale-while-revalidate keeps this cheap.
  const sportResults = await Promise.allSettled(
    ALL_SPORTS.map(sport => tsdb.fetchEvents({ sport }))
  );

  const liveEvents: SportEvent[] = sportResults.flatMap(r =>
    r.status === 'fulfilled' ? r.value : []
  );

  // Always supplement with mock events (they have richer broadcaster data
  // and cover sports/leagues TheSportsDB doesn't return for this week).
  const mock = new MockProvider();
  const mockEvents = await mock.fetchEvents({}).catch(() => [] as SportEvent[]);

  const events = deduplicateEvents([...liveEvents, ...mockEvents]);

  return Response.json(events, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
};
