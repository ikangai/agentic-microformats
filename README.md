# Agentic Microformats

**Same interface. Shared wheel. Semantic clutch.**

Agentic Microformats is a lightweight specification for embedding machine-readable semantics directly into HTML, enabling AI agents to discover, understand, and interact with web resources alongside human users.

This is not automation. It's assisted operation of the web.

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

📄 **[Read the full specification →](SPECIFICATION.md)**

Current version: **0.1.0** (Working Draft, January 2026)

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

See [Appendix E](SPECIFICATION.md#appendix-e-browser-embedded-agents) in the specification.

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

- [E-commerce Product Page](examples/ecommerce.html)
- [Project Dashboard](examples/dashboard.html)
- [Form with Nested Parameters](examples/form.html)

## Contributing

This specification is in active development. Contributions welcome:

- **Issues**: Report problems or suggest improvements
- **Discussions**: Share implementation experiences
- **Pull Requests**: Propose spec changes or add examples

## License

- Specification: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Examples and code: [MIT](LICENSE)

## Author

**Martin Treiber**  
[IKANGAI](https://www.ikangai.com) · Graz, Austria

---

*"The web remains a human interface. Agents become assistants who can observe, learn, and help—without taking over."*
