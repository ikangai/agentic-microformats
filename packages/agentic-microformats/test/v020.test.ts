import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractActions, extractMeta } from '../src/extract.js';
import { extractParameters } from '../src/params.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  const { document } = parseHTML(html);
  return document.documentElement as unknown as AgentElement;
}

describe('spec 0.2.0 — action attributes', () => {
  test('extracts data-agent-on-success', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="add_to_cart"
              data-agent-on-success="Item added. Navigate to /cart to view.">Add</button>
    </body></html>`);
    const [action] = extractActions(root);
    expect(action.onSuccess).toBe('Item added. Navigate to /cart to view.');
  });

  test('extracts data-agent-response as schema object', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="add_to_cart"
              data-agent-response='{"success":"boolean","cartCount":"integer"}'>Add</button>
    </body></html>`);
    const [action] = extractActions(root);
    expect(action.response).toEqual({ success: 'boolean', cartCount: 'integer' });
  });

  test('ignores invalid data-agent-response JSON', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="x"
              data-agent-response='not json'>Go</button>
    </body></html>`);
    const [action] = extractActions(root);
    expect(action.response).toBeUndefined();
  });

  test('omits onSuccess and response when absent', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="x">Go</button>
    </body></html>`);
    const [action] = extractActions(root);
    expect(action.onSuccess).toBeUndefined();
    expect(action.response).toBeUndefined();
  });
});

describe('spec 0.2.0 — parameter constraints', () => {
  test('extracts data-agent-min and data-agent-max as numbers', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <form data-agent="action" data-agent-name="add_to_cart">
        <input data-agent-param="quantity" data-agent-typehint="integer"
               data-agent-min="1" data-agent-max="10" value="1">
      </form>
    </body></html>`);
    const form = root.querySelector('[data-agent="action"]')!;
    const [param] = extractParameters(form);
    expect(param.min).toBe(1);
    expect(param.max).toBe(10);
  });

  test('omits min/max when absent or non-numeric', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <form data-agent="action" data-agent-name="x">
        <input data-agent-param="a" value="1">
        <input data-agent-param="b" data-agent-min="lots" value="2">
      </form>
    </body></html>`);
    const form = root.querySelector('[data-agent="action"]')!;
    const [a, b] = extractParameters(form);
    expect(a.min).toBeUndefined();
    expect(a.max).toBeUndefined();
    expect(b.min).toBeUndefined();
  });
});

describe('spec 0.2.0 — extended meta', () => {
  const metaHtml = `<!DOCTYPE html><html><body>
    <script type="application/json" data-agent-meta>
    {
      "page": { "type": "product-catalog" },
      "agent_policies": {
        "rate_limit": { "requests_per_minute": 30 },
        "errorFormat": { "success": "boolean", "message": "string" }
      },
      "workflow": {
        "graph": {
          "product-catalog": { "next": ["product-detail"] },
          "product-detail": { "next": ["shopping-cart"] }
        },
        "entryPoint": "product-catalog"
      },
      "actions": {
        "product-catalog": [
          { "name": "add_to_cart", "method": "POST", "endpoint": "/api/cart/add" }
        ]
      },
      "responseSchemas": {
        "add_to_cart": { "success": "boolean", "cartCount": "integer" }
      }
    }
    </script>
  </body></html>`;

  test('extracts workflow graph and entry point', () => {
    const meta = extractMeta(dom(metaHtml));
    expect(meta.workflow?.entryPoint).toBe('product-catalog');
    expect(meta.workflow?.graph?.['product-catalog']?.next).toEqual(['product-detail']);
  });

  test('extracts actions summary', () => {
    const meta = extractMeta(dom(metaHtml));
    expect(meta.actions?.['product-catalog']?.[0]).toEqual({
      name: 'add_to_cart',
      method: 'POST',
      endpoint: '/api/cart/add',
    });
  });

  test('extracts responseSchemas', () => {
    const meta = extractMeta(dom(metaHtml));
    expect(meta.responseSchemas?.add_to_cart).toEqual({
      success: 'boolean',
      cartCount: 'integer',
    });
  });

  test('extracts errorFormat from agent_policies', () => {
    const meta = extractMeta(dom(metaHtml));
    expect(meta.agentPolicies?.errorFormat).toEqual({
      success: 'boolean',
      message: 'string',
    });
  });
});
