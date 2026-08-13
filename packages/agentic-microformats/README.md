# agentic-microformats

Reference implementation of the [Agentic Microformats specification](https://github.com/ikangai/agentic-microformats) (v0.2.0) — a TypeScript library for extracting `data-agent-*` annotations from HTML.

Works with any DOM implementation that satisfies a minimal structural interface: the browser DOM, or [linkedom](https://github.com/WebReflection/linkedom) server-side.

## Install

```bash
npm install agentic-microformats
```

## Give your agent web-operation in ~20 lines (`operate`)

`operate()` is the episode runtime: it observes the page (graph + content +
WebMCP tools), asks *your* model what to do, safety-gates and executes the
action, re-observes, and loops — until the agent answers. It is
**model-agnostic** (you supply `decide`) and **environment-agnostic** (you
supply the transport, so **auth is your session**, and `parse` is linkedom
server-side or `document` in a browser).

```ts
import { operate } from 'agentic-microformats';
import { parseHTML } from 'linkedom';

const result = await operate({
  task: 'Add two of the cheapest product to the cart',
  start: 'https://shop.example/',

  // YOUR model. Given the page state, return one action.
  decide: async (state) => {
    const reply = await myLLM(`Task: ${state.task}
Tools: ${JSON.stringify(state.tools)}
History: ${JSON.stringify(state.history)}
Return one JSON action: {"type":"navigate|invoke|answer", ...}`);
    return JSON.parse(reply);
  },

  // YOUR transport — carries the user's session/cookies (this is how auth works).
  fetchPage:   (url) => fetch(url, { credentials: 'include' }).then(async r => ({ html: await r.text(), url: r.url })),
  sendRequest: (req) => fetch(req.url, { method: req.method, headers: req.headers,
                                         credentials: 'include', body: JSON.stringify(req.body) })
                          .then(async r => ({ status: r.status, body: await r.json().catch(() => null) })),

  parse: (html) => parseHTML(html).document.documentElement,

  // Safety is fail-closed: high-risk / human-preferred / un-hinted-mutating
  // actions call this; cross-origin endpoints are refused outright.
  onConfirm: ({ tool, prepared }) => askTheHuman(`Run ${tool}?`, prepared),
  origin: 'https://shop.example',
});

console.log(result.answer, result.steps);
```

The library owns the loop and the safety gates (fail-closed confirmation,
same-origin enforcement, re-observation after each mutation). You own the model
and the session. `mode: 'browser'` drives the real `form.requestSubmit()`
instead of an HTTP call.

## Use it with your existing SDK (OpenAI / Anthropic / MCP)

Already using function-calling? Get the tools in your SDK's format and execute
the model's calls through the same fail-closed safety gates:

```ts
import { extractAll, toOpenAITools, toAnthropicTools, toMCPTools, executeTool, AgentDOM } from 'agentic-microformats';

const dom = new AgentDOM(root);
const result = dom.extractAll();

const tools = toOpenAITools(result);      // or toAnthropicTools / toMCPTools
const reply = await openai.chat.completions.create({ model, messages, tools });

for (const call of reply.choices[0].message.tool_calls ?? []) {
  const out = await executeTool(dom, call.function.name, JSON.parse(call.function.arguments), {
    origin: location.origin,
    sendRequest: myAuthedFetch,                    // your session
    onConfirm: ({ tool, prepared }) => askHuman(tool, prepared),
  });
  // out.ok / out.refused (cross-origin or unconfirmed) / out.result
}
```

MCP keeps the safety hints as native tool annotations
(`readOnlyHint`/`destructiveHint`/`idempotentHint`); OpenAI/Anthropic fold them
into the description, where the model reads them.

## Lower-level extraction

```ts
import { AgentDOM } from 'agentic-microformats';

const agentDom = new AgentDOM(document.documentElement);
const { meta, resources, actions } = agentDom.extractAll();
const prepared = agentDom.prepareAction(actions[0], undefined, { origin: location.origin });
// prepared.confirmationRequired / prepared.blocked — the safety gates (spec §3.2, §12.5)
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
