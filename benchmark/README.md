# Autoresearch – Annotation Strategy Benchmark

Automated optimization of the Agentic Microformats annotation strategy using an
iterative annotate → evaluate → keep/revert loop.

## What this is

An autoresearch loop that iteratively improves `annotation-strategy.md` — the document
that tells an LLM agent how to annotate web pages with `data-agent-*` attributes.

**Metric:** annotation delta — `annotated_passed − baseline_passed` on the same tasks.
The evaluator always scores **both** the annotated pages and the unannotated originals
in the same run, so the value added by annotations is measured, not assumed.

**Editable file:** `annotation-strategy.md`
**Loop:** annotate → evaluate (annotated + baseline) → keep/revert → repeat

> **Known result (2026-03, harness v1):** the original 15-task suite is **saturated** —
> the unannotated baseline already scores 15/15, so absolute score cannot show
> annotation value on these tasks. See `experiment-log.md`. Progress requires either
> harder tasks (larger/noisier pages, information present only in annotations,
> action-execution tasks) or measuring secondary metrics (token cost, latency).

## Methodology (harness v2)

Both `annotator.ts` and `evaluator.ts` call `claude -p` with:

- a **pinned model** (`claude-sonnet-5` by default, override with `--model=`), recorded
  in every results file;
- **isolation**: the subprocess runs in an empty scratch directory with file/shell/web
  tools disallowed and session persistence off, so it cannot load this repo's
  `CLAUDE.md` or read `tasks.json` (the answer key). Harness v1 had neither guard —
  both leaks were empirically confirmed on 2026-08-08.

## Structure

```
benchmark/
├── annotation-strategy.md          # THE editable file — agent improves this
├── tasks.json                      # Suite v1: 15 tasks on small pages (3–5 KB)
├── tasks-v2.json                   # Suite v2: 15 harder tasks on large pages (10–41 KB)
├── experiment-log.md               # Running record of all experiments
├── annotator.ts                    # Applies strategy to pages
├── evaluator.ts                    # Scores annotated AND baseline pages per run,
│                                   #   records latency/tokens/cost per call
├── extract-pipeline.ts             # Extraction arm: library extracts the data-agent
│                                   #   graph (0 tokens), model answers from JSON only
├── agent-bench.ts                  # Action-execution arm: model = policy in an episode
│                                   #   loop against the live demo; judged by server state
├── tasks-agent.json                # 13 episodes for agent-bench: 8 action/multi-page
│                                   #   (G01–G08) + 5 error-recovery with fault injection
│                                   #   (E01–E05: 503 retry, response-lost, 429, validation
│                                   #   correction, garbled body)
├── pages/                          # Suite v1 unannotated pages (never modified)
├── pages-v2/                       # Suite v2 unannotated pages (never modified)
├── pages-annotated/                # Generated (gitignored)
├── pages-v2-annotated/             # Generated (gitignored)
└── results/                        # Evaluation results (generated, gitignored)
```

**Suite v2** targets aggregation over many items, stale-data disambiguation,
endpoints buried in inline JS, locale/timezone normalization, and temporal
reasoning. Headline result (2026-08-08): both suites are **accuracy-saturated
at both model tiers** (sonnet and haiku answer from raw HTML at 14–15/15 by
spending output tokens); the measurable annotation effect at the frontier tier
is **effort** — −17 % latency and −14 % output tokens, against +54 % page
weight. Full numbers in `experiment-log.md`.

**The extraction pipeline** (`extract-pipeline.ts`, 2026-08-09) is the arm with
real signal: the reference library extracts the data-agent graph
deterministically (0 tokens, ~ms), and the model answers from that JSON alone —
the agent never reads the page. Its score directly measures **annotation
completeness** (unannotated pages score ~0 here), and its failures name the
missing annotation. Result: extraction + haiku = **15/15 at $0.37** vs
sonnet-reading-HTML = 14/15 at $1.94; one strategy iteration driven by
extraction failures took both tiers 12/15 → 15/15.

```bash
# Extraction arm (default: haiku over pages-v2-annotated + tasks-v2)
npm run extract

# Extraction only, no LLM calls — prints structure sizes per page
npx ts-node benchmark/extract-pipeline.ts --dry
```

**The agent benchmark** (`agent-bench.ts`, 2026-08-09) adds action execution
and multi-page navigation against the live AgentShop demo (spawned
automatically): the model emits one JSON action per turn (navigate / http /
answer), the harness executes it with a per-task session, and success is
judged by **server state** — cart contents extracted from `/cart` via the
reference library, order creation — plus optional answer matching. Result: all
7 action episodes pass at both tiers and both page representations;
**extraction + haiku operates the shop end-to-end at $0.47 total, ~5.6×
cheaper than raw-HTML + sonnet at the same score**. The one info task (G06) is
a deliberate trust-boundary marker: extraction agents honestly cannot see
untrusted review content. Full findings in `experiment-log.md`.

```bash
# Action-execution arm (spawns the demo server itself)
npm run agent-bench                              # extraction mode, sonnet
npm run agent-bench -- --model=claude-haiku-4-5-20251001
npm run agent-bench -- --mode=html               # model sees raw HTML instead
npm run agent-bench -- --only=G05 --port=3600    # single episode, custom port

# Non-Claude agent via any OpenAI-compatible server (e.g. LM Studio)
npm run agent-bench -- --backend=openai --model=google/gemma-4-26b-a4b
```

**Model portability** (2026-08-09): a locally-served open-weights model
(gemma-4-26b-a4b via LM Studio) scores **12/13 — identical to both Claude
tiers — at $0.00**, completing the nested checkout and all five
error-recovery episodes from the extraction graph alone. Only the deliberate
trust-boundary marker (G06) fails, in the same way across vendors.

## Setup

```bash
npm install

# Log in to Claude Code with your Pro/Max subscription
# (no API key needed — runs on your subscription)
claude login
```

## Running

The loop instructions live in the repo-root `CLAUDE.md`. Individual steps:

```bash
# Annotate pages according to the strategy
npx ts-node benchmark/annotator.ts

# Evaluate: scores pages-annotated/ AND pages/ (baseline) in one run
npx ts-node benchmark/evaluator.ts

# Evaluate a single directory without a baseline comparison
npx ts-node benchmark/evaluator.ts --pages-dir=benchmark/pages --no-baseline
```

## Benchmark page types

| File | Page type | Tasks |
|------|-----------|-------|
| 01-corporate-homepage.html | Corporate | T01–T03 |
| 02-blog-overview.html | Blog listing | T04–T06 |
| 03-api-docs-quickstart.html | API docs | T07–T09 |
| 04-spec-page.html | Specification | T10–T11 |
| 05-support-article.html | Support article | T12–T13 |
| 06-news-homepage.html | News homepage | T14–T15 |

## Task categories

- `action_discovery` — finding CTAs and interactive elements
- `resource_enumeration` — listing products, articles, services
- `property_extraction` — extracting specific data values
- `navigation` — finding primary navigation and featured content
- `code_discovery` — identifying executable code blocks with metadata
