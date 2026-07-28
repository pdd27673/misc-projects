"""Command line interface: ``csun-classes``."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

from .models import SearchQuery, Section, Status
from .parse import describe_tables, parse_sections
from .planner import Preferences, plan
from .search import search_query
from .sources import ClassSearchSource, EndpointConfig, FetchError, HtmlFileSource, UrlSource
from .terms import Term, TermError, next_term, upcoming_terms

STATUS_MARK = {
    Status.OPEN: "OPEN",
    Status.CLOSED: "closed",
    Status.WAITLIST: "waitlist",
    Status.CANCELLED: "cancelled",
    Status.UNKNOWN: "?",
}


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "handler", None):
        parser.print_help()
        return 2
    try:
        return args.handler(args)
    except (TermError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except FetchError as exc:
        print(f"fetch failed: {exc}", file=sys.stderr)
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="csun-classes",
        description="Look up CSUN class availability and meeting times.",
    )
    sub = parser.add_subparsers(dest="command")

    # ---- find ------------------------------------------------------------
    find = sub.add_parser("find", help="show sections, availability and times for a course")
    find.add_argument("course", nargs="*", help="e.g. COMP 586, COMP586, or a 5-digit class number")
    find.add_argument("--subject", help="subject code, e.g. COMP")
    find.add_argument("--course-number", dest="catalog_number", help="catalog number, e.g. 586")
    find.add_argument("--class-number", help="five-digit class number")
    find.add_argument("--open-only", action="store_true", help="only sections you can still join")
    find.add_argument("--session", help="e.g. Regular")
    _add_common(find)
    find.add_argument("--json", action="store_true", help="emit JSON")
    find.set_defaults(handler=cmd_find)

    # ---- plan ------------------------------------------------------------
    planner = sub.add_parser("plan", help="build conflict-free schedules from saved pages")
    planner.add_argument("courses", nargs="+", help="courses to schedule, e.g. COMP586 COMP620")
    planner.add_argument(
        "--html", action="append", default=[], metavar="FILE",
        help="saved results page (repeatable; one per course search)",
    )
    planner.add_argument("--earliest", help="no class before this time, e.g. 9:00AM")
    planner.add_argument("--latest", help="no class after this time, e.g. 9:00PM")
    planner.add_argument("--day-off", action="append", default=[], metavar="DAY",
                         help="keep a day free, e.g. Fr (repeatable)")
    planner.add_argument("--max-units", type=float)
    planner.add_argument("--include-closed", action="store_true", help="consider full sections too")
    planner.add_argument("--limit", type=int, default=10, help="how many schedules to show")
    planner.add_argument("--term", help="term name or code (default: next term)")
    planner.add_argument("--today", help="pretend today is this date (YYYY-MM-DD)")
    planner.add_argument("--json", action="store_true")
    planner.set_defaults(handler=cmd_plan)

    # ---- term ------------------------------------------------------------
    term = sub.add_parser("term", help="resolve term names and PeopleSoft codes")
    term.add_argument("value", nargs="?", help="term name or code; omit for the next term")
    term.add_argument("--list", type=int, metavar="N", help="show the next N terms")
    term.add_argument("--today", help="pretend today is this date (YYYY-MM-DD)")
    term.add_argument("--json", action="store_true")
    term.set_defaults(handler=cmd_term)

    # ---- probe -----------------------------------------------------------
    probe = sub.add_parser(
        "probe",
        help="show the request that would be sent, save a page, or inspect its tables",
    )
    probe.add_argument("course", nargs="*", help="e.g. COMP 586")
    probe.add_argument("--save", metavar="FILE", help="fetch and write the HTML here")
    probe.add_argument("--describe", metavar="FILE", help="report the tables found in a saved page")
    probe.add_argument("--write-config", metavar="FILE", help="write the default endpoint config")
    _add_common(probe)
    probe.set_defaults(handler=cmd_probe)

    return parser


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--term", help="term name or code, e.g. 'Fall 2026' or 2267 (default: next term)")
    parser.add_argument("--html", metavar="FILE", help="parse a saved page instead of fetching")
    parser.add_argument("--url", help="fetch this exact URL instead of building a search")
    parser.add_argument("--config", metavar="FILE", help="endpoint config JSON (see probe --write-config)")
    parser.add_argument("--today", help="pretend today is this date (YYYY-MM-DD)")


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------


def cmd_find(args: argparse.Namespace) -> int:
    query = _query_from_args(args)
    source = _source_from_args(args)
    result = search_query(query, source=source)

    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
        return 0

    header = f"{query.describe()} — {query.term.name} ({query.term.code})"
    print(header)
    print("=" * len(header))
    if not result.sections:
        print("\nNo sections matched.")
        print(_no_results_hint(args, source))
        return 1

    _print_sections(result.sections)
    open_count = len(result.open_sections)
    print(f"\n{len(result.sections)} section(s), {open_count} still enrollable.")
    return 0 if open_count else 1


def cmd_plan(args: argparse.Namespace) -> int:
    if not args.html:
        print("error: --html is required; save one results page per course first", file=sys.stderr)
        return 2

    term = Term.parse(args.term) if args.term else next_term(_parse_today(args.today))
    sections: list[Section] = []
    for path in args.html:
        sections.extend(parse_sections(Path(path).read_text(errors="replace"), term=term, source_url=path))

    from .normalize import parse_time

    preferences = Preferences(
        earliest=parse_time(args.earliest) if args.earliest else None,
        latest=parse_time(args.latest) if args.latest else None,
        days_off=tuple(_normalise_day(d) for d in args.day_off),
        open_only=not args.include_closed,
        max_units=args.max_units,
    )
    result = plan(sections, args.courses, preferences=preferences, max_schedules=args.limit)

    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
        return 0 if result.schedules else 1

    print(f"{term.name} ({term.code}) — {len(sections)} section(s) loaded\n")
    for course, reason in result.unplaceable.items():
        print(f"  ! {course}: {reason}")
    if result.unplaceable:
        print()
    if not result.schedules:
        print("No conflict-free schedule found.")
        return 1

    for index, schedule in enumerate(result.schedules, start=1):
        days = "/".join(schedule.days_used) or "no fixed days"
        print(f"Schedule {index} — {schedule.units:g} units, {days}")
        _print_sections(list(schedule.sections), indent="  ")
        print()
    return 0


def cmd_term(args: argparse.Namespace) -> int:
    today = _parse_today(args.today)
    if args.list:
        terms = upcoming_terms(args.list, today)
    elif args.value:
        terms = [Term.parse(args.value)]
    else:
        terms = [next_term(today)]

    if args.json:
        print(json.dumps([{"name": t.name, "code": t.code, "slug": t.slug,
                           "starts": t.starts_on.isoformat()} for t in terms], indent=2))
        return 0

    for term in terms:
        print(f"{term.name:<14} code {term.code}   slug {term.slug}   starts ~{term.starts_on}")
    return 0


def cmd_probe(args: argparse.Namespace) -> int:
    if args.write_config:
        EndpointConfig().save(args.write_config)
        print(f"wrote default endpoint config to {args.write_config}")
        print("Edit it to match the real request, then pass it with --config.")
        return 0

    if args.describe:
        report = describe_tables(Path(args.describe).read_text(errors="replace"))
        if not report:
            print("No tables found. The page may render sections as cards; the "
                  "label/value parser handles those — try `find --html` directly.")
            return 1
        for entry in report:
            print(f"\ntable #{entry['index']} — {entry['rows']} data row(s), "
                  f"{'USED' if entry['used'] else 'skipped'}")
            for heading, field_name in entry["recognised"].items():
                print(f"    {heading!r:<40} -> {field_name}")
            for heading in entry["unrecognised"]:
                print(f"    {heading!r:<40} -> (unrecognised)")
        print("\nAdd unrecognised headings to FIELD_SYNONYMS in csunclasses/parse.py.")
        return 0

    query = _query_from_args(args)
    config = EndpointConfig.load(args.config) if args.config else EndpointConfig()
    print(f"term:    {query.term.name} ({query.term.code})")
    print(f"request: {config.method} {config.preview(query)}")
    if not config.verified:
        print(
            "\nnote: these parameter names are a starting point, not confirmed against\n"
            "the live site. Run the search in a browser, copy the resulting URL, and\n"
            "either pass it with --url or record the parameters in a config file\n"
            "(probe --write-config)."
        )

    if args.save:
        source = ClassSearchSource(config=config) if not args.url else UrlSource(args.url)
        html = source.fetch(query)
        Path(args.save).write_text(html)
        print(f"\nsaved {len(html)} bytes to {args.save}")
    return 0


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _query_from_args(args: argparse.Namespace) -> SearchQuery:
    subject = args.subject
    catalog = getattr(args, "catalog_number", None)
    class_number = getattr(args, "class_number", None)

    tokens = [t for t in getattr(args, "course", []) or [] if t]
    if tokens:
        joined = " ".join(tokens)
        if joined.strip().isdigit() and len(joined.strip()) == 5:
            class_number = class_number or joined.strip()
        else:
            from .normalize import parse_course_id

            found_subject, found_catalog = parse_course_id(joined)
            subject = subject or found_subject
            catalog = catalog or found_catalog
            if not found_subject and joined.strip().isalpha():
                subject = subject or joined.strip()

    if not (subject or class_number):
        raise ValueError("say which class: e.g. `COMP 586`, `--subject COMP`, or a 5-digit class number")

    term = Term.parse(args.term) if args.term else next_term(_parse_today(args.today))
    return SearchQuery(
        term=term,
        subject=subject,
        catalog_number=catalog,
        class_number=class_number,
        open_only=getattr(args, "open_only", False),
        session=getattr(args, "session", None),
    )


def _source_from_args(args: argparse.Namespace):
    if args.html:
        return HtmlFileSource(args.html)
    if args.url:
        return UrlSource(args.url)
    config = EndpointConfig.load(args.config) if args.config else EndpointConfig()
    return ClassSearchSource(config=config)


def _print_sections(sections: list[Section], indent: str = "") -> None:
    rows = [
        (
            section.class_number or "-",
            section.section or "-",
            STATUS_MARK[section.status],
            _seats(section),
            section.meeting_pattern,
            section.instruction_mode or "",
            ", ".join(section.instructors),
        )
        for section in sections
    ]
    headers = ("CLASS#", "SEC", "STATUS", "SEATS", "MEETS", "MODE", "INSTRUCTOR")
    widths = [max(len(str(row[i])) for row in (rows + [headers])) for i in range(len(headers))]

    course_label = ""
    print()
    print(indent + "  ".join(h.ljust(w) for h, w in zip(headers, widths)).rstrip())
    print(indent + "  ".join("-" * w for w in widths))
    for section, row in zip(sections, rows):
        if section.course != course_label:
            course_label = section.course
            title = f" — {section.title}" if section.title else ""
            print(f"{indent}{course_label}{title}")
        print(indent + "  ".join(str(v).ljust(w) for v, w in zip(row, widths)).rstrip())


def _seats(section: Section) -> str:
    if section.seats_available is None:
        return "?"
    text = str(section.seats_available)
    if section.seats_capacity:
        text += f"/{section.seats_capacity}"
    if section.waitlist_available is not None:
        text += f" (wl {section.waitlist_available})"
    return text


def _no_results_hint(args: argparse.Namespace, source) -> str:
    if args.html:
        return (
            f"\nThe page parsed but nothing matched. Run:\n"
            f"  csun-classes probe --describe {args.html}\n"
            "to see which columns were recognised."
        )
    return (
        "\nIf you fetched this live, the search parameters may be wrong. Run the\n"
        "search in a browser, then either pass the URL with --url or save the page\n"
        "and use --html."
    )


def _normalise_day(value: str) -> str:
    from .normalize import parse_days

    days = parse_days(value)
    if not days:
        raise ValueError(f"unrecognised day {value!r}; use Mo Tu We Th Fr Sa Su")
    return days[0]


def _parse_today(value: str | None) -> date | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


if __name__ == "__main__":
    raise SystemExit(main())
