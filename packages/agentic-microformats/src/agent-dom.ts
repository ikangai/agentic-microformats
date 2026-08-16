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

  /**
   * Build an executable request from an action, applying fail-closed safety
   * gates (spec §3.2, §12.5). Pass `opts.origin` (the page's origin) to enable
   * same-origin enforcement — an absolute cross-origin endpoint without
   * `data-agent-cross-origin="true"` is refused (`blocked: true`) and MUST NOT
   * be sent. `confirmationRequired` is method-aware: a state-mutating action
   * with no explicit `risk="low"` requires confirmation.
   */
  prepareAction(
    action: Action,
    paramValues?: Record<string, unknown>,
    opts?: { origin?: string }
  ): PreparedAction {
    const warnings: string[] = [];

    if (action.hints.risk === 'high') warnings.push('High risk action');
    if (action.hints.risk === 'medium') warnings.push('Medium risk action');
    if (action.hints.risk === undefined && !this.isSafeMethod(action.method)) {
      warnings.push('State-changing action with no declared risk level — treated as requiring confirmation');
    }
    if (action.hints.reversible === false) warnings.push('Irreversible action');
    if (action.hints.humanPreferred) warnings.push('Human confirmation preferred');
    if (action.hints.cost !== undefined && action.hints.cost > 0) {
      const currency = action.hints.costCurrency ?? '';
      warnings.push(`Cost: ${action.hints.cost}${currency ? ' ' + currency : ''}`);
    }
    if (action.hints.role === 'danger') warnings.push('Danger action');

    const url = action.endpoint ?? '';
    let blocked = false;
    const crossOrigin = this.isCrossOrigin(url, opts?.origin);
    if (crossOrigin && action.crossOrigin !== true) {
      blocked = true;
      warnings.push(
        `Refused: cross-origin endpoint "${url}" without data-agent-cross-origin="true" (spec §12.5)`
      );
    }

    let body: Record<string, unknown>;
    if (paramValues) {
      body = paramValues;
    } else {
      body = buildNestedParams(action.params);
    }

    // Optimistic concurrency (spec §5, 0.4): a mutating action on a versioned
    // resource sends If-Match, so a write against a stale version is rejected
    // (409 conflict) instead of clobbering a change made since the graph was
    // read. Skipped for safe methods and if the site already set If-Match.
    const headers: Record<string, string> = { ...(action.headers ?? {}) };
    if (
      !this.isSafeMethod(action.method) &&
      action.resourceVersion &&
      !Object.keys(headers).some((h) => h.toLowerCase() === 'if-match')
    ) {
      headers['If-Match'] = action.resourceVersion;
    }

    return {
      method: action.method,
      url,
      headers,
      body,
      confirmationRequired: blocked || requiresConfirmation(action.hints, action.method),
      blocked,
      warnings,
    };
  }

  private isSafeMethod(method: string): boolean {
    return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  }

  /** True only when the endpoint is an absolute URL on a different origin. */
  private isCrossOrigin(endpoint: string, origin?: string): boolean {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint)) return false; // relative → same-origin
    if (!origin) return true; // absolute endpoint, no origin to compare → treat as cross-origin
    try {
      return new URL(endpoint).origin !== new URL(origin).origin;
    } catch {
      return true;
    }
  }
}
