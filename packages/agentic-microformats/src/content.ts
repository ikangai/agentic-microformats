/**
 * Content observation layer (spec: content-profile, 0.4 direction).
 *
 * This is the pivot: instead of requiring authors to hand-annotate every
 * paragraph, we BRIDGE the structured formats already in the page — Schema.org
 * JSON-LD, Microformats2 (h-entry), semantic HTML, Open Graph, `<time>` — into
 * one inspectable "observation" of what the document says, with per-field
 * provenance so an agent can cite and verify.
 *
 * Precedence when several sources describe the same field:
 *   JSON-LD  >  microformats2  >  Open Graph / meta  >  semantic HTML
 * The first (highest-precedence) source wins and is recorded on the value.
 *
 * The action/resource graph (extract.ts) answers "what can I do here";
 * this answers "what does this page say" — the layer WebMCP does not cover.
 */

import type { AgentElement } from './dom.js';

export type ContentSource =
  | 'jsonld'
  | 'microformats'
  | 'opengraph'
  | 'meta'
  | 'semantic-html'
  | 'derived';

/**
 * A pointer back into the source, following the W3C Web Annotation selector
 * model. A `CssSelector` names the origin element; a `TextQuoteSelector` lets
 * an agent locate and verify a value against the exact visible passage, and
 * detect when a page revision has invalidated an extraction.
 */
export type Selector =
  | { type: 'CssSelector'; value: string }
  | { type: 'TextQuoteSelector'; exact: string; prefix?: string; suffix?: string };

/** A value plus where it came from, so agents can cite and re-verify it. */
export interface Grounded<T> {
  value: T;
  source: ContentSource;
  /**
   * Grounding pointers (Web Annotation model). Always includes a CssSelector
   * for the origin; includes a TextQuoteSelector when the value's text was
   * located in the page's visible content (verifiable grounding).
   */
  selectors?: Selector[];
}

export interface ContentSection {
  level: number;
  /** Heading text from the document root down to this section. */
  headingPath: string[];
  id?: string;
  /** Concatenated body text under this heading, before the next heading. */
  text: string;
}

export interface ContentObservation {
  envelope: {
    canonicalURL?: string;
    language?: string;
    direction?: 'ltr' | 'rtl';
    title?: string;
  };
  document: {
    title?: Grounded<string>;
    summary?: Grounded<string>;
    authors?: Grounded<string[]>;
    published?: Grounded<string>;
    modified?: Grounded<string>;
    publisher?: Grounded<string>;
    section?: Grounded<string[]>;
    keywords?: Grounded<string[]>;
    wordCount?: Grounded<number>;
    language?: Grounded<string>;
    /** A short opening excerpt of the body, grounded to the content container. */
    excerpt?: Grounded<string>;
  };
  sections: ContentSection[];
  /** Which structured sources were found, for transparency/debugging. */
  provenance: string[];
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function textOf(el: AgentElement | null): string | undefined {
  const t = el?.textContent?.trim();
  return t || undefined;
}

function grounded<T>(value: T, source: ContentSource, css: string): Grounded<T> {
  return { value, source, selectors: [{ type: 'CssSelector', value: css }] };
}

/**
 * Locate `needle` in the page's visible text and return a TextQuoteSelector
 * with a little surrounding context, so an agent can verify the value against
 * exactly what a human sees. Returns null when the text is not visibly present
 * (e.g. a JSON-LD value that does not appear on screen — honestly ungrounded).
 */
function quoteIn(haystack: string, needle: string): Selector | null {
  if (!needle || needle.length < 2) return null;
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  const CTX = 24;
  const prefix = haystack.slice(Math.max(0, idx - CTX), idx).trimStart();
  const suffix = haystack.slice(idx + needle.length, idx + needle.length + CTX).trimEnd();
  const sel: Selector = { type: 'TextQuoteSelector', exact: needle };
  if (prefix) sel.prefix = prefix;
  if (suffix) sel.suffix = suffix;
  return sel;
}

function normalizeAuthor(a: unknown): string[] {
  const one = (v: unknown): string | undefined => {
    if (typeof v === 'string') return v.trim() || undefined;
    if (v && typeof v === 'object' && 'name' in (v as any)) {
      const n = (v as any).name;
      return typeof n === 'string' ? n.trim() || undefined : undefined;
    }
    return undefined;
  };
  const arr = Array.isArray(a) ? a : [a];
  return arr.map(one).filter((x): x is string => !!x);
}

// ---------------------------------------------------------------------------
// JSON-LD (highest precedence)
// ---------------------------------------------------------------------------

const ARTICLE_TYPES = new Set([
  'Article', 'BlogPosting', 'NewsArticle', 'TechArticle', 'Report', 'ScholarlyArticle',
]);

function collectLdNodes(parsed: unknown): any[] {
  const out: any[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (v && typeof v === 'object') {
      out.push(v);
      if ('@graph' in (v as any)) visit((v as any)['@graph']);
    }
  };
  visit(parsed);
  return out;
}

function ldType(node: any): string[] {
  const t = node['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x) => typeof x === 'string');
}

function readJsonLd(root: AgentElement, doc: ContentObservation['document'], provenance: string[]): void {
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');
  let article: any | null = null;
  const byId = new Map<string, any>();
  for (let i = 0; i < scripts.length; i++) {
    let parsed: unknown;
    try { parsed = JSON.parse(scripts[i].textContent ?? ''); } catch { continue; }
    for (const node of collectLdNodes(parsed)) {
      if (node['@id']) byId.set(node['@id'], node);
      if (!article && ldType(node).some((t) => ARTICLE_TYPES.has(t))) article = node;
    }
  }
  if (!article) return;
  provenance.push('jsonld:Article');
  const g = <T>(value: T): Grounded<T> => grounded(value, 'jsonld', 'script[type="application/ld+json"]');
  // Resolve a possible {"@id": ...} reference into the node it points at.
  const deref = (v: any): any => (v && typeof v === 'object' && v['@id'] && byId.has(v['@id']) ? byId.get(v['@id']) : v);

  if (typeof article.headline === 'string') doc.title ??= g(article.headline.trim());
  if (typeof article.description === 'string') doc.summary ??= g(article.description.trim());
  const authors = normalizeAuthor(Array.isArray(article.author) ? article.author.map(deref) : deref(article.author));
  if (authors.length) doc.authors ??= g(authors);
  if (typeof article.datePublished === 'string') doc.published ??= g(article.datePublished);
  if (typeof article.dateModified === 'string') doc.modified ??= g(article.dateModified);
  const pub = deref(article.publisher);
  const pubName = typeof pub === 'string' ? pub : pub?.name;
  if (typeof pubName === 'string') doc.publisher ??= g(pubName.trim());
  const section = article.articleSection;
  if (section) doc.section ??= g((Array.isArray(section) ? section : [section]).map(String));
  const kw = article.keywords;
  if (kw) doc.keywords ??= g(Array.isArray(kw) ? kw.map(String) : String(kw).split(',').map((s) => s.trim()).filter(Boolean));
  if (typeof article.wordCount === 'number') doc.wordCount ??= g(article.wordCount);
  if (typeof article.inLanguage === 'string') doc.language ??= g(article.inLanguage);
}

// ---------------------------------------------------------------------------
// Microformats2 h-entry + WordPress hentry classes
// ---------------------------------------------------------------------------

function readMicroformats(root: AgentElement, doc: ContentObservation['document'], provenance: string[]): void {
  const entry = root.querySelector('.h-entry') ?? root.querySelector('.hentry') ?? root.querySelector('article');
  if (!entry) return;
  let used = false;
  const g = <T>(value: T, selector: string): Grounded<T> => grounded(value, 'microformats', selector);

  const titleEl = entry.querySelector('.p-name') ?? entry.querySelector('.entry-title');
  const title = textOf(titleEl);
  if (title && !doc.title) { doc.title = g(title, '.entry-title'); used = true; }

  const authorEl = entry.querySelector('.p-author') ?? entry.querySelector('.author');
  const author = textOf(authorEl);
  if (author && !doc.authors) { doc.authors = g([author], '.author'); used = true; }

  const pubEl = entry.querySelector('.dt-published') ?? entry.querySelector('time.published') ?? entry.querySelector('.entry-date');
  const pub = pubEl?.getAttribute('datetime') ?? textOf(pubEl);
  if (pub && !doc.published) { doc.published = g(pub, 'time.published'); used = true; }

  const updEl = entry.querySelector('.dt-updated') ?? entry.querySelector('time.updated');
  const upd = updEl?.getAttribute('datetime') ?? textOf(updEl);
  if (upd && !doc.modified) { doc.modified = g(upd, 'time.updated'); used = true; }

  if (used) provenance.push('microformats:h-entry');
}

// ---------------------------------------------------------------------------
// Open Graph + meta + semantic HTML (lowest precedence, fills gaps)
// ---------------------------------------------------------------------------

function metaContent(root: AgentElement, selector: string): string | undefined {
  const el = root.querySelector(selector);
  const c = el?.getAttribute('content')?.trim();
  return c || undefined;
}

function readMetaAndSemantic(
  root: AgentElement, env: ContentObservation['envelope'], doc: ContentObservation['document'], provenance: string[]
): void {
  const htmlEl = root.getAttribute('lang') !== null ? root : root.querySelector('html');
  const lang = htmlEl?.getAttribute('lang') ?? undefined;
  if (lang) { env.language = lang; doc.language ??= grounded(lang, 'semantic-html', 'html[lang]'); }
  const dir = (htmlEl?.getAttribute('dir') ?? '').toLowerCase();
  if (dir === 'ltr' || dir === 'rtl') env.direction = dir;

  env.canonicalURL ??= root.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? undefined;
  env.title ??= textOf(root.querySelector('title'));

  let og = false;
  const ogTitle = metaContent(root, 'meta[property="og:title"]');
  if (ogTitle && !doc.title) { doc.title = grounded(ogTitle, 'opengraph', 'meta[property="og:title"]'); og = true; }
  const ogDesc = metaContent(root, 'meta[property="og:description"]');
  if (ogDesc && !doc.summary) { doc.summary = grounded(ogDesc, 'opengraph', 'meta[property="og:description"]'); og = true; }
  if (og) provenance.push('opengraph');

  const metaDesc = metaContent(root, 'meta[name="description"]');
  if (metaDesc && !doc.summary) { doc.summary = grounded(metaDesc, 'meta', 'meta[name="description"]'); provenance.push('meta'); }
  const metaAuthor = metaContent(root, 'meta[name="author"]');
  if (metaAuthor && !doc.authors) doc.authors = grounded([metaAuthor], 'meta', 'meta[name="author"]');

  // Fallbacks from bare semantic HTML.
  if (!doc.title) {
    const h1 = textOf(root.querySelector('article h1') ?? root.querySelector('h1'));
    if (h1) doc.title = grounded(h1, 'semantic-html', 'h1');
  }
  if (!doc.published) {
    const t = root.querySelector('article time[datetime]') ?? root.querySelector('time[datetime]');
    const dt = t?.getAttribute('datetime');
    if (dt) doc.published = grounded(dt, 'semantic-html', 'time[datetime]');
  }
}

// ---------------------------------------------------------------------------
// Section structure (derived from headings in the article body)
// ---------------------------------------------------------------------------

function findBody(root: AgentElement): AgentElement | null {
  return (
    root.querySelector('.e-content') ??
    root.querySelector('.entry-content') ??
    root.querySelector('article') ??
    root.querySelector('main')
  );
}

/**
 * Build the heading outline of the body — level, full heading path, and id —
 * in document order. Uses querySelectorAll so it finds headings nested inside
 * layout wrappers (SiteOrigin panels, section divs, etc.), which a direct-child
 * walk would miss. Per-section body slicing across arbitrary nesting needs a
 * richer DOM than the portable interface exposes and is deferred; the
 * document-level excerpt and word count carry the readable content for now.
 */
function extractSections(body: AgentElement | null): ContentSection[] {
  if (!body) return [];
  const headings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const sections: ContentSection[] = [];
  const pathStack: { level: number; text: string }[] = [];

  for (let i = 0; i < headings.length; i++) {
    const el = headings[i];
    const level = Number(el.tagName.slice(1));
    const heading = el.textContent?.trim() ?? '';
    if (!heading) continue;
    while (pathStack.length && pathStack[pathStack.length - 1].level >= level) pathStack.pop();
    pathStack.push({ level, text: heading });
    sections.push({
      level,
      headingPath: pathStack.map((p) => p.text),
      id: el.getAttribute('id') ?? undefined,
      text: '',
    });
  }
  return sections;
}

function bodyText(body: AgentElement | null): string {
  return (body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export function extractContent(root: AgentElement): ContentObservation {
  const env: ContentObservation['envelope'] = {};
  const doc: ContentObservation['document'] = {};
  const provenance: string[] = [];

  readJsonLd(root, doc, provenance);
  readMicroformats(root, doc, provenance);
  readMetaAndSemantic(root, env, doc, provenance);

  const body = findBody(root);
  const sections = extractSections(body);

  const full = bodyText(body);
  if (full) {
    doc.excerpt ??= grounded(
      full.length > 320 ? full.slice(0, 320).trimEnd() + '…' : full,
      'derived', '.entry-content'
    );
    if (!doc.wordCount) {
      const words = full.split(/\s+/).filter(Boolean).length;
      if (words > 0) doc.wordCount = grounded(words, 'derived', '.entry-content');
    }
  }

  // Verifiable grounding: attach a TextQuoteSelector to each string value that
  // actually appears in the page's VISIBLE text (title + body, never scripts),
  // so an agent can cite the passage and check a normalized JSON-LD value
  // against what a human sees.
  const titleEl =
    root.querySelector('.p-name') ?? root.querySelector('.entry-title') ??
    root.querySelector('article h1') ?? root.querySelector('h1');
  const visible = [textOf(titleEl), full].filter(Boolean).join('  ');
  if (visible) {
    const addQuote = (g: Grounded<string> | undefined) => {
      if (!g || !g.selectors) return;
      if (g.selectors.some((s) => s.type === 'TextQuoteSelector')) return;
      const q = quoteIn(visible, g.value);
      if (q) g.selectors.push(q);
    };
    addQuote(doc.title);
    addQuote(doc.summary);
    addQuote(doc.excerpt);
    addQuote(doc.publisher);
    if (doc.authors?.selectors && doc.authors.value[0]) {
      const q = quoteIn(visible, doc.authors.value[0]);
      if (q) doc.authors.selectors.push(q);
    }
  }

  return { envelope: env, document: doc, sections, provenance };
}
