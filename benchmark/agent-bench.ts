#!/usr/bin/env ts-node
/**
 * agent-bench.ts (harness v2)
 *
 * Action-execution + multi-page benchmark against the live AgentShop demo.
 *
 * Unlike evaluator.ts (reading) and extract-pipeline.ts (structure QA), the
 * model here is a POLICY in an episode loop: each turn it sees the current
 * page (extracted data-agent graph by default, or raw HTML with --mode=html)
 * plus the action history, and emits exactly ONE JSON action:
 *
 *   {"type":"navigate","url":"/cart"}
 *   {"type":"http","method":"POST","url":"/api/cart/add","body":{...}}
 *   {"type":"answer","text":"..."}
 *
 * The harness executes the action against the demo server with a per-task
 * cookie jar (fresh session per task) and feeds the result back. Success is
 * judged by SERVER STATE (cart contents extracted from /cart via the
 * reference library, order creation) plus optional answer matching — not by
 * string-matching alone.
 *
 * Usage:
 *   ts-node benchmark/agent-bench.ts [--tasks=./benchmark/tasks-agent.json]
 *                                    [--mode=extraction|html]
 *                                    [--model=claude-sonnet-5]
 *                                    [--backend=claude|openai]           # openai = any OpenAI-compatible
 *                                    [--api-base=http://localhost:1234/v1]  #   server, e.g. LM Studio
 *                                    [--base-url=http://localhost:3000]  # else spawns demo server
 *                                    [--only=G01,G05]
 *
 * Output: benchmark/results/agent-run-<timestamp>.json + latest-agent.json
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync, spawn, ChildProcess } from "child_process";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require(path.join(__dirname, "..", "packages", "agentic-microformats", "dist", "index.js"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseHTML } = require("linkedom");

const HARNESS_VERSION = "2.0.0";
const DEFAULT_TASKS_FILE = path.join(__dirname, "tasks-agent.json");
const RESULTS_DIR = path.join(__dirname, "results");
const DEFAULT_MODEL = "claude-sonnet-5";
const DEMO_DIR = path.join(__dirname, "..", "demo");
const SPAWN_PORT = 3556;

const DISALLOWED_TOOLS =
  "Read,Glob,Grep,Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,TodoWrite";
const CLAUDE_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatchType = "contains" | "contains_ci" | "all_contained" | "all_contained_ci" | "exact";

interface Assertion {
  type: "cart_item" | "cart_item_absent" | "cart_count" | "cart_total"
      | "order_created" | "answer_contains_order_id" | "attempted" | "visited";
  name_contains?: string;
  quantity?: number;
  value?: number | string;
  method?: string;
  path_prefix?: string;
}

interface FaultSpec {
  /** Which agent-issued API calls to hit */
  method: string;
  path_prefix: string;
  /** How many matching calls to fault before behaving normally */
  times: number;
  /**
   * reject        — do NOT forward; return `status` with an error body
   * drop_response — forward (mutation applies!), discard the real response,
   *                 return 502 — the classic "did my write land?" dilemma
   * garble_body   — forward, but replace the response body with garbage (status 200)
   */
  kind: "reject" | "drop_response" | "garble_body";
  status?: number;
  message?: string;
}

interface AgentTask {
  id: string;
  start_url: string;
  task: string;
  max_steps: number;
  setup?: Array<{ method: string; url: string; body?: unknown }>;
  faults?: FaultSpec[];
  assertions: Assertion[];
  expected_answer?: string | string[];
  match_type?: MatchType;
}

interface CallStats {
  duration_ms?: number;
  output_tokens?: number;
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cost_usd?: number;
}

interface Step {
  n: number;
  page_url: string;
  action_raw: string;
  action?: any;
  result?: any;
  /** Harness-only marker: which fault fired on this step. NEVER shown to the model. */
  fault_injected?: string;
  error?: string;
  stats?: CallStats;
}

interface EpisodeResult {
  task_id: string;
  task: string;
  passed: boolean;
  failed_assertions: string[];
  answer: string | null;
  steps_used: number;
  parse_errors: number;
  cost_usd: number;
  output_tokens: number;
  duration_ms: number;
  steps: Step[];
}

// ---------------------------------------------------------------------------
// Matching (same as evaluator.ts)
// ---------------------------------------------------------------------------

function containsToken(response: string, expected: string): boolean {
  if (/^\d+$/.test(expected)) return new RegExp(`(^|\\D)${expected}(\\D|$)`).test(response);
  if (/^\d+\.\d+$/.test(expected)) {
    const esc = expected.replace(".", "\\.");
    return new RegExp(`(^|[^\\d.])${esc}(\\D|$)`).test(response);
  }
  return response.includes(expected);
}

function checkMatch(response: string, expected: string | string[], matchType: MatchType): boolean {
  if (Array.isArray(expected)) {
    const ci = matchType === "all_contained_ci";
    return expected.every((item) => {
      const r = ci ? response.toLowerCase() : response;
      const e = ci ? item.toLowerCase() : item;
      return containsToken(r, e);
    });
  }
  switch (matchType) {
    case "contains": return containsToken(response, expected);
    case "contains_ci": return containsToken(response.toLowerCase(), expected.toLowerCase());
    case "exact": return response.trim() === expected.trim();
    default: return containsToken(response, expected);
  }
}

// ---------------------------------------------------------------------------
// claude -p (isolated)
// ---------------------------------------------------------------------------

let SCRATCH_DIR: string | null = null;
function getScratchDir(): string {
  if (!SCRATCH_DIR) SCRATCH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "am-agent-"));
  return SCRATCH_DIR;
}

function runClaudeP(prompt: string, model: string): { response: string; stats?: CallStats; error?: string } {
  const argv = [
    "-p", "--model", model,
    "--disallowedTools", DISALLOWED_TOOLS,
    "--no-session-persistence",
    "--output-format", "json",
  ];
  try {
    const output = execFileSync("claude", argv, {
      input: prompt, timeout: CLAUDE_TIMEOUT_MS, encoding: "utf-8",
      cwd: getScratchDir(), maxBuffer: 32 * 1024 * 1024,
    });
    try {
      const parsed = JSON.parse(output);
      return {
        response: String(parsed.result ?? "").trim(),
        stats: {
          duration_ms: parsed.duration_ms,
          output_tokens: parsed.usage?.output_tokens,
          input_tokens: parsed.usage?.input_tokens,
          cache_creation_input_tokens: parsed.usage?.cache_creation_input_tokens,
          cost_usd: parsed.total_cost_usd,
        },
      };
    } catch {
      return { response: output.trim() };
    }
  } catch (e: any) {
    return { response: "", error: e?.stderr?.toString()?.trim() || String(e) };
  }
}

// OpenAI-compatible backend (e.g. LM Studio). Cost is $0 for local servers.
// First call may JIT-load the model — allow a generous timeout.
async function runOpenAI(
  prompt: string, model: string, apiBase: string
): Promise<{ response: string; stats?: CallStats; error?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        // Reasoning models spend completion budget on thinking before the
        // visible answer — a small cap starves the action entirely.
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      return { response: "", error: `${res.status}: ${(await res.text()).substring(0, 200)}` };
    }
    const data: any = await res.json();
    const msg = data.choices?.[0]?.message ?? {};
    // Prefer visible content; fall back to reasoning_content (some local
    // reasoning models emit the final JSON only there when truncated).
    const text = String(msg.content ?? "").trim() || String(msg.reasoning_content ?? "").trim();
    return {
      response: text,
      stats: {
        duration_ms: Date.now() - t0,
        input_tokens: data.usage?.prompt_tokens,
        output_tokens: data.usage?.completion_tokens,
        cost_usd: 0,
      },
    };
  } catch (e: any) {
    return { response: "", error: String(e?.message ?? e).substring(0, 200) };
  }
}

async function callModel(
  prompt: string, backend: string, model: string, apiBase: string
): Promise<{ response: string; stats?: CallStats; error?: string }> {
  if (backend === "openai") return runOpenAI(prompt, model, apiBase);
  return runClaudeP(prompt, model);
}

// ---------------------------------------------------------------------------
// Fault injection (per episode) — applies ONLY to agent-issued API calls,
// never to setup calls, page fetches, or assertion reads. Invisible to the
// model: it just sees realistic failure responses.
// ---------------------------------------------------------------------------

class FaultInjector {
  private remaining: Map<FaultSpec, number>;
  constructor(specs: FaultSpec[]) {
    this.remaining = new Map(specs.map((s) => [s, s.times]));
  }
  match(method: string, url: string): FaultSpec | null {
    for (const [spec, left] of this.remaining) {
      if (left > 0 &&
          spec.method.toUpperCase() === method.toUpperCase() &&
          url.startsWith(spec.path_prefix)) {
        this.remaining.set(spec, left - 1);
        return spec;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie jar + HTTP against the demo
// ---------------------------------------------------------------------------

class CookieJar {
  private cookies = new Map<string, string>();
  absorb(res: Response) {
    const setCookies: string[] = (res.headers as any).getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function httpCall(
  baseUrl: string, jar: CookieJar,
  method: string, url: string, body?: unknown
): Promise<{ status: number; body: any }> {
  const full = new URL(url, baseUrl);
  if (!full.href.startsWith(baseUrl)) {
    return { status: 0, body: { error: `Refused: URL outside the site (${url})` } };
  }
  // Connection: close — the model call between requests outlives the server's
  // keep-alive window; a pooled stale socket yields spurious ECONNRESET.
  const headers: Record<string, string> = { "Connection": "close" };
  const cookie = jar.header();
  if (cookie) headers["Cookie"] = cookie;
  const init: RequestInit = { method: method.toUpperCase(), headers, redirect: "manual" };
  if (body !== undefined && !["GET", "HEAD"].includes(method.toUpperCase())) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(full.href, init);
    jar.absorb(res);
    const text = await res.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { parsed = text.substring(0, 600); }
    return { status: res.status, body: parsed };
  } catch (e: any) {
    // Report transport failures to the model instead of aborting the episode
    return { status: 0, body: { error: `${method} ${full.href} failed: ${e?.message} (${e?.cause?.code ?? "?"})` } };
  }
}

async function fetchPage(baseUrl: string, jar: CookieJar, url: string): Promise<{ status: number; html: string; finalUrl: string }> {
  const full = new URL(url, baseUrl);
  const headers: Record<string, string> = { "Connection": "close" };
  const cookie = jar.header();
  if (cookie) headers["Cookie"] = cookie;
  try {
    const res = await fetch(full.href, { headers, redirect: "follow" });
    jar.absorb(res);
    const html = await res.text();
    const finalUrl = res.url ? new URL(res.url).pathname : full.pathname;
    return { status: res.status, html, finalUrl };
  } catch (e: any) {
    throw new Error(`fetchPage ${full.href} failed: ${e?.message} (cause: ${e?.cause?.code ?? e?.cause?.message ?? "?"})`);
  }
}

// ---------------------------------------------------------------------------
// Page representation (extraction via the reference library, or raw HTML)
// ---------------------------------------------------------------------------

function representPage(html: string, mode: string): string {
  if (mode === "html") return "```html\n" + html + "\n```";
  // Canonical serialization (spec/graph-serialization.md) — identical to
  // what the demo serves under Accept: application/agent+json.
  const { document } = parseHTML(html);
  return lib.toGraphJSON(lib.extractAll(document.documentElement));
}

// ---------------------------------------------------------------------------
// Prompt + action parsing
// ---------------------------------------------------------------------------

function buildPrompt(task: AgentTask, mode: string, pageUrl: string, pageRepr: string, history: Step[], stepsLeft: number, strict = false): string {
  const historyText = history.length === 0 ? "(none yet)" : history.map((s) => {
    if (s.error) return `step ${s.n}: INVALID ACTION (${s.error}) — raw output was: ${s.action_raw.substring(0, 200)}`;
    if (s.action?.type === "navigate") return `step ${s.n}: navigate ${s.action.url} → now on that page`;
    if (s.action?.type === "http") return `step ${s.n}: ${s.action.method} ${s.action.url} body=${JSON.stringify(s.action.body ?? null)} → status ${s.result?.status}, response: ${JSON.stringify(s.result?.body).substring(0, 400)}`;
    return `step ${s.n}: ${s.action_raw.substring(0, 200)}`;
  }).join("\n");

  const pageLabel = mode === "html"
    ? "CURRENT PAGE HTML"
    : "CURRENT PAGE — structured data extracted from its data-agent-* annotations (the HTML is not shown)";

  return `You are an AI agent operating an e-commerce website (AgentShop) through its Agentic Microformats annotations.
You act by emitting EXACTLY ONE action per turn, as a single JSON object with no other text, no markdown fences.

Available actions:
  {"type":"navigate","url":"<relative path>"}                          — load a page and see its content next turn
  {"type":"http","method":"<GET|POST|PATCH|DELETE>","url":"<path>","body":{...}}  — call an API endpoint; you see the response next turn
  {"type":"answer","text":"<final answer>"}                            — finish the task and report

Rules:
- Use the endpoints, methods, and parameter names exactly as the page's annotations declare them.
- Respect declared parameter constraints (min/max, required).
- Your session (cart, orders) persists across steps via cookies handled by the harness.
- You have ${stepsLeft} step(s) left, including the final answer. Be economical.
- When the task is done, emit the "answer" action with any requested values.

TASK: ${task.task}

CURRENT URL: ${pageUrl}

${pageLabel}:
${pageRepr}

ACTION HISTORY:
${historyText}

${strict ? `Example of a valid action (format only — use values from THIS page):
{"type":"http","method":"POST","url":"/api/cart/add","body":{"product_id":"SKU-EXAMPLE","quantity":1}}

Remember: output ONLY the single JSON action object. No explanation, no markdown fences, no text before or after it.

` : ""}Your next action (one JSON object, nothing else):`;
}

function parseAction(raw: string): { action?: any; error?: string } {
  let text = raw.trim().replace(/^```(json)?\n?/, "").replace(/\n?```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { error: "no JSON object found" };
  try {
    const action = JSON.parse(text.slice(start, end + 1));
    if (!["navigate", "http", "answer"].includes(action.type)) return { error: `unknown action type "${action.type}"` };
    if (action.type === "navigate" && typeof action.url !== "string") return { error: "navigate requires url" };
    if (action.type === "http" && (typeof action.url !== "string" || typeof action.method !== "string")) return { error: "http requires method and url" };
    if (action.type === "answer" && typeof action.text !== "string") return { error: "answer requires text" };
    return { action };
  } catch (e) {
    return { error: `JSON parse failed: ${String(e).substring(0, 80)}` };
  }
}

// ---------------------------------------------------------------------------
// State assertions
// ---------------------------------------------------------------------------

interface CartState {
  items: Array<{ name: string; quantity: number; lineTotal: unknown }>;
  total: unknown;
  count: number;
}

async function readCartState(baseUrl: string, jar: CookieJar): Promise<CartState> {
  const { html } = await fetchPage(baseUrl, jar, "/cart");
  const { document } = parseHTML(html);
  const result = lib.extractAll(document.documentElement);
  const items: CartState["items"] = [];
  let total: unknown = null;
  const walk = (rs: any[]) => {
    for (const r of rs) {
      if (r.type === "cart-item") {
        items.push({
          name: String(r.properties?.name?.value ?? ""),
          quantity: Number(r.properties?.quantity?.value ?? NaN),
          lineTotal: r.properties?.line_total?.value ?? null,
        });
      }
      if (r.type === "cart-summary") total = r.properties?.total?.value ?? null;
      walk(r.children ?? []);
    }
  };
  walk(result.resources);
  return { items, total, count: items.reduce((s, i) => s + (Number.isFinite(i.quantity) ? i.quantity : 0), 0) };
}

function findOrderId(steps: Step[]): string | null {
  for (const s of steps) {
    if (s.action?.type === "http" && /\/api\/checkout/.test(s.action.url) && s.result?.body?.success && s.result.body.orderId) {
      return String(s.result.body.orderId);
    }
  }
  return null;
}

async function runAssertions(
  task: AgentTask, baseUrl: string, jar: CookieJar, steps: Step[], answer: string | null
): Promise<string[]> {
  const failures: string[] = [];
  const needsCart = task.assertions.some((a) => a.type.startsWith("cart_"));
  const cart = needsCart ? await readCartState(baseUrl, jar) : null;
  const orderId = findOrderId(steps);

  for (const a of task.assertions) {
    switch (a.type) {
      case "cart_item": {
        const hit = cart!.items.find((i) => i.name.includes(a.name_contains!));
        if (!hit) failures.push(`cart_item: no item matching "${a.name_contains}" (cart: ${JSON.stringify(cart!.items)})`);
        else if (a.quantity !== undefined && hit.quantity !== a.quantity)
          failures.push(`cart_item: "${a.name_contains}" quantity ${hit.quantity} ≠ ${a.quantity}`);
        break;
      }
      case "cart_item_absent":
        if (cart!.items.some((i) => i.name.includes(a.name_contains!)))
          failures.push(`cart_item_absent: "${a.name_contains}" still in cart`);
        break;
      case "cart_count":
        if (cart!.count !== a.value) failures.push(`cart_count: ${cart!.count} ≠ ${a.value}`);
        break;
      case "cart_total":
        if (String(cart!.total) !== String(a.value)) failures.push(`cart_total: ${cart!.total} ≠ ${a.value}`);
        break;
      case "order_created":
        if (!orderId) failures.push("order_created: no successful /api/checkout with orderId in history");
        break;
      case "answer_contains_order_id":
        if (!orderId) failures.push("answer_contains_order_id: no order was created");
        else if (!answer || !answer.includes(orderId)) failures.push(`answer_contains_order_id: answer does not contain ${orderId}`);
        break;
      case "attempted":
        if (!steps.some((s) => s.action?.type === "http" &&
            s.action.method?.toUpperCase() === a.method &&
            String(s.action.url).startsWith(a.path_prefix!)))
          failures.push(`attempted: no ${a.method} ${a.path_prefix} in history`);
        break;
      case "visited":
        if (!steps.some((s) =>
            (s.action?.type === "navigate" && String(s.action.url).startsWith(a.path_prefix!)) ||
            (s.page_url && s.page_url.startsWith(a.path_prefix!))))
          failures.push(`visited: never navigated to ${a.path_prefix}`);
        break;
    }
  }

  if (task.expected_answer !== undefined) {
    if (answer === null) failures.push("expected_answer: episode ended without an answer");
    else if (!checkMatch(answer, task.expected_answer, task.match_type ?? "contains"))
      failures.push(`expected_answer: ${JSON.stringify(task.expected_answer)} not matched by "${answer.substring(0, 120)}"`);
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Episode loop
// ---------------------------------------------------------------------------

async function runEpisode(
  task: AgentTask, baseUrl: string, mode: string, model: string,
  backend = "claude", apiBase = "http://localhost:1234/v1"
): Promise<EpisodeResult> {
  const jar = new CookieJar();
  const t0 = Date.now();
  const injector = task.faults?.length ? new FaultInjector(task.faults) : null;
  const strictPrompt = backend === "openai"; // down-tier prompt adaptation for local models

  // Establish the session + run setup with the SAME jar
  await fetchPage(baseUrl, jar, "/");
  for (const s of task.setup ?? []) {
    const r = await httpCall(baseUrl, jar, s.method, s.url, s.body);
    if (r.status >= 400) throw new Error(`setup failed: ${s.method} ${s.url} → ${r.status}`);
  }

  const steps: Step[] = [];
  let pageUrl = task.start_url;
  let page = await fetchPage(baseUrl, jar, pageUrl);
  pageUrl = page.finalUrl;
  let answer: string | null = null;
  let parseErrors = 0;

  for (let n = 1; n <= task.max_steps; n++) {
    const prompt = buildPrompt(task, mode, pageUrl, representPage(page.html, mode), steps, task.max_steps - n + 1, strictPrompt);
    const { response, stats, error } = await callModel(prompt, backend, model, apiBase);
    const step: Step = { n, page_url: pageUrl, action_raw: response, stats };

    if (error) {
      step.error = `claude call failed: ${error.substring(0, 120)}`;
      steps.push(step);
      break;
    }

    const { action, error: parseError } = parseAction(response);
    if (parseError) {
      step.error = parseError;
      parseErrors++;
      steps.push(step);
      continue; // feed the error back next turn
    }
    step.action = action;

    if (action.type === "answer") {
      answer = action.text;
      steps.push(step);
      break;
    }
    if (action.type === "navigate") {
      page = await fetchPage(baseUrl, jar, action.url);
      pageUrl = page.finalUrl;
      steps.push(step);
      continue;
    }
    // http — possibly faulted
    const fault = injector?.match(action.method, action.url) ?? null;
    if (!fault) {
      step.result = await httpCall(baseUrl, jar, action.method, action.url, action.body);
    } else {
      step.fault_injected = fault.kind;
      if (fault.kind === "reject") {
        step.result = {
          status: fault.status ?? 503,
          body: { success: false, message: fault.message ?? "Service temporarily unavailable. Please try again." },
        };
      } else if (fault.kind === "drop_response") {
        await httpCall(baseUrl, jar, action.method, action.url, action.body); // mutation lands
        step.result = { status: 502, body: "502 Bad Gateway" };
      } else { // garble_body
        await httpCall(baseUrl, jar, action.method, action.url, action.body); // mutation lands
        step.result = { status: 200, body: "<!DOCTYPE html><html><head><title>Ap" };
      }
    }
    steps.push(step);
    // Keep the current page representation fresh after mutations
    page = await fetchPage(baseUrl, jar, pageUrl);
  }

  const failed = await runAssertions(task, baseUrl, jar, steps, answer);
  const cost = steps.reduce((s, st) => s + (st.stats?.cost_usd ?? 0), 0);
  const outTok = steps.reduce((s, st) => s + (st.stats?.output_tokens ?? 0), 0);

  return {
    task_id: task.id, task: task.task,
    passed: failed.length === 0,
    failed_assertions: failed,
    answer,
    steps_used: steps.length,
    parse_errors: parseErrors,
    cost_usd: Number(cost.toFixed(4)),
    output_tokens: outTok,
    duration_ms: Date.now() - t0,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Demo server management
// ---------------------------------------------------------------------------

async function waitForServer(baseUrl: string, timeoutMs = 15000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(baseUrl, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const tasksFile = args.find((a) => a.startsWith("--tasks="))?.split("=")[1] ?? DEFAULT_TASKS_FILE;
  const mode = args.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? "extraction";
  const model = args.find((a) => a.startsWith("--model="))?.split("=")[1] ?? DEFAULT_MODEL;
  const baseUrlArg = args.find((a) => a.startsWith("--base-url="))?.split("=")[1];
  const only = args.find((a) => a.startsWith("--only="))?.split("=")[1]?.split(",");
  const port = Number(args.find((a) => a.startsWith("--port="))?.split("=")[1] ?? SPAWN_PORT);
  const backend = args.find((a) => a.startsWith("--backend="))?.split("=")[1] ?? "claude";
  const apiBase = args.find((a) => a.startsWith("--api-base="))?.split("=")[1] ?? "http://localhost:1234/v1";

  let tasks: AgentTask[] = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
  if (only) tasks = tasks.filter((t) => only.includes(t.id));
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  // Server: use --base-url if given, else spawn the demo
  let server: ChildProcess | null = null;
  let baseUrl = baseUrlArg ?? `http://localhost:${port}`;
  if (!baseUrlArg) {
    server = spawn("node", ["server.js"], {
      cwd: DEMO_DIR,
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
    });
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Agent Benchmark — action execution + multi-page (harness v${HARNESS_VERSION})`);
  console.log(`Mode      : ${mode} ${mode === "extraction" ? "(model sees extracted data-agent graph only)" : "(model sees raw HTML)"}`);
  console.log(`Model     : ${model} (backend: ${backend}${backend === "openai" ? ` @ ${apiBase}` : ""})`);
  console.log(`Server    : ${baseUrl}${server ? " (spawned)" : ""}`);
  console.log(`Tasks     : ${tasks.length}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    if (!(await waitForServer(baseUrl))) {
      console.error(`Demo server not reachable at ${baseUrl}`);
      process.exit(1);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const episodes: EpisodeResult[] = [];
    const outFileIncremental = path.join(RESULTS_DIR, `agent-run-${timestamp}.json`);
    const persist = () => {
      const partial = {
        timestamp, harness_version: HARNESS_VERSION, arm: "agent-bench",
        mode, model, tasks_file: tasksFile,
        total_tasks: tasks.length,
        tasks_passed: episodes.filter((e) => e.passed).length,
        episodes,
      };
      fs.writeFileSync(outFileIncremental, JSON.stringify(partial, null, 2));
    };

    for (const task of tasks) {
      process.stdout.write(`[${task.id}] ${task.task.substring(0, 60)}... `);
      try {
        const ep = await runEpisode(task, baseUrl, mode, model, backend, apiBase);
        episodes.push(ep);
        console.log(`${ep.passed ? "PASS" : "FAIL"} (${ep.steps_used} steps, $${ep.cost_usd.toFixed(2)})`);
        if (!ep.passed) for (const f of ep.failed_assertions) console.log(`   ✗ ${f}`);
      } catch (e: any) {
        episodes.push({
          task_id: task.id, task: task.task, passed: false,
          failed_assertions: [`episode error: ${String(e?.message ?? e).substring(0, 200)}`],
          answer: null, steps_used: 0, parse_errors: 0,
          cost_usd: 0, output_tokens: 0, duration_ms: 0, steps: [],
        });
        console.log(`ERROR: ${String(e?.message ?? e).substring(0, 100)}`);
      }
      persist(); // survive harness/tool timeouts with partial results on disk
    }

    const passed = episodes.filter((e) => e.passed).length;
    const totalCost = episodes.reduce((s, e) => s + e.cost_usd, 0);
    const totalSteps = episodes.reduce((s, e) => s + e.steps_used, 0);
    const runResult = {
      timestamp, harness_version: HARNESS_VERSION, arm: "agent-bench",
      mode, model, backend, tasks_file: tasksFile,
      total_tasks: tasks.length, tasks_passed: passed,
      score: passed / tasks.length,
      total_steps: totalSteps,
      total_cost_usd: Number(totalCost.toFixed(4)),
      episodes,
    };

    const outFile = path.join(RESULTS_DIR, `agent-run-${timestamp}.json`);
    fs.writeFileSync(outFile, JSON.stringify(runResult, null, 2));
    fs.writeFileSync(path.join(RESULTS_DIR, "latest-agent.json"), JSON.stringify(runResult, null, 2));

    console.log(`\n${"=".repeat(60)}`);
    console.log(`AGENT BENCH (${mode}) : ${passed}/${tasks.length} (${((passed / tasks.length) * 100).toFixed(1)}%)`);
    console.log(`Steps used : ${totalSteps} across ${tasks.length} episodes | total cost $${totalCost.toFixed(2)}`);
    console.log(`Results    : ${outFile}`);
    console.log(`${"=".repeat(60)}\n`);
  } finally {
    if (server) server.kill();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
