"""Data model for a class-search result.

Everything the scraper produces lands in these types, so the parser, the
planner and the CLI all agree on one shape regardless of where the HTML
came from.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import time
from enum import Enum
from typing import Any, Iterable

from .terms import Term

# Weekday codes, Monday-first, matching ``date.weekday()`` ordering.
WEEKDAYS = ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")


class Status(str, Enum):
    """Enrollment status of a section."""

    OPEN = "open"
    CLOSED = "closed"
    WAITLIST = "waitlist"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"

    @property
    def enrollable(self) -> bool:
        """Whether a student could still get in, waitlist included."""
        return self in (Status.OPEN, Status.WAITLIST)


@dataclass(frozen=True)
class Meeting:
    """One recurring meeting block of a section."""

    days: tuple[str, ...] = ()
    start: time | None = None
    end: time | None = None
    location: str | None = None

    @property
    def is_scheduled(self) -> bool:
        """False for async/online sections with no fixed meeting time."""
        return bool(self.days) and self.start is not None and self.end is not None

    def overlaps(self, other: "Meeting") -> bool:
        """Whether two meetings collide on a shared day."""
        if not (self.is_scheduled and other.is_scheduled):
            return False
        if not set(self.days) & set(other.days):
            return False
        return self.start < other.end and other.start < self.end

    def __str__(self) -> str:
        if not self.days and self.start is None:
            return self.location or "TBA"
        days = "".join(self.days) or "TBA"
        if self.start is None or self.end is None:
            span = "TBA"
        else:
            span = f"{_fmt_time(self.start)}-{_fmt_time(self.end)}"
        return f"{days} {span}" + (f" @ {self.location}" if self.location else "")


@dataclass
class Section:
    """A single offered section of a course."""

    subject: str
    catalog_number: str
    class_number: str | None = None
    section: str | None = None
    title: str | None = None
    status: Status = Status.UNKNOWN
    seats_available: int | None = None
    seats_capacity: int | None = None
    waitlist_available: int | None = None
    waitlist_capacity: int | None = None
    units: float | None = None
    instruction_mode: str | None = None
    instructors: tuple[str, ...] = ()
    meetings: tuple[Meeting, ...] = ()
    session: str | None = None
    term: Term | None = None
    source_url: str | None = None
    raw: dict[str, str] = field(default_factory=dict, repr=False)

    @property
    def course(self) -> str:
        """The course this section belongs to, e.g. ``COMP 586``."""
        return f"{self.subject} {self.catalog_number}".strip()

    @property
    def has_seats(self) -> bool:
        return bool(self.seats_available and self.seats_available > 0)

    @property
    def meeting_pattern(self) -> str:
        """All meetings rendered as one line."""
        return "; ".join(str(m) for m in self.meetings) or "TBA"

    def conflicts_with(self, other: "Section") -> bool:
        """Whether any meeting of this section collides with ``other``."""
        return any(a.overlaps(b) for a in self.meetings for b in other.meetings)

    def to_dict(self) -> dict[str, Any]:
        """JSON-ready dict; times become ``HH:MM`` strings."""
        data = asdict(self)
        data["course"] = self.course
        data["status"] = self.status.value
        data["term"] = self.term.name if self.term else None
        data["term_code"] = self.term.code if self.term else None
        data["meetings"] = [
            {
                "days": list(m.days),
                "start": _fmt_iso(m.start),
                "end": _fmt_iso(m.end),
                "location": m.location,
                "text": str(m),
            }
            for m in self.meetings
        ]
        data["instructors"] = list(self.instructors)
        data.pop("raw", None)
        return data


@dataclass
class SearchQuery:
    """What to look for. Either ``catalog_number`` or ``class_number`` is enough."""

    term: Term
    subject: str | None = None
    catalog_number: str | None = None
    class_number: str | None = None
    open_only: bool = False
    session: str | None = None

    def __post_init__(self) -> None:
        if self.subject:
            self.subject = self.subject.strip().upper()
        if self.catalog_number:
            self.catalog_number = self.catalog_number.strip().upper()
        if self.class_number:
            self.class_number = self.class_number.strip()
        if not (self.subject or self.class_number):
            raise ValueError("provide a subject (with optional course number) or a class number")

    def matches(self, section: Section) -> bool:
        """Filter a parsed section down to what was actually asked for."""
        if self.class_number and section.class_number != self.class_number:
            return False
        if self.subject and section.subject.upper() != self.subject:
            return False
        if self.catalog_number and section.catalog_number.upper() != self.catalog_number:
            return False
        if self.open_only and not section.status.enrollable:
            return False
        return True

    def describe(self) -> str:
        if self.class_number:
            return f"class #{self.class_number}"
        return " ".join(filter(None, (self.subject, self.catalog_number)))


@dataclass
class SearchResult:
    """The answer to one :class:`SearchQuery`."""

    query: SearchQuery
    sections: list[Section] = field(default_factory=list)

    @property
    def open_sections(self) -> list[Section]:
        return [s for s in self.sections if s.status.enrollable]

    def to_dict(self) -> dict[str, Any]:
        return {
            "term": self.query.term.name,
            "term_code": self.query.term.code,
            "subject": self.query.subject,
            "courseNumber": self.query.catalog_number,
            "classNumber": self.query.class_number,
            "sectionCount": len(self.sections),
            "openCount": len(self.open_sections),
            "sections": [s.to_dict() for s in self.sections],
        }


def _fmt_time(value: time) -> str:
    """12-hour display, e.g. ``7:00PM``."""
    return f"{(value.hour - 1) % 12 + 1}:{value.minute:02d}{'AM' if value.hour < 12 else 'PM'}"


def _fmt_iso(value: time | None) -> str | None:
    return value.strftime("%H:%M") if value else None


def sort_sections(sections: Iterable[Section]) -> list[Section]:
    """Stable ordering: course, then section number, then class number."""
    return sorted(
        sections,
        key=lambda s: (s.subject, _numeric_key(s.catalog_number), s.section or "", s.class_number or ""),
    )


def _numeric_key(value: str) -> tuple[int, str]:
    """Sort ``586`` before ``586L`` and both before ``1000``."""
    digits = "".join(c for c in value if c.isdigit())
    return (int(digits) if digits else 0, value)
