"""Turn the free-form strings on a class-search page into typed values.

These helpers are deliberately forgiving: schedule pages vary between terms
and departments, so each function accepts the several spellings CSUN and
PeopleSoft use in practice and returns ``None`` rather than raising when a
field is absent or reads "TBA".
"""

from __future__ import annotations

import re
from datetime import time

from .models import Meeting, Status

# Two-character day tokens are tried before one-character ones so that "TuTh"
# and "TTh" both come out as Tuesday + Thursday rather than Tuesday + Tue/Th.
_DAY_TOKENS_2 = {
    "mo": "Mo", "tu": "Tu", "we": "We", "th": "Th",
    "fr": "Fr", "sa": "Sa", "su": "Su",
}
_DAY_TOKENS_1 = {
    "m": "Mo", "t": "Tu", "w": "We", "r": "Th",
    "f": "Fr", "s": "Sa", "u": "Su",
}
_DAY_NAMES = {
    "monday": "Mo", "tuesday": "Tu", "wednesday": "We", "thursday": "Th",
    "friday": "Fr", "saturday": "Sa", "sunday": "Su",
}
_DAY_ORDER = {day: i for i, day in enumerate(("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"))}

_TBA = {"tba", "tbd", "n/a", "na", "none", "", "-", "--", "arr", "arranged", "to be announced"}

_STATUS_PATTERNS = (
    (Status.CANCELLED, r"cancel"),
    (Status.WAITLIST, r"wait\s*-?\s*list|waitlisted|\bwl\b"),
    (Status.CLOSED, r"\bclosed\b|\bfull\b"),
    (Status.OPEN, r"\bopen\b|\bavailable\b"),
)

_TIME_RE = re.compile(
    r"(?P<hour>\d{1,2})\s*(?::\s*(?P<minute>\d{2}))?\s*(?P<meridiem>[ap]\.?\s?m\.?)?",
    re.IGNORECASE,
)
_RANGE_SPLIT_RE = re.compile(r"\s*(?:-|–|—|\bto\b|\buntil\b)\s*", re.IGNORECASE)


def is_blank(value: str | None) -> bool:
    """True for empty text and the various ways a page spells "unknown"."""
    return value is None or value.strip().lower().strip(".") in _TBA


def clean(value: str | None) -> str | None:
    """Collapse whitespace; return ``None`` for blank/TBA values."""
    if value is None:
        return None
    collapsed = re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()
    return None if is_blank(collapsed) else collapsed


def parse_status(value: str | None) -> Status:
    """Map status text (or an image's alt text) onto :class:`Status`."""
    text = (value or "").lower()
    if not text.strip():
        return Status.UNKNOWN
    for status, pattern in _STATUS_PATTERNS:
        if re.search(pattern, text):
            return status
    return Status.UNKNOWN


def parse_int(value: str | None) -> int | None:
    """First integer in the string, e.g. ``"Seats Available: 8"`` -> ``8``."""
    if is_blank(value):
        return None
    match = re.search(r"-?\d+", value.replace(",", ""))
    return int(match.group()) if match else None


def parse_units(value: str | None) -> float | None:
    """Units as a float; ranges like ``1-3`` yield the low end."""
    if is_blank(value):
        return None
    match = re.search(r"\d+(?:\.\d+)?", value)
    return float(match.group()) if match else None


def parse_days(value: str | None) -> tuple[str, ...]:
    """Parse a day string into ordered two-letter codes.

    Handles ``MW``, ``TuTh``, ``TTh``, ``MoWeFr``, ``M/W/F`` and full names.
    """
    if is_blank(value):
        return ()

    text = value.strip().lower()
    found: list[str] = []

    # Full weekday names first -- "Tuesday" must not tokenize as Tu+e+s...
    for name, code in _DAY_NAMES.items():
        if name in text:
            found.append(code)
            text = text.replace(name, " ")

    index = 0
    while index < len(text):
        char = text[index]
        if not char.isalpha():
            index += 1
            continue
        pair = text[index : index + 2]
        if pair in _DAY_TOKENS_2:
            found.append(_DAY_TOKENS_2[pair])
            index += 2
        elif char in _DAY_TOKENS_1:
            found.append(_DAY_TOKENS_1[char])
            index += 1
        else:
            index += 1

    unique = sorted(set(found), key=lambda d: _DAY_ORDER[d])
    return tuple(unique)


def parse_time(value: str | None, *, assume_pm_before: int = 7) -> time | None:
    """Parse a single clock time.

    Accepts ``7:00PM``, ``7 pm``, ``19:00`` and ``7:00``. Without a meridiem,
    an hour below ``assume_pm_before`` is read as PM -- classes do not start
    at 4am, and CSUN evening sections are commonly written bare.
    """
    if is_blank(value):
        return None
    match = _TIME_RE.search(value.strip())
    if not match:
        return None

    hour = int(match.group("hour"))
    minute = int(match.group("minute") or 0)
    meridiem = (match.group("meridiem") or "").replace(".", "").replace(" ", "").lower()

    if hour > 23 or minute > 59:
        return None

    if meridiem.startswith("p") and hour != 12:
        hour += 12
    elif meridiem.startswith("a") and hour == 12:
        hour = 0
    elif not meridiem and hour < assume_pm_before:
        hour += 12

    return time(hour % 24, minute)


def parse_time_range(value: str | None) -> tuple[time | None, time | None]:
    """Split ``"7:00PM - 8:15PM"`` into start and end times.

    A meridiem on only the end time is applied to the start as well, so
    ``"1:00 - 2:15 PM"`` reads as 13:00-14:15 rather than 13:00 and 14:15
    arrived at by different routes.
    """
    if is_blank(value):
        return None, None

    parts = _RANGE_SPLIT_RE.split(value.strip(), maxsplit=1)
    if len(parts) != 2:
        return parse_time(value), None

    head, tail = parts
    end = parse_time(tail)

    if end is not None and not re.search(r"[ap]\.?\s?m", head, re.IGNORECASE):
        # Borrow the end's meridiem: "1:00 - 2:15 PM" starts in the
        # afternoon. Only if that keeps the range pointing forwards --
        # "11:00 - 12:15PM" must not become 23:00-12:15.
        borrowed = parse_time(f"{head} {'PM' if end.hour >= 12 else 'AM'}")
        if borrowed is not None and borrowed <= end:
            return borrowed, end

    return parse_time(head), end


def parse_meeting(value: str | None, location: str | None = None) -> Meeting | None:
    """Parse a combined pattern like ``"TuTh 7:00PM-8:15PM"``.

    Returns ``None`` only when the text carries no schedule information at
    all; an online section with a location but no time still yields a
    :class:`Meeting` so the location survives.
    """
    text = clean(value)
    location = clean(location)
    if text is None and location is None:
        return None
    if text is None:
        return Meeting(location=location)

    # Everything from the first digit onward is the time range; what precedes
    # it is the day pattern. Guards against day letters inside "AM"/"PM".
    match = re.search(r"\d", text)
    day_part, time_part = (text[: match.start()], text[match.start() :]) if match else (text, "")

    days = parse_days(day_part)
    start, end = parse_time_range(time_part)

    if not days and start is None:
        return Meeting(location=location or text)
    return Meeting(days=days, start=start, end=end, location=location)


def parse_instructors(value: str | None) -> tuple[str, ...]:
    """Split an instructor cell into names.

    Commas are *not* separators: schedules write names as ``Rivera, A.``,
    so splitting on them would tear each name in half. Multiple instructors
    are separated by semicolons, slashes, newlines or " and ".
    """
    if value is None or not value.strip():
        return ()

    text = clean(value)
    if text is None or text.lower() in {"staff", "instructor"}:
        # "TBA" cleans to None but still means a real, unnamed instructor.
        return ("Staff",)
    parts = re.split(r"\s*[;/\n]\s*|\s+and\s+", text)
    return tuple(p.strip() for p in parts if p.strip())


def parse_course_id(value: str | None) -> tuple[str | None, str | None]:
    """Split ``"COMP 586"`` / ``"COMP586"`` into subject and catalog number."""
    text = clean(value)
    if text is None:
        return None, None
    match = re.search(r"\b([A-Za-z]{2,5})\s*[-_ ]?\s*(\d{1,3}[A-Za-z]{0,3})\b", text)
    if not match:
        return None, None
    return match.group(1).upper(), match.group(2).upper()
