# agentic-microformats

Reference implementation of the [Agentic Microformats specification](https://github.com/ikangai/agentic-microformats) (v0.2.0) — a TypeScript library for extracting `data-agent-*` annotations from HTML.

Works with any DOM implementation that satisfies a minimal structural interface: the browser DOM, or [linkedom](https://github.com/WebReflection/linkedom) server-side.

## Install

```bash
npm install agentic-microformats
```

## Usage

```ts
import { AgentDOM } from 'agentic-microformats';

const agentDom = new AgentDOM(document.documentElement);

const { meta, resources, actions } = agentDom.extractAll();
// meta.workflow, meta.actions, meta.responseSchemas  — page-level planning data (spec §9)
// resources[0].properties.price.value                — coerced typed values (spec §5)
// actions[0].response, actions[0].onSuccess          — action contracts (spec §6.7, §6.8)

const prepared = agentDom.prepareAction(actions[0]);
// prepared.confirmationRequired reflects risk/cost/human-preferred hints (spec §8)
```

## Modules

| Module | Purpose |
|---|---|
| `extract` | Resources, actions, properties, page meta |
| `coerce` | Typehint-driven value coercion (currency, dates, integers, …) |
| `trust` | Trust regions (`data-agent-trust`) and `data-agent-ignore` — untrusted subtrees are skipped |
| `params` | Parameter extraction, `min`/`max` constraints, nested dotted-path bodies |
| `hints` | Interaction hints: role, risk, reversibility, cost, human-preferred |
| `observe` | MutationObserver-based annotation change feed (browser only) |

## Content observation (0.4.0) — no annotation required

`extractContent(root)` reads what a page *says* — title, authors, dates,
publisher, section, keywords, word count, language, excerpt, and a heading
outline — bridged from **Schema.org JSON-LD, Microformats2, Open Graph, and
semantic HTML that the page already carries**. Every field is grounded:
`{ value, source, selector }`. Try it on any article:

```bash
npx agentic-microformats <url> --content
```

This is the "own the layer WebMCP lacks" direction: a portable, server-
renderable, grounded reading an agent uses before and after it acts. See
`spec/content-observation.md`.

## WebMCP binding (0.5.0)

`toWebMCPTools(extractAll(root))` compiles the actions into
[WebMCP](https://webmachinelearning.github.io/webmcp/) tool descriptors —
JSON Schema inputs, standard MCP tool annotations (`readOnlyHint` /
`destructiveHint` / `idempotentHint` / `humanConfirmationHint`), and a binding
that **defaults to the real HTML control** (`form.requestSubmit()`), not a
shadow endpoint. `registerWebMCPTools(result, navigator.modelContext)` registers
them live and enforces the fail-closed confirmation gate. Inspect any page:

```bash
npx agentic-microformats <url> --webmcp
```

See `spec/webmcp-binding.md`. This is the interaction half of the pivot: the
same annotations a zero-JS agent reads statically also drive live WebMCP
invocation in a capable browser — Agentic Microformats does not compete with
WebMCP's runtime, it feeds it.

## Spec coverage

Implements core spec **v0.3.x** (`data-agent-idempotent`, endpoint origin
policy, conformance profiles, monotonic trust) plus the **0.4.0 content
observation layer**. The proposed vocabulary in `spec/advanced.md` and the
workflow/async example attributes are **not** implemented — they are not part
of the released spec.

## License

MIT
