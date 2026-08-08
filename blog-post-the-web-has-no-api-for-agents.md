# The Web Has No API for Agents

In February 2026, we pointed a browser-embedded AI agent at a demo e-commerce store and asked it to buy a laptop stand. It read the site's discovery file, parsed the page metadata, extracted six products with prices and availability, added three items to the cart via API, updated a quantity, removed one item, checked that checkout was marked high-risk, and placed the order — all without clicking a single button.

Five page visits. Eight API calls. Zero guesswork.

The agent didn't scrape. It didn't use vision to find the "Add to Cart" button. It read HTML attributes that told it exactly what was on the page, what actions were available, and how to call them.

This is what happens when you give the web a semantic layer that agents can actually read.

## The Screen Was Never the Interface

Every major AI lab is shipping browser agents. Anthropic's computer use, Google's Project Mariner, Arc's AI features — they all share the same approach: look at the screen, find the button, click it. It works. Until it doesn't.

A CSS change moves the checkout button twelve pixels to the left. A modal overlay appears that wasn't there yesterday. The site loads a skeleton screen and the agent clicks before the real content renders. Vision-based agents are remarkably capable, but they're solving a problem that shouldn't exist. They're reverse-engineering intent from pixels because the page never declared its intent in the first place.

Scraping is the other path. Parse the DOM, extract text, hope the class names are meaningful. This works until the site redesigns, or until you need to understand that a button labeled "Remove" next to a cart item means `DELETE /api/cart/item-id` with a specific set of headers. The gap between what the DOM shows and what the DOM means is where agents break.

The fundamental issue isn't that agents are bad at reading web pages. It's that web pages were never designed to be read by agents.

## What If HTML Could Explain Itself?

Agentic Microformats is a specification for closing that gap. The idea is simple: annotate existing HTML elements with `data-agent-*` attributes that make their meaning machine-readable. No separate API documentation. No hidden metadata layer. The annotations live on the same elements that humans see and interact with.

A product on a page becomes a discoverable resource:

```html
<article data-agent="resource"
         data-agent-type="product"
         data-agent-id="SKU-12345">
  <h1 data-agent-prop="name">USB-C Cable 2m</h1>
  <span data-agent-prop="price"
        data-agent-typehint="currency">14.99</span>
</article>
```

An "Add to Cart" button becomes a self-describing API contract:

```html
<button data-agent="action"
        data-agent-name="add_to_cart"
        data-agent-method="POST"
        data-agent-endpoint="/api/cart/add"
        data-agent-risk="low">
  Add to Cart
</button>
```

The agent doesn't need to guess what the button does. It reads the endpoint, the method, the risk level. It knows the parameters from `data-agent-param` attributes on nearby form inputs, including their validation constraints — min, max, type. It knows the response shape from `data-agent-response`. It knows what to do next from `data-agent-on-success`.

This isn't automation. The agent isn't following a script. It's reading the same page a human reads, but with a semantic layer that makes the page legible to both.

## The Sewing Machine Metaphor

The design philosophy borrows from an old piece of engineering. A sewing machine has both a motor and a hand wheel. Both connect to the same needle mechanism. You can switch mid-stitch. The machine doesn't know or care which operator is driving.

Agentic Microformats treats the DOM the same way. The human is the hand wheel. The agent is the motor. The annotated HTML is the shared mechanism. Either can observe the current state, perform an action, and hand off to the other at any point. The annotations don't create a separate "agent mode" — they make the existing interface legible to a second kind of operator.

This matters for safety. A checkout form annotated with `data-agent-risk="high"` and `data-agent-human-preferred="true"` tells the agent: this action has consequences, suggest that a human confirms it. The agent doesn't need a separate policy engine. The hint is right there on the element, visible to anyone inspecting the page.

## Proof: An Agent Shops a Store

We built AgentShop, a reference e-commerce store with every element annotated. Then we ran a browser-embedded agent through it using only the microformat attributes to navigate.

The agent's workflow looked like this:

First, it fetched `/llms.txt` — a plain Markdown file describing the site structure, API endpoints, and workflow. One request, zero page visits, and the agent already knew the site's shape.

Then it loaded the catalog page and parsed the `<script data-agent-meta>` JSON block — a page-level manifest containing the workflow graph, available actions per page type, response schemas, and error format. The agent now had a complete map.

From there, it discovered all products with a single DOM query: `document.querySelectorAll('[data-agent="resource"]')`. Six products, each with name, price, availability, and rating extracted from `data-agent-prop` attributes. No scraping heuristics. No CSS selectors that might break tomorrow.

Adding items to the cart was a direct `fetch()` call using the endpoint and method from the action's attributes. The response included a `cartItemId` — which meant the agent could update quantities and remove items via API without ever visiting the cart page. It called `PATCH /api/cart/:id` with the captured ID. No extra page visit required.

It even tested the boundaries. The quantity input declared `data-agent-min="1"` and `data-agent-max="10"`. The agent knew the constraints before sending a request. When we deliberately tested quantity 99, the server returned an error in the exact `{ success, message }` shape declared in the metadata's `errorFormat`. Predictable contracts, end to end.

At checkout, the agent read `data-agent-risk="high"`, `data-agent-human-preferred="true"`, and `data-agent-cost="79.96"`. A well-behaved agent pauses here and asks for confirmation. The annotation didn't enforce anything — it informed the agent's decision.

The order completed. The response included a redirect URL, exactly as the `responseSchema` promised. The agent followed it to the confirmation page.

The entire journey: five page visits, eight API calls, and every single one was informed by metadata that the page provided explicitly.

## Three Layers, One Stack

Agentic Microformats doesn't operate in isolation. It's the page-level layer in a stack that's emerging across three levels of the web.

At the repository level, **AGENTS.md** — now adopted by over 60,000 projects and backed by the Linux Foundation — gives coding agents instructions for working within a codebase. What to build, how to test, what conventions to follow.

At the site level, **llms.txt** provides a curated Markdown overview of a site's purpose and structure, designed for LLM consumption. Think of it as a cover letter for your website, addressed to an AI reader.

At the page level, **Agentic Microformats** annotates the DOM so agents can read, understand, and interact with individual pages alongside human users.

These three layers address different problems at different scopes, but they share a design instinct: don't build a separate system for agents. Annotate what already exists. Make the existing interface legible to a new kind of reader.

## The Web Doesn't Need an Agent Mode

The temptation with AI agents is to build them a separate door — a dedicated API, a special protocol, a parallel interface. That path leads to divergence. The agent's view of the application drifts from the human's view. Bugs appear in one interface but not the other. The maintenance burden doubles.

Agentic Microformats takes the opposite position. The web already has an interface. It's called HTML. Four billion people use it. The problem isn't the interface — it's that the interface only speaks to one kind of operator.

Adding `data-agent-*` attributes to existing elements is a minimal intervention with outsized leverage. The page still works exactly the same for humans. But now an agent can read the same page and understand what it means, what it can do, and what it should be careful about.

The lesson from the AgentShop demo isn't that agents can shop online. It's that the gap between "AI agent" and "useful AI assistant" might not require a new protocol or a vision model or a purpose-built API. It might require twelve HTML attributes and the willingness to describe what your interface already does.

The specification is open, the demo is live, and the repo is at [github.com/ikangai/agentic-microformats](https://github.com/ikangai/agentic-microformats).

*The web remains a human interface. Agents become assistants who can read the room — because the room finally describes itself.*
