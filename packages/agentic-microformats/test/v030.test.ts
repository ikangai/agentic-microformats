import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractAll, extractActions, extractResources } from '../src/extract.js';
import { toGraph, toGraphJSON, GRAPH_FORMAT_VERSION } from '../src/serialize.js';
import { validate } from '../src/validate.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  const { document } = parseHTML(html);
  return document.documentElement as unknown as AgentElement;
}

describe('spec 0.3.0 — repeated properties', () => {
  const html = `<!DOCTYPE html><html><body>
    <div data-agent="resource" data-agent-type="release" data-agent-id="v2.6.0">
      <p data-agent-prop="deprecation">/v1/render -> /v2/render/jobs</p>
      <p data-agent-prop="deprecation">renderSync() -> renderAsync()</p>
      <p data-agent-prop="version">v2.6.0</p>
    </div>
  </body></html>`;

  test('collects all occurrences in document order', () => {
    const [r] = extractResources(dom(html));
    const dep = r.properties.deprecation;
    expect(dep.value).toBe('/v1/render -> /v2/render/jobs'); // first wins
    expect(dep.values).toEqual([
      '/v1/render -> /v2/render/jobs',
      'renderSync() -> renderAsync()',
    ]);
    expect(dep.rawValues).toHaveLength(2);
  });

  test('single properties carry no values array', () => {
    const [r] = extractResources(dom(html));
    expect(r.properties.version.values).toBeUndefined();
  });
});

describe('spec 0.3.0 — data-agent-idempotent', () => {
  test('parses true/false and omits when absent', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="update" data-agent-idempotent="true">U</button>
      <button data-agent="action" data-agent-name="add" data-agent-idempotent="false">A</button>
      <button data-agent="action" data-agent-name="plain">P</button>
    </body></html>`);
    const actions = extractActions(root);
    expect(actions.find((a) => a.name === 'update')?.idempotent).toBe(true);
    expect(actions.find((a) => a.name === 'add')?.idempotent).toBe(false);
    expect(actions.find((a) => a.name === 'plain')?.idempotent).toBeUndefined();
  });
});

describe('canonical graph serialization', () => {
  const html = `<!DOCTYPE html><html><body>
    <article data-agent="resource" data-agent-type="product" data-agent-id="SKU-1">
      <h1 data-agent-prop="name">Widget</h1>
      <span data-agent-prop="price" data-agent-typehint="currency" data-agent-currency="EUR">14.99</span>
      <form data-agent="action" data-agent-name="add_to_cart" data-agent-method="POST"
            data-agent-endpoint="/api/cart/add" data-agent-idempotent="false"
            data-agent-risk="low">
        <input data-agent-param="quantity" data-agent-typehint="integer"
               data-agent-min="1" data-agent-max="10" value="1">
      </form>
    </article>
  </body></html>`;

  test('emits the canonical shape', () => {
    const graph: any = toGraph(extractAll(dom(html)));
    expect(graph.agentGraph).toBe(GRAPH_FORMAT_VERSION);
    const [r] = graph.resources;
    expect(r.type).toBe('product');
    expect(r.properties.name).toEqual({ value: 'Widget' }); // typehint "string" omitted
    expect(r.properties.price.typehint).toBe('currency');
    expect(r.properties.price.currency).toBe('EUR');
    const [a] = r.actions;
    expect(a.method).toBe('POST');
    expect(a.idempotent).toBe(false);
    expect(a.hints).toEqual({ risk: 'low' });
    expect(a.params[0]).toMatchObject({ name: 'quantity', typehint: 'integer', min: 1, max: 10 });
  });

  test('never serializes DOM elements and omits absent fields', () => {
    const json = toGraphJSON(extractAll(dom(html)));
    expect(json).not.toContain('element');
    expect(json).not.toContain('null');
    expect(json).not.toContain('humanPreferred'); // only present when true
  });
});

describe('validator', () => {
  test('clean annotated page produces no errors', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <article data-agent="resource" data-agent-type="product" data-agent-id="SKU-1">
        <a href="/p/1" data-agent-prop="url" data-agent-typehint="url" data-agent-value="/p/1">Widget</a>
        <button data-agent="action" data-agent-name="add" data-agent-method="POST"
                data-agent-endpoint="/api/add">Add</button>
      </article>
    </body></html>`);
    expect(validate(root).filter((i) => i.level === 'error')).toEqual([]);
  });

  test('flags unknown attributes, bad enums, invalid JSON', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="thing" data-agent-flavor="spicy"
           data-agent-headers='not json' data-agent-risk="extreme"></div>
    </body></html>`);
    const codes = validate(root).map((i) => i.code);
    expect(codes).toContain('invalid-enum');       // data-agent="thing", risk="extreme"
    expect(codes).toContain('unknown-attribute');  // data-agent-flavor
    expect(codes).toContain('invalid-json');       // headers
  });

  test('allows the x- extension prefix', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-x-custom="anything"></div>
    </body></html>`);
    expect(validate(root).filter((i) => i.code === 'unknown-attribute')).toEqual([]);
  });

  test('flags cross-origin endpoints without opt-out', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="x" data-agent-method="POST"
              data-agent-endpoint="https://evil.example/steal">Go</button>
    </body></html>`);
    expect(validate(root).some((i) => i.code === 'cross-origin-endpoint')).toBe(true);
  });

  test('accepts cross-origin with explicit opt-out or matching origin', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="x" data-agent-method="POST"
              data-agent-cross-origin="true"
              data-agent-endpoint="https://partner.example/api">Go</button>
      <button data-agent="action" data-agent-name="y" data-agent-method="POST"
              data-agent-endpoint="https://shop.example/api/add">Go</button>
    </body></html>`);
    const issues = validate(root, { origin: 'https://shop.example' });
    expect(issues.filter((i) => i.code === 'cross-origin-endpoint')).toEqual([]);
  });

  test('warns on non-navigable resources and duplicate ids', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="product" data-agent-id="SKU-1">
        <a href="/p/1">Widget</a>
      </div>
      <div data-agent="resource" data-agent-type="product" data-agent-id="SKU-1"></div>
    </body></html>`);
    const codes = validate(root).map((i) => i.code);
    expect(codes).toContain('resource-not-navigable');
    expect(codes).toContain('duplicate-id');
  });

  test('flags min greater than max', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <input data-agent-param="qty" data-agent-min="10" data-agent-max="1">
    </body></html>`);
    expect(validate(root).some((i) => i.code === 'min-gt-max')).toBe(true);
  });
});
