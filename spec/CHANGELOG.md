# Changelog

All notable changes to the Agentic Microformats specification.

## [0.3.0] - August 2026 (Working Draft)

### Added
- `data-agent-idempotent` — retry safety, distinct from reversibility (§6.9)
- `data-agent-cross-origin` + endpoint origin policy: same-origin MUST with explicit opt-out; no credentials cross-origin ever (§12.5)
- Repeated-property semantics: same-name properties collect into arrays, never overwrite (§5.2)
- Self-containment rule: property values must survive without surrounding prose (§5.2)
- Navigability rule: resources with canonical pages MUST declare a `url` property (§5.2)
- Design principle 2.11 Inspectable State: mutable resources SHOULD have annotated read surfaces
- Annotation announcement: `<meta name="agent-annotations">`, `X-Agent-Annotations` header, llms.txt (§9.6)
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