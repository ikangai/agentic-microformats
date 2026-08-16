export type TypeHint =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'url'
  | 'email'
  | 'enum'
  | 'json';

export type Role = 'primary' | 'secondary' | 'danger';
export type RiskLevel = 'low' | 'medium' | 'high';
export type TrustLevel = 'system' | 'untrusted' | 'verified';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface InteractionHints {
  role?: Role;
  risk?: RiskLevel;
  humanPreferred: boolean;
  reversible?: boolean;
  cost?: number;
  costCurrency?: string;
}

export interface Property {
  name: string;
  rawValue: string;
  typehint: TypeHint;
  value: unknown;
  /**
   * Present when the same property name appears more than once within one
   * resource (spec §5, 0.3.0): all coerced values in document order.
   * `value`/`rawValue` hold the FIRST occurrence.
   */
  values?: unknown[];
  rawValues?: string[];
  currency?: string;
  element: import('./dom.js').AgentElement;
}

export interface Parameter {
  name: string;
  typehint: TypeHint;
  required: boolean;
  value: string | null;
  disabled: boolean;
  /** Minimum allowed value (numeric) or minimum length (string). Spec §7.4. */
  min?: number;
  /** Maximum allowed value (numeric) or maximum length (string). Spec §7.4. */
  max?: number;
  element: import('./dom.js').AgentElement;
}

export interface Action {
  name: string;
  target?: string;
  method: HttpMethod;
  endpoint?: string;
  params: Parameter[];
  declaredParams?: string[];  // from data-agent-params attribute
  headers?: Record<string, string>;
  description?: string;
  /** Natural-language description of the expected outcome. Spec §6.8. */
  onSuccess?: string;
  /** Response schema: field name → typehint. Spec §6.7. */
  response?: Record<string, string>;
  /**
   * Whether repeating this request produces the same server state (spec
   * 0.3.0). Distinct from hints.reversible: reversible answers "can I undo
   * it?", idempotent answers "is it safe to retry blindly?".
   */
  idempotent?: boolean;
  /**
   * Explicit opt-in for a non-same-origin endpoint (spec §12.5,
   * `data-agent-cross-origin="true"`). Absent/false means agents MUST refuse
   * an absolute cross-origin endpoint.
   */
  crossOrigin?: boolean;
  /**
   * The current version/ETag of the resource this action mutates, taken from
   * the enclosing resource's `data-agent-version` (spec §5, 0.4). Sent as
   * `If-Match` on a mutating request so a stale write is rejected (409) rather
   * than silently overwriting a change made since the graph was read.
   */
  resourceVersion?: string;
  hints: InteractionHints;
  element: import('./dom.js').AgentElement;
}

export interface Resource {
  type: string;
  id: string;
  /** Opaque version / ETag token (`data-agent-version`) for optimistic concurrency. */
  version?: string;
  properties: Record<string, Property>;
  actions: Action[];
  children: Resource[];
  element: import('./dom.js').AgentElement;
}

export interface WorkflowGraph {
  graph?: Record<string, { next?: string[] }>;
  entryPoint?: string;
}

export interface ActionSummary {
  name?: string;
  method?: string;
  endpoint?: string;
}

export interface PageMeta {
  provider?: { name?: string; jurisdiction?: string; url?: string };
  defaults?: { currency?: string; locale?: string; timezone?: string };
  page?: { type?: string };
  agentPolicies?: {
    rateLimit?: { requestsPerMinute?: number };
    requireAuth?: boolean;
    authMethod?: string;
    /** Common error response shape: field name → typehint. Spec §9.2 / changelog 0.2.0. */
    errorFormat?: Record<string, string>;
  };
  related?: Record<string, string>;
  /** Navigation flow between page types. Spec §9.2.1. */
  workflow?: WorkflowGraph;
  /** Available actions per page type. Spec §9.2.2. */
  actions?: Record<string, ActionSummary[]>;
  /** Expected JSON response per action name. Spec §9.2.3. */
  responseSchemas?: Record<string, Record<string, string>>;
}

export interface ExtractionResult {
  meta: PageMeta;
  resources: Resource[];
  actions: Action[];
}

export interface PreparedAction {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  confirmationRequired: boolean;
  /**
   * The prepared request MUST NOT be sent when true — the endpoint is
   * cross-origin without an explicit opt-out (spec §12.5), or otherwise
   * failed a fail-closed safety gate. `warnings` explains why.
   */
  blocked: boolean;
  warnings: string[];
}
