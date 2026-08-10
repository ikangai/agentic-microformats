# An Agent Reviews Agentic Microformats

**Date:** August 2026
**Standpoint:** this review was written by an AI agent that spent a week
operating the spec, not reading it: ~200 model calls across three benchmark
arms, 13 live episodes against the demo store at three model tiers plus a
local open-weights model, fault-injected recovery runs, and two
extraction-pipeline iterations. Every claim below links to something that
actually happened in `benchmark/experiment-log.md`.

Companion to `critical-analysis.md` (a production-readiness review of the
*functional* surface, v0.1.0). This one asks a different question: **what
would make an agent — and the people who ship agents — choose this?**

---

## What already works (and should be advertised harder)

1. **The extraction graph is the product.** A deterministic parse in
   milliseconds, zero tokens, ~1/3 of the HTML's bytes — and it is
   *sufficient to operate a site*: nested checkout, response chaining, and
   five fault-recovery patterns all completed from the graph alone, by a
   frontier model, a small model, and a laptop-hosted open-weights model
   alike (12/13 each; $2.62 / $0.47 / $0.00).
2. **Declared contracts remove the scariest part of acting.** `method` +
   `endpoint` + `params` with `min`/`max` + `data-agent-response` meant no
   agent in any run ever guessed a request shape. The `cartItemId` chain
   (response schema → next action) worked for every model tested.
3. **Machine-readable state is what makes errors survivable.** When a
   response was dropped after the mutation landed, every agent recovered —
   because `/cart` is annotated. Small models blind-retried, read the cart,
   and repaired; the frontier model verified first. No state surface, no
   recovery. This is the spec's strongest safety argument and it is
   currently implicit.
4. **`data-agent-on-success` quietly steers behavior.** "Reload /cart to
   see updated cart" visibly routed agents to the right verification page.
   Cheap, effective, underused.
5. **The trust model does its job.** Graph-only agents genuinely cannot be
   prompt-injected by review content they never receive.

---

## What needs work — ranked by what unblocks adoption

### 1. Agents can't install it
The reference parser is unpublished (`agentic-microformats` is a 404 on
npm), and there is no Python port — while most agent frameworks are
Python-first. An agent vendor evaluating this spec today has to vendor the
TypeScript source. **Fix:** publish the npm package (the `prepublishOnly`
guard is in place), then a small Python `extract()` with the same canonical
output. Nothing else on this list matters if integration starts with
copy-paste.

> **Resolved 2026-08-10:** `agentic-microformats@0.3.0` is live on npm;
> the stdlib-only Python port ships in `packages/agentic-microformats-py`
> with exact golden-parity against the TS reference (PyPI upload pending).
> Items 2–9 shipped in spec 0.3.0 the same day; item 10's validator exists,
> its signing mechanism and item 11 are scoped in
> `docs/plans/2026-08-10-v0.4-roadmap.md`.

### 2. The graph has no standard serialization — and no server-side delivery
`extract-pipeline.ts` had to invent a JSON shape for the graph. If two
consumers invent two shapes, the ecosystem forks at birth. And since
extraction is deterministic, sites could serve the graph themselves —
letting agents skip the +54 % annotated-page weight entirely. **Fix:**
specify the canonical JSON serialization of the extraction result, and an
optional delivery channel (`.well-known/agent-graph`, or content
negotiation via `Accept: application/agent+json`). This turns "annotations
bloat my page" into "agents never fetch my page."

### 3. There is no cheap way to know a site is annotated
An agent at a random URL must download and parse the full page to discover
there is nothing there. At crawl scale that is disqualifying. **Fix:** a
detection signal that costs one header or one line — `<meta
name="agent-annotations" content="0.2">`, an HTTP response header, and/or a
required key in `llms.txt`.

### 4. Navigability is not guaranteed
A plain `<a href>` is invisible to the graph. Our own catalog shipped
without annotated detail links, and a graph-only agent guessed a URL,
404-looked, and failed the task. Fixed in the demo; not fixed in the spec.
**Fix:** normative rule — a resource with a canonical page MUST carry a
`url` property. A graph you cannot traverse is a brochure, not an
interface.

### 5. Repeated properties silently lose data
Properties are name-keyed; a release with two `deprecation` props keeps
only the last one after extraction. The spec is silent; the failure is
invisible. **Fix:** define repeated-property semantics (repeated names
collect into arrays), and make the reference implementation honor it.

### 6. Annotations must survive without their prose
`requires: "SDK >= 4.2.0"` extracted cleanly and was still useless — the
graph never said *what* required it, and an honest agent answered "not
found." **Fix:** a normative self-containment rule: an annotation's value
must be interpretable without the surrounding text. (Our fix —
`"streaming exports: SDK >= 4.2.0"` — took both benchmark tiers from 12/15
to 15/15 in one iteration.)

### 7. Retry safety is undeclared
`data-agent-reversible` exists; *idempotent* does not — and they are
different questions. After a lost response, an agent needs to know: is
re-sending this safe? Today it must guess or inspect state. **Fix:**
`data-agent-idempotent="true|false"` on actions, plus a hint when the
endpoint honors `Idempotency-Key`. This converts the hardest recovery case
into a lookup.

### 8. State surfaces should be mandatory, not lucky
Recovery worked because the cart page happened to be annotated. **Fix:**
elevate to a principle: every mutable resource an action touches SHOULD
have an annotated read surface, and the action's `on-success` SHOULD point
at it. Sites that skip this are opting their users' agents out of error
recovery.

### 9. The trust boundary needs a release valve
Untrusted regions are rightly invisible to graph agents — but that made
"how many reviews are there?" unanswerable, while `rating_count` (a
site-authored fact *about* untrusted content) sat right there. **Fix:**
bless the pattern: system-authored aggregates (`review_count`,
`average_rating`) as first-class properties describing untrusted regions,
so graph agents see the summary without the injection surface.

### 10. Verification, or the graph can lie
Everything above assumes honest annotations. An agent acting on
`data-agent-endpoint` inherits session cookies (§6.5) with no origin
constraint, `trust` is self-asserted, and `verified` has no semantics. The
first publicized annotation-spoofing incident will freeze vendor adoption.
**Fix (minimum):** same-origin default for endpoints with explicit opt-out,
defined `verified` semantics, and a conformance validator so vendors can at
least check structural honesty. (Overlaps `critical-analysis.md` §4 — still
the largest open risk.)

### 11. Still missing from the functional surface
The `critical-analysis.md` P0 list stands: async operations, a real error
taxonomy (beyond one `errorFormat` shape), state-change notification.
The E-suite showed agents can *cope* via polling annotated pages; coping
is not a contract.

---

## What would make it *attractive*, not just correct

- **Lead with the measured pitch, per audience.** To site owners: agents
  can use your site at a third of the tokens, with models 5× cheaper —
  or free and local. To agent vendors: a zero-token parser and evidence
  that one integration covers every model tier. The numbers exist
  (`experiment-log.md`); put them in the README's first screen.
- **Wild-web proof.** Every result so far is on a store this repo built.
  One real, third-party annotated site — with the same episode suite run
  against it — is worth more than everything measured on AgentShop.
- **A conformance badge.** Vendors act on annotations only if they can
  trust them; sites annotate only if someone consumes it. A validator +
  "agent-ready" badge is the cheapest known way to bootstrap both sides.
- **Make the benchmark the marketing.** This repo's harness is, as far as
  we know, the only one that scores annotation value by *server state*
  across model tiers. Inviting other specs (or plain-HTML baselines) to
  run it reframes the conversation from "another microformat" to "the
  measured cost of the web having no API for agents."

---

*Reviewed from inside: the reviewer completed every episode described
above, failed the ones marked as failures, and wrote this without being
able to see your reviews section — which, for the record, is exactly how
it should be.*
