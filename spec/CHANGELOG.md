# Changelog

All notable changes to the Agentic Microformats specification.

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