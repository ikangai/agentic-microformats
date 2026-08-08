#!/usr/bin/env ts-node
/**
 * annotator.ts (harness v2)
 *
 * Reads annotation-strategy.md and applies data-agent-* annotations
 * to all benchmark HTML pages, writing results to pages-annotated/.
 *
 * Uses `claude -p` (Claude Code print mode) — no API key needed,
 * runs on your Pro/Max subscription.
 *
 * Isolation: calls run in an empty scratch directory with file/shell/web tools
 * disallowed and a pinned model, so the annotator sees only the strategy and
 * the page — not this repo's CLAUDE.md or the benchmark answer key.
 *
 * Usage:
 *   ts-node benchmark/annotator.ts [--strategy=./benchmark/annotation-strategy.md]
 *                                  [--pages-dir=./benchmark/pages]
 *                                  [--out-dir=./benchmark/pages-annotated]
 *                                  [--model=claude-sonnet-5]
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

const HARNESS_VERSION = "2.0.0";

const DEFAULT_STRATEGY_FILE = path.join(__dirname, "annotation-strategy.md");
const DEFAULT_PAGES_DIR = path.join(__dirname, "pages");
const DEFAULT_OUT_DIR = path.join(__dirname, "pages-annotated");
const DEFAULT_MODEL = "claude-sonnet-5";

const DISALLOWED_TOOLS =
  "Read,Glob,Grep,Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,TodoWrite";

// Generous timeout — annotating a full page can take a moment
const CLAUDE_TIMEOUT_MS = 120_000;

let SCRATCH_DIR: string | null = null;

function getScratchDir(): string {
  if (!SCRATCH_DIR) {
    SCRATCH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "am-annotate-"));
  }
  return SCRATCH_DIR;
}

function annotateHtml(
  html: string,
  strategy: string,
  pageType: string,
  model: string
): { annotated: string; error?: string } {
  const prompt = `You are an expert in the Agentic Microformats specification.
Annotate the HTML page below with data-agent-* attributes following the strategy document exactly.

Rules:
- Add data-agent-* attributes to EXISTING elements only. Do not add new elements.
- Do not remove or modify any existing HTML structure, text, or attributes.
- Return ONLY the complete annotated HTML. No explanation, no markdown fences.

ANNOTATION STRATEGY:
${strategy}

PAGE TYPE: ${pageType}

HTML TO ANNOTATE:
${html}`;

  try {
    const output = execFileSync(
      "claude",
      [
        "-p",
        "--model", model,
        "--disallowedTools", DISALLOWED_TOOLS,
        "--no-session-persistence",
      ],
      {
        input: prompt,
        timeout: CLAUDE_TIMEOUT_MS,
        encoding: "utf-8",
        cwd: getScratchDir(),
      }
    );

    // Strip markdown fences if added despite instructions
    const cleaned = output
      .trim()
      .replace(/^```html\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    return { annotated: cleaned };
  } catch (e: any) {
    return {
      annotated: html,
      error: e?.stderr?.toString()?.trim() || String(e),
    };
  }
}

// Infer page type from filename
function inferPageType(filename: string): string {
  if (filename.includes("corporate")) return "corporate";
  if (filename.includes("blog")) return "blog";
  if (filename.includes("api-docs")) return "api_docs";
  if (filename.includes("spec")) return "spec";
  if (filename.includes("support")) return "support";
  if (filename.includes("news")) return "news";
  return "unknown";
}

async function main() {
  const args = process.argv.slice(2);
  const strategyFile =
    args.find((a) => a.startsWith("--strategy="))?.split("=")[1] ??
    DEFAULT_STRATEGY_FILE;
  const pagesDir =
    args.find((a) => a.startsWith("--pages-dir="))?.split("=")[1] ??
    DEFAULT_PAGES_DIR;
  const outDir =
    args.find((a) => a.startsWith("--out-dir="))?.split("=")[1] ??
    DEFAULT_OUT_DIR;
  const model =
    args.find((a) => a.startsWith("--model="))?.split("=")[1] ?? DEFAULT_MODEL;

  if (!fs.existsSync(strategyFile)) {
    console.error(`Strategy file not found: ${strategyFile}`);
    process.exit(1);
  }

  const strategy = fs.readFileSync(strategyFile, "utf-8");
  fs.mkdirSync(outDir, { recursive: true });

  const pages = fs
    .readdirSync(pagesDir)
    .filter((f) => f.endsWith(".html"))
    .sort();

  console.log(`\nAnnotating ${pages.length} pages (harness v${HARNESS_VERSION})`);
  console.log(`Backend  : claude -p (subscription), isolated cwd, tools disallowed`);
  console.log(`Model    : ${model}`);
  console.log(`Strategy : ${strategyFile}`);
  console.log(`Output   : ${outDir}\n`);

  let successCount = 0;
  const errors: Record<string, string> = {};

  for (const page of pages) {
    const inFile = path.join(pagesDir, page);
    const outFile = path.join(outDir, page);
    const pageType = inferPageType(page);

    process.stdout.write(`  ${page} (${pageType})... `);

    const html = fs.readFileSync(inFile, "utf-8");
    const { annotated, error } = annotateHtml(html, strategy, pageType, model);

    if (error) {
      console.log(`ERROR: ${error.substring(0, 80)}`);
      errors[page] = error.substring(0, 300);
      fs.writeFileSync(outFile, html); // fall back to unannotated
    } else {
      fs.writeFileSync(outFile, annotated);
      successCount++;
      console.log("done");
    }
  }

  // Manifest: enough to know exactly what produced this output directory.
  const manifest = {
    timestamp: new Date().toISOString(),
    harness_version: HARNESS_VERSION,
    model,
    strategy_file: strategyFile,
    strategy_sha256: crypto.createHash("sha256").update(strategy).digest("hex"),
    pages_annotated: successCount,
    pages_total: pages.length,
    errors,
  };
  fs.writeFileSync(
    path.join(outDir, "_manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`\nAnnotated ${successCount}/${pages.length} pages successfully.`);
  console.log(`Manifest: ${path.join(outDir, "_manifest.json")}`);
  console.log(`Output: ${outDir}\n`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
