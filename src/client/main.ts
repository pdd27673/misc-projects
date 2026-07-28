/**
 * CSUN Class Finder — browser app.
 *
 * Searching goes through the Pages Function; schedule building runs here,
 * over the sections already loaded, so adjusting preferences is instant.
 */

import { formatTime, parseTime } from '../lib/normalize';
import { DEFAULT_PREFERENCES, plan, type Preferences, type Schedule } from '../lib/planner';
import { nextTerm, termCode, termName, upcomingTerms } from '../lib/terms';
import type { SearchResponse, Section, Weekday } from '../lib/types';

const PLAN_KEY = 'csun-class-finder/plan';
const WEEK_DAYS: Weekday[] = ['Mo', 'Tu', 'We', 'Th', 'Fr'];

/** Sections keyed by course, accumulated across searches. */
const pool = new Map<string, Section[]>();
const planned: string[] = [];
const daysOff = new Set<Weekday>();

const el = {
  form: byId<HTMLFormElement>('search-form'),
  query: byId<HTMLInputElement>('query'),
  term: byId<HTMLSelectElement>('term'),
  openOnly: byId<HTMLInputElement>('open-only'),
  searchButton: byId<HTMLButtonElement>('search-button'),
  notice: byId<HTMLDivElement>('notice'),
  resultsPanel: byId<HTMLElement>('results-panel'),
  resultsTitle: byId<HTMLHeadingElement>('results-title'),
  resultsCount: byId<HTMLSpanElement>('results-count'),
  results: byId<HTMLDivElement>('results'),
  planCourses: byId<HTMLDivElement>('plan-courses'),
  daysOff: byId<HTMLDivElement>('days-off'),
  earliest: byId<HTMLInputElement>('earliest'),
  latest: byId<HTMLInputElement>('latest'),
  maxUnits: byId<HTMLInputElement>('max-units'),
  includeClosed: byId<HTMLInputElement>('include-closed'),
  buildButton: byId<HTMLButtonElement>('build-button'),
  schedules: byId<HTMLDivElement>('schedules'),
};

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

function fillTerms(): void {
  const current = nextTerm();
  for (const term of upcomingTerms(6)) {
    const option = document.createElement('option');
    option.value = termCode(term);
    option.textContent = `${termName(term)} (${termCode(term)})`;
    if (termCode(term) === termCode(current)) option.selected = true;
    el.term.append(option);
  }
}

function fillDayToggles(): void {
  for (const day of WEEK_DAYS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = day;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const on = !daysOff.has(day);
      if (on) daysOff.add(day);
      else daysOff.delete(day);
      button.setAttribute('aria-pressed', String(on));
    });
    el.daysOff.append(button);
  }
}

function restorePlan(): void {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PLAN_KEY) ?? '[]');
    if (Array.isArray(saved)) {
      for (const course of saved) if (typeof course === 'string') planned.push(course);
    }
  } catch {
    // A corrupt entry is not worth failing the page over.
  }
  renderPlan();
}

function savePlan(): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(planned));
  } catch {
    // Private browsing; the plan simply will not persist.
  }
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

el.form.addEventListener('submit', (event) => {
  event.preventDefault();
  void runSearch();
});

async function runSearch(): Promise<void> {
  const query = el.query.value.trim();
  if (!query) return;

  setBusy(true);
  hideNotice();

  const params = new URLSearchParams({ q: query, term: el.term.value });
  if (el.openOnly.checked) params.set('openOnly', '1');

  try {
    const response = await fetch(`/api/classes?${params}`);
    const data = (await response.json()) as SearchResponse & { error?: string };

    if (!response.ok || data.error) {
      showNotice(data.error ?? `Search failed (HTTP ${response.status}).`, true);
      return;
    }

    if (data.notice) showNotice(data.notice, !data.sample);
    absorb(data.sections);
    renderResults(data);
    renderPlan();
  } catch (error) {
    showNotice(`Could not reach the search service: ${String(error)}`, true);
  } finally {
    setBusy(false);
  }
}

/** Keep the newest sections for each course seen. */
function absorb(sections: Section[]): void {
  const grouped = new Map<string, Section[]>();
  for (const section of sections) {
    const list = grouped.get(section.course) ?? [];
    list.push(section);
    grouped.set(section.course, list);
  }
  for (const [course, list] of grouped) pool.set(course, list);
}

function setBusy(busy: boolean): void {
  el.searchButton.disabled = busy;
  el.searchButton.innerHTML = busy ? '<span class="spinner"></span>Searching' : 'Search';
}

function showNotice(message: string, isError = false): void {
  el.notice.textContent = message;
  el.notice.classList.toggle('error', isError);
  el.notice.hidden = false;
}

function hideNotice(): void {
  el.notice.hidden = true;
}

// ---------------------------------------------------------------------------
// rendering results
// ---------------------------------------------------------------------------

function renderResults(data: SearchResponse): void {
  el.resultsPanel.hidden = false;
  el.resultsTitle.textContent = `${data.subject ?? 'Results'}${data.courseNumber ? ` ${data.courseNumber}` : ''} — ${data.term}`;
  el.resultsCount.textContent =
    data.sectionCount === 0
      ? 'No sections found'
      : `${data.sectionCount} section${data.sectionCount === 1 ? '' : 's'}, ${data.openCount} still enrollable`;

  el.results.replaceChildren();
  if (data.sections.length === 0) {
    el.results.append(node('p', 'empty', 'Nothing matched. Try a different term or drop the course number.'));
    return;
  }

  const grouped = new Map<string, Section[]>();
  for (const section of data.sections) {
    const list = grouped.get(section.course) ?? [];
    list.push(section);
    grouped.set(section.course, list);
  }

  for (const [course, sections] of grouped) {
    el.results.append(renderCourseGroup(course, sections));
  }
}

function renderCourseGroup(course: string, sections: Section[]): HTMLElement {
  const group = node('div', 'course-group');
  const head = node('div', 'course-head');
  head.append(node('h3', '', course));

  const title = sections.find((section) => section.title)?.title;
  if (title) head.append(node('span', 'course-title', title));

  const add = document.createElement('button');
  add.type = 'button';
  const inPlan = planned.includes(course);
  add.textContent = inPlan ? 'In plan' : '+ Add to plan';
  add.disabled = inPlan;
  add.addEventListener('click', () => {
    if (!planned.includes(course)) planned.push(course);
    savePlan();
    renderPlan();
    add.textContent = 'In plan';
    add.disabled = true;
  });
  head.append(add);
  group.append(head);

  const list = node('div', 'sections');
  for (const section of sections) list.append(renderSection(section));
  group.append(list);
  return group;
}

function renderSection(section: Section): HTMLElement {
  const card = node('div', 'section-card');

  const status = node('span', `pill ${section.status}`, section.status);
  card.append(status);

  const when = node('div', 'section-when');
  const identity = node('div', 'section-id');
  identity.append(node('span', 'class-number', section.classNumber ?? '—'));
  if (section.section) identity.append(document.createTextNode(' '), node('span', 'section-number', `sec ${section.section}`));
  when.append(identity);

  const meets = section.meetings.map((meeting) => meeting.text).join('; ') || 'TBA';
  when.append(node('div', 'meets', meets));

  const who = [section.instructors.join(', '), section.instructionMode].filter(Boolean).join(' · ');
  if (who) when.append(node('div', 'who', who));
  card.append(when);

  const seats = node('div', 'section-seats');
  if (section.seatsAvailable === null) {
    seats.append(node('span', 'count', '—'));
  } else {
    seats.append(node('span', 'count', String(section.seatsAvailable)));
    if (section.seatsCapacity) seats.append(node('span', 'of', ` / ${section.seatsCapacity}`));
  }
  if (section.waitlistAvailable !== null) {
    seats.append(node('span', 'wl', `waitlist ${section.waitlistAvailable}`));
  }
  card.append(seats);

  return card;
}

// ---------------------------------------------------------------------------
// planner
// ---------------------------------------------------------------------------

function renderPlan(): void {
  el.planCourses.replaceChildren();

  if (planned.length === 0) {
    el.planCourses.append(node('p', 'empty', 'No courses added yet.'));
    el.buildButton.disabled = true;
    return;
  }

  for (const course of planned) {
    const chip = node('span', 'chip');
    chip.append(document.createTextNode(course));

    const loaded = pool.get(course)?.length ?? 0;
    chip.append(node('span', 'count', loaded ? `${loaded} sections` : 'not loaded'));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${course}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      const index = planned.indexOf(course);
      if (index >= 0) planned.splice(index, 1);
      savePlan();
      renderPlan();
    });
    chip.append(remove);
    el.planCourses.append(chip);
  }

  el.buildButton.disabled = planned.every((course) => !pool.has(course));
}

el.buildButton.addEventListener('click', () => {
  const preferences: Preferences = {
    ...DEFAULT_PREFERENCES,
    earliest: parseTime(el.earliest.value || null),
    latest: parseTime(el.latest.value || null),
    daysOff: [...daysOff],
    openOnly: !el.includeClosed.checked,
    maxUnits: el.maxUnits.value ? Number(el.maxUnits.value) : null,
  };

  const sections = [...pool.values()].flat();
  const result = plan(sections, planned, preferences, 8);

  el.schedules.replaceChildren();

  for (const [course, reason] of Object.entries(result.unplaceable)) {
    el.schedules.append(node('p', 'empty', `${course}: ${reason}`));
  }

  if (result.schedules.length === 0) {
    if (Object.keys(result.unplaceable).length === 0) {
      el.schedules.append(node('p', 'empty', 'No conflict-free combination exists for those courses.'));
    }
    return;
  }

  result.schedules.forEach((schedule, index) => {
    el.schedules.append(renderSchedule(schedule, index + 1));
  });
});

function renderSchedule(schedule: Schedule, position: number): HTMLElement {
  const wrapper = node('div', 'schedule');
  const head = node('div', 'schedule-head');
  head.append(node('h3', '', `Schedule ${position}`));

  const parts = [
    schedule.units ? `${schedule.units} units` : null,
    schedule.daysUsed.length ? schedule.daysUsed.join('/') : 'no fixed days',
    schedule.earliestStart !== null ? `${formatTime(schedule.earliestStart)}–${formatTime(schedule.latestEnd)}` : null,
  ].filter(Boolean);
  head.append(node('span', 'summary', parts.join(' · ')));
  wrapper.append(head);

  const timed = schedule.sections.flatMap((section) =>
    section.meetings
      .filter((meeting) => meeting.days.length > 0 && meeting.start !== null && meeting.end !== null)
      .map((meeting) => ({ section, meeting })),
  );

  if (timed.length > 0) wrapper.append(renderWeek(timed));

  const async_ = schedule.sections.filter((section) =>
    section.meetings.every((meeting) => meeting.days.length === 0 || meeting.start === null),
  );
  if (async_.length > 0) {
    wrapper.append(
      node('p', 'async-note', `No fixed meeting time: ${async_.map((section) => section.course).join(', ')}`),
    );
  }

  const list = node('div', 'sections');
  for (const section of schedule.sections) list.append(renderSection(section));
  wrapper.append(list);
  return wrapper;
}

interface TimedMeeting {
  section: Section;
  meeting: Section['meetings'][number];
}

function renderWeek(timed: TimedMeeting[]): HTMLElement {
  const starts = timed.map((item) => item.meeting.start!);
  const ends = timed.map((item) => item.meeting.end!);
  const firstHour = Math.floor(Math.min(...starts) / 60);
  const lastHour = Math.ceil(Math.max(...ends) / 60);
  const hours = Math.max(lastHour - firstHour, 1);
  const rowHeight = 44;

  const grid = node('div', 'week');
  grid.append(node('div', 'cell hour-label', ''));
  for (const day of WEEK_DAYS) grid.append(node('div', 'cell day-name', day));

  // One label column plus five day columns, each spanning the full height.
  const labels = node('div', 'cell');
  labels.style.display = 'grid';
  labels.style.gridTemplateRows = `repeat(${hours}, ${rowHeight}px)`;
  for (let hour = firstHour; hour < lastHour; hour += 1) {
    labels.append(node('div', 'hour-label', formatTime(hour * 60).replace(':00', '')));
  }
  grid.append(labels);

  for (const day of WEEK_DAYS) {
    const column = node('div', 'cell column');
    column.style.height = `${hours * rowHeight}px`;

    for (const { section, meeting } of timed) {
      if (!meeting.days.includes(day)) continue;
      const block = node('div', 'block');
      block.style.top = `${((meeting.start! - firstHour * 60) / 60) * rowHeight}px`;
      block.style.height = `${Math.max(((meeting.end! - meeting.start!) / 60) * rowHeight - 2, 18)}px`;
      block.append(node('strong', '', section.course));
      block.append(document.createTextNode(formatTime(meeting.start)));
      column.append(block);
    }
    grid.append(column);
  }

  return grid;
}

// ---------------------------------------------------------------------------

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

fillTerms();
fillDayToggles();
restorePlan();
