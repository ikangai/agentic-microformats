import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractAll } from '../src/extract.js';
import { toGraph, toGraphJSON } from '../src/serialize.js';
import {
  analyzeIntent, tokenize, selectTools, compactGraph, expandGraph,
  toCompactGraph, toCompactGraphJSON, COMPACT_FORMAT_VERSION,
} from '../src/select.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  return parseHTML(html).document.documentElement as unknown as AgentElement;
}

/** A catalog: N sibling products, each with an identical add_to_cart template. */
function catalog(products: Array<{ sku: string; name: string; price: string; desc?: string }>): string {
  const cards = products.map((p) => `
    <div data-agent="resource" data-agent-type="product" data-agent-id="${p.sku}">
      <span data-agent-prop="name">${p.name}</span>
      <span data-agent-prop="description">${p.desc ?? 'A useful thing.'}</span>
      <span data-agent-prop="price" data-agent-typehint="currency" data-agent-currency="EUR">${p.price}</span>
      <form data-agent="action" data-agent-name="add_to_cart" data-agent-method="POST"
            data-agent-endpoint="/api/cart/add" data-agent-target="${p.sku}"
            data-agent-description="Add this product to the shopping cart"
            data-agent-risk="low" data-agent-role="primary">
        <input data-agent-param="product_id" type="hidden" value="${p.sku}">
        <input data-agent-param="quantity" data-agent-typehint="integer"
               data-agent-min="1" data-agent-max="10" value="1" required>
      </form>
    </div>`).join('');
  return `<!DOCTYPE html><html><body>
    <nav><a data-agent="action" data-agent-name="view_cart" data-agent-method="GET"
            data-agent-endpoint="/cart">Cart</a></nav>
    ${cards}
  </body></html>`;
}

const PRODUCTS = [
  { sku: 'SKU-USB-C-2M', name: 'USB-C Cable 2m', price: '14.99' },
  { sku: 'SKU-HDMI-3M', name: 'HDMI 2.1 Cable 3m', price: '19.99' },
  { sku: 'SKU-CHARGER-65W', name: 'USB-C Charger 65W', price: '39.99' },
  { sku: 'SKU-HUB-7PORT', name: 'USB Hub 7-Port', price: '49.99' },
  { sku: 'SKU-STAND-LAPTOP', name: 'Aluminum Laptop Stand', price: '34.99' },
  { sku: 'SKU-MONITOR-27', name: '27-inch 4K Monitor', price: '329.00' },
];

const result = extractAll(dom(catalog(PRODUCTS)));

// ---------------------------------------------------------------------------

describe('intent analysis', () => {
  test('tokenizes camelCase, snake_case and punctuation alike', () => {
    expect(tokenize('addToCart')).toEqual(['add', 'to', 'cart']);
    expect(tokenize('add_to_cart')).toEqual(['add', 'to', 'cart']);
    expect(tokenize('USB-C Charger 65W')).toEqual(['usb', 'c', 'charger', '65w']);
  });

  test('drops stopwords and singularizes', () => {
    const a = analyzeIntent('Add the products to the cart');
    expect(a.tokens).toContain('product');
    expect(a.tokens).not.toContain('the');
  });

  test('flags superlatives as aggregate intents', () => {
    expect(analyzeIntent('Add the cheapest product to the cart').aggregate).toBe(true);
    expect(analyzeIntent('Open the most expensive product').aggregate).toBe(true);
    expect(analyzeIntent('How many items are in the cart?').aggregate).toBe(true);
    expect(analyzeIntent('Add the two cheapest products').aggregate).toBe(true);
  });

  test('a named-entity intent is not aggregate', () => {
    const a = analyzeIntent('Add exactly 3 units of the USB-C Charger 65W to the cart');
    expect(a.aggregate).toBe(false);
    expect(a.tokens).toEqual(expect.arrayContaining(['charger', '65w']));
  });
});

// ---------------------------------------------------------------------------

describe('selectTools — narrowing', () => {
  test('narrows a catalog to the named product', () => {
    const s = selectTools(result, 'Add exactly 3 units of the USB-C Charger 65W to the cart');
    expect(s.narrowed).toBe(true);
    expect(s.result.resources.map((r) => r.id)).toContain('SKU-CHARGER-65W');
    expect(s.shown).toBeLessThan(s.total);
    // The best-scoring resource is the one the intent actually names.
    expect(s.trace[0].ref).toBe('product#SKU-CHARGER-65W');
  });

  test('page-level actions survive narrowing (the way off a wrong page)', () => {
    const s = selectTools(result, 'Add exactly 3 units of the USB-C Charger 65W to the cart');
    expect(s.result.actions.map((a) => a.name)).toContain('view_cart');
  });

  test('preserves document order among survivors', () => {
    const s = selectTools(result, 'HDMI cable and USB-C Charger 65W');
    const ids = s.result.resources.map((r) => r.id);
    expect(ids).toEqual([...ids].sort((a, b) =>
      PRODUCTS.findIndex((p) => p.sku === a) - PRODUCTS.findIndex((p) => p.sku === b)));
  });

  test('DOM element references survive, so prepareAction still works', () => {
    const s = selectTools(result, 'USB-C Charger 65W');
    const action = s.result.resources[0].actions[0];
    expect(action.element).toBeTruthy();
  });
});

describe('selectTools — fails open', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['aggregate intent', 'Add the cheapest product in the catalog to the cart', /aggregate intent/],
    ['no content tokens', 'the it of', /no content tokens/],
    ['nothing matched', 'refinance my mortgage', /no discriminating match/],
  ];
  for (const [label, intent, reason] of cases) {
    test(`${label} → full graph returned`, () => {
      const s = selectTools(result, intent);
      expect(s.narrowed).toBe(false);
      expect(s.reason).toMatch(reason);
      expect(s.result.resources).toHaveLength(PRODUCTS.length);
    });
  }

  test('small collections are left alone', () => {
    const small = extractAll(dom(catalog(PRODUCTS.slice(0, 2))));
    const s = selectTools(small, 'USB-C Charger 65W');
    expect(s.narrowed).toBe(false);
    expect(s.reason).toMatch(/below the .* floor/);
  });

  test('an intent made only of page-wide vocabulary drops nothing', () => {
    // Every product card carries "add_to_cart", so these tokens have idf 0 —
    // the intent says nothing about *which* product, and narrowing on it would
    // be a coin flip dressed up as relevance.
    const s = selectTools(result, 'add product to cart');
    expect(s.narrowed).toBe(false);
    expect(s.reason).toMatch(/no discriminating match/);
  });

  test('narrow:false disables narrowing outright', () => {
    const s = selectTools(result, 'USB-C Charger 65W', { narrow: false });
    expect(s.narrowed).toBe(false);
    expect(s.result.resources).toHaveLength(PRODUCTS.length);
  });

  test('narrow:true overrides the aggregate guard when the caller insists', () => {
    const s = selectTools(result, 'the cheapest charger', { narrow: true });
    expect(s.narrowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('compactGraph — lossless template hoisting', () => {
  const graph = toGraph(result);

  test('hoists the repeated action into one template', () => {
    const c = compactGraph(graph);
    expect(c.agentGraphCompact).toBe(COMPACT_FORMAT_VERSION);
    const templates = c.actionTemplates as Record<string, any>;
    expect(Object.keys(templates)).toHaveLength(1);
    expect(templates.t1.name).toBe('add_to_cart');
    // Shared param values stay in the template; per-instance ones move out.
    const quantity = templates.t1.params.find((p: any) => p.name === 'quantity');
    expect(quantity.value).toBe('1');
    const productId = templates.t1.params.find((p: any) => p.name === 'product_id');
    expect(productId).not.toHaveProperty('value');
  });

  test('each instance keeps only what differs', () => {
    const c = compactGraph(graph);
    const ref = (c.resources as any[])[0].actions[0];
    expect(ref).toEqual({
      $template: 't1',
      target: 'SKU-USB-C-2M',
      params: { product_id: 'SKU-USB-C-2M' },
    });
  });

  test('a single-occurrence action is left inline', () => {
    const c = compactGraph(graph);
    // view_cart occurs once — templating it would cost more than it saves.
    expect((c.actions as any[])[0]).not.toHaveProperty('$template');
    expect((c.actions as any[])[0].name).toBe('view_cart');
  });

  test('round-trips byte-identically to the canonical graph', () => {
    const restored = expandGraph(compactGraph(graph));
    expect(JSON.stringify(restored)).toBe(toGraphJSON(result));
  });

  test('round-trips on nested child resources too', () => {
    const nested = extractAll(dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="cart" data-agent-id="c1">
        ${[1, 2, 3].map((i) => `
        <div data-agent="resource" data-agent-type="cart-item" data-agent-id="i${i}">
          <span data-agent-prop="name">Item ${i}</span>
          <button data-agent="action" data-agent-name="remove" data-agent-method="DELETE"
                  data-agent-endpoint="/api/cart/i${i}" data-agent-target="i${i}"
                  data-agent-role="danger">x</button>
        </div>`).join('')}
      </div></body></html>`));
    const g = toGraph(nested);
    const c = compactGraph(g);
    // Endpoints differ per item, so the endpoint is pushed out of the template.
    expect((c.actionTemplates as any).t1).not.toHaveProperty('endpoint');
    expect(JSON.stringify(expandGraph(c))).toBe(toGraphJSON(nested));
  });

  test('a graph with no repetition is returned unmarked and unchanged', () => {
    const single = extractAll(dom(catalog(PRODUCTS.slice(0, 1))));
    const g = toGraph(single);
    const c = compactGraph(g);
    expect(c).not.toHaveProperty('agentGraphCompact');
    expect(c).not.toHaveProperty('actionTemplates');
    expect(JSON.stringify(expandGraph(c))).toBe(JSON.stringify(g));
  });

  test('never merges two genuinely different actions', () => {
    const mixed = extractAll(dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="x" data-agent-id="a">
        <button data-agent="action" data-agent-name="go" data-agent-method="POST"
                data-agent-endpoint="/api/go" data-agent-risk="low">a</button></div>
      <div data-agent="resource" data-agent-type="x" data-agent-id="b">
        <button data-agent="action" data-agent-name="go" data-agent-method="POST"
                data-agent-endpoint="/api/go" data-agent-risk="high">b</button></div>
    </body></html>`));
    const c = compactGraph(toGraph(mixed));
    // Same name and endpoint but a different risk hint — must not share a template.
    expect(c).not.toHaveProperty('actionTemplates');
    expect(JSON.stringify(expandGraph(c))).toBe(toGraphJSON(mixed));
  });

  test('materially shrinks a collection graph', () => {
    const before = toGraphJSON(result).length;
    const after = JSON.stringify(compactGraph(toGraph(result))).length;
    expect(after).toBeLessThan(before * 0.75);
  });
});

// ---------------------------------------------------------------------------

describe('narrowed views announce themselves', () => {
  test('a pruned graph carries a selection note', () => {
    const s = selectTools(result, 'USB-C Charger 65W');
    const c = toCompactGraph(result, s);
    expect((c.selection as any).narrowed).toBe(true);
    expect((c.selection as any).resourcesTotal).toBe(PRODUCTS.length);
    expect((c.selection as any).note).toMatch(/FILTERED view/);
  });

  test('an unpruned graph carries no note', () => {
    const s = selectTools(result, 'the cheapest product');
    expect(toCompactGraph(result, s)).not.toHaveProperty('selection');
  });

  test('toCompactGraphJSON serializes the selected result', () => {
    const s = selectTools(result, 'USB-C Charger 65W');
    const json = toCompactGraphJSON(result, s);
    expect(json).toContain('SKU-CHARGER-65W');
    expect(JSON.parse(json).resources.length).toBe(s.shown);
  });
});
