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
