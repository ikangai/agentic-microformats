#!/usr/bin/env ts-node
/**
 * discoverer.ts
 *
 * Spec discovery tool for Agentic Microformats.
 *
 * Runs probe tasks against real web pages — tasks designed to stress-test
 * the current spec's edges. For each probe, the agent:
 *   1. Attempts the task
 *   2. Describes what it found (or couldn't find)
 *   3. Explains what annotation or spec concept was MISSING that would have helped
 *
 * Output: a structured gap report identifying missing spec concepts,
 * ranked by how often they blocked task completion.
 *
 * Usage:
 *   ts-node discovery/discoverer.ts --url=https://www.ikangai.com
 *   ts-node discovery/discoverer.ts --file=benchmark/pages/03-api-docs-quickstart.html
 *   ts-node discovery/discoverer.ts --url=https://docs.heygen.com/docs/quick-start
 *
 * Options:
 *   --url=<url>          Fetch and probe a live URL
 *   --file=<path>        Probe a local HTML file
 *   --probes=<path>      Path to probes.json (default: discovery/probes.json)
 *   --out=<path>         Output dir for reports (default: discovery/reports)
 *   --label=<name>       Human-readable label for this run
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_PROBES_FILE = path.join(__dirname, "probes.json");
const DEFAULT_OUT_DIR = path.join(__dirname, "reports");
const CLAUDE_TIMEOUT_MS = 45_000;
const TMP_DIR = path.join(__dirname, "reports");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Probe {
  id: string;
  category: string;
  difficulty: string;
  task: string;
  expected_to_pass: boolean;
  stress_vector: string;
}

interface ProbeResult {
  probe_id: string;
  category: string;
  difficulty: string;
  stress_vector: string;
  expected_to_pass: boolean;
  task: string;
  agent_answer: string;
  task_completed: boolean;
  gap_identified: string;       // What annotation/concept was missing
  gap_category: string;         // Proposed spec concept name (e.g. "temporal-metadata")
  gap_severity: "blocking" | "degrading" | "nice-to-have";
  spec_quote: string;           // Hypothetical annotation that would have helped
  error?: string;
}

interface GapReport {
  timestamp: string;
  source: string;
  label: string;
  total_probes: number;
  probes_completed: number;
  probes_blocked: number;
  gaps: GapSummary[];
  probe_results: ProbeResult[];
}

interface GapSummary {
  gap_category: string;
  count: number;
  severity: string;
  example_task: string;
  proposed_annotation: string;
}

// ---------------------------------------------------------------------------
// claude -p helper
// ---------------------------------------------------------------------------

function runClaudeP(prompt: string): { response: string; error?: string } {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const tmpFile = path.join(TMP_DIR, `_tmp_disc_${Date.now()}.txt`);
  try {
    fs.writeFileSync(tmpFile, prompt, "utf-8");
    const output = execSync(`claude -p < "${tmpFile}"`, {
      timeout: CLAUDE_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { response: output.trim() };
  } catch (e: any) {
    return { response: "", error: e?.stderr?.toString()?.trim() || String(e) };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Fetch URL as HTML
// ---------------------------------------------------------------------------

function fetchUrl(url: string): { html: string; error?: string } {
  try {
    // Use curl — available everywhere, no Node deps needed
    const html = execSync(
      `curl -s -L --max-time 15 -H "User-Agent: Mozilla/5.0" "${url}"`,
      { encoding: "utf-8", timeout: 20_000 }
    );
    return { html };
  } catch (e: any) {
    return { html: "", error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Truncate HTML to a reasonable size for the probe prompt
// Keeps head, nav, and first ~6000 chars of body
// ---------------------------------------------------------------------------

function truncateHtml(html: string, maxChars = 8000): string {
  if (html.length <= maxChars) return html;
  // Take the first maxChars — preserves structure (nav, hero, main content)
  return html.substring(0, maxChars) + "\n<!-- [truncated for context length] -->";
}

// ---------------------------------------------------------------------------
// Build probe prompt — the agent answers AND diagnoses
// ---------------------------------------------------------------------------

function buildProbePrompt(html: string, probe: Probe, specSummary: string): string {
  return `You are an AI agent attempting to navigate a web page using the Agentic Microformats specification.

The page HTML is below. It may or may not have data-agent-* annotations.
Your job is to attempt the task, then produce a structured diagnosis.

AGENTIC MICROFORMATS SPEC SUMMARY:
${specSummary}

---
HTML PAGE:
\`\`\`html
${truncateHtml(html)}
\`\`\`

---
PROBE TASK (${probe.id} — ${probe.category} — ${probe.difficulty}):
${probe.task}

STRESS VECTOR (what gap this is designed to expose):
${probe.stress_vector}

---
Respond in this EXACT JSON format (no markdown fences, raw JSON only):
{
  "agent_answer": "<your best attempt at answering the task, based only on the HTML>",
  "task_completed": <true or false — were you able to fully complete the task?>,
  "gap_identified": "<if task_completed is false: what specific information or annotation was missing that would have let you complete it? Be concrete and precise. If completed: 'none'>",
  "gap_category": "<a short snake_case name for the missing spec concept, e.g. 'temporal-metadata', 'cross-page-flow', 'auth-gating', 'entity-relationships', 'error-states'. If completed: 'none'>",
  "gap_severity": "<'blocking' if the task completely failed | 'degrading' if partial answer only | 'nice-to-have' if minor improvement>",
  "spec_quote": "<write a hypothetical data-agent-* annotation that WOULD have solved this, e.g. data-agent-freshness='daily' or data-agent-auth-required='true'. If gap_category is none: 'n/a'>"
}`;
}

// ---------------------------------------------------------------------------
// Build spec summary (concise version for prompts)
// ---------------------------------------------------------------------------

function loadSpecSummary(): string {
  // Try to load from the annotation strategy as a proxy
  const strategyPath = path.join(__dirname, "..", "benchmark", "annotation-strategy.md");
  if (fs.existsSync(strategyPath)) {
    const full = fs.readFileSync(strategyPath, "utf-8");
    // Return first 1500 chars — the core principles section
    return full.substring(0, 1500);
  }
  return `Agentic Microformats uses data-agent-* HTML attributes:
- data-agent="resource|action|navigation" — element type
- data-agent-type, data-agent-id, data-agent-prop — resource metadata
- data-agent-name, data-agent-method, data-agent-endpoint — action details
- data-agent-role="primary|secondary|danger", data-agent-risk, data-agent-reversible
- data-agent-trust="system|untrusted" — trust regions
- data-agent-human-preferred="true" — requires human confirmation`;
}

// ---------------------------------------------------------------------------
// Aggregate gap findings into summary
// ---------------------------------------------------------------------------

function aggregateGaps(results: ProbeResult[]): GapSummary[] {
  const gapMap = new Map<string, GapSummary>();

  for (const r of results) {
    if (r.gap_category === "none" || !r.gap_category) continue;

    if (!gapMap.has(r.gap_category)) {
      gapMap.set(r.gap_category, {
        gap_category: r.gap_category,
        count: 0,
        severity: r.gap_severity,
        example_task: r.task,
        proposed_annotation: r.spec_quote,
      });
    }
    const existing = gapMap.get(r.gap_category)!;
    existing.count++;
    // Escalate severity if needed
    if (r.gap_severity === "blocking" && existing.severity !== "blocking") {
      existing.severity = "blocking";
    }
  }

  return Array.from(gapMap.values()).sort((a, b) => {
    // Sort by severity then count
    const sev = { blocking: 0, degrading: 1, "nice-to-have": 2 };
    const sevDiff = (sev[a.severity as keyof typeof sev] ?? 2) -
                    (sev[b.severity as keyof typeof sev] ?? 2);
    return sevDiff !== 0 ? sevDiff : b.count - a.count;
  });
}

// ---------------------------------------------------------------------------
// Print gap report to console
// ---------------------------------------------------------------------------

function printReport(report: GapReport) {
  console.log(`\n${"=".repeat(65)}`);
  console.log(`SPEC DISCOVERY REPORT`);
  console.log(`Source  : ${report.source}`);
  console.log(`Label   : ${report.label}`);
  console.log(`${"=".repeat(65)}`);
  console.log(`Probes  : ${report.total_probes} run`);
  console.log(`Complete: ${report.probes_completed} (${Math.round(report.probes_completed / report.total_probes * 100)}%)`);
  console.log(`Blocked : ${report.probes_blocked} (${Math.round(report.probes_blocked / report.total_probes * 100)}%)`);

  console.log(`\n--- SPEC GAPS DISCOVERED (ranked by severity + frequency) ---\n`);

  for (const gap of report.gaps) {
    const icon = gap.severity === "blocking" ? "🚫" :
                 gap.severity === "degrading" ? "⚠️ " : "💡";
    console.log(`${icon} [${gap.gap_category}] — seen ${gap.count}x — ${gap.severity}`);
    console.log(`   Example task : ${gap.example_task.substring(0, 80)}...`);
    console.log(`   Proposed     : ${gap.proposed_annotation}`);
    console.log();
  }

  console.log(`\n--- PER-PROBE RESULTS ---\n`);
  for (const r of report.probe_results) {
    const status = r.task_completed ? "✓ PASS" : "✗ FAIL";
    console.log(`[${r.probe_id}] ${status} — ${r.category} (${r.difficulty})`);
    if (!r.task_completed && r.gap_category !== "none") {
      console.log(`   Gap: ${r.gap_category} — ${r.gap_identified?.substring(0, 80)}`);
    }
    if (r.error) {
      console.log(`   Error: ${r.error.substring(0, 60)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const urlArg = args.find((a) => a.startsWith("--url="))?.split("=").slice(1).join("=");
  const fileArg = args.find((a) => a.startsWith("--file="))?.split("=")[1];
  const probesFile = args.find((a) => a.startsWith("--probes="))?.split("=")[1] ?? DEFAULT_PROBES_FILE;
  const outDir = args.find((a) => a.startsWith("--out="))?.split("=")[1] ?? DEFAULT_OUT_DIR;
  const label = args.find((a) => a.startsWith("--label="))?.split("=")[1] ?? (urlArg || fileArg || "unknown");

  if (!urlArg && !fileArg) {
    console.error("Usage: ts-node discovery/discoverer.ts --url=<url> OR --file=<path>");
    process.exit(1);
  }

  // Load HTML
  let html = "";
  let source = "";

  if (urlArg) {
    console.log(`\nFetching: ${urlArg}`);
    const { html: fetched, error } = fetchUrl(urlArg);
    if (error || !fetched) {
      console.error(`Failed to fetch URL: ${error}`);
      process.exit(1);
    }
    html = fetched;
    source = urlArg;
    console.log(`Fetched ${html.length} chars`);
  } else if (fileArg) {
    if (!fs.existsSync(fileArg)) {
      console.error(`File not found: ${fileArg}`);
      process.exit(1);
    }
    html = fs.readFileSync(fileArg, "utf-8");
    source = fileArg;
    console.log(`Loaded ${html.length} chars from ${fileArg}`);
  }

  // Load probes
  const probes: Probe[] = JSON.parse(fs.readFileSync(probesFile, "utf-8"));
  const specSummary = loadSpecSummary();

  fs.mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const results: ProbeResult[] = [];

  console.log(`\nRunning ${probes.length} probes against: ${source}`);
  console.log(`Backend: claude -p (subscription)\n`);

  for (const probe of probes) {
    process.stdout.write(`[${probe.id}] ${probe.category} (${probe.difficulty})... `);

    const prompt = buildProbePrompt(html, probe, specSummary);
    const { response, error } = runClaudeP(prompt);

    if (error || !response) {
      results.push({
        probe_id: probe.id,
        category: probe.category,
        difficulty: probe.difficulty,
        stress_vector: probe.stress_vector,
        expected_to_pass: probe.expected_to_pass,
        task: probe.task,
        agent_answer: "",
        task_completed: false,
        gap_identified: "claude -p call failed",
        gap_category: "tool-error",
        gap_severity: "blocking",
        spec_quote: "n/a",
        error: error?.substring(0, 120),
      });
      console.log(`ERROR`);
      continue;
    }

    // Parse JSON response
    try {
      // Strip any accidental fences
      const cleaned = response
        .replace(/^```json\n?/, "")
        .replace(/^```\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      const parsed = JSON.parse(cleaned);

      results.push({
        probe_id: probe.id,
        category: probe.category,
        difficulty: probe.difficulty,
        stress_vector: probe.stress_vector,
        expected_to_pass: probe.expected_to_pass,
        task: probe.task,
        agent_answer: parsed.agent_answer ?? "",
        task_completed: parsed.task_completed ?? false,
        gap_identified: parsed.gap_identified ?? "none",
        gap_category: parsed.gap_category ?? "none",
        gap_severity: parsed.gap_severity ?? "nice-to-have",
        spec_quote: parsed.spec_quote ?? "n/a",
      });

      const status = parsed.task_completed ? "PASS" : `FAIL [${parsed.gap_category}]`;
      console.log(status);
    } catch (parseErr) {
      results.push({
        probe_id: probe.id,
        category: probe.category,
        difficulty: probe.difficulty,
        stress_vector: probe.stress_vector,
        expected_to_pass: probe.expected_to_pass,
        task: probe.task,
        agent_answer: response.substring(0, 200),
        task_completed: false,
        gap_identified: "JSON parse failed",
        gap_category: "tool-error",
        gap_severity: "blocking",
        spec_quote: "n/a",
        error: `Parse error: ${String(parseErr).substring(0, 80)}`,
      });
      console.log(`PARSE_ERROR`);
    }
  }

  // Build report
  const gaps = aggregateGaps(results);
  const report: GapReport = {
    timestamp,
    source,
    label,
    total_probes: probes.length,
    probes_completed: results.filter((r) => r.task_completed).length,
    probes_blocked: results.filter((r) => !r.task_completed).length,
    gaps,
    probe_results: results,
  };

  // Write JSON report
  const reportFile = path.join(outDir, `discovery-${timestamp}.json`);
  const latestFile = path.join(outDir, "latest.json");
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  fs.writeFileSync(latestFile, JSON.stringify(report, null, 2));

  // Write human-readable markdown report
  const mdFile = path.join(outDir, `discovery-${timestamp}.md`);
  fs.writeFileSync(mdFile, renderMarkdown(report));

  printReport(report);

  console.log(`\nReports written to:`);
  console.log(`  JSON : ${reportFile}`);
  console.log(`  MD   : ${mdFile}\n`);
}

// ---------------------------------------------------------------------------
// Render markdown report
// ---------------------------------------------------------------------------

function renderMarkdown(report: GapReport): string {
  const lines: string[] = [];
  lines.push(`# Spec Discovery Report`);
  lines.push(`**Source:** ${report.source}`);
  lines.push(`**Label:** ${report.label}`);
  lines.push(`**Date:** ${report.timestamp}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total probes | ${report.total_probes} |`);
  lines.push(`| Completed | ${report.probes_completed} (${Math.round(report.probes_completed / report.total_probes * 100)}%) |`);
  lines.push(`| Blocked | ${report.probes_blocked} (${Math.round(report.probes_blocked / report.total_probes * 100)}%) |`);
  lines.push(`| Gaps discovered | ${report.gaps.length} |`);
  lines.push(``);
  lines.push(`## Spec Gaps Discovered`);
  lines.push(``);
  lines.push(`Ranked by severity and frequency — these are **missing concepts** the spec needs.`);
  lines.push(``);

  for (const gap of report.gaps) {
    const sev = gap.severity === "blocking" ? "🚫 Blocking" :
                gap.severity === "degrading" ? "⚠️ Degrading" : "💡 Nice-to-have";
    lines.push(`### \`${gap.gap_category}\` — ${sev} (${gap.count}x)`);
    lines.push(``);
    lines.push(`**Example task:** ${gap.example_task}`);
    lines.push(``);
    lines.push(`**Proposed annotation:**`);
    lines.push(``);
    lines.push(`\`\`\`html`);
    lines.push(gap.proposed_annotation);
    lines.push(`\`\`\``);
    lines.push(``);
  }

  lines.push(`## Probe Results`);
  lines.push(``);
  lines.push(`| ID | Category | Difficulty | Completed | Gap |`);
  lines.push(`|----|----------|-----------|-----------|-----|`);

  for (const r of report.probe_results) {
    const status = r.task_completed ? "✓" : "✗";
    const gap = r.gap_category !== "none" ? `\`${r.gap_category}\`` : "—";
    lines.push(`| ${r.probe_id} | ${r.category} | ${r.difficulty} | ${status} | ${gap} |`);
  }

  lines.push(``);
  lines.push(`## Detailed Probe Findings`);
  lines.push(``);

  for (const r of report.probe_results) {
    lines.push(`### ${r.probe_id} — ${r.category}`);
    lines.push(``);
    lines.push(`**Task:** ${r.task}`);
    lines.push(``);
    lines.push(`**Stress vector:** ${r.stress_vector}`);
    lines.push(``);
    lines.push(`**Agent answer:** ${r.agent_answer}`);
    lines.push(``);
    if (!r.task_completed && r.gap_category !== "none") {
      lines.push(`**Gap:** ${r.gap_identified}`);
      lines.push(``);
      lines.push(`**Proposed fix:**`);
      lines.push(`\`\`\`html`);
      lines.push(r.spec_quote);
      lines.push(`\`\`\``);
      lines.push(``);
    }
  }

  return lines.join("\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
