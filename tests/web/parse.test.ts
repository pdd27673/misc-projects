/**
 * The TypeScript parser runs against the same fixtures as the Python one,
 * so the two implementations are held to identical results.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { describeTables, parseSections } from '../../src/lib/parse';
import type { Section } from '../../src/lib/types';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');

const tablePage = fixture('class_search_table.html');
const cardPage = fixture('class_search_cards.html');

const byClassNumber = (sections: Section[], number: string): Section => {
  const found = sections.find((section) => section.classNumber === number);
  if (!found) throw new Error(`no section with class number ${number}`);
  return found;
};

describe('results table', () => {
  it('finds every section and ignores layout tables', () => {
    const sections = parseSections(tablePage);
    expect(sections).toHaveLength(5);
    expect(new Set(sections.map((s) => s.course))).toEqual(new Set(['COMP 586', 'COMP 620']));
  });

  it('reads the full field set of an open section', () => {
    const section = byClassNumber(parseSections(tablePage), '12345');
    expect(section).toMatchObject({
      course: 'COMP 586',
      title: 'Advanced Topics in Software Engineering',
      section: '01',
      status: 'open',
      seatsAvailable: 8,
      seatsCapacity: 30,
      waitlistAvailable: 10,
      units: 3,
      instructionMode: 'In Person',
      session: 'Regular',
    });
    expect(section.instructors).toEqual(['Rivera, A.']);
  });

  it('reads status from image alt text', () => {
    const sections = parseSections(tablePage);
    expect(byClassNumber(sections, '12346').status).toBe('closed');
    expect(byClassNumber(sections, '12347').status).toBe('waitlist');
  });

  it('parses days, times and room into one meeting', () => {
    const section = byClassNumber(parseSections(tablePage), '12345');
    expect(section.meetings).toHaveLength(1);
    expect(section.meetings[0]).toMatchObject({
      days: ['Tu', 'Th'],
      start: 19 * 60,
      end: 20 * 60 + 15,
      location: 'JD 1600',
      text: 'TuTh 7:00PM-8:15PM @ JD 1600',
    });
  });

  it('leaves async sections without a fixed time', () => {
    const section = byClassNumber(parseSections(tablePage), '12347');
    expect(section.instructionMode).toBe('Online (Asynchronous)');
    expect(section.meetings.every((m) => m.days.length === 0 || m.start === null)).toBe(true);
  });

  it('combines separate Days and Time columns', () => {
    const section = byClassNumber(parseSections(tablePage), '13001');
    expect(section.meetings[0]).toMatchObject({ days: ['Tu', 'Th'], start: 19 * 60, end: 20 * 60 + 15 });
  });

  it('accepts alternate heading spellings', () => {
    const section = byClassNumber(parseSections(tablePage), '13002');
    expect(section.classNumber).toBe('13002');
    expect(section.seatsAvailable).toBe(5);
  });

  it('sorts by course then section', () => {
    expect(parseSections(tablePage).map((s) => s.classNumber)).toEqual([
      '12345', '12346', '12347', '13001', '13002',
    ]);
  });
});

describe('card layout', () => {
  it('falls back to label/value parsing', () => {
    const sections = parseSections(cardPage);
    expect(sections).toHaveLength(2);
    const first = byClassNumber(sections, '20100');
    expect(first).toMatchObject({ course: 'MATH 150A', status: 'open', seatsAvailable: 3, units: 5 });
    expect(first.meetings[0]).toMatchObject({ days: ['Mo', 'We', 'Fr'], start: 9 * 60 });
  });

  it('infers the afternoon from a trailing meridiem', () => {
    const second = byClassNumber(parseSections(cardPage), '20101');
    expect(second.status).toBe('closed');
    expect(second.meetings[0]).toMatchObject({ start: 13 * 60, end: 14 * 60 + 15 });
  });
});

describe('describeTables', () => {
  it('reports how headings mapped and which tables were used', () => {
    const report = describeTables(tablePage);
    const used = report.filter((entry) => entry.used);
    expect(used).toHaveLength(2);
    expect(used[0]!.recognised['Regular Seats Available']).toBe('seats_available');
    expect(used.every((entry) => entry.unrecognised.length === 0)).toBe(true);
    expect(report.some((entry) => !entry.used)).toBe(true);
  });
});

describe('edge cases', () => {
  it('returns nothing for a page with no sections', () => {
    expect(parseSections('<html><body><p>No classes found.</p></body></html>')).toEqual([]);
  });

  it('does not throw on malformed markup', () => {
    expect(() => parseSections('<table><tr><td>unclosed')).not.toThrow();
  });
});
