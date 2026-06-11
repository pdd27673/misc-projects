import { ESPNProvider, MockProvider } from '../../src/lib/gametime/data-sources';
import { deduplicateEvents } from '../../src/lib/gametime/normalizers';
import type { SportEvent } from '../../src/lib/gametime/types';

// Keep events that started within the last 24h or start within the next 7 days.
// Drops stale off-season finals (e.g. Bundesliga from 3 weeks ago) and distant
// future fixtures (next season openers).
function inWindow(event: SportEvent): boolean {
  const t = new Date(event.startTimeUtc).getTime();
  const now = Date.now();
  const past24h = now - 24 * 60 * 60 * 1000;
  const next7d  = now + 7  * 24 * 60 * 60 * 1000;
  // Always keep live events regardless of timestamp
  if (event.isLive || event.status === 'live') return true;
  return t >= past24h && t <= next7d;
}

export const onRequestGet = async () => {
  const espn = new ESPNProvider();

  const [espnRaw, espnError] = await espn.fetchEvents({})
    .then(events => [events, null] as const)
    .catch(err => [[] as SportEvent[], String(err)] as const);

  const espnEvents = espnRaw.filter(inWindow);

  const mock = new MockProvider();
  const mockEvents = await mock.fetchEvents({}).catch(() => [] as SportEvent[]);

  // Prefer ESPN events; mock fills gaps for sports ESPN doesn't cover
  const events = deduplicateEvents([...espnEvents, ...mockEvents]);

  return Response.json(events, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'X-ESPN-Count': String(espnEvents.length),
      'X-ESPN-Raw': String(espnRaw.length),
      'X-Mock-Count': String(mockEvents.length),
      'X-ESPN-Error': espnError ?? 'none',
    },
  });
};
