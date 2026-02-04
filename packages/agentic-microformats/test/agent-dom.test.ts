import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';
import { AgentDOM } from '../src/agent-dom.js';
import type { AgentElement } from '../src/dom.js';

function domFromHtml(html: string): AgentElement {
  const { document } = parseHTML(html);
  return document.documentElement as unknown as AgentElement;
}

function domFromFile(relativePath: string): AgentElement {
  const absPath = resolve('/Users/martintreiber/Documents/Development/CompassAI/agentic-microformats', relativePath);
  const html = readFileSync(absPath, 'utf-8');
  return domFromHtml(html);
}

describe('AgentDOM', () => {
  test('parses product page example', () => {
    const root = domFromFile('examples/ecommerce/product-page.html');
    const agent = new AgentDOM(root);

    expect(agent.meta.provider?.name).toBe('Example Shop GmbH');
    expect(agent.meta.defaults?.currency).toBe('EUR');
    expect(agent.resources).toHaveLength(1);

    const product = agent.resources[0];
    expect(product.type).toBe('product');
    expect(product.id).toBe('SKU-USB-C-2M');
    expect(product.properties.name.rawValue).toBe('USB-C Cable 2m');
    expect(product.properties.price.value).toBe(14.99);
    expect(product.properties.price.currency).toBe('EUR');
    expect(product.properties.rating.value).toBe(4.7);
    expect(product.properties.rating_count.value).toBe(246);
  });

  test('parses project dashboard example', () => {
    const root = domFromFile('examples/basic/project-dashboard.html');
    const agent = new AgentDOM(root);

    expect(agent.resources).toHaveLength(2);
    expect(agent.meta.agentPolicies?.rateLimit?.requestsPerMinute).toBe(60);

    const prj1 = agent.getResource('PRJ-2025-001');
    expect(prj1).toBeDefined();
    expect(prj1!.properties.progress.value).toBe(65);
    expect(prj1!.properties.due_date.rawValue).toBe('2025-03-31');
    expect(prj1!.actions).toHaveLength(4);

    const deleteAction = agent.getAction('delete', 'PRJ-2025-001');
    expect(deleteAction).toBeDefined();
    expect(deleteAction!.hints.risk).toBe('high');
    expect(deleteAction!.hints.reversible).toBe(false);
    expect(deleteAction!.hints.humanPreferred).toBe(true);

    // Standalone action
    expect(agent.actions).toHaveLength(1);
    expect(agent.actions[0].name).toBe('create_project');
  });

  test('parses nested parameters example', () => {
    const root = domFromFile('examples/forms/nested-parameters.html');
    const agent = new AgentDOM(root);

    expect(agent.actions).toHaveLength(1);
    const action = agent.actions[0];
    expect(action.name).toBe('update_user_settings');
    expect(action.method).toBe('PUT');
    expect(action.params.length).toBeGreaterThan(5);
  });

  test('getResource returns undefined for missing id', () => {
    const root = domFromHtml('<!DOCTYPE html><html><body></body></html>');
    const agent = new AgentDOM(root);
    expect(agent.getResource('nope')).toBeUndefined();
  });

  test('getAction finds by name', () => {
    const root = domFromHtml(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="save" data-agent-method="POST">Save</button>
    </body></html>`);
    const agent = new AgentDOM(root);
    expect(agent.getAction('save')).toBeDefined();
  });

  test('prepareAction builds request with confirmation', () => {
    const root = domFromHtml(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <button data-agent="action" data-agent-name="delete"
                data-agent-method="DELETE" data-agent-endpoint="/api/projects/P1"
                data-agent-risk="high" data-agent-reversible="false"
                data-agent-cost="100" data-agent-cost-currency="EUR">Delete</button>
      </div>
    </body></html>`);
    const agent = new AgentDOM(root);
    const action = agent.getAction('delete', 'P1')!;
    const prepared = agent.prepareAction(action);

    expect(prepared.method).toBe('DELETE');
    expect(prepared.url).toBe('/api/projects/P1');
    expect(prepared.confirmationRequired).toBe(true);
    expect(prepared.warnings).toContain('High risk action');
    expect(prepared.warnings).toContain('Irreversible action');
    expect(prepared.warnings.some(w => w.includes('100'))).toBe(true);
  });

  test('prepareAction merges provided param values', () => {
    const root = domFromHtml(`<!DOCTYPE html><html><body>
      <form data-agent="action" data-agent-name="create"
            data-agent-method="POST" data-agent-endpoint="/api/items"
            data-agent-headers='{"Content-Type":"application/json"}'>
        <input data-agent-param="name" value="">
        <input data-agent-param="count" data-agent-typehint="integer" value="0">
      </form>
    </body></html>`);
    const agent = new AgentDOM(root);
    const action = agent.getAction('create')!;
    const prepared = agent.prepareAction(action, { name: 'Widget', count: 5 });

    expect(prepared.body).toEqual({ name: 'Widget', count: 5 });
    expect(prepared.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(prepared.confirmationRequired).toBe(false);
  });

  test('extract() forces re-parse', () => {
    const root = domFromHtml(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="item" data-agent-id="I1">
        <span data-agent-prop="name">First</span>
      </div>
    </body></html>`);
    const agent = new AgentDOM(root);
    expect(agent.resources).toHaveLength(1);
    const result = agent.extract();
    expect(result.resources).toHaveLength(1);
  });
});
