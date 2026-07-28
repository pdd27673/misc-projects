"""csunclasses -- CSUN class availability and meeting times.

    >>> from csunclasses import search, next_term
    >>> next_term()                      # as of July 2026
    Term(year=2026, season='fall')
    >>> result = search("COMP", "586")   # defaults to the next term
    >>> [(s.class_number, s.status.value, s.seats_available) for s in result.sections]
"""

from .models import Meeting, SearchQuery, SearchResult, Section, Status
from .parse import describe_tables, parse_sections
from .planner import PlanResult, Preferences, Schedule, conflicts, plan
from .search import parse_saved, search, search_query
from .sources import (
    ClassSearchSource,
    EndpointConfig,
    FetchError,
    HtmlFileSource,
    Source,
    UrlSource,
)
from .terms import Term, TermError, next_term, upcoming_terms

__version__ = "0.1.0"

__all__ = [
    "ClassSearchSource",
    "EndpointConfig",
    "FetchError",
    "HtmlFileSource",
    "Meeting",
    "PlanResult",
    "Preferences",
    "Schedule",
    "SearchQuery",
    "SearchResult",
    "Section",
    "Source",
    "Status",
    "Term",
    "TermError",
    "UrlSource",
    "conflicts",
    "describe_tables",
    "next_term",
    "parse_saved",
    "parse_sections",
    "plan",
    "search",
    "search_query",
    "upcoming_terms",
    "__version__",
]
