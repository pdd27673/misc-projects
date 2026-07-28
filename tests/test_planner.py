from datetime import time
from pathlib import Path

import pytest

from csunclasses import Term, parse_sections
from csunclasses.models import Meeting, Section, Status
from csunclasses.normalize import parse_days
from csunclasses.planner import Preferences, conflicts, group_by_course, plan

FIXTURES = Path(__file__).parent / "fixtures"
TERM = Term(2026, "fall")


@pytest.fixture
def sections():
    return parse_sections((FIXTURES / "class_search_table.html").read_text(), term=TERM)


def make(course, days, start, end, status=Status.OPEN, units=3.0):
    subject, catalog = course.split()
    return Section(
        subject=subject,
        catalog_number=catalog,
        status=status,
        units=units,
        meetings=(Meeting(days=parse_days(days), start=start, end=end),),
    )


def test_meetings_overlap_only_on_shared_days():
    monday = Meeting(("Mo",), time(9, 0), time(10, 0))
    tuesday = Meeting(("Tu",), time(9, 0), time(10, 0))
    later = Meeting(("Mo",), time(9, 30), time(10, 30))
    assert not monday.overlaps(tuesday)
    assert monday.overlaps(later)


def test_back_to_back_classes_do_not_conflict():
    first = Meeting(("Mo",), time(9, 0), time(10, 0))
    second = Meeting(("Mo",), time(10, 0), time(11, 0))
    assert not first.overlaps(second)


def test_async_sections_never_conflict():
    online = Meeting(location="Online")
    in_person = Meeting(("Mo",), time(9, 0), time(10, 0))
    assert not online.overlaps(in_person)


def test_conflicts_lists_colliding_pairs():
    a = make("COMP 586", "MoWe", time(9, 0), time(10, 15))
    b = make("COMP 620", "MoWe", time(10, 0), time(11, 15))
    c = make("MATH 150A", "TuTh", time(9, 0), time(10, 15))
    assert conflicts([a, b, c]) == [(a, b)]
    assert conflicts([a, c]) == []


def test_group_by_course(sections):
    grouped = group_by_course(sections)
    assert sorted(grouped) == ["COMP 586", "COMP 620"]
    assert len(grouped["COMP 586"]) == 3


def test_plan_avoids_the_tuesday_thursday_clash(sections):
    """COMP 586-01 and COMP 620-01 are both TuTh 7:00-8:15, so every valid
    schedule must pair them differently."""
    result = plan(sections, ["COMP 586", "COMP 620"])
    assert result.schedules
    for schedule in result.schedules:
        assert not conflicts(schedule.sections)
    pairs = {tuple(s.class_number for s in sch.sections) for sch in result.schedules}
    assert ("12345", "13001") not in pairs


def test_plan_accepts_loose_course_spellings(sections):
    result = plan(sections, ["comp586", "COMP-620"])
    assert result.schedules


def test_plan_reports_courses_it_cannot_place(sections):
    result = plan(sections, ["COMP 586", "ART 101"])
    assert result.schedules == []
    assert "ART 101" in result.unplaceable
    assert not result.ok


def test_open_only_is_the_default(sections):
    result = plan(sections, ["COMP 586"])
    chosen = {s.class_number for sch in result.schedules for s in sch.sections}
    assert "12346" not in chosen  # closed


def test_include_closed_widens_the_pool(sections):
    result = plan(sections, ["COMP 586"], preferences=Preferences(open_only=False))
    chosen = {s.class_number for sch in result.schedules for s in sch.sections}
    assert "12346" in chosen


def test_waitlist_can_be_excluded(sections):
    strict = plan(sections, ["COMP 586"], preferences=Preferences(allow_waitlist=False))
    chosen = {s.class_number for sch in strict.schedules for s in sch.sections}
    assert "12347" not in chosen


def test_time_window_filters_sections(sections):
    result = plan(sections, ["COMP 586"], preferences=Preferences(latest=time(18, 0)))
    # Only the async section survives a 6pm cutoff.
    chosen = {s.class_number for sch in result.schedules for s in sch.sections}
    assert chosen == {"12347"}


def test_days_off_are_respected(sections):
    result = plan(sections, ["COMP 620"], preferences=Preferences(days_off=("Tu", "Th")))
    chosen = {s.class_number for sch in result.schedules for s in sch.sections}
    assert chosen == {"13002"}  # the MW section


def test_impossible_constraints_explain_themselves(sections):
    result = plan(sections, ["COMP 620"], preferences=Preferences(days_off=("Mo", "Tu", "We", "Th")))
    assert result.schedules == []
    assert "ruled out by filters" in result.unplaceable["COMP 620"]


def test_max_units_caps_a_schedule(sections):
    result = plan(sections, ["COMP 586", "COMP 620"], preferences=Preferences(max_units=3))
    assert result.schedules == []


def test_schedules_prefer_fewer_days_on_campus():
    monday_only = make("COMP 586", "Mo", time(9, 0), time(10, 15))
    spread = make("COMP 586", "MoWeFr", time(9, 0), time(9, 50))
    result = plan([monday_only, spread], ["COMP 586"])
    assert result.schedules[0].sections[0].meetings[0].days == ("Mo",)


def test_schedule_summary_fields(sections):
    result = plan(sections, ["COMP 620"])
    schedule = result.schedules[0]
    assert schedule.units == 3.0
    assert schedule.days_used in (("Mo", "We"), ("Tu", "Th"))
    assert schedule.earliest_start is not None
    assert schedule.to_dict()["sections"][0]["course"] == "COMP 620"


def test_limit_caps_results(sections):
    result = plan(sections, ["COMP 586", "COMP 620"], max_schedules=1)
    assert len(result.schedules) == 1
