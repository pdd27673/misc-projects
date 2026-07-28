# CSUN Class Scraper

Look up a CSUN class and get back its **availability and meeting times** — then
use those sections to build a **conflict-free schedule** for next semester.

As of 28 July 2026, "next semester" resolves to **Fall 2026** (PeopleSoft term
code `2267`), which is what every command defaults to.

```
$ csun-classes find COMP 586

COMP 586 — Fall 2026 (2267)
===========================

CLASS#  SEC  STATUS    SEATS         MEETS                         MODE                   INSTRUCTOR
------  ---  --------  ------------  ----------------------------  ---------------------  ----------
COMP 586 — Advanced Topics in Software Engineering
12345   01   OPEN      8/30 (wl 10)  TuTh 7:00PM-8:15PM @ JD 1600  In Person              Rivera, A.
12346   02   closed    0/30 (wl 4)   MoWe 4:00PM-5:15PM @ JD 1620  In Person              Chen, L.
12347   03   waitlist  0/35 (wl 2)   Online                        Online (Asynchronous)  Staff

3 section(s), 2 still enrollable.
```

## Status

**Stage 1 (this commit): working proof of concept.** A Python library + CLI that
parses class-search pages into typed sections and plans schedules around them.
118 tests, all green.

**Stage 2 (next): a web version deployed on Cloudflare Pages**, following the
same pattern as the `gametime-grid-sports-epg` branch — a Pages Function does
the fetch and parse server-side, the UI renders it.

### One caveat, stated plainly

The parser and planner are verified against fixtures. The *network* layer is
not: `csun.edu` was unreachable from the sandbox this was built in, so the
search endpoint's parameter names could not be confirmed against the live site.
That is why the design puts the fetch behind a swappable `Source` and keeps the
request mapping in editable JSON rather than in code — see
[Pointing it at the live site](#pointing-it-at-the-live-site).

Everything works today against a page you save from the browser.

## Install

```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
```

## Use

### Look up a course

```bash
csun-classes find COMP 586                      # next term, all sections
csun-classes find COMP 586 --open-only          # only what you can still join
csun-classes find 12345                         # by five-digit class number
csun-classes find COMP 586 --term "Spring 2027" # or --term 2273
csun-classes find COMP 586 --json               # machine-readable
```

Any command can read a page you saved from the browser instead of fetching:

```bash
csun-classes find COMP 586 --html saved-search.html
```

`--json` emits the shape the web version will serve:

```json
{
  "term": "Fall 2026",
  "term_code": "2267",
  "subject": "COMP",
  "courseNumber": "586",
  "sectionCount": 3,
  "openCount": 2,
  "sections": [
    {
      "course": "COMP 586",
      "class_number": "12345",
      "section": "01",
      "status": "open",
      "seats_available": 8,
      "seats_capacity": 30,
      "waitlist_available": 10,
      "units": 3.0,
      "instruction_mode": "In Person",
      "instructors": ["Rivera, A."],
      "meetings": [
        {"days": ["Tu", "Th"], "start": "19:00", "end": "20:15",
         "location": "JD 1600", "text": "TuTh 7:00PM-8:15PM @ JD 1600"}
      ]
    }
  ]
}
```

### Plan a semester

Save one results page per course, then ask for timetables that fit together:

```bash
csun-classes plan COMP586 COMP620 \
    --html comp586.html --html comp620.html \
    --earliest 4:00PM --day-off Fr --max-units 9
```

It enumerates every conflict-free combination, drops anything that violates the
filters, and ranks what is left by fewest days on campus, then latest start.
Courses it cannot place are reported with the reason:

```
  ! ART 101: no sections found
  ! COMP 620: all 2 section(s) ruled out by filters (status, time window or days off)
```

### Term codes

```bash
csun-classes term                 # the next term
csun-classes term --list 4        # Fall 2026, Spring 2027, Fall 2027, Spring 2028
csun-classes term 2267            # -> Fall 2026
```

PeopleSoft encodes a term as `C YY T`: century marker, two-digit year, and a
season digit (1 winter, 3 spring, 5 summer, 7 fall). So Fall 2026 is `2267`.
The formula is pinned by a test against `2153` = Spring 2015, the one code
confirmed from CSUN's own published API URLs.

## Pointing it at the live site

Run the search in a browser once and copy what it actually does:

```bash
csun-classes probe COMP 586              # show the request that would be sent
csun-classes probe --write-config csun.json
csun-classes find COMP 586 --config csun.json
```

`csun.json` maps our field names onto the site's query parameters, so a wrong
guess is a one-line edit rather than a code change:

```json
{
  "base_url": "https://www.csun.edu/class-search/",
  "params": {"term": "term", "subject": "subject", "catalog_number": "catalog_nbr"},
  "term_format": "code"
}
```

You can also skip the mapping entirely and hand it the URL from the address bar
after a search: `csun-classes find COMP 586 --url "https://..."`.

If Class Search returns 403 to scripted requests, save the page
(File ▸ Save Page As) and use `--html`. The parser does not care where the
HTML came from.

## When a page parses to nothing

The parser keys off **column headings and field labels**, not CSS selectors, so
a PeopleSoft redesign does not silently break it. If a page yields nothing, ask
what it saw:

```bash
csun-classes probe --describe saved-search.html
```

```
table #0 — 3 data row(s), USED
    'Class Number'                  -> class_number
    'Regular Seats Available'       -> seats_available
    'Days and Times'                -> meeting
    'Enrollment Cap'                -> (unrecognised)
```

Add the unrecognised spelling to `FIELD_SYNONYMS` in `csunclasses/parse.py`.

## As a library

```python
from datetime import time
from csunclasses import search, next_term, plan, Preferences

next_term()                                   # Term(year=2026, season='fall')
result = search("COMP", "586", open_only=True)
[(s.class_number, s.seats_available) for s in result.sections]

plan(result.sections, ["COMP 586"], preferences=Preferences(latest=time(21, 0)))
```

## Layout

| Path | What it does |
|------|--------------|
| `csunclasses/terms.py` | Term codes and "which semester is next" |
| `csunclasses/models.py` | `Section`, `Meeting`, `Status`, JSON shape |
| `csunclasses/normalize.py` | `"TuTh 7:00PM-8:15PM"` → days + times |
| `csunclasses/parse.py` | Heading-driven extraction from HTML |
| `csunclasses/sources.py` | Where the HTML comes from (file, URL, search) |
| `csunclasses/planner.py` | Conflict detection and schedule building |
| `csunclasses/cli.py` | `csun-classes` |

## Degree reports

The planner takes a plain list of course codes, which is the seam a degree
progress report plugs into: extract the courses a student still needs, hand
them to `plan()`, and the availability matching already works. Parsing the DPR
itself is not built yet.

## Tests

```bash
.venv/bin/python -m pytest
```

Fixtures cover both layouts schedule pages use — a PeopleSoft results table
(with status drawn as an icon whose word lives in `alt=`) and a card layout of
`Label: value` pairs.
