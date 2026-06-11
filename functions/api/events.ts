import { ESPNProvider, MockProvider } from '../../src/lib/gametime/data-sources';
import { deduplicateEvents } from '../../src/lib/gametime/normalizers';
import type { SportEvent } from '../../src/lib/gametime/types';

export const onRequestGet = async () => {
  const espn = new ESPNProvider();

  // ESPN fetches all configured leagues in parallel internally
  const [espnEvents, espnError] = await espn.fetchEvents({})
    .then(events => [events, null] as const)
    .catch(err => [[] as SportEvent[], String(err)] as const);

  const mock = new MockProvider();
  const mockEvents = await mock.fetchEvents({}).catch(() => [] as SportEvent[]);

  // Prefer ESPN events; mock fills gaps for sports ESPN doesn't cover
  const events = deduplicateEvents([...espnEvents, ...mockEvents]);

  return Response.json(events, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'X-ESPN-Count': String(espnEvents.length),
      'X-Mock-Count': String(mockEvents.length),
      'X-ESPN-Error': espnError ?? 'none',
    },
  });
};
