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
