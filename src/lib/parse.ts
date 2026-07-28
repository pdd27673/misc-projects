/**
 * Extract sections from a class-search page -- the TypeScript port of
 * `csunclasses/parse.py`, and the same bet: match on column headings and
 * field labels, not CSS selectors, so a PeopleSoft redesign does not
 * silently break it.
 */

import { findAll, parseHtml, textOf, walk, type ElementNode } from './html';
import {
  clean,
  makeMeeting,
  parseCourseId,
  parseDays,
  parseInstructors,
  parseInt_,
  parseMeeting,
  parseStatus,
  parseTimeRange,
  parseUnits,
} from './normalize';
import type { Meeting, Section } from './types';

export const FIELD_SYNONYMS: Record<string, string[]> = {
  class_number: ['class number', 'class nbr', 'class #', 'classnum', 'class no', 'clsnbr'],
  section: ['section number', 'section', 'sect', 'seq'],
  status: ['status', 'availability', 'enrollment status', 'open/closed'],
  seats_available: [
    'regular seats available', 'seats available', 'available seats',
    'seats open', 'open seats', 'seats remaining', 'avail',
  ],
  seats_capacity: ['enrollment capacity', 'class capacity', 'capacity', 'enrl cap', 'total seats'],
  waitlist_available: ['waitlist seats available', 'waitlist available', 'waitlist open', 'wait list available'],
  waitlist_capacity: ['waitlist capacity', 'waitlist total', 'wait list capacity', 'waitlist'],
  meeting: ['days and times', 'days & times', 'days/times', 'meeting time', 'meeting pattern', 'time', 'schedule'],
  days: ['days', 'meeting days', 'day'],
  instruction_mode: ['instruction mode', 'modality', 'mode', 'delivery', 'format'],
  instructors: ['instructor', 'instructors', 'faculty', 'taught by'],
  location: ['room', 'location', 'building', 'where'],
  units: ['units', 'credits', 'credit hours'],
  title: ['class title', 'course title', 'title', 'description'],
  session: ['session', 'term session'],
  course: ['course', 'catalog number', 'course number', 'subject and catalog', 'class'],
  dates: ['dates', 'meeting dates', 'start/end date'],
};

const IDENTIFYING_FIELDS = new Set(['class_number', 'section', 'status', 'seats_available']);
const MIN_RECOGNISED_COLUMNS = 2;

const COURSE_HEADING_RE = /\b([A-Z]{2,5})\s*[-_ ]?\s*(\d{1,3}[A-Z]{0,3})\b/;
const LABEL_VALUE_RE = /^\s*([A-Za-z][A-Za-z /&#.]{2,40}?)\s*[:–-]\s*(.+?)\s*$/;

type Values = Record<string, string>;

export function parseSections(html: string): Section[] {
  const root = parseHtml(html);
  const sections: Section[] = [];

  for (const table of findAll(root, 'table')) {
    sections.push(...sectionsFromTable(table));
  }
  if (sections.length === 0) {
    sections.push(...sectionsFromLabels(root));
  }

  return sortSections(dedupe(sections));
}

export interface TableReport {
  index: number;
  headings: string[];
  recognised: Record<string, string>;
  unrecognised: string[];
  rows: number;
  used: boolean;
}

/** What the parser saw -- the web equivalent of `probe --describe`. */
export function describeTables(html: string): TableReport[] {
  return findAll(parseHtml(html), 'table').map((table, index) => {
    const headings = headerCells(table);
    const columns = mapColumns(headings);
    const recognised: Record<string, string> = {};
    const unrecognised: string[] = [];

    headings.forEach((heading, position) => {
      const field = columns.get(position);
      if (field) recognised[heading] = field;
      else if (heading) unrecognised.push(heading);
    });

    return {
      index,
      headings,
      recognised,
      unrecognised,
      rows: Math.max(findAll(table, 'tr').length - 1, 0),
      used: isSectionTable(columns),
    };
  });
}

// ---------------------------------------------------------------------------
// tables
// ---------------------------------------------------------------------------

function sectionsFromTable(table: ElementNode): Section[] {
  const headings = headerCells(table);
  const columns = mapColumns(headings);
  if (!isSectionTable(columns)) return [];

  const context = courseContext(table);
  const sections: Section[] = [];

  for (const row of dataRows(table)) {
    const cells = findAll(row, ['td', 'th']).filter((cell) => cellRow(cell) === row);
    if (cells.length === 0) continue;

    const values: Values = {};
    cells.forEach((cell, index) => {
      const field = columns.get(index);
      if (!field) return;
      const text = cellText(cell);
      // Several columns can map to one field; keep the first non-empty.
      if (text && !values[field]) values[field] = text;
    });

    if (Object.keys(values).length === 0) continue;
    const section = buildSection(values, context);
    if (section) sections.push(section);
  }

  return sections;
}

/** The row a cell belongs to, so nested tables do not steal each other's cells. */
function cellRow(cell: ElementNode): ElementNode | null {
  let node = cell.parent;
  while (node && node.tag !== 'tr') node = node.parent;
  return node;
}

function ownRows(table: ElementNode): ElementNode[] {
  return findAll(table, 'tr').filter((row) => {
    let node = row.parent;
    while (node && node.tag !== 'table') node = node.parent;
    return node === table;
  });
}

function headerCells(table: ElementNode): string[] {
  const rows = ownRows(table);
  const header = rows.find((row) => findAll(row, 'th').length > 0) ?? rows[0];
  if (!header) return [];
  return findAll(header, ['th', 'td'])
    .filter((cell) => cellRow(cell) === header)
    .map(cellText);
}

function dataRows(table: ElementNode): ElementNode[] {
  const rows = ownRows(table);
  const headerIndex = rows.findIndex((row) => findAll(row, 'th').length > 0);
  return rows.slice(headerIndex >= 0 ? headerIndex + 1 : 1);
}

function mapColumns(headings: string[]): Map<number, string> {
  const mapping = new Map<number, string>();
  headings.forEach((heading, index) => {
    const field = matchField(heading);
    if (field) mapping.set(index, field);
  });
  return mapping;
}

export function matchField(label: string | null | undefined): string | null {
  const text = normaliseLabel(label);
  if (!text) return null;

  let best: { score: number; field: string } | null = null;
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    for (const synonym of synonyms) {
      if (text === synonym || text.includes(synonym)) {
        const score = synonym.length + (text === synonym ? 100 : 0);
        if (!best || score > best.score) best = { score, field };
      }
    }
  }
  return best?.field ?? null;
}

function isSectionTable(columns: Map<number, string>): boolean {
  const fields = new Set(columns.values());
  return [...fields].some((field) => IDENTIFYING_FIELDS.has(field)) && fields.size >= MIN_RECOGNISED_COLUMNS;
}

interface CourseContext {
  subject: string | null;
  catalog: string | null;
  title: string | null;
}

/** Find the `COMP 586 - Title` heading this table sits under. */
function courseContext(table: ElementNode): CourseContext {
  const root = rootOf(table);
  const headings = findAll(root, ['h1', 'h2', 'h3', 'h4', 'h5', 'caption', 'summary', 'legend', 'strong']);
  const order = [...walk(root)];
  const tablePosition = order.indexOf(table);

  for (let i = headings.length - 1; i >= 0; i -= 1) {
    const heading = headings[i]!;
    if (order.indexOf(heading) > tablePosition) continue;
    const text = clean(textOf(heading));
    if (!text || text.length > 200) continue;
    const match = COURSE_HEADING_RE.exec(text.toUpperCase());
    if (!match) continue;
    const title = /[-–:]/.test(text) ? clean(text.replace(/.*?[-–:]\s*/, '')) : null;
    return { subject: match[1]!, catalog: match[2]!, title };
  }
  return { subject: null, catalog: null, title: null };
}

function rootOf(node: ElementNode): ElementNode {
  let current = node;
  while (current.parent) current = current.parent;
  return current;
}

// ---------------------------------------------------------------------------
// label/value cards
// ---------------------------------------------------------------------------

function sectionsFromLabels(root: ElementNode): Section[] {
  const sections: Section[] = [];

  for (const container of findAll(root, ['li', 'article', 'section', 'div', 'dl'])) {
    if (findAll(container, ['li', 'article', 'dl']).length > 0) continue;
    const text = textOf(container);
    if (text.length <= 20 || text.length >= 2000) continue;

    const values = labelValues(container);
    if (!Object.keys(values).some((field) => IDENTIFYING_FIELDS.has(field))) continue;

    let [subject, catalog] = parseCourseId(values.course);
    if (!subject) {
      const heading = findAll(container, ['h1', 'h2', 'h3', 'h4', 'strong'])[0];
      [subject, catalog] = parseCourseId(heading ? textOf(heading) : null);
    }

    const section = buildSection(values, { subject, catalog, title: null });
    if (section) sections.push(section);
  }

  return sections;
}

function labelValues(container: ElementNode): Values {
  const values: Values = {};

  const children = [...walk(container)];
  for (const node of children) {
    if (node.tag !== 'dt') continue;
    const siblings = node.parent ? node.parent.children : [];
    const position = siblings.indexOf(node);
    const dd = siblings.slice(position + 1).find((s) => s.type === 'element' && s.tag === 'dd');
    if (!dd || dd.type !== 'element') continue;
    const field = matchField(textOf(node));
    if (field && !values[field]) values[field] = cellText(dd);
  }

  for (const node of [container, ...children]) {
    for (const child of node.children) {
      if (child.type !== 'text') continue;
      const match = LABEL_VALUE_RE.exec(child.text);
      if (!match) continue;
      const field = matchField(match[1]);
      const value = clean(match[2]);
      if (field && value && !values[field]) values[field] = value;
    }
  }

  return values;
}

// ---------------------------------------------------------------------------
// assembly
// ---------------------------------------------------------------------------

function buildSection(values: Values, context: CourseContext): Section | null {
  const [foundSubject, foundCatalog] = parseCourseId(values.course);
  const subject = foundSubject ?? context.subject;
  const catalog = foundCatalog ?? context.catalog;
  if (!subject || !catalog) return null;

  let classNumber = digits(values.class_number, 5);
  let sectionId = clean(values.section);
  if (sectionId && !classNumber && /^\d{5}$/.test(sectionId)) {
    // Some layouts put the five-digit class number in a "Section" column.
    classNumber = sectionId;
    sectionId = null;
  }

  let status = parseStatus(values.status);
  const seats = parseInt_(values.seats_available);
  if (status === 'unknown' && seats !== null) status = seats > 0 ? 'open' : 'closed';

  return {
    course: `${subject} ${catalog}`,
    subject,
    catalogNumber: catalog,
    classNumber,
    section: sectionId,
    title: clean(values.title) ?? context.title,
    status,
    seatsAvailable: seats,
    seatsCapacity: parseInt_(values.seats_capacity),
    waitlistAvailable: parseInt_(values.waitlist_available),
    units: parseUnits(values.units),
    instructionMode: clean(values.instruction_mode),
    instructors: parseInstructors(values.instructors),
    meetings: buildMeetings(values),
    session: clean(values.session),
  };
}

function buildMeetings(values: Values): Meeting[] {
  const location = clean(values.location);
  const combined = clean(values.meeting);
  const daysText = clean(values.days);

  if (combined && !(daysText && looksLikeTimeOnly(combined))) {
    const meeting = parseMeeting(combined, location);
    return meeting ? [meeting] : [];
  }

  if (daysText || combined) {
    const days = parseDays(daysText);
    const [start, end] = parseTimeRange(combined);
    if (days.length > 0 || start !== null || location) {
      return [makeMeeting(days, start, end, location)];
    }
  }

  return location ? [makeMeeting([], null, null, location)] : [];
}

/** True for `"7:00PM-8:15PM"` -- a time range carrying no day letters. */
function looksLikeTimeOnly(text: string): boolean {
  return /\d/.test(text) && parseDays(text.replace(/[\d:apmAPM.\s\-–—]/g, '')).length === 0;
}

function digits(value: string | undefined, width?: number): string | null {
  if (value == null) return null;
  if (width) {
    const exact = new RegExp(`\\d{${width}}`).exec(value);
    if (exact) return exact[0];
  }
  const any = /\d+/.exec(value);
  return any ? any[0] : null;
}

/**
 * Cell text, falling back to an image's alt/title: PeopleSoft draws status as
 * a coloured dot with the word only in `alt`.
 */
function cellText(cell: ElementNode): string {
  const text = clean(textOf(cell));
  if (text) return text;
  for (const image of findAll(cell, 'img')) {
    const alt = clean(image.attrs.alt ?? image.attrs.title);
    if (alt) return alt;
  }
  return '';
}

function normaliseLabel(label: string | null | undefined): string {
  if (!label) return '';
  return label
    .replace(/ /g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9&#/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupe(sections: Section[]): Section[] {
  const seen = new Set<string>();
  return sections.filter((section) => {
    const key = [
      section.subject,
      section.catalogNumber,
      section.classNumber,
      section.section,
      section.meetings.map((m) => m.text).join(';'),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sortSections(sections: Section[]): Section[] {
  return [...sections].sort(
    (a, b) =>
      a.subject.localeCompare(b.subject) ||
      numericKey(a.catalogNumber) - numericKey(b.catalogNumber) ||
      a.catalogNumber.localeCompare(b.catalogNumber) ||
      (a.section ?? '').localeCompare(b.section ?? '') ||
      (a.classNumber ?? '').localeCompare(b.classNumber ?? ''),
  );
}

function numericKey(value: string): number {
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly ? Number(digitsOnly) : 0;
}
