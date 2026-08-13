# Go-to-Market Scorecard — Agentic Microformats

**Date:** 2026-08-13 · point-in-time read, grounded in what's built and measured.

A scored read across the six dimensions a generic GTM audit uses — but treating
this as what it is: a **two-sided open standard**, not a SaaS with a funnel.
Where a dimension doesn't map cleanly to a standard, that's called out rather
than forced.

| Dimension | Score | One-line verdict |
|-----------|:-----:|------------------|
| Positioning | **8/10** | Sharp and defensible; the name and hero line undersell it |
| Proof | **8/10** | Unusually rigorous for the stage; all of it on pages you own |
| Activation | **4/10** | Site-owner onboarding is great; the *consumer* (agent authors) has nothing |
| Launch | **3/10** | Never happened — all the proof sits unwitnessed |
| Reach | **2/10** | The gating weakness: a repo, a package, one site you own |
| Loops | **2/10** | No flywheel spinning; the two-sided cold-start is unbroken |

**Headline:** the *build* scores ~8/10, the *go-to-market* ~3/10. This is the
classic "great product, no distribution" shape — and it's the exact profile
our own agent-perspective review (Rounds 3–4) reached independently. The whole
chain is bottlenecked upstream at **Reach**; fixing activation or loops first
would be pushing on a rope.

---

## 1. Positioning — 8/10

**Strong.** The most-worked dimension. "HTML affordance markup for agents," the
explicit "*not* a complete agent protocol," co-located-semantics,
invitation-not-consent, and the "own the layer WebMCP lacks" thesis are sharp,
honest, and differentiated. You can say in one breath why it exists next to
Schema.org, MCP/WebMCP, and OpenAPI.

**Gap.** The positioning lives in the spec and review docs, not in a five-second
hero an agent engineer grasps on landing. And the *name* is positioning debt:
"Agentic Microformats" pattern-matches to "another descriptive-metadata
vocabulary," which is the one thing it isn't — it's an affordance/action +
content-grounding layer.

**Cost.** Engineers who would adopt it bounce at the name before reaching the
WebMCP-complement insight.

**Plays.** (a) One hero sentence, front and center: *"The inspectable content-
and-affordance layer for browser agents — reads any page's meaning and compiles
its actions into WebMCP tools, from existing HTML."* (b) Add a reframing tagline
even if you keep the name. (c) Now that the binding adapter ships, lead with the
WebMCP-complement framing, not the vocabulary.

## 2. Proof — 8/10

**Strong.** Rare rigor for a working draft: TS + Python reference impls at
parity, 143 tests, published packages, a benchmark that scores action success
by **server state** across model tiers, content-bench at 100% recall/citation
accuracy, a **live production deployment** (ikangai.com), model-portability
shown on a local open-weights model, and honest *negative* results (reading is
saturated; annotations don't help there).

**Gap.** Every benchmark runs on pages you built or own. Zero independent
validation, zero external adopter. "It works" is proven; "others use it" is not.

**Cost.** A standards reviewer or framework author can't point to anyone else.

**Plays.** (a) One third-party site, annotated by its owner, with the episode
suite run against it — the one piece of evidence you can't simulate. (b) Surface
the Gemma/local-model result loudly; model-portability is a strong, underused
proof point. (c) Publish the benchmark numbers as a results page, not only the
experiment log.

## 3. Activation — 4/10

**Split by audience.** Site-owner activation is genuinely good — the 30-minute
adopt guide plus the `npx agentic-microformats <url>` verify loop works (proven
live on ikangai). But the **agent/framework author — the actual market-maker —
has nothing to onboard against**: no "add web-operation to your agent in 20
lines," no consumer SDK quickstart. (This is Round 3's D1, still open.)

**Cost.** Even a framework author who heard about it and believed it would hit a
dead end with no integration path.

**Plays.** (a) Write the consumer quickstart: `extractContent` + `toWebMCPTools`
→ a working page-operating agent in ~20 lines. (b) Ship a copy-paste example
agent. (c) The `npx --content` CLI is perfect for the *curious evaluator*; it is
not activation for the *integrating engineer* — build the latter.

## 4. Launch — 3/10

**Never happened.** The (now data-grounded) blog post is drafted but unpublished;
no announcement, no Show HN, no CG submission. The work has been heads-down. The
README is a good front door but no *moment* concentrated attention.

**Cost.** All the Positioning and Proof sit unwitnessed. A standard with no
launch is invisible regardless of quality.

**Plays.** (a) Publish the blog post. (b) Sequence one real launch week: blog +
Show HN + the CLI demo + the WebMCP CG post. (c) Lead the launch with the
demoable hook — *"point `npx agentic-microformats <url> --content` at any
article and watch an agent read the page."*

## 5. Reach — 2/10

**The gating weakness**, and we've said so before (the "demand side doesn't
exist" round). Distribution is a public repo, an npm package, and one live site
you own. The only external reach event so far is a cold sales bot. For a
*standard*, "reach" means the standards community and framework authors — not ad
channels — and that surface is untouched.

**Cost.** Zero adoption pull. The two-sided market can't start because neither
side knows it exists.

**Plays (highest-leverage in the whole scorecard).** (a) **The WebMCP Community
Group** — it puts you directly in front of the demand-side actors
(Google/Microsoft/Chrome agent people), and you now arrive with a concrete
contribution (content/grounding layer + declarative-form binding), not a pitch.
(b) A dev-forum launch built on the `npx` one-liner. (c) The AEO ("agent engine
optimization") article — the pitch that pulls *site owners*.

## 6. Loops — 2/10

**No flywheel yet** — the structural crux. The loop that *could* exist: site
annotates → agents operate it cheaper/better (proven: ~5× cheaper, fewer
failures) → agent-mediated traffic prefers it → more sites annotate. It can't
spin until there's demand-side reading. There is no network effect or data loop
active today.

**Cost.** Adoption stays linear and manual — every site is a hand-sell forever.

**Plays.** (a) Break the cold-start at a beachhead that owns *both* sides —
ikangai owns the site *and* builds agents; spin the loop on one property,
measure it, then externalize (Round 3's D3). (b) Seed the AEO flywheel
narrative. (c) The deterministic canonical graph as a **training corpus** is the
long loop — get "look for the agent graph" into a model's browsing prior and
every agent reads it for free (D5).

---

## The read, in one paragraph

You have built the top of the barbell — Positioning and Proof — to a level most
funded products never reach, and left the bottom — Reach and Loops — unstarted.
That is not a product problem; it is a distribution problem, and it is
*upstream*: until agents can be reached and a loop can spin, better activation
and a slicker launch have nothing to compound. The one move that unlocks the
rest is **Reach via the WebMCP Community Group**, because it simultaneously
addresses the demand side (the actors who make agents read the vocabulary) and
gives the loop its missing second side.

## Top 3 moves, sequenced

1. **Take the content-observation + WebMCP-binding proposal to the WebMCP CG.**
   Reach + Loops, highest leverage, only-you-can-do-it. You arrive with shipped
   code, not slides.
2. **Launch week:** publish the grounded blog post + Show HN + the `npx --content`
   demo, same window. Converts Proof into witnessed Proof.
3. **Write the consumer (agent-author) quickstart** and land one *third-party*
   annotated site. Closes the Activation dead-end and the last Proof gap
   (independent validation) at once.

## Where a generic audit would mislead

A SaaS-shaped audit would likely flag *pricing*, *funnel/activation*, and
*retention* as the fixes. For a two-sided open standard those are second-order:
there is no price (it's open), activation is two-sided (the site-owner side is
already good), and retention is a loop that can't start before Reach. The real
lever — a standards-body reach move — is exactly the thing a generic tool does
not know to recommend.
