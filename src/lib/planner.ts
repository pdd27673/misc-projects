/**
 * Conflict-free schedule building. Runs in the browser: the sections are
 * already loaded, so there is nothing to ask the server for.
 *
 * Port of `csunclasses/planner.py`.
 */

import { parseCourseId } from './normalize';
import { hasFixedTime, type Meeting, type Section, type Weekday } from './types';

export interface Preferences {
  earliest: number | null;
  latest: number | null;
  daysOff: Weekday[];
  openOnly: boolean;
  allowWaitlist: boolean;
  maxUnits: number | null;
  preferDaysOff: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  earliest: null,
  latest: null,
  daysOff: [],
  openOnly: true,
  allowWaitlist: true,
  maxUnits: null,
  preferDaysOff: true,
};

export interface Schedule {
  sections: Section[];
  units: number;
  daysUsed: Weekday[];
  earliestStart: number | null;
  latestEnd: number | null;
}

export interface PlanResult {
  schedules: Schedule[];
  unplaceable: Record<string, string>;
}

export function meetingsOverlap(a: Meeting, b: Meeting): boolean {
  if (!hasFixedTime(a) || !hasFixedTime(b)) return false;
  if (!a.days.some((day) => b.days.includes(day))) return false;
  return a.start! < b.end! && b.start! < a.end!;
}

export function sectionsConflict(a: Section, b: Section): boolean {
  return a.meetings.some((first) => b.meetings.some((second) => meetingsOverlap(first, second)));
}

export function conflicts(sections: Section[]): Array<[Section, Section]> {
  const found: Array<[Section, Section]> = [];
  for (let i = 0; i < sections.length; i += 1) {
    for (let j = i + 1; j < sections.length; j += 1) {
      if (sectionsConflict(sections[i]!, sections[j]!)) found.push([sections[i]!, sections[j]!]);
    }
  }
  return found;
}

export function allows(section: Section, preferences: Preferences): boolean {
  if (preferences.openOnly) {
    if (section.status === 'cancelled') return false;
    const allowed = new Set(['open', 'unknown', ...(preferences.allowWaitlist ? ['waitlist'] : [])]);
    if (!allowed.has(section.status)) return false;
  }

  for (const meeting of section.meetings) {
    if (meeting.days.some((day) => preferences.daysOff.includes(day))) return false;
    if (preferences.earliest !== null && meeting.start !== null && meeting.start < preferences.earliest) return false;
    if (preferences.latest !== null && meeting.end !== null && meeting.end > preferences.latest) return false;
  }
  return true;
}

export function groupByCourse(sections: Section[]): Map<string, Section[]> {
  const grouped = new Map<string, Section[]>();
  for (const section of sections) {
    const list = grouped.get(section.course) ?? [];
    list.push(section);
    grouped.set(section.course, list);
  }
  return grouped;
}

export function normaliseCourse(value: string): string {
  const [subject, catalog] = parseCourseId(value);
  return subject && catalog ? `${subject} ${catalog}` : value.trim().toUpperCase();
}

function summarise(sections: Section[]): Schedule {
  const days = new Set<Weekday>();
  const starts: number[] = [];
  const ends: number[] = [];

  for (const section of sections) {
    for (const meeting of section.meetings) {
      meeting.days.forEach((day) => days.add(day));
      if (meeting.start !== null) starts.push(meeting.start);
      if (meeting.end !== null) ends.push(meeting.end);
    }
  }

  const order: Weekday[] = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  return {
    sections,
    units: sections.reduce((total, section) => total + (section.units ?? 0), 0),
    daysUsed: order.filter((day) => days.has(day)),
    earliestStart: starts.length ? Math.min(...starts) : null,
    latestEnd: ends.length ? Math.max(...ends) : null,
  };
}

/** Fewer days on campus first, then a later start, then a shorter day. */
function rank(schedule: Schedule, preferences: Preferences): [number, number, number] {
  const dayCount = preferences.preferDaysOff ? schedule.daysUsed.length : 0;
  const start = schedule.earliestStart ?? 24 * 60 - 1;
  const end = schedule.latestEnd ?? 0;
  return [dayCount, -start, end - start];
}

export function plan(
  sections: Section[],
  wanted: string[],
  preferences: Preferences = DEFAULT_PREFERENCES,
  maxSchedules = 20,
): PlanResult {
  const pool = groupByCourse(sections);
  const result: PlanResult = { schedules: [], unplaceable: {} };
  const options: Section[][] = [];

  for (const course of wanted) {
    const key = normaliseCourse(course);
    const candidates = pool.get(key) ?? [];
    if (candidates.length === 0) {
      result.unplaceable[key] = 'no sections found';
      continue;
    }
    const allowed = candidates.filter((section) => allows(section, preferences));
    if (allowed.length === 0) {
      result.unplaceable[key] =
        `all ${candidates.length} section(s) ruled out by filters (status, time window or days off)`;
      continue;
    }
    options.push(allowed);
  }

  if (Object.keys(result.unplaceable).length > 0 || options.length === 0) return result;

  const found: Schedule[] = [];
  const cap = maxSchedules * 5;

  const walk = (index: number, chosen: Section[]): void => {
    if (found.length >= cap) return;
    if (index === options.length) {
      const schedule = summarise([...chosen]);
      if (preferences.maxUnits !== null && schedule.units > preferences.maxUnits) return;
      found.push(schedule);
      return;
    }
    for (const candidate of options[index]!) {
      // Prune early: a conflict never resolves by adding more courses.
      if (chosen.some((picked) => sectionsConflict(picked, candidate))) continue;
      chosen.push(candidate);
      walk(index + 1, chosen);
      chosen.pop();
      if (found.length >= cap) return;
    }
  };
  walk(0, []);

  found.sort((a, b) => {
    const [aDays, aStart, aSpan] = rank(a, preferences);
    const [bDays, bStart, bSpan] = rank(b, preferences);
    return aDays - bDays || aStart - bStart || aSpan - bSpan;
  });

  result.schedules = found.slice(0, maxSchedules);
  return result;
}
