import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractContent } from '../src/content.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  const { document } = parseHTML(html);
  return document.documentElement as unknown as AgentElement;
}

describe('content observation — bridges existing formats (no data-agent-* needed)', () => {
  test('reads Schema.org Article JSON-LD, resolving @id references', () => {
    const html = `<!DOCTYPE html><html lang="en"><head>
      <link rel="canonical" href="https://ex.com/post">
      <script type="application/ld+json">${JSON.stringify({
        '@graph': [
          { '@type': 'Organization', '@id': 'https://ex.com/#org', name: 'Example Co' },
          {
            '@type': 'Article', headline: 'Hello World',
            datePublished: '2026-01-02T00:00:00Z', dateModified: '2026-02-03T00:00:00Z',
            author: { '@type': 'Person', name: 'Ada L' },
            publisher: { '@id': 'https://ex.com/#org' },
            wordCount: 900, articleSection: ['AI', 'Web'], keywords: ['mcp', 'agents'], inLanguage: 'en',
          },
        ],
      })}</script></head><body><article class="entry-content"><p>Body text here.</p></article></body></html>`;
    const obs = extractContent(dom(html));
    expect(obs.document.title?.value).toBe('Hello World');
    expect(obs.document.title?.source).toBe('jsonld');
    expect(obs.document.authors?.value).toEqual(['Ada L']);
    expect(obs.document.publisher?.value).toBe('Example Co'); // resolved via @id
    expect(obs.document.published?.value).toBe('2026-01-02T00:00:00Z');
    expect(obs.document.section?.value).toEqual(['AI', 'Web']);
    expect(obs.document.wordCount?.value).toBe(900);
    expect(obs.envelope.canonicalURL).toBe('https://ex.com/post');
    expect(obs.provenance).toContain('jsonld:Article');
  });

  test('falls back to Microformats2 h-entry when no JSON-LD', () => {
    const html = `<!DOCTYPE html><html lang="de"><body>
      <article class="hentry">
        <h1 class="entry-title">Der Titel</h1>
        <span class="author">Max Mustermann</span>
        <time class="published" datetime="2025-12-01">Dec 1</time>
        <div class="entry-content"><h2>Abschnitt</h2><p>Inhalt.</p></div>
      </article></body></html>`;
    const obs = extractContent(dom(html));
    expect(obs.document.title?.value).toBe('Der Titel');
    expect(obs.document.title?.source).toBe('microformats');
    expect(obs.document.authors?.value).toEqual(['Max Mustermann']);
    expect(obs.document.published?.value).toBe('2025-12-01');
    expect(obs.provenance).toContain('microformats:h-entry');
  });

  test('JSON-LD wins over microformats for the same field (precedence)', () => {
    const html = `<!DOCTYPE html><html><body>
      <script type="application/ld+json">${JSON.stringify({ '@type': 'Article', headline: 'Canonical Title' })}</script>
      <article class="hentry"><h1 class="entry-title">Fallback Title</h1></article>
      </body></html>`;
    const obs = extractContent(dom(html));
    expect(obs.document.title?.value).toBe('Canonical Title');
    expect(obs.document.title?.source).toBe('jsonld');
  });

  test('falls back to Open Graph then semantic HTML', () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="OG Title">
      <meta property="og:description" content="OG summary">
      </head><body><article><h1>Semantic H1</h1><time datetime="2026-05-05">x</time></article></body></html>`;
    const obs = extractContent(dom(html));
    expect(obs.document.title?.value).toBe('OG Title');
    expect(obs.document.title?.source).toBe('opengraph');
    expect(obs.document.summary?.value).toBe('OG summary');
  });

  test('builds a nested-aware heading outline with heading paths', () => {
    const html = `<!DOCTYPE html><html><body><div class="entry-content">
      <div class="wrapper"><h2>A</h2><p>x</p><h3>A.1</h3><p>y</p></div>
      <h2>B</h2>
    </div></body></html>`;
    const obs = extractContent(dom(html));
    expect(obs.sections.map((s) => s.headingPath)).toEqual([['A'], ['A', 'A.1'], ['B']]);
    expect(obs.document.excerpt?.value).toContain('x');
    expect(obs.document.wordCount?.source).toBe('derived');
  });

  test('empty page yields an empty-but-valid observation', () => {
    const obs = extractContent(dom('<!DOCTYPE html><html><body></body></html>'));
    expect(obs.document.title).toBeUndefined();
    expect(obs.sections).toEqual([]);
    expect(obs.provenance).toEqual([]);
  });
});
