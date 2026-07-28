/**
 * PeopleSoft term codes -- the TypeScript half of `csunclasses/terms.py`.
 *
 * A term is four digits, `C YY T`: century marker (2 for the 2000s), the
 * two-digit year, and a season digit. Spring 2015 is `2153`, Fall 2026 is
 * `2267`.
 */

export type Season = 'winter' | 'spring' | 'summer' | 'fall';

export const SEASON_DIGITS: Record<Season, number> = {
  winter: 1,
  spring: 3,
  summer: 5,
  fall: 7,
};

/** Approximate first day of instruction, used only to pick the next term. */
const SEASON_START: Record<Season, [number, number]> = {
  winter: [1, 2],
  spring: [1, 20],
  summer: [5, 26],
  fall: [8, 20],
};

const MAJOR_SEASONS: Season[] = ['spring', 'fall'];

export interface Term {
  year: number;
  season: Season;
}

export function termCode(term: Term): string {
  const century = Math.floor(term.year / 100) - 18;
  const yy = String(term.year % 100).padStart(2, '0');
  return `${century}${yy}${SEASON_DIGITS[term.season]}`;
}

export function termName(term: Term): string {
  return `${term.season[0]!.toUpperCase()}${term.season.slice(1)} ${term.year}`;
}

export function termFromCode(code: string): Term | null {
  if (!/^[12]\d{3}$/.test(code)) return null;
  const digit = Number(code[3]);
  const season = (Object.keys(SEASON_DIGITS) as Season[]).find((s) => SEASON_DIGITS[s] === digit);
  if (!season) return null;
  const year = 1800 + Number(code[0]) * 100 + Number(code.slice(1, 3));
  return { year, season };
}

/** Accepts `2267`, `Fall 2026`, `fall-2026`. */
export function parseTerm(value: string): Term | null {
  const text = value.trim();
  if (/^[12]\d{3}$/.test(text)) return termFromCode(text);

  const match = /^(winter|spring|summer|fall)[-_ ]?(\d{4})$|^(\d{4})[-_ ]?(winter|spring|summer|fall)$/.exec(
    text.toLowerCase(),
  );
  if (!match) return null;
  const season = (match[1] ?? match[4]) as Season;
  const year = Number(match[2] ?? match[3]);
  return { year, season };
}

function startsOn(term: Term): Date {
  const [month, day] = SEASON_START[term.season];
  return new Date(Date.UTC(term.year, month - 1, day));
}

function chronological(a: Term, b: Term): number {
  return a.year - b.year || SEASON_DIGITS[a.season] - SEASON_DIGITS[b.season];
}

/**
 * The next term a student would register for.
 *
 * A term stays "next" until instruction begins; after that the following one
 * wins. As of 28 July 2026 this is Fall 2026.
 */
export function nextTerm(today: Date = new Date(), includeMinor = false): Term {
  return upcomingTerms(1, today, includeMinor)[0]!;
}

export function upcomingTerms(count = 4, today: Date = new Date(), includeMinor = false): Term[] {
  const seasons = includeMinor ? (Object.keys(SEASON_DIGITS) as Season[]) : MAJOR_SEASONS;
  const base = today.getUTCFullYear();
  const terms: Term[] = [];

  for (let year = base; year <= base + count + 2; year += 1) {
    for (const season of seasons) terms.push({ year, season });
  }

  return terms
    .sort(chronological)
    .filter((term) => startsOn(term).getTime() > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    .slice(0, count);
}
