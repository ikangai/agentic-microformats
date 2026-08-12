import type { AgentElement } from './dom.js';
import type { TrustLevel } from './types.js';

/**
 * Effective trust level of an element (spec §10), computed **monotonically and
 * fail-closed** (hardened 0.3.2 after external review):
 *
 * - Once any ancestor region is `untrusted`, descendants CANNOT raise their
 *   own trust back to `system`/`verified`. `closest('[…="untrusted"]')` finds
 *   an outer untrusted boundary even when a nearer element declares `system`.
 * - An invalid/unknown `data-agent-trust` value fails closed to `untrusted`,
 *   not open to `system`.
 *
 * Note: `system` means "publisher-marked", NOT "trusted by the agent" — the
 * agent remains the authority on whether to trust publisher-marked content.
 */
export function getTrustLevel(el: AgentElement): TrustLevel {
  // Monotonic: any untrusted ancestor wins, regardless of nearer declarations.
  if (el.closest('[data-agent-trust="untrusted"]') !== null) return 'untrusted';

  const boundary = el.closest('[data-agent-trust]');
  if (!boundary) return 'system';

  const value = boundary.getAttribute('data-agent-trust');
  // Fail closed: only the two explicitly-safe values pass; anything else
  // (including an unknown/misspelled level) is treated as untrusted.
  if (value === 'system' || value === 'verified') return value;
  return 'untrusted';
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
