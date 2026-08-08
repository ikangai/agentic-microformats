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

<!-- Experiments appended below by the agent -->
