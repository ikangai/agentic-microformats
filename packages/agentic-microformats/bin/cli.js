#!/usr/bin/env node
/**
 * agentic-microformats CLI — the one-command site check.
 *
 *   npx agentic-microformats https://example.com/products
 *   npx agentic-microformats ./page.html
 *   npx agentic-microformats <url> --graph        # print the canonical graph JSON
 *   npx agentic-microformats <url> --json         # machine-readable report
 *
 * Fetches (or reads) a page, extracts the data-agent graph with the
 * reference parser, validates it, and prints what an agent would see.
 * Exit code: 0 = no validation errors, 1 = errors found, 2 = could not run.
 */
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { extractAll, toGraph, toGraphJSON, validate } from "../dist/index.js";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const wantGraph = args.includes("--graph");
const wantJson = args.includes("--json");

if (!target || args.includes("--help")) {
  console.log(`Usage: agentic-microformats <url-or-file> [--graph] [--json]

Checks a page's Agentic Microformats annotations: extracts the graph,
validates it, and summarizes what an agent can see and do.
Spec: https://github.com/ikangai/agentic-microformats`);
  process.exit(target ? 0 : 2);
}

const isUrl = /^https?:\/\//i.test(target);
let html, origin = null, headerAnnounce = null;

try {
  if (isUrl) {
    const res = await fetch(target, {
      headers: { "User-Agent": "agentic-microformats-cli/0.3" },
      redirect: "follow",
    });
    html = await res.text();
    origin = new URL(res.url || target).origin;
    headerAnnounce = res.headers.get("x-agent-annotations");
  } else {
    html = readFileSync(target, "utf-8");
  }
} catch (e) {
  console.error(`Could not load ${target}: ${e.message}`);
  process.exit(2);
}

const { document } = parseHTML(html);
const root = document.documentElement;
const result = extractAll(root);
const issues = validate(root, origin ? { origin } : {});
const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");

const metaAnnounce = root.querySelector('meta[name="agent-annotations"]')?.getAttribute("content") ?? null;

const countResources = (rs) => rs.reduce((n, r) => n + 1 + countResources(r.children ?? []), 0);
const countActions = (rs) => rs.reduce((n, r) => n + (r.actions?.length ?? 0) + countActions(r.children ?? []), 0);
const nResources = countResources(result.resources);
const nActions = countActions(result.resources) + result.actions.length;

if (wantGraph) {
  console.log(toGraphJSON(result, true));
  process.exit(errors.length ? 1 : 0);
}

if (wantJson) {
  console.log(JSON.stringify({
    target,
    announced: { meta: metaAnnounce, header: headerAnnounce },
    resources: nResources,
    actions: nActions,
    html_bytes: Buffer.byteLength(html, "utf-8"),
    graph_bytes: Buffer.byteLength(toGraphJSON(result), "utf-8"),
    errors, warnings,
  }, null, 2));
  process.exit(errors.length ? 1 : 0);
}

const graphBytes = Buffer.byteLength(toGraphJSON(result), "utf-8");
const htmlBytes = Buffer.byteLength(html, "utf-8");

console.log(`\nagentic-microformats check: ${target}\n`);
console.log(`  announced   : ${metaAnnounce ? `meta ✓ (${metaAnnounce})` : "meta ✗"}${isUrl ? `, header ${headerAnnounce ? `✓ (${headerAnnounce})` : "✗"}` : ""}`);
console.log(`  agent sees  : ${nResources} resource${nResources === 1 ? "" : "s"}, ${nActions} action${nActions === 1 ? "" : "s"}`);
console.log(`  graph size  : ${(graphBytes / 1024).toFixed(1)} KB (page: ${(htmlBytes / 1024).toFixed(1)} KB → ${((graphBytes / htmlBytes) * 100).toFixed(0)}%)`);

if (nResources === 0 && nActions === 0) {
  console.log(`\n  No annotations found. Start here:`);
  console.log(`  https://github.com/ikangai/agentic-microformats/blob/main/docs/adopt-in-30-minutes.md`);
}

const show = (list, label) => {
  if (!list.length) return;
  console.log(`\n  ${label}:`);
  for (const i of list.slice(0, 20)) {
    console.log(`    [${i.code}] ${i.message}${i.context ? ` (near "${i.context}")` : ""}`);
  }
  if (list.length > 20) console.log(`    … and ${list.length - 20} more`);
};
show(errors, `${errors.length} error${errors.length === 1 ? "" : "s"}`);
show(warnings, `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`);

// Graded conformance, not a blanket "can operate" (validation checks
// STRUCTURE only — it cannot see content coverage or whether acting is safe).
const navigable = (function hasUrl(rs) {
  return rs.some((r) => r.properties?.url || hasUrl(r.children ?? []));
})(result.resources);
const level =
  errors.length ? "invalid — fix errors above"
  : (nResources || nActions)
    ? [
        "structurally valid",
        navigable ? "navigable" : null,
        nActions ? "has actions" : null,
      ].filter(Boolean).join(", ")
    : "structurally valid but empty (no agent-readable content)";
console.log(`\n  ${errors.length ? "✗" : "•"} ${level}`);
console.log(`  (structural check only: not a claim about content completeness, grounding, or safety to act)`);
console.log();
process.exit(errors.length ? 1 : 0);
