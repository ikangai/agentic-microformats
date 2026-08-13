/**
 * Typed error surface (0.8.0).
 *
 * A consumer building real recovery cannot program against prose. This turns a
 * failed action — an HTTP error response or a transport exception — into a
 * normalized `AgentError` with a `kind`, a `retryable` flag, and retry hints,
 * so an agent can decide "retry / re-auth / re-read state / give up" by rule
 * instead of by inference.
 *
 * `retryable` is about the ERROR (does the server invite another attempt);
 * whether the ACTION is safe to repeat is a separate question answered by
 * `idempotentHint`. A robust consumer retries only when BOTH hold — or, for a
 * `conflict`, re-reads state first (`requiresFreshState`).
 */

export type ErrorKind =
  | 'network'     // transport failed; no response
  | 'validation'  // 400 / 422 — the request was malformed or invalid
  | 'auth'        // 401 — authentication required / expired
  | 'forbidden'   // 403 — authenticated but not allowed
  | 'not-found'   // 404 / 410
  | 'conflict'    // 409 — state moved under us; re-read and retry
  | 'rate-limit'  // 429
  | 'server'      // 5xx / 408 — transient server-side
  | 'client'      // other 4xx — caller's fault, not retryable
  | 'unknown';

export interface AgentError {
  kind: ErrorKind;
  retryable: boolean;
  message: string;
  status?: number;
  /** Seconds to wait before retrying, when the server said so (429/503). */
  retryAfter?: number;
  /** True when a retry must re-read state first (409 conflict). */
  requiresFreshState?: boolean;
}

function messageFrom(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 300);
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const k of ['message', 'error', 'error_description', 'detail', 'title']) {
      const v = b[k];
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 300);
    }
  }
  return fallback;
}

function parseRetryAfter(headers?: Record<string, string>): number | undefined {
  if (!headers) return undefined;
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs;
  const when = Date.parse(raw); // HTTP-date form
  if (!Number.isNaN(when)) return Math.max(0, Math.round((when - Date.now()) / 1000));
  return undefined;
}

/** Classify a failed HTTP response into a typed error. */
export function classifyResponse(
  status: number, body?: unknown, headers?: Record<string, string>
): AgentError {
  const base = { status, message: '' };
  const mk = (kind: ErrorKind, retryable: boolean, extra: Partial<AgentError> = {}): AgentError => ({
    ...base, kind, retryable, message: messageFrom(body, `HTTP ${status}`), ...extra,
  });
  switch (status) {
    case 400:
    case 422: return mk('validation', false);
    case 401: return mk('auth', false);
    case 403: return mk('forbidden', false);
    case 404:
    case 410: return mk('not-found', false);
    case 408: return mk('server', true);
    case 409: return mk('conflict', true, { requiresFreshState: true });
    case 429: return mk('rate-limit', true, { retryAfter: parseRetryAfter(headers) });
    case 500:
    case 502:
    case 503:
    case 504: return mk('server', true, { retryAfter: parseRetryAfter(headers) });
    default:
      if (status >= 500) return mk('server', true);
      if (status >= 400) return mk('client', false);
      return mk('unknown', false);
  }
}

/** Classify a transport-level failure (no response arrived). */
export function classifyNetworkError(err: unknown): AgentError {
  return { kind: 'network', retryable: true, message: `network: ${String((err as any)?.message ?? err).slice(0, 200)}` };
}
