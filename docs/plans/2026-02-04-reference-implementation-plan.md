# Reference Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-dependency TypeScript library that parses HTML with `data-agent-*` attributes into structured types per the Agentic Microformats core spec v0.1.0.

**Architecture:** Functional core (pure extraction/coercion/trust functions) with a thin `AgentDOM` class facade. Universal via structural typing against a minimal `AgentElement` interface — works with native DOM and linkedom without adapters.

**Tech Stack:** TypeScript, tsc (build), vitest + linkedom (test)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `packages/agentic-microformats/package.json`
- Create: `packages/agentic-microformats/tsconfig.json`
- Create: `packages/agentic-microformats/src/index.ts` (empty placeholder)

**Step 1: Create package.json**

```json
{
  "name": "agentic-microformats",
  "version": "0.1.0",
  "description": "Reference implementation of the Agentic Microformats specification",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "linkedom": "^0.18.0"
  },
  "license": "MIT"
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

**Step 3: Create empty index.ts**

```typescript
// Agentic Microformats - Reference Implementation
```

**Step 4: Install dependencies**

Run: `cd packages/agentic-microformats && npm install`

**Step 5: Verify build**

Run: `cd packages/agentic-microformats && npx tsc --noEmit`
Expected: success, no errors

**Step 6: Verify test runner**

Run: `cd packages/agentic-microformats && npx vitest run`
Expected: "No test files found"

**Step 7: Commit**

```
feat: scaffold reference implementation package
```

---

### Task 2: Types & DOM Abstraction

**Files:**
- Create: `packages/agentic-microformats/src/types.ts`
- Create: `packages/agentic-microformats/src/dom.ts`
- Modify: `packages/agentic-microformats/src/index.ts`

**Step 1: Create types.ts**

```typescript
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
```

**Step 2: Create dom.ts**

```typescript
export interface AgentElement {
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  querySelector(selector: string): AgentElement | null;
  querySelectorAll(selector: string): AgentElement[];
  closest(selector: string): AgentElement | null;
  textContent: string | null;
  children: ArrayLike<AgentElement>;
  tagName: string;
}
```

**Step 3: Update index.ts with re-exports**

```typescript
export type { AgentElement } from './dom.js';
export type {
  TypeHint,
  Role,
  RiskLevel,
  TrustLevel,
  HttpMethod,
  InteractionHints,
  Property,
  Parameter,
  Action,
  Resource,
  PageMeta,
  ExtractionResult,
  PreparedAction,
} from './types.js';
```

**Step 4: Verify build**

Run: `cd packages/agentic-microformats && npx tsc --noEmit`
Expected: success

**Step 5: Commit**

```
feat: add type definitions and DOM abstraction interface
```

---

### Task 3: Type Coercion

**Files:**
- Create: `packages/agentic-microformats/src/coerce.ts`
- Create: `packages/agentic-microformats/test/coerce.test.ts`

**Step 1: Write tests**

```typescript
import { describe, test, expect } from 'vitest';
import { coerceValue } from '../src/coerce.js';

describe('coerceValue', () => {
  test('string returns raw value', () => {
    expect(coerceValue('hello', 'string')).toBe('hello');
  });

  test('number parses float', () => {
    expect(coerceValue('14.99', 'number')).toBe(14.99);
  });

  test('number returns raw string for invalid input', () => {
    expect(coerceValue('not-a-number', 'number')).toBe('not-a-number');
  });

  test('integer parses int', () => {
    expect(coerceValue('42', 'integer')).toBe(42);
  });

  test('integer returns raw string for float input', () => {
    expect(coerceValue('42.7', 'integer')).toBe('42.7');
  });

  test('boolean parses true', () => {
    expect(coerceValue('true', 'boolean')).toBe(true);
  });

  test('boolean parses false', () => {
    expect(coerceValue('false', 'boolean')).toBe(false);
  });

  test('boolean returns raw string for invalid input', () => {
    expect(coerceValue('yes', 'boolean')).toBe('yes');
  });

  test('currency parses number', () => {
    expect(coerceValue('14.99', 'currency')).toBe(14.99);
  });

  test('currency strips common symbols', () => {
    expect(coerceValue('€14.99', 'currency')).toBe(14.99);
  });

  test('currency handles comma decimal separator', () => {
    expect(coerceValue('14,99', 'currency')).toBe(14.99);
  });

  test('date returns ISO string unchanged', () => {
    expect(coerceValue('2025-03-31', 'date')).toBe('2025-03-31');
  });

  test('datetime returns ISO string unchanged', () => {
    expect(coerceValue('2025-01-15T14:30:00Z', 'datetime')).toBe('2025-01-15T14:30:00Z');
  });

  test('url returns string unchanged', () => {
    expect(coerceValue('https://example.com', 'url')).toBe('https://example.com');
  });

  test('email returns string unchanged', () => {
    expect(coerceValue('user@example.com', 'email')).toBe('user@example.com');
  });

  test('enum returns string unchanged', () => {
    expect(coerceValue('pending', 'enum')).toBe('pending');
  });

  test('json parses valid JSON', () => {
    expect(coerceValue('{"key":"value"}', 'json')).toEqual({ key: 'value' });
  });

  test('json returns raw string for invalid JSON', () => {
    expect(coerceValue('not json', 'json')).toBe('not json');
  });

  test('defaults to string for unknown typehint', () => {
    expect(coerceValue('hello', 'string')).toBe('hello');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/agentic-microformats && npx vitest run test/coerce.test.ts`
Expected: FAIL — cannot find module

**Step 3: Implement coerce.ts**

```typescript
import type { TypeHint } from './types.js';

export function coerceValue(raw: string, typehint: TypeHint): unknown {
  switch (typehint) {
    case 'number': {
      const n = parseFloat(raw);
      return Number.isNaN(n) ? raw : n;
    }
    case 'integer': {
      const n = Number(raw);
      return Number.isInteger(n) ? n : raw;
    }
    case 'boolean': {
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return raw;
    }
    case 'currency': {
      const cleaned = raw.replace(/[^0-9.,\-]/g, '');
      // Handle comma as decimal separator (European format)
      // If there's a comma after the last dot, or no dot at all, treat comma as decimal
      const normalized = cleaned.includes(',') && (!cleaned.includes('.') || cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.'))
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
      const n = parseFloat(normalized);
      return Number.isNaN(n) ? raw : n;
    }
    case 'json': {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    case 'date':
    case 'datetime':
    case 'url':
    case 'email':
    case 'enum':
    case 'string':
    default:
      return raw;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/agentic-microformats && npx vitest run test/coerce.test.ts`
Expected: all pass

**Step 5: Commit**

```
feat: add type hint coercion with tests
```

---

### Task 4: Trust Boundary Checking

**Files:**
- Create: `packages/agentic-microformats/src/trust.ts`
- Create: `packages/agentic-microformats/test/trust.test.ts`

**Step 1: Write tests**

```typescript
import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { isUntrusted, isIgnored, getTrustLevel } from '../src/trust.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return document.body as unknown as AgentElement;
}

function q(root: AgentElement, selector: string): AgentElement {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

describe('isUntrusted', () => {
  test('returns false for system trust', () => {
    const root = dom('<main data-agent-trust="system"><div id="t"></div></main>');
    expect(isUntrusted(q(root, '#t'))).toBe(false);
  });

  test('returns true for untrusted region', () => {
    const root = dom('<section data-agent-trust="untrusted"><div id="t"></div></section>');
    expect(isUntrusted(q(root, '#t'))).toBe(true);
  });

  test('returns true for element inside untrusted ancestor', () => {
    const root = dom('<div data-agent-trust="untrusted"><div><span id="t">hi</span></div></div>');
    expect(isUntrusted(q(root, '#t'))).toBe(true);
  });

  test('returns false for verified region', () => {
    const root = dom('<div data-agent-trust="verified"><span id="t">hi</span></div>');
    expect(isUntrusted(q(root, '#t'))).toBe(false);
  });

  test('trust override: system inside untrusted', () => {
    const root = dom('<div data-agent-trust="untrusted"><div data-agent-trust="system"><span id="t">hi</span></div></div>');
    expect(isUntrusted(q(root, '#t'))).toBe(false);
  });
});

describe('isIgnored', () => {
  test('returns false by default', () => {
    const root = dom('<div><span id="t">hi</span></div>');
    expect(isIgnored(q(root, '#t'))).toBe(false);
  });

  test('returns true for ignored region', () => {
    const root = dom('<div data-agent-ignore="true"><span id="t">hi</span></div>');
    expect(isIgnored(q(root, '#t'))).toBe(true);
  });
});

describe('getTrustLevel', () => {
  test('defaults to system', () => {
    const root = dom('<div><span id="t">hi</span></div>');
    expect(getTrustLevel(q(root, '#t'))).toBe('system');
  });

  test('inherits from ancestor', () => {
    const root = dom('<div data-agent-trust="verified"><span id="t">hi</span></div>');
    expect(getTrustLevel(q(root, '#t'))).toBe('verified');
  });

  test('nearest ancestor wins', () => {
    const root = dom('<div data-agent-trust="untrusted"><div data-agent-trust="verified"><span id="t">hi</span></div></div>');
    expect(getTrustLevel(q(root, '#t'))).toBe('verified');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/agentic-microformats && npx vitest run test/trust.test.ts`
Expected: FAIL

**Step 3: Implement trust.ts**

```typescript
import type { AgentElement } from './dom.js';
import type { TrustLevel } from './types.js';

const TRUST_LEVELS: readonly string[] = ['system', 'untrusted', 'verified'];

export function getTrustLevel(el: AgentElement): TrustLevel {
  const closest = el.closest('[data-agent-trust]');
  if (!closest) return 'system';
  const value = closest.getAttribute('data-agent-trust');
  if (value && TRUST_LEVELS.includes(value)) return value as TrustLevel;
  return 'system';
}

export function isUntrusted(el: AgentElement): boolean {
  return getTrustLevel(el) === 'untrusted';
}

export function isIgnored(el: AgentElement): boolean {
  return el.closest('[data-agent-ignore="true"]') !== null;
}

export function shouldSkip(el: AgentElement): boolean {
  return isUntrusted(el) || isIgnored(el);
}
```

**Step 4: Run tests**

Run: `cd packages/agentic-microformats && npx vitest run test/trust.test.ts`
Expected: all pass

**Step 5: Commit**

```
feat: add trust boundary checking with tests
```

---

### Task 5: Interaction Hints

**Files:**
- Create: `packages/agentic-microformats/src/hints.ts`
- Create: `packages/agentic-microformats/test/hints.test.ts`

**Step 1: Write tests**

```typescript
import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractHints, requiresConfirmation } from '../src/hints.js';
import type { AgentElement } from '../src/dom.js';

function el(html: string): AgentElement {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return document.body.firstElementChild as unknown as AgentElement;
}

describe('extractHints', () => {
  test('returns defaults for element with no hints', () => {
    const hints = extractHints(el('<button>Click</button>'));
    expect(hints.role).toBeUndefined();
    expect(hints.risk).toBeUndefined();
    expect(hints.humanPreferred).toBe(false);
    expect(hints.reversible).toBeUndefined();
    expect(hints.cost).toBeUndefined();
  });

  test('extracts role', () => {
    expect(extractHints(el('<button data-agent-role="danger">X</button>')).role).toBe('danger');
  });

  test('extracts risk', () => {
    expect(extractHints(el('<button data-agent-risk="high">X</button>')).risk).toBe('high');
  });

  test('extracts human-preferred', () => {
    expect(extractHints(el('<button data-agent-human-preferred="true">X</button>')).humanPreferred).toBe(true);
  });

  test('extracts reversible', () => {
    expect(extractHints(el('<button data-agent-reversible="false">X</button>')).reversible).toBe(false);
  });

  test('extracts cost', () => {
    const hints = extractHints(el('<button data-agent-cost="49.99" data-agent-cost-currency="EUR">X</button>'));
    expect(hints.cost).toBe(49.99);
    expect(hints.costCurrency).toBe('EUR');
  });
});

describe('requiresConfirmation', () => {
  test('false for no hints', () => {
    expect(requiresConfirmation({ humanPreferred: false })).toBe(false);
  });

  test('true for high risk', () => {
    expect(requiresConfirmation({ humanPreferred: false, risk: 'high' })).toBe(true);
  });

  test('true for cost > 0', () => {
    expect(requiresConfirmation({ humanPreferred: false, cost: 10 })).toBe(true);
  });

  test('true for irreversible', () => {
    expect(requiresConfirmation({ humanPreferred: false, reversible: false })).toBe(true);
  });

  test('true for danger role', () => {
    expect(requiresConfirmation({ humanPreferred: false, role: 'danger' })).toBe(true);
  });

  test('false for medium risk alone', () => {
    expect(requiresConfirmation({ humanPreferred: false, risk: 'medium' })).toBe(false);
  });

  test('false for reversible true', () => {
    expect(requiresConfirmation({ humanPreferred: false, reversible: true })).toBe(false);
  });
});
```

**Step 2: Run to verify fail**

Run: `cd packages/agentic-microformats && npx vitest run test/hints.test.ts`

**Step 3: Implement hints.ts**

```typescript
import type { AgentElement } from './dom.js';
import type { InteractionHints, Role, RiskLevel } from './types.js';

const ROLES: readonly string[] = ['primary', 'secondary', 'danger'];
const RISK_LEVELS: readonly string[] = ['low', 'medium', 'high'];

export function extractHints(el: AgentElement): InteractionHints {
  const roleAttr = el.getAttribute('data-agent-role');
  const riskAttr = el.getAttribute('data-agent-risk');
  const humanPref = el.getAttribute('data-agent-human-preferred');
  const reversibleAttr = el.getAttribute('data-agent-reversible');
  const costAttr = el.getAttribute('data-agent-cost');
  const costCurrencyAttr = el.getAttribute('data-agent-cost-currency');

  const hints: InteractionHints = {
    humanPreferred: humanPref === 'true',
  };

  if (roleAttr && ROLES.includes(roleAttr)) {
    hints.role = roleAttr as Role;
  }
  if (riskAttr && RISK_LEVELS.includes(riskAttr)) {
    hints.risk = riskAttr as RiskLevel;
  }
  if (reversibleAttr === 'true' || reversibleAttr === 'false') {
    hints.reversible = reversibleAttr === 'true';
  }
  if (costAttr) {
    const cost = parseFloat(costAttr);
    if (!Number.isNaN(cost)) {
      hints.cost = cost;
      if (costCurrencyAttr) hints.costCurrency = costCurrencyAttr;
    }
  }

  return hints;
}

export function requiresConfirmation(hints: InteractionHints): boolean {
  if (hints.risk === 'high') return true;
  if (hints.cost !== undefined && hints.cost > 0) return true;
  if (hints.reversible === false) return true;
  if (hints.role === 'danger') return true;
  return false;
}
```

**Step 4: Run tests**

Run: `cd packages/agentic-microformats && npx vitest run test/hints.test.ts`
Expected: all pass

**Step 5: Commit**

```
feat: add interaction hints extraction with tests
```

---

### Task 6: Parameter Extraction

**Files:**
- Create: `packages/agentic-microformats/src/params.ts`
- Create: `packages/agentic-microformats/test/params.test.ts`

**Step 1: Write tests**

```typescript
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
```

**Step 2: Run to verify fail**

Run: `cd packages/agentic-microformats && npx vitest run test/params.test.ts`

**Step 3: Implement params.ts**

```typescript
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
```

**Step 4: Run tests**

Run: `cd packages/agentic-microformats && npx vitest run test/params.test.ts`
Expected: all pass

**Step 5: Commit**

```
feat: add parameter extraction and nested dot-notation expansion
```

---

### Task 7: Main Extraction Functions

**Files:**
- Create: `packages/agentic-microformats/src/extract.ts`
- Create: `packages/agentic-microformats/test/extract.test.ts`

**Step 1: Write tests**

```typescript
import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractMeta, extractResources, extractActions, extractAll } from '../src/extract.js';
import type { AgentElement } from '../src/dom.js';

function dom(html: string): AgentElement {
  const { document } = parseHTML(html);
  return document.documentElement as unknown as AgentElement;
}

describe('extractMeta', () => {
  test('parses data-agent-meta script', () => {
    const root = dom(`<!DOCTYPE html><html><head></head><body>
      <script type="application/json" data-agent-meta>
      {"provider":{"name":"Test Co"},"defaults":{"currency":"EUR"}}
      </script>
    </body></html>`);
    const meta = extractMeta(root);
    expect(meta.provider?.name).toBe('Test Co');
    expect(meta.defaults?.currency).toBe('EUR');
  });

  test('returns empty object when no meta', () => {
    const root = dom('<!DOCTYPE html><html><body></body></html>');
    const meta = extractMeta(root);
    expect(meta).toEqual({});
  });

  test('parses agent policies', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <script type="application/json" data-agent-meta>
      {"agent_policies":{"rate_limit":{"requests_per_minute":60},"require_auth":true}}
      </script>
    </body></html>`);
    const meta = extractMeta(root);
    expect(meta.agentPolicies?.rateLimit?.requestsPerMinute).toBe(60);
    expect(meta.agentPolicies?.requireAuth).toBe(true);
  });
});

describe('extractResources', () => {
  test('extracts a simple resource with properties', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="product" data-agent-id="SKU-1">
        <span data-agent-prop="name">Widget</span>
        <span data-agent-prop="price" data-agent-typehint="currency" data-agent-currency="EUR">14.99</span>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources).toHaveLength(1);
    expect(resources[0].type).toBe('product');
    expect(resources[0].id).toBe('SKU-1');
    expect(resources[0].properties.name.rawValue).toBe('Widget');
    expect(resources[0].properties.price.value).toBe(14.99);
    expect(resources[0].properties.price.currency).toBe('EUR');
  });

  test('uses data-agent-value when present', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <span data-agent-prop="due_date" data-agent-typehint="date" data-agent-value="2025-03-31">31. März 2025</span>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources[0].properties.due_date.rawValue).toBe('2025-03-31');
    expect(resources[0].properties.due_date.value).toBe('2025-03-31');
  });

  test('extracts actions within a resource', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <button data-agent="action" data-agent-name="approve"
                data-agent-method="POST" data-agent-endpoint="/approve">Approve</button>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources[0].actions).toHaveLength(1);
    expect(resources[0].actions[0].name).toBe('approve');
    expect(resources[0].actions[0].target).toBe('P1');
  });

  test('action inherits target from nearest resource', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="ticket" data-agent-id="T-91">
        <button data-agent="action" data-agent-name="close"
                data-agent-method="POST" data-agent-endpoint="/close">Close</button>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources[0].actions[0].target).toBe('T-91');
  });

  test('explicit target overrides inherited', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="ticket" data-agent-id="T-91">
        <button data-agent="action" data-agent-name="link"
                data-agent-target="T-92"
                data-agent-method="POST" data-agent-endpoint="/link">Link</button>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources[0].actions[0].target).toBe('T-92');
  });

  test('skips resources in untrusted regions', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <main data-agent-trust="system">
        <div data-agent="resource" data-agent-type="product" data-agent-id="P1">
          <span data-agent-prop="name">Real</span>
        </div>
      </main>
      <section data-agent-trust="untrusted">
        <div data-agent="resource" data-agent-type="product" data-agent-id="FAKE">
          <span data-agent-prop="name">Fake</span>
        </div>
      </section>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe('P1');
  });

  test('skips resources in ignored regions', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="product" data-agent-id="P1">
        <span data-agent-prop="name">Visible</span>
      </div>
      <aside data-agent-ignore="true">
        <div data-agent="resource" data-agent-type="product" data-agent-id="P2">
          <span data-agent-prop="name">Ignored</span>
        </div>
      </aside>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe('P1');
  });

  test('handles nested resources', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="order" data-agent-id="ORD-1">
        <span data-agent-prop="status">processing</span>
        <div data-agent="resource" data-agent-type="order-item" data-agent-id="ITEM-1">
          <span data-agent-prop="product_name">Widget</span>
        </div>
      </div>
    </body></html>`);
    const resources = extractResources(root);
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe('ORD-1');
    expect(resources[0].children).toHaveLength(1);
    expect(resources[0].children[0].id).toBe('ITEM-1');
    expect(resources[0].children[0].properties.product_name.rawValue).toBe('Widget');
  });

  test('extracts description with fallback chain', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <button data-agent="action" data-agent-name="delete"
                data-agent-description="Permanently delete this project">Delete</button>
      </div>
    </body></html>`);
    expect(extractResources(root)[0].actions[0].description).toBe('Permanently delete this project');
  });

  test('falls back to aria-label for description', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <button data-agent="action" data-agent-name="archive"
                aria-label="Archive this project">Archive</button>
      </div>
    </body></html>`);
    expect(extractResources(root)[0].actions[0].description).toBe('Archive this project');
  });

  test('extracts headers from action', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <form data-agent="action" data-agent-name="submit"
            data-agent-method="POST" data-agent-endpoint="/api"
            data-agent-headers='{"Content-Type":"application/json"}'>
      </form>
    </body></html>`);
    const actions = extractActions(root);
    expect(actions[0].headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('extractActions', () => {
  test('extracts standalone actions (not in a resource)', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <button data-agent="action" data-agent-name="inside">Inside</button>
      </div>
      <form data-agent="action" data-agent-name="create_project"
            data-agent-method="POST" data-agent-endpoint="/api/projects">
        <input data-agent-param="name" required>
      </form>
    </body></html>`);
    const actions = extractActions(root);
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe('create_project');
    expect(actions[0].params).toHaveLength(1);
  });
});

describe('extractAll', () => {
  test('extracts everything from product page example', () => {
    const root = dom(`<!DOCTYPE html><html><body>
      <script type="application/json" data-agent-meta>
      {"provider":{"name":"Example Shop GmbH"},"defaults":{"currency":"EUR"}}
      </script>
      <main data-agent-trust="system">
        <article data-agent="resource" data-agent-type="product" data-agent-id="SKU-USB-C-2M">
          <h1 data-agent-prop="name">USB-C Cable 2m</h1>
          <span data-agent-prop="price" data-agent-typehint="currency" data-agent-currency="EUR">14.99</span>
          <form data-agent="action" data-agent-name="add_to_cart"
                data-agent-method="POST" data-agent-endpoint="/cart/add"
                data-agent-role="primary">
            <input data-agent-param="product_id" type="hidden" value="SKU-USB-C-2M">
            <input data-agent-param="quantity" data-agent-typehint="integer" type="number" value="1" required>
          </form>
        </article>
      </main>
      <section data-agent-trust="untrusted"></section>
    </body></html>`);

    const result = extractAll(root);
    expect(result.meta.provider?.name).toBe('Example Shop GmbH');
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].properties.price.value).toBe(14.99);
    expect(result.resources[0].actions[0].name).toBe('add_to_cart');
    expect(result.resources[0].actions[0].params).toHaveLength(2);
    expect(result.actions).toHaveLength(0);
  });
});
```

**Step 2: Run to verify fail**

Run: `cd packages/agentic-microformats && npx vitest run test/extract.test.ts`

**Step 3: Implement extract.ts**

```typescript
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

  const describedBy = el.getAttribute('aria-describedby');
  if (describedBy) {
    // aria-describedby references an element by ID — attempt to find it
    // Using closest to get to root, then querySelector
    // This is a best-effort approach; in a full DOM it works via document.getElementById
    const root = el.closest('html') ?? el.closest('body');
    if (root) {
      const target = root.querySelector(`#${CSS.escape ? describedBy : describedBy}`);
      if (target?.textContent) return target.textContent.trim();
    }
  }

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

function extractResourceTree(el: AgentElement): Resource {
  const type = el.getAttribute('data-agent-type') ?? '';
  const id = el.getAttribute('data-agent-id') ?? '';

  // Find direct child resources (nested)
  const allNestedResources = el.querySelectorAll('[data-agent="resource"]');
  const directChildren: Resource[] = [];
  for (let i = 0; i < allNestedResources.length; i++) {
    const nested = allNestedResources[i];
    // Only direct children: their closest resource ancestor should be this element
    if (nested.closest('[data-agent="resource"]') === el) {
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
  const resources: Resource[] = [];

  for (let i = 0; i < allResourceEls.length; i++) {
    const el = allResourceEls[i];

    // Only top-level resources (no resource ancestor)
    const parent = el.closest('[data-agent="resource"]');
    // closest includes self in the browser DOM — we need to check if parent IS the element
    // In linkedom, closest also checks self. So we skip if there's a resource ancestor that isn't self.
    // We need a different approach: check if any ancestor (not self) is a resource.
    if (parent && parent !== el) continue;

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
```

**Step 4: Run tests**

Run: `cd packages/agentic-microformats && npx vitest run test/extract.test.ts`
Expected: all pass

**Step 5: Commit**

```
feat: add core extraction functions (resources, actions, meta)
```

---

### Task 8: Observer

**Files:**
- Create: `packages/agentic-microformats/src/observe.ts`
- Create: `packages/agentic-microformats/test/observe.test.ts`

**Step 1: Write tests** (basic structural tests — MutationObserver not available in linkedom)

```typescript
import { describe, test, expect } from 'vitest';
import { observe } from '../src/observe.js';

describe('observe', () => {
  test('throws when MutationObserver is not available', () => {
    const fakeRoot = {} as any;
    expect(() => observe(fakeRoot, () => {})).toThrow('MutationObserver');
  });
});
```

**Step 2: Run to verify fail**

Run: `cd packages/agentic-microformats && npx vitest run test/observe.test.ts`

**Step 3: Implement observe.ts**

```typescript
import type { AgentElement } from './dom.js';
import type { Resource, Action, Property } from './types.js';
import { extractResources, extractActions } from './extract.js';

export interface AgentMutation {
  type:
    | 'resource-added'
    | 'resource-removed'
    | 'resource-changed'
    | 'action-added'
    | 'action-removed'
    | 'action-changed'
    | 'property-changed';
  element: AgentElement;
  resource?: Resource;
  action?: Action;
  property?: Property;
  previousValue?: string;
}

export type MutationCallback = (mutations: AgentMutation[]) => void;

export function observe(
  root: AgentElement,
  callback: MutationCallback,
): { disconnect(): void } {
  if (typeof MutationObserver === 'undefined') {
    throw new Error(
      'Observation requires a DOM environment with MutationObserver support. ' +
      'This feature is not available in Node.js without a browser-like environment.',
    );
  }

  let previousResources = extractResources(root);
  let previousActions = extractActions(root);

  const resourceIndex = new Map<string, Resource>();
  for (const r of previousResources) resourceIndex.set(r.id, r);

  const observer = new MutationObserver(() => {
    const currentResources = extractResources(root);
    const currentActions = extractActions(root);
    const agentMutations: AgentMutation[] = [];

    const currentIndex = new Map<string, Resource>();
    for (const r of currentResources) currentIndex.set(r.id, r);

    // Detect added/changed resources
    for (const r of currentResources) {
      const prev = resourceIndex.get(r.id);
      if (!prev) {
        agentMutations.push({ type: 'resource-added', element: r.element, resource: r });
      } else {
        // Check for property changes
        for (const [propName, prop] of Object.entries(r.properties)) {
          const prevProp = prev.properties[propName];
          if (!prevProp || prevProp.rawValue !== prop.rawValue) {
            agentMutations.push({
              type: 'property-changed',
              element: prop.element,
              resource: r,
              property: prop,
              previousValue: prevProp?.rawValue,
            });
          }
        }
      }
    }

    // Detect removed resources
    for (const r of previousResources) {
      if (!currentIndex.has(r.id)) {
        agentMutations.push({ type: 'resource-removed', element: r.element, resource: r });
      }
    }

    // Detect action changes (by name + target)
    const actionKey = (a: Action) => `${a.name}:${a.target ?? ''}`;
    const prevActionIndex = new Map<string, Action>();
    for (const a of previousActions) prevActionIndex.set(actionKey(a), a);
    const currActionIndex = new Map<string, Action>();
    for (const a of currentActions) currActionIndex.set(actionKey(a), a);

    for (const a of currentActions) {
      if (!prevActionIndex.has(actionKey(a))) {
        agentMutations.push({ type: 'action-added', element: a.element, action: a });
      }
    }
    for (const a of previousActions) {
      if (!currActionIndex.has(actionKey(a))) {
        agentMutations.push({ type: 'action-removed', element: a.element, action: a });
      }
    }

    previousResources = currentResources;
    previousActions = currentActions;
    resourceIndex.clear();
    for (const r of currentResources) resourceIndex.set(r.id, r);

    if (agentMutations.length > 0) {
      callback(agentMutations);
    }
  });

  observer.observe(root as unknown as Node, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
    attributeFilter: [
      'data-agent', 'data-agent-type', 'data-agent-id',
      'data-agent-prop', 'data-agent-value', 'data-agent-typehint',
      'data-agent-name', 'data-agent-target', 'data-agent-method',
      'data-agent-endpoint', 'data-agent-role', 'data-agent-risk',
      'data-agent-human-preferred', 'data-agent-reversible',
      'data-agent-cost', 'data-agent-trust', 'data-agent-ignore',
      'disabled', 'value', 'required',
    ],
  });

  return {
    disconnect() {
      observer.disconnect();
    },
  };
}
```

**Step 4: Run tests**

Run: `cd packages/agentic-microformats && npx vitest run test/observe.test.ts`
Expected: pass

**Step 5: Commit**

```
feat: add DOM mutation observer with semantic event translation
```

---

### Task 9: AgentDOM Class Facade

**Files:**
- Create: `packages/agentic-microformats/src/agent-dom.ts`
- Create: `packages/agentic-microformats/test/agent-dom.test.ts`
- Modify: `packages/agentic-microformats/src/index.ts` (final exports)

**Step 1: Write tests**

```typescript
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';
import { AgentDOM } from '../src/agent-dom.js';
import type { AgentElement } from '../src/dom.js';

function domFromHtml(html: string): AgentElement {
  const { document } = parseHTML(html);
  return document.documentElement as unknown as AgentElement;
}

function domFromFile(relativePath: string): AgentElement {
  const html = readFileSync(resolve(__dirname, '../../', relativePath), 'utf-8');
  return domFromHtml(html);
}

describe('AgentDOM', () => {
  test('parses product page example', () => {
    const root = domFromFile('examples/ecommerce/product-page.html');
    const agent = new AgentDOM(root);

    expect(agent.meta.provider?.name).toBe('Example Shop GmbH');
    expect(agent.meta.defaults?.currency).toBe('EUR');
    expect(agent.resources).toHaveLength(1);

    const product = agent.resources[0];
    expect(product.type).toBe('product');
    expect(product.id).toBe('SKU-USB-C-2M');
    expect(product.properties.name.rawValue).toBe('USB-C Cable 2m');
    expect(product.properties.price.value).toBe(14.99);
    expect(product.properties.price.currency).toBe('EUR');
    expect(product.properties.rating.value).toBe(4.7);
    expect(product.properties.rating_count.value).toBe(246);
  });

  test('parses project dashboard example', () => {
    const root = domFromFile('examples/basic/project-dashboard.html');
    const agent = new AgentDOM(root);

    expect(agent.resources).toHaveLength(2);
    expect(agent.meta.agentPolicies?.rateLimit?.requestsPerMinute).toBe(60);

    const prj1 = agent.getResource('PRJ-2025-001');
    expect(prj1).toBeDefined();
    expect(prj1!.properties.progress.value).toBe(65);
    expect(prj1!.properties.due_date.rawValue).toBe('2025-03-31');
    expect(prj1!.actions).toHaveLength(4);

    const deleteAction = agent.getAction('delete', 'PRJ-2025-001');
    expect(deleteAction).toBeDefined();
    expect(deleteAction!.hints.risk).toBe('high');
    expect(deleteAction!.hints.reversible).toBe(false);
    expect(deleteAction!.hints.humanPreferred).toBe(true);

    // Standalone action
    expect(agent.actions).toHaveLength(1);
    expect(agent.actions[0].name).toBe('create_project');
  });

  test('parses nested parameters example', () => {
    const root = domFromFile('examples/forms/nested-parameters.html');
    const agent = new AgentDOM(root);

    expect(agent.actions).toHaveLength(1);
    const action = agent.actions[0];
    expect(action.name).toBe('update_user_settings');
    expect(action.method).toBe('PUT');
    expect(action.params.length).toBeGreaterThan(5);
  });

  test('getResource returns undefined for missing id', () => {
    const root = domFromHtml('<!DOCTYPE html><html><body></body></html>');
    const agent = new AgentDOM(root);
    expect(agent.getResource('nope')).toBeUndefined();
  });

  test('getAction finds by name', () => {
    const root = domFromHtml(`<!DOCTYPE html><html><body>
      <button data-agent="action" data-agent-name="save" data-agent-method="POST">Save</button>
    </body></html>`);
    const agent = new AgentDOM(root);
    expect(agent.getAction('save')).toBeDefined();
  });

  test('prepareAction builds request with confirmation', () => {
    const root = domFromHtml(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="project" data-agent-id="P1">
        <button data-agent="action" data-agent-name="delete"
                data-agent-method="DELETE" data-agent-endpoint="/api/projects/P1"
                data-agent-risk="high" data-agent-reversible="false"
                data-agent-cost="100" data-agent-cost-currency="EUR">Delete</button>
      </div>
    </body></html>`);
    const agent = new AgentDOM(root);
    const action = agent.getAction('delete', 'P1')!;
    const prepared = agent.prepareAction(action);

    expect(prepared.method).toBe('DELETE');
    expect(prepared.url).toBe('/api/projects/P1');
    expect(prepared.confirmationRequired).toBe(true);
    expect(prepared.warnings).toContain('High risk action');
    expect(prepared.warnings).toContain('Irreversible action');
    expect(prepared.warnings.some(w => w.includes('100'))).toBe(true);
  });

  test('prepareAction merges provided param values', () => {
    const root = domFromHtml(`<!DOCTYPE html><html><body>
      <form data-agent="action" data-agent-name="create"
            data-agent-method="POST" data-agent-endpoint="/api/items"
            data-agent-headers='{"Content-Type":"application/json"}'>
        <input data-agent-param="name" value="">
        <input data-agent-param="count" data-agent-typehint="integer" value="0">
      </form>
    </body></html>`);
    const agent = new AgentDOM(root);
    const action = agent.getAction('create')!;
    const prepared = agent.prepareAction(action, { name: 'Widget', count: 5 });

    expect(prepared.body).toEqual({ name: 'Widget', count: 5 });
    expect(prepared.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(prepared.confirmationRequired).toBe(false);
  });

  test('extract() forces re-parse', () => {
    const root = domFromHtml(`<!DOCTYPE html><html><body>
      <div data-agent="resource" data-agent-type="item" data-agent-id="I1">
        <span data-agent-prop="name">First</span>
      </div>
    </body></html>`);
    const agent = new AgentDOM(root);
    expect(agent.resources).toHaveLength(1);

    // extract() should return fresh results
    const result = agent.extract();
    expect(result.resources).toHaveLength(1);
  });
});
```

**Step 2: Run to verify fail**

Run: `cd packages/agentic-microformats && npx vitest run test/agent-dom.test.ts`

**Step 3: Implement agent-dom.ts**

```typescript
import type { AgentElement } from './dom.js';
import type {
  Resource, Action, PageMeta, ExtractionResult, PreparedAction, HttpMethod,
} from './types.js';
import { extractMeta, extractResources, extractActions, extractAll } from './extract.js';
import { buildNestedParams } from './params.js';
import { requiresConfirmation } from './hints.js';
import { observe, type MutationCallback } from './observe.js';

export class AgentDOM {
  private root: AgentElement;
  private _cache: ExtractionResult | null = null;

  constructor(root: AgentElement) {
    this.root = root;
  }

  private ensureCache(): ExtractionResult {
    if (!this._cache) {
      this._cache = extractAll(this.root);
    }
    return this._cache;
  }

  get meta(): PageMeta {
    return this.ensureCache().meta;
  }

  get resources(): Resource[] {
    return this.ensureCache().resources;
  }

  get actions(): Action[] {
    return this.ensureCache().actions;
  }

  extract(): ExtractionResult {
    this._cache = null;
    return this.ensureCache();
  }

  getResource(id: string): Resource | undefined {
    const search = (resources: Resource[]): Resource | undefined => {
      for (const r of resources) {
        if (r.id === id) return r;
        const found = search(r.children);
        if (found) return found;
      }
      return undefined;
    };
    return search(this.resources);
  }

  getAction(name: string, targetId?: string): Action | undefined {
    // Search in resources
    const searchResources = (resources: Resource[]): Action | undefined => {
      for (const r of resources) {
        for (const a of r.actions) {
          if (a.name === name && (targetId === undefined || a.target === targetId)) {
            return a;
          }
        }
        const found = searchResources(r.children);
        if (found) return found;
      }
      return undefined;
    };

    const fromResources = searchResources(this.resources);
    if (fromResources) return fromResources;

    // Search standalone actions
    for (const a of this.actions) {
      if (a.name === name && (targetId === undefined || a.target === targetId)) {
        return a;
      }
    }

    return undefined;
  }

  observe(callback: MutationCallback): { disconnect(): void } {
    this._cache = null;
    return observe(this.root, (mutations) => {
      this._cache = null;
      callback(mutations);
    });
  }

  prepareAction(action: Action, paramValues?: Record<string, unknown>): PreparedAction {
    const warnings: string[] = [];

    if (action.hints.risk === 'high') warnings.push('High risk action');
    if (action.hints.risk === 'medium') warnings.push('Medium risk action');
    if (action.hints.reversible === false) warnings.push('Irreversible action');
    if (action.hints.humanPreferred) warnings.push('Human confirmation preferred');
    if (action.hints.cost !== undefined && action.hints.cost > 0) {
      const currency = action.hints.costCurrency ?? '';
      warnings.push(`Cost: ${action.hints.cost}${currency ? ' ' + currency : ''}`);
    }
    if (action.hints.role === 'danger') warnings.push('Danger action');

    let body: Record<string, unknown>;
    if (paramValues) {
      body = paramValues;
    } else {
      body = buildNestedParams(action.params);
    }

    return {
      method: action.method,
      url: action.endpoint ?? '',
      headers: action.headers ?? {},
      body,
      confirmationRequired: requiresConfirmation(action.hints),
      warnings,
    };
  }
}
```

**Step 4: Update index.ts with all exports**

```typescript
// Types
export type { AgentElement } from './dom.js';
export type {
  TypeHint,
  Role,
  RiskLevel,
  TrustLevel,
  HttpMethod,
  InteractionHints,
  Property,
  Parameter,
  Action,
  Resource,
  PageMeta,
  ExtractionResult,
  PreparedAction,
} from './types.js';

// Functional API
export { coerceValue } from './coerce.js';
export { isUntrusted, isIgnored, getTrustLevel, shouldSkip } from './trust.js';
export { extractHints, requiresConfirmation } from './hints.js';
export { extractParameters, buildNestedParams } from './params.js';
export { extractMeta, extractResources, extractActions, extractAll } from './extract.js';
export { observe } from './observe.js';
export type { AgentMutation, MutationCallback } from './observe.js';

// Class API
export { AgentDOM } from './agent-dom.js';
```

**Step 5: Run all tests**

Run: `cd packages/agentic-microformats && npx vitest run`
Expected: all tests pass

**Step 6: Verify build**

Run: `cd packages/agentic-microformats && npx tsc`
Expected: compiles without error, outputs to dist/

**Step 7: Commit**

```
feat: add AgentDOM class facade and complete public API
```

---

### Task 10: Final Verification

**Step 1: Run full test suite**

Run: `cd packages/agentic-microformats && npx vitest run`
Expected: all tests pass

**Step 2: Build**

Run: `cd packages/agentic-microformats && npx tsc`
Expected: clean build

**Step 3: Verify dist output**

Run: `ls packages/agentic-microformats/dist/`
Expected: .js, .d.ts, .js.map files for all modules

**Step 4: Commit**

```
feat: reference implementation v0.1.0 complete
```
