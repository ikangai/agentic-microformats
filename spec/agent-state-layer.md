# Agentic Microformats: Agent State Layer

**Version:** 0.2.0-dev
**Status:** Working Draft — Exploratory
**Date:** February 2026
**Authors:** Martin Treiber, [IKANGAI](https://www.ikangai.com)
**License:** MIT

---

## Abstract

The core specification defines how agents *read* state from the DOM. This document proposes that agents also *carry* state — accumulated knowledge extracted from DOM annotations across pages and sessions. The agent becomes a third state layer between server and DOM, analogous to a human carrying a notepad through a store.

This pattern inverts the modern web's assumption that the server owns session state. It is a return to Roy Fielding's original REST vision — stateless servers, client-carried state — but with AI agents as the intelligent state carrier.

---

## 1. The Problem

### 1.1 Server-Side Session State Is an Accident of History

The web was designed to be stateless. Fielding's REST constraints (2000) explicitly place session state on the client: "each request from client to server must contain all of the information necessary to understand the request."

But the web drifted:

1. **Early web**: Truly stateless. Each page load was independent.
2. **E-commerce era**: Server-side sessions via cookies. The server tracks the shopping cart.
3. **SPA era**: Complex client-side state, but servers still hold sessions for auth, carts, preferences.
4. **Distributed era**: Redis/Memcached for distributed session stores — scaling the stateful antipattern.

The result: servers carry state that conceptually belongs to the user. A shopping cart is *the user's intent*, not the server's data. A comparison list is *the user's working memory*, not a database row.

### 1.2 The Human Analogy

A human shopping in a physical store:

- **Carries a basket** — local state, no server involved
- **Writes a shopping list** — accumulated intent, brought from outside
- **Compares prices mentally** — cross-vendor state the store never sees
- **Presents the basket at checkout** — state flows to the server only at the moment of transaction

The store doesn't track what's in your basket until you're ready to pay. The state is yours.

### 1.3 The Agent Opportunity

An AI agent operating on annotated HTML can do the same:

- **Read** resource properties from `data-agent-*` annotations
- **Accumulate** them across page navigations (the notepad)
- **Carry** that accumulated state to the next interaction (the basket)
- **Present** it to the server only when executing an action

The server remains stateless. The agent carries the state. The DOM is the observable truth at each moment.

---

## 2. The Three-Layer State Model

The current architecture assumes two layers: server state and DOM state. The agent introduces a third:

```
Server State     (authoritative resources, business logic, persistence)
       ↕ actions/responses
Agent State      (accumulated knowledge, carried context, "the notepad")
       ↕ extraction/observation
DOM State        (visible truth, current page annotations)
```

### 2.1 Server State

What it owns: authoritative resource records, business logic, transaction processing, persistence.

What it should NOT need to own: the user's browsing context, comparison state, partially assembled intent, navigation history. These are the user's working memory.

### 2.2 DOM State

What it represents: the current page's visible truth. Resources, actions, parameters, and metadata annotated via `data-agent-*` attributes.

What it cannot do: persist across page navigations. When the user leaves a page, its DOM state is gone.

### 2.3 Agent State (New)

What it holds:

| State Type | Description | Example |
|------------|-------------|---------|
| **Observed resources** | Resources extracted from DOM annotations across pages | Products viewed, their prices, availability |
| **Accumulated intent** | User or agent goals assembled over time | Items "in cart" without server roundtrip |
| **Affordance mappings** | Learned patterns about how actions work | "Add to cart always requires product_id and quantity" |
| **Property history** | Changes to resource properties observed over time | "Price of SKU-1 was 14.99, now 12.99" |
| **Cross-page context** | Relationships between resources seen on different pages | "Product X on page A is cheaper than on page B" |

---

## 3. Agent Memory Tiers

Drawing from cognitive science and agent memory architectures (MemGPT, LangMem), agent state naturally organizes into three tiers:

### 3.1 Core Memory (Current Page)

The agent's immediate working context: the `ExtractionResult` from the current page.

```
Page: /products/SKU-USB-C-2M

Resources:
  - product SKU-USB-C-2M
    name: "USB-C Cable 2m"
    price: 14.99 EUR
    availability: in_stock

Actions:
  - add_to_cart (target: SKU-USB-C-2M)
  - add_to_wishlist (target: SKU-USB-C-2M)
```

This is what the core specification's extraction phase (Section 11.1) already produces. It is volatile — replaced on each page navigation.

### 3.2 Session Memory (Across Pages)

Resources, properties, and observations accumulated during the current browsing session. This is the "notepad."

```
Session:
  Visited: /products (3 products seen)
  Visited: /products/SKU-USB-C-2M (added to intent: 1x USB-C Cable)
  Visited: /products/SKU-HDMI-3M (compared price: 19.99 EUR)

  Intent:
    - { product_id: "SKU-USB-C-2M", quantity: 1, price: 14.99, currency: "EUR" }

  Observations:
    - site uses EUR by default (from meta.defaults.currency)
    - add_to_cart actions always require product_id + quantity
    - products have consistent property shapes: name, price, availability
```

Session memory persists across page navigations within a single browsing session. It does NOT require server storage.

### 3.3 Persistent Memory (Across Sessions)

Long-term knowledge the agent retains across sessions. Affordance mappings, site patterns, user preferences.

```
Persistent (site: example-shop.com):
  Types seen: product, order, cart
  Actions seen: add_to_cart, remove_from_cart, checkout, add_to_wishlist
  Patterns:
    - product pages always have: name, price, availability, rating
    - add_to_cart is always role="primary", low risk
    - checkout is always risk="high", requires confirmation
    - currency is always EUR
  Vocabularies: products follow schema.org/Product patterns
```

This tier is optional and implementation-dependent. Browser-embedded agents might use IndexedDB or a SharedWorker. External agents might use their own storage.

---

## 4. Patterns

### 4.1 Pattern: Stateless Shopping Cart

The agent carries the cart. The server never stores session state.

**Page 1 — Product listing:**

```html
<article data-agent="resource" data-agent-type="product" data-agent-id="SKU-1">
  <h2 data-agent-prop="name">USB-C Cable 2m</h2>
  <span data-agent-prop="price" data-agent-typehint="currency"
        data-agent-currency="EUR">14.99</span>
  <span data-agent-prop="availability">in_stock</span>

  <form data-agent="action" data-agent-name="add_to_cart"
        data-agent-method="POST" data-agent-endpoint="/cart/add"
        data-agent-role="primary">
    <input data-agent-param="product_id" type="hidden" value="SKU-1">
    <input data-agent-param="quantity" data-agent-typehint="integer"
           type="number" value="1" required>
    <button type="submit">Add to Cart</button>
  </form>
</article>
```

**Agent behavior (option A — server-side cart):**
Agent calls POST /cart/add. Server creates session. Standard model.

**Agent behavior (option B — agent-carried cart):**
Agent extracts the resource, notes the user's intent ("add 1x SKU-1"), stores it in session memory. No HTTP request. The agent's notepad now contains:

```
cart_intent: [
  { product_id: "SKU-1", name: "USB-C Cable 2m", price: 14.99,
    currency: "EUR", quantity: 1, observed_at: "2026-02-04T10:30:00Z" }
]
```

**Page 2 — Checkout:**

```html
<form data-agent="action" data-agent-name="checkout"
      data-agent-method="POST" data-agent-endpoint="/api/checkout"
      data-agent-risk="high"
      data-agent-cost="14.99" data-agent-cost-currency="EUR">
  <input data-agent-param="items" data-agent-typehint="json">
  <input data-agent-param="payment_method">
  <button type="submit">Complete Purchase</button>
</form>
```

The agent presents its carried state to the server at this point — the accumulated cart intent becomes the `items` parameter. The server validates, processes payment, and returns a result. State flowed from agent to server only at the transactional boundary.

### 4.2 Pattern: Cross-Page Comparison

The agent compares resources observed on different pages — something server-side state cannot easily do.

```
Agent Session Memory:

  Page /products/SKU-1:
    product SKU-1: USB-C Cable 2m, 14.99 EUR, in_stock

  Page /products/SKU-2:
    product SKU-2: USB-C Cable 3m, 19.99 EUR, in_stock

  Comparison (computed by agent):
    SKU-1 is 5.00 EUR cheaper than SKU-2
    SKU-1 is 2m, SKU-2 is 3m
    Both in stock
```

No server endpoint provides this comparison. The agent derived it from carried state.

### 4.3 Pattern: Price Change Detection

The agent observes a resource at time T1, navigates away, returns at time T2.

```
T1: product SKU-1, price: 14.99 EUR
T2: product SKU-1, price: 12.99 EUR (sale!)

Agent detects: price dropped 2.00 EUR (13.3% decrease)
Agent can: notify user, update cart intent, flag the change
```

The server didn't push a notification. The agent detected the change through its own carried state — comparing current DOM extraction against session memory.

### 4.4 Pattern: Form Pre-filling from Carried Context

When the agent encounters a form action with parameters, it can fill parameters from previously observed resources.

```html
<!-- Shipping form on checkout page -->
<form data-agent="action" data-agent-name="set_shipping"
      data-agent-method="POST" data-agent-endpoint="/api/shipping">
  <input data-agent-param="recipient_name">
  <input data-agent-param="address.street">
  <input data-agent-param="address.city">
  <input data-agent-param="address.country">
</form>
```

If the agent has previously observed a `user` resource on an account page with matching properties, it can pre-fill from its persistent memory — without the server needing to provide pre-population logic.

---

## 5. DOM Annotations for Agent State

The core specification needs no changes to support agent-carried state — the agent reads existing `data-agent-*` attributes and decides locally what to remember. However, publishers MAY provide hints to help agents manage their state effectively.

### 5.1 State Volatility Hints

Publishers can hint whether a resource's properties are stable or volatile:

```html
<span data-agent-prop="price"
      data-agent-typehint="currency"
      data-agent-x-volatility="high"
      data-agent-x-ttl="300">14.99</span>
```

| Attribute | Purpose |
|-----------|---------|
| `data-agent-x-volatility` | `low` (rarely changes), `medium`, `high` (changes frequently) |
| `data-agent-x-ttl` | Suggested time-to-live in seconds for cached values |

Agents SHOULD re-extract volatile properties rather than relying on stale carried state.

### 5.2 Identity Continuity

For the agent to track a resource across pages, it needs stable identifiers. The core spec's `data-agent-id` serves this purpose. When the same `data-agent-id` appears on different pages, the agent knows it's the same resource:

```html
<!-- Page /products/SKU-1 -->
<article data-agent="resource" data-agent-type="product" data-agent-id="SKU-1">
  <!-- full product details -->
</article>

<!-- Page /cart -->
<div data-agent="resource" data-agent-type="cart-item" data-agent-id="CART-ITEM-1">
  <span data-agent-prop="product_ref" data-agent-typehint="string">SKU-1</span>
  <span data-agent-prop="quantity" data-agent-typehint="integer">1</span>
</div>
```

The agent correlates `product_ref: SKU-1` with its carried knowledge of product `SKU-1`.

### 5.3 State Transfer Hints

Publishers can hint that an action accepts agent-carried state as input:

```html
<form data-agent="action" data-agent-name="checkout"
      data-agent-method="POST" data-agent-endpoint="/api/checkout"
      data-agent-x-accepts-carried-state="cart_intent">
  <input data-agent-param="items" data-agent-typehint="json">
</form>
```

The `data-agent-x-accepts-carried-state` attribute tells the agent: "you can fill the `items` parameter from your accumulated cart intent." This is a hint, not a requirement — the agent decides whether and how to use it.

---

## 6. Security Considerations

### 6.1 Carried State Is Untrusted

From the server's perspective, agent-carried state is client input. All standard input validation applies:

- The server MUST NOT trust prices, quantities, or identifiers carried by the agent without server-side verification.
- A malicious agent could claim a product costs 0.01 EUR. The server validates against its own records.
- This is no different from traditional form submissions — the server always validates.

### 6.2 Stale State

Agent-carried state can become stale:

- A product may go out of stock between observation and action.
- A price may change between pages.
- An action endpoint may become unavailable.

Agents SHOULD treat carried state as *intent* not *truth*. The DOM is truth (Visible Truth principle). Carried state is the agent's working memory of what it has seen.

Publishers SHOULD use volatility hints (Section 5.1) for properties that change frequently.

### 6.3 Cross-Site State Isolation

When agents carry state across sites, trust boundaries apply:

- Annotations from an untrusted site (`data-agent-trust="untrusted"`) MUST NOT influence agent behavior on another site.
- Carried state SHOULD be scoped per origin by default.
- Cross-origin state transfer (e.g., price comparison across stores) is a user-directed operation, not an automatic one.

### 6.4 Privacy

Agent-carried state contains the user's browsing context — which products they viewed, what they compared, what they intended to buy. This is sensitive data.

- Browser-embedded agents SHOULD store state in the browser's existing privacy-scoped storage (IndexedDB per origin, cleared with browsing data).
- External agents MUST handle carried state with the same care as user personal data.
- Agents SHOULD NOT transmit carried state to third parties without user consent.

---

## 7. Implementation Architecture

This section provides guidance for implementers, not normative requirements.

### 7.1 Browser-Embedded Agents

Recommended architecture for agents running inside the browser (extensions, native browser AI):

```
┌─────────────────────────────────────────────────────┐
│                     BROWSER                          │
│                                                      │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │   Tab 1      │    │      SharedWorker         │   │
│  │   DOM ←→ CS  │───→│                           │   │
│  └──────────────┘    │  ┌────────────────────┐   │   │
│  ┌──────────────┐    │  │   Agent State       │   │   │
│  │   Tab 2      │    │  │                     │   │   │
│  │   DOM ←→ CS  │───→│  │ Core: current page  │   │   │
│  └──────────────┘    │  │ Session: cross-page  │   │   │
│                      │  │ Persistent: IndexedDB│   │   │
│                      │  └────────────────────┘   │   │
│                      │                           │   │
│                      │  BroadcastChannel ←→ Tabs │   │
│                      └──────────────────────────┘   │
│                                                      │
│  CS = Content Script (extracts data-agent-* attrs)   │
└─────────────────────────────────────────────────────┘
```

- **Content Scripts** parse `data-agent-*` from each tab's DOM.
- **SharedWorker** maintains centralized agent state across tabs (same origin).
- **BroadcastChannel** notifies tabs when state changes.
- **IndexedDB** provides persistent storage for cross-session memory.

### 7.2 External Agents

For agents operating outside the browser (cloud-based, CLI):

```
Agent Process
├── HTTP Client (fetches pages)
├── HTML Parser (linkedom, cheerio)
├── Extraction (data-agent-* → structured types)
├── State Store
│   ├── Core: in-memory (current page extraction)
│   ├── Session: in-memory (accumulated across requests)
│   └── Persistent: filesystem, database, or key-value store
└── Action Executor (HTTP requests to endpoints)
```

### 7.3 Edge-Based Agents

For agents running at the edge (Cloudflare Durable Objects, similar platforms):

- Each user's agent state lives in a Durable Object with built-in persistence.
- The agent sleeps when inactive (cost-efficient).
- WebSocket connection from browser delivers DOM extractions in real-time.
- State persists across sessions automatically.

---

## 8. Relationship to Other Patterns

### 8.1 HATEOAS

The agent-as-state-carrier completes the HATEOAS vision. REST's hypermedia constraint says: the server response tells the client what's possible next. Agentic Microformats makes those hypermedia controls (`data-agent="action"`) legible to agents. The agent carries accumulated context forward, and each page's annotations provide the next set of available transitions. This is precisely the "engine of application state" that HATEOAS describes — but with the agent as the engine.

### 8.2 Local-First Software

The agent-carried state pattern aligns with local-first principles (Kleppmann et al., 2019):

- The agent holds its own copy of understood state
- It works independently of the server (offline-capable)
- It syncs with server state through explicit actions
- Conflicts are resolved through the DOM (observable truth)

### 8.3 Personal Data Pods (Solid)

Tim Berners-Lee's Solid project proposes user-controlled data pods. The agent's state store is a lightweight version: a portable, user-controlled accumulation of observed data. The key difference is scope — Solid pods are general-purpose personal data stores; agent state is specifically the agent's working memory derived from DOM annotations.

### 8.4 Verifiable Credentials

The W3C Verifiable Credentials model (2.0, May 2025) defines a holder who carries attestable claims. An agent carrying state is structurally similar: it carries observed facts (resource properties) that it can present to services. Future integration could allow agents to carry *signed* observations — "I observed this price at this time on this page, and here's the cryptographic proof."

---

## 9. Open Questions

1. **State schema**: Should the spec define a standard format for agent-carried state, or leave it implementation-defined?

2. **State negotiation**: Should publishers be able to declare "this action requires server-side cart state" vs. "this action accepts agent-carried state"? Or is this always the agent's decision?

3. **CRDT merging**: When multiple agent instances (tabs, devices) accumulate state independently, should the spec recommend a merge strategy? Automerge/CRDT-based sync is one option.

4. **Vocabulary alignment**: For cross-site carried state to be useful, sites need shared type vocabularies. Should the spec recommend Schema.org alignment for `data-agent-type` values?

5. **State attestation**: Should agents be able to prove what they observed? Signing extracted state with timestamps and page hashes would enable verifiable agent memory. This connects to the provenance chains in `spec/advanced.md` Section 4.

---

## 10. References

### Informative

- **[Fielding2000]** Roy Fielding, "Architectural Styles and the Design of Network-based Software Architectures," Chapter 5: REST, University of California, Irvine, 2000. https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm
- **[LocalFirst2019]** Kleppmann et al., "Local-first software: You own your data, in spite of the cloud," ACM SIGPLAN Onward! 2019. https://www.inkandswitch.com/local-first/
- **[MemGPT2023]** Packer et al., "MemGPT: Towards LLMs as Operating Systems," arXiv:2310.08560, 2023. https://arxiv.org/abs/2310.08560
- **[WVCR2025]** W3C Verifiable Credentials 2.0, W3C Recommendation, May 2025. https://www.w3.org/press-releases/2025/verifiable-credentials-2-0/
- **[Solid]** Solid Project. https://solidproject.org/
- **[Automerge]** Automerge: A CRDT Implementation. https://automerge.org/
- **[CloudflareAgents]** Cloudflare Agents SDK. https://agents.cloudflare.com/
- **[AgentDID2025]** "AI Agents with Decentralized Identifiers and Verifiable Credentials," arXiv:2511.02841, 2025.
- **[OpenAIState2025]** OpenAI Agents SDK: Context Engineering for Personalization — State Management with Long-Term Memory Notes. https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization

---

*This is an exploratory document. The patterns described here are emerging from the intersection of agentic web semantics, local-first architecture, and REST's original stateless vision. Feedback and real-world implementation experience will shape which patterns become normative.*
