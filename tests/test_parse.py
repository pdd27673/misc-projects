from datetime import time
from pathlib import Path

import pytest

from csunclasses import Status, Term, describe_tables, parse_sections
from csunclasses.models import SearchQuery
from csunclasses.search import search
from csunclasses.sources import HtmlFileSource

FIXTURES = Path(__file__).parent / "fixtures"
TERM = Term(2026, "fall")


@pytest.fixture
def table_page():
    return (FIXTURES / "class_search_table.html").read_text()


@pytest.fixture
def card_page():
    return (FIXTURES / "class_search_cards.html").read_text()


def test_parses_every_section_and_ignores_layout_tables(table_page):
    sections = parse_sections(table_page, term=TERM)
    assert len(sections) == 5
    assert {s.course for s in sections} == {"COMP 586", "COMP 620"}


def test_open_section_fields(table_page):
    section = _by_class_number(parse_sections(table_page, term=TERM), "12345")
    assert section.course == "COMP 586"
    assert section.title == "Advanced Topics in Software Engineering"
    assert section.section == "01"
    assert section.status is Status.OPEN
    assert section.seats_available == 8
    assert section.seats_capacity == 30
    assert section.waitlist_available == 10
    assert section.units == 3.0
    assert section.instruction_mode == "In Person"
    assert section.instructors == ("Rivera, A.",)
    assert section.session == "Regular"
    assert section.term is TERM


def test_status_read_from_image_alt_text(table_page):
    """PeopleSoft draws status as an icon; the word lives in alt=."""
    sections = parse_sections(table_page, term=TERM)
    assert _by_class_number(sections, "12346").status is Status.CLOSED
    assert _by_class_number(sections, "12347").status is Status.WAITLIST


def test_meeting_times(table_page):
    section = _by_class_number(parse_sections(table_page, term=TERM), "12345")
    (meeting,) = section.meetings
    assert meeting.days == ("Tu", "Th")
    assert meeting.start == time(19, 0)
    assert meeting.end == time(20, 15)
    assert meeting.location == "JD 1600"
    assert section.meeting_pattern == "TuTh 7:00PM-8:15PM @ JD 1600"


def test_async_section_has_no_fixed_time(table_page):
    section = _by_class_number(parse_sections(table_page, term=TERM), "12347")
    assert section.instruction_mode == "Online (Asynchronous)"
    assert not any(m.is_scheduled for m in section.meetings)
    assert section.meeting_pattern == "Online"


def test_split_day_and_time_columns(table_page):
    """COMP 620's table separates Days from Time; both must be picked up."""
    section = _by_class_number(parse_sections(table_page, term=TERM), "13001")
    (meeting,) = section.meetings
    assert meeting.days == ("Tu", "Th")
    assert meeting.start == time(19, 0)
    assert meeting.end == time(20, 15)


def test_alternate_heading_spellings_are_recognised(table_page):
    """'Class Nbr' and 'Seats Available' mean the same as the long forms."""
    section = _by_class_number(parse_sections(table_page, term=TERM), "13002")
    assert section.class_number == "13002"
    assert section.seats_available == 5


def test_card_layout_falls_back_to_label_parsing(card_page):
    sections = parse_sections(card_page, term=TERM)
    assert len(sections) == 2
    first = _by_class_number(sections, "20100")
    assert first.course == "MATH 150A"
    assert first.status is Status.OPEN
    assert first.seats_available == 3
    assert first.meetings[0].days == ("Mo", "We", "Fr")
    assert first.meetings[0].start == time(9, 0)
    assert first.units == 5.0


def test_card_layout_infers_afternoon_from_trailing_meridiem(card_page):
    second = _by_class_number(parse_sections(card_page, term=TERM), "20101")
    assert second.status is Status.CLOSED
    assert second.meetings[0].start == time(13, 0)
    assert second.meetings[0].end == time(14, 15)


def test_sections_are_sorted_by_course_then_section(table_page):
    sections = parse_sections(table_page, term=TERM)
    assert [s.class_number for s in sections] == ["12345", "12346", "12347", "13001", "13002"]


def test_describe_tables_reports_mapping(table_page):
    report = describe_tables(table_page)
    used = [entry for entry in report if entry["used"]]
    assert len(used) == 2
    assert used[0]["recognised"]["Regular Seats Available"] == "seats_available"
    assert not [entry for entry in report if entry["used"] and entry["unrecognised"]]
    # The nav table has no section-like columns and must be skipped.
    assert any(not entry["used"] for entry in report)


def test_search_filters_to_the_requested_course():
    source = HtmlFileSource(FIXTURES / "class_search_table.html")
    result = search("COMP", "586", term=TERM, source=source)
    assert len(result.sections) == 3
    assert {s.course for s in result.sections} == {"COMP 586"}
    assert len(result.open_sections) == 2  # open + waitlist are both enrollable


def test_search_by_class_number():
    source = HtmlFileSource(FIXTURES / "class_search_table.html")
    result = search(class_number="13001", subject="COMP", term=TERM, source=source)
    assert [s.class_number for s in result.sections] == ["13001"]


def test_search_open_only_drops_full_sections():
    source = HtmlFileSource(FIXTURES / "class_search_table.html")
    result = search("COMP", "586", term=TERM, open_only=True, source=source)
    assert [s.class_number for s in result.sections] == ["12345", "12347"]


def test_result_json_shape():
    source = HtmlFileSource(FIXTURES / "class_search_table.html")
    data = search("COMP", "586", term=TERM, source=source).to_dict()
    assert data["term"] == "Fall 2026"
    assert data["term_code"] == "2267"
    assert data["subject"] == "COMP"
    assert data["courseNumber"] == "586"
    first = data["sections"][0]
    assert first["classNumber" if "classNumber" in first else "class_number"] == "12345"
    assert first["status"] == "open"
    assert first["meetings"][0]["start"] == "19:00"
    assert first["meetings"][0]["days"] == ["Tu", "Th"]


def test_query_requires_something_to_search_for():
    with pytest.raises(ValueError):
        SearchQuery(term=TERM)


def test_empty_page_yields_nothing():
    assert parse_sections("<html><body><p>No classes found.</p></body></html>", term=TERM) == []


def _by_class_number(sections, number):
    match = [s for s in sections if s.class_number == number]
    assert match, f"no section with class number {number}"
    return match[0]
