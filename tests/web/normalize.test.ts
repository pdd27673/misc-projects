import { describe, expect, it } from 'vitest';

import {
  clean,
  formatTime,
  parseCourseId,
  parseDays,
  parseInstructors,
  parseMeeting,
  parseStatus,
  parseTime,
  parseTimeRange,
  parseUnits,
} from '../../src/lib/normalize';

const at = (hour: number, minute = 0): number => hour * 60 + minute;

describe('parseDays', () => {
  it.each([
    ['MW', ['Mo', 'We']],
    ['TuTh', ['Tu', 'Th']],
    ['TTh', ['Tu', 'Th']],
    ['MWF', ['Mo', 'We', 'Fr']],
    ['MoWeFr', ['Mo', 'We', 'Fr']],
    ['M/W/F', ['Mo', 'We', 'Fr']],
    ['Tuesday, Thursday', ['Tu', 'Th']],
    ['TBA', []],
    ['', []],
  ] as const)('parses %s', (text, expected) => {
    expect(parseDays(text)).toEqual(expected);
  });

  it('orders and dedupes', () => {
    expect(parseDays('FMW M')).toEqual(['Mo', 'We', 'Fr']);
  });
});

describe('parseTime', () => {
  it.each([
    ['7:00PM', at(19)],
    ['7:00 pm', at(19)],
    ['7 PM', at(19)],
    ['12:00AM', at(0)],
    ['12:30PM', at(12, 30)],
    ['19:00', at(19)],
    ['9:00AM', at(9)],
    ['TBA', null],
  ] as const)('parses %s', (text, expected) => {
    expect(parseTime(text)).toBe(expected);
  });
});

describe('parseTimeRange', () => {
  it.each([
    ['7:00PM-8:15PM', at(19), at(20, 15)],
    ['7:00 PM - 8:15 PM', at(19), at(20, 15)],
    ['9:00AM – 9:50AM', at(9), at(9, 50)],
    ['1:00 - 2:15 PM', at(13), at(14, 15)],
    ['10:00AM to 11:15AM', at(10), at(11, 15)],
    ['TBA', null, null],
  ] as const)('parses %s', (text, start, end) => {
    expect(parseTimeRange(text)).toEqual([start, end]);
  });

  it('borrows the end meridiem only when the range stays forwards', () => {
    expect(parseTimeRange('1:00 - 2:15 PM')).toEqual([at(13), at(14, 15)]);
    // 11:00 must not become 23:00 just because the end says PM.
    const [start, end] = parseTimeRange('11:00 - 12:15PM');
    expect(start).toBeLessThan(end!);
  });
});

describe('parseMeeting', () => {
  it('splits days from times and keeps the room', () => {
    expect(parseMeeting('TuTh 7:00PM-8:15PM', 'JD 1600')).toEqual({
      days: ['Tu', 'Th'],
      start: at(19),
      end: at(20, 15),
      location: 'JD 1600',
      text: 'TuTh 7:00PM-8:15PM @ JD 1600',
    });
  });

  it('keeps the location for an async section', () => {
    const meeting = parseMeeting('TBA', 'Online')!;
    expect(meeting.days).toEqual([]);
    expect(meeting.start).toBeNull();
    expect(meeting.location).toBe('Online');
  });
});

describe('parseStatus', () => {
  it.each([
    ['Open', 'open'],
    ['Closed', 'closed'],
    ['Full', 'closed'],
    ['Wait List', 'waitlist'],
    ['Cancelled', 'cancelled'],
    ['', 'unknown'],
    ['mystery', 'unknown'],
  ] as const)('maps %s', (text, expected) => {
    expect(parseStatus(text)).toBe(expected);
  });

  it('prefers waitlist when both words appear', () => {
    expect(parseStatus('Closed - Wait List Open')).toBe('waitlist');
  });
});

describe('misc', () => {
  it('does not split names on commas', () => {
    expect(parseInstructors('Rivera, A.')).toEqual(['Rivera, A.']);
    expect(parseInstructors('Rivera, A.; Chen, L.')).toEqual(['Rivera, A.', 'Chen, L.']);
    expect(parseInstructors('TBA')).toEqual(['Staff']);
    expect(parseInstructors(null)).toEqual([]);
  });

  it('parses course ids and units', () => {
    expect(parseCourseId('COMP 586 - Advanced Topics')).toEqual(['COMP', '586']);
    expect(parseCourseId('comp-586')).toEqual(['COMP', '586']);
    expect(parseCourseId('nothing here')).toEqual([null, null]);
    expect(parseUnits('1-3')).toBe(1);
  });

  it('cleans whitespace and TBA', () => {
    expect(clean('  Advanced   Topics  ')).toBe('Advanced Topics');
    expect(clean('TBA')).toBeNull();
  });

  it('formats times for display', () => {
    expect(formatTime(at(19))).toBe('7:00PM');
    expect(formatTime(at(9, 5))).toBe('9:05AM');
    expect(formatTime(at(0))).toBe('12:00AM');
    expect(formatTime(at(12))).toBe('12:00PM');
    expect(formatTime(null)).toBe('TBA');
  });
});
