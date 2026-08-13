// Types
export type { AgentElement } from './dom.js';
export type {
  TypeHint,
  Role,
  RiskLevel,
  TrustLevel,
  HttpMethod,
  InteractionHints,
  Property,
  Parameter,
  Action,
  Resource,
  PageMeta,
  ExtractionResult,
  PreparedAction,
} from './types.js';

// Functional API
export { coerceValue } from './coerce.js';
export { isUntrusted, isIgnored, getTrustLevel, shouldSkip } from './trust.js';
export { extractHints, requiresConfirmation } from './hints.js';
export { extractParameters, buildNestedParams } from './params.js';
export { extractMeta, extractResources, extractActions, extractAll } from './extract.js';
export { toGraph, toGraphJSON, GRAPH_FORMAT_VERSION } from './serialize.js';
export { validate } from './validate.js';
export type { ValidationIssue } from './validate.js';
export { extractContent } from './content.js';
export type {
  ContentObservation, ContentSection, Grounded, ContentSource,
  Selector, Provenance, QuarantinedContent,
} from './content.js';
export { toWebMCPTools, registerWebMCPTools } from './webmcp.js';
export type {
  WebMCPTool, ToolAnnotations, ToolBinding, JSONSchema, JSONSchemaProperty,
  ModelContextHost, RegisterOptions, Registration,
} from './webmcp.js';
export { operate } from './operate.js';
export type {
  AgentAction, PageState, OperateOptions, EpisodeResult, StepRecord,
} from './operate.js';
export { toOpenAITools, toAnthropicTools, toMCPTools, executeTool } from './adapters.js';
export type {
  OpenAITool, AnthropicTool, MCPTool, ExecuteToolOptions, ToolResult,
} from './adapters.js';
export { observe } from './observe.js';
export type { AgentMutation, MutationCallback } from './observe.js';

// Class API
export { AgentDOM } from './agent-dom.js';
