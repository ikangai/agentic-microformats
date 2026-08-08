#!/usr/bin/env ts-node
/**
 * aggregate.ts
 *
 * Cross-site gap taxonomy builder for Agentic Microformats discovery.
 *
 * Reads all JSON discovery reports and produces a merged gap taxonomy
 * showing which spec gaps appear across the most sites and verticals.
 *
 * No LLM calls — pure data aggregation.
 *
 * Usage:
 *   ts-node discovery/aggregate.ts
 *   ts-node discovery/aggregate.ts --reports-dir=discovery/reports/batch
 *   ts-node discovery/aggregate.ts --reports-dir=discovery/reports/batch --out=discovery/reports
 *   ts-node discovery/aggregate.ts --targets=discovery/targets.jsonl
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_REPORTS_DIR = path.join(__dirname, "reports", "batch");
const DEFAULT_OUT_DIR = path.join(__dirname, "reports");

const EXCLUDE_FILES = new Set(["latest.json", "progress.json", "taxonomy.json"]);

// ---------------------------------------------------------------------------
// Types (mirrored from discoverer.ts)
// ---------------------------------------------------------------------------

interface ProbeResult {
  probe_id: string;
  category: string;
  difficulty: string;
  stress_vector: string;
  expected_to_pass: boolean;
  task: string;
  agent_answer: string;
  task_completed: boolean;
  gap_identified: string;
  gap_category: string;
  gap_severity: "blocking" | "degrading" | "nice-to-have";
  spec_quote: string;
  error?: string;
}

interface GapSummary {
  gap_category: string;
  count: number;
  severity: string;
  example_task: string;
  proposed_annotation: string;
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

interface TargetEntry {
  url: string;
  label: string;
  vertical?: string;
}

// ---------------------------------------------------------------------------
// Taxonomy output types
// ---------------------------------------------------------------------------

interface TaxonomyGap {
  category: string;
  frequency: number;
  pct: number;
  sites: string[];
  verticals: string[];
  severity: { blocking: number; degrading: number; "nice-to-have": number };
  examples: string[];
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

interface VerticalHeatmapEntry {
  total_gaps: number;
  blocking: number;
  top_gap: string;
}

interface TaxonomyOutput {
  meta: {
    total_sites: number;
    total_probes_run: number;
    total_probes_passed: number;
    total_probes_failed: number;
    run_date: string;
    verticals: string[];
  };
  gaps: TaxonomyGap[];
  vertical_heatmap: Record<string, VerticalHeatmapEntry>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function priorityFromPct(pct: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (pct >= 70) return "CRITICAL";
  if (pct >= 50) return "HIGH";
  if (pct >= 30) return "MEDIUM";
  return "LOW";
}

function loadTargetsMap(targetsPath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(targetsPath)) return map;

  const content = fs.readFileSync(targetsPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry: TargetEntry = JSON.parse(trimmed);
      if (entry.label && entry.vertical) {
        map.set(entry.label, entry.vertical);
      }
    } catch {
      // skip malformed lines
    }
  }
  return map;
}

function loadReports(reportsDir: string): GapReport[] {
  if (!fs.existsSync(reportsDir)) {
    console.error(`Reports directory not found: ${reportsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(reportsDir)
    .filter((f) => f.endsWith(".json") && !EXCLUDE_FILES.has(f));

  const reports: GapReport[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(reportsDir, file), "utf-8");
      const report: GapReport = JSON.parse(content);
      // Basic validation: must have probe_results array
      if (report.probe_results && Array.isArray(report.probe_results)) {
        reports.push(report);
      } else {
        console.warn(`Skipping ${file}: missing probe_results`);
      }
    } catch (e) {
      console.warn(`Skipping ${file}: ${String(e).substring(0, 80)}`);
    }
  }

  return reports;
}

// ---------------------------------------------------------------------------
// Core aggregation
// ---------------------------------------------------------------------------

function buildTaxonomy(
  reports: GapReport[],
  verticalMap: Map<string, string>
): TaxonomyOutput {
  const totalSites = reports.length;
  let totalProbesRun = 0;
  let totalProbesPassed = 0;
  let totalProbesFailed = 0;

  // Track per-gap data across sites
  const gapData = new Map<
    string,
    {
      sites: Set<string>;
      verticals: Set<string>;
      severity: { blocking: number; degrading: number; "nice-to-have": number };
      examples: Set<string>;
    }
  >();

  // Track per-vertical data
  const verticalData = new Map<
    string,
    {
      sites: Set<string>;
      gapCounts: Map<string, number>;
      blockingCount: number;
    }
  >();

  const allVerticals = new Set<string>();

  for (const report of reports) {
    const siteLabel = report.label || "unknown";
    const vertical = verticalMap.get(siteLabel) || "unknown";
    allVerticals.add(vertical);

    totalProbesRun += report.total_probes;
    totalProbesPassed += report.probes_completed;
    totalProbesFailed += report.probes_blocked;

    // Initialize vertical tracking
    if (!verticalData.has(vertical)) {
      verticalData.set(vertical, {
        sites: new Set(),
        gapCounts: new Map(),
        blockingCount: 0,
      });
    }
    const vd = verticalData.get(vertical)!;
    vd.sites.add(siteLabel);

    // Process each probe result for gap data
    for (const result of report.probe_results) {
      if (
        result.task_completed ||
        !result.gap_category ||
        result.gap_category === "none" ||
        result.gap_category === "tool-error"
      ) {
        continue;
      }

      const cat = result.gap_category;

      if (!gapData.has(cat)) {
        gapData.set(cat, {
          sites: new Set(),
          verticals: new Set(),
          severity: { blocking: 0, degrading: 0, "nice-to-have": 0 },
          examples: new Set(),
        });
      }

      const gd = gapData.get(cat)!;
      gd.sites.add(siteLabel);
      gd.verticals.add(vertical);

      // Count severity
      const sev = result.gap_severity || "nice-to-have";
      if (sev in gd.severity) {
        gd.severity[sev as keyof typeof gd.severity]++;
      }

      // Collect example annotations (deduplicated, capped)
      if (result.spec_quote && result.spec_quote !== "n/a" && gd.examples.size < 5) {
        gd.examples.add(result.spec_quote);
      }

      // Track in vertical
      vd.gapCounts.set(cat, (vd.gapCounts.get(cat) || 0) + 1);
      if (sev === "blocking") {
        vd.blockingCount++;
      }
    }
  }

  // Build sorted gap list
  const gaps: TaxonomyGap[] = Array.from(gapData.entries())
    .map(([category, data]) => {
      const frequency = data.sites.size;
      const pct = totalSites > 0 ? Math.round((frequency / totalSites) * 1000) / 10 : 0;
      return {
        category,
        frequency,
        pct,
        sites: Array.from(data.sites).sort(),
        verticals: Array.from(data.verticals).sort(),
        severity: { ...data.severity },
        examples: Array.from(data.examples),
        priority: priorityFromPct(pct),
      };
    })
    .sort((a, b) => {
      // Sort by frequency desc, then blocking count desc
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return b.severity.blocking - a.severity.blocking;
    });

  // Build vertical heatmap
  const verticalHeatmap: Record<string, VerticalHeatmapEntry> = {};
  for (const [vertical, vd] of Array.from(verticalData.entries())) {
    let totalGaps = 0;
    let topGap = "";
    let topGapCount = 0;

    for (const [gap, count] of Array.from(vd.gapCounts.entries())) {
      totalGaps += count;
      if (count > topGapCount) {
        topGapCount = count;
        topGap = gap;
      }
    }

    verticalHeatmap[vertical] = {
      total_gaps: totalGaps,
      blocking: vd.blockingCount,
      top_gap: topGap || "none",
    };
  }

  return {
    meta: {
      total_sites: totalSites,
      total_probes_run: totalProbesRun,
      total_probes_passed: totalProbesPassed,
      total_probes_failed: totalProbesFailed,
      run_date: new Date().toISOString().split("T")[0],
      verticals: Array.from(allVerticals).sort(),
    },
    gaps,
    vertical_heatmap: verticalHeatmap,
  };
}

// ---------------------------------------------------------------------------
// Render taxonomy.md
// ---------------------------------------------------------------------------

function renderTaxonomyMarkdown(taxonomy: TaxonomyOutput, reports: GapReport[]): string {
  const { meta, gaps, vertical_heatmap } = taxonomy;
  const lines: string[] = [];

  const failPct =
    meta.total_probes_run > 0
      ? Math.round((meta.total_probes_failed / meta.total_probes_run) * 100)
      : 0;

  lines.push(`# Wild Web Discovery — Gap Taxonomy`);
  lines.push(``);
  lines.push(
    `**Run date:** ${meta.run_date}`
  );
  lines.push(
    `**Sites analyzed:** ${meta.total_sites} | **Probes run:** ${meta.total_probes_run} | **Probes failed:** ${meta.total_probes_failed} (${failPct}%)`
  );
  lines.push(``);

  // Executive summary
  lines.push(`## Executive Summary`);
  lines.push(``);
  const topGaps = gaps.slice(0, 3);
  if (topGaps.length > 0) {
    const topNames = topGaps.map((g) => `**${g.category}** (${g.pct}%)`).join(", ");
    lines.push(
      `The three most prevalent spec gaps across ${meta.total_sites} real-world sites are ${topNames}. ` +
        `These gaps represent fundamental capabilities that the current Agentic Microformats specification ` +
        `does not address, leaving agents unable to complete common tasks on the majority of websites tested. ` +
        `Addressing these gaps — particularly those rated CRITICAL — should be the highest priority for the next spec revision.`
    );
  } else {
    lines.push(`No gaps were identified across the analyzed sites.`);
  }
  lines.push(``);

  // Gap ranking table
  lines.push(`## Gap Ranking`);
  lines.push(``);
  lines.push(`| Rank | Gap Category | Frequency | % Sites | Priority | Top Vertical |`);
  lines.push(`|------|-------------|-----------|---------|----------|-------------|`);

  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i];
    const topVertical = g.verticals[0] || "unknown";
    lines.push(
      `| ${i + 1} | ${g.category} | ${g.frequency}/${meta.total_sites} | ${g.pct}% | ${g.priority} | ${topVertical} |`
    );
  }
  lines.push(``);

  // Gap details
  lines.push(`## Gap Details`);
  lines.push(``);

  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i];
    lines.push(`### ${i + 1}. ${g.category} — ${g.priority} (${g.pct}% of sites)`);
    lines.push(``);
    lines.push(`**Affected verticals:** ${g.verticals.join(", ")}`);
    lines.push(
      `**Severity breakdown:** ${g.severity.blocking} blocking, ${g.severity.degrading} degrading, ${g.severity["nice-to-have"]} nice-to-have`
    );

    if (g.examples.length > 0) {
      lines.push(`**Example annotations proposed:**`);
      for (const ex of g.examples) {
        lines.push(`- \`${ex}\``);
      }
    }
    lines.push(``);
  }

  // Vertical heatmap
  lines.push(`## Vertical Heatmap`);
  lines.push(``);
  lines.push(`| Vertical | Sites | Total Gaps | Blocking | Top Gap |`);
  lines.push(`|----------|-------|-----------|----------|---------|`);

  const verticals = Object.entries(vertical_heatmap).sort(
    (a, b) => b[1].total_gaps - a[1].total_gaps
  );
  for (const [vertical, data] of verticals) {
    // Count sites in this vertical from reports
    const siteCount = reports.filter((r) => {
      // This is approximate — we match via the heatmap having this vertical
      return true; // The vertical_heatmap already has the right data
    }).length;
    lines.push(
      `| ${vertical} | — | ${data.total_gaps} | ${data.blocking} | ${data.top_gap} |`
    );
  }
  lines.push(``);

  // Appendix: per-site summary
  lines.push(`## Appendix: Raw Numbers`);
  lines.push(``);
  lines.push(`| Site | Source | Probes | Passed | Failed | Top Gap |`);
  lines.push(`|------|--------|--------|--------|--------|---------|`);

  for (const report of reports) {
    const topGap =
      report.gaps.length > 0 ? report.gaps[0].gap_category : "none";
    lines.push(
      `| ${report.label} | ${report.source.substring(0, 40)} | ${report.total_probes} | ${report.probes_completed} | ${report.probes_blocked} | ${topGap} |`
    );
  }
  lines.push(``);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const reportsDir =
    args.find((a) => a.startsWith("--reports-dir="))?.split("=").slice(1).join("=") ??
    DEFAULT_REPORTS_DIR;
  const outDir =
    args.find((a) => a.startsWith("--out="))?.split("=").slice(1).join("=") ??
    DEFAULT_OUT_DIR;
  const targetsPath =
    args.find((a) => a.startsWith("--targets="))?.split("=").slice(1).join("=");

  console.log(`\nAgentic Microformats — Gap Taxonomy Aggregator`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Reports dir : ${reportsDir}`);
  console.log(`Output dir  : ${outDir}`);
  if (targetsPath) {
    console.log(`Targets file: ${targetsPath}`);
  }

  // Load vertical mapping from targets.jsonl if provided
  const verticalMap = targetsPath ? loadTargetsMap(targetsPath) : new Map<string, string>();

  if (verticalMap.size > 0) {
    console.log(`Loaded ${verticalMap.size} label-to-vertical mappings`);
  }

  // Load all reports
  const reports = loadReports(reportsDir);
  console.log(`\nLoaded ${reports.length} discovery reports`);

  if (reports.length === 0) {
    console.error("No valid reports found. Nothing to aggregate.");
    process.exit(1);
  }

  // Build taxonomy
  const taxonomy = buildTaxonomy(reports, verticalMap);

  // Write outputs
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "taxonomy.json");
  fs.writeFileSync(jsonPath, JSON.stringify(taxonomy, null, 2));

  const mdPath = path.join(outDir, "taxonomy.md");
  fs.writeFileSync(mdPath, renderTaxonomyMarkdown(taxonomy, reports));

  // Console summary
  console.log(`\n--- TAXONOMY SUMMARY ---\n`);
  console.log(`Sites analyzed  : ${taxonomy.meta.total_sites}`);
  console.log(`Total probes    : ${taxonomy.meta.total_probes_run}`);
  console.log(`Probes passed   : ${taxonomy.meta.total_probes_passed}`);
  console.log(`Probes failed   : ${taxonomy.meta.total_probes_failed}`);
  console.log(`Unique gaps     : ${taxonomy.gaps.length}`);
  console.log(`Verticals       : ${taxonomy.meta.verticals.join(", ")}`);
  console.log(`\nTop gaps:`);

  for (let i = 0; i < Math.min(10, taxonomy.gaps.length); i++) {
    const g = taxonomy.gaps[i];
    console.log(
      `  ${i + 1}. ${g.category} — ${g.frequency}/${taxonomy.meta.total_sites} sites (${g.pct}%) — ${g.priority}`
    );
  }

  console.log(`\nOutputs:`);
  console.log(`  JSON : ${jsonPath}`);
  console.log(`  MD   : ${mdPath}\n`);
}

main();
