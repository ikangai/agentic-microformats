import { describe, test, expect, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractAll } from '../src/extract.js';
import { AgentDOM } from '../src/agent-dom.js';
import { toOpenAITools, toAnthropicTools, toMCPTools, executeTool } from '../src/adapters.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  return parseHTML(html).document.documentElement as unknown as AgentElement;
}

const HTML = `<!DOCTYPE html><html><body>
  <form data-agent="action" data-agent-name="add_to_cart" data-agent-method="POST"
        data-agent-endpoint="/api/cart/add" data-agent-risk="low"
        data-agent-description="Add a product to the cart">
    <input data-agent-param="quantity" data-agent-typehint="integer" data-agent-min="1" data-agent-max="10" value="1" required>
  </form>
  <button data-agent="action" data-agent-name="delete_item" data-agent-method="DELETE"
          data-agent-endpoint="/api/cart/1" data-agent-role="danger">Remove</button>
  <button data-agent="action" data-agent-name="ping" data-agent-method="POST"
          data-agent-endpoint="https://partner.example/hook">x</button>
</body></html>`;

const result = extractAll(dom(HTML));

describe('tool-format adapters', () => {
  test('OpenAI: {type:function, function:{name, description, parameters}}', () => {
    const t = toOpenAITools(result).find((x) => x.function.name === 'add_to_cart')!;
    expect(t.type).toBe('function');
    expect(t.function.parameters.properties.quantity).toMatchObject({ type: 'integer', minimum: 1, maximum: 10 });
    expect(t.function.parameters.required).toEqual(['quantity']);
    expect(t.function.description).toContain('Add a product'); // description preserved
  });

  test('Anthropic: {name, description, input_schema}', () => {
    const t = toAnthropicTools(result).find((x) => x.name === 'add_to_cart')!;
    expect(t.input_schema.type).toBe('object');
    expect(t.input_schema.properties.quantity.type).toBe('integer');
  });

  test('MCP: native tool annotations survive; destructive marked', () => {
    const del = toMCPTools(result).find((x) => x.name === 'delete_item')!;
    expect(del.annotations.destructiveHint).toBe(true);
    expect(del.annotations.idempotentHint).toBe(true); // DELETE
    expect(del.annotations.title).toBe('delete_item');
  });

  test('OpenAI/Anthropic fold safety hints into the description', () => {
    const del = toOpenAITools(result).find((x) => x.function.name === 'delete_item')!;
    expect(del.function.description).toMatch(/destructive/i);
  });
});

describe('executeTool — safe execution of a model tool call', () => {
  test('runs a safe action via sendRequest', async () => {
    const send = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const agent = new AgentDOM(dom(HTML));
    const r = await executeTool(agent, 'add_to_cart', { quantity: 3 }, { sendRequest: send, origin: 'https://shop.example' });
    expect(r.ok).toBe(true);
    expect(send.mock.calls[0][0]).toMatchObject({ method: 'POST', url: '/api/cart/add', body: { quantity: 3 } });
  });

  test('refuses a cross-origin endpoint (never sent)', async () => {
    const send = vi.fn();
    const agent = new AgentDOM(dom(HTML));
    const r = await executeTool(agent, 'ping', {}, { sendRequest: send, origin: 'https://shop.example', onConfirm: () => true });
    expect(r.ok).toBe(false);
    expect(r.refused).toMatch(/cross-origin|refused|blocked/i);
    expect(send).not.toHaveBeenCalled();
  });

  test('refuses a confirmation-required action without onConfirm', async () => {
    const send = vi.fn();
    const html = `<html><body><form data-agent="action" data-agent-name="pay" data-agent-method="POST"
      data-agent-endpoint="/api/pay" data-agent-risk="high"></form></body></html>`;
    const agent = new AgentDOM(dom(html));
    const r = await executeTool(agent, 'pay', {}, { sendRequest: send });
    expect(r.ok).toBe(false);
    expect(r.refused).toMatch(/confirmation/i);
    expect(send).not.toHaveBeenCalled();
  });

  test('unknown tool returns an error, not a throw', async () => {
    const agent = new AgentDOM(dom(HTML));
    const r = await executeTool(agent, 'nope', {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no action named/i);
  });
});
