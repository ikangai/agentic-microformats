# Agentic Microformats: Canonical Graph Serialization

**Version:** 0.3.0
**Status:** Working Draft
**Date:** August 2026
**Authors:** Martin Treiber, [IKANGAI](https://www.ikangai.com)
**License:** MIT

---

## Abstract

This document defines the canonical JSON serialization of an Agentic
Microformats extraction result — "the graph" — and two optional delivery
channels that let sites serve the graph directly, so agents never need to
download or parse HTML at all.

Extraction is deterministic (measured: 2–22 ms per page, zero model tokens,
roughly one third of the HTML's bytes). Serializing it canonically means
every producer — the TypeScript reference implementation, the Python port, a
site's own server-side renderer — emits byte-comparable output, and every
consumer can rely on one shape.

## 1. The Canonical Shape

```json
{
  "agentGraph": "0.3",
  "meta": { "page": { "type": "product-catalog" }, "...": "..." },
  "resources": [
    {
      "type": "product",
      "id": "SKU-12345",
      "properties": {
        "name": { "value": "USB-C Cable 2m" },
        "price": { "value": 14.99, "typehint": "currency", "currency": "EUR" },
        "url": { "value": "/product/SKU-12345", "typehint": "url" },
        "deprecation": {
          "value": "first occurrence",
          "values": ["first occurrence", "second occurrence"]
        }
      },
      "actions": [
        {
          "name": "add_to_cart",
          "method": "POST",
          "endpoint": "/api/cart/add",
          "idempotent": false,
          "response": { "success": "boolean", "cartItemId": "string" },
          "hints": { "risk": "low" },
          "params": [
            { "name": "quantity", "typehint": "integer", "min": 1, "max": 10, "value": "1" }
          ]
        }
      ],
      "children": []
    }
  ],
  "actions": []
}
```

## 2. Canonicalization Rules

Producers MUST apply all of the following:

1. **Version marker.** The top-level `agentGraph` key carries the
   serialization format version. Consumers MUST reject documents whose major
   version they do not understand.
2. **Omission over null.** Absent values are omitted entirely. `null` MUST
   NOT appear.
3. **Default elision.** `typehint` is omitted when it is `"string"` (the
   default). `hints.humanPreferred` appears only when `true`. Empty
   `actions`/`children` arrays on resources are omitted; the top-level
   `resources` and `actions` arrays always appear.
4. **Repeated properties** (core spec 5.2): `value` holds the first
   occurrence; `values` holds all occurrences in document order and appears
   only when there are two or more.
5. **Coerced values.** `value` entries are post-coercion (spec 5.3): a
   `currency` property serializes as a number, a `date` as its ISO string,
   an `integer` as a number.
6. **Document order.** Resources, actions, params, and `values` appear in
   DOM document order.
7. **No DOM references.** Element handles never serialize.
8. **Trust filtering is pre-applied.** Content in `untrusted` or ignored
   regions is absent from the graph — producers MUST apply core spec
   Section 10 before serializing. A consumer of the graph inherits the trust
   boundary by construction.

The reference producer is `toGraph` / `toGraphJSON` in the
`agentic-microformats` package; the Python port emits the identical shape.

## 3. Delivery

Serving the graph is OPTIONAL. Pages remain the source of truth; a served
graph is a projection of the page an agent would otherwise fetch.

### 3.1 Content Negotiation

Sites MAY honor the `Accept: application/agent+json` request header on any
annotated page route, responding with the canonical graph of that page:

```
GET /product/SKU-12345
Accept: application/agent+json

200 OK
Content-Type: application/agent+json
{ "agentGraph": "0.3", ... }
```

### 3.2 Well-Known Endpoint

Sites MAY expose `/.well-known/agent-graph?page=<path>` returning the graph
for the named page path, and SHOULD advertise it via the announcement header
(core spec 9.5): `X-Agent-Annotations: 0.3; graph=/.well-known/agent-graph`.

### 3.3 Consistency

A served graph MUST be equivalent to what a conforming extractor would
produce from the corresponding HTML at the same moment. Divergence between
the two is a defect: the annotations' contract with agents is *co-located
semantics* (core spec §2.2) — the machine view and the rendered page must
agree — and a graph that disagrees with the page breaks it. A Profile-B agent
(core spec §3.3) that can see both SHOULD treat the divergence as untrusted.

## 4. Media Type

Until registration, producers SHOULD use `application/agent+json`. The
payload is JSON; consumers MAY parse it with any JSON parser and MUST ignore
unknown top-level keys (forward compatibility).

## 5. Compact Encoding (OPTIONAL)

Collection pages repeat one action per item. On the reference demo's catalog,
the `add_to_cart` block is **52% of every product resource** and is
byte-identical across all six products except the SKU; at catalog scale that
redundancy dominates the document. The compact encoding removes it without
removing information.

### 5.1 Shape

A producer MAY hoist actions that occur two or more times with an identical
*signature* into a top-level `actionTemplates` object, replacing each
occurrence with a reference:

```json
{
  "agentGraph": "0.3",
  "agentGraphCompact": "0.1",
  "actionTemplates": {
    "t1": {
      "name": "add_to_cart",
      "method": "POST",
      "endpoint": "/api/cart/add",
      "hints": { "role": "primary", "risk": "low" },
      "params": [
        { "name": "product_id" },
        { "name": "quantity", "typehint": "integer", "required": true, "value": "1", "min": 1, "max": 10 }
      ]
    }
  },
  "resources": [
    {
      "type": "product", "id": "SKU-USB-C-2M",
      "properties": { "name": { "value": "USB-C Cable 2m" } },
      "actions": [
        { "$template": "t1", "target": "SKU-USB-C-2M", "params": { "product_id": "SKU-USB-C-2M" } }
      ]
    }
  ],
  "actions": []
}
```

### 5.2 Rules

1. **Signature.** Two actions share a template only when every field except
   `target`, `endpoint`, and parameter `value`s is identical. A differing
   `risk`, `method`, `response`, or parameter *shape* MUST prevent sharing —
   a template can never merge two actions an agent would treat differently.
2. **Threshold.** Only signatures occurring twice or more are hoisted. A
   single-occurrence action stays inline, because a template plus a reference
   is larger than the action itself.
3. **Common values stay in the template.** `endpoint` and any parameter
   `value` shared by every instance of a signature remain in the template;
   only genuinely per-instance data moves into the reference. A parameter in
   a template with no `value` key is bound per instance.
4. **Reference contents.** A reference carries `$template` plus only what
   differs: `target`, an overriding `endpoint`, and a `params` **object**
   (name → value) binding the template's unbound parameters. Note that a
   reference's `params` is an object, whereas a template's (and an inline
   action's) `params` is an array.
5. **Marker.** `agentGraphCompact` MUST be present when `actionTemplates`
   is, and MUST be absent when no template was produced. `agentGraph` retains
   its normal value: the compact form is an encoding of the same format
   version, not a new one.
6. **Losslessness.** Expansion MUST reproduce the canonical graph of the same
   resource set exactly. The reference implementation asserts byte-identity:
   `expandGraph(compactGraph(g))` serializes to the same string as `g`.
   Compaction is an encoding, so expansion undoes it completely; **selection is
   not**, and expanding a narrowed graph yields the narrowed resource set, not
   the page's full one. Expansion drops the `selection` block of §5.4 along with
   the compaction markers, so a consumer that expands a narrowed graph and
   forwards it has stripped the disclosure — expand for local use, and keep the
   compact document when passing it on.

### 5.3 Negotiation

Because the encoding is optional and a naive consumer would misread a
`$template` reference as an action, producers MUST NOT serve it unrequested.
Sites offering it SHOULD require an explicit opt-in:

```
Accept: application/agent+json; compact=1
```

A consumer that does not understand `agentGraphCompact` MUST ignore the
compact document or expand it before use; it MUST NOT treat a reference as an
executable action.

### 5.4 Selection is not serialization

Narrowing a graph to a task — dropping resources an intent cannot need — is a
*consumer-side* concern and deliberately not part of this format. It is lossy,
and only the party that holds the intent can judge the loss. A producer MUST
NOT drop resources and describe the result as the page's graph.

Where a narrowed graph is nonetheless exchanged, it MUST carry a `selection`
block so the recipient is never misled about completeness:

```json
"selection": { "narrowed": true, "resourcesShown": 1, "resourcesTotal": 6, "note": "..." }
```

An agent that concludes "this catalog has one product" from a silently
narrowed graph has been misinformed by its producer, not by the page.

**Implementation status:** the compact encoding and the consumer-side
selection layer ship in the TypeScript reference implementation (0.11.0) as
`compactGraph` / `expandGraph` / `selectTools`. The Python port implements the
canonical form of Sections 1–3; compaction is not yet ported.

---

## Changelog

### Version 0.4.0 (August 2026)

- Section 5: OPTIONAL compact encoding (`actionTemplates` / `$template`),
  after measuring that a repeated action template is the single largest
  redundancy in a collection graph. Lossless by construction and required to
  round-trip byte-identically.
- Section 5.4: selection is explicitly excluded from the wire format, with a
  `selection` disclosure block required when a narrowed graph is exchanged.

### Version 0.3.0 (August 2026)

- Initial draft, extracted from the benchmark harness's ad-hoc
  serialization after two arms independently needed one shape.
