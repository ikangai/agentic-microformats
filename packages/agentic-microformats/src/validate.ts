/**
 * Structural validator for Agentic Microformats annotations (spec 0.3.0).
 *
 * Checks what can be checked without trusting the site: attribute names
 * against the registry, enum values, JSON-valued attributes, action
 * completeness, endpoint origin policy, duplicate ids, min/max sanity, and
 * the navigability rule (a resource that links somewhere should annotate
 * its canonical url).
 *
 * It cannot verify that annotations are TRUE — only that they are
 * well-formed. Semantic honesty requires out-of-band verification.
 */

import type { AgentElement } from './dom.js';

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  /** data-agent-id or data-agent-name of the closest annotated ancestor, if any */
  context?: string;
}

const KNOWN_ATTRIBUTES = new Set([
  'data-agent',
  'data-agent-type', 'data-agent-id', 'data-agent-prop', 'data-agent-typehint',
  'data-agent-currency', 'data-agent-value',
  'data-agent-name', 'data-agent-target', 'data-agent-method', 'data-agent-endpoint',
  'data-agent-params', 'data-agent-headers', 'data-agent-on-success', 'data-agent-response',
  'data-agent-idempotent',
  'data-agent-param', 'data-agent-required', 'data-agent-min', 'data-agent-max',
  'data-agent-role', 'data-agent-risk', 'data-agent-human-preferred',
  'data-agent-reversible', 'data-agent-cost', 'data-agent-cost-currency',
  'data-agent-description', 'data-agent-meta',
  'data-agent-trust', 'data-agent-ignore', 'data-agent-cross-origin',
  'data-agent-provenance',
]);

const ENUMS: Record<string, readonly string[]> = {
  'data-agent': ['resource', 'action'],
  'data-agent-role': ['primary', 'secondary', 'danger'],
  'data-agent-risk': ['low', 'medium', 'high'],
  'data-agent-trust': ['system', 'untrusted', 'verified'],
  'data-agent-provenance': ['publisher', 'user', 'third-party', 'quotation', 'generated'],
  'data-agent-typehint': [
    'string', 'number', 'integer', 'boolean', 'currency',
    'date', 'datetime', 'url', 'email', 'enum', 'json',
  ],
  'data-agent-method': ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
};

const BOOLEAN_ATTRS = [
  'data-agent-human-preferred', 'data-agent-reversible', 'data-agent-ignore',
  'data-agent-idempotent', 'data-agent-required', 'data-agent-cross-origin',
];

const JSON_ATTRS = ['data-agent-headers', 'data-agent-response'];

function contextOf(el: AgentElement): string | undefined {
  const owner = el.closest('[data-agent-id],[data-agent-name]');
  if (!owner) return undefined;
  return owner.getAttribute('data-agent-id') ?? owner.getAttribute('data-agent-name') ?? undefined;
}

export function validate(root: AgentElement, opts: { origin?: string } = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (level: ValidationIssue['level'], code: string, message: string, el?: AgentElement) =>
    issues.push({ level, code, message, context: el ? contextOf(el) : undefined });

  // Every element carrying at least one data-agent-* attribute
  const annotated = root.querySelectorAll(
    '[data-agent],[data-agent-prop],[data-agent-param],[data-agent-meta],[data-agent-trust],[data-agent-ignore]'
  );
  const seenIds = new Map<string, number>();

  const all: AgentElement[] = [];
  for (let i = 0; i < annotated.length; i++) all.push(annotated[i]);

  for (const el of all) {
    const attrs: string[] = (el as any).getAttributeNames?.() ?? [];
    for (const attr of attrs) {
      if (!attr.startsWith('data-agent')) continue;
      // x- extension prefix is always allowed (spec §15 Extensibility)
      if (attr.startsWith('data-agent-x-')) continue;
      if (!KNOWN_ATTRIBUTES.has(attr)) {
        push('error', 'unknown-attribute', `"${attr}" is not a registered attribute`, el);
        continue;
      }
      const value = el.getAttribute(attr) ?? '';
      if (ENUMS[attr]) {
        const v = attr === 'data-agent-method' ? value.toUpperCase() : value;
        if (!ENUMS[attr].includes(v)) {
          push('error', 'invalid-enum', `"${attr}"="${value}" is not one of ${ENUMS[attr].join('|')}`, el);
        }
      }
      if (BOOLEAN_ATTRS.includes(attr) && value !== 'true' && value !== 'false') {
        push('error', 'invalid-boolean', `"${attr}"="${value}" must be "true" or "false"`, el);
      }
      if (JSON_ATTRS.includes(attr)) {
        try { JSON.parse(value); } catch {
          push('error', 'invalid-json', `"${attr}" does not contain valid JSON`, el);
        }
      }
    }

    const kind = el.getAttribute('data-agent');

    if (kind === 'action') {
      if (!el.getAttribute('data-agent-name')) {
        push('warning', 'action-unnamed', 'action has no data-agent-name', el);
      }
      const endpoint = el.getAttribute('data-agent-endpoint');
      if (endpoint && /^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint)) {
        const sameOrigin = opts.origin && endpoint.startsWith(opts.origin);
        const optOut = el.getAttribute('data-agent-cross-origin') === 'true';
        if (!sameOrigin && !optOut) {
          push('error', 'cross-origin-endpoint',
            `absolute endpoint "${endpoint}" without data-agent-cross-origin="true" — agents MUST refuse it (spec §12)`, el);
        }
      }
    }

    if (kind === 'resource') {
      const id = el.getAttribute('data-agent-id');
      if (id) seenIds.set(id, (seenIds.get(id) ?? 0) + 1);

      // Navigability (spec 0.3.0): a resource that contains links but
      // declares no url property is invisible to graph navigation.
      const hasLink = el.querySelector('a[href]');
      if (hasLink) {
        const propEls = el.querySelectorAll('[data-agent-prop="url"]');
        let ownUrl = false;
        for (let i = 0; i < propEls.length; i++) {
          if (propEls[i].closest('[data-agent="resource"]') === el) { ownUrl = true; break; }
        }
        if (!ownUrl) {
          push('warning', 'resource-not-navigable',
            'resource contains links but no data-agent-prop="url" — graph-only agents cannot navigate to it', el);
        }
      }
    }

    // min/max sanity
    const min = el.getAttribute('data-agent-min');
    const max = el.getAttribute('data-agent-max');
    if (min !== null && Number.isNaN(Number(min))) push('error', 'invalid-min', `data-agent-min="${min}" is not numeric`, el);
    if (max !== null && Number.isNaN(Number(max))) push('error', 'invalid-max', `data-agent-max="${max}" is not numeric`, el);
    if (min !== null && max !== null && Number(min) > Number(max)) {
      push('error', 'min-gt-max', `data-agent-min (${min}) exceeds data-agent-max (${max})`, el);
    }
  }

  for (const [id, count] of seenIds) {
    if (count > 1) push('warning', 'duplicate-id', `data-agent-id "${id}" appears ${count} times`);
  }

  // Page-level meta block must parse
  const metaScript = root.querySelector('script[data-agent-meta]');
  if (metaScript) {
    try { JSON.parse(metaScript.textContent ?? ''); } catch {
      push('error', 'invalid-meta-json', 'the data-agent-meta script block is not valid JSON');
    }
  }

  return issues;
}
