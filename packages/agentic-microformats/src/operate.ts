/**
 * operate() — the agent episode runtime (0.6.0).
 *
 * The consumer's product is not "parse the annotations", it is "drive my agent
 * through a task on a real, authenticated, changing site and recover when it
 * goes wrong." That loop lived only in the benchmark harness; this promotes it
 * to a supported, **model-agnostic and environment-agnostic** export.
 *
 * The library owns the mechanics — observe (graph + content + tools) →
 * safety-gate (fail-closed confirmation, same-origin) → execute → re-observe →
 * loop with history. The consumer injects the parts only they can own:
 *
 *   decide     the LLM/policy that picks the next action (any model)
 *   fetchPage  transport for GET-a-page — CARRIES THE USER'S SESSION (auth)
 *   sendRequest transport for API calls — also carries the session (http mode)
 *   parse      HTML → DOM (linkedom server-side, or `document` in a browser)
 *   onConfirm  human-in-the-loop for confirmation-required actions
 *
 * This is what makes the same runtime work for a server-side agent (http mode,
 * explicit session) and a browser agent (browser mode, DOM control), and puts
 * authentication where it belongs — in the consumer's transport.
 */

import type { AgentElement } from './dom.js';
import type { ExtractionResult, PreparedAction } from './types.js';
import { AgentDOM } from './agent-dom.js';
import { toGraph } from './serialize.js';
import { extractContent, type ContentObservation } from './content.js';
import { toWebMCPTools, type WebMCPTool } from './webmcp.js';
import { executePrepared } from './runtime.js';
import { classifyNetworkError, type AgentError } from './errors.js';
import { interpretExecution } from './adapters.js';

/** One decision the agent can make each turn. */
export type AgentAction =
  | { type: 'navigate'; url: string }
  | { type: 'invoke'; tool: string; target?: string; args?: Record<string, unknown> }
  | { type: 'answer'; text: string };

export interface StepRecord {
  n: number;
  url: string;
  action: AgentAction;
  /** Execution outcome (transport response) for a successful step. */
  result?: unknown;
  /** Set when a safety gate stopped the action (blocked / unconfirmed). */
  refused?: string;
  /** Human-readable note for loop-level problems (bad action, decide failure). */
  error?: string;
  /** Typed execution failure (http error / network) — program against this. */
  errorInfo?: AgentError;
}

/** What the consumer's `decide` sees each turn. Feed to your model as you like. */
export interface PageState {
  url: string;
  graph: ReturnType<typeof toGraph>;
  tools: WebMCPTool[];
  content: ContentObservation;
  history: StepRecord[];
  stepsLeft: number;
  task: string;
}

export interface OperateOptions {
  task: string;
  /** Starting page URL/path passed to `fetchPage`. */
  start: string;
  /** The brain: given the current state, return the next action. Any model. */
  decide: (state: PageState) => AgentAction | Promise<AgentAction>;
  /** GET a page and return its HTML. Implement with YOUR session/cookies. */
  fetchPage: (url: string) => Promise<{ html: string; url?: string }>;
  /** Parse HTML into a DOM root (e.g. linkedom's documentElement). */
  parse: (html: string) => AgentElement;
  /**
   * Execute an API request for an `invoke` in http mode. Implement with your
   * session/cookies. Omit to use the same-origin global `fetch` fallback.
   */
  sendRequest?: (req: {
    method: string; url: string; headers: Record<string, string>; body: Record<string, unknown>;
  }) => Promise<{ status: number; body: unknown }>;
  /**
   * 'http' (default): invoke calls the declared endpoint via `sendRequest`.
   * 'browser': invoke drives the live DOM control (`form.requestSubmit()`).
   */
  mode?: 'http' | 'browser';
  /** Approve a confirmation-required action. Omit → such actions are refused. */
  onConfirm?: (info: { tool: string; prepared: PreparedAction }) => boolean | Promise<boolean>;
  /** Same-origin base for the endpoint policy (spec §12.5). */
  origin?: string;
  maxSteps?: number;
}

export interface EpisodeResult {
  answer: string | null;
  steps: StepRecord[];
  stepsUsed: number;
  /** True if the loop stopped by hitting maxSteps rather than answering. */
  exhausted: boolean;
}

/**
 * Run an agent episode: observe → decide → (navigate | safety-gated invoke) →
 * re-observe, until the agent answers or `maxSteps` is reached.
 */
export async function operate(opts: OperateOptions): Promise<EpisodeResult> {
  const maxSteps = opts.maxSteps ?? 12;
  const steps: StepRecord[] = [];

  let page = await opts.fetchPage(opts.start);
  let url = page.url ?? opts.start;
  let root = opts.parse(page.html);
  let answer: string | null = null;

  for (let n = 1; n <= maxSteps; n++) {
    const dom = new AgentDOM(root);
    const result: ExtractionResult = dom.extract();
    const state: PageState = {
      url,
      graph: toGraph(result),
      tools: toWebMCPTools(result),
      content: extractContent(root),
      history: steps,
      stepsLeft: maxSteps - n + 1,
      task: opts.task,
    };

    let action: AgentAction;
    try {
      action = await opts.decide(state);
    } catch (e: any) {
      steps.push({ n, url, action: { type: 'answer', text: '' }, error: `decide failed: ${String(e?.message ?? e)}` });
      break;
    }

    if (action.type === 'answer') {
      answer = action.text;
      steps.push({ n, url, action });
      break;
    }

    if (action.type === 'navigate') {
      const step: StepRecord = { n, url, action };
      try {
        page = await opts.fetchPage(action.url);
        url = page.url ?? action.url;
        root = opts.parse(page.html);
      } catch (e: any) { step.error = `navigate failed: ${String(e?.message ?? e)}`; }
      steps.push(step);
      continue;
    }

    // invoke — resolve, safety-gate, execute
    const step: StepRecord = { n, url, action };
    const target = dom.getAction(action.tool, action.target);
    if (!target) {
      step.error = `no action named "${action.tool}"${action.target ? ` on "${action.target}"` : ''}`;
      steps.push(step);
      continue;
    }
    const prepared = dom.prepareAction(target, action.args, opts.origin ? { origin: opts.origin } : undefined);
    if (prepared.blocked) {
      step.refused = prepared.warnings.find((w) => /refused/i.test(w)) ?? 'blocked';
      steps.push(step);
      continue;
    }
    if (prepared.confirmationRequired) {
      const ok = opts.onConfirm ? await opts.onConfirm({ tool: action.tool, prepared }) : false;
      if (!ok) { step.refused = 'confirmation required and not granted'; steps.push(step); continue; }
    }
    try {
      const raw = await executePrepared(target, prepared, { mode: opts.mode, sendRequest: opts.sendRequest });
      const interpreted = interpretExecution(raw);
      if ('error' in interpreted) { step.errorInfo = interpreted.error; step.error = interpreted.error.message; }
      else step.result = interpreted.result;
    } catch (e) {
      step.errorInfo = classifyNetworkError(e);
      step.error = step.errorInfo.message;
    }
    steps.push(step);

    // Re-observe: the action likely changed server state.
    try {
      page = await opts.fetchPage(url);
      root = opts.parse(page.html);
    } catch { /* keep the previous root if re-fetch fails */ }
  }

  return { answer, steps, stepsUsed: steps.length, exhausted: answer === null && steps.length >= maxSteps };
}
