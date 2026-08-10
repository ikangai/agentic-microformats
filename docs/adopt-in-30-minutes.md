# Annotate your site in 30 minutes

This is the shortest honest path from "interesting" to "an agent just
operated my site." No new infrastructure, no API to build, no separate
agent mode — you add attributes to HTML you already serve.

**What you get for it (measured, not promised):** any agent — frontier,
small, or free-and-local — can find your resources, call your actions with
the right parameters, recover from failed requests, and stop at anything
you mark as needing a human. Full benchmark data lives in
[`benchmark/experiment-log.md`](../benchmark/experiment-log.md).

## Minute 0–2: announce

Add to your page `<head>` (and, if you can, an HTTP header):

```html
<meta name="agent-annotations" content="0.3">
```

```
X-Agent-Annotations: 0.3
```

## Minute 2–10: annotate one resource

Pick the page type that matters most (a product, an article, a listing) and
annotate its container, its key facts, and — critically — its **canonical
URL** (without it, agents cannot navigate your site from the graph):

```html
<article data-agent="resource" data-agent-type="product" data-agent-id="SKU-12345">
  <a href="/product/SKU-12345"
     data-agent-prop="url" data-agent-typehint="url"
     data-agent-value="/product/SKU-12345">
    <h2 data-agent-prop="name">USB-C Cable 2m</h2>
  </a>
  <span data-agent-prop="price"
        data-agent-typehint="currency" data-agent-currency="EUR">14.99</span>
  <span data-agent-prop="availability">in_stock</span>
</article>
```

Two rules that save you pain later: values must make sense **without the
surrounding text** (write `"streaming exports: SDK >= 4.2.0"`, not
`"SDK >= 4.2.0"`), and if a fact repeats, repeat the property — extractors
collect all occurrences.

## Minute 10–18: annotate one action

Declare what the button actually does — endpoint, method, parameters with
their real constraints, and whether a blind retry is safe:

```html
<form data-agent="action"
      data-agent-name="add_to_cart"
      data-agent-method="POST"
      data-agent-endpoint="/api/cart/add"
      data-agent-idempotent="false"
      data-agent-risk="low"
      data-agent-response='{"success":"boolean","cartItemId":"string"}'
      data-agent-on-success="Item added. Reload /cart to see the cart.">
  <input data-agent-param="quantity" data-agent-typehint="integer"
         data-agent-min="1" data-agent-max="10" type="number" value="1">
  <button type="submit">Add to cart</button>
</form>
```

Anything consequential gets `data-agent-risk="high"` and
`data-agent-human-preferred="true"` — conforming agents will stop and ask.
Endpoints must be same-origin relative paths (spec §12.5).

**Know what this declares:** per spec §3.3, annotations are machine-readable
consent — you're inviting conforming agents to use exactly these actions
within exactly these constraints, and nothing else. That boundary is the
point: it's `robots.txt` for actions.

## Minute 18–22: fence off user content

Anything user-generated gets a trust boundary — agents will skip
annotations inside it entirely (this is your prompt-injection defense):

```html
<section class="reviews" data-agent-trust="untrusted"> … </section>
```

If agents should still know the summary, expose site-authored aggregates
outside the fence: `data-agent-prop="review_count"`, `"average_rating"`.

## Minute 22–25: check your work

```bash
npx agentic-microformats https://your-site.example/your-page
```

One command: shows what an agent sees (resources, actions, graph size),
validates every attribute, and flags the classic mistakes (unregistered
attributes, cross-origin endpoints, non-navigable resources). `--graph`
prints the exact JSON an agent gets.

## Minute 25–30: watch an agent use it

Point any LLM at the output of `npx agentic-microformats <url> --graph` and
ask it to plan a task against your page — the graph is self-describing.
Cart-like state pages deserve annotations too: they're what lets an agent
recover when a request fails mid-flow (spec §2.11).

## Going further

- Serve the graph directly (skip HTML entirely): honor
  `Accept: application/agent+json` — see
  [`spec/graph-serialization.md`](../spec/graph-serialization.md).
  The reference server does it in ~30 lines (`demo/server.js`).
- Python side: the [`agentic-microformats` Python package](../packages/agentic-microformats-py/)
  emits the identical graph, stdlib-only.
- Want your site to be the spec's first third-party case study — with the
  benchmark episode suite run against it and the results published? Open an
  issue at [github.com/ikangai/agentic-microformats](https://github.com/ikangai/agentic-microformats).
