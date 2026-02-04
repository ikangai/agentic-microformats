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
  currency?: string;
  element: import('./dom.js').AgentElement;
}

export interface Parameter {
  name: string;
  typehint: TypeHint;
  required: boolean;
  value: string | null;
  disabled: boolean;
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
  hints: InteractionHints;
  element: import('./dom.js').AgentElement;
}

export interface Resource {
  type: string;
  id: string;
  properties: Record<string, Property>;
  actions: Action[];
  children: Resource[];
  element: import('./dom.js').AgentElement;
}

export interface PageMeta {
  provider?: { name?: string; jurisdiction?: string; url?: string };
  defaults?: { currency?: string; locale?: string; timezone?: string };
  page?: { type?: string };
  agentPolicies?: {
    rateLimit?: { requestsPerMinute?: number };
    requireAuth?: boolean;
    authMethod?: string;
  };
  related?: Record<string, string>;
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
  warnings: string[];
}
