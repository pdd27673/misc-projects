import type { SportEvent, FetchParams } from '../types';
import { BaseProvider } from './base';
import { MOCK_EVENTS, MODULE_LOAD_TIME } from '../mock-data/events';

export class MockProvider extends BaseProvider {
  id = 'mock';
  name = 'Demo Data';
  priority = 99;
  type = 'free' as const;
  description = 'Seeded demo data — works offline, no API key required';
  requiresKey = false;

  async fetchEvents(params: FetchParams): Promise<SportEvent[]> {
    // Shift all event timestamps by the elapsed time since module load so that
    // "live" events stay live and upcoming events stay upcoming regardless of
    // when this function is called (handles warm Cloudflare Worker isolates).
    const drift = Date.now() - MODULE_LOAD_TIME;
    const now = Date.now();

    let results = MOCK_EVENTS.map(e => {
      const newStart = new Date(new Date(e.startTimeUtc).getTime() + drift).toISOString();
      const newEnd = e.endTimeUtc
        ? new Date(new Date(e.endTimeUtc).getTime() + drift).toISOString()
        : undefined;
      const startMs = new Date(newStart).getTime();
      const endMs = newEnd ? new Date(newEnd).getTime() : startMs + 2 * 60 * 60 * 1000;
      const isLive = startMs <= now && endMs >= now;
      return {
        ...e,
        startTimeUtc: newStart,
        endTimeUtc: newEnd,
        isLive,
        status: (isLive ? 'live' : startMs > now ? 'upcoming' : 'final') as SportEvent['status'],
        lastUpdated: new Date().toISOString(),
      };
    });

    if (params.sport) {
      results = results.filter(e => e.sport === params.sport);
    }
    if (params.league) {
      results = results.filter(e => e.league.toLowerCase().includes(params.league!.toLowerCase()));
    }
    if (params.startDate) {
      const start = new Date(params.startDate).getTime();
      results = results.filter(e => new Date(e.startTimeUtc).getTime() >= start);
    }
    if (params.endDate) {
      const end = new Date(params.endDate).getTime();
      results = results.filter(e => new Date(e.startTimeUtc).getTime() <= end);
    }

    return results;
  }

  async healthCheck() {
    return { ok: true, latencyMs: 0 };
  }
}
