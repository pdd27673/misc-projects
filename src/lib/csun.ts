/**
 * Talking to CSUN.
 *
 * The parameter names below could not be confirmed against the live site
 * (it was unreachable from the sandbox this was built in), so every one of
 * them is overridable through Pages environment variables. Correcting a
 * wrong guess is a dashboard edit, not a redeploy:
 *
 *   CSUN_SEARCH_URL   https://www.csun.edu/class-search/
 *   CSUN_PARAM_TERM   term
 *   CSUN_PARAM_SUBJECT      subject
 *   CSUN_PARAM_CATALOG      catalog_nbr
 *   CSUN_PARAM_CLASS_NUMBER class_nbr
 *   CSUN_PARAM_OPEN_ONLY    open_only
 *   CSUN_TERM_FORMAT        code | name | slug
 */

import { termCode, termName, type Term } from './terms';

export interface CsunEnv {
  CSUN_SEARCH_URL?: string;
  CSUN_PARAM_TERM?: string;
  CSUN_PARAM_SUBJECT?: string;
  CSUN_PARAM_CATALOG?: string;
  CSUN_PARAM_CLASS_NUMBER?: string;
  CSUN_PARAM_OPEN_ONLY?: string;
  CSUN_OPEN_ONLY_VALUE?: string;
  CSUN_TERM_FORMAT?: string;
}

export interface Query {
  term: Term;
  subject: string | null;
  catalogNumber: string | null;
  classNumber: string | null;
  openOnly: boolean;
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export function buildSearchUrl(query: Query, env: CsunEnv = {}): string {
  const url = new URL(env.CSUN_SEARCH_URL ?? 'https://www.csun.edu/class-search/');

  const format = env.CSUN_TERM_FORMAT ?? 'code';
  const termValue =
    format === 'name' ? termName(query.term)
    : format === 'slug' ? `${query.term.season}-${query.term.year}`
    : termCode(query.term);

  const params: Array<[string | undefined, string | null]> = [
    [env.CSUN_PARAM_TERM ?? 'term', termValue],
    [env.CSUN_PARAM_SUBJECT ?? 'subject', query.subject],
    [env.CSUN_PARAM_CATALOG ?? 'catalog_nbr', query.catalogNumber],
    [env.CSUN_PARAM_CLASS_NUMBER ?? 'class_nbr', query.classNumber],
    [env.CSUN_PARAM_OPEN_ONLY ?? 'open_only', query.openOnly ? (env.CSUN_OPEN_ONLY_VALUE ?? 'Y') : null],
  ];

  for (const [name, value] of params) {
    if (name && value) url.searchParams.set(name, value);
  }
  return url.toString();
}

export interface FetchOutcome {
  html: string | null;
  url: string;
  error: string | null;
}

/**
 * Fetch a search page. Never throws -- the caller turns a failure into a
 * visible notice rather than a blank screen.
 */
export async function fetchSearchPage(query: Query, env: CsunEnv = {}): Promise<FetchOutcome> {
  const url = buildSearchUrl(query, env);
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
    if (!response.ok) {
      return { html: null, url, error: `CSUN returned HTTP ${response.status}` };
    }
    return { html: await response.text(), url, error: null };
  } catch (error) {
    return { html: null, url, error: error instanceof Error ? error.message : String(error) };
  }
}
