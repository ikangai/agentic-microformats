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

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Whether an agent must obtain explicit human confirmation before executing.
 *
 * Fail-closed (spec §3.2, §8): confirmation is required for any declared
 * danger signal, for a human-preferred action, AND — when the request method
 * is known — for a state-mutating action the site did NOT explicitly mark
 * `risk="low"`. Passing the method is strongly recommended; without it the
 * missing-hints case cannot be evaluated and only the explicit signals gate.
 * Hints are advisory: the agent remains the final authority and MAY escalate.
 */
export function requiresConfirmation(hints: InteractionHints, method?: string): boolean {
  if (hints.risk === 'high') return true;
  if (hints.cost !== undefined && hints.cost > 0) return true;
  if (hints.reversible === false) return true;
  if (hints.role === 'danger') return true;
  if (hints.humanPreferred) return true;
  const mutating = method !== undefined && !SAFE_METHODS.has(method.toUpperCase());
  if (mutating && hints.risk === undefined) return true;
  return false;
}
