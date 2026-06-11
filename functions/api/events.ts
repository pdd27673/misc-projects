// Cloudflare Pages Function — runs on the edge alongside the static export.
// Serves GET /api/events with live fixtures from TheSportsDB plus demo data.
import { TheSportsDBProvider } from '../../src/lib/gametime/data-sources/thesportsdb';
import { MockProvider } from '../../src/lib/gametime/data-sources/mock-provider';
import { deduplicateEvents } from '../../src/lib/gametime/normalizers';

export const onRequestGet = async () => {
  const tsdb = new TheSportsDBProvider();
  const mock = new MockProvider();

  const [tsdbResult, mockResult] = await Promise.allSettled([
    tsdb.fetchEvents({}),
    mock.fetchEvents({}),
  ]);

  const tsdbEvents = tsdbResult.status === 'fulfilled' ? tsdbResult.value : [];
  const mockEvents = mockResult.status === 'fulfilled' ? mockResult.value : [];

  const events = deduplicateEvents([...tsdbEvents, ...mockEvents]);

  return Response.json(events, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
};
