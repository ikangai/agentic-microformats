/**
 * Shared execution core used by both the `operate()` episode loop and the
 * `executeTool()` helper for native function-calling loops. Executes an
 * already-safety-gated PreparedAction against the chosen environment.
 */

import type { Action, PreparedAction } from './types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface ExecuteEnv {
  /** 'http' (default): call the endpoint via sendRequest. 'browser': drive the DOM control. */
  mode?: 'http' | 'browser';
  /**
   * http transport — implement with the user's session/cookies. Returning
   * `headers` lets the error classifier read `Retry-After` on 429/503.
   */
  sendRequest?: (req: {
    method: string; url: string; headers: Record<string, string>; body: Record<string, unknown>;
  }) => Promise<{ status: number; body: unknown; headers?: Record<string, string> }>;
}

/**
 * Execute a prepared action. Assumes safety gates (blocked / confirmation) have
 * already been checked by the caller — this only performs the side effect.
 */
export async function executePrepared(
  action: Action, prepared: PreparedAction, env: ExecuteEnv
): Promise<unknown> {
  if ((env.mode ?? 'http') === 'browser') {
    const el: any = action.element;
    for (const p of action.params) {
      if (!(p.name in (prepared.body as object))) continue;
      const input: any = p.element;
      const v = (prepared.body as any)[p.name];
      if (input && 'value' in input) {
        if ((input.type || '').toLowerCase() === 'checkbox') input.checked = !!v;
        else input.value = String(v);
      }
    }
    const form = (el?.tagName || '').toUpperCase() === 'FORM' ? el : el?.form ?? el?.closest?.('form');
    if (form?.requestSubmit) { form.requestSubmit(el !== form ? el : undefined); return { bound: 'dom-form' }; }
    if (el?.click) { el.click(); return { bound: 'dom-element' }; }
    throw new Error('browser mode: no control to drive');
  }

  if (env.sendRequest) {
    return env.sendRequest({ method: prepared.method, url: prepared.url, headers: prepared.headers, body: prepared.body });
  }
  const g: any = globalThis as any;
  if (typeof g.fetch !== 'function') throw new Error('http mode: provide sendRequest or a global fetch');
  const safe = SAFE_METHODS.has(prepared.method.toUpperCase());
  const res = await g.fetch(prepared.url, {
    method: prepared.method,
    headers: { 'Content-Type': 'application/json', ...prepared.headers },
    body: safe ? undefined : JSON.stringify(prepared.body),
  });
  let body: unknown; try { body = await res.json(); } catch { body = await res.text().catch(() => ''); }
  const headers: Record<string, string> = {};
  try { res.headers?.forEach?.((v: string, k: string) => { headers[k] = v; }); } catch { /* no headers */ }
  return { status: res.status, body, headers };
}
