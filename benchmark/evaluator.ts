#!/usr/bin/env ts-node
/**
 * evaluator.ts (harness v2)
 *
 * Runs the benchmark task suite against annotated HTML pages AND, by default,
 * against the unannotated baseline pages in the same run. The headline metric
 * is the annotation delta (annotated_passed − baseline_passed), because the
 * absolute score alone cannot show whether annotations add value.
 *
 * Uses `claude -p` (Claude Code print mode) — no API key needed,
 * runs on your Pro/Max subscription.
 *
 * Isolation: every claude -p call runs in an empty scratch directory with
 * file/shell/web tools disallowed and session persistence off. Harness v1
 * ran in the repo cwd, where the subprocess loaded CLAUDE.md (including the
 * benchmark's own instructions) and could read tasks.json — the answer key.
 * Both leaks were empirically confirmed on 2026-08-08.
 *
 * Usage:
 *   ts-node benchmark/evaluator.ts [--pages-dir=./benchmark/pages-annotated]
 *                                  [--baseline-dir=./benchmark/pages]
 *                                  [--tasks=./benchmark/tasks.json]
 *                                  [--model=claude-sonnet-5]
 *                                  [--no-baseline]
 *
 * Output:
 *   - Console: per-task results with pass/fail for annotated and baseline
 *   - benchmark/results/run-<timestamp>.json: full run log (includes model)
 *   - benchmark/results/latest.json: always points to latest run
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HARNESS_VERSION = "2.0.0";

const DEFAULT_PAGES_DIR = path.join(__dirname, "pages-annotated");
const DEFAULT_BASELINE_DIR = path.join(__dirname, "pages");
const DEFAULT_TASKS_FILE = path.join(__dirname, "tasks.json");
const RESULTS_DIR = path.join(__dirname, "results");

// Pinned by default so runs are comparable across days. Override via --model=.
const DEFAULT_MODEL = "claude-sonnet-5";

// Tools the evaluated subprocess must not have: nothing that reaches the
// filesystem, shell, or network. The task is answerable from the prompt alone.
const DISALLOWED_TOOLS =
  "Read,Glob,Grep,Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,TodoWrite";

// Timeout per claude -p call in ms
const CLAUDE_TIMEOUT_MS = 60_000;

// Retries per call on infra errors (timeout, non-zero exit) — retried once so
// transient failures aren't booked as capability failures.
const MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatchType =
  | "contains"
  | "contains_ci"
  | "all_contained"
  | "all_contained_ci"
  | "exact"
  | "numeric";

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

interface SideResult {
  llm_response: string;
  passed: boolean;
  page_bytes?: number;
  stats?: CallStats;
  error?: string;
}

interface TaskResult {
  task_id: string;
  page: string;
  page_type: string;
  category: string;
  task: string;
  expected: string | string[];
  annotated: SideResult;
  baseline?: SideResult;
}

interface SideCostSummary {
  calls: number;
  mean_duration_ms: number;
  mean_page_bytes: number;
  total_prompt_tokens: number; // input + cache_creation (page-driven)
  total_output_tokens: number;
  total_cost_usd: number;
}

interface RunResult {
  timestamp: string;
  harness_version: string;
  model: string;
  pages_dir: string;
  baseline_dir: string | null;
  tasks_file: string;
  total_tasks: number;
  tasks_passed: number; // annotated side
  baseline_passed: number | null;
  delta: number | null; // tasks_passed − baseline_passed
  score: number;
  cost_summary?: { annotated: SideCostSummary; baseline?: SideCostSummary };
  results: TaskResult[];
}

function summarizeCosts(sides: (SideResult | undefined)[]): SideCostSummary {
  const withStats = sides.filter((s): s is SideResult => !!s && !!s.stats);
  const n = withStats.length;
  const sum = (f: (s: SideResult) => number) =>
    withStats.reduce((acc, s) => acc + f(s), 0);
  return {
    calls: n,
    mean_duration_ms: n ? Math.round(sum((s) => s.stats!.duration_ms ?? 0) / n) : 0,
    mean_page_bytes: n ? Math.round(sum((s) => s.page_bytes ?? 0) / n) : 0,
    total_prompt_tokens: sum(
      (s) => (s.stats!.input_tokens ?? 0) + (s.stats!.cache_creation_input_tokens ?? 0)
    ),
    total_output_tokens: sum((s) => s.stats!.output_tokens ?? 0),
    total_cost_usd: Number(sum((s) => s.stats!.cost_usd ?? 0).toFixed(4)),
  };
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

function containsToken(response: string, expected: string): boolean {
  // Digit-only expectations match on word boundaries so that e.g. expected "5"
  // does not pass on a response of "15".
  if (/^\d+$/.test(expected)) {
    return new RegExp(`(^|\\D)${expected}(\\D|$)`).test(response);
  }
  // Decimal expectations ("4.99") must not match inside "14.99" or "0.4.99".
  if (/^\d+\.\d+$/.test(expected)) {
    const esc = expected.replace(".", "\\.");
    return new RegExp(`(^|[^\\d.])${esc}(\\D|$)`).test(response);
  }
  return response.includes(expected);
}

function checkMatch(
  response: string,
  expected: string | string[],
  matchType: MatchType
): boolean {
  if (Array.isArray(expected)) {
    // all_contained: every expected item must appear in response
    const ci = matchType === "all_contained_ci";
    return expected.every((item) => {
      const r = ci ? response.toLowerCase() : response;
      const e = ci ? item.toLowerCase() : item;
      return containsToken(r, e);
    });
  }

  switch (matchType) {
    case "contains":
      return containsToken(response, expected);
    case "contains_ci":
      return containsToken(response.toLowerCase(), expected.toLowerCase());
    case "exact":
      return response.trim() === expected.trim();
    case "numeric": {
      // Compare by value: "44.9", "44.90", "€44.90" all equal 44.90
      const want = parseFloat(expected);
      const m = response.replace(",", ".").match(/-?\d+(\.\d+)?/);
      return m !== null && Math.abs(parseFloat(m[0]) - want) < 1e-9;
    }
    default:
      return containsToken(response, expected);
  }
}

// ---------------------------------------------------------------------------
// claude -p call (isolated)
// ---------------------------------------------------------------------------

let SCRATCH_DIR: string | null = null;

function getScratchDir(): string {
  if (!SCRATCH_DIR) {
    SCRATCH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "am-bench-"));
  }
  return SCRATCH_DIR;
}

function runClaudeP(prompt: string, model: string): { response: string; stats?: CallStats; error?: string } {
  const scratch = getScratchDir();
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
      // execFileSync: no shell, prompt via stdin — nothing to inject, no tmp files.
      const output = execFileSync("claude", argv, {
        input: prompt,
        timeout: CLAUDE_TIMEOUT_MS,
        encoding: "utf-8",
        cwd: scratch, // empty dir: no CLAUDE.md, no repo files in reach
        maxBuffer: 32 * 1024 * 1024,
      });
      try {
        const parsed = JSON.parse(output);
        const stats: CallStats = {
          duration_ms: parsed.duration_ms,
          duration_api_ms: parsed.duration_api_ms,
          input_tokens: parsed.usage?.input_tokens,
          cache_creation_input_tokens: parsed.usage?.cache_creation_input_tokens,
          cache_read_input_tokens: parsed.usage?.cache_read_input_tokens,
          output_tokens: parsed.usage?.output_tokens,
          cost_usd: parsed.total_cost_usd,
        };
        return { response: String(parsed.result ?? "").trim(), stats };
      } catch {
        // JSON parse failed — fall back to treating output as plain text
        return { response: output.trim() };
      }
    } catch (e: any) {
      lastError = e?.stderr?.toString()?.trim() || String(e);
    }
  }
  return { response: "", error: lastError };
}

function buildEvalPrompt(htmlContent: string, task: Task): string {
  return `You are an AI agent operating a web page using semantic annotations.
The HTML may contain data-agent-* attributes annotating resources, actions, and properties.
Answer the task question based ONLY on what is present in the HTML.
Be concise and direct. Do not explain your reasoning — just give the answer.
For list tasks, return items separated by commas.
For URL tasks, return the URL exactly as it appears in the HTML.

HTML PAGE:
\`\`\`html
${htmlContent}
\`\`\`

TASK: ${task.task}`;
}

// ---------------------------------------------------------------------------
// Per-side evaluation
// ---------------------------------------------------------------------------

function evaluateSide(
  pagesDir: string,
  task: Task,
  model: string
): SideResult {
  const pageFile = path.join(pagesDir, task.page);

  if (!fs.existsSync(pageFile)) {
    return { llm_response: "", passed: false, error: `Page file not found: ${pageFile}` };
  }

  const html = fs.readFileSync(pageFile, "utf-8");
  const { response, stats, error } = runClaudeP(buildEvalPrompt(html, task), model);

  if (error) {
    return { llm_response: "", passed: false, error };
  }

  return {
    llm_response: response.trim(),
    passed: checkMatch(response, task.expected, task.match_type),
    page_bytes: Buffer.byteLength(html, "utf-8"),
    stats,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const pagesDir =
    args.find((a) => a.startsWith("--pages-dir="))?.split("=")[1] ??
    DEFAULT_PAGES_DIR;
  const baselineDirArg =
    args.find((a) => a.startsWith("--baseline-dir="))?.split("=")[1] ??
    DEFAULT_BASELINE_DIR;
  const tasksFile =
    args.find((a) => a.startsWith("--tasks="))?.split("=")[1] ??
    DEFAULT_TASKS_FILE;
  const model =
    args.find((a) => a.startsWith("--model="))?.split("=")[1] ?? DEFAULT_MODEL;
  const noBaseline =
    args.includes("--no-baseline") ||
    path.resolve(baselineDirArg) === path.resolve(pagesDir);
  const baselineDir = noBaseline ? null : baselineDirArg;

  if (!fs.existsSync(tasksFile)) {
    console.error(`Tasks file not found: ${tasksFile}`);
    process.exit(1);
  }

  const tasks: Task[] = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const results: TaskResult[] = [];
  let annotatedPassed = 0;
  let baselinePassed = 0;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Agentic-Microformats Benchmark Evaluator (harness v${HARNESS_VERSION})`);
  console.log(`Backend   : claude -p (subscription), isolated cwd, tools disallowed`);
  console.log(`Model     : ${model}`);
  console.log(`Pages dir : ${pagesDir}`);
  console.log(`Baseline  : ${baselineDir ?? "(disabled)"}`);
  console.log(`Tasks     : ${tasks.length}`);
  console.log(`${"=".repeat(60)}\n`);

  for (const task of tasks) {
    process.stdout.write(`[${task.id}] ${task.task.substring(0, 55)}... `);

    const annotated = evaluateSide(pagesDir, task, model);
    if (annotated.passed) annotatedPassed++;

    let baseline: SideResult | undefined;
    if (baselineDir) {
      baseline = evaluateSide(baselineDir, task, model);
      if (baseline.passed) baselinePassed++;
    }

    results.push({
      task_id: task.id,
      page: task.page,
      page_type: task.page_type,
      category: task.category,
      task: task.task,
      expected: task.expected,
      annotated,
      baseline,
    });

    const fmt = (s: SideResult | undefined) =>
      s === undefined ? "—" : s.error ? "ERR " : s.passed ? "PASS" : "FAIL";
    console.log(`annotated: ${fmt(annotated)}  baseline: ${fmt(baseline)}`);

    if (!annotated.passed && !annotated.error) {
      console.log(`   Expected : ${JSON.stringify(task.expected)}`);
      console.log(`   Got      : ${annotated.llm_response.substring(0, 120)}`);
    }
    if (annotated.error) console.log(`   Error    : ${annotated.error.substring(0, 100)}`);
    if (baseline?.error) console.log(`   Baseline error: ${baseline.error.substring(0, 100)}`);
  }

  const score = annotatedPassed / tasks.length;
  const delta = baselineDir ? annotatedPassed - baselinePassed : null;

  const annotatedCosts = summarizeCosts(results.map((r) => r.annotated));
  const baselineCosts = baselineDir
    ? summarizeCosts(results.map((r) => r.baseline))
    : undefined;

  const runResult: RunResult = {
    timestamp,
    harness_version: HARNESS_VERSION,
    model,
    pages_dir: pagesDir,
    baseline_dir: baselineDir,
    tasks_file: tasksFile,
    total_tasks: tasks.length,
    tasks_passed: annotatedPassed,
    baseline_passed: baselineDir ? baselinePassed : null,
    delta,
    score,
    cost_summary: { annotated: annotatedCosts, baseline: baselineCosts },
    results,
  };

  const outFile = path.join(RESULTS_DIR, `run-${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(runResult, null, 2));
  fs.writeFileSync(
    path.join(RESULTS_DIR, "latest.json"),
    JSON.stringify(runResult, null, 2)
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log(`ANNOTATED : ${annotatedPassed}/${tasks.length} (${(score * 100).toFixed(1)}%)`);
  if (baselineDir) {
    console.log(`BASELINE  : ${baselinePassed}/${tasks.length} (${((baselinePassed / tasks.length) * 100).toFixed(1)}%)`);
    console.log(`DELTA     : ${delta! >= 0 ? "+" : ""}${delta} (annotation value on this suite)`);
  }
  console.log(`\nBy category (annotated${baselineDir ? " / baseline" : ""}):`);
  const categories = [...new Set(results.map((r) => r.category))];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const a = catResults.filter((r) => r.annotated.passed).length;
    const b = catResults.filter((r) => r.baseline?.passed).length;
    console.log(
      `  ${cat.padEnd(25)} ${a}/${catResults.length}` +
      (baselineDir ? `  /  ${b}/${catResults.length}` : "")
    );
  }
  const fmtSide = (label: string, c: SideCostSummary) =>
    console.log(
      `  ${label.padEnd(10)} page ~${(c.mean_page_bytes / 1024).toFixed(1)}KB | ` +
      `latency ~${(c.mean_duration_ms / 1000).toFixed(1)}s/task | ` +
      `prompt ${c.total_prompt_tokens} tok | output ${c.total_output_tokens} tok | ` +
      `$${c.total_cost_usd.toFixed(2)}`
    );
  console.log(`\nCost / latency (means per task, totals per run):`);
  fmtSide("annotated", annotatedCosts);
  if (baselineCosts) {
    fmtSide("baseline", baselineCosts);
    if (baselineCosts.mean_page_bytes > 0) {
      const overhead =
        ((annotatedCosts.mean_page_bytes - baselineCosts.mean_page_bytes) /
          baselineCosts.mean_page_bytes) * 100;
      console.log(`  annotation page-weight overhead: ${overhead >= 0 ? "+" : ""}${overhead.toFixed(1)}%`);
    }
  }

  console.log(`\nResults written to: ${outFile}`);
  console.log(`${"=".repeat(60)}\n`);

  // Exit 0 whenever the run completed; the score lives in the results JSON.
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
