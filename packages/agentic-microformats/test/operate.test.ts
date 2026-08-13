import { describe, test, expect, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { operate } from '../src/operate.js';
import type { AgentAction, PageState } from '../src/operate.js';
import type { AgentElement } from '../src/dom.js';

const parse = (html: string): AgentElement =>
  parseHTML(html).document.documentElement as unknown as AgentElement;

const CATALOG = `<!DOCTYPE html><html><body>
  <article data-agent="resource" data-agent-type="product" data-agent-id="SKU-1">
    <a href="/product/SKU-1" data-agent-prop="url" data-agent-typehint="url" data-agent-value="/product/SKU-1">Widget</a>
    <form data-agent="action" data-agent-name="add_to_cart" data-agent-method="POST"
          data-agent-endpoint="/api/cart/add" data-agent-risk="low">
      <input data-agent-param="quantity" data-agent-typehint="integer" value="1">
    </form>
  </article>
  <form data-agent="action" data-agent-name="checkout" data-agent-method="POST"
        data-agent-endpoint="/api/checkout" data-agent-risk="high"
        data-agent-human-preferred="true"></form>
  <button data-agent="action" data-agent-name="ping_partner" data-agent-method="POST"
          data-agent-endpoint="https://partner.example/hook">x</button>
</body></html>`;

function harness(script: AgentAction[]) {
  let i = 0;
  const seen: PageState[] = [];
  const decide = (s: PageState) => { seen.push(s); return script[Math.min(i++, script.length - 1)]; };
  const fetchPage = vi.fn(async (url: string) => ({ html: CATALOG, url }));
  const sendRequest = vi.fn(async () => ({ status: 200, body: { success: true } }));
  return { decide, fetchPage, sendRequest, seen };
}

describe('operate() — the agent episode runtime', () => {
  test('observes, invokes a safe action, and answers', async () => {
    const h = harness([
      { type: 'invoke', tool: 'add_to_cart', args: { quantity: 2 } },
      { type: 'answer', text: 'added 2' },
    ]);
    const res = await operate({
      task: 'add 2 widgets', start: '/', decide: h.decide, fetchPage: h.fetchPage,
      sendRequest: h.sendRequest, parse, origin: 'https://shop.example',
    });
    expect(res.answer).toBe('added 2');
    expect(res.stepsUsed).toBe(2);
    expect(h.sendRequest).toHaveBeenCalledTimes(1);
    expect(h.sendRequest.mock.calls[0][0]).toMatchObject({ method: 'POST', url: '/api/cart/add', body: { quantity: 2 } });
    // state was handed to decide with a graph + tools
    expect(h.seen[0].tools.some((t) => t.name === 'add_to_cart')).toBe(true);
    // re-observed after the mutation (start + invoke re-fetch)
    expect(h.fetchPage.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('a confirmation-required action is refused without onConfirm', async () => {
    const h = harness([{ type: 'invoke', tool: 'checkout' }, { type: 'answer', text: 'x' }]);
    const res = await operate({ task: 'buy', start: '/', decide: h.decide, fetchPage: h.fetchPage, sendRequest: h.sendRequest, parse });
    expect(h.sendRequest).not.toHaveBeenCalled();
    expect(res.steps[0].refused).toMatch(/confirmation/i);
  });

  test('the same action runs when onConfirm approves', async () => {
    const h = harness([{ type: 'invoke', tool: 'checkout' }, { type: 'answer', text: 'x' }]);
    await operate({
      task: 'buy', start: '/', decide: h.decide, fetchPage: h.fetchPage, sendRequest: h.sendRequest, parse,
      onConfirm: () => true,
    });
    expect(h.sendRequest).toHaveBeenCalledTimes(1);
    expect(h.sendRequest.mock.calls[0][0]).toMatchObject({ url: '/api/checkout' });
  });

  test('a cross-origin endpoint is blocked (never sent)', async () => {
    const h = harness([{ type: 'invoke', tool: 'ping_partner' }, { type: 'answer', text: 'x' }]);
    const res = await operate({
      task: 'ping', start: '/', decide: h.decide, fetchPage: h.fetchPage, sendRequest: h.sendRequest, parse,
      origin: 'https://shop.example', onConfirm: () => true,
    });
    expect(h.sendRequest).not.toHaveBeenCalled();
    expect(res.steps[0].refused).toMatch(/cross-origin|refused|blocked/i);
  });

  test('navigate fetches the new page and records the step', async () => {
    const h = harness([{ type: 'navigate', url: '/product/SKU-1' }, { type: 'answer', text: 'seen' }]);
    const res = await operate({ task: 'view', start: '/', decide: h.decide, fetchPage: h.fetchPage, sendRequest: h.sendRequest, parse });
    expect(h.fetchPage.mock.calls.map((c) => c[0])).toContain('/product/SKU-1');
    expect(res.steps[0].action).toMatchObject({ type: 'navigate', url: '/product/SKU-1' });
  });

  test('an unknown tool is recorded as an error, loop continues', async () => {
    const h = harness([{ type: 'invoke', tool: 'nope' }, { type: 'answer', text: 'done' }]);
    const res = await operate({ task: 't', start: '/', decide: h.decide, fetchPage: h.fetchPage, sendRequest: h.sendRequest, parse });
    expect(res.steps[0].error).toMatch(/no action named/i);
    expect(res.answer).toBe('done');
  });

  test('stops at maxSteps and reports exhausted', async () => {
    const h = harness([{ type: 'navigate', url: '/' }]); // never answers
    const res = await operate({ task: 'loop', start: '/', decide: h.decide, fetchPage: h.fetchPage, sendRequest: h.sendRequest, parse, maxSteps: 3 });
    expect(res.exhausted).toBe(true);
    expect(res.stepsUsed).toBe(3);
    expect(res.answer).toBeNull();
  });
});
