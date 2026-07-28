"""CSUN / CSU PeopleSoft term codes and "which term is next" resolution.

PeopleSoft encodes a term as four digits: ``C YY T``

* ``C``  century marker -- 1 for the 1900s, 2 for the 2000s
* ``YY`` two-digit year
* ``T``  season digit -- 1 Winter, 3 Spring, 5 Summer, 7 Fall

So Spring 2015 is ``2153`` and Fall 2026 is ``2267``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

SEASON_DIGITS = {"winter": 1, "spring": 3, "summer": 5, "fall": 7}
DIGIT_SEASONS = {digit: season for season, digit in SEASON_DIGITS.items()}

# Approximate first day of instruction, as (month, day). Used only to decide
# which term counts as "next" -- a week either way does not change the answer.
SEASON_START = {
    "winter": (1, 2),
    "spring": (1, 20),
    "summer": (5, 26),
    "fall": (8, 20),
}

# Terms a student normally plans around. Summer and winter are opt-in because
# they are short intersessions, not part of the regular progression.
MAJOR_SEASONS = ("spring", "fall")


class TermError(ValueError):
    """Raised for a term string or code that cannot be understood."""


@dataclass(frozen=True)
class Term:
    """A single academic term, e.g. Fall 2026.

    Ordering is chronological. It has to be spelled out: the default
    dataclass ordering would compare seasons alphabetically and put Fall
    ahead of Spring.
    """

    year: int
    season: str

    def __post_init__(self) -> None:
        if self.season not in SEASON_DIGITS:
            raise TermError(f"unknown season {self.season!r}")
        if not 1900 <= self.year <= 2099:
            raise TermError(f"year {self.year} outside supported range")

    @property
    def code(self) -> str:
        """The four-digit PeopleSoft term code."""
        century = self.year // 100 - 18
        return f"{century}{self.year % 100:02d}{SEASON_DIGITS[self.season]}"

    @property
    def name(self) -> str:
        """Human-readable name, e.g. ``Fall 2026``."""
        return f"{self.season.capitalize()} {self.year}"

    @property
    def slug(self) -> str:
        """URL-friendly name, e.g. ``fall-2026``."""
        return f"{self.season}-{self.year}"

    @property
    def starts_on(self) -> date:
        month, day = SEASON_START[self.season]
        return date(self.year, month, day)

    @property
    def _order_key(self) -> tuple[int, int]:
        return (self.year, SEASON_DIGITS[self.season])

    def __lt__(self, other: "Term") -> bool:
        if not isinstance(other, Term):
            return NotImplemented
        return self._order_key < other._order_key

    def __le__(self, other: "Term") -> bool:
        if not isinstance(other, Term):
            return NotImplemented
        return self._order_key <= other._order_key

    def __gt__(self, other: "Term") -> bool:
        if not isinstance(other, Term):
            return NotImplemented
        return self._order_key > other._order_key

    def __ge__(self, other: "Term") -> bool:
        if not isinstance(other, Term):
            return NotImplemented
        return self._order_key >= other._order_key

    def __str__(self) -> str:
        return self.name

    @classmethod
    def from_code(cls, code: str) -> "Term":
        """Parse a four-digit PeopleSoft term code."""
        code = code.strip()
        if not re.fullmatch(r"[12]\d{3}", code):
            raise TermError(f"{code!r} is not a four-digit term code")
        century, yy, digit = int(code[0]), int(code[1:3]), int(code[3])
        if digit not in DIGIT_SEASONS:
            raise TermError(f"{code!r} has no valid season digit ({digit})")
        return cls(year=1800 + century * 100 + yy, season=DIGIT_SEASONS[digit])

    @classmethod
    def parse(cls, value: str) -> "Term":
        """Parse a term code (``2267``) or a name (``Fall 2026``, ``fall-2026``)."""
        value = value.strip()
        if re.fullmatch(r"[12]\d{3}", value):
            return cls.from_code(value)

        match = re.fullmatch(
            r"(winter|spring|summer|fall)\s*[-_ ]?\s*(\d{4})|(\d{4})\s*[-_ ]?\s*(winter|spring|summer|fall)",
            value.strip().lower(),
        )
        if not match:
            raise TermError(
                f"cannot parse term {value!r}; expected e.g. 'Fall 2026', 'fall-2026' or '2267'"
            )
        season = match.group(1) or match.group(4)
        year = int(match.group(2) or match.group(3))
        return cls(year=year, season=season)


def next_term(today: date | None = None, *, include_minor: bool = False) -> Term:
    """The next term a student would register for, as of ``today``.

    By default only Spring and Fall are considered. A term counts as "next"
    until the day instruction begins; once it starts, the following one wins.

    >>> next_term(date(2026, 7, 28))
    Term(year=2026, season='fall')
    """
    today = today or date.today()
    seasons = tuple(SEASON_DIGITS) if include_minor else MAJOR_SEASONS

    candidates = sorted(
        Term(year, season)
        for year in (today.year, today.year + 1)
        for season in seasons
    )
    for term in candidates:
        if term.starts_on > today:
            return term
    # Only reachable if today is past every candidate start, which cannot
    # happen while the window spans two full years.
    raise TermError(f"no upcoming term found after {today}")


def upcoming_terms(count: int = 4, today: date | None = None, *, include_minor: bool = False) -> list[Term]:
    """The next ``count`` terms in order, starting with :func:`next_term`."""
    today = today or date.today()
    seasons = tuple(SEASON_DIGITS) if include_minor else MAJOR_SEASONS
    horizon_years = range(today.year, today.year + count // len(seasons) + 3)

    terms = sorted(Term(year, season) for year in horizon_years for season in seasons)
    return [term for term in terms if term.starts_on > today][:count]
