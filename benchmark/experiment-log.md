# Experiment Log

Autoresearch run for `agentic-microformats` annotation strategy optimization.

**Target:** 13/15 tasks (87%)
**Editable file:** `benchmark/annotation-strategy.md`
**Metric:** `tasks_passed / total_tasks`

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

<!-- Experiments appended below by the agent -->
