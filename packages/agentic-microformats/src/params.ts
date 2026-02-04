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

    params.push({
      name,
      typehint,
      required,
      value: getInputValue(el),
      disabled,
      element: el,
    });
  }

  return params;
}

export function buildNestedParams(params: Parameter[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const param of params) {
    if (param.disabled) continue;
    if (param.value === null) continue;

    const coerced = coerceValue(param.value, param.typehint);
    const parts = param.name.split('.');
    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = coerced;
  }

  return result;
}
