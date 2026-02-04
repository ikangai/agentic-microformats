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
