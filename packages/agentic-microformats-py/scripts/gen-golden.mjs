#!/usr/bin/env node
/**
 * Regenerates the golden graphs in tests/golden/ from the TypeScript
 * reference implementation. Run after any change to the canonical
 * serialization, then re-run the Python parity tests.
 *
 *   node scripts/gen-golden.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { extractAll, toGraph } from "../../agentic-microformats/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const outDir = join(here, "..", "tests", "golden");
mkdirSync(outDir, { recursive: true });

const FIXTURES = [
  ["examples/ecommerce/product-page.html", "product-page.json"],
  ["examples/basic/project-dashboard.html", "project-dashboard.json"],
  ["examples/forms/nested-parameters.html", "nested-parameters.json"],
  ["examples/workflows/multi-step-checkout.html", "multi-step-checkout.json"],
];

for (const [src, out] of FIXTURES) {
  const html = readFileSync(join(repo, src), "utf-8");
  const { document } = parseHTML(html);
  const graph = toGraph(extractAll(document.documentElement));
  writeFileSync(join(outDir, out), JSON.stringify(graph, null, 2) + "\n");
  console.log(`${src} -> tests/golden/${out}`);
}
