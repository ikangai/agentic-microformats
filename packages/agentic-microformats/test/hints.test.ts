import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractHints, requiresConfirmation } from '../src/hints.js';
import type { AgentElement } from '../src/dom.js';

function el(html: string): AgentElement {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return document.body.firstElementChild as unknown as AgentElement;
}

describe('extractHints', () => {
  test('returns defaults for element with no hints', () => {
    const hints = extractHints(el('<button>Click</button>'));
    expect(hints.role).toBeUndefined();
    expect(hints.risk).toBeUndefined();
    expect(hints.humanPreferred).toBe(false);
    expect(hints.reversible).toBeUndefined();
    expect(hints.cost).toBeUndefined();
  });

  test('extracts role', () => {
    expect(extractHints(el('<button data-agent-role="danger">X</button>')).role).toBe('danger');
  });

  test('extracts risk', () => {
    expect(extractHints(el('<button data-agent-risk="high">X</button>')).risk).toBe('high');
  });

  test('extracts human-preferred', () => {
    expect(extractHints(el('<button data-agent-human-preferred="true">X</button>')).humanPreferred).toBe(true);
  });

  test('extracts reversible', () => {
    expect(extractHints(el('<button data-agent-reversible="false">X</button>')).reversible).toBe(false);
  });

  test('extracts cost', () => {
    const hints = extractHints(el('<button data-agent-cost="49.99" data-agent-cost-currency="EUR">X</button>'));
    expect(hints.cost).toBe(49.99);
    expect(hints.costCurrency).toBe('EUR');
  });
});

describe('requiresConfirmation', () => {
  test('false for no hints', () => {
    expect(requiresConfirmation({ humanPreferred: false })).toBe(false);
  });

  test('true for high risk', () => {
    expect(requiresConfirmation({ humanPreferred: false, risk: 'high' })).toBe(true);
  });

  test('true for cost > 0', () => {
    expect(requiresConfirmation({ humanPreferred: false, cost: 10 })).toBe(true);
  });

  test('true for irreversible', () => {
    expect(requiresConfirmation({ humanPreferred: false, reversible: false })).toBe(true);
  });

  test('true for danger role', () => {
    expect(requiresConfirmation({ humanPreferred: false, role: 'danger' })).toBe(true);
  });

  test('false for medium risk alone', () => {
    expect(requiresConfirmation({ humanPreferred: false, risk: 'medium' })).toBe(false);
  });

  test('false for reversible true', () => {
    expect(requiresConfirmation({ humanPreferred: false, reversible: true })).toBe(false);
  });
});
