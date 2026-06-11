import type { SportEvent, FetchParams, Broadcaster } from '../types';
import { BaseProvider } from './base';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// ESPN sport/league slug pairs. All are free and keyless.
const LEAGUES: { sport: SportEvent['sport']; path: string }[] = [
  { sport: 'football',    path: 'soccer/eng.1' },   // Premier League
  { sport: 'football',    path: 'soccer/esp.1' },   // La Liga
  { sport: 'football',    path: 'soccer/ger.1' },   // Bundesliga
  { sport: 'football',    path: 'soccer/ita.1' },   // Serie A
  { sport: 'football',    path: 'soccer/fra.1' },   // Ligue 1
  { sport: 'football',    path: 'soccer/usa.1' },   // MLS
  { sport: 'basketball',  path: 'basketball/nba' },
  { sport: 'nfl',         path: 'football/nfl' },
  { sport: 'baseball',    path: 'baseball/mlb' },
  { sport: 'hockey',      path: 'hockey/nhl' },
  { sport: 'f1',          path: 'racing/f1' },
];

interface ESPNStatus {
  type: { name: string; state: string; completed: boolean; detail?: string };
}

interface ESPNCompetitor {
  team: { abbreviation?: string; displayName: string; logo?: string };
  score?: string;
  homeAway?: 'home' | 'away';
  winner?: boolean;
}

interface ESPNBroadcast {
  media?: { shortName?: string; longName?: string };
  market?: { type?: string };
}

interface ESPNEvent {
  id: string;
  name: string;
  shortName?: string;
  date: string;
  competitions: Array<{
    date?: string;
    venue?: { fullName?: string; city?: string; state?: string; address?: { country?: string } };
    competitors: ESPNCompetitor[];
    status: ESPNStatus;
    broadcasts?: ESPNBroadcast[];
    notes?: Array<{ headline?: string }>;
    league?: { name?: string };
  }>;
  season?: { slug?: string };
  league?: { name?: string; slug?: string; logos?: Array<{ href: string }> };
}

interface ESPNResponse {
  events?: ESPNEvent[];
  leagues?: Array<{ name?: string; slug?: string; logos?: Array<{ href: string }> }>;
}

function parseESPNStatus(s: ESPNStatus): SportEvent['status'] {
  const name = s.type.name;
  if (s.type.state === 'in' || name === 'STATUS_IN_PROGRESS') return 'live';
  if (s.type.completed || name === 'STATUS_FINAL' || name === 'STATUS_FULL_TIME') return 'final';
  if (name === 'STATUS_POSTPONED') return 'postponed';
  if (name === 'STATUS_CANCELED' || name === 'STATUS_CANCELLED') return 'cancelled';
  return 'upcoming';
}

function mapBroadcasts(raw: ESPNBroadcast[] = []): Broadcaster[] {
  return raw
    .filter(b => b.media?.shortName)
    .map(b => {
      const name = b.media!.shortName!;
      return {
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        type: 'tv' as const,
        isFree: false,
      };
    });
}

function mapEvent(
  e: ESPNEvent,
  sport: SportEvent['sport'],
  leagueName: string,
  leagueLogo?: string,
): SportEvent {
  const comp = e.competitions[0];
  const status = parseESPNStatus(comp.status);
  const startTimeUtc = e.date;

  const participants = (comp.competitors ?? []).map(c => ({
    name: c.team.displayName,
    shortName: c.team.abbreviation,
    isHome: c.homeAway === 'home',
    score: c.score ? Number(c.score) : undefined,
    logo: c.team.logo,
  }));

  const venue = comp.venue
    ? [comp.venue.fullName, comp.venue.city, comp.venue.address?.country]
        .filter(Boolean)
        .join(', ')
    : undefined;

  const broadcasters = mapBroadcasts(comp.broadcasts);

  return {
    id: `espn-${e.id}`,
    source: 'espn',
    sourcePriority: 1,
    sport,
    league: leagueName,
    competition: leagueName,
    eventTitle: e.name,
    participants,
    startTimeUtc,
    status,
    isLive: status === 'live',
    venue,
    broadcasters,
    streamingPlatforms: [],
    tvChannels: broadcasters.map(b => b.name),
    regionAvailability: [],
    artwork: { leagueLogo },
    lastUpdated: new Date().toISOString(),
    confidence: 'high',
    tags: [sport],
  };
}

export class ESPNProvider extends BaseProvider {
  id = 'espn';
  name = 'ESPN';
  priority = 1;
  type = 'free' as const;
  description = 'ESPN unofficial scoreboard API — free, keyless, real-time scores and schedules.';
  requiresKey = false;

  private async getScoreboard(path: string): Promise<ESPNResponse> {
    const res = await fetch(`${BASE}/${path}/scoreboard`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`ESPN ${path} returned ${res.status}`);
    return res.json() as Promise<ESPNResponse>;
  }

  async fetchEvents(params: FetchParams): Promise<SportEvent[]> {
    const targets = params.sport
      ? LEAGUES.filter(l => l.sport === params.sport)
      : LEAGUES;

    const results = await Promise.allSettled(
      targets.map(async ({ sport, path }) => {
        const data = await this.getScoreboard(path);
        const leagueName = data.leagues?.[0]?.name ?? path.split('/').pop() ?? 'Unknown';
        const leagueLogo = data.leagues?.[0]?.logos?.[0]?.href;
        return (data.events ?? []).map(e => mapEvent(e, sport, leagueName, leagueLogo));
      })
    );

    return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const data = await this.getScoreboard('basketball/nba');
      return { ok: Array.isArray(data.events), latencyMs: Date.now() - start };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}
