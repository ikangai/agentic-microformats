/**
 * WebMCP binding adapter (spec: webmcp-binding, 0.4 Phase 3).
 *
 * WebMCP (W3C Community Group; Chrome experimentation) lets a page expose tools
 * to a browser agent, keeping the browser's origin, permission, auth and UI
 * mechanics. Its declarative form story is still thin. This adapter fills that
 * gap: it compiles the portable, server-renderable `data-agent="action"`
 * annotations into WebMCP tool descriptors — JSON Schema inputs plus the
 * standard MCP tool annotations (`readOnlyHint` / `destructiveHint` /
 * `idempotentHint`) — so the same markup that a zero-JS agent reads statically
 * can also drive live WebMCP invocation in a capable browser.
 *
 * Progressive enhancement (the load-bearing rule): a tool's default binding is
 * the **real HTML control** — `form.requestSubmit()` — NOT a shadow HTTP call,
 * so an agent's invocation passes through the same validation, submit events,
 * auth and application logic as a human click. The HTTP endpoint is recorded
 * only as a fallback for controls with no form.
 */

import type { Action, ExtractionResult, HttpMethod, Resource } from './types.js';
import { requiresConfirmation } from './hints.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HTTP_IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties: false;
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: string | number | boolean;
}

/** Standard MCP tool annotations, plus Agentic Microformats safety extras. */
export interface ToolAnnotations {
  /** Method is safe (GET/HEAD/OPTIONS): no state change. */
  readOnlyHint?: boolean;
  /** DELETE, danger role, or high risk: may perform irreversible destruction. */
  destructiveHint?: boolean;
  /** Repeating is safe (from data-agent-idempotent or HTTP method semantics). */
  idempotentHint?: boolean;
  /**
   * The agent SHOULD obtain human confirmation before executing. Derived
   * fail-closed (spec §3.2): human-preferred, cost, irreversible, high risk, or
   * an un-hinted state-mutating method. A **publisher assertion** an agent may
   * escalate but must not silently lower.
   */
  humanConfirmationHint?: boolean;
  costHint?: { amount: number; currency?: string };
}

export type ToolBinding =
  | { type: 'dom-form'; method: HttpMethod; endpoint?: string }
  | { type: 'dom-element'; tag: string; method: HttpMethod; endpoint?: string }
  | { type: 'http'; method: HttpMethod; endpoint: string; sameOriginOnly: boolean };

export interface WebMCPTool {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
  annotations: ToolAnnotations;
  /** How to actually invoke: prefer the DOM control over the raw endpoint. */
  binding: ToolBinding;
  /** Resource id this tool operates on, when known. */
  resource?: string;
}

function schemaType(typehint: string): JSONSchemaProperty['type'] {
  switch (typehint) {
    case 'integer': return 'integer';
    case 'number':
    case 'currency': return 'number';
    case 'boolean': return 'boolean';
    default: return 'string';
  }
}

function buildInputSchema(action: Action): JSONSchema {
  const properties: Record<string, JSONSchemaProperty> = {};
  const required: string[] = [];
  for (const p of action.params) {
    if (p.disabled) continue;
    const prop: JSONSchemaProperty = { type: schemaType(p.typehint) };
    if (p.min !== undefined) prop.minimum = p.min;
    if (p.max !== undefined) prop.maximum = p.max;
    if (p.value !== null && p.value !== '') {
      prop.default = prop.type === 'integer' || prop.type === 'number' ? Number(p.value) : p.value;
      if (Number.isNaN(prop.default as number)) delete prop.default;
    }
    properties[p.name] = prop;
    if (p.required) required.push(p.name);
  }
  const schema: JSONSchema = { type: 'object', properties, additionalProperties: false };
  if (required.length) schema.required = required;
  return schema;
}

function buildAnnotations(action: Action): ToolAnnotations {
  const m = action.method.toUpperCase();
  const a: ToolAnnotations = {};
  a.readOnlyHint = SAFE_METHODS.has(m);
  a.destructiveHint = m === 'DELETE' || action.hints.role === 'danger' || action.hints.risk === 'high';
  a.idempotentHint = action.idempotent !== undefined ? action.idempotent : HTTP_IDEMPOTENT.has(m);
  if (requiresConfirmation(action.hints, action.method)) a.humanConfirmationHint = true;
  if (action.hints.cost !== undefined && action.hints.cost > 0) {
    a.costHint = { amount: action.hints.cost, ...(action.hints.costCurrency ? { currency: action.hints.costCurrency } : {}) };
  }
  return a;
}

function buildBinding(action: Action): ToolBinding {
  const tag = (action.element.tagName || '').toUpperCase();
  if (tag === 'FORM') return { type: 'dom-form', method: action.method, endpoint: action.endpoint };
  // A button/anchor/input control: bind to the element (requestSubmit on its
  // form, or a click), preserving the page's own handlers.
  if (['BUTTON', 'A', 'INPUT'].includes(tag)) {
    return { type: 'dom-element', tag: tag.toLowerCase(), method: action.method, endpoint: action.endpoint };
  }
  // No interactive control found — fall back to the declared HTTP endpoint.
  return {
    type: 'http',
    method: action.method,
    endpoint: action.endpoint ?? '',
    sameOriginOnly: action.crossOrigin !== true,
  };
}

function toolFor(action: Action): WebMCPTool {
  const tool: WebMCPTool = {
    name: action.name || 'unnamed_action',
    inputSchema: buildInputSchema(action),
    annotations: buildAnnotations(action),
    binding: buildBinding(action),
  };
  const parts = [action.description, action.onSuccess].filter(Boolean);
  if (parts.length) tool.description = parts.join(' — ');
  if (action.target) tool.resource = action.target;
  return tool;
}

function collectActions(resources: Resource[], out: Action[]): void {
  for (const r of resources) {
    for (const a of r.actions) out.push(a);
    collectActions(r.children, out);
  }
}

/**
 * Compile all actions in an extraction result into WebMCP tool descriptors.
 * Pure and deterministic — no DOM execution, safe to run server-side.
 */
export function toWebMCPTools(result: ExtractionResult): WebMCPTool[] {
  const actions: Action[] = [...result.actions];
  collectActions(result.resources, actions);
  return actions.map(toolFor);
}

// ---------------------------------------------------------------------------
// Runtime registration (browser) — EXPERIMENTAL, tracks the WebMCP draft
// ---------------------------------------------------------------------------

/**
 * The minimal slice of the WebMCP host we depend on. Injected rather than read
 * from a global so this is testable and resilient to the draft API evolving —
 * pass `navigator.modelContext` (or a shim) when the browser provides it.
 */
export interface ModelContextHost {
  registerTool(descriptor: {
    name: string;
    description?: string;
    inputSchema: JSONSchema;
    annotations: ToolAnnotations;
    execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
  }): { unregister?(): void } | void;
}

export interface RegisterOptions {
  /**
   * Called before executing a tool whose annotations carry
   * `humanConfirmationHint`. Must resolve true to proceed. Omit and such tools
   * refuse to run (fail closed) — confirmation is the agent's responsibility,
   * and the adapter will not silently bypass it.
   */
  onConfirm?: (tool: WebMCPTool, args: Record<string, unknown>) => boolean | Promise<boolean>;
}

export interface Registration { unregister(): void }

/**
 * Register every action as a live WebMCP tool. Each tool's `execute` binds to
 * the **real HTML control** (progressive enhancement): it writes the arguments
 * into the annotated inputs and calls `form.requestSubmit()`, so the page's own
 * validation, submit events, auth and handlers all run — the agent takes the
 * same path as a human. Falls back to a same-origin `fetch` only for actions
 * with no form/control.
 */
export function registerWebMCPTools(
  result: ExtractionResult,
  host: ModelContextHost,
  opts: RegisterOptions = {}
): Registration {
  const actions: Action[] = [...result.actions];
  collectActions(result.resources, actions);
  const handles: Array<{ unregister?(): void } | void> = [];

  for (const action of actions) {
    const tool = toolFor(action);
    const handle = host.registerTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      execute: async (args) => {
        if (tool.annotations.humanConfirmationHint) {
          const ok = opts.onConfirm ? await opts.onConfirm(tool, args ?? {}) : false;
          if (!ok) throw new Error(`Refused: "${tool.name}" requires human confirmation`);
        }
        return invoke(action, args ?? {});
      },
    });
    handles.push(handle);
  }

  return { unregister() { for (const h of handles) h?.unregister?.(); } };
}

/** Write args into the action's annotated inputs, then submit via the control. */
async function invoke(action: Action, args: Record<string, unknown>): Promise<unknown> {
  const el = action.element as any;
  const form: any = (el?.tagName || '').toUpperCase() === 'FORM' ? el : el?.form ?? el?.closest?.('form');

  // Fill declared parameters from args onto their live inputs.
  for (const p of action.params) {
    if (!(p.name in args)) continue;
    const input = p.element as any;
    const v = args[p.name];
    if (input && 'value' in input) {
      if ((input.type || '').toLowerCase() === 'checkbox') input.checked = !!v;
      else input.value = String(v);
    }
  }

  if (form && typeof form.requestSubmit === 'function') {
    form.requestSubmit(typeof el?.click === 'function' && el !== form ? el : undefined);
    return { bound: 'dom-form' };
  }
  if (typeof el?.click === 'function') { el.click(); return { bound: 'dom-element' }; }

  // No control to drive — fall back to a same-origin fetch of the endpoint.
  if (!action.endpoint) throw new Error(`No binding for "${action.name}"`);
  const g: any = (globalThis as any);
  if (typeof g.fetch !== 'function') throw new Error('No fetch available for HTTP fallback');
  const res = await g.fetch(action.endpoint, {
    method: action.method,
    headers: { 'Content-Type': 'application/json', ...(action.headers ?? {}) },
    body: SAFE_METHODS.has(action.method.toUpperCase()) ? undefined : JSON.stringify(args),
  });
  return { bound: 'http', status: res.status };
}
