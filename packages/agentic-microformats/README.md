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

## Spec coverage

Implements core spec **v0.2.0**, including `data-agent-on-success`, `data-agent-response`, `data-agent-min`/`max`, and the extended meta layer (`workflow`, `actions`, `responseSchemas`, `errorFormat`). The proposed vocabulary in `spec/advanced.md` and the workflow/async example attributes are **not** implemented — they are not part of the released spec.

## License

MIT
