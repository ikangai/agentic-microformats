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

---

# Round 2 (2026-08-10): the blindspots that survived two reviews

Everything above was mechanics, and 0.3.0 closed most of it. What follows
is what neither review touched — the assumptions *behind* the work.

### R1. Prior art the spec never argues against: `schema.org/potentialAction`
Appendix A.2 maps three type names; it never mentions that schema.org has
declared *actions* since 2014 — `potentialAction`, `EntryPoint`,
`httpMethod`, `urlTemplate` — with search-engine-scale deployment. That is
the first question any standards reviewer or agent vendor will ask: *why
not extend potentialAction?* There are good answers (visible-element
binding vs. hidden JSON-LD, trust regions, interaction hints, inspectable
state, the canonical live graph) — but they exist only implicitly. Write
the comparison section before someone else writes it as a rejection.

### R2. No IP or venue story — MIT covers copyright, not patents
Zero occurrences of "patent", "W3C", "WICG", or "IANA" in the repo. Agent
vendors' lawyers will not adopt a one-author spec without a patent
non-assert story (W3C CG contributor agreements exist precisely for this).
Separately, `application/agent+json` and `/.well-known/agent-graph` are
squattable namespaces with real registries (IANA media types; RFC 8615
well-known URIs). Venue, IP commitments, and registrations are what turn
"a repo" into "a standard someone may bet a product on."

### R3. The economics run one-way: sites do the work, agents get the value
Serving the graph bypasses the site's entire monetization funnel —
analytics, ads, upsell placement all vanish when agents skip HTML. The
spec currently offers the annotating site *nothing back*: no agent
identification convention, no attribution/conversion story for agent
traffic, no way to make agent-mediated sales measurable. Until annotating
is visibly good for the site's P&L, adoption depends on altruism.
Candidate work: an agent-identity request header convention plus a
conversion-attribution note — boring, and probably decisive.

### R4. Truthful-but-selective annotation is the real adversary
The reviews treated *lying* annotations as the threat. The likelier norm
is *strategic omission* — technically true graphs that skip shipping
costs, bury unfavorable variants, or annotate only flattering facts.
SEO is the precedent. No validator can catch material omission; the
countermeasure is spot-auditing (agents occasionally diff graph vs.
rendered page and penalize divergence) — which reintroduces HTML reading
and partially unwinds the cost story. The "Visible Truth" principle needs
an enforcement economics section, not just an ideal.

### R5. Every benchmark task was designed by the same agent that fixed the failures
The evaluation designer, the strategy optimizer, and the implementation
fixer were one context. The suite therefore measures what its designer
could imagine — crisp, well-specified goals. Two consequences: (a) an
independent red team (different vendor, no repo context) should author the
next episode suite; (b) nothing tests the *first mile* — fuzzy human
intent ("I need a cheap charger before Friday") down to a plan — which is
where agent products actually struggle. The spec optimizes the last mile.

### R6. The benchmark is now public — and therefore expiring
Tasks, pages, and expected answers ship in a public repo and will end up
in training corpora. Scores against future models become unfalsifiable.
Standard fix: a held-out private task set, or continuous task rotation
with published *generators* instead of published *instances*.

### R7. The spec's most underrated feature may be legal, not technical
Annotations are a machine-readable *invitation*: "automation is welcome
here, within these declared bounds" — a robots.txt for actions. In the
current bot-litigation climate, that consent semantics could be the
strongest adoption argument for agent vendors (and for cautious sites, the
strongest reason to annotate precisely). Nothing in the spec states it.
One normative paragraph — "annotations constitute permission for
conforming agents to perform declared actions" — might matter more than
any attribute added this month.

*(Still open from Round 1, acknowledged, not forgotten: CI for the repo
itself, PyPI upload, wild-web evidence, and the 0.4 functional contracts.)*

---

# Round 3 (2026-08-11): the demand side doesn't exist yet

Written the day after the first real deployment. ikangai.com is now perfectly
annotated — 7 resources, 1 action, valid. And **not one agent in the world
will read it.** Rounds 1–2 were about the supply side (make sites
annotate-able). Standing on a live annotated page, the missing half is
obvious: this is a two-sided market and we have built only one side.

### D1. "Attractive for agents" is a category error — name the real buyer
Agents have no preferences; the people shipping them do. The phrase
decomposes into three unrelated pitches, and we have been writing none of
them on purpose:
- **Agent-framework authors** (browser-use, LangChain, the coding-agent
  harnesses): would they add a `data-agent-*` parser? Pitch: zero-config
  site operation, one integration covers every model. This is the closest,
  most winnable buyer and we have no outreach aimed at them.
- **Foundation-model labs**: would they post-train a model to look for the
  vocabulary? (See D5.) Pitch: cheaper, more reliable browsing for every
  downstream agent.
- **End users**: never see it; it's infrastructure.
Everything in the repo is aimed at the *site owner*. The consumer of the
annotations — the actual "agent" in "attractive for agents" — has no
document addressed to it, no SDK quickstart, no "add web-operation to your
agent in 20 lines." Supply has a 30-minute guide; demand has nothing.

### D2. The competitor for agent-builder attention is MCP, not schema.org
Round 2 spent its prior-art energy on schema.org. Wrong opponent. In
2025–26 an agent builder asking "how do I let my agent use this website"
reaches for an **MCP server**, full stop — that is where the mindshare and
tooling are. The spec mentions MCP only as an *export target* (§A.1:
"actions can be exposed as MCP tools"), which quietly concedes MCP is the
real interface and this is a markup format feeding it. The honest, strong
positioning is the opposite and unmade: **MCP requires the site to build
and host a server; Agentic Microformats requires nothing but attributes on
HTML you already serve.** Zero-integration vs. build-a-server, for the long
tail of sites that will never staff an MCP server. That comparison section
matters more than the schema.org one and does not exist.

### D3. Two-sided cold-start — pick a beachhead that owns both sides
Sites won't annotate until agents read; agents won't read until sites
annotate. You don't clear this by growing both evenly — you find one actor
who **controls supply and demand at once** and gets value from a single
site. Candidates: a marketplace that annotates its own listings for its own
shopping agent; a SaaS that annotates its app for its own official agent; a
docs site plus its own "ask-the-docs" agent. ikangai.com is exactly this
shape — IKANGAI owns the site *and* builds agents — which makes it the
correct first beachhead, not merely a dogfood. The strategy doc should name
the pattern: **ship both halves for one property, measure the loop, then
externalize.** Growing the open web first is the losing order.

### D4. The flywheel we can start today: Agent Engine Optimization (AEO)
The benchmark already proved annotated pages cost an agent less (tokens,
latency) and fail less. Turn that into the demand-generating pitch nobody
has written: **annotated sites win agent-mediated transactions.** When an
agent choosing between two vendors can operate site A cheaply and reliably
and must scrape site B, it will prefer A — and as agent-mediated commerce
grows, that preference is money. "SEO for agents" is a pitch a marketing
team funds *immediately*, and it pulls supply without waiting for altruism.
The missing artifact: a measured head-to-head — same task, annotated
vendor vs. unannotated vendor, which one the agent completes — turning the
cost delta into a revenue argument.

### D5. The highest-leverage distribution is the model, not the spec
If one frontier model were post-trained to natively check for `data-agent-*`
when browsing, every agent built on it inherits the behavior for free — the
demand side appears overnight without convincing a single framework author.
That reframes the whole project: the spec's real product may be a **public
training corpus** — thousands of consistently-annotated pages plus documented
expected behavior — designed to make "look for the agent graph" a cheap,
natural browsing prior for the next model generation. We have the generator
(annotator + demo + now a live site); we've never framed the corpus as the
deliverable, or asked what volume/consistency a lab would need to justify
including it.

### D6. The consuming agent has no liability shield — and that's what it buys
Round 2's consent framing (§3.3) protects the *site*. It does nothing for
the *agent vendor*, who is the one exposing users to "the annotation said
POST here." An agent builder's actual adoption blocker is their own
liability: what stops a malicious annotation from making their agent do
harm on their user's behalf? The safety hints, same-origin policy, and
`human-preferred` are the raw material, but there is no **"conforming agent"
profile** an agent vendor can implement and point to as due diligence — a
named, testable behavior set (refuse cross-origin, confirm high-risk, never
exceed declared rate limits, treat untrusted regions as hostile). That
profile, plus the validator as its site-side mirror, is what converts "nice
idea" into "safe for us to ship." It is the single most important artifact
for the demand side and it isn't written.

### D7. An annotated web is undiscoverable
There is no way for an agent to learn a site is annotated except by
fetching it and finding out — exactly what ikangai.com looked like the
moment before it wasn't empty. robots.txt has sitemaps; search engines
crawl them. Annotated sites point nowhere and are pointed to by nothing. At
minimum the ecosystem needs a convention for *advertising* annotation
coverage that something can aggregate — a well-known index, a sitemap
extension, a registry agents can consult — or every agent pays the
discovery tax per-URL forever and the rational agent behavior is to never
bother checking.

**The through-line:** we have spent the project making the web *legible*
to agents and almost none of it making agents *want to read* — because the
buyer was never named. The next phase is demand-side: a consumer quickstart
(D1), the MCP positioning (D2), a both-sides beachhead measured end to end
(D3), the AEO head-to-head (D4), a conformance profile for agent vendors
(D6). The corpus-for-training bet (D5) is the swing-for-the-fences.
