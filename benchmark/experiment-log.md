# Experiment Log

Autoresearch run for `agentic-microformats` annotation strategy optimization.

**Editable file:** `benchmark/annotation-strategy.md`
**Metric (harness v2, from 2026-08-08):** `delta = tasks_passed − baseline_passed` — see Methodology Change below.
**Metric (harness v1, historical):** `tasks_passed / total_tasks`, target 13/15 (87%)

---

## Baseline

Run before experiment 1 to establish floor score with zero annotations.

```
ts-node benchmark/evaluator.ts \
  --pages-dir=benchmark/pages \
  --tasks=benchmark/tasks.json
```

**Score:** 15/15 (100%) — unannotated pages baseline

---

## Experiment 1 — 2026-03-20
**Hypothesis:** Run initial annotation strategy v0.1 as-is against all 6 pages
**Score:** 15/15 (100%) (previous: 15/15 unannotated baseline)
**Kept:** yes
**Finding:** The annotation strategy v0.1 already achieves a perfect score. All 15 tasks pass on annotated pages — action_discovery (2/2), resource_enumeration (4/4), property_extraction (5/5), navigation (3/3), code_discovery (1/1). The annotations do not degrade the LLM's ability to answer any task. Target of 13/15 exceeded on first run.

---

## Methodology Change — 2026-08-08 (harness v2)

A blindspot review found that the v1 results above cannot support the claim that
annotations help:

1. **Ceiling effect.** The unannotated baseline was already 15/15, so the suite
   has zero headroom — Experiment 1 demonstrated only that annotations do not
   hurt, not that they help.
2. **Contaminated evaluator.** `claude -p` was invoked from the repo cwd with
   default tool access: it loaded this repo's `CLAUDE.md` (including the
   benchmark's own instructions and target) and could read `tasks.json` — the
   answer key. Both leaks were verified empirically.
3. **No model pinning.** No run recorded which model produced it.

Harness v2 (annotator + evaluator) fixes all three: isolated empty cwd, file/
shell/web tools disallowed, session persistence off, model pinned (default
`claude-sonnet-5`) and recorded in every results file. The evaluator now scores
annotated and baseline pages in the same run and reports the delta.

## Verification Run — 2026-08-08 (harness v2, strategy v0.1)

**Setup:** model `claude-sonnet-5`, isolated; annotator succeeded on 5/6 pages
(06-news timed out → fell back to unannotated; see `pages-annotated/_manifest.json`).
**Score:** delta **+0** — annotated 14/15, baseline 14/15.
**Kept:** n/a (no strategy change; verification run)
**Finding:** Saturation replicates under an isolated, pinned model. Two tasks
moved in opposite directions, which the v1 harness could not have detected:
- **T04 (navigation): annotated FAIL, baseline PASS** — annotations actively
  misled the model about which blog article is most recent. Annotations can
  degrade performance, not just fail to help.
- **T12 (property_extraction): annotated PASS, baseline FAIL** — the
  `data-agent-prop="definition"` rule genuinely helped.
Single-run noise is real (baseline 14/15 here vs 15/15 in v1 under a different,
unrecorded model). Conclusion: this suite cannot demonstrate annotation value;
further strategy tuning against it is not meaningful. Next step is a harder
suite — larger/noisier pages, tasks whose answers are not in the visible text,
or action-execution tasks — plus secondary metrics (token cost, latency).

---

## Suite v2 + Cost Instrumentation — 2026-08-08

**Goal:** build a task suite with real headroom (per the harness-v2 conclusion above)
and measure token cost / latency of annotations, not just accuracy.

**What was built:**
- `pages-v2/` — three larger, distractor-heavy pages (10–41 KB): a 48-product
  German e-commerce category page (stale JSON-LD prices, endpoints buried in
  inline JS, mixed stock states), an API changelog (mixed date formats, beta
  vs stable, multiple deprecations), and a 3-day conference program (timezone
  conversion, availability states, session-overlap reasoning). Page 07 is
  generated from an authored data array so ground truth is provably consistent.
- `tasks-v2.json` — 15 tasks with a `computation` category: aggregation over
  48 items, stale-data disambiguation, cross-item arithmetic, temporal overlap.
- Evaluator now records per-call latency, prompt/output tokens, and cost
  (`claude -p --output-format json`), plus page bytes per side, and prints an
  annotated-vs-baseline cost table. Decimal expectations match on numeric
  boundaries ("4.99" no longer passes inside "14.99").

**Runs (all isolated, pinned):**

| Run | Model | Annotated | Baseline | Delta |
|-----|-------|-----------|----------|-------|
| floor (draft tasks) | claude-sonnet-5 | — | 14/15 | — |
| floor (hardened) | claude-sonnet-5 | — | 14/15 | — |
| floor (hardened) | claude-haiku-4-5 | — | 15/15 | — |
| delta run | claude-sonnet-5 | 14/15 | 14/15 | **+0** |
| delta run | claude-haiku-4-5 | 15/15 | 15/15 | **+0** |

**Cost / effort (delta runs; annotation page-weight overhead +54 %):**

| Model | Side | Latency/task | Output tokens | Cost |
|-------|------|-------------|---------------|------|
| sonnet | baseline | 4.2 s | 3 137 | $1.94 |
| sonnet | annotated | **3.5 s (−17 %)** | **2 690 (−14 %)** | $2.45 (+26 %) |
| haiku | baseline | 8.4 s | 11 424 | $0.49 |
| haiku | annotated | 10.3 s (+23 %) | 13 957 (+22 %) | $0.64 (+31 %) |

**Findings:**
1. **Accuracy saturation is robust across tiers.** Even engineered
   aggregation/distractor tasks over 40 KB pages get solved by both models on
   raw HTML — they trade output tokens for accuracy (haiku spends ~750
   tok/task visibly enumerating). Single-page extractive QA cannot demonstrate
   annotation accuracy value against modern LLMs, full stop.
2. **Remaining failures are noise, and annotations move them around, not
   down.** Sonnet dropped V15 (floor), then V04-baseline/V11-annotated in the
   delta run — one flip up, one flip down, net zero. Same both-directions
   pattern as the v1 suite (T04/T12).
3. **The measurable annotation effect at the frontier tier is effort, not
   accuracy:** −17 % latency and −14 % output tokens against +29 % prompt
   tokens — annotations shift work from inference to input. Dollar cost rises
   because input tokens dominate pricing. At the small tier annotations are
   pure overhead: haiku reads everything and shortcuts nothing.
4. **The annotator is capable of authoritative normalization.** Sonnet
   correctly converted CEST→UTC ISO instants, normalized German decimal
   prices, and classified all 48 stock states to match ground truth exactly —
   the annotation layer itself is reliable when seeded with clear rules.
5. **Where real headroom must come from:** task formats where the agent does
   not read the whole page — deterministic extraction via the reference
   library (`packages/agentic-microformats` extracts the full data-agent graph
   at zero tokens) followed by a small model answering over the extracted
   structure, action *execution* against the demo APIs, and multi-page
   workflows. Reading-comprehension benchmarks are the wrong instrument for
   this spec; extraction-pipeline benchmarks are the right next step.

**Kept:** yes — suite v2, cost instrumentation, and strategy seed rules for the
three new page types committed. The saturation stop condition in CLAUDE.md now
covers both suites.

---

## Extraction Pipeline — 2026-08-09

**Goal:** measure what annotations enable *architecturally* — an agent that never
reads the page, only its machine-readable surface — per the conclusion of the
suite-v2 entry above.

**Instrument:** `benchmark/extract-pipeline.ts`. The reference library
(`packages/agentic-microformats` + linkedom) extracts the data-agent graph
deterministically — **0 LLM tokens, 2–22 ms per page** — and the model answers
tasks-v2 from that JSON alone. The HTML is never shown to the model. Extracted
structure is **36 % of the HTML bytes** (39.4 KB vs 108.9 KB across the three
annotated pages).

**Runs (isolated, pinned):**

| Arm | Model | Score | Latency/task | Output tok | Cost |
|-----|-------|-------|-------------|-----------|------|
| extraction (initial annotations) | sonnet | 12/15 | 5.7 s | 4 736 | $1.57 |
| extraction (initial annotations) | haiku | 12/15 | 8.8 s | 11 603 | $0.36 |
| extraction (after strategy fix, exp below) | sonnet | **15/15** | 4.4 s | 3 325 | $1.55 |
| extraction (after strategy fix) | haiku | **15/15** | 9.8 s | 13 119 | **$0.37** |
| *(reference: full HTML, 2026-08-08)* | sonnet | 14/15 | 4.2 s | 3 137 | $1.94 |
| *(reference: full HTML, 2026-08-08)* | haiku | 15/15 | 8.4 s | 11 424 | $0.49 |

**Experiment: first strategy iteration with real gradient.** The initial
extraction runs failed 3 tasks at BOTH tiers — and every failure was a
diagnosable annotation gap, not model noise:
- V08: only one deprecation annotated per release; duplicate `deprecation`
  props would collapse anyway (the library keys properties by name).
- V09: `requires: "SDK >= 4.2.0"` extracted, but nothing tied it to
  *streaming exports* — sonnet honestly answered "not found" (haiku guessed).
- V10: breaking changes never annotated.

One change to `annotation-strategy.md` (changelog rules: aggregate all
deprecations into one `deprecations` value; add `breaking-changes` count;
include the feature name in `requires`) + re-annotating page 08 took both
tiers from **12/15 → 15/15**. First time in this project the loop metric
moved in response to a strategy edit.

**Findings:**
1. **The extraction arm is the missing gradient.** Its score is a direct
   measure of annotation completeness: unannotated pages would score ~0 here
   (empty graph), so the annotated-vs-unannotated delta is the full task set —
   the value the reading benchmark could never show.
2. **Structure + small model beats prose + frontier model on cost at equal or
   better accuracy:** extraction+haiku = 15/15 at $0.37 vs sonnet-reads-HTML =
   14/15 at $1.94 (≈5× cheaper), with 31 % fewer prompt tokens than
   haiku-reads-HTML and zero page-reading by the agent.
3. **Extraction failures are interpretable.** Each one names the missing or
   ambiguous annotation — they double as spec/strategy discovery, which the
   probe-based discovery tool only simulated.
4. **Caveat:** the strategy fix targeted the three observed failures — a
   train-on-test iteration. Fine for demonstrating the gradient; claims of
   generality need held-out tasks (suite v3 candidate).

**Kept:** yes — pipeline committed; strategy change committed (extraction
score 12→15 at both tiers, full-HTML scores unchanged).

---

## Agent Benchmark: Action Execution + Multi-Page — 2026-08-09

**Goal:** fresh headroom beyond reading/extraction QA — tasks where the agent
must ACT: execute annotated API contracts against the live AgentShop demo,
chain response data, and navigate across pages. Judged by **server state**
(cart contents extracted from /cart via the reference library, order
creation), not string matching.

**Instrument:** `benchmark/agent-bench.ts` + `tasks-agent.json` (8 episodes).
The model is a policy in an episode loop: per turn it sees the current page —
extracted data-agent graph (`--mode=extraction`, default) or raw HTML
(`--mode=html`) — plus action history, and emits one JSON action
(navigate / http / answer). The harness executes it with a fresh session
cookie jar per task against a spawned demo server, then runs typed state
assertions. Episodes cover: direct add-to-cart, exact quantities, chaining
`cartItemId` from the add response into PATCH, discovery + selective DELETE,
full nested checkout (`shipping.*`/`payment.*` dotted params), constraint
probing (max quantity), catalog-wide compute + multi-add, and one info task
crossing the trust boundary (G06).

**Runs (isolated, pinned):**

| Arm | Model | Score | Steps | Total cost |
|-----|-------|-------|-------|-----------|
| raw HTML | sonnet | 7/8 | 22 | $2.62 |
| extraction | sonnet | 7/8 | 23 | $2.49 |
| extraction | haiku | 7/8 | 25 | **$0.47** |

All seven ACTION episodes (G01–G05, G07, G08) passed in every arm — including
the full checkout with nested params and the cartItemId chain. The only
failure everywhere was G06 (info task), each arm differently — three findings
from one task:

1. **Navigability gap (spec/demo defect, fixed).** In extraction mode, sonnet
   guessed `/products/SKU-MONITOR-27` (404) and looped: the catalog cards
   never annotated their detail-page URLs, so plain `<a href>` links are
   invisible to the graph. Fix: `data-agent-prop="url"` on catalog card links
   (`demo/views/catalog.ejs`). After the fix the agent navigates correctly in
   ONE step. Rule worth promoting to the spec: **resource cards MUST annotate
   their canonical URL or the graph is not navigable.**
2. **Trust boundary (by design, kept as a marker task).** Reviews live in a
   `data-agent-trust="untrusted"` region, which extraction deliberately
   skips. After the navigability fix, sonnet's extraction-arm answer was
   *honest*: rating 4.9, "0 written review texts displayed" — true of the
   trusted graph, false of the human-visible page. G06 permanently measures
   this divergence; haiku instead burns all steps searching. Candidate spec
   concept: site-authored aggregates about untrusted regions.
3. **Task-wording ambiguity (fixed).** The original G06 didn't distinguish
   review texts from the rating count (67); the html arm answered 67.
   Amended wording → html+sonnet passes (2 steps).

**Headline:** action execution over annotated contracts works at both tiers
and both representations — and **extraction + haiku completes the suite at
$0.47, ~5.6× cheaper than raw-HTML + sonnet ($2.62), at the same score.**
The annotations' declared contracts (endpoint, method, params, min/max,
response schemas) were sufficient for a small model to operate a shop
end-to-end without ever reading HTML.

**Harness notes:** `Connection: close` on all harness fetches (pooled sockets
go stale across long model calls → spurious ECONNRESET); results persist
incrementally per episode; per-task fresh session = state isolation.

**Kept:** yes — agent-bench committed; G06 wording amended; catalog url
annotation added to the demo.

---

<!-- Experiments appended below by the agent -->
