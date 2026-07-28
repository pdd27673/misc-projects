from datetime import time

import pytest

from csunclasses.models import Status
from csunclasses.normalize import (
    clean,
    is_blank,
    parse_course_id,
    parse_days,
    parse_instructors,
    parse_int,
    parse_meeting,
    parse_status,
    parse_time,
    parse_time_range,
    parse_units,
)


@pytest.mark.parametrize(
    "text, expected",
    [
        ("MW", ("Mo", "We")),
        ("TuTh", ("Tu", "Th")),
        ("TTh", ("Tu", "Th")),
        ("MWF", ("Mo", "We", "Fr")),
        ("MoWeFr", ("Mo", "We", "Fr")),
        ("M/W/F", ("Mo", "We", "Fr")),
        ("Tuesday, Thursday", ("Tu", "Th")),
        ("Sa", ("Sa",)),
        ("TBA", ()),
        ("", ()),
    ],
)
def test_parse_days(text, expected):
    assert parse_days(text) == expected


def test_parse_days_is_ordered_and_deduped():
    assert parse_days("FMW M") == ("Mo", "We", "Fr")


@pytest.mark.parametrize(
    "text, expected",
    [
        ("7:00PM", time(19, 0)),
        ("7:00 pm", time(19, 0)),
        ("7 PM", time(19, 0)),
        ("12:00AM", time(0, 0)),
        ("12:30PM", time(12, 30)),
        ("19:00", time(19, 0)),
        ("9:00AM", time(9, 0)),
        ("TBA", None),
    ],
)
def test_parse_time(text, expected):
    assert parse_time(text) == expected


@pytest.mark.parametrize(
    "text, start, end",
    [
        ("7:00PM-8:15PM", time(19, 0), time(20, 15)),
        ("7:00 PM - 8:15 PM", time(19, 0), time(20, 15)),
        ("9:00AM – 9:50AM", time(9, 0), time(9, 50)),
        ("1:00 - 2:15 PM", time(13, 0), time(14, 15)),
        ("10:00AM to 11:15AM", time(10, 0), time(11, 15)),
        ("TBA", None, None),
    ],
)
def test_parse_time_range(text, start, end):
    assert parse_time_range(text) == (start, end)


def test_meridiem_carries_backwards_across_the_range():
    """'1:00 - 2:15 PM' is an afternoon class, not a 1am one."""
    start, end = parse_time_range("1:00 - 2:15 PM")
    assert start == time(13, 0) and end == time(14, 15)
    assert start < end


def test_parse_meeting_combined():
    meeting = parse_meeting("TuTh 7:00PM-8:15PM", "JD 1600")
    assert meeting.days == ("Tu", "Th")
    assert meeting.start == time(19, 0)
    assert meeting.end == time(20, 15)
    assert meeting.location == "JD 1600"
    assert meeting.is_scheduled
    assert str(meeting) == "TuTh 7:00PM-8:15PM @ JD 1600"


def test_parse_meeting_async_has_no_schedule():
    meeting = parse_meeting("TBA", "Online")
    assert meeting.days == ()
    assert not meeting.is_scheduled
    assert meeting.location == "Online"


@pytest.mark.parametrize(
    "text, expected",
    [
        ("Open", Status.OPEN),
        ("open", Status.OPEN),
        ("Closed", Status.CLOSED),
        ("Full", Status.CLOSED),
        ("Wait List", Status.WAITLIST),
        ("Waitlisted", Status.WAITLIST),
        ("Cancelled", Status.CANCELLED),
        ("", Status.UNKNOWN),
        ("mystery", Status.UNKNOWN),
    ],
)
def test_parse_status(text, expected):
    assert parse_status(text) is expected


def test_waitlist_beats_closed_when_both_words_appear():
    assert parse_status("Closed - Wait List Open") is Status.WAITLIST


@pytest.mark.parametrize(
    "text, expected",
    [("Seats Available: 8", 8), ("8", 8), ("0", 0), ("1,024", 1024), ("TBA", None), ("", None)],
)
def test_parse_int(text, expected):
    assert parse_int(text) == expected


@pytest.mark.parametrize("text, expected", [("3", 3.0), ("3.0", 3.0), ("1-3", 1.0), ("TBA", None)])
def test_parse_units(text, expected):
    assert parse_units(text) == expected


@pytest.mark.parametrize(
    "text, expected",
    [
        ("COMP 586", ("COMP", "586")),
        ("COMP586", ("COMP", "586")),
        ("comp-586", ("COMP", "586")),
        ("COMP 586L", ("COMP", "586L")),
        ("COMP 586 - Advanced Topics", ("COMP", "586")),
        ("nothing here", (None, None)),
    ],
)
def test_parse_course_id(text, expected):
    assert parse_course_id(text) == expected


def test_parse_instructors():
    assert parse_instructors("Rivera, A.") == ("Rivera, A.",)
    assert parse_instructors("Rivera, A.; Chen, L.") == ("Rivera, A.", "Chen, L.")
    assert parse_instructors("Staff") == ("Staff",)
    assert parse_instructors("TBA") == ("Staff",)
    assert parse_instructors(None) == ()


def test_blank_and_clean():
    assert is_blank("  TBA ") and is_blank("") and is_blank(None)
    assert not is_blank("Open")
    assert clean("  Advanced   Topics\xa0 ") == "Advanced Topics"
    assert clean("TBA") is None
