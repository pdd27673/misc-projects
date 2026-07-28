import { describe, expect, it } from 'vitest';

import { nextTerm, parseTerm, termCode, termFromCode, termName, upcomingTerms } from '../../src/lib/terms';

const utc = (year: number, month: number, day: number): Date => new Date(Date.UTC(year, month - 1, day));

describe('term codes', () => {
  it('matches the one code confirmed from CSUN URLs', () => {
    expect(termCode({ year: 2015, season: 'spring' })).toBe('2153');
    expect(termFromCode('2153')).toEqual({ year: 2015, season: 'spring' });
  });

  it.each([
    [2026, 'fall', '2267'],
    [2026, 'spring', '2263'],
    [2026, 'summer', '2265'],
    [2027, 'winter', '2271'],
    [1999, 'spring', '1993'],
  ] as const)('round-trips %i %s <-> %s', (year, season, code) => {
    expect(termCode({ year, season })).toBe(code);
    expect(termFromCode(code)).toEqual({ year, season });
  });

  it.each(['Fall 2026', 'fall-2026', 'FALL_2026', '2026 fall', '2267'])('parses %s', (text) => {
    expect(parseTerm(text)).toEqual({ year: 2026, season: 'fall' });
  });

  it.each(['', 'Fall', '20267', '2264', 'autumn 2026'])('rejects %s', (text) => {
    expect(parseTerm(text)).toBeNull();
  });

  it('formats a display name', () => {
    expect(termName({ year: 2026, season: 'fall' })).toBe('Fall 2026');
  });
});

describe('nextTerm', () => {
  it('is Fall 2026 on the day this project started', () => {
    const term = nextTerm(utc(2026, 7, 28));
    expect(term).toEqual({ year: 2026, season: 'fall' });
    expect(termCode(term)).toBe('2267');
  });

  it.each([
    [utc(2026, 1, 5), 'Spring 2026'],
    [utc(2026, 3, 1), 'Fall 2026'],
    [utc(2026, 7, 28), 'Fall 2026'],
    [utc(2026, 8, 19), 'Fall 2026'],
    [utc(2026, 8, 21), 'Spring 2027'],
    [utc(2026, 12, 15), 'Spring 2027'],
  ])('handles the boundary at %s', (today, expected) => {
    expect(termName(nextTerm(today))).toBe(expected);
  });

  it('can include summer and winter', () => {
    expect(termName(nextTerm(utc(2026, 3, 1), true))).toBe('Summer 2026');
  });
});

describe('upcomingTerms', () => {
  it('returns future terms in chronological order', () => {
    expect(upcomingTerms(4, utc(2026, 7, 28)).map(termName)).toEqual([
      'Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028',
    ]);
  });
});
