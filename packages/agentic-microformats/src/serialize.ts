/**
 * Canonical JSON serialization of an extraction result (spec:
 * graph-serialization.md). This is THE interchange format: benchmark arms,
 * server-side delivery (`.well-known/agent-graph`, `Accept:
 * application/agent+json`), and the Python port all produce/consume this
 * exact shape.
 *
 * Canonicalization rules:
 * - keys appear in the fixed order coded here
 * - undefined/absent fields are omitted entirely (never null)
 * - `typehint` is omitted when it is the default "string"
 * - `hints.humanPreferred` appears only when true
 * - repeated properties carry `values` (all occurrences, document order)
 *   alongside `value` (first occurrence)
 * - DOM element references are never serialized
 */

import type { Action, ExtractionResult, Parameter, Property, Resource } from './types.js';

/** Version of the serialization format, NOT of the spec. */
export const GRAPH_FORMAT_VERSION = '0.3';

function serializeParameter(p: Parameter): Record<string, unknown> {
  const out: Record<string, unknown> = { name: p.name };
  if (p.typehint !== 'string') out.typehint = p.typehint;
  if (p.required) out.required = true;
  if (p.value !== null && p.value !== undefined) out.value = p.value;
  if (p.min !== undefined) out.min = p.min;
  if (p.max !== undefined) out.max = p.max;
  if (p.disabled) out.disabled = true;
  return out;
}

function serializeAction(a: Action): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (a.name) out.name = a.name;
  out.method = a.method;
  if (a.endpoint) out.endpoint = a.endpoint;
  if (a.target) out.target = a.target;
  if (a.description) out.description = a.description;
  if (a.onSuccess) out.onSuccess = a.onSuccess;
  if (a.response) out.response = a.response;
  if (a.idempotent !== undefined) out.idempotent = a.idempotent;
  if (a.headers) out.headers = a.headers;

  const hints: Record<string, unknown> = {};
  if (a.hints.role) hints.role = a.hints.role;
  if (a.hints.risk) hints.risk = a.hints.risk;
  if (a.hints.humanPreferred) hints.humanPreferred = true;
  if (a.hints.reversible !== undefined) hints.reversible = a.hints.reversible;
  if (a.hints.cost !== undefined) hints.cost = a.hints.cost;
  if (a.hints.costCurrency) hints.costCurrency = a.hints.costCurrency;
  if (Object.keys(hints).length > 0) out.hints = hints;

  if (a.params.length > 0) out.params = a.params.map(serializeParameter);
  return out;
}

function serializeProperty(p: Property): Record<string, unknown> {
  const out: Record<string, unknown> = { value: p.value };
  if (p.values) out.values = p.values;
  if (p.typehint !== 'string') out.typehint = p.typehint;
  if (p.currency) out.currency = p.currency;
  return out;
}

function serializeResource(r: Resource): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (r.type) out.type = r.type;
  if (r.id) out.id = r.id;

  const properties: Record<string, unknown> = {};
  for (const [name, p] of Object.entries(r.properties)) {
    properties[name] = serializeProperty(p);
  }
  out.properties = properties;

  if (r.actions.length > 0) out.actions = r.actions.map(serializeAction);
  if (r.children.length > 0) out.children = r.children.map(serializeResource);
  return out;
}

/** Plain-object form of the canonical graph. */
export function toGraph(result: ExtractionResult): Record<string, unknown> {
  return {
    agentGraph: GRAPH_FORMAT_VERSION,
    meta: result.meta,
    resources: result.resources.map(serializeResource),
    actions: result.actions.map(serializeAction),
  };
}

/** Canonical JSON string (2-space indent, trailing newline omitted). */
export function toGraphJSON(result: ExtractionResult, pretty = false): string {
  return JSON.stringify(toGraph(result), null, pretty ? 2 : undefined);
}
