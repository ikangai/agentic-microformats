import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { isUntrusted, isIgnored, getTrustLevel } from '../src/trust.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return document.body as unknown as AgentElement;
}

function q(root: AgentElement, selector: string): AgentElement {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

describe('isUntrusted', () => {
  test('returns false for system trust', () => {
    const root = dom('<main data-agent-trust="system"><div id="t"></div></main>');
    expect(isUntrusted(q(root, '#t'))).toBe(false);
  });

  test('returns true for untrusted region', () => {
    const root = dom('<section data-agent-trust="untrusted"><div id="t"></div></section>');
    expect(isUntrusted(q(root, '#t'))).toBe(true);
  });

  test('returns true for element inside untrusted ancestor', () => {
    const root = dom('<div data-agent-trust="untrusted"><div><span id="t">hi</span></div></div>');
    expect(isUntrusted(q(root, '#t'))).toBe(true);
  });

  test('returns false for verified region', () => {
    const root = dom('<div data-agent-trust="verified"><span id="t">hi</span></div>');
    expect(isUntrusted(q(root, '#t'))).toBe(false);
  });

  test('trust override: system inside untrusted', () => {
    const root = dom('<div data-agent-trust="untrusted"><div data-agent-trust="system"><span id="t">hi</span></div></div>');
    expect(isUntrusted(q(root, '#t'))).toBe(false);
  });
});

describe('isIgnored', () => {
  test('returns false by default', () => {
    const root = dom('<div><span id="t">hi</span></div>');
    expect(isIgnored(q(root, '#t'))).toBe(false);
  });

  test('returns true for ignored region', () => {
    const root = dom('<div data-agent-ignore="true"><span id="t">hi</span></div>');
    expect(isIgnored(q(root, '#t'))).toBe(true);
  });
});

describe('getTrustLevel', () => {
  test('defaults to system', () => {
    const root = dom('<div><span id="t">hi</span></div>');
    expect(getTrustLevel(q(root, '#t'))).toBe('system');
  });

  test('inherits from ancestor', () => {
    const root = dom('<div data-agent-trust="verified"><span id="t">hi</span></div>');
    expect(getTrustLevel(q(root, '#t'))).toBe('verified');
  });

  test('nearest ancestor wins', () => {
    const root = dom('<div data-agent-trust="untrusted"><div data-agent-trust="verified"><span id="t">hi</span></div></div>');
    expect(getTrustLevel(q(root, '#t'))).toBe('verified');
  });
});
