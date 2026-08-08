# Wild Web Discovery — Ralph Loop Architecture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Crawl real websites from seed URLs, auto-discover linked pages, run spec discovery probes against each, and aggregate all gap reports into a cross-site taxonomy ranked by frequency.

**Architecture:** Ralph Loop pattern — a bash script is the outer controller. `claude -p` is called as a stateless CLI command for each atomic task. State persists in the filesystem (JSONL files, JSON reports), not in any conversation context. Each `claude -p` call gets fresh context with ONLY what it needs: page HTML + one probe question. This prevents context rot and makes the pipeline resumable, restartable, and overnight-safe.

**Inspired by:**
- [flash-moe](https://github.com/danveloper/flash-moe) — 24-hour human-AI build, no frameworks, trust the OS
- [Ralph Loop](https://www.ikangai.com/the-ralph-loop-how-a-bash-script-is-forcing-developers-to-rethink-context-as-a-resource/) — outer control, stateless workers, filesystem = memory
- [Programmatic Tool Calling](https://www.ikangai.com/programmatic-tool-calling-with-claude-code-the-developers-guide-to-agent-scale-automation/) — batch operations, reduce context pollution

**Tech Stack:** Bash (orchestrator), `claude -p` (LLM calls), `curl` (fetching), `jq` (JSON processing), TypeScript only for aggregate.ts (pure data processing, no LLM).

---

## The Pipeline

```
discovery/wild-discover.sh          ← Ralph Loop (bash outer controller)
│
├── Phase 1: CRAWL                  ← curl + claude -p per seed
│   seeds.json → targets.jsonl
│
├── Phase 2: PROBE                  ← claude -p per (page × probe)
│   targets.jsonl → reports/batch/*.json
│
└── Phase 3: AGGREGATE              ← pure TypeScript, no LLM
    reports/batch/*.json → taxonomy.md
```

Each `claude -p` call is fire-and-forget. No session state. No context accumulation.

---

## Task 1: Fix tsconfig + create seeds

**Files:**
- Modify: `tsconfig.json`
- Create: `discovery/seeds.json`

**Step 1:** Update tsconfig include:
```json
"include": ["benchmark/**/*.ts", "discovery/**/*.ts"]
```

**Step 2:** Create `discovery/seeds.json` with 10 diverse seed URLs:
```json
[
  { "url": "https://www.ikangai.com", "label": "ikangai", "vertical": "consulting" },
  { "url": "https://docs.heygen.com/docs/quick-start", "label": "heygen-docs", "vertical": "saas-docs" },
  { "url": "https://llmstxt.org", "label": "llmstxt", "vertical": "spec" },
  { "url": "https://news.ycombinator.com", "label": "hackernews", "vertical": "news" },
  { "url": "https://www.gov.uk", "label": "govuk", "vertical": "government" },
  { "url": "https://stripe.com/docs/api", "label": "stripe-docs", "vertical": "fintech-docs" },
  { "url": "https://developer.mozilla.org/en-US/docs/Web", "label": "mdn", "vertical": "developer-docs" },
  { "url": "https://www.booking.com", "label": "booking", "vertical": "travel" },
  { "url": "https://github.com/anthropics/claude-code", "label": "github-repo", "vertical": "developer-platform" },
  { "url": "https://www.mayoclinic.org/diseases-conditions", "label": "mayo-clinic", "vertical": "healthcare" }
]
```

**Step 3:** Commit both files.

---

## Task 2: Build the Ralph Loop — `wild-discover.sh`

**Files:**
- Create: `discovery/wild-discover.sh`

This is the main orchestrator. A bash script that:

### Phase 1: CRAWL
For each seed URL:
1. `curl` the page (cap at 15KB)
2. Try `curl` on `${domain}/sitemap.xml` — extract `<loc>` URLs with grep
3. If no sitemap, `claude -p` with the HTML: "Extract up to 5 same-domain internal links. Return ONLY a JSON array of absolute URLs."
4. Append seed + discovered links to `discovery/targets.jsonl`
5. Deduplicate by URL

### Phase 2: PROBE
For each target in `targets.jsonl`:
1. Check if `reports/batch/${label}.json` exists → skip (resume support)
2. `curl` the page HTML
3. For each probe in `probes.json`:
   - Build the prompt inline (same format as discoverer.ts `buildProbePrompt`)
   - `claude -p` with prompt → JSON response
   - Append to per-page results array
4. Write completed report to `reports/batch/${label}.json`

### Phase 3: AGGREGATE
Call `ts-node discovery/aggregate.ts` (the only TypeScript piece).

**Key design choices:**
- `claude -p` reads from stdin (pipe the prompt in), no temp files needed
- Each probe prompt is self-contained: spec summary + truncated HTML + one question
- `jq` handles all JSON manipulation
- Progress printed to stderr, results to files
- `set -euo pipefail` for safety
- Ctrl+C safe — resume picks up where you left off

**Step 1:** Write `wild-discover.sh` — full implementation.

**Step 2:** `chmod +x discovery/wild-discover.sh`

**Step 3:** Dry-run test with `--dry-run` flag (prints what it would do, no `claude -p` calls).

**Step 4:** Commit.

---

## Task 3: Build the aggregator — `aggregate.ts`

**Files:**
- Create: `discovery/aggregate.ts`

Pure TypeScript, no LLM calls. Reads all JSON reports from `reports/batch/`, merges gap data.

**Outputs:**
1. `discovery/reports/taxonomy.json` — structured gap taxonomy
2. `discovery/reports/taxonomy.md` — human-readable research output

**Taxonomy JSON structure:**
```json
{
  "meta": { "total_sites": 45, "total_probes": 675, "run_date": "2026-03-21" },
  "gaps": [
    {
      "category": "cross-page-flow",
      "frequency": 38,
      "pct": 84.4,
      "sites": ["ikangai", "booking", "stripe"],
      "verticals": ["consulting", "travel", "fintech-docs"],
      "severity": { "blocking": 30, "degrading": 8, "nice-to-have": 0 },
      "examples": ["data-agent-flow='checkout' data-agent-flow-step='3'"],
      "priority": "HIGH"
    }
  ],
  "vertical_heatmap": {
    "consulting": { "total_gaps": 12, "blocking": 8, "top_gap": "cross-page-flow" },
    "travel": { "total_gaps": 14, "blocking": 10, "top_gap": "auth-gating" }
  }
}
```

**Markdown output** includes:
- Executive summary (1 paragraph)
- Gap ranking table (sorted by frequency)
- Per-gap sections with affected verticals and proposed annotations
- Vertical heatmap table
- Raw numbers appendix

**CLI:** `ts-node discovery/aggregate.ts [--reports-dir=discovery/reports/batch] [--out=discovery/reports]`

**Step 1:** Write aggregate.ts — full implementation.
**Step 2:** Test with existing ikangai report.
**Step 3:** Commit.

---

## Task 4: Add npm scripts

**Files:**
- Modify: `package.json`

```json
"wild-discover": "bash discovery/wild-discover.sh",
"wild-discover:test": "bash discovery/wild-discover.sh --seeds=discovery/seeds-test.json --max-per-seed=2",
"aggregate": "ts-node --project tsconfig.json discovery/aggregate.ts"
```

Commit.

---

## Task 5: Small-scale end-to-end test

**Step 1:** Create `discovery/seeds-test.json` with 2 seeds (ikangai + llmstxt).
**Step 2:** Run `npm run wild-discover:test` — expect ~6 targets, ~90 probe calls, ~45 min.
**Step 3:** Run `npm run aggregate` — verify taxonomy.md.
**Step 4:** Review the taxonomy output.
**Step 5:** Commit results.

---

## Running the Full Pipeline

After the test passes, run overnight:
```bash
npm run wild-discover 2>&1 | tee discovery/reports/run.log
```

Resume after interruption:
```bash
npm run wild-discover  # automatically skips already-probed targets
```

**Cost:** ~50 pages × 15 probes = 750 `claude -p` calls on your subscription. ~9 hours.

**Output:** `discovery/reports/taxonomy.md` — empirical answer to "What do agents need from the web?" across 10 verticals.
