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
