/**
 * GET /api/classes?term=2267&subject=COMP&course=586
 *
 * Runs the search server-side. That matters for two reasons: the browser
 * cannot call csun.edu directly (no CORS headers), and Cloudflare's egress
 * reaches the site from a normal network path.
 *
 * Also accepts `classNumber` for a single section, `openOnly=1`, and
 * `html` POST bodies for parsing a page you saved yourself.
 */

import { fetchSearchPage, type CsunEnv } from '../../src/lib/csun';
import { parseCourseId } from '../../src/lib/normalize';
import { parseSections } from '../../src/lib/parse';
import { nextTerm, parseTerm, termCode, termName } from '../../src/lib/terms';
import { sampleFor } from '../../src/lib/sample';
import { isEnrollable, type Section } from '../../src/lib/types';
import type { SearchResponse } from '../../src/lib/types';

interface Context {
  request: Request;
  env: CsunEnv;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
  'Access-Control-Allow-Origin': '*',
};

export const onRequestGet = async ({ request, env }: Context): Promise<Response> => {
  const url = new URL(request.url);
  const params = url.searchParams;

  // Accept "COMP 586" in one box, or subject/course separately.
  const combined = params.get('q');
  const [combinedSubject, combinedCatalog] = parseCourseId(combined);

  const subject = (params.get('subject') ?? combinedSubject)?.toUpperCase() ?? null;
  const catalogNumber = (params.get('course') ?? combinedCatalog)?.toUpperCase() ?? null;
  let classNumber = params.get('classNumber');
  if (!classNumber && combined && /^\d{5}$/.test(combined.trim())) classNumber = combined.trim();

  if (!subject && !classNumber) {
    return json(
      { error: 'Give a subject (e.g. COMP, optionally with a course number) or a five-digit class number.' },
      400,
    );
  }

  const termParam = params.get('term');
  const term = (termParam ? parseTerm(termParam) : null) ?? nextTerm();
  const openOnly = params.get('openOnly') === '1' || params.get('openOnly') === 'true';

  const query = { term, subject, catalogNumber, classNumber, openOnly };
  const outcome = await fetchSearchPage(query, env);

  let sections: Section[] = [];
  let sample = false;
  let notice: string | undefined;

  if (outcome.html) {
    sections = parseSections(outcome.html).filter((section) => {
      if (classNumber && section.classNumber !== classNumber) return false;
      if (subject && section.subject !== subject) return false;
      if (catalogNumber && section.catalogNumber !== catalogNumber) return false;
      return true;
    });
    if (sections.length === 0) {
      notice =
        'CSUN answered, but no sections could be read from the page. The search parameters ' +
        'or the page layout may have changed — check the CSUN_PARAM_* variables.';
    }
  } else {
    notice = `Could not reach CSUN Class Search (${outcome.error}). Showing sample data.`;
    sample = true;
    sections = sampleFor(subject, catalogNumber, classNumber);
  }

  const filtered = openOnly ? sections.filter(isEnrollable) : sections;

  const body: SearchResponse = {
    term: termName(term),
    termCode: termCode(term),
    subject,
    courseNumber: catalogNumber,
    classNumber,
    sectionCount: filtered.length,
    openCount: filtered.filter(isEnrollable).length,
    sections: filtered,
    upstream: outcome.url,
    ...(sample ? { sample: true } : {}),
    ...(notice ? { notice } : {}),
  };

  return json(body);
};

/** POST a saved page: `Content-Type: text/html`, body is the HTML. */
export const onRequestPost = async ({ request }: Context): Promise<Response> => {
  const html = await request.text();
  if (!html.trim()) return json({ error: 'POST the HTML of a saved results page as the body.' }, 400);

  const term = parseTerm(new URL(request.url).searchParams.get('term') ?? '') ?? nextTerm();
  const sections = parseSections(html);

  return json({
    term: termName(term),
    termCode: termCode(term),
    subject: null,
    courseNumber: null,
    classNumber: null,
    sectionCount: sections.length,
    openCount: sections.filter(isEnrollable).length,
    sections,
  } satisfies SearchResponse);
};

export const onRequestOptions = async (): Promise<Response> =>
  new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
