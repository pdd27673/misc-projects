/**
 * Free-form schedule text -> typed values. Mirrors
 * `csunclasses/normalize.py`, including its quirks: times are minutes past
 * midnight here so meetings compare with plain arithmetic.
 */

import type { Meeting, Status, Weekday } from './types';
import { WEEKDAYS } from './types';

const DAY_TOKENS_2: Record<string, Weekday> = {
  mo: 'Mo', tu: 'Tu', we: 'We', th: 'Th', fr: 'Fr', sa: 'Sa', su: 'Su',
};
const DAY_TOKENS_1: Record<string, Weekday> = {
  m: 'Mo', t: 'Tu', w: 'We', r: 'Th', f: 'Fr', s: 'Sa', u: 'Su',
};
const DAY_NAMES: Record<string, Weekday> = {
  monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th',
  friday: 'Fr', saturday: 'Sa', sunday: 'Su',
};

const BLANK = new Set([
  '', '-', '--', 'tba', 'tbd', 'n/a', 'na', 'none', 'arr', 'arranged', 'to be announced',
]);

export function isBlank(value: string | null | undefined): boolean {
  if (value == null) return true;
  return BLANK.has(value.trim().toLowerCase().replace(/\.$/, ''));
}

/** Collapse whitespace; null for blank/TBA text. */
export function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const collapsed = value.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return isBlank(collapsed) ? null : collapsed;
}

export function parseStatus(value: string | null | undefined): Status {
  const text = (value ?? '').toLowerCase();
  if (!text.trim()) return 'unknown';
  if (/cancel/.test(text)) return 'cancelled';
  if (/wait\s*-?\s*list|waitlisted|\bwl\b/.test(text)) return 'waitlist';
  if (/\bclosed\b|\bfull\b/.test(text)) return 'closed';
  if (/\bopen\b|\bavailable\b/.test(text)) return 'open';
  return 'unknown';
}

export function parseInt_(value: string | null | undefined): number | null {
  if (isBlank(value)) return null;
  const match = /-?\d+/.exec(value!.replace(/,/g, ''));
  return match ? Number(match[0]) : null;
}

export function parseUnits(value: string | null | undefined): number | null {
  if (isBlank(value)) return null;
  const match = /\d+(?:\.\d+)?/.exec(value!);
  return match ? Number(match[0]) : null;
}

/** `MW`, `TuTh`, `TTh`, `MoWeFr`, `M/W/F` and full weekday names. */
export function parseDays(value: string | null | undefined): Weekday[] {
  if (isBlank(value)) return [];

  let text = value!.trim().toLowerCase();
  const found: Weekday[] = [];

  for (const [name, code] of Object.entries(DAY_NAMES)) {
    if (text.includes(name)) {
      found.push(code);
      text = text.split(name).join(' ');
    }
  }

  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    if (!/[a-z]/.test(char)) {
      index += 1;
      continue;
    }
    const pair = text.slice(index, index + 2);
    const two = DAY_TOKENS_2[pair];
    if (two) {
      found.push(two);
      index += 2;
      continue;
    }
    const one = DAY_TOKENS_1[char];
    if (one) found.push(one);
    index += 1;
  }

  return WEEKDAYS.filter((day) => found.includes(day));
}

const TIME_RE = /(\d{1,2})\s*(?::\s*(\d{2}))?\s*([ap]\.?\s?m\.?)?/i;

/**
 * Minutes past midnight, or null.
 *
 * Without a meridiem an hour below `assumePmBefore` is read as PM: classes
 * do not start at 4am, and evening sections are often written bare.
 */
export function parseTime(value: string | null | undefined, assumePmBefore = 7): number | null {
  if (isBlank(value)) return null;
  const match = TIME_RE.exec(value!.trim());
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = (match[3] ?? '').replace(/[.\s]/g, '').toLowerCase();
  if (hour > 23 || minute > 59) return null;

  if (meridiem.startsWith('p') && hour !== 12) hour += 12;
  else if (meridiem.startsWith('a') && hour === 12) hour = 0;
  else if (!meridiem && hour < assumePmBefore) hour += 12;

  return (hour % 24) * 60 + minute;
}

/**
 * Split `"7:00PM - 8:15PM"` into start and end.
 *
 * A meridiem on only the end applies to the start too, so `"1:00 - 2:15 PM"`
 * is an afternoon class -- but only when that keeps the range pointing
 * forwards, so `"11:00 - 12:15PM"` does not become 23:00-12:15.
 */
export function parseTimeRange(value: string | null | undefined): [number | null, number | null] {
  if (isBlank(value)) return [null, null];

  const parts = value!.trim().split(/\s*(?:-|–|—|\bto\b|\buntil\b)\s*/i);
  if (parts.length < 2) return [parseTime(value), null];

  const head = parts[0]!;
  const tail = parts.slice(1).join(' ');
  const end = parseTime(tail);

  if (end !== null && !/[ap]\.?\s?m/i.test(head)) {
    const borrowed = parseTime(`${head} ${end >= 12 * 60 ? 'PM' : 'AM'}`);
    if (borrowed !== null && borrowed <= end) return [borrowed, end];
  }
  return [parseTime(head), end];
}

export function formatTime(minutes: number | null): string {
  if (minutes === null) return 'TBA';
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const display = ((hour + 11) % 12) + 1;
  return `${display}:${String(minute).padStart(2, '0')}${hour < 12 ? 'AM' : 'PM'}`;
}

export function formatMeeting(meeting: Omit<Meeting, 'text'>): string {
  if (meeting.days.length === 0 && meeting.start === null) return meeting.location ?? 'TBA';
  const days = meeting.days.join('') || 'TBA';
  const span =
    meeting.start === null || meeting.end === null
      ? 'TBA'
      : `${formatTime(meeting.start)}-${formatTime(meeting.end)}`;
  return `${days} ${span}${meeting.location ? ` @ ${meeting.location}` : ''}`;
}

export function makeMeeting(
  days: Weekday[],
  start: number | null,
  end: number | null,
  location: string | null,
): Meeting {
  return { days, start, end, location, text: formatMeeting({ days, start, end, location }) };
}

/** `"TuTh 7:00PM-8:15PM"` plus an optional separate room. */
export function parseMeeting(value: string | null | undefined, location?: string | null): Meeting | null {
  const text = clean(value);
  const room = clean(location);
  if (text === null && room === null) return null;
  if (text === null) return makeMeeting([], null, null, room);

  const digit = /\d/.exec(text);
  const dayPart = digit ? text.slice(0, digit.index) : text;
  const timePart = digit ? text.slice(digit.index) : '';

  const days = parseDays(dayPart);
  const [start, end] = parseTimeRange(timePart);
  if (days.length === 0 && start === null) return makeMeeting([], null, null, room ?? text);
  return makeMeeting(days, start, end, room);
}

/**
 * Commas are not separators -- schedules write `Rivera, A.`, so splitting on
 * them would tear each name in half.
 */
export function parseInstructors(value: string | null | undefined): string[] {
  if (value == null || !value.trim()) return [];
  const text = clean(value);
  if (text === null || ['staff', 'instructor'].includes(text.toLowerCase())) return ['Staff'];
  return text.split(/\s*[;/\n]\s*|\s+and\s+/).map((part) => part.trim()).filter(Boolean);
}

/** `"COMP 586"` / `"COMP586"` -> subject + catalog number. */
export function parseCourseId(value: string | null | undefined): [string | null, string | null] {
  const text = clean(value);
  if (text === null) return [null, null];
  const match = /\b([A-Za-z]{2,5})\s*[-_ ]?\s*(\d{1,3}[A-Za-z]{0,3})\b/.exec(text);
  if (!match) return [null, null];
  return [match[1]!.toUpperCase(), match[2]!.toUpperCase()];
}
