# Agentic Microformats

**Same interface. Shared wheel. Semantic clutch.**

Agentic Microformats is a lightweight specification for embedding machine-readable semantics directly into HTML, enabling AI agents to discover, understand, and interact with web resources alongside human users.

This is not automation. It's assisted operation of the web.

**Measured, not promised** (full data: [benchmark/experiment-log.md](benchmark/experiment-log.md)):

- The annotation graph extracts **deterministically in milliseconds at zero model tokens**, at ~⅓ of the HTML's size — and sites can serve it directly (`Accept: application/agent+json`).
- A small model reading the graph **beats a frontier model reading HTML** on the QA suite: 15/15 at $0.37 vs 14/15 at $1.94.
- Three different agents — frontier, small, and a **local open-weights model at $0.00** — all operate the annotated demo store end-to-end (checkout, response chaining, fault recovery): 12/13 each. Annotate once, any model works.
- Injected-fault episodes (lost responses, rate limits) were **recoverable only because state pages are annotated** — machine-readable state is what makes agent errors survivable.

## The Idea

When a user interacts with a web page, what actually happens is a sequence of DOM changes. Humans interpret these changes semantically—they understand intention, progress, success, failure. AI agents can observe the same changes but need help interpreting what they mean.

Agentic Microformats provides that help through simple `data-agent-*` attributes that annotate existing HTML elements:

```html
<article data-agent="resource"
         data-agent-type="product"
         data-agent-id="SKU-12345">
  
  <h1 data-agent-prop="name">USB-C Cable 2m</h1>
  <span data-agent-prop="price" 
        data-agent-typehint="currency"
        data-agent-currency="EUR">14.99</span>
  
  <button data-agent="action"
          data-agent-name="add_to_cart"
          data-agent-method="POST"
          data-agent-endpoint="/cart/add"
          data-agent-role="primary">
    Add to Cart
  </button>
</article>
```

## Key Principles

### Shared Operation

Humans and agents operate on the same interface—the DOM. There is no separate "agent mode." Both can observe the current state, perform available actions, and hand off to the other at any point.

Think of a sewing machine with both a motor and a hand wheel: both connect to the same mechanism, you can switch mid-stitch, and the machine doesn't know or care which operator is active.

### Visible Truth

Agents read what users see. There is no hidden metadata layer that can become inconsistent. If a price is displayed as "€50", the agent reads "€50" from the annotated element.

### Discovery Through Navigation

Agents discover site capabilities by navigating pages—just like humans do. No central manifest required. The sum of all page-level annotations *is* the site's agent interface.

### Apprenticeship, Not Automation

The semantic annotations don't control agents or define automation rules. They help agents interpret what's happening so they can assist rather than replace human operators.

## Quick Start

### 1. Annotate a Resource

```html
<div data-agent="resource"
     data-agent-type="project"
     data-agent-id="PRJ-2025-001">
  <h2 data-agent-prop="name">Website Redesign</h2>
  <span data-agent-prop="status">active</span>
  <span data-agent-prop="progress" data-agent-typehint="integer">65</span>
</div>
```

### 2. Add Actions

```html
<button data-agent="action"
        data-agent-name="archive"
        data-agent-method="POST"
        data-agent-endpoint="/api/projects/PRJ-2025-001/archive"
        data-agent-reversible="true">
  Archive Project
</button>
```

### 3. Mark Dangerous Actions

```html
<button data-agent="action"
        data-agent-name="delete"
        data-agent-method="DELETE"
        data-agent-endpoint="/api/projects/PRJ-2025-001"
        data-agent-role="danger"
        data-agent-risk="high"
        data-agent-reversible="false"
        data-agent-human-preferred="true">
  Delete Project
</button>
```

### 4. Protect User-Generated Content

```html
<main data-agent-trust="system">
  <!-- Safe for agents to parse -->
</main>

<section class="comments" data-agent-trust="untrusted">
  <!-- Agents will ignore annotations here -->
</section>
```

## Specification

📄 **[Read the full specification →](spec/core.md)**

Current version: **0.3.0** (Working Draft, August 2026) · [Canonical graph serialization →](spec/graph-serialization.md)

## What's in This Repo

| Directory | Contents |
|-----------|----------|
| [`spec/`](spec/) | The specification: [core.md](spec/core.md) (normative, v0.2.0), [agent-state-layer.md](spec/agent-state-layer.md), [advanced.md](spec/advanced.md) (non-normative exploration) |
| [`packages/agentic-microformats/`](packages/agentic-microformats/) | TypeScript reference implementation (extraction, coercion, trust regions, parameters, hints, mutation observation) — spec v0.2.0 |
| [`demo/`](demo/) | AgentShop — a runnable Express store fully annotated at v0.2.0, with `/llms.txt` |
| [`examples/`](examples/) | Standalone annotated HTML pages |
| [`benchmark/`](benchmark/) | Autoresearch harness measuring the task-success **delta** annotations provide (see [benchmark/README.md](benchmark/README.md)) |
| [`discovery/`](discovery/) | Probe tooling that surfaces candidate spec gaps on live pages |

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Resource** | A domain object on the page (product, project, ticket) |
| **Action** | An operation that can be performed (button, form) |
| **Property** | A data field of a resource (name, status, price) |
| **Interaction Hint** | Safety metadata (risk level, reversibility, cost) |
| **Trust Region** | Content zone with declared trust level |

## Interaction Hints

Help agents make safe decisions:

| Attribute | Values | Purpose |
|-----------|--------|---------|
| `data-agent-role` | `primary`, `secondary`, `danger` | Semantic priority |
| `data-agent-risk` | `low`, `medium`, `high` | Risk assessment |
| `data-agent-human-preferred` | `true`, `false` | Suggest human confirmation |
| `data-agent-reversible` | `true`, `false` | Can action be undone? |
| `data-agent-cost` | numeric | Monetary cost |

## Browser-Embedded Agents

Agentic Microformats is designed for the emerging generation of browser-embedded LLMs (Atlas, Comet, Arc AI). These agents have direct DOM access, making the sewing machine metaphor literal:

- The DOM is the shared mechanism
- Human input is the hand wheel
- The browser LLM is the motor
- Agentic Microformats is the clutch

See [Appendix E](spec/core.md#appendix-e-browser-embedded-agents) in the specification.

## Relationship to Other Standards

| Standard | Layer | Relationship |
|----------|-------|--------------|
| AGENTS.md | Repository | Instructions for coding agents in repos |
| llms.txt | Site | Curated site overview for LLMs |
| NLWeb | Site | Natural language query interface |
| agents.json | Site | API contracts and policies |
| **Agentic Microformats** | Page | UI semantics for shared operation |

These form a stack: AGENTS.md guides coding agents in your repo, llms.txt introduces your site to LLMs, and Agentic Microformats lets agents interact with individual pages.

## Examples

- [E-commerce Product Page](examples/ecommerce/product-page.html)
- [Project Dashboard](examples/basic/project-dashboard.html)
- [Form with Nested Parameters](examples/forms/nested-parameters.html)
- [Multi-Step Checkout](examples/workflows/multi-step-checkout.html) *(proposed vocabulary — not in spec v0.2.0)*
- [Async File Upload](examples/autonomous/async-file-upload.html) *(proposed vocabulary — not in spec v0.2.0)*

## Contributing

This specification is in active development. Contributions welcome:

- **Issues**: Report problems or suggest improvements
- **Discussions**: Share implementation experiences
- **Pull Requests**: Propose spec changes or add examples

## License

[MIT](LICENSE) — specification, examples, and code.

## Author

**Martin Treiber**  
[IKANGAI](https://www.ikangai.com) · Graz, Austria

---

*"The web remains a human interface. Agents become assistants who can observe, learn, and help—without taking over."*
