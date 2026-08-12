# Direction: WebMCP relationship + the content/grounding layer (toward 0.4)

**Date:** 2026-08-12
**Status:** direction for a product decision, not a committed design. Triggered
by an independent external review (Sol) that surfaced WebMCP and a set of
verified defects. Companion to `docs/agent-perspective-review.md` Round 4.

## The decision to make

WebMCP (W3C CG draft; Google + Microsoft; Chrome experimentation) now occupies
the browser-mediated **interaction** space that our action layer was growing
into. The product fork:

- **(A) Compete** — keep extending `data-agent-*` into a full HTTP action
  protocol. *Not recommended:* duplicates WebMCP, loses the progressive-
  enhancement property, and fights the actors who own agent demand.
- **(B) Reposition** — become the **inspectable content / entity / state /
  provenance / grounding layer** that WebMCP lacks: zero-JS, server-renderable,
  the observation an agent reads *before and after* it acts. Bind actions to
  the real HTML control (and optionally compile to WebMCP), not to a shadow
  endpoint. *Recommended.*

Everything below assumes (B). It is a genuine scope change and the reason this
is a plan, not a patch.

## Guardrail: the progressive-enhancement rule (make normative first)

> Removing all annotations MUST leave a complete, accessible human workflow;
> an agent invoking an annotated action MUST pass through the same validation,
> authorization, and application logic as the human using the control.

Adopting this rule is the cheapest, highest-signal step — it reframes the
action layer as a *binding to the control* and immediately explains why
`data-agent-endpoint` is demoted to an optional profile.

## Phase 0 — already shipped (0.3.2, this review cycle)

- Fail-closed safety: `requiresConfirmation` (human-preferred + un-hinted
  mutating), same-origin enforcement in `prepareAction` (`blocked`).
- Two conformance profiles (§3.3); hints are advisory, agent owns risk.
- "Visible Truth" → "Co-located Semantics"; "Consent" → "Invitation Signal".
- **Security:** monotonic fail-closed trust, meta trust-boundary,
  prototype-pollution guard; honest graded CLI output.

## Phase 1 — correctness the pivot depends on

1. **Live form state (browser binding).** `AgentDOM` in a real browser MUST
   read live DOM properties / `new FormData(form, submitter)`, not just
   `value`/`checked`/`selected` attributes. Default action binding =
   `form.requestSubmit(submitter)`, preserving validation, submit events, and
   the submitter's semantics. `data-agent-endpoint` → optional HTTP binding
   profile.
2. **Provenance replaces bare trust.** Two orthogonal axes: *data provenance*
   (publisher / user / third-party / quotation / generated) and *instruction
   authority* (default none). Untrusted content is **quarantined but readable**
   through an isolated, non-instructional path — stop erasing reviews/comments.
3. **Value status + coverage.** Distinguish absent / unknown / withheld /
   unloaded / inapplicable; add a document-level `coverage` (complete /
   partial / first-page / virtualized / paywalled).

## Phase 2 — the content-reading profile (the new core value)

**Status: core delivered (0.4.0).** `extractContent` + `spec/content-observation.md`
+ CLI `--content` bridge JSON-LD / Microformats2 / Open Graph / semantic HTML
into a grounded, provenance-tagged observation with a section outline — no new
annotation. Demonstrated live: the ikangai MCP article (81 KB, previously "0
resources, 1 nav link" to the action graph) now yields title, authors,
published/modified dates, publisher, 6 categories, keywords, 1202-word count,
and a 7-section outline. Remaining in this phase: full Web Annotation
TextQuote/TextPosition grounding (items 6), per-section body text across
arbitrary nesting, value-status/coverage (item 3), and Python parity for the
content module.

4. **Observation envelope** on every graph: `sourceURL`, `canonicalURL`,
   `baseURL`, `observedAt`, `etag`, `language`, `direction`, `locale`,
   `authScope`, `variant`, `coverage`. Per-value language/direction where it
   differs from the page.
5. **Document structure**, derived (do NOT require manual per-paragraph
   annotation) from semantic HTML + Microformats2 + Schema.org + RSS + ARIA:
   title, summary, author, publisher, dates, license, canonical; sections with
   stable IDs and heading paths; lists/quotes/code/tables/figures; citations;
   pagination/truncation/paywall state. **Bridge existing formats** — on
   IKANGAI the classic `hentry` markup already carries title/date/author/body
   that the graph currently discards.
6. **Grounding.** Every value keeps a source pointer using W3C Web Annotation
   selectors (TextQuote / TextPosition / CSS) + PROV-O attribution; lets agents
   cite exact passages, verify normalized values, and detect stale extractions.

## Phase 3 — interaction done right (with, not against, WebMCP)

7. **Action = {operation, resource, input controls, effects, binding,
   outcome}.** Binding is the HTML control / form / WebMCP tool. Provide an
   adapter: annotations → native form affordance → WebMCP tool → compact
   observation graph.
8. **Effect declarations** replace the single `risk` scalar: read-only /
   creates-or-changes / sends-external / spends-money / deletes / discloses-PII
   / reversible(how,until) / idempotent / requires-fresh-version. These are
   **publisher assertions** (rename hints accordingly) — they may raise the
   agent's caution, never lower it.
9. **Reversibility as a contract:** compensating action, deadline, cost,
   completeness, irreversible side effects already produced.
10. **Confirmation binding + concurrency:** confirmation binds to exact
    target/params/price/recipients/data/version/expiry; execution uses
    `If-Match` / quote-ID / one-time token (RFC 9110). Add state versions,
    action lifecycle (prepared→awaiting→running→cancelled→committed),
    `AbortSignal`, "human is editing" detection, conflict pause.

## Phase 4 — measurement and prior-art alignment

11. **Replace binary "valid" with a conformance ladder:** syntactically valid
    → content-readable → navigable → action-discoverable → safe-to-act →
    recovery-capable → complete-for-scope. (CLI already stopped over-claiming;
    formalize the ladder.)
12. **Benchmark on independent, hostile pages** for: content recall + citation
    accuracy, action success, unsafe-action rate, data disclosed, stale-state
    conflicts, human interventions, recovery correctness. Test shadow DOM,
    iframes, SPAs, virtualized lists, CSS-hidden content, files, custom
    controls, multiple tabs, multilingual pages.
13. **Map the information model to prior art** rather than rediscovering it:
    WoT Thing Description (affordances, `safe`/`idempotent`, security defs),
    Web Annotation + PROV-O (grounding), JSON Schema (I/O), HTTP conditional
    requests (concurrency).

## Phase 5 — go to the standards table

14. Take the **narrow** proposal — the inspectable content/state/grounding
    observation layer — to the WebMCP community as the zero-JS, server-
    renderable complement to their tools. Collaboration with the actors who
    own agent demand beats bootstrapping a parallel ecosystem.

## Sequencing note

Phase 1 is correctness and unblocks trust in everything after it. Phase 2 is
the new reason-to-exist and is mostly a *bridging* effort (reuse Microformats2/
Schema.org/ARIA), not new vocabulary. Do not add more `data-agent-*` action
surface until the WebMCP relationship (the Phase-0 rule + Phase-3 binding
model) is decided — extending the custom action protocol now is throwing good
work after the losing fork.
