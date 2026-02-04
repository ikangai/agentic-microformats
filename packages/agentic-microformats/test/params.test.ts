import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractParameters, buildNestedParams } from '../src/params.js';
import type { AgentElement } from '../src/dom.js';

function el(html: string): AgentElement {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return document.body.firstElementChild as unknown as AgentElement;
}

describe('extractParameters', () => {
  test('extracts simple parameters', () => {
    const form = el(`
      <form>
        <input data-agent-param="name" value="Widget">
        <input data-agent-param="quantity" data-agent-typehint="integer" value="2">
      </form>
    `);
    const params = extractParameters(form);
    expect(params).toHaveLength(2);
    expect(params[0].name).toBe('name');
    expect(params[0].value).toBe('Widget');
    expect(params[0].typehint).toBe('string');
    expect(params[1].name).toBe('quantity');
    expect(params[1].typehint).toBe('integer');
  });

  test('detects required from HTML required attribute', () => {
    const form = el('<form><input data-agent-param="name" required></form>');
    expect(extractParameters(form)[0].required).toBe(true);
  });

  test('detects required from data-agent-required', () => {
    const form = el('<form><input data-agent-param="name" data-agent-required="true"></form>');
    expect(extractParameters(form)[0].required).toBe(true);
  });

  test('detects required from aria-required', () => {
    const form = el('<form><input data-agent-param="name" aria-required="true"></form>');
    expect(extractParameters(form)[0].required).toBe(true);
  });

  test('detects disabled', () => {
    const form = el('<form><input data-agent-param="name" disabled></form>');
    expect(extractParameters(form)[0].disabled).toBe(true);
  });

  test('reads select value', () => {
    const form = el(`
      <form>
        <select data-agent-param="theme">
          <option value="light">Light</option>
          <option value="dark" selected>Dark</option>
        </select>
      </form>
    `);
    const params = extractParameters(form);
    expect(params[0].value).toBe('dark');
  });

  test('reads checkbox as boolean string', () => {
    const form = el(`
      <form>
        <input data-agent-param="subscribe" data-agent-typehint="boolean" type="checkbox" checked>
      </form>
    `);
    const params = extractParameters(form);
    expect(params[0].value).toBe('true');
  });

  test('reads unchecked checkbox as false', () => {
    const form = el(`
      <form>
        <input data-agent-param="subscribe" data-agent-typehint="boolean" type="checkbox">
      </form>
    `);
    const params = extractParameters(form);
    expect(params[0].value).toBe('false');
  });
});

describe('buildNestedParams', () => {
  test('flat params stay flat', () => {
    const result = buildNestedParams([
      { name: 'name', value: 'Widget', typehint: 'string', required: false, disabled: false, element: {} as AgentElement },
    ]);
    expect(result).toEqual({ name: 'Widget' });
  });

  test('dot notation creates nested objects', () => {
    const result = buildNestedParams([
      { name: 'user.profile.name', value: 'Martin', typehint: 'string', required: false, disabled: false, element: {} as AgentElement },
      { name: 'user.profile.email', value: 'martin@example.com', typehint: 'email', required: false, disabled: false, element: {} as AgentElement },
      { name: 'user.preferences.theme', value: 'dark', typehint: 'string', required: false, disabled: false, element: {} as AgentElement },
    ]);
    expect(result).toEqual({
      user: {
        profile: { name: 'Martin', email: 'martin@example.com' },
        preferences: { theme: 'dark' },
      },
    });
  });

  test('skips disabled params', () => {
    const result = buildNestedParams([
      { name: 'name', value: 'Widget', typehint: 'string', required: false, disabled: false, element: {} as AgentElement },
      { name: 'secret', value: 'x', typehint: 'string', required: false, disabled: true, element: {} as AgentElement },
    ]);
    expect(result).toEqual({ name: 'Widget' });
  });

  test('coerces values by typehint', () => {
    const result = buildNestedParams([
      { name: 'quantity', value: '2', typehint: 'integer', required: false, disabled: false, element: {} as AgentElement },
      { name: 'active', value: 'true', typehint: 'boolean', required: false, disabled: false, element: {} as AgentElement },
    ]);
    expect(result).toEqual({ quantity: 2, active: true });
  });
});
