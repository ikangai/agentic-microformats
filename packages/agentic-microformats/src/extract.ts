import type { AgentElement } from './dom.js';
import type {
  Resource, Action, Property, PageMeta, ExtractionResult,
  TypeHint, HttpMethod,
} from './types.js';
import { shouldSkip } from './trust.js';
import { extractHints } from './hints.js';
import { extractParameters } from './params.js';
import { coerceValue } from './coerce.js';

const TYPE_HINTS: readonly string[] = [
  'string', 'number', 'integer', 'boolean', 'currency',
  'date', 'datetime', 'url', 'email', 'enum', 'json',
];

const HTTP_METHODS: readonly string[] = [
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
];

function resolveDescription(el: AgentElement): string | undefined {
  const desc = el.getAttribute('data-agent-description');
  if (desc) return desc;

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const title = el.getAttribute('title');
  if (title) return title;

  return undefined;
}

function extractAction(el: AgentElement, inheritedTargetId?: string): Action {
  const name = el.getAttribute('data-agent-name') ?? '';
  const explicitTarget = el.getAttribute('data-agent-target');
  const target = explicitTarget ?? inheritedTargetId;
  const methodAttr = el.getAttribute('data-agent-method')?.toUpperCase();
  const method: HttpMethod = methodAttr && HTTP_METHODS.includes(methodAttr)
    ? methodAttr as HttpMethod
    : 'POST';
  const endpoint = el.getAttribute('data-agent-endpoint') ?? undefined;

  let headers: Record<string, string> | undefined;
  const headersAttr = el.getAttribute('data-agent-headers');
  if (headersAttr) {
    try {
      headers = JSON.parse(headersAttr);
    } catch {
      // ignore invalid JSON
    }
  }

  return {
    name,
    target,
    method,
    endpoint,
    params: extractParameters(el),
    headers,
    description: resolveDescription(el),
    hints: extractHints(el),
    element: el,
  };
}

function extractProperties(resourceEl: AgentElement): Record<string, Property> {
  const props: Record<string, Property> = {};
  const propEls = resourceEl.querySelectorAll('[data-agent-prop]');

  for (let i = 0; i < propEls.length; i++) {
    const el = propEls[i];

    // Skip properties that belong to nested resources
    const closestResource = el.closest('[data-agent="resource"]');
    if (closestResource !== resourceEl) continue;

    const name = el.getAttribute('data-agent-prop');
    if (!name) continue;

    const typehintAttr = el.getAttribute('data-agent-typehint');
    const typehint: TypeHint = typehintAttr && TYPE_HINTS.includes(typehintAttr)
      ? typehintAttr as TypeHint
      : 'string';

    const valueOverride = el.getAttribute('data-agent-value');
    const rawValue = valueOverride ?? el.textContent?.trim() ?? '';
    const currency = el.getAttribute('data-agent-currency') ?? undefined;

    props[name] = {
      name,
      rawValue,
      typehint,
      value: coerceValue(rawValue, typehint),
      currency,
      element: el,
    };
  }

  return props;
}

function isDirectChildResource(parent: AgentElement, candidate: AgentElement, allNested: AgentElement[]): boolean {
  // A candidate is a direct child resource of parent if no other nested resource
  // sits between parent and candidate (i.e., no other resource contains candidate).
  for (const other of allNested) {
    if (other === candidate) continue;
    // Check if 'other' contains 'candidate'
    const descendants = other.querySelectorAll('[data-agent="resource"]');
    for (let j = 0; j < descendants.length; j++) {
      if (descendants[j] === candidate) return false;
    }
  }
  return true;
}

function extractResourceTree(el: AgentElement): Resource {
  const type = el.getAttribute('data-agent-type') ?? '';
  const id = el.getAttribute('data-agent-id') ?? '';

  // Find direct child resources (nested)
  const allNestedResources = el.querySelectorAll('[data-agent="resource"]');
  const nestedArray: AgentElement[] = [];
  for (let i = 0; i < allNestedResources.length; i++) {
    nestedArray.push(allNestedResources[i]);
  }
  const directChildren: Resource[] = [];
  for (const nested of nestedArray) {
    if (isDirectChildResource(el, nested, nestedArray)) {
      if (!shouldSkip(nested)) {
        directChildren.push(extractResourceTree(nested));
      }
    }
  }

  // Find actions that belong to this resource (not to nested resources)
  const allActions = el.querySelectorAll('[data-agent="action"]');
  const actions: Action[] = [];
  for (let i = 0; i < allActions.length; i++) {
    const actionEl = allActions[i];
    const closestResource = actionEl.closest('[data-agent="resource"]');
    if (closestResource === el && !shouldSkip(actionEl)) {
      actions.push(extractAction(actionEl, id));
    }
  }

  return {
    type,
    id,
    properties: extractProperties(el),
    actions,
    children: directChildren,
    element: el,
  };
}

export function extractMeta(root: AgentElement): PageMeta {
  const script = root.querySelector('script[data-agent-meta]');
  if (!script) return {};

  try {
    const raw = JSON.parse(script.textContent ?? '{}');
    const meta: PageMeta = {};

    if (raw.provider) meta.provider = raw.provider;
    if (raw.defaults) meta.defaults = raw.defaults;
    if (raw.page) meta.page = raw.page;
    if (raw.related) meta.related = raw.related;

    if (raw.agent_policies) {
      meta.agentPolicies = {};
      if (raw.agent_policies.rate_limit) {
        meta.agentPolicies.rateLimit = {
          requestsPerMinute: raw.agent_policies.rate_limit.requests_per_minute,
        };
      }
      if (raw.agent_policies.require_auth !== undefined) {
        meta.agentPolicies.requireAuth = raw.agent_policies.require_auth;
      }
      if (raw.agent_policies.auth_method) {
        meta.agentPolicies.authMethod = raw.agent_policies.auth_method;
      }
    }

    return meta;
  } catch {
    return {};
  }
}

export function extractResources(root: AgentElement): Resource[] {
  const allResourceEls = root.querySelectorAll('[data-agent="resource"]');
  const resourceArray: AgentElement[] = [];
  for (let i = 0; i < allResourceEls.length; i++) {
    resourceArray.push(allResourceEls[i]);
  }
  const resources: Resource[] = [];

  for (const el of resourceArray) {
    // Only top-level resources: skip if any other resource contains this one
    let isNested = false;
    for (const other of resourceArray) {
      if (other === el) continue;
      const descendants = other.querySelectorAll('[data-agent="resource"]');
      for (let j = 0; j < descendants.length; j++) {
        if (descendants[j] === el) {
          isNested = true;
          break;
        }
      }
      if (isNested) break;
    }
    if (isNested) continue;

    if (shouldSkip(el)) continue;

    resources.push(extractResourceTree(el));
  }

  return resources;
}

export function extractActions(root: AgentElement): Action[] {
  const allActionEls = root.querySelectorAll('[data-agent="action"]');
  const actions: Action[] = [];

  for (let i = 0; i < allActionEls.length; i++) {
    const el = allActionEls[i];

    // Only standalone actions (not inside a resource)
    const parentResource = el.closest('[data-agent="resource"]');
    if (parentResource) continue;

    if (shouldSkip(el)) continue;

    actions.push(extractAction(el));
  }

  return actions;
}

export function extractAll(root: AgentElement): ExtractionResult {
  return {
    meta: extractMeta(root),
    resources: extractResources(root),
    actions: extractActions(root),
  };
}
