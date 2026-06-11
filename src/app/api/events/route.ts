export const runtime = 'edge';

import { TheSportsDBProvider, MockProvider } from '@/lib/gametime/data-sources';
import { deduplicateEvents } from '@/lib/gametime/normalizers';

export async function GET() {
  const tsdb = new TheSportsDBProvider();
  const mock = new MockProvider();

  const [tsdbResult, mockResult] = await Promise.allSettled([
    tsdb.fetchEvents(),
    mock.fetchEvents(),
  ]);

  const tsdbEvents = tsdbResult.status === 'fulfilled' ? tsdbResult.value : [];
  const mockEvents = mockResult.status === 'fulfilled' ? mockResult.value : [];

  const events = deduplicateEvents([...tsdbEvents, ...mockEvents]);

  return Response.json(events, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
