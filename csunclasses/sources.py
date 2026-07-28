"""Where the HTML comes from.

Three sources share one interface so the parser never cares how a page was
obtained:

``HtmlFileSource``
    Parse a page saved from the browser. Always works, needs no network,
    and is what the tests run against.
``UrlSource``
    Fetch one exact URL -- paste the address bar after running a search.
``ClassSearchSource``
    Build the search request itself from an :class:`EndpointConfig`.

The default endpoint config is a starting point, not a verified contract:
CSUN's Class Search sits behind a WAF that rejects non-browser clients, so
the query parameter names below could not be confirmed against the live
site. They live in JSON precisely so they can be corrected without a code
change -- see ``csun-classes probe`` and the README.
"""

from __future__ import annotations

import json
import time as _time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlencode

import requests

from .models import SearchQuery

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)
DEFAULT_TIMEOUT = 30
DEFAULT_RETRIES = 3


class FetchError(RuntimeError):
    """Raised when a page could not be retrieved."""


class Source(Protocol):
    """Anything that can hand back a results page for a query."""

    def fetch(self, query: SearchQuery) -> str: ...

    @property
    def origin(self) -> str | None:
        """Where the HTML came from, for provenance in the output."""


@dataclass
class EndpointConfig:
    """How to turn a :class:`SearchQuery` into an HTTP request.

    ``params`` maps our field names onto the site's parameter names. Drop a
    key to stop sending that field.
    """

    base_url: str = "https://www.csun.edu/class-search/"
    method: str = "GET"
    params: dict[str, str] = field(
        default_factory=lambda: {
            "term": "term",
            "subject": "subject",
            "catalog_number": "catalog_nbr",
            "class_number": "class_nbr",
            "open_only": "open_only",
            "session": "session",
        }
    )
    static_params: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    term_format: str = "code"  # "code" -> 2267, "name" -> Fall 2026, "slug" -> fall-2026
    open_only_value: str = "Y"
    verified: bool = False

    @classmethod
    def load(cls, path: str | Path) -> "EndpointConfig":
        data = json.loads(Path(path).read_text())
        known = {f for f in cls.__dataclass_fields__}
        unknown = set(data) - known
        if unknown:
            raise ValueError(f"unknown endpoint config keys: {', '.join(sorted(unknown))}")
        return cls(**data)

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(asdict(self), indent=2) + "\n")

    def build(self, query: SearchQuery) -> tuple[str, dict[str, str]]:
        """Return ``(url, params)`` for this query."""
        term_value = {
            "code": query.term.code,
            "name": query.term.name,
            "slug": query.term.slug,
        }[self.term_format]

        values: dict[str, Any] = {
            "term": term_value,
            "subject": query.subject,
            "catalog_number": query.catalog_number,
            "class_number": query.class_number,
            "session": query.session,
            "open_only": self.open_only_value if query.open_only else None,
        }

        params = dict(self.static_params)
        for our_name, their_name in self.params.items():
            value = values.get(our_name)
            if value not in (None, ""):
                params[their_name] = str(value)
        return self.base_url, params

    def preview(self, query: SearchQuery) -> str:
        url, params = self.build(query)
        return f"{url}?{urlencode(params)}" if params else url


def build_session(headers: dict[str, str] | None = None) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    if headers:
        session.headers.update(headers)
    return session


def _get(
    session: requests.Session,
    method: str,
    url: str,
    *,
    params: dict[str, str] | None = None,
    timeout: int = DEFAULT_TIMEOUT,
    retries: int = DEFAULT_RETRIES,
) -> str:
    """Request with backoff on transport errors and 5xx."""
    last: Exception | None = None
    for attempt in range(retries):
        try:
            kwargs = {"params": params} if method.upper() == "GET" else {"data": params}
            response = session.request(method.upper(), url, timeout=timeout, **kwargs)
            if response.status_code >= 500:
                raise FetchError(f"{response.status_code} from {response.url}")
            if response.status_code == 403:
                raise FetchError(
                    f"403 Forbidden from {response.url} -- Class Search blocks non-browser "
                    "clients from some networks. Save the page from your browser and use "
                    "--html instead."
                )
            response.raise_for_status()
            return response.text
        except (requests.RequestException, FetchError) as exc:
            last = exc
            if attempt < retries - 1:
                _time.sleep(2**attempt)
    raise FetchError(f"could not fetch {url}: {last}") from last


@dataclass
class HtmlFileSource:
    """Parse a page saved from the browser (``File > Save Page As``)."""

    path: str | Path

    def fetch(self, query: SearchQuery) -> str:  # noqa: ARG002 - query unused by design
        path = Path(self.path)
        if not path.exists():
            raise FetchError(f"no such file: {path}")
        return path.read_text(errors="replace")

    @property
    def origin(self) -> str | None:
        return str(self.path)


@dataclass
class UrlSource:
    """Fetch one exact URL, e.g. a search result you already ran."""

    url: str
    session: requests.Session | None = None
    timeout: int = DEFAULT_TIMEOUT

    def fetch(self, query: SearchQuery) -> str:  # noqa: ARG002
        session = self.session or build_session()
        return _get(session, "GET", self.url, timeout=self.timeout)

    @property
    def origin(self) -> str | None:
        return self.url


@dataclass
class ClassSearchSource:
    """Run the search against CSUN using an :class:`EndpointConfig`."""

    config: EndpointConfig = field(default_factory=EndpointConfig)
    session: requests.Session | None = None
    timeout: int = DEFAULT_TIMEOUT
    _last_url: str | None = field(default=None, init=False, repr=False)

    def fetch(self, query: SearchQuery) -> str:
        session = self.session or build_session(self.config.headers)
        url, params = self.config.build(query)
        self._last_url = self.config.preview(query)
        return _get(session, self.config.method, url, params=params, timeout=self.timeout)

    @property
    def origin(self) -> str | None:
        return self._last_url or self.config.base_url
