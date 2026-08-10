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
the two is a defect: the annotations' contract with agents is *visible
truth* (core spec 2.2), and a graph that disagrees with the page breaks it.

## 4. Media Type

Until registration, producers SHOULD use `application/agent+json`. The
payload is JSON; consumers MAY parse it with any JSON parser and MUST ignore
unknown top-level keys (forward compatibility).

---

## Changelog

### Version 0.3.0 (August 2026)

- Initial draft, extracted from the benchmark harness's ad-hoc
  serialization after two arms independently needed one shape.
