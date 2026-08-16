/**
 * Task → tool selection (0.11.0) — narrowing the graph before it hits context.
 *
 * A consumer has an intent ("buy the cheapest charger"), not a desire for all
 * twelve tools. Until now we handed them the whole graph and let them shovel it
 * into the model every step. This module narrows it, in two tiers that are
 * deliberately kept separate because they carry very different risk:
 *
 *   Tier 1 — `compactGraph` (LOSSLESS). Collection pages repeat one action
 *     template per item. On the demo catalog, 52% of every product resource is
 *     an `add_to_cart` block that is byte-identical across all six products
 *     except the SKU. Hoisting it into one template + per-item bindings is a
 *     pure re-encoding: `expandGraph(compactGraph(g))` deep-equals `g`, which
 *     the tests assert. Nothing is dropped, so it is always safe to apply.
 *
 *   Tier 2 — `selectTools` (LOSSY). Rank resources/actions against the intent
 *     and drop the rest. This can destroy the answer, so it fails OPEN: any
 *     doubt (no content tokens, nothing matched, an aggregate intent) and the
 *     graph is returned whole. `reason` always says which branch was taken.
 *
 * The aggregate guard is the load-bearing part of Tier 2. "Add the cheapest
 * product to the cart" is a superlative over the *whole* collection — narrowing
 * to the items whose text matches "cheapest" (none of them) or "product" (all
 * of them) either destroys the task or saves nothing. Comparative and
 * set-wide intents therefore suppress resource narrowing entirely.
 *
 * Selection never invents a view the agent can mistake for the whole page: when
 * anything is dropped, `compactGraph` stamps a `selection` block into the graph
 * recording how many resources were shown out of how many exist. An agent that
 * concludes "the catalog has one product" from a narrowed graph is a bug we
 * caused, not one it made.
 */

import type { Action, ExtractionResult, Resource } from './types.js';
import { toGraph } from './serialize.js';

// ---------------------------------------------------------------------------
// Intent analysis
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'do', 'does',
  'for', 'from', 'get', 'has', 'have', 'in', 'into', 'is', 'it', 'its', 'me',
  'my', 'no', 'not', 'of', 'on', 'onto', 'or', 'our', 'out', 'so', 'than',
  'that', 'the', 'then', 'there', 'these', 'they', 'this', 'to', 'up', 'use',
  'want', 'was', 'were', 'what', 'when', 'which', 'who', 'will', 'with',
  'would', 'you', 'your', 'please', 'exactly', 'single', 'also', 'if', 'any',
]);

/**
 * Cues that the intent ranges over a whole collection rather than picking a
 * named member of it. Matched against the token stream, plus the two-word
 * forms ("most expensive") that a bare token list would miss.
 */
const AGGREGATE_TOKENS = new Set([
  'all', 'both', 'each', 'every', 'any', 'list', 'enumerate', 'count',
  'compare', 'comparison', 'total', 'sum', 'average', 'cheapest', 'priciest',
  'costliest', 'best', 'worst', 'highest', 'lowest', 'largest', 'smallest',
  'biggest', 'newest', 'oldest', 'longest', 'shortest', 'top', 'bottom',
  'maximum', 'minimum', 'max', 'min', 'first', 'last', 'many', 'much',
]);

const AGGREGATE_PHRASES = [
  /\bmost\s+\w+/, /\bleast\s+\w+/, /\bhow\s+many\b/, /\bhow\s+much\b/,
  /\beach\s+of\b/, /\bone\s+of\s+the\b/, /\bevery\s+\w+/,
];

export interface IntentAnalysis {
  /** Content tokens: lowercased, stopworded, snake/camel/kebab split. */
  tokens: string[];
  /** True when the intent ranges over a collection — suppresses narrowing. */
  aggregate: boolean;
  /** The cue that made it aggregate, for the trace. */
  aggregateCue?: string;
}

/**
 * Split an identifier or phrase into comparable lowercase tokens.
 *
 * The camelCase split deliberately fires only on letter→capital, never
 * digit→capital: "65W", "4K" and "27B" are single model designators, and
 * splitting them into "65"+"w" destroys the most discriminating token in a
 * product name.
 */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')        // camelCase → camel Case
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Light singularization so "products" matches "product". */
function normalize(token: string): string {
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function analyzeIntent(intent: string): IntentAnalysis {
  const lower = intent.toLowerCase();
  const raw = tokenize(intent);
  const tokens = [...new Set(raw.filter((t) => !STOPWORDS.has(t)).map(normalize))];

  let aggregateCue: string | undefined;
  for (const t of raw) {
    if (AGGREGATE_TOKENS.has(t)) { aggregateCue = t; break; }
  }
  if (!aggregateCue) {
    for (const re of AGGREGATE_PHRASES) {
      const m = lower.match(re);
      if (m) { aggregateCue = m[0].trim(); break; }
    }
  }
  return { tokens, aggregate: aggregateCue !== undefined, aggregateCue };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Field weights. Identity beats prose: a resource whose `name` property is
 * "USB-C Charger 65W" should outrank one whose description merely mentions
 * charging.
 */
const W_ACTION_NAME = 3;
const W_TARGET = 3;
const W_RESOURCE_ID = 3;
const W_RESOURCE_TYPE = 2;
const W_PROP_VALUE = 2;
const W_DESCRIPTION = 2;
const W_ENDPOINT = 1;
const W_PARAM_NAME = 1;

/**
 * Score = for each distinct intent token, the highest field weight it matched,
 * scaled by that token's inverse document frequency across the page's
 * resources.
 *
 * The IDF factor is what makes this work at all. Every product card on a
 * catalog carries the same `add_to_cart` action, so the intent "add the USB-C
 * Charger 65W to the cart" matches *every* resource on "add" and "cart" — a
 * raw term count ranks all six identically and narrowing degenerates. A token
 * present in every resource has `idf = 0` and contributes nothing; "charger",
 * present in one, carries the decision. Without this the selector cannot tell
 * the vocabulary of the task from the vocabulary of the page.
 *
 * Taking the max weight per token (rather than summing every field hit) stops a
 * token that happens to repeat across many fields of one resource from
 * outweighing a token that identifies the right resource exactly once.
 */
function scoreFields(
  tokens: string[], fields: Array<{ text: string; weight: number }>, idf: Map<string, number>
): number {
  if (tokens.length === 0) return 0;
  const indexed = fields.map((f) => ({ weight: f.weight, tokens: new Set(tokenize(f.text).map(normalize)) }));
  let total = 0;
  for (const t of tokens) {
    const w = idf.get(t);
    if (!w) continue;                            // absent everywhere, or in everything
    let best = 0;
    for (const f of indexed) {
      if (f.weight <= best) continue;
      if (f.tokens.has(t)) best = f.weight;
    }
    total += best * w;
  }
  return total;
}

function actionFields(a: Action): Array<{ text: string; weight: number }> {
  const fields: Array<{ text: string; weight: number }> = [
    { text: a.name ?? '', weight: W_ACTION_NAME },
  ];
  if (a.target) fields.push({ text: a.target, weight: W_TARGET });
  if (a.description) fields.push({ text: a.description, weight: W_DESCRIPTION });
  if (a.onSuccess) fields.push({ text: a.onSuccess, weight: W_DESCRIPTION });
  if (a.endpoint) fields.push({ text: a.endpoint, weight: W_ENDPOINT });
  for (const p of a.params) fields.push({ text: p.name, weight: W_PARAM_NAME });
  return fields;
}

function resourceFields(r: Resource): Array<{ text: string; weight: number }> {
  const fields: Array<{ text: string; weight: number }> = [
    { text: r.type ?? '', weight: W_RESOURCE_TYPE },
    { text: r.id ?? '', weight: W_RESOURCE_ID },
  ];
  for (const [name, p] of Object.entries(r.properties)) {
    fields.push({ text: name, weight: W_PARAM_NAME });
    if (typeof p.value === 'string') fields.push({ text: p.value, weight: W_PROP_VALUE });
    else if (p.rawValue) fields.push({ text: p.rawValue, weight: W_PROP_VALUE });
  }
  return fields;
}

/** A resource scores on its own fields and on the best of its actions/children. */
function scoreResource(tokens: string[], r: Resource, idf: Map<string, number>): number {
  const own = scoreFields(tokens, resourceFields(r), idf);
  const viaAction = r.actions.reduce((m, a) => Math.max(m, scoreFields(tokens, actionFields(a), idf)), 0);
  const viaChild = r.children.reduce((m, c) => Math.max(m, scoreResource(tokens, c, idf)), 0);
  return own + Math.max(viaAction, viaChild);
}

/** Every token reachable from a resource — its own fields, actions, children. */
function resourceTokens(r: Resource): Set<string> {
  const out = new Set<string>();
  const add = (fields: Array<{ text: string }>) => {
    for (const f of fields) for (const t of tokenize(f.text)) out.add(normalize(t));
  };
  add(resourceFields(r));
  for (const a of r.actions) add(actionFields(a));
  for (const c of r.children) for (const t of resourceTokens(c)) out.add(t);
  return out;
}

/**
 * Inverse document frequency over the page's top-level resources, smoothed so
 * a token in every resource lands at exactly 0 rather than a small positive
 * residue. Tokens absent from the page are simply missing from the map.
 */
function buildIdf(resources: Resource[]): Map<string, number> {
  const n = resources.length;
  const df = new Map<string, number>();
  for (const r of resources) {
    for (const t of resourceTokens(r)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log((n + 1) / (d + 1)));
  return idf;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export interface SelectOptions {
  /** Cap on top-level resources kept. Default 10. */
  maxResources?: number;
  /** Below this many resources there is nothing worth narrowing. Default 4. */
  minCollectionSize?: number;
  /** Keep resources scoring at least this fraction of the best match. Default 0.5. */
  relativeThreshold?: number;
  /** `'auto'` (default) narrows only when the intent analysis permits it. */
  narrow?: boolean | 'auto';
}

export interface SelectionTrace {
  ref: string;
  score: number;
  kept: boolean;
}

export interface SelectionResult {
  /** Pruned extraction result. DOM element references are preserved, so
   *  `prepareAction`/`executeTool` still work on whatever survived. */
  result: ExtractionResult;
  /** False when the full graph was returned — the fail-open branches. */
  narrowed: boolean;
  /** Human-readable account of which branch ran and why. */
  reason: string;
  intent: IntentAnalysis;
  shown: number;
  total: number;
  trace: SelectionTrace[];
}

function unnarrowed(result: ExtractionResult, intent: IntentAnalysis, reason: string): SelectionResult {
  return {
    result, narrowed: false, reason, intent,
    shown: result.resources.length, total: result.resources.length, trace: [],
  };
}

/**
 * Narrow an extraction result to the resources an intent plausibly needs.
 *
 * Page-level actions are never dropped: they are few, and they are the
 * navigation surface an agent needs to leave a page whose narrowed view turned
 * out to be the wrong one. Only top-level resources are pruned; a kept resource
 * keeps its actions and children intact.
 */
export function selectTools(
  result: ExtractionResult, intent: string, opts: SelectOptions = {}
): SelectionResult {
  const maxResources = opts.maxResources ?? 10;
  const minCollectionSize = opts.minCollectionSize ?? 4;
  const relativeThreshold = opts.relativeThreshold ?? 0.5;
  const narrowMode = opts.narrow ?? 'auto';
  const analysis = analyzeIntent(intent ?? '');
  const total = result.resources.length;

  if (narrowMode === false) return unnarrowed(result, analysis, 'narrowing disabled by caller');
  if (analysis.tokens.length === 0) return unnarrowed(result, analysis, 'no content tokens in intent — cannot rank');
  if (total < minCollectionSize) {
    return unnarrowed(result, analysis, `only ${total} resource(s) — below the ${minCollectionSize}-resource floor`);
  }
  if (narrowMode === 'auto' && analysis.aggregate) {
    return unnarrowed(
      result, analysis,
      `aggregate intent ("${analysis.aggregateCue}") ranges over the whole collection — not narrowed`
    );
  }

  const idf = buildIdf(result.resources);
  const scored = result.resources.map((r) => ({ r, score: scoreResource(analysis.tokens, r, idf) }));
  const top = scored.reduce((m, s) => Math.max(m, s.score), 0);

  if (top === 0) {
    return unnarrowed(
      result, analysis,
      'no discriminating match — every intent token is absent from the page or present in every resource'
    );
  }

  // Keep only resources within `relativeThreshold` of the best match. An
  // absolute cutoff cannot work here: scores are IDF-weighted sums whose scale
  // depends on collection size and how wordy the page is, so "strong" is only
  // definable relative to the best candidate on this page.
  const cutoff = top * relativeThreshold;
  const hits = scored.filter((s) => s.score >= cutoff).sort((a, b) => b.score - a.score);

  if (hits.length >= total) {
    return unnarrowed(result, analysis, `every resource scored within the threshold (${total}) — nothing to drop`);
  }

  const keep = hits.slice(0, maxResources);
  const keepSet = new Set(keep.map((k) => k.r));
  const trace: SelectionTrace[] = scored.map((s) => ({
    ref: `${s.r.type}#${s.r.id}`, score: s.score, kept: keepSet.has(s.r),
  })).sort((a, b) => b.score - a.score);

  return {
    result: {
      meta: result.meta,
      // Preserve document order among survivors; rank decides membership only.
      resources: result.resources.filter((r) => keepSet.has(r)),
      actions: result.actions,
    },
    narrowed: true,
    reason: `intent matched ${hits.length}/${total} resources; kept ${keep.length}`,
    intent: analysis,
    shown: keep.length,
    total,
    trace,
  };
}

// ---------------------------------------------------------------------------
// Tier 1 — lossless template hoisting
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

/** Marker for the compact encoding; the expanded form is plain `agentGraph`. */
export const COMPACT_FORMAT_VERSION = '0.1';

/**
 * Fields that legitimately vary between two instances of the same action
 * template. Everything else must match byte-for-byte for actions to share a
 * template, so a template can never merge two genuinely different actions.
 */
function actionSignature(a: Json): string {
  const { target: _t, endpoint: _e, params, ...rest } = a;
  const shape = Array.isArray(params)
    ? (params as Json[]).map(({ value: _v, ...p }) => p)
    : undefined;
  return JSON.stringify({ ...rest, params: shape });
}

function collectActions(graph: Json, visit: (a: Json) => void): void {
  const walkResources = (rs: unknown) => {
    for (const r of (rs as Json[] | undefined) ?? []) {
      for (const a of (r.actions as Json[] | undefined) ?? []) visit(a);
      walkResources(r.children);
    }
  };
  for (const a of (graph.actions as Json[] | undefined) ?? []) visit(a);
  walkResources(graph.resources);
}

/**
 * Re-encode a canonical graph with repeated action templates hoisted.
 *
 * An action that occurs two or more times with an identical signature is
 * emitted once under `actionTemplates`; each occurrence becomes
 * `{$template, ...overrides}` carrying only what differs — typically `target`
 * and one bound parameter value. Single-occurrence actions are left inline,
 * because a template plus a reference costs more than the action itself.
 *
 * `selection` records the narrowing that produced this graph, so an agent
 * reading a pruned view is told it is pruned. Omitted when nothing was dropped.
 */
export function compactGraph(graph: Json, selection?: SelectionResult): Json {
  const counts = new Map<string, number>();
  collectActions(graph, (a) => {
    const sig = actionSignature(a);
    counts.set(sig, (counts.get(sig) ?? 0) + 1);
  });

  const templateIds = new Map<string, string>();
  const templates: Json = {};

  // Assign ids in first-encounter order so the encoding is deterministic.
  collectActions(graph, (a) => {
    const sig = actionSignature(a);
    if ((counts.get(sig) ?? 0) < 2 || templateIds.has(sig)) return;
    const id = `t${templateIds.size + 1}`;
    templateIds.set(sig, id);

    const { target: _t, endpoint, params, ...rest } = a;
    const tpl: Json = { ...rest };
    // Endpoint and parameter values stay in the template when every instance
    // agrees on them; only genuinely per-instance data is pushed out.
    const group: Json[] = [];
    collectActions(graph, (b) => { if (actionSignature(b) === sig) group.push(b); });
    if (group.every((b) => b.endpoint === endpoint)) {
      if (endpoint !== undefined) tpl.endpoint = endpoint;
    }
    if (Array.isArray(params)) {
      tpl.params = (params as Json[]).map((p, i) => {
        const shared = group.every((b) => {
          const bp = (b.params as Json[])[i];
          return bp && bp.value === p.value;
        });
        if (shared) return p;
        const { value: _v, ...withoutValue } = p;
        return withoutValue;
      });
    }
    templates[id] = tpl;
  });

  const rewriteAction = (a: Json): Json => {
    const sig = actionSignature(a);
    const id = templateIds.get(sig);
    if (!id) return a;
    const tpl = templates[id] as Json;
    const ref: Json = { $template: id };
    if (a.target !== undefined) ref.target = a.target;
    if (a.endpoint !== undefined && a.endpoint !== tpl.endpoint) ref.endpoint = a.endpoint;
    if (Array.isArray(a.params)) {
      const bound: Json = {};
      const tplParams = (tpl.params as Json[]) ?? [];
      (a.params as Json[]).forEach((p, i) => {
        const tp = tplParams[i];
        if (p.value !== undefined && (!tp || !('value' in tp))) bound[String(p.name)] = p.value;
      });
      if (Object.keys(bound).length > 0) ref.params = bound;
    }
    return ref;
  };

  const rewriteResources = (rs: unknown): Json[] =>
    ((rs as Json[] | undefined) ?? []).map((r) => {
      const out: Json = { ...r };
      if (Array.isArray(r.actions)) out.actions = (r.actions as Json[]).map(rewriteAction);
      if (Array.isArray(r.children)) out.children = rewriteResources(r.children);
      return out;
    });

  const out: Json = { ...graph };
  if (Object.keys(templates).length > 0) {
    out.agentGraphCompact = COMPACT_FORMAT_VERSION;
    out.actionTemplates = templates;
  }
  if (Array.isArray(graph.actions)) out.actions = (graph.actions as Json[]).map(rewriteAction);
  if (graph.resources !== undefined) out.resources = rewriteResources(graph.resources);

  if (selection?.narrowed) {
    out.selection = {
      narrowed: true,
      resourcesShown: selection.shown,
      resourcesTotal: selection.total,
      note: `This is a FILTERED view: ${selection.shown} of ${selection.total} resources on the page are shown, ` +
            `selected for the current task. Re-read the page unfiltered if you need the others.`,
    };
  }
  return out;
}

/**
 * Inverse of `compactGraph`. Restores every hoisted action to its inline form,
 * so a consumer that does not understand the compact encoding can round-trip
 * it. `expandGraph(compactGraph(g))` deep-equals `g` — asserted in the tests.
 */
export function expandGraph(compact: Json): Json {
  const templates = (compact.actionTemplates as Json | undefined) ?? {};

  const expandAction = (a: Json): Json => {
    const id = a.$template as string | undefined;
    if (!id) return a;
    const tpl = templates[id] as Json | undefined;
    if (!tpl) return a;

    const { $template: _s, target, endpoint, params: bound, ...restRef } = a;
    const merged: Json = { ...tpl, ...restRef };
    const ep = endpoint ?? tpl.endpoint;

    // Rebuild in serialize.ts's canonical key order so the expansion is
    // byte-identical to the graph the template was hoisted out of.
    const out: Json = {};
    if (merged.name !== undefined) out.name = merged.name;
    out.method = merged.method;
    if (ep !== undefined) out.endpoint = ep;
    if (target !== undefined) out.target = target;
    for (const k of ['description', 'onSuccess', 'response', 'idempotent', 'crossOrigin', 'headers', 'hints']) {
      if (merged[k] !== undefined) out[k] = merged[k];
    }
    if (Array.isArray(tpl.params)) {
      out.params = (tpl.params as Json[]).map((p) => {
        if ('value' in p) return p;
        const v = (bound as Json | undefined)?.[String(p.name)];
        if (v === undefined) return p;
        const rebuilt: Json = { name: p.name };
        if (p.typehint !== undefined) rebuilt.typehint = p.typehint;
        if (p.required !== undefined) rebuilt.required = p.required;
        rebuilt.value = v;
        if (p.min !== undefined) rebuilt.min = p.min;
        if (p.max !== undefined) rebuilt.max = p.max;
        if (p.disabled !== undefined) rebuilt.disabled = p.disabled;
        return rebuilt;
      });
    }
    return out;
  };

  const expandResources = (rs: unknown): Json[] =>
    ((rs as Json[] | undefined) ?? []).map((r) => {
      const out: Json = { ...r };
      if (Array.isArray(r.actions)) out.actions = (r.actions as Json[]).map(expandAction);
      if (Array.isArray(r.children)) out.children = expandResources(r.children);
      return out;
    });

  const out: Json = { ...compact };
  delete out.agentGraphCompact;
  delete out.actionTemplates;
  delete out.selection;
  if (Array.isArray(compact.actions)) out.actions = (compact.actions as Json[]).map(expandAction);
  if (compact.resources !== undefined) out.resources = expandResources(compact.resources);
  return out;
}

/** Convenience: extract → (optionally narrow) → compact, in one call. */
export function toCompactGraph(result: ExtractionResult, selection?: SelectionResult): Json {
  return compactGraph(toGraph(selection?.result ?? result), selection);
}

export function toCompactGraphJSON(
  result: ExtractionResult, selection?: SelectionResult, pretty = false
): string {
  return JSON.stringify(toCompactGraph(result, selection), null, pretty ? 2 : undefined);
}
