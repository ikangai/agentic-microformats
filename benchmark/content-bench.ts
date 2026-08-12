#!/usr/bin/env ts-node
/**
 * content-bench.ts
 *
 * Measures the content-observation layer the way agent-bench measures actions —
 * but deterministically, no LLM required:
 *
 *   RECALL            did extractContent capture each expected fact
 *                     (title, author, published date, section headings, …)?
 *   CITATION ACCURACY does every TextQuoteSelector it emitted actually
 *                     re-resolve in the page's visible text, and does every
 *                     CssSelector resolve to an element? (grounding must not lie)
 *
 * A grounding layer whose citations don't resolve is worse than none, so
 * citation accuracy is a first-class metric, checked independently of the
 * extractor that produced the selectors.
 *
 * Usage:
 *   ts-node benchmark/content-bench.ts
 *   ts-node benchmark/content-bench.ts --pages-dir=benchmark/content-pages --tasks=benchmark/content-tasks.json
 */

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseHTML } = require('linkedom');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require(path.join(__dirname, '..', 'packages', 'agentic-microformats', 'dist', 'index.js'));

const DEFAULT_PAGES = path.join(__dirname, 'content-pages');
const DEFAULT_TASKS = path.join(__dirname, 'content-tasks.json');

interface Expect {
  title?: string;
  authors_include?: string;
  published_date?: string;
  sections_include?: string[];
  keywords_include?: string;
  language?: string;
  min_words?: number;
  quarantined?: number;
  quarantined_provenance?: string;
}
interface Task { page: string; expect: Expect; }

function visibleText(root: any): string {
  // Body text minus <script>/<style>, matching how the extractor grounds.
  const body =
    root.querySelector('.e-content') ?? root.querySelector('.entry-content') ??
    root.querySelector('article') ?? root.querySelector('main') ?? root;
  const titleEl =
    root.querySelector('.p-name') ?? root.querySelector('.entry-title') ??
    root.querySelector('article h1') ?? root.querySelector('h1');
  const t = (titleEl?.textContent ?? '');
  const b = (body?.textContent ?? '');
  return `${t}  ${b}`.replace(/\s+/g, ' ').trim();
}

function checkRecall(obs: any, e: Expect): { hits: string[]; misses: string[] } {
  const hits: string[] = [], misses: string[] = [];
  const check = (label: string, ok: boolean) => (ok ? hits : misses).push(label);

  if (e.title !== undefined) check('title', obs.document.title?.value === e.title);
  if (e.authors_include !== undefined)
    check('author', (obs.document.authors?.value ?? []).some((a: string) => a.includes(e.authors_include!)));
  if (e.published_date !== undefined)
    check('published', (obs.document.published?.value ?? '').startsWith(e.published_date));
  if (e.language !== undefined) check('language', (obs.envelope.language ?? '').startsWith(e.language));
  if (e.keywords_include !== undefined)
    check('keywords', (obs.document.keywords?.value ?? []).some((k: string) => k.includes(e.keywords_include!)));
  if (e.min_words !== undefined) check('wordCount', (obs.document.wordCount?.value ?? 0) >= e.min_words);
  if (e.sections_include) {
    const heads = new Set(obs.sections.map((s: any) => s.headingPath[s.headingPath.length - 1]));
    for (const h of e.sections_include) check(`section:${h}`, heads.has(h));
  }
  if (e.quarantined !== undefined) check('quarantined-count', obs.quarantined.length === e.quarantined);
  if (e.quarantined_provenance !== undefined)
    check('quarantined-provenance', obs.quarantined.some((q: any) => q.provenance === e.quarantined_provenance));
  return { hits, misses };
}

function checkCitations(obs: any, root: any, doc: any): { total: number; ok: number; failures: string[] } {
  const vis = visibleText(root);
  let total = 0, ok = 0;
  const failures: string[] = [];
  const fields: [string, any][] = Object.entries(obs.document);
  for (const [name, g] of fields) {
    if (!g || !g.selectors) continue;
    for (const sel of g.selectors) {
      total++;
      if (sel.type === 'TextQuoteSelector') {
        if (vis.includes(sel.exact)) ok++;
        else failures.push(`${name}: quote "${String(sel.exact).slice(0, 30)}" not in visible text`);
      } else if (sel.type === 'CssSelector') {
        // CSS selectors are document-scoped (an agent resolves them against the
        // document, not a subtree), so query from `document`.
        try {
          if (doc.querySelector(sel.value)) ok++;
          else failures.push(`${name}: css "${sel.value}" resolves to nothing`);
        } catch { failures.push(`${name}: css "${sel.value}" invalid`); }
      }
    }
  }
  return { total, ok, failures };
}

async function main() {
  const args = process.argv.slice(2);
  const pagesDir = args.find((a) => a.startsWith('--pages-dir='))?.split('=')[1] ?? DEFAULT_PAGES;
  const tasksFile = args.find((a) => a.startsWith('--tasks='))?.split('=')[1] ?? DEFAULT_TASKS;
  const tasks: Task[] = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

  console.log(`\n${'='.repeat(64)}`);
  console.log('Content Observation Benchmark — recall + citation accuracy');
  console.log(`${'='.repeat(64)}\n`);

  let recallHit = 0, recallTotal = 0, citeOk = 0, citeTotal = 0, pagesPass = 0;

  for (const task of tasks) {
    const file = path.join(pagesDir, task.page);
    const html = fs.readFileSync(file, 'utf-8');
    const { document } = parseHTML(html);
    const root = document.documentElement;
    const obs = lib.extractContent(root);

    const { hits, misses } = checkRecall(obs, task.expect);
    const cite = checkCitations(obs, root, document);
    recallHit += hits.length; recallTotal += hits.length + misses.length;
    citeOk += cite.ok; citeTotal += cite.total;
    const pagePass = misses.length === 0 && cite.ok === cite.total;
    if (pagePass) pagesPass++;

    const kb = (html.length / 1024).toFixed(0);
    console.log(`[${task.page}]  ${kb}KB → ${obs.provenance.join('+') || 'semantic-html'}`);
    console.log(`   recall   : ${hits.length}/${hits.length + misses.length}${misses.length ? '  MISSED: ' + misses.join(', ') : ''}`);
    console.log(`   citations: ${cite.ok}/${cite.total} resolve${cite.failures.length ? '  FAIL: ' + cite.failures.join('; ') : ''}`);
    if (obs.quarantined.length) console.log(`   quarantined: ${obs.quarantined.length} (${obs.quarantined.map((q: any) => q.provenance).join(', ')})`);
    console.log();
  }

  const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : '100.0');
  console.log(`${'='.repeat(64)}`);
  console.log(`Pages fully passing : ${pagesPass}/${tasks.length}`);
  console.log(`Content recall      : ${recallHit}/${recallTotal} (${pct(recallHit, recallTotal)}%)`);
  console.log(`Citation accuracy   : ${citeOk}/${citeTotal} (${pct(citeOk, citeTotal)}%)`);
  console.log(`${'='.repeat(64)}\n`);
  process.exit(pagesPass === tasks.length ? 0 : 1);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(2); });
