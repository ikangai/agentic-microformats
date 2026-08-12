import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { AgentDOM } from '../src/agent-dom.js';
import { requiresConfirmation } from '../src/hints.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  const { document } = parseHTML(html);
  return document.documentElement as unknown as AgentElement;
}

describe('fail-closed confirmation (spec §3.2, §8)', () => {
  test('missing risk on a mutating method requires confirmation', () => {
    expect(requiresConfirmation({ humanPreferred: false }, 'POST')).toBe(true);
    expect(requiresConfirmation({ humanPreferred: false }, 'DELETE')).toBe(true);
  });

  test('explicit risk="low" on a mutating method does not', () => {
    expect(requiresConfirmation({ humanPreferred: false, risk: 'low' }, 'POST')).toBe(false);
  });

  test('safe methods (GET/HEAD) do not require confirmation without hints', () => {
    expect(requiresConfirmation({ humanPreferred: false }, 'GET')).toBe(false);
    expect(requiresConfirmation({ humanPreferred: false }, 'HEAD')).toBe(false);
  });

  test('human-preferred always requires confirmation', () => {
    expect(requiresConfirmation({ humanPreferred: true }, 'GET')).toBe(true);
    expect(requiresConfirmation({ humanPreferred: true, risk: 'low' }, 'POST')).toBe(true);
  });

  test('high risk / cost / irreversible / danger all require confirmation', () => {
    expect(requiresConfirmation({ humanPreferred: false, risk: 'high' }, 'GET')).toBe(true);
    expect(requiresConfirmation({ humanPreferred: false, cost: 5 }, 'GET')).toBe(true);
    expect(requiresConfirmation({ humanPreferred: false, reversible: false }, 'GET')).toBe(true);
    expect(requiresConfirmation({ humanPreferred: false, role: 'danger' }, 'GET')).toBe(true);
  });
});

describe('prepareAction fail-closed gates', () => {
  test('human-preferred sets confirmationRequired, not just a warning', () => {
    const agent = new AgentDOM(dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="approve" data-agent-method="POST"
              data-agent-endpoint="/api/approve" data-agent-risk="low"
              data-agent-human-preferred="true">Approve</button>
    </body></html>`));
    const prepared = agent.prepareAction(agent.getAction('approve')!);
    expect(prepared.confirmationRequired).toBe(true);
    expect(prepared.warnings.some((w) => /human confirmation/i.test(w))).toBe(true);
  });

  test('cross-origin endpoint is blocked without opt-out', () => {
    const agent = new AgentDOM(dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="x" data-agent-method="POST"
              data-agent-endpoint="https://evil.example/steal">Go</button>
    </body></html>`));
    const prepared = agent.prepareAction(agent.getAction('x')!, undefined, { origin: 'https://shop.example' });
    expect(prepared.blocked).toBe(true);
    expect(prepared.confirmationRequired).toBe(true);
    expect(prepared.warnings.some((w) => /cross-origin/i.test(w))).toBe(true);
  });

  test('cross-origin endpoint with opt-out and matching origin are allowed', () => {
    const agent = new AgentDOM(dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="a" data-agent-method="POST"
              data-agent-endpoint="https://partner.example/api"
              data-agent-cross-origin="true" data-agent-risk="low">Go</button>
      <button data-agent="action" data-agent-name="b" data-agent-method="POST"
              data-agent-endpoint="https://shop.example/api/add" data-agent-risk="low">Go</button>
    </body></html>`));
    expect(agent.prepareAction(agent.getAction('a')!, undefined, { origin: 'https://shop.example' }).blocked).toBe(false);
    expect(agent.prepareAction(agent.getAction('b')!, undefined, { origin: 'https://shop.example' }).blocked).toBe(false);
  });

  test('relative endpoints are always same-origin', () => {
    const agent = new AgentDOM(dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="r" data-agent-method="POST"
              data-agent-endpoint="/api/cart/add" data-agent-risk="low">Go</button>
    </body></html>`));
    expect(agent.prepareAction(agent.getAction('r')!, undefined, { origin: 'https://shop.example' }).blocked).toBe(false);
  });

  test('data-agent-cross-origin is captured on the extracted action', () => {
    const agent = new AgentDOM(dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="c" data-agent-method="POST"
              data-agent-endpoint="https://p.example/api" data-agent-cross-origin="true">Go</button>
    </body></html>`));
    expect(agent.getAction('c')!.crossOrigin).toBe(true);
  });
});
