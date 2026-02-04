import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractMeta, extractResources, extractActions, extractAll } from '../src/extract.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  const { document } = parseHTML(html);
  return document.documentElement as unknown as AgentElement;
}

describe('extractMeta', () => {
  test('parses data-agent-meta script', () => {
    const root = dom(`<!DOCTYPE html><html><head></head><body>
      <script type="application/json" data-agent-meta>
      {"provider":{"name":"Test Co"},"defaults":{"currency":"EUR"}}
      </script>
    </body></html>`);
    const meta = extractMeta(root);
    expect(meta.provider?.name).toBe('Test Co');
    expect(meta.defaults?.currency).toBe('EUR');
  });

  test('returns empty object when no meta', () => {
    const root = dom('<!DOCTYPE html><html><body></body></html>');
    const meta = extractMeta(root);
    expect(meta).toEqual({});
  });

  test('parses agent policies', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <script type="application/json" data-agent-meta>
      {"agent_policies":{"rate_limit":{"requests_per_minute":60},"require_auth":true}}
      </script>
    </body></html>`);
    const meta = extractMeta(root);
    expect(meta.agentPolicies?.rateLimit?.requestsPerMinute).toBe(60);
    expect(meta.agentPolicies?.requireAuth).toBe(true);
  });
});

describe('extractResources', () => {
  test('extracts a simple resource with properties', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="product" data-agent-id="SKU-1">
        <span data-agent-prop="name">Widget</span>
        <span data-agent-prop="price" data-agent-typehint="currency" data-agent-currency="EUR">14.99</span>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources).toHaveLength(1);
    expect(resources[0].type).toBe('product');
    expect(resources[0].id).toBe('SKU-1');
    expect(resources[0].properties.name.rawValue).toBe('Widget');
    expect(resources[0].properties.price.value).toBe(14.99);
    expect(resources[0].properties.price.currency).toBe('EUR');
  });

  test('uses data-agent-value when present', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <span data-agent-prop="due_date" data-agent-typehint="date" data-agent-value="2025-03-31">31. März 2025</span>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources[0].properties.due_date.rawValue).toBe('2025-03-31');
    expect(resources[0].properties.due_date.value).toBe('2025-03-31');
  });

  test('extracts actions within a resource', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <button data-agent="action" data-agent-name="approve"
                data-agent-method="POST" data-agent-endpoint="/approve">Approve</button>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources[0].actions).toHaveLength(1);
    expect(resources[0].actions[0].name).toBe('approve');
    expect(resources[0].actions[0].target).toBe('P1');
  });

  test('action inherits target from nearest resource', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="ticket" data-agent-id="T-91">
        <button data-agent="action" data-agent-name="close"
                data-agent-method="POST" data-agent-endpoint="/close">Close</button>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources[0].actions[0].target).toBe('T-91');
  });

  test('explicit target overrides inherited', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="ticket" data-agent-id="T-91">
        <button data-agent="action" data-agent-name="link"
                data-agent-target="T-92"
                data-agent-method="POST" data-agent-endpoint="/link">Link</button>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources[0].actions[0].target).toBe('T-92');
  });

  test('skips resources in untrusted regions', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <main data-agent-trust="system">
        <div data-agent="resource" data-agent-type="product" data-agent-id="P1">
          <span data-agent-prop="name">Real</span>
        </div>
      </main>
      <section data-agent-trust="untrusted">
        <div data-agent="resource" data-agent-type="product" data-agent-id="FAKE">
          <span data-agent-prop="name">Fake</span>
        </div>
      </section>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe('P1');
  });

  test('skips resources in ignored regions', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="product" data-agent-id="P1">
        <span data-agent-prop="name">Visible</span>
      </div>
      <aside data-agent-ignore="true">
        <div data-agent="resource" data-agent-type="product" data-agent-id="P2">
          <span data-agent-prop="name">Ignored</span>
        </div>
      </aside>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe('P1');
  });

  test('handles nested resources', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="order" data-agent-id="ORD-1">
        <span data-agent-prop="status">processing</span>
        <div data-agent="resource" data-agent-type="order-item" data-agent-id="ITEM-1">
          <span data-agent-prop="product_name">Widget</span>
        </div>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe('ORD-1');
    expect(resources[0].children).toHaveLength(1);
    expect(resources[0].children[0].id).toBe('ITEM-1');
    expect(resources[0].children[0].properties.product_name.rawValue).toBe('Widget');
  });

  test('extracts description with fallback chain', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <button data-agent="action" data-agent-name="delete"
                data-agent-description="Permanently delete this project">Delete</button>
      </div>
    </body></html>`);
    expect(extractResources(root)[0].actions[0].description).toBe('Permanently delete this project');
  });

  test('falls back to aria-label for description', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <button data-agent="action" data-agent-name="archive"
                aria-label="Archive this project">Archive</button>
      </div>
    </body></html>`);
    expect(extractResources(root)[0].actions[0].description).toBe('Archive this project');
  });

  test('extracts headers from action', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <form data-agent="action" data-agent-name="submit"
            data-agent-method="POST" data-agent-endpoint="/api"
            data-agent-headers='{"Content-Type":"application/json"}'>
      </form>
    </body></html>`);
    const actions = extractActions(root);
    expect(actions[0].headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('extractActions', () => {
  test('extracts standalone actions (not in a resource)', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <button data-agent="action" data-agent-name="inside">Inside</button>
      </div>
      <form data-agent="action" data-agent-name="create_project"
            data-agent-method="POST" data-agent-endpoint="/api/projects">
        <input data-agent-param="name" required>
      </form>
    </body></html>`);
    const actions = extractActions(root);
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe('create_project');
    expect(actions[0].params).toHaveLength(1);
  });
});

describe('extractAll', () => {
  test('extracts everything from product page example', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <script type="application/json" data-agent-meta>
      {"provider":{"name":"Example Shop GmbH"},"defaults":{"currency":"EUR"}}
      </script>
      <main data-agent-trust="system">
        <article data-agent="resource" data-agent-type="product" data-agent-id="SKU-USB-C-2M">
          <h1 data-agent-prop="name">USB-C Cable 2m</h1>
          <span data-agent-prop="price" data-agent-typehint="currency" data-agent-currency="EUR">14.99</span>
          <form data-agent="action" data-agent-name="add_to_cart"
                data-agent-method="POST" data-agent-endpoint="/cart/add"
                data-agent-role="primary">
            <input data-agent-param="product_id" type="hidden" value="SKU-USB-C-2M">
            <input data-agent-param="quantity" data-agent-typehint="integer" type="number" value="1" required>
          </form>
        </article>
      </main>
      <section data-agent-trust="untrusted"></section>
    </body></html>`);

    const result = extractAll(root);
    expect(result.meta.provider?.name).toBe('Example Shop GmbH');
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].properties.price.value).toBe(14.99);
    expect(result.resources[0].actions[0].name).toBe('add_to_cart');
    expect(result.resources[0].actions[0].params).toHaveLength(2);
    expect(result.actions).toHaveLength(0);
  });
});
