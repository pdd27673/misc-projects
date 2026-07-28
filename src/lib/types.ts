/** Shared shapes. The Pages Function produces these; the client consumes them. */

export type Status = 'open' | 'closed' | 'waitlist' | 'cancelled' | 'unknown';

/** Weekday codes, Monday first. */
export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface Meeting {
  days: Weekday[];
  /** Minutes past midnight, or null when the section has no fixed time. */
  start: number | null;
  end: number | null;
  location: string | null;
  /** Pre-rendered for display, e.g. "TuTh 7:00PM-8:15PM @ JD 1600". */
  text: string;
}

export interface Section {
  course: string;
  subject: string;
  catalogNumber: string;
  classNumber: string | null;
  section: string | null;
  title: string | null;
  status: Status;
  seatsAvailable: number | null;
  seatsCapacity: number | null;
  waitlistAvailable: number | null;
  units: number | null;
  instructionMode: string | null;
  instructors: string[];
  meetings: Meeting[];
  session: string | null;
}

export interface SearchResponse {
  term: string;
  termCode: string;
  subject: string | null;
  courseNumber: string | null;
  classNumber: string | null;
  sectionCount: number;
  openCount: number;
  sections: Section[];
  /** Set when the upstream fetch failed and sample data is being shown. */
  sample?: boolean;
  notice?: string;
  /** What was actually requested upstream, for debugging. */
  upstream?: string;
}

/** A section is joinable if a seat or a waitlist spot is still reachable. */
export function isEnrollable(section: Section): boolean {
  return section.status === 'open' || section.status === 'waitlist';
}

export function hasFixedTime(meeting: Meeting): boolean {
  return meeting.days.length > 0 && meeting.start !== null && meeting.end !== null;
}
