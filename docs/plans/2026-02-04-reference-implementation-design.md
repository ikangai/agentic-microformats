# Reference Implementation Design

**Date:** 2026-02-04
**Status:** Approved
**Scope:** Core spec v0.1.0 only

## Overview

A TypeScript reference implementation of the Agentic Microformats core specification (v0.1.0). Parses HTML annotated with `data-agent-*` attributes into structured TypeScript types. Universal — works in browsers (native DOM) and Node.js (linkedom or similar).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime environment | Universal (browser + Node.js) | Reference impl should work everywhere; DOM abstraction is thin |
| Spec scope | Core only (22 attributes) | Advanced patterns are v0.2.0-dev and in flux |
| API style | Functional core + class facade | Testable internals, convenient surface |
| Build | `tsc` only, ESM output | Clarity over optimization; 1:1 source mapping |
| HTTP execution | Not included (`prepareAction` only) | Library parses and structures; consumers handle HTTP |
| Date handling | ISO strings, not Date objects | Avoids timezone footguns |
| Dependencies | Zero runtime | `linkedom` and `vitest` are dev-only |

## Package Structure

```
packages/agentic-microformats/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public API exports
│   ├── types.ts              # TypeScript types (spec vocabulary)
│   ├── dom.ts                # DOM abstraction interface
│   ├── extract.ts            # Extraction functions (resources, actions, params, meta)
│   ├── trust.ts              # Trust boundary checking
│   ├── hints.ts              # Interaction hint evaluation
│   ├── params.ts             # Parameter gathering & nested dot-notation expansion
│   ├── observe.ts            # MutationObserver wrapper
│   ├── coerce.ts             # Type hint coercion (string -> typed values)
│   └── agent-dom.ts          # AgentDOM class facade
└── test/
    ├── extract.test.ts
    ├── trust.test.ts
    ├── hints.test.ts
    ├── params.test.ts
    ├── coerce.test.ts
    ├── observe.test.ts
    └── agent-dom.test.ts
```

## DOM Abstraction

Structural typing against a minimal interface — both native `Element` and linkedom satisfy it without adapters:

```typescript
interface AgentElement {
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): AgentElement[];
  querySelector(selector: string): AgentElement | null;
  closest(selector: string): AgentElement | null;
  textContent: string | null;
  children: AgentElement[];
  tagName: string;
  hasAttribute(name: string): boolean;
}
```

## Type System

Maps directly to the spec's 22 attributes:

```typescript
type TypeHint = 'string' | 'number' | 'integer' | 'boolean' | 'currency'
  | 'date' | 'datetime' | 'url' | 'email' | 'enum' | 'json';

type Role = 'primary' | 'secondary' | 'danger';
type RiskLevel = 'low' | 'medium' | 'high';
type TrustLevel = 'system' | 'untrusted' | 'verified';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

interface Resource {
  type: string;
  id: string;
  properties: Record<string, Property>;
  actions: Action[];
  children: Resource[];
  element: AgentElement;
}

interface Property {
  name: string;
  rawValue: string;
  typehint: TypeHint;
  value: unknown;
  currency?: string;
  element: AgentElement;
}

interface Action {
  name: string;
  target?: string;
  method: HttpMethod;
  endpoint?: string;
  params: Parameter[];
  headers?: Record<string, string>;
  description?: string;
  hints: InteractionHints;
  element: AgentElement;
}

interface Parameter {
  name: string;
  typehint: TypeHint;
  required: boolean;
  value: string | null;
  disabled: boolean;
  element: AgentElement;
}

interface InteractionHints {
  role?: Role;
  risk?: RiskLevel;
  humanPreferred: boolean;
  reversible?: boolean;
  cost?: number;
  costCurrency?: string;
}

interface PageMeta {
  provider?: { name?: string; jurisdiction?: string };
  defaults?: { currency?: string; locale?: string; timezone?: string };
  page?: { type?: string };
  agentPolicies?: {
    rateLimit?: { requestsPerMinute?: number };
    requireAuth?: boolean;
    authMethod?: string;
  };
  related?: Record<string, string>;
}

interface ExtractionResult {
  meta: PageMeta;
  resources: Resource[];
  actions: Action[];
}
```

## Functional Core

### trust.ts
- `isUntrusted(el)` — walks ancestors for `data-agent-trust="untrusted"`
- `isIgnored(el)` — walks ancestors for `data-agent-ignore="true"`
- `getTrustLevel(el)` — resolves inherited trust, defaults to `"system"`

### coerce.ts
- `coerceValue(raw, typehint, currency?)` — converts string to typed value
- Dates kept as ISO strings, numbers via parseFloat/parseInt, JSON via try/catch with fallback

### params.ts
- `extractParameters(actionEl)` — finds descendants with `data-agent-param`
- `buildNestedParams(params)` — expands dot-notation into nested objects
- Required detection merges: HTML `required`, `data-agent-required`, `aria-required`

### hints.ts
- `extractHints(el)` — reads role, risk, cost, reversible, human-preferred
- `requiresConfirmation(hints)` — true when risk=high, cost>0, reversible=false, or role=danger

### extract.ts
- `extractMeta(root)` — parses `<script data-agent-meta>` JSON
- `extractResources(root)` — recursive, skips untrusted/ignored, handles nesting
- `extractActions(root)` — standalone actions not inside a resource
- `extractAll(root)` — combines all three
- Description fallback: `data-agent-description` -> `aria-label` -> `aria-describedby` -> `title` -> `textContent`

### observe.ts
- `observe(root, callback)` — wraps MutationObserver, emits semantic AgentMutation events
- Mutation types: resource-added/removed/changed, action-added/removed/changed, property-changed
- Throws in environments without MutationObserver

## AgentDOM Class Facade

```typescript
class AgentDOM {
  constructor(root: AgentElement);
  get meta(): PageMeta;
  get resources(): Resource[];
  get actions(): Action[];
  extract(): ExtractionResult;
  getResource(id: string): Resource | undefined;
  getAction(name: string, targetId?: string): Action | undefined;
  observe(callback: MutationCallback): { disconnect(): void };
  prepareAction(action: Action, paramValues?: Record<string, unknown>): {
    method: HttpMethod;
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
    confirmationRequired: boolean;
    warnings: string[];
  };
}
```

Lazy extraction with caching. `extract()` forces a fresh parse.

## Testing

- `vitest` with `linkedom` for DOM parsing in tests
- One test file per module
- Tests use spec's own HTML examples where possible
- `observe.test.ts` skipped in Node.js (no MutationObserver)
- `agent-dom.test.ts` integration tests using repo's `examples/` HTML files

## Dependencies

- **Runtime:** none
- **Dev:** `typescript`, `vitest`, `linkedom`
