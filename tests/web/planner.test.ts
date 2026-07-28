import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseSections } from '../../src/lib/parse';
import { makeMeeting } from '../../src/lib/normalize';
import {
  DEFAULT_PREFERENCES,
  conflicts,
  groupByCourse,
  meetingsOverlap,
  plan,
  type Preferences,
} from '../../src/lib/planner';
import type { Section, Weekday } from '../../src/lib/types';

const sections = parseSections(
  readFileSync(fileURLToPath(new URL('../fixtures/class_search_table.html', import.meta.url)), 'utf8'),
);

const at = (hour: number, minute = 0): number => hour * 60 + minute;

const prefs = (overrides: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...overrides });

function make(course: string, days: Weekday[], start: number, end: number): Section {
  const [subject, catalogNumber] = course.split(' ') as [string, string];
  return {
    course, subject, catalogNumber,
    classNumber: null, section: null, title: null,
    status: 'open', seatsAvailable: 5, seatsCapacity: 30, waitlistAvailable: null,
    units: 3, instructionMode: null, instructors: [], session: null,
    meetings: [makeMeeting(days, start, end, null)],
  };
}

const chosenClassNumbers = (result: ReturnType<typeof plan>): Set<string | null> =>
  new Set(result.schedules.flatMap((schedule) => schedule.sections.map((s) => s.classNumber)));

describe('conflict detection', () => {
  it('only collides on shared days', () => {
    const monday = makeMeeting(['Mo'], at(9), at(10), null);
    const tuesday = makeMeeting(['Tu'], at(9), at(10), null);
    const later = makeMeeting(['Mo'], at(9, 30), at(10, 30), null);
    expect(meetingsOverlap(monday, tuesday)).toBe(false);
    expect(meetingsOverlap(monday, later)).toBe(true);
  });

  it('treats back-to-back classes as fine', () => {
    expect(meetingsOverlap(makeMeeting(['Mo'], at(9), at(10), null), makeMeeting(['Mo'], at(10), at(11), null)))
      .toBe(false);
  });

  it('never conflicts with an async section', () => {
    expect(meetingsOverlap(makeMeeting([], null, null, 'Online'), makeMeeting(['Mo'], at(9), at(10), null)))
      .toBe(false);
  });

  it('lists colliding pairs', () => {
    const a = make('COMP 586', ['Mo', 'We'], at(9), at(10, 15));
    const b = make('COMP 620', ['Mo', 'We'], at(10), at(11, 15));
    const c = make('MATH 150A', ['Tu', 'Th'], at(9), at(10, 15));
    expect(conflicts([a, b, c])).toEqual([[a, b]]);
    expect(conflicts([a, c])).toEqual([]);
  });
});

describe('plan', () => {
  it('groups the fixture by course', () => {
    const grouped = groupByCourse(sections);
    expect([...grouped.keys()].sort()).toEqual(['COMP 586', 'COMP 620']);
    expect(grouped.get('COMP 586')).toHaveLength(3);
  });

  it('avoids the shared TuTh 7:00 slot', () => {
    const result = plan(sections, ['COMP 586', 'COMP 620']);
    expect(result.schedules.length).toBeGreaterThan(0);
    for (const schedule of result.schedules) expect(conflicts(schedule.sections)).toEqual([]);
    const pairs = result.schedules.map((s) => s.sections.map((x) => x.classNumber).join('+'));
    expect(pairs).not.toContain('12345+13001');
  });

  it('accepts loose course spellings', () => {
    expect(plan(sections, ['comp586', 'COMP-620']).schedules.length).toBeGreaterThan(0);
  });

  it('reports courses it cannot place', () => {
    const result = plan(sections, ['COMP 586', 'ART 101']);
    expect(result.schedules).toEqual([]);
    expect(result.unplaceable['ART 101']).toBe('no sections found');
  });

  it('excludes full sections by default and includes them on request', () => {
    expect(chosenClassNumbers(plan(sections, ['COMP 586']))).not.toContain('12346');
    expect(chosenClassNumbers(plan(sections, ['COMP 586'], prefs({ openOnly: false })))).toContain('12346');
  });

  it('can exclude the waitlist', () => {
    expect(chosenClassNumbers(plan(sections, ['COMP 586'], prefs({ allowWaitlist: false })))).not.toContain('12347');
  });

  it('applies a time window', () => {
    expect(chosenClassNumbers(plan(sections, ['COMP 586'], prefs({ latest: at(18) })))).toEqual(new Set(['12347']));
  });

  it('respects days off', () => {
    expect(chosenClassNumbers(plan(sections, ['COMP 620'], prefs({ daysOff: ['Tu', 'Th'] }))))
      .toEqual(new Set(['13002']));
  });

  it('explains impossible constraints', () => {
    const result = plan(sections, ['COMP 620'], prefs({ daysOff: ['Mo', 'Tu', 'We', 'Th'] }));
    expect(result.schedules).toEqual([]);
    expect(result.unplaceable['COMP 620']).toContain('ruled out by filters');
  });

  it('caps total units', () => {
    expect(plan(sections, ['COMP 586', 'COMP 620'], prefs({ maxUnits: 3 })).schedules).toEqual([]);
  });

  it('prefers fewer days on campus', () => {
    const compact = make('COMP 586', ['Mo'], at(9), at(10, 15));
    const spread = make('COMP 586', ['Mo', 'We', 'Fr'], at(9), at(9, 50));
    const result = plan([compact, spread], ['COMP 586']);
    expect(result.schedules[0]!.sections[0]!.meetings[0]!.days).toEqual(['Mo']);
  });

  it('summarises a schedule', () => {
    const schedule = plan(sections, ['COMP 620']).schedules[0]!;
    expect(schedule.units).toBe(3);
    expect(schedule.earliestStart).not.toBeNull();
    expect(schedule.daysUsed.length).toBeGreaterThan(0);
  });

  it('honours the schedule limit', () => {
    expect(plan(sections, ['COMP 586', 'COMP 620'], DEFAULT_PREFERENCES, 1).schedules).toHaveLength(1);
  });
});
