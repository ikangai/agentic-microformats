# AUTORESEARCH LOOP — run autonomously without stopping for confirmation

Read this entire file before doing anything else. Then execute the experiment
loop described below. Do not ask for permission at any step — just run.

**WHICH METRIC TO OPTIMIZE (read first):** the READING benchmark
(`evaluator.ts`, full HTML shown to the model) is **accuracy-saturated at both
model tiers** on both task suites — do NOT iterate the strategy against it; its
score movements are run-to-run noise (see the 2026-08-08 entries in
`benchmark/experiment-log.md`).

The live metric is the **extraction arm** (`benchmark/extract-pipeline.ts`,
added 2026-08-09): the reference library extracts the data-agent graph at zero
tokens and the model answers from that JSON alone. Its score directly measures
annotation completeness, its failures name the missing annotation, and it has
demonstrated real gradient (strategy fix took it 12/15 → 15/15 at both tiers).
Optimize the strategy against THIS score:

```
ts-node benchmark/annotator.ts --pages-dir=benchmark/pages-v2 --out-dir=benchmark/pages-v2-annotated
ts-node benchmark/extract-pipeline.ts        # default: haiku, tasks-v2
```

Keep/revert on `tasks_passed` in `benchmark/results/latest-extract.json`; also
run the sonnet arm (`--model=claude-sonnet-5`) before committing a change, and
keep only if neither tier regresses. Current best: 15/15 at both tiers — at
ceiling. Do not weaken the isolation guards described below.

A third arm exists: `benchmark/agent-bench.ts` (action execution + multi-page
against the live demo, judged by server state; see benchmark/README.md).
Current best there: 7/8 action tasks pass at both tiers; G06 is a deliberate
trust-boundary marker expected to fail in extraction mode. Changes to the
demo's annotations or the strategy can be validated against it with
`npm run agent-bench` — treat regressions on G01–G05/G07/G08 as blocking.

---

# Autoresearch: Agentic Microformats Annotation Strategy

You are autonomously optimizing the annotation strategy for the Agentic Microformats specification.

Your goal is to maximize the **annotation delta** — how many more benchmark tasks an LLM agent
completes on annotated pages than on the same pages without annotations.

**Metric:** `delta = tasks_passed − baseline_passed`, reported by the evaluator in every run.
**Target:** maximize delta; absolute score is secondary. A high absolute score with
delta 0 means the tasks were answerable without annotations and proves nothing.

---

## What you control

**One file only:** `benchmark/annotation-strategy.md`

This is the only file you may modify. It defines how `data-agent-*` attributes should be
applied to HTML pages. The agent that reads this strategy is a separate LLM instance —
write it clearly and precisely.

---

## What you must NOT change

- `benchmark/tasks.json` — the task definitions and expected answers
- `benchmark/pages/*.html` — the unannotated source pages
- `benchmark/evaluator.ts` — the scoring logic
- `benchmark/annotator.ts` — the annotation execution logic

Extending the suite (new pages + new tasks) is a maintainer decision, not a loop
action — a loop that adds its own tasks can game its own metric.

---

## Harness notes (v2)

- Both tools call `claude -p` with a **pinned model** (default `claude-sonnet-5`),
  an isolated empty working directory, file/shell/web tools disallowed, and no
  session persistence. Do not weaken these guards: harness v1 leaked this repo's
  CLAUDE.md and left `tasks.json` (the answer key) readable to the evaluated model.
- The evaluator scores **both** `pages-annotated/` and the `pages/` baseline in one
  run and writes `tasks_passed`, `baseline_passed`, and `delta` to
  `benchmark/results/latest.json`, plus the model used.
- The annotator writes `pages-annotated/_manifest.json` recording model and
  strategy hash for the run.

---

## The experiment loop

For each experiment:

1. **Propose one change** to `annotation-strategy.md`. This can be:
   - Adding a new annotation rule for a specific page type
   - Clarifying an ambiguous instruction
   - Adding a new `data-agent-prop` name for a property the evaluator is failing to find
   - Adding a new page-type-specific rule
   - Removing a rule that is causing incorrect annotations

2. **Apply the strategy** by running:
   ```
   ts-node benchmark/annotator.ts \
     --strategy=benchmark/annotation-strategy.md \
     --pages-dir=benchmark/pages \
     --out-dir=benchmark/pages-annotated
   ```

3. **Score the result** by running:
   ```
   ts-node benchmark/evaluator.ts \
     --pages-dir=benchmark/pages-annotated \
     --tasks=benchmark/tasks.json
   ```
   Read `tasks_passed`, `baseline_passed`, and `delta` from the console output
   and from `benchmark/results/latest.json`.

4. **Keep or revert:**
   - If `delta > previous_best_delta`, or `delta == previous_best_delta` and
     `tasks_passed >= previous_best_passed`: commit with
     `git add benchmark/annotation-strategy.md && git commit -m "exp-<N>: <hypothesis> → delta <delta> (<passed>/<total> vs <baseline>/<total>)"`
   - Otherwise: revert with `git checkout benchmark/annotation-strategy.md`
   - Single runs are noisy. Before accepting an improvement of exactly +1 task,
     re-run the evaluator once and keep the change only if the improvement persists.

5. **Log the experiment** by appending to `benchmark/experiment-log.md`:
   ```
   ## Experiment <N> — <date>
   **Hypothesis:** <what you changed and why>
   **Score:** delta <delta> — annotated <passed>/<total>, baseline <baseline>/<total> (previous best delta: <prev>)
   **Model:** <model from latest.json>
   **Kept:** yes/no
   **Finding:** <what you learned>
   ```

6. **Repeat from step 1** — stop after 100 experiments, when delta stops improving
   for 10 consecutive experiments, or immediately if the stop condition at the top
   of this file applies.

---

## Strategy for choosing hypotheses

Start by analyzing **which tasks are failing** in `benchmark/results/latest.json`.
Focus on tasks where the baseline also fails — those are the only ones where
annotations can create delta. A task failing on annotated pages but passing on
baseline means the annotations actively hurt; fix that first.

Failure patterns to look for:
- `action_discovery` failures → improve action annotation rules
- `resource_enumeration` failures → improve how listings and collections are annotated
- `property_extraction` failures → add or clarify `data-agent-prop` names
- `navigation` failures → improve nav and listing annotations
- `code_discovery` failures → improve code block annotation rules

When you hit a plateau (same delta for 3+ experiments), try a **bold change**:
- Switch the annotation approach for an entire page type
- Add a new semantic concept (e.g., `data-agent-ordered="true"` for numbered lists)
- Simplify rather than add — remove ambiguous rules that might be confusing the annotator

---

## Constraints

- Each experiment now runs 30 eval calls (15 annotated + 15 baseline) plus 6
  annotation calls; expect ~5 minutes per experiment.
- Make one focused change per experiment — not multiple changes at once.
- If the annotator fails on a page (API error, etc.), skip that experiment and try a different hypothesis.
- Do not hallucinate task results — always run the evaluator and read actual output.
- The annotator LLM may not perfectly follow complex instructions — simpler, clearer rules often outperform elaborate ones.

---

## Discovery mode (alternative to optimization loop)

Instead of optimizing the strategy, you can run spec discovery to find gaps:

```bash
# Discover gaps on a single live page
npm run discover:ikangai

# Run all discovery targets
npm run discover:all

# Or against any URL
npm run discover -- --url=https://example.com --label=my-page
```

Discovery reports land in `discovery/reports/` as both JSON and Markdown.
Each report lists spec gaps ranked by severity — these become hypotheses for
the optimization loop above. Interpret reports with care: probes truncate live
pages to their first 8KB and prompt the model with the gap each probe was
designed to expose, so treat gap lists as hypotheses, not findings.
