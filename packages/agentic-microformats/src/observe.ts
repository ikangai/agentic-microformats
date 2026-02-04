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

    // Detect action changes
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
