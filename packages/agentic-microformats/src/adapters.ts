/**
 * Tool-format adapters (0.7.0).
 *
 * `toWebMCPTools` normalizes actions once; these re-shape that into the tool
 * formats consumers' SDKs already speak — OpenAI function tools, Anthropic
 * tools, and MCP tools — so a non-WebMCP agent gets first-class tools without
 * writing the conversion. Plus `executeTool`, which runs a model's tool call
 * through the same fail-closed safety gates as `operate()`.
 *
 * MCP is the closest fit (it has native tool annotations, so the safety hints
 * survive as structured data). OpenAI/Anthropic have no annotation slot, so the
 * hints are folded into the description where the model will actually read them.
 */

import type { AgentDOM } from './agent-dom.js';
import type { ExtractionResult } from './types.js';
import { toWebMCPTools, type WebMCPTool, type ToolAnnotations, type JSONSchema } from './webmcp.js';
import { executePrepared, type ExecuteEnv } from './runtime.js';

function hintSuffix(a: ToolAnnotations): string {
  const parts: string[] = [];
  if (a.destructiveHint) parts.push('destructive');
  else if (a.readOnlyHint) parts.push('read-only');
  if (a.idempotentHint === false) parts.push('not idempotent (avoid blind retry)');
  if (a.humanConfirmationHint) parts.push('requires human confirmation');
  if (a.costHint) parts.push(`costs ${a.costHint.amount}${a.costHint.currency ? ' ' + a.costHint.currency : ''}`);
  return parts.length ? ` [${parts.join('; ')}]` : '';
}

function describe(t: WebMCPTool): string {
  // Collapse whitespace — a description resolved from control text can be
  // multiline; tool descriptions go straight to the model, so keep them tidy.
  const base = (t.description ?? t.name).replace(/\s+/g, ' ').trim() || t.name;
  return `${base}${hintSuffix(t.annotations)}`;
}

// --- OpenAI (Chat Completions / Responses `tools`) --------------------------

export interface OpenAITool {
  type: 'function';
  function: { name: string; description: string; parameters: JSONSchema };
}

export function toOpenAITools(result: ExtractionResult): OpenAITool[] {
  return toWebMCPTools(result).map((t) => ({
    type: 'function',
    function: { name: t.name, description: describe(t), parameters: t.inputSchema },
  }));
}

// --- Anthropic (Messages `tools`) -------------------------------------------

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

export function toAnthropicTools(result: ExtractionResult): AnthropicTool[] {
  return toWebMCPTools(result).map((t) => ({
    name: t.name,
    description: describe(t),
    input_schema: t.inputSchema,
  }));
}

// --- MCP (`tools/list`) — native annotations preserved ----------------------

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
  annotations: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    /** Non-standard extension: this action asks for human confirmation. */
    'x-humanConfirmationHint'?: boolean;
  };
}

export function toMCPTools(result: ExtractionResult): MCPTool[] {
  return toWebMCPTools(result).map((t) => {
    const ann: MCPTool['annotations'] = { title: t.name };
    if (t.annotations.readOnlyHint !== undefined) ann.readOnlyHint = t.annotations.readOnlyHint;
    if (t.annotations.destructiveHint !== undefined) ann.destructiveHint = t.annotations.destructiveHint;
    if (t.annotations.idempotentHint !== undefined) ann.idempotentHint = t.annotations.idempotentHint;
    if (t.annotations.humanConfirmationHint) ann['x-humanConfirmationHint'] = true;
    const out: MCPTool = { name: t.name, inputSchema: t.inputSchema, annotations: ann };
    if (t.description) out.description = t.description;
    return out;
  });
}

// --- Execute a model's tool call, safely ------------------------------------

export interface ExecuteToolOptions extends ExecuteEnv {
  origin?: string;
  /** Approve a confirmation-required call. Omit → such calls are refused. */
  onConfirm?: (info: { tool: string; prepared: import('./types.js').PreparedAction }) => boolean | Promise<boolean>;
  /** Resource id, when the same action name exists on multiple resources. */
  target?: string;
}

export interface ToolResult {
  ok: boolean;
  /** Set when refused by a safety gate (blocked / unconfirmed) rather than run. */
  refused?: string;
  result?: unknown;
  error?: string;
}

/**
 * Run a tool call (name + args) from a native function-calling loop through the
 * same fail-closed gates as `operate()`: cross-origin refusal, and human
 * confirmation for confirmation-required actions. Never sends a blocked or
 * unconfirmed request.
 */
export async function executeTool(
  dom: AgentDOM, name: string, args: Record<string, unknown> = {}, opts: ExecuteToolOptions = {}
): Promise<ToolResult> {
  const action = dom.getAction(name, opts.target);
  if (!action) return { ok: false, error: `no action named "${name}"` };
  const prepared = dom.prepareAction(action, args, opts.origin ? { origin: opts.origin } : undefined);
  if (prepared.blocked) return { ok: false, refused: prepared.warnings.find((w) => /refused/i.test(w)) ?? 'blocked' };
  if (prepared.confirmationRequired) {
    const okC = opts.onConfirm ? await opts.onConfirm({ tool: name, prepared }) : false;
    if (!okC) return { ok: false, refused: 'confirmation required and not granted' };
  }
  try {
    const result = await executePrepared(action, prepared, { mode: opts.mode, sendRequest: opts.sendRequest });
    return { ok: true, result };
  } catch (e: any) {
    return { ok: false, error: `execute failed: ${String(e?.message ?? e)}` };
  }
}
