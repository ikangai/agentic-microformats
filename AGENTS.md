# AGENTS.md

## Project Overview

Agentic Microformats is a specification for embedding machine-readable `data-agent-*` HTML attributes into web pages, enabling AI agents to discover, understand, and interact with web interfaces alongside human users.

Repository: https://github.com/ikangai/agentic-microformats

## Project Structure

```
├── spec/                    # Specification documents
│   ├── core.md              # Main spec (v0.1.0) — all attribute definitions
│   ├── advanced.md          # v0.2.0-dev patterns (async, batch, settlement)
│   ├── agent-state-layer.md # Exploratory: agent-carried state across pages
│   └── CHANGELOG.md
├── docs/                    # Analysis and proposals
│   ├── CONTRIBUTING.md
│   ├── critical-analysis.md # Gap analysis with priorities (P0/P1/P2)
│   ├── proposals.md         # Proposed v0.2.0 improvements
│   └── plans/               # Implementation plans
├── examples/                # Standalone HTML examples
│   ├── basic/               # Simple annotated pages
│   └── forms/               # Form and parameter examples
├── demo/                    # AgentShop — Express.js reference implementation
│   ├── server.js            # Routes and API endpoints
│   ├── data/products.json   # Product catalog data
│   ├── views/               # EJS templates with data-agent-* attributes
│   │   ├── catalog.ejs      # Product grid (resources + add_to_cart actions)
│   │   ├── product.ejs      # Product detail (includes untrusted reviews)
│   │   ├── cart.ejs          # Cart (update/remove/checkout actions)
│   │   ├── checkout.ejs      # Checkout form (high-risk place_order action)
│   │   ├── confirmation.ejs  # Order confirmation (order resource)
│   │   └── partials/
│   │       ├── head.ejs      # data-agent-meta JSON block
│   │       ├── header.ejs    # Navigation
│   │       └── footer.ejs    # Footer with spec link
│   └── public/
│       ├── style.css
│       ├── demo.js           # Client-side form interception
│       └── llms.txt          # Site-level LLM discovery file
└── README.md
```

## Development Commands

```bash
# Install dependencies
cd demo && npm install

# Start the demo server
cd demo && node server.js    # Runs on localhost:3000

# Run tests (from repo root)
npm test
```

## Specification Conventions

### Attribute Naming
- All attributes start with `data-agent-`
- Use lowercase with hyphens: `data-agent-on-success`, `data-agent-typehint`
- Values are case-sensitive

### Core Attribute Layers
1. **Resource Layer**: `data-agent="resource"`, `data-agent-type`, `data-agent-id`, `data-agent-prop`, `data-agent-typehint`
2. **Action Layer**: `data-agent="action"`, `data-agent-name`, `data-agent-method`, `data-agent-endpoint`, `data-agent-headers`, `data-agent-on-success`, `data-agent-response`
3. **Parameter Layer**: `data-agent-param`, `data-agent-required`, `data-agent-min`, `data-agent-max`
4. **Hints**: `data-agent-role`, `data-agent-risk`, `data-agent-human-preferred`, `data-agent-reversible`, `data-agent-cost`
5. **Scope**: `data-agent-trust` (`system`|`untrusted`|`verified`), `data-agent-ignore`
6. **Meta**: `<script type="application/json" data-agent-meta>` with provider, defaults, workflow, actions, responseSchemas

### Spec Writing Style
- Use RFC 2119 keywords (MUST, SHOULD, MAY)
- Include HTML examples for every new attribute
- Add ABNF grammar productions for new attributes in Section 17

## Demo Conventions

### Template Patterns
When editing EJS templates in `demo/views/`:

- Every semantic entity gets `data-agent="resource"` with `data-agent-type` and `data-agent-id`
- Every clickable/submittable action gets `data-agent="action"` with full API contract attributes
- Form inputs that map to API parameters get `data-agent-param`
- User-generated content sections get `data-agent-trust="untrusted"`
- High-risk actions get `data-agent-risk="high"` and `data-agent-human-preferred="true"`

### Client-Side JS (demo.js)
`demo.js` reads only these attributes to intercept forms:
- `data-agent-endpoint`
- `data-agent-method`
- `data-agent-headers`
- `data-agent-param`

New `data-agent-*` attributes are invisible to `demo.js` — they're for agent consumption only.

### Page-Level Metadata (head.ejs)
The `data-agent-meta` JSON block in `head.ejs` is shared across all pages. It includes:
- `provider` — site identity
- `defaults` — currency, locale
- `page.type` — set per-route via EJS variable `pageType`
- `agent_policies` — rate limiting
- `workflow` — page flow graph
- `actions` — available actions per page type
- `responseSchemas` — expected API response shapes

## Related Standards

This project is part of a layered stack for AI agent interaction:

| Layer | Standard | Purpose |
|-------|----------|---------|
| Repository | AGENTS.md (this file) | Guide coding agents working on source code |
| Site discovery | llms.txt | Curated overview for LLMs approaching a website |
| Page interaction | Agentic Microformats | Structured actions and resources on individual pages |
