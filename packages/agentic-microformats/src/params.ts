import type { AgentElement } from './dom.js';
import type { Parameter, TypeHint } from './types.js';
import { coerceValue } from './coerce.js';

const TYPE_HINTS: readonly string[] = [
  'string', 'number', 'integer', 'boolean', 'currency',
  'date', 'datetime', 'url', 'email', 'enum', 'json',
];

function getInputValue(el: AgentElement): string | null {
  const tagName = el.tagName.toUpperCase();

  if (tagName === 'SELECT') {
    const selected = el.querySelector('option[selected]');
    if (selected) return selected.getAttribute('value') ?? selected.textContent;
    const first = el.querySelector('option');
    return first ? (first.getAttribute('value') ?? first.textContent) : null;
  }

  const type = el.getAttribute('type')?.toLowerCase();
  if (type === 'checkbox') {
    return el.hasAttribute('checked') ? 'true' : 'false';
  }

  return el.getAttribute('value');
}

export function extractParameters(actionEl: AgentElement): Parameter[] {
  const paramEls = actionEl.querySelectorAll('[data-agent-param]');
  const params: Parameter[] = [];

  for (let i = 0; i < paramEls.length; i++) {
    const el = paramEls[i];
    const name = el.getAttribute('data-agent-param');
    if (!name) continue;

    const typehintAttr = el.getAttribute('data-agent-typehint');
    const typehint: TypeHint = typehintAttr && TYPE_HINTS.includes(typehintAttr)
      ? typehintAttr as TypeHint
      : 'string';

    const required =
      el.hasAttribute('required') ||
      el.getAttribute('data-agent-required') === 'true' ||
      el.getAttribute('aria-required') === 'true';

    const disabled = el.hasAttribute('disabled');

    const parseBound = (attr: string): number | undefined => {
      const v = el.getAttribute(attr);
      if (v === null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    params.push({
      name,
      typehint,
      required,
      value: getInputValue(el),
      disabled,
      min: parseBound('data-agent-min'),
      max: parseBound('data-agent-max'),
      element: el,
    });
  }

  return params;
}

// Keys that would let a crafted parameter name reach into Object.prototype.
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function buildNestedParams(params: Parameter[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const param of params) {
    if (param.disabled) continue;
    if (param.value === null) continue;

    const parts = param.name.split('.');
    // Prototype-pollution guard (hardened 0.3.2): a name like
    // "__proto__.polluted" must never mutate Object.prototype. Reject the
    // whole parameter if any path segment is a dangerous key.
    if (parts.some((p) => FORBIDDEN_KEYS.has(p))) continue;

    const coerced = coerceValue(param.value, param.typehint);
    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const own = Object.prototype.hasOwnProperty.call(current, key);
      if (!own || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = coerced;
  }

  return result;
}
