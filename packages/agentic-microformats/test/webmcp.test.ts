import { describe, test, expect, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractAll } from '../src/extract.js';
import { toWebMCPTools, registerWebMCPTools } from '../src/webmcp.js';
import type { ModelContextHost } from '../src/webmcp.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  const { document } = parseHTML(html);
  return document.documentElement as unknown as AgentElement;
}

const CART = `<!DOCTYPE html><html><body>
  <article data-agent="resource" data-agent-type="product" data-agent-id="SKU-1">
    <form data-agent="action" data-agent-name="add_to_cart" data-agent-method="POST"
          data-agent-endpoint="/api/cart/add" data-agent-idempotent="false"
          data-agent-risk="low" data-agent-description="Add this product to the cart"
          data-agent-on-success="Cart updated.">
      <input data-agent-param="quantity" data-agent-typehint="integer"
             data-agent-min="1" data-agent-max="10" value="1" required>
    </form>
    <button data-agent="action" data-agent-name="delete_item" data-agent-method="DELETE"
            data-agent-endpoint="/api/cart/1" data-agent-role="danger">Remove</button>
  </article>
</body></html>`;

describe('toWebMCPTools — descriptor compilation', () => {
  const tools = toWebMCPTools(extractAll(dom(CART)));
  const add = tools.find((t) => t.name === 'add_to_cart')!;
  const del = tools.find((t) => t.name === 'delete_item')!;

  test('builds JSON Schema inputs from parameters (types, min/max, required)', () => {
    expect(add.inputSchema).toMatchObject({
      type: 'object',
      properties: { quantity: { type: 'integer', minimum: 1, maximum: 10, default: 1 } },
      required: ['quantity'],
      additionalProperties: false,
    });
  });

  test('maps hints to MCP tool annotations', () => {
    // POST create, low risk, non-idempotent
    expect(add.annotations.readOnlyHint).toBe(false);
    expect(add.annotations.idempotentHint).toBe(false);
    expect(add.annotations.destructiveHint).toBe(false);
    // DELETE + danger role → destructive; DELETE is HTTP-idempotent
    expect(del.annotations.destructiveHint).toBe(true);
    expect(del.annotations.idempotentHint).toBe(true);
    expect(del.annotations.readOnlyHint).toBe(false);
  });

  test('binding defaults to the DOM control, not the endpoint', () => {
    expect(add.binding.type).toBe('dom-form'); // <form>
    expect(del.binding.type).toBe('dom-element'); // <button>
    expect((add.binding as any).endpoint).toBe('/api/cart/add'); // recorded as fallback
  });

  test('description combines description + on-success', () => {
    expect(add.description).toContain('Add this product to the cart');
    expect(add.description).toContain('Cart updated.');
    expect(add.resource).toBe('SKU-1'); // action inside a resource → target id
  });

  test('safe GET action is read-only and idempotent', () => {
    const t = toWebMCPTools(extractAll(dom(
      `<html><body><a data-agent="action" data-agent-name="view" data-agent-method="GET" data-agent-endpoint="/x">v</a></body></html>`
    )))[0];
    expect(t.annotations.readOnlyHint).toBe(true);
    expect(t.annotations.idempotentHint).toBe(true);
    expect(t.annotations.humanConfirmationHint).toBeUndefined();
  });
});

describe('registerWebMCPTools — runtime binding', () => {
  test('registers one tool per action with the host', () => {
    const registered: any[] = [];
    const host: ModelContextHost = { registerTool: (d) => { registered.push(d); return { unregister() {} }; } };
    const reg = registerWebMCPTools(extractAll(dom(CART)), host);
    expect(registered.map((d) => d.name).sort()).toEqual(['add_to_cart', 'delete_item']);
    expect(registered[0].inputSchema).toBeDefined();
    expect(typeof registered[0].execute).toBe('function');
    reg.unregister();
  });

  test('execute writes args to the live input and calls form.requestSubmit', async () => {
    // Real-ish form with a spy on requestSubmit and a live input.
    const requestSubmit = vi.fn();
    const input: any = { tagName: 'INPUT', type: 'number', value: '1' };
    const form: any = { tagName: 'FORM', requestSubmit };
    input.form = form;
    // Hand-build an extraction-like result pointing at these fake elements.
    const result: any = {
      meta: {}, resources: [], actions: [{
        name: 'add', method: 'POST', endpoint: '/api/cart/add', params: [
          { name: 'quantity', typehint: 'integer', required: true, value: '1', disabled: false, element: input },
        ], hints: { humanPreferred: false, risk: 'low' }, idempotent: false, element: form,
      }],
    };
    const host: ModelContextHost = { registerTool: (d) => { host._d = d; return {}; } } as any;
    registerWebMCPTools(result, host);
    await (host as any)._d.execute({ quantity: 5 });
    expect(input.value).toBe('5');           // arg written to the live input
    expect(requestSubmit).toHaveBeenCalled(); // submitted via the real control
  });

  test('a confirmation-required tool refuses without onConfirm, runs with it', async () => {
    const requestSubmit = vi.fn();
    const form: any = { tagName: 'FORM', requestSubmit };
    const result: any = {
      meta: {}, resources: [], actions: [{
        name: 'checkout', method: 'POST', endpoint: '/api/checkout', params: [],
        hints: { humanPreferred: true }, element: form,
      }],
    };
    let d: any;
    registerWebMCPTools(result, { registerTool: (x) => { d = x; return {}; } });
    await expect(d.execute({})).rejects.toThrow(/human confirmation/i);
    expect(requestSubmit).not.toHaveBeenCalled();

    registerWebMCPTools(result, { registerTool: (x) => { d = x; return {}; } }, { onConfirm: () => true });
    await d.execute({});
    expect(requestSubmit).toHaveBeenCalled();
  });
});
