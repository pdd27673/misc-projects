# CSUN Class Finder

Look up a CSUN class and get back its **availability and meeting times** — then
use those sections to build a **conflict-free schedule** for next semester.

As of 28 July 2026, "next semester" resolves to **Fall 2026** (PeopleSoft term
code `2267`), which is what every command defaults to.

Two front ends over one idea:

- a **web app** on Cloudflare Pages — search, seat counts, and a week-grid
  schedule builder
- a **Python CLI** (`csun-classes`) — the original proof of concept, still the
  fastest way to script against it

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

## One caveat, stated plainly

The parser and planner are verified against fixtures — 118 Python tests and 95
TypeScript tests, the two run against **the same fixture files** so the
implementations are held to identical results.

The *network* layer is not verified. `csun.edu` was unreachable from the
sandbox this was built in, so the search endpoint's parameter names could not
be confirmed against the live site. Everything downstream of "here is the HTML"
is tested; the query string that produces that HTML is an informed guess.

So it is kept adjustable rather than hardcoded:

- the web app reads it from `CSUN_*` environment variables — a Pages dashboard
  edit, no redeploy
- the CLI reads it from a JSON file, or skips it entirely with `--url` / `--html`
- when the fetch fails, the web app says so and falls back to clearly-labelled
  sample data instead of showing a blank page

## The web app

```bash
npm install
npm run build          # bundles the client into public/app.js
npx wrangler pages dev public
```

Deployed on Cloudflare Pages: build command `npm run build`, output directory
`public`. `functions/` is picked up automatically, so `/api/classes` is served
by `functions/api/classes.ts`.

Searching runs server-side in the Pages Function for two reasons: the browser
cannot call `csun.edu` directly (no CORS headers), and Cloudflare's egress
reaches the site over a normal network path. Schedule building runs in the
browser over sections already loaded, so changing a preference is instant.

### API

```
GET  /api/classes?q=COMP%20586&term=2267[&openOnly=1]
GET  /api/classes?subject=COMP&course=586
GET  /api/classes?classNumber=12345
POST /api/classes            # body: HTML of a page you saved yourself
```

```json
{
  "term": "Fall 2026",
  "termCode": "2267",
  "sectionCount": 3,
  "openCount": 2,
  "sections": [
    {
      "course": "COMP 586",
      "classNumber": "12345",
      "section": "01",
      "status": "open",
      "seatsAvailable": 8,
      "seatsCapacity": 30,
      "meetings": [
        {"days": ["Tu", "Th"], "start": 1140, "end": 1215,
         "location": "JD 1600", "text": "TuTh 7:00PM-8:15PM @ JD 1600"}
      ]
    }
  ]
}
```

Meeting times are minutes past midnight, so overlap checks are plain
arithmetic.

### If CSUN changes its query string

Set these in Pages ▸ Settings ▸ Environment variables:

| Variable | Default |
|----------|---------|
| `CSUN_SEARCH_URL` | `https://www.csun.edu/class-search/` |
| `CSUN_PARAM_TERM` | `term` |
| `CSUN_PARAM_SUBJECT` | `subject` |
| `CSUN_PARAM_CATALOG` | `catalog_nbr` |
| `CSUN_PARAM_CLASS_NUMBER` | `class_nbr` |
| `CSUN_PARAM_OPEN_ONLY` | `open_only` |
| `CSUN_TERM_FORMAT` | `code` (or `name`, `slug`) |

## The CLI

### Install

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

The parsing, term and planning logic exists twice — Python for the CLI,
TypeScript for the web app — because a Pages Function cannot run Python. The
two are kept honest by sharing `tests/fixtures/`.

| Path | What it does |
|------|--------------|
| `csunclasses/terms.py` · `src/lib/terms.ts` | Term codes and "which semester is next" |
| `csunclasses/models.py` · `src/lib/types.ts` | `Section`, `Meeting`, `Status`, JSON shape |
| `csunclasses/normalize.py` · `src/lib/normalize.ts` | `"TuTh 7:00PM-8:15PM"` → days + times |
| `csunclasses/parse.py` · `src/lib/parse.ts` | Heading-driven extraction from HTML |
| `csunclasses/planner.py` · `src/lib/planner.ts` | Conflict detection and schedule building |
| `csunclasses/sources.py` · `src/lib/csun.ts` | Where the HTML comes from |
| `csunclasses/cli.py` | `csun-classes` |
| `src/lib/html.ts` | A small HTML parser — Workers has no DOM |
| `src/client/main.ts` | The browser app |
| `functions/api/classes.ts` | The Pages Function |

## Degree reports

The planner takes a plain list of course codes, which is the seam a degree
progress report plugs into: extract the courses a student still needs, hand
them to `plan()`, and the availability matching already works. Parsing the DPR
itself is not built yet.

## Tests

```bash
.venv/bin/python -m pytest    # 118 tests
npm test                      # 95 tests
npm run typecheck
```

Fixtures cover both layouts schedule pages use — a PeopleSoft results table
(with status drawn as an icon whose word lives in `alt=`) and a card layout of
`Label: value` pairs. Both suites read the same two files, so a divergence
between the Python and TypeScript parsers shows up as a failing test rather
than as two subtly different answers.
