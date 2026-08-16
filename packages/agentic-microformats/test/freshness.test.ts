import { describe, test, expect, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractAll } from '../src/extract.js';
import { AgentDOM } from '../src/agent-dom.js';
import { toGraph } from '../src/serialize.js';
import { executeTool } from '../src/adapters.js';
import type { AgentElement } from '../src/dom.js';

const dom = (html: string): AgentElement =>
  parseHTML(html).document.documentElement as unknown as AgentElement;

const VERSIONED = `<!DOCTYPE html><html><body>
  <article data-agent="resource" data-agent-type="doc" data-agent-id="D1" data-agent-version="W/&quot;v7&quot;">
    <form data-agent="action" data-agent-name="update" data-agent-method="PATCH" data-agent-endpoint="/api/doc/D1"></form>
    <a data-agent="action" data-agent-name="view" data-agent-method="GET" data-agent-endpoint="/api/doc/D1">v</a>
  </article>
</body></html>`;

describe('action-graph freshness (optimistic concurrency)', () => {
  test('resource version is extracted and serialized', () => {
    const result = extractAll(dom(VERSIONED));
    expect(result.resources[0].version).toBe('W/"v7"');
    expect((toGraph(result).resources as any[])[0].version).toBe('W/"v7"');
    expect(result.resources[0].actions.find((a) => a.name === 'update')?.resourceVersion).toBe('W/"v7"');
  });

  test('a mutating action on a versioned resource sends If-Match', () => {
    const agent = new AgentDOM(dom(VERSIONED));
    const prepared = agent.prepareAction(agent.getAction('update')!);
    expect(prepared.headers['If-Match']).toBe('W/"v7"');
  });

  test('a safe (GET) action does not send If-Match', () => {
    const agent = new AgentDOM(dom(VERSIONED));
    const prepared = agent.prepareAction(agent.getAction('view')!);
    expect(prepared.headers['If-Match']).toBeUndefined();
  });

  test('an unversioned resource adds no If-Match', () => {
    const agent = new AgentDOM(dom(
      `<html><body><div data-agent="resource" data-agent-id="X">
        <form data-agent="action" data-agent-name="u" data-agent-method="PATCH" data-agent-endpoint="/api/x"></form>
      </div></body></html>`));
    expect(agent.prepareAction(agent.getAction('u')!).headers['If-Match']).toBeUndefined();
  });

  test('a stale write (409) surfaces as a conflict requiring fresh state', async () => {
    // Closes the loop with the typed-error layer: If-Match → 409 → conflict.
    const send = vi.fn(async () => ({ status: 409, body: { message: 'version mismatch' } }));
    const agent = new AgentDOM(dom(VERSIONED));
    const r = await executeTool(agent, 'update', {}, { sendRequest: send, origin: 'https://shop.example', onConfirm: () => true });
    expect(send.mock.calls[0][0].headers['If-Match']).toBe('W/"v7"'); // precondition sent
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ kind: 'conflict', retryable: true, requiresFreshState: true });
  });
});
