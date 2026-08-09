#!/usr/bin/env ts-node
/**
 * extract-pipeline.ts (harness v2)
 *
 * The extraction-pipeline benchmark arm: instead of handing the model the full
 * HTML page, the reference library (packages/agentic-microformats) extracts
 * the data-agent-* graph DETERMINISTICALLY — zero LLM tokens — and the model
 * answers each task from that structured JSON alone. The original HTML is
 * never shown to the model.
 *
 * This measures what annotations actually enable architecturally: an agent
 * that does not read pages, only their machine-readable surface. Compare its
 * results/latency/tokens against evaluator.ts runs on the same tasks.
 *
 * Usage:
 *   ts-node benchmark/extract-pipeline.ts [--pages-dir=./benchmark/pages-v2-annotated]
 *                                         [--tasks=./benchmark/tasks-v2.json]
 *                                         [--model=claude-haiku-4-5-20251001]
 *                                         [--dry]        # extract only, no LLM calls
 *
 * Output:
 *   - benchmark/results/extract-run-<timestamp>.json
 *   - benchmark/results/latest-extract.json
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

// The reference library is an ESM package; Node >= 22.12 supports require(esm).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require(path.join(__dirname, "..", "packages", "agentic-microformats", "dist", "index.js"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseHTML } = require("linkedom");

const HARNESS_VERSION = "2.0.0";

const DEFAULT_PAGES_DIR = path.join(__dirname, "pages-v2-annotated");
const DEFAULT_TASKS_FILE = path.join(__dirname, "tasks-v2.json");
const RESULTS_DIR = path.join(__dirname, "results");

// The answering model reads structure, not prose — default to the small tier.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const DISALLOWED_TOOLS =
  "Read,Glob,Grep,Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,TodoWrite";
const CLAUDE_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Types (matching evaluator.ts result shapes where they overlap)
// ---------------------------------------------------------------------------

type MatchType = "contains" | "contains_ci" | "all_contained" | "all_contained_ci" | "exact";

interface Task {
  id: string;
  page: string;
  page_type: string;
  task: string;
  expected: string | string[];
  match_type: MatchType;
  category: string;
}

interface CallStats {
  duration_ms?: number;
  duration_api_ms?: number;
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
}

interface ExtractionInfo {
  html_bytes: number;
  extraction_bytes: number;
  extraction_ms: number;
  resources: number;
  actions: number;
}

interface TaskResult {
  task_id: string;
  page: string;
  category: string;
  task: string;
  expected: string | string[];
  llm_response: string;
  passed: boolean;
  stats?: CallStats;
  error?: string;
}

// ---------------------------------------------------------------------------
// Matching logic (identical to evaluator.ts)
// ---------------------------------------------------------------------------

function containsToken(response: string, expected: string): boolean {
  if (/^\d+$/.test(expected)) {
    return new RegExp(`(^|\\D)${expected}(\\D|$)`).test(response);
  }
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
// claude -p (isolated, identical to evaluator.ts)
// ---------------------------------------------------------------------------

let SCRATCH_DIR: string | null = null;
function getScratchDir(): string {
  if (!SCRATCH_DIR) SCRATCH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "am-extract-"));
  return SCRATCH_DIR;
}

function runClaudeP(prompt: string, model: string): { response: string; stats?: CallStats; error?: string } {
  const argv = [
    "-p",
    "--model", model,
    "--disallowedTools", DISALLOWED_TOOLS,
    "--no-session-persistence",
    "--output-format", "json",
  ];
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const output = execFileSync("claude", argv, {
        input: prompt,
        timeout: CLAUDE_TIMEOUT_MS,
        encoding: "utf-8",
        cwd: getScratchDir(),
        maxBuffer: 32 * 1024 * 1024,
      });
      try {
        const parsed = JSON.parse(output);
        return {
          response: String(parsed.result ?? "").trim(),
          stats: {
            duration_ms: parsed.duration_ms,
            duration_api_ms: parsed.duration_api_ms,
            input_tokens: parsed.usage?.input_tokens,
            cache_creation_input_tokens: parsed.usage?.cache_creation_input_tokens,
            cache_read_input_tokens: parsed.usage?.cache_read_input_tokens,
            output_tokens: parsed.usage?.output_tokens,
            cost_usd: parsed.total_cost_usd,
          },
        };
      } catch {
        return { response: output.trim() };
      }
    } catch (e: any) {
      lastError = e?.stderr?.toString()?.trim() || String(e);
    }
  }
  return { response: "", error: lastError };
}

// ---------------------------------------------------------------------------
// Deterministic extraction + JSON-safe serialization (drops DOM references)
// ---------------------------------------------------------------------------

function serializeAction(a: any): any {
  return {
    name: a.name || undefined,
    method: a.method,
    endpoint: a.endpoint,
    target: a.target,
    description: a.description,
    onSuccess: a.onSuccess,
    response: a.response,
    hints: {
      role: a.hints?.role,
      risk: a.hints?.risk,
      humanPreferred: a.hints?.humanPreferred || undefined,
      reversible: a.hints?.reversible,
      cost: a.hints?.cost,
      costCurrency: a.hints?.costCurrency,
    },
    params: (a.params ?? []).map((p: any) => ({
      name: p.name,
      typehint: p.typehint,
      required: p.required || undefined,
      value: p.value ?? undefined,
      min: p.min,
      max: p.max,
    })),
  };
}

function serializeResource(r: any): any {
  const properties: Record<string, any> = {};
  for (const [name, p] of Object.entries<any>(r.properties ?? {})) {
    properties[name] = {
      value: p.value,
      raw: p.rawValue,
      typehint: p.typehint === "string" ? undefined : p.typehint,
      currency: p.currency,
    };
  }
  return {
    type: r.type || undefined,
    id: r.id || undefined,
    properties,
    actions: (r.actions ?? []).map(serializeAction),
    children: (r.children ?? []).map(serializeResource),
  };
}

function extractPage(html: string): { json: string; info: ExtractionInfo } {
  const t0 = Date.now();
  const { document } = parseHTML(html);
  const root = document.documentElement;
  const result = lib.extractAll(root);

  const countResources = (rs: any[]): number =>
    rs.reduce((n, r) => n + 1 + countResources(r.children ?? []), 0);
  const countActions = (rs: any[]): number =>
    rs.reduce((n, r) => n + (r.actions?.length ?? 0) + countActions(r.children ?? []), 0);

  const payload = {
    meta: result.meta,
    resources: result.resources.map(serializeResource),
    standalone_actions: result.actions.map(serializeAction),
  };
  // Drop undefined values for compactness
  const json = JSON.stringify(payload, (_k, v) => (v === undefined ? undefined : v));

  return {
    json,
    info: {
      html_bytes: Buffer.byteLength(html, "utf-8"),
      extraction_bytes: Buffer.byteLength(json, "utf-8"),
      extraction_ms: Date.now() - t0,
      resources: countResources(result.resources),
      actions: countActions(result.resources) + result.actions.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(extractionJson: string, task: Task): string {
  return `You are an AI agent operating a web page through its Agentic Microformats annotations.
Below is the COMPLETE structured data extracted from the page's data-agent-* attributes
by a deterministic parser. The original HTML is NOT available to you.
Answer the task based ONLY on this data.
Be concise and direct. Do not explain your reasoning — just give the answer.
For list tasks, return items separated by commas.
For URL tasks, return the URL exactly as it appears in the data.

EXTRACTED PAGE DATA (JSON):
${extractionJson}

TASK: ${task.task}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const pagesDir = args.find((a) => a.startsWith("--pages-dir="))?.split("=")[1] ?? DEFAULT_PAGES_DIR;
  const tasksFile = args.find((a) => a.startsWith("--tasks="))?.split("=")[1] ?? DEFAULT_TASKS_FILE;
  const model = args.find((a) => a.startsWith("--model="))?.split("=")[1] ?? DEFAULT_MODEL;
  const dry = args.includes("--dry");

  const tasks: Task[] = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Extraction-Pipeline Benchmark (harness v${HARNESS_VERSION})`);
  console.log(`Extractor : packages/agentic-microformats (deterministic, 0 tokens)`);
  console.log(`Model     : ${dry ? "(dry run — no LLM calls)" : model}`);
  console.log(`Pages dir : ${pagesDir}`);
  console.log(`Tasks     : ${tasks.length}`);
  console.log(`${"=".repeat(60)}\n`);

  // Extract each referenced page once
  const pages = [...new Set(tasks.map((t) => t.page))];
  const extractions = new Map<string, { json: string; info: ExtractionInfo }>();
  for (const page of pages) {
    const file = path.join(pagesDir, page);
    if (!fs.existsSync(file)) {
      console.log(`  ${page}: MISSING`);
      continue;
    }
    const html = fs.readFileSync(file, "utf-8");
    const ex = extractPage(html);
    extractions.set(page, ex);
    const ratio = ((ex.info.extraction_bytes / ex.info.html_bytes) * 100).toFixed(1);
    console.log(
      `  ${page}: ${(ex.info.html_bytes / 1024).toFixed(1)}KB HTML → ` +
      `${(ex.info.extraction_bytes / 1024).toFixed(1)}KB JSON (${ratio}%) in ${ex.info.extraction_ms}ms · ` +
      `${ex.info.resources} resources, ${ex.info.actions} actions`
    );
  }
  console.log();

  if (dry) {
    console.log("Dry run complete — no LLM calls made.\n");
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const results: TaskResult[] = [];
  let passed = 0;

  for (const task of tasks) {
    const ex = extractions.get(task.page);
    process.stdout.write(`[${task.id}] ${task.task.substring(0, 55)}... `);

    if (!ex) {
      results.push({
        task_id: task.id, page: task.page, category: task.category, task: task.task,
        expected: task.expected, llm_response: "", passed: false,
        error: `Page not found: ${task.page}`,
      });
      console.log("SKIP");
      continue;
    }

    const { response, stats, error } = runClaudeP(buildPrompt(ex.json, task), model);
    if (error) {
      results.push({
        task_id: task.id, page: task.page, category: task.category, task: task.task,
        expected: task.expected, llm_response: "", passed: false, error,
      });
      console.log(`ERROR: ${error.substring(0, 80)}`);
      continue;
    }

    const ok = checkMatch(response, task.expected, task.match_type);
    if (ok) passed++;
    results.push({
      task_id: task.id, page: task.page, category: task.category, task: task.task,
      expected: task.expected, llm_response: response.trim(), passed: ok, stats,
    });
    console.log(ok ? "PASS" : "FAIL");
    if (!ok) {
      console.log(`   Expected : ${JSON.stringify(task.expected)}`);
      console.log(`   Got      : ${response.trim().substring(0, 120)}`);
    }
  }

  const withStats = results.filter((r) => r.stats);
  const sum = (f: (s: CallStats) => number) => withStats.reduce((a, r) => a + f(r.stats!), 0);
  const n = withStats.length;
  const costSummary = {
    calls: n,
    mean_duration_ms: n ? Math.round(sum((s) => s.duration_ms ?? 0) / n) : 0,
    total_prompt_tokens: sum((s) => (s.input_tokens ?? 0) + (s.cache_creation_input_tokens ?? 0)),
    total_output_tokens: sum((s) => s.output_tokens ?? 0),
    total_cost_usd: Number(sum((s) => s.cost_usd ?? 0).toFixed(4)),
  };

  const runResult = {
    timestamp,
    harness_version: HARNESS_VERSION,
    arm: "extraction-pipeline",
    model,
    pages_dir: pagesDir,
    tasks_file: tasksFile,
    total_tasks: tasks.length,
    tasks_passed: passed,
    score: passed / tasks.length,
    extractions: Object.fromEntries([...extractions].map(([p, e]) => [p, e.info])),
    cost_summary: costSummary,
    results,
  };

  const outFile = path.join(RESULTS_DIR, `extract-run-${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(runResult, null, 2));
  fs.writeFileSync(path.join(RESULTS_DIR, "latest-extract.json"), JSON.stringify(runResult, null, 2));

  const totalHtml = [...extractions.values()].reduce((a, e) => a + e.info.html_bytes, 0);
  const totalJson = [...extractions.values()].reduce((a, e) => a + e.info.extraction_bytes, 0);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`EXTRACTION ARM : ${passed}/${tasks.length} (${((passed / tasks.length) * 100).toFixed(1)}%)`);
  console.log(`Structure size : ${(totalJson / 1024).toFixed(1)}KB JSON vs ${(totalHtml / 1024).toFixed(1)}KB HTML (${((totalJson / totalHtml) * 100).toFixed(1)}%)`);
  console.log(`Cost / latency : ~${(costSummary.mean_duration_ms / 1000).toFixed(1)}s/task | prompt ${costSummary.total_prompt_tokens} tok | output ${costSummary.total_output_tokens} tok | $${costSummary.total_cost_usd.toFixed(2)}`);
  console.log(`\nBy category:`);
  for (const cat of [...new Set(results.map((r) => r.category))]) {
    const cr = results.filter((r) => r.category === cat);
    console.log(`  ${cat.padEnd(25)} ${cr.filter((r) => r.passed).length}/${cr.length}`);
  }
  console.log(`\nResults written to: ${outFile}`);
  console.log(`${"=".repeat(60)}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
