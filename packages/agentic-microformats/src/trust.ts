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
