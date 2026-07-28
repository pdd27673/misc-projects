"""The one call most callers want: a course in, availability out."""

from __future__ import annotations

from datetime import date

from .models import SearchQuery, SearchResult, Section
from .parse import parse_sections
from .sources import ClassSearchSource, Source
from .terms import Term, next_term


def search(
    subject: str | None = None,
    catalog_number: str | None = None,
    *,
    class_number: str | None = None,
    term: Term | str | None = None,
    open_only: bool = False,
    session: str | None = None,
    source: Source | None = None,
    today: date | None = None,
) -> SearchResult:
    """Look up sections and their availability.

    ``term`` accepts a :class:`~csunclasses.terms.Term`, a name (``"Fall
    2026"``) or a code (``"2267"``); omit it to use the next term.

    >>> search("COMP", "586", source=HtmlFileSource("saved.html")).open_sections
    """
    resolved = _resolve_term(term, today)
    query = SearchQuery(
        term=resolved,
        subject=subject,
        catalog_number=catalog_number,
        class_number=class_number,
        open_only=open_only,
        session=session,
    )
    return search_query(query, source=source)


def search_query(query: SearchQuery, *, source: Source | None = None) -> SearchResult:
    """Run a prepared :class:`SearchQuery`."""
    source = source or ClassSearchSource()
    html = source.fetch(query)
    sections = parse_sections(html, term=query.term, source_url=source.origin)
    return SearchResult(query=query, sections=[s for s in sections if query.matches(s)])


def parse_saved(
    html: str,
    *,
    term: Term | str | None = None,
    today: date | None = None,
) -> list[Section]:
    """Parse a page you already have, with no filtering applied."""
    return parse_sections(html, term=_resolve_term(term, today))


def _resolve_term(term: Term | str | None, today: date | None) -> Term:
    if isinstance(term, Term):
        return term
    if term:
        return Term.parse(term)
    return next_term(today)
