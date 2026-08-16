# Changelog

All notable changes to the Agentic Microformats specification.

## [0.4.x / impl 0.11.0] - August 2026 — task → tool selection

Addresses Round-5 C4 (the consumer holds an intent, not a desire for all twelve
tools; we handed them the whole graph every step).

Measurement first: on the demo catalog the `add_to_cart` block is **52% of every
product resource** and byte-identical across all six products except the SKU.
The dominant cost in a collection graph is not too many tools — it is one tool
repeated per item. That reframed the work into two tiers with very different
risk, kept deliberately separate.

### Added
- **Compact encoding** (`spec/graph-serialization.md` §5, OPTIONAL) —
  `actionTemplates` + `$template` references hoist a repeated action into one
  template plus per-item bindings. **Lossless by requirement**:
  `expandGraph(compactGraph(g))` must serialize byte-identically to `g`,
  asserted in the tests. Two actions share a template only when everything but
  `target`/`endpoint`/param values matches, so a differing `risk` or `method`
  can never be merged away. Opt-in only (`Accept: application/agent+json;
  compact=1`) — a naive consumer would misread a reference as an action.
- **`selectTools(result, intent)`** (impl, Experimental tier) — consumer-side
  narrowing of the graph to a task. IDF-weighted scoring over resource and
  action fields: a token carried by *every* resource on the page ("add",
  "cart") has zero weight, so the selector distinguishes the vocabulary of the
  task from the vocabulary of the page. Without that it ranks all six catalog
  products identically and narrowing degenerates.
- **Aggregate-intent guard** — comparative and set-wide intents ("the
  *cheapest* product", "*how many*", "*all* items") suppress narrowing
  entirely: a superlative ranges over the whole collection, so pruning to the
  items matching its text destroys the answer. Six of the thirteen benchmark
  tasks are superlatives; all six correctly refuse to narrow.
- **Disclosure requirement** (§5.4) — a narrowed graph MUST carry a `selection`
  block stating how many resources of how many are shown. An agent that
  concludes "this catalog has one product" from a silently pruned graph was
  misinformed by its producer. Selection is explicitly *excluded* from the wire
  format: it is lossy, and only the party holding the intent can judge the loss.
- `--mode=compact` / `--mode=selected` in `benchmark/agent-bench.ts`, plus
  input-token and prompt-character accounting, so compression and dropped
  content can be attributed separately.

### Notes
- Fails open by construction: no content tokens, no discriminating match, an
  aggregate intent, or a collection below the size floor all return the full
  graph, and `reason` always names the branch. Page-level actions are never
  dropped — they are the way off a page whose narrowed view was wrong.
- 26 tests (197 total). Python port: canonical form unchanged and still at
  parity; compaction not yet ported.

## [impl 0.10.0] - August 2026 — API stability tier

Consumer-facing (reference implementation only; no spec vocabulary change).
Addresses Round-5 C9.

### Added
- **`STABILITY.md`** — every public export assigned a tier (**Stable** /
  **Beta** / **Experimental**), each tier a documented promise plus a deprecation
  process. Stable = extraction core / canonical graph / validation / safety
  primitives (Python-parity, unchanged since 0.3.x); Beta = the consumer runtime
  (`operate`, adapters, typed errors, content, WebMCP); Experimental = exports
  bound to unratified contracts (`registerWebMCPTools`, `observe`,
  `interpretExecution`). Ships in the published tarball; linked from the README.
- Documents two contracts that version independently of the package: the
  serialized graph (`GRAPH_FORMAT_VERSION`) and the CLI output format. States the
  path to 1.0. No code change — a promise about the surface that already exists.

## [0.4.x / impl 0.9.0] - August 2026 — freshness / optimistic concurrency

Addresses Round-5 C5 (the last correctness gap in the acting loop: stale-state
lost updates).

### Added
- **`data-agent-version`** on a resource — an opaque version/ETag token
  (§4.1, §5, ABNF). A mutating action on a versioned resource automatically
  sends it as `If-Match` (RFC 9110), so a write against a changed version gets
  `409 Conflict` instead of silently overwriting. Serialized in the canonical
  graph; TS + Python at byte parity.
- Closes the loop with the typed-error layer: `If-Match` → `409` →
  `conflict` (`requiresFreshState`) → `operate` re-reads and retries.
- `PageState.observedAt` (ISO) so a consumer's `decide` can reason about age.
- 5 tests (171 total); TS↔Python byte parity verified on a versioned page.

## [impl 0.8.0] - August 2026 — typed error surface

Consumer-facing (reference implementation only). Addresses Round-5 C6.

### Added
- **`AgentError`** `{ kind, retryable, message, status?, retryAfter?,
  requiresFreshState? }` and classifiers `classifyResponse` /
  `classifyNetworkError`. HTTP status → kind: validation / auth / forbidden /
  not-found / conflict / rate-limit / server / client; transport throw →
  network. Reads `Retry-After` (seconds or HTTP-date); 409 sets
  `requiresFreshState`.
- `executeTool` returns `error: AgentError` (was a string); `operate`'s
  `StepRecord` gains `errorInfo`. Recovery is now a rule (`retryable` +
  `idempotentHint`, re-read on `conflict`), not prose inference.
- 16 tests (166 total).

### Changed (pre-1.0, breaking)
- `ToolResult.error` is now `AgentError`, not `string`.

## [impl 0.7.0] - August 2026 — tool-format adapters

Consumer-facing (reference implementation only). Addresses Round-5 C7.

### Added
- **`toOpenAITools` / `toAnthropicTools` / `toMCPTools`**: the actions in the
  format each SDK already speaks. MCP keeps the safety hints as native tool
  annotations; OpenAI/Anthropic fold them into the description.
- **`executeTool(dom, name, args, opts)`**: run a model's tool call through the
  same fail-closed gates as `operate()` (cross-origin refusal, confirmation
  gate) — never sends a blocked or unconfirmed request. Returns
  `{ ok, refused?, result?, error? }`.
- Extraction/execution core factored into `runtime.ts`, shared by `operate()`
  and `executeTool()`. 8 tests (158 total); README SDK quickstart.

## [impl 0.6.0] - August 2026 — the agent runtime (`operate`)

Consumer-facing (reference implementation only; no spec vocabulary change).
Addresses the Round-5 review's central finding — "we ship a parser, the
consumer needs a driver, and the driver was buried in `test/`."

### Added
- **`operate()`**: the agent episode runtime — observe (graph + content +
  WebMCP tools) → decide → safety-gated execute → re-observe → loop, until the
  agent answers or `maxSteps`. **Model-agnostic** (`decide` injected) and
  **environment-agnostic** (`fetchPage`/`sendRequest`/`parse` injected).
- Two execution modes: `http` (server-side agent, endpoint via `sendRequest`)
  and `browser` (drives the real `form.requestSubmit()`).
- **Auth by construction:** the consumer's transport carries the user's
  session, so authenticated actions work without the spec defining auth.
- Fail-closed safety flows through the loop: confirmation gate (`onConfirm`),
  same-origin refusal, re-observation after each mutation. 7 tests (150 total).
- README consumer quickstart: web-operation in ~20 lines.

## [0.4.0 / impl 0.5.0] - August 2026 (Working Draft) — WebMCP binding

Phase 3 of the pivot: the interaction half, done *with* WebMCP, not against it.

### Added
- **WebMCP binding** (`webmcp-binding.md`): actions compile to WebMCP tool
  descriptors — JSON Schema inputs (from typehint/min/max/required), the
  standard MCP tool annotations (`readOnlyHint`/`destructiveHint`/
  `idempotentHint` + `humanConfirmationHint`/`costHint` derived from hints and
  the fail-closed rule), and a **binding that defaults to the real HTML control**
  (`form.requestSubmit()`), the endpoint only as fallback.
- Normative progressive-enhancement rule: removing annotations leaves a
  complete human workflow; an agent's invocation takes the same
  validation/auth/logic path as a human click.
- Reference: `toWebMCPTools` (pure) + `registerWebMCPTools` (live, binds to the
  DOM control, enforces the confirmation gate); CLI `--webmcp`.

## [0.4.0] - August 2026 (Working Draft) — the pivot begins

First step of the "own the content/state/grounding layer WebMCP lacks"
direction (see `docs/plans/2026-08-12-webmcp-and-content-layer.md`).

### Added
- **Content Observation Layer** (`content-observation.md`): a grounded,
  provenance-tagged reading of what a page *says* — title, authors, dates,
  publisher, section, keywords, word count, language, excerpt, and a
  nested-aware heading outline — **bridged from Schema.org JSON-LD /
  Microformats2 / Open Graph / semantic HTML with zero `data-agent-*`
  annotation**. Reference: `extractContent`; CLI `--content`.
- Every content value carries `{ value, source, selector }` so agents can
  cite and re-verify, and `derived` values are marked as lower-confidence.

## [0.3.1] - August 2026 (Working Draft)

Prompted by an independent external review (ChatGPT "Sol") that separated the
two operating models the draft had conflated, and found the reference safety
gates failing open.

### Added
- §3.3 Conformance Profiles: **Profile A (DOM Assistance)** vs **Profile B (Direct Execution)**, with stronger security obligations on Profile B (origin enforcement, fail-closed confirmation, idempotent retry, graph/DOM consistency)
- §3.2: fail-closed conformance rules — hints are advisory evidence not authority; the agent is the final risk authority; a state-mutating action with no explicit `risk="low"` MUST require confirmation

### Changed
- §2.2 **"Visible Truth" renamed to "Co-located Semantics"** — states honestly that operational contracts (endpoints, schemas, meta) are invisible but MUST stay consistent with the live interface, rather than claiming everything is visible
- §3.4 **"Annotations as Consent" reframed as an "Invitation Signal"** — a signal of intent, not proof of authorization (a plugin/theme/third-party script may emit it); legal permission rests on ownership and site terms
- Abstract repositioned: "HTML affordance markup for agents," explicitly **not** a complete agent protocol; complements Schema.org/Microformats2 (descriptive) and OpenAPI/MCP (full API)

### Security (spec §10 + reference implementation 0.3.2)
- **Trust is now monotonic and fail-closed** (§10.1): an inner `system`/`verified` can no longer escalate out of an outer `untrusted` region; unknown/misspelled trust values fail closed to `untrusted`; a `data-agent-meta` block inside an untrusted region is ignored. (Verified escalation bug reported by external review.)
- **Prototype-pollution guard**: nested parameter names containing `__proto__`/`prototype`/`constructor` are rejected (previously a crafted `data-agent-param` mutated `Object.prototype`)
- Clarified that `system` means *publisher-marked*, not *agent-trusted*
- CLI no longer claims "agents can operate this page" — reports graded structural conformance and states it checks structure only

### Fixed (reference implementation 0.3.2)
- `requiresConfirmation` now fails closed: `humanPreferred` and un-hinted mutating methods require confirmation (previously returned `false`)
- `prepareAction` enforces the same-origin policy (§12.5) — cross-origin endpoints without opt-out are returned `blocked: true` and must not be sent — and captures `data-agent-cross-origin`

## [0.3.0] - August 2026 (Working Draft)

### Added
- `data-agent-idempotent` — retry safety, distinct from reversibility (§6.9)
- `data-agent-cross-origin` + endpoint origin policy: same-origin MUST with explicit opt-out; no credentials cross-origin ever (§12.5)
- Repeated-property semantics: same-name properties collect into arrays, never overwrite (§5.2)
- Self-containment rule: property values must survive without surrounding prose (§5.2)
- Navigability rule: resources with canonical pages MUST declare a `url` property (§5.2)
- Design principle 2.11 Inspectable State: mutable resources SHOULD have annotated read surfaces
- Annotation announcement: `<meta name="agent-annotations">`, `X-Agent-Annotations` header, llms.txt (§9.5)
- **`graph-serialization.md`**: canonical JSON graph format + server-side delivery (content negotiation `application/agent+json`, `/.well-known/agent-graph`)
- `verified` trust semantics defined (reserved, parse-as-system); aggregates-over-untrusted-regions pattern (§10.1)
- Reference implementation 0.3.0: canonical serializer, structural validator, repeated properties, idempotency

- Annotations as Consent (§3.3): publishing annotations is a machine-readable permission grant for conforming agents, bounded by the declared constraints — the robots.txt of actions
- Prior-art positioning (§B.1): honest comparison with schema.org `potentialAction`, incl. one-way export path (data-agent → JSON-LD)

### Fixed
- `data-agent-cost-currency` and `data-agent-meta` registered in §4.1 and the ABNF (previously used but unregistered)

### Context
- Every addition traces to a measured failure or recovery pattern in the benchmark suite (`benchmark/experiment-log.md`)

## [0.2.0] - February 2026

### Added
- New attributes: `data-agent-on-success`, `data-agent-response`, `data-agent-min`, `data-agent-max`
- Spec sections: 6.7 Response Schema, 6.8 Success Outcome Hints, 7.4 Validation Constraints
- Section 9.2: Extended `data-agent-meta` with workflow graph, actions summary, responseSchemas
- `errorFormat` in `agent_policies` for common error shape
- `related` field in meta for linking to llms.txt and other discovery layers
- Demo: `cartItemId` returned in add_to_cart API response
- Demo: `/llms.txt` site-level discovery file
- `AGENTS.md` repo-level coding agent instructions
- AGENTS.md and llms.txt referenced in spec Section 1.5 and Appendix B

### Fixed
- Broken internal links in README.md, CONTRIBUTING.md, proposals.md
- Spec example title: CompassAI → IKANGAI

## [0.1.0] - January 2026

### Added
- Initial public draft