"""Build conflict-free schedules from a set of candidate sections.

This is the half of the "parse a degree report, then plan next semester"
idea that needs no network and no PDF: given the sections available for
each course a student still needs, enumerate the timetables that actually
fit together.

Feeding it a real degree progress report is a separate step -- produce a
list of course codes however you like and hand them to :func:`plan`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import time
from itertools import product
from typing import Iterable, Sequence

from .models import Section, Status

DEFAULT_MAX_SCHEDULES = 20


@dataclass
class Preferences:
    """Soft and hard constraints on a timetable."""

    earliest: time | None = None
    latest: time | None = None
    days_off: tuple[str, ...] = ()
    open_only: bool = True
    allow_waitlist: bool = True
    max_units: float | None = None
    prefer_days_off: bool = True

    def allows(self, section: Section) -> bool:
        """Whether a section passes the hard constraints."""
        if self.open_only:
            if section.status is Status.CANCELLED:
                return False
            allowed = {Status.OPEN, Status.UNKNOWN}
            if self.allow_waitlist:
                allowed.add(Status.WAITLIST)
            if section.status not in allowed:
                return False

        for meeting in section.meetings:
            if set(meeting.days) & set(self.days_off):
                return False
            if self.earliest and meeting.start and meeting.start < self.earliest:
                return False
            if self.latest and meeting.end and meeting.end > self.latest:
                return False
        return True


@dataclass
class Schedule:
    """One conflict-free combination of sections."""

    sections: tuple[Section, ...]

    @property
    def units(self) -> float:
        return sum(s.units or 0 for s in self.sections)

    @property
    def days_used(self) -> tuple[str, ...]:
        days = {d for s in self.sections for m in s.meetings for d in m.days}
        order = ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")
        return tuple(d for d in order if d in days)

    @property
    def earliest_start(self) -> time | None:
        starts = [m.start for s in self.sections for m in s.meetings if m.start]
        return min(starts) if starts else None

    @property
    def latest_end(self) -> time | None:
        ends = [m.end for s in self.sections for m in s.meetings if m.end]
        return max(ends) if ends else None

    def to_dict(self) -> dict:
        return {
            "units": self.units,
            "daysUsed": list(self.days_used),
            "earliestStart": self.earliest_start.strftime("%H:%M") if self.earliest_start else None,
            "latestEnd": self.latest_end.strftime("%H:%M") if self.latest_end else None,
            "sections": [s.to_dict() for s in self.sections],
        }


@dataclass
class PlanResult:
    """Schedules found, plus why any course could not be placed."""

    schedules: list[Schedule] = field(default_factory=list)
    unplaceable: dict[str, str] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return bool(self.schedules) and not self.unplaceable

    def to_dict(self) -> dict:
        return {
            "scheduleCount": len(self.schedules),
            "unplaceable": self.unplaceable,
            "schedules": [s.to_dict() for s in self.schedules],
        }


def conflicts(sections: Sequence[Section]) -> list[tuple[Section, Section]]:
    """Every colliding pair in a set of sections."""
    found = []
    for i, first in enumerate(sections):
        for second in sections[i + 1 :]:
            if first.conflicts_with(second):
                found.append((first, second))
    return found


def group_by_course(sections: Iterable[Section]) -> dict[str, list[Section]]:
    """Bucket sections under ``"COMP 586"`` keys."""
    grouped: dict[str, list[Section]] = {}
    for section in sections:
        grouped.setdefault(section.course, []).append(section)
    return grouped


def plan(
    sections: Iterable[Section],
    wanted: Sequence[str],
    *,
    preferences: Preferences | None = None,
    max_schedules: int = DEFAULT_MAX_SCHEDULES,
) -> PlanResult:
    """Find timetables covering every course in ``wanted``.

    ``wanted`` holds course codes such as ``["COMP 586", "COMP 620"]``;
    ``sections`` is the pool of candidates, typically the concatenated
    results of one search per course.
    """
    preferences = preferences or Preferences()
    pool = group_by_course(sections)
    result = PlanResult()

    options: list[list[Section]] = []
    for course in wanted:
        key = _normalise_course(course)
        candidates = pool.get(key, [])
        if not candidates:
            result.unplaceable[key] = "no sections found"
            continue
        allowed = [s for s in candidates if preferences.allows(s)]
        if not allowed:
            result.unplaceable[key] = (
                f"all {len(candidates)} section(s) ruled out by filters "
                "(status, time window or days off)"
            )
            continue
        options.append(allowed)

    if result.unplaceable or not options:
        return result

    for combination in product(*options):
        if conflicts(combination):
            continue
        schedule = Schedule(sections=tuple(combination))
        if preferences.max_units and schedule.units > preferences.max_units:
            continue
        result.schedules.append(schedule)
        if len(result.schedules) >= max_schedules * 5:
            break

    result.schedules.sort(key=lambda s: _rank(s, preferences))
    del result.schedules[max_schedules:]
    return result


def _rank(schedule: Schedule, preferences: Preferences) -> tuple:
    """Fewer days on campus first, then a later start, then a shorter day."""
    day_count = len(schedule.days_used) if preferences.prefer_days_off else 0
    start = schedule.earliest_start or time(23, 59)
    end = schedule.latest_end or time(0, 0)
    span = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)
    return (day_count, -(start.hour * 60 + start.minute), span)


def _normalise_course(value: str) -> str:
    """``comp586`` / ``COMP-586`` -> ``COMP 586``."""
    from .normalize import parse_course_id

    subject, catalog = parse_course_id(value)
    return f"{subject} {catalog}" if subject and catalog else value.strip().upper()
