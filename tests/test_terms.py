from datetime import date

import pytest

from csunclasses.terms import Term, TermError, next_term, upcoming_terms


def test_spring_2015_is_2153():
    """The one term code confirmed against CSUN's published API URLs."""
    assert Term(2015, "spring").code == "2153"
    assert Term.from_code("2153") == Term(2015, "spring")


@pytest.mark.parametrize(
    "year, season, code",
    [
        (2026, "fall", "2267"),
        (2026, "spring", "2263"),
        (2026, "summer", "2265"),
        (2027, "winter", "2271"),
        (1999, "spring", "1993"),
    ],
)
def test_term_codes_round_trip(year, season, code):
    term = Term(year, season)
    assert term.code == code
    assert Term.from_code(code) == term


@pytest.mark.parametrize(
    "text",
    ["Fall 2026", "fall-2026", "FALL_2026", "2026 fall", "2267", " Fall  2026 "],
)
def test_parse_accepts_names_and_codes(text):
    assert Term.parse(text) == Term(2026, "fall")


@pytest.mark.parametrize("bad", ["", "Fall", "20267", "2264", "autumn 2026"])
def test_parse_rejects_junk(bad):
    with pytest.raises(TermError):
        Term.parse(bad)


def test_next_term_on_the_day_the_project_started():
    """As of 28 July 2026 the next term is Fall 2026 -- the driving example."""
    assert next_term(date(2026, 7, 28)) == Term(2026, "fall")
    assert next_term(date(2026, 7, 28)).code == "2267"


@pytest.mark.parametrize(
    "today, expected",
    [
        (date(2026, 1, 5), Term(2026, "spring")),   # before spring starts
        (date(2026, 3, 1), Term(2026, "fall")),     # spring underway
        (date(2026, 7, 28), Term(2026, "fall")),
        (date(2026, 8, 19), Term(2026, "fall")),    # day before instruction
        (date(2026, 8, 21), Term(2027, "spring")),  # fall underway
        (date(2026, 12, 15), Term(2027, "spring")),
    ],
)
def test_next_term_boundaries(today, expected):
    assert next_term(today) == expected


def test_next_term_can_include_summer_and_winter():
    assert next_term(date(2026, 3, 1), include_minor=True) == Term(2026, "summer")


def test_upcoming_terms_are_ordered_and_future():
    terms = upcoming_terms(4, date(2026, 7, 28))
    assert [t.name for t in terms] == ["Fall 2026", "Spring 2027", "Fall 2027", "Spring 2028"]
    assert terms == sorted(terms)


def test_display_helpers():
    term = Term(2026, "fall")
    assert term.name == "Fall 2026"
    assert term.slug == "fall-2026"
    assert str(term) == "Fall 2026"
