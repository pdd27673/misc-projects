/**
 * A very small HTML parser.
 *
 * The Pages Function needs to walk a whole document -- tables plus the
 * headings above them -- so streaming (`HTMLRewriter`) would be awkward, and
 * pulling in a full DOM library would be heavy for a Worker. This builds just
 * enough of a tree to run the same extraction the Python parser does, and it
 * uses no runtime-specific APIs, so it unit-tests in plain Node.
 */

export interface ElementNode {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  parent: ElementNode | null;
}

export interface TextNode {
  type: 'text';
  text: string;
}

export type Node = ElementNode | TextNode;

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Tags that an opening tag of the same kind implicitly closes. */
const AUTO_CLOSE: Record<string, Set<string>> = {
  li: new Set(['li']),
  p: new Set(['p']),
  td: new Set(['td', 'th']),
  th: new Set(['td', 'th']),
  tr: new Set(['tr', 'td', 'th']),
  option: new Set(['option']),
  dt: new Set(['dt', 'dd']),
  dd: new Set(['dt', 'dd']),
};

/** Elements whose text should not become part of the document's content. */
const SKIP_CONTENT = new Set(['script', 'style', 'noscript', 'template']);

const TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!([^>]*)>|<\/\s*([a-zA-Z][-a-zA-Z0-9:]*)\s*>|<([a-zA-Z][-a-zA-Z0-9:]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
const ATTR_RE = /([-a-zA-Z0-9:_]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

export function parseHtml(html: string): ElementNode {
  const root: ElementNode = { type: 'element', tag: '#root', attrs: {}, children: [], parent: null };
  let current = root;
  let skipDepth = 0;
  let skipTag = '';

  for (const match of html.matchAll(TOKEN_RE)) {
    const [, , closeTag, openTag, rawAttrs, selfClosing, text] = match;

    if (skipDepth > 0) {
      // Inside <script>/<style>: ignore everything until it closes.
      if (closeTag && closeTag.toLowerCase() === skipTag) skipDepth = 0;
      continue;
    }

    if (text !== undefined) {
      const decoded = decodeEntities(text);
      if (decoded.trim()) current.children.push({ type: 'text', text: decoded });
      continue;
    }

    if (closeTag !== undefined) {
      const tag = closeTag.toLowerCase();
      // Walk up to the nearest matching open element; ignore strays.
      let node: ElementNode | null = current;
      while (node && node.tag !== tag) node = node.parent;
      if (node?.parent) current = node.parent;
      continue;
    }

    if (openTag === undefined) continue;
    const tag = openTag.toLowerCase();

    if (SKIP_CONTENT.has(tag) && !selfClosing) {
      skipDepth = 1;
      skipTag = tag;
      continue;
    }

    // Implicit close: <td> ends the previous <td>, <li> the previous <li>.
    const closes = AUTO_CLOSE[tag];
    if (closes) {
      let node: ElementNode | null = current;
      while (node && node.parent && closes.has(node.tag)) {
        current = node.parent;
        node = node.parent;
        break;
      }
    }

    const element: ElementNode = {
      type: 'element',
      tag,
      attrs: parseAttrs(rawAttrs ?? ''),
      children: [],
      parent: current,
    };
    current.children.push(element);

    if (!VOID_TAGS.has(tag) && !selfClosing) current = element;
  }

  return root;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(ATTR_RE)) {
    const name = match[1]!.toLowerCase();
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', middot: '·', times: '×',
};

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** All descendants, in document order. */
export function* walk(node: ElementNode): Generator<ElementNode> {
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    yield child;
    yield* walk(child);
  }
}

export function findAll(node: ElementNode, tags: string | string[]): ElementNode[] {
  const wanted = new Set(Array.isArray(tags) ? tags : [tags]);
  return [...walk(node)].filter((element) => wanted.has(element.tag));
}

export function find(node: ElementNode, tags: string | string[]): ElementNode | null {
  return findAll(node, tags)[0] ?? null;
}

/** Visible text of an element, with block boundaries collapsed to spaces. */
export function textOf(node: Node): string {
  if (node.type === 'text') return node.text;
  if (SKIP_CONTENT.has(node.tag)) return '';
  const inner = node.children.map(textOf).join(' ');
  return inner.replace(/\s+/g, ' ').trim();
}

/** Direct child elements only. */
export function childElements(node: ElementNode, tags?: string | string[]): ElementNode[] {
  const wanted = tags ? new Set(Array.isArray(tags) ? tags : [tags]) : null;
  return node.children.filter(
    (child): child is ElementNode => child.type === 'element' && (!wanted || wanted.has(child.tag)),
  );
}
