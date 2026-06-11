import { TheSportsDBProvider, MockProvider } from '../../src/lib/gametime/data-sources';
import { deduplicateEvents } from '../../src/lib/gametime/normalizers';
import type { SportEvent } from '../../src/lib/gametime/types';

const ALL_SPORTS = ['football', 'basketball', 'nfl', 'tennis', 'cricket', 'rugby', 'f1'] as const;

export const onRequestGet = async () => {
  const tsdb = new TheSportsDBProvider();

  const sportResults = await Promise.allSettled(
    ALL_SPORTS.map(sport => tsdb.fetchEvents({ sport }))
  );

  const liveEvents: SportEvent[] = sportResults.flatMap(r =>
    r.status === 'fulfilled' ? r.value : []
  );

  const tsdbErrors = sportResults
    .map((r, i) => r.status === 'rejected' ? `${ALL_SPORTS[i]}:${String(r.reason)}` : null)
    .filter(Boolean)
    .join('; ');

  const mock = new MockProvider();
  const mockEvents = await mock.fetchEvents({}).catch(() => [] as SportEvent[]);

  const events = deduplicateEvents([...liveEvents, ...mockEvents]);

  return Response.json(events, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'X-Live-Count': String(liveEvents.length),
      'X-Mock-Count': String(mockEvents.length),
      'X-TSDB-Errors': tsdbErrors || 'none',
    },
  });
};
