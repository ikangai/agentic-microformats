# Agentic Microformats: WebMCP Binding

**Version:** 0.4.0 (Working Draft) · reference implementation 0.5.0
**Status:** Working Draft — the interaction half of the pivot
**Date:** August 2026
**Authors:** Martin Treiber, [IKANGAI](https://www.ikangai.com)
**License:** MIT

---

## Abstract

[WebMCP](https://webmachinelearning.github.io/webmcp/) (W3C Community Group;
Chrome experimentation) lets a page expose **tools** to a browser agent while
keeping the browser's origin, permission, authentication, tab lifecycle and UI
mechanics. Its declarative, from-existing-markup story is still thin. This
document defines the **binding** between the two: how the portable,
server-renderable `data-agent="action"` annotations compile into WebMCP tool
descriptors, and how a tool is invoked.

The position this establishes: Agentic Microformats does **not** define a rival
tool-invocation runtime. It is the inspectable, zero-JavaScript description that
(a) a static agent can read without any browser, and (b) *compiles into* a
WebMCP tool for live invocation where a capable browser exists.

## 1. The progressive-enhancement rule (normative)

> Removing all annotations MUST leave a complete, accessible human workflow;
> and an agent invoking an annotated action MUST pass through the same
> validation, authorization and application logic as a human using the control.

Therefore a tool's **default binding is the real HTML control**, not the raw
HTTP endpoint. An agent invokes by writing arguments into the annotated inputs
and submitting the control (`form.requestSubmit()`), so the page's own
validation, submit events, CSRF handling, auth and handlers all run. The
`data-agent-endpoint` is retained only as a fallback for actions that have no
form/control, and remains subject to the same-origin policy (§12.5).

## 2. Tool descriptor

Each action compiles to:

```json
{
  "name": "add_to_cart",
  "description": "Add this product to the cart — Cart updated.",
  "inputSchema": {
    "type": "object",
    "properties": { "quantity": { "type": "integer", "minimum": 1, "maximum": 10, "default": 1 } },
    "required": ["quantity"],
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": false, "humanConfirmationHint": true },
  "binding": { "type": "dom-form", "method": "POST", "endpoint": "/api/cart/add" },
  "resource": "SKU-1"
}
```

- **inputSchema** — JSON Schema built from the action's parameters:
  `data-agent-typehint` → `type` (integer / number / boolean / string),
  `data-agent-min`/`max` → `minimum`/`maximum`, `data-agent-required` → the
  `required` list; live control value → `default`. `additionalProperties`
  is `false`.
- **annotations** — the standard **MCP tool annotations**, derived from hints
  and method:
  | Annotation | Derived from |
  |---|---|
  | `readOnlyHint` | safe method (GET/HEAD/OPTIONS) |
  | `destructiveHint` | DELETE, `role="danger"`, or `risk="high"` |
  | `idempotentHint` | `data-agent-idempotent`, else HTTP method semantics |
  | `humanConfirmationHint` | the fail-closed rule (§3.2): human-preferred, cost, irreversible, high risk, or an un-hinted state-mutating method |
  | `costHint` | `data-agent-cost` (+ currency) |
  These are **publisher assertions**: an agent MAY raise caution beyond them
  and MUST NOT silently lower it (§3.2).
- **binding** — `dom-form` (a `<form>`), `dom-element` (button/anchor/input), or
  `http` (endpoint fallback, `sameOriginOnly`).

## 3. Invocation (normative)

To execute a tool an agent MUST:

1. Refuse if `humanConfirmationHint` is set and human confirmation has not been
   obtained (fail closed).
2. Write the arguments onto the action's annotated input elements (their live
   DOM properties, not attributes).
3. For a `dom-form`/`dom-element` binding, invoke the control
   (`form.requestSubmit(submitter?)`), letting the page perform the operation.
   For an `http` binding, issue the request only if same-origin (or explicitly
   `data-agent-cross-origin="true"`), never sending credentials cross-origin.
4. Observe the outcome through the page (the `data-agent-on-success` surface,
   the resource's read state — §2.11), not by trusting the tool's return value
   alone.

## 4. Reference

`toWebMCPTools(extractAll(root))` produces the descriptors (pure, server-side).
`registerWebMCPTools(result, host, opts)` registers them live with a WebMCP host
(`navigator.modelContext`), binding each `execute` to the DOM control and
enforcing the confirmation gate via `opts.onConfirm`. CLI: `--webmcp`.

## Changelog

### 0.4.0 (August 2026)
- Initial WebMCP binding: annotations → WebMCP tool descriptors (JSON Schema
  inputs, MCP tool annotations, DOM-control binding); runtime registration
  bound to `form.requestSubmit()`; CLI `--webmcp`.
