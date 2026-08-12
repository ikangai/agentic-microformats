# Agentic Microformats: Content Observation Layer

**Version:** 0.4.0 (Working Draft)
**Status:** Working Draft — the "own the layer WebMCP lacks" direction
**Date:** August 2026
**Authors:** Martin Treiber, [IKANGAI](https://www.ikangai.com)
**License:** MIT

---

## Abstract

The core spec's resource/action graph answers *"what can an agent do on this
page."* This document defines the complementary layer: *"what does this page
**say**"* — an inspectable **content observation** an agent reads before and
after it acts, so it has grounded understanding, not just a list of buttons.

The defining principle is **bridge, don't burden**: the observation is derived
from the structured formats a well-built page *already carries* — Schema.org
JSON-LD, Microformats2 (`h-entry`), Open Graph, semantic HTML, `<time>` — so a
site gets a useful content graph with **zero new annotation**. Authors are
never asked to hand-tag every paragraph.

This is the layer browser-tool protocols (WebMCP) do not cover: they invoke
tools; they do not give the agent a portable, server-renderable, grounded
reading of the document.

## 1. The Observation

```json
{
  "envelope": {
    "canonicalURL": "https://ex.com/post",
    "language": "en-US",
    "direction": "ltr",
    "title": "…"
  },
  "document": {
    "title":     { "value": "The Model Context Protocol", "source": "jsonld", "selector": "script[type=\"application/ld+json\"]" },
    "authors":   { "value": ["Ada L"], "source": "jsonld" },
    "published": { "value": "2024-12-02T06:46:23+00:00", "source": "jsonld" },
    "modified":  { "value": "2026-04-14T18:24:05+00:00", "source": "jsonld" },
    "publisher": { "value": "IKANGAI", "source": "jsonld" },
    "section":   { "value": ["AI", "Technology"], "source": "jsonld" },
    "keywords":  { "value": ["mcp", "agents"], "source": "jsonld" },
    "wordCount": { "value": 1202, "source": "jsonld" },
    "excerpt":   { "value": "Anthropic's Model Context Protocol …", "source": "derived" }
  },
  "sections": [
    { "level": 2, "headingPath": ["MCP Architecture"], "id": null, "text": "" }
  ],
  "provenance": ["jsonld:Article", "opengraph"]
}
```

## 2. Grounding (normative)

Every value in `document` is a **grounded value**: `{ value, source, selector? }`.

- `source` names *how* it was found: `jsonld` | `microformats` | `opengraph` |
  `meta` | `semantic-html` | `derived`. This lets an agent weight, cite, and
  re-verify each fact, and lets a human audit the extraction.
- `selector` points at the origin, so a value can be checked against what a
  human sees. (This is a deliberately light form of W3C Web Annotation
  selectors; richer TextQuote/TextPosition grounding is planned.)

An agent MUST NOT treat a `derived` value with the same confidence as one from
a structured source, and SHOULD prefer citing the visible passage a `selector`
points at over the normalized value.

## 3. Precedence

When multiple sources describe the same field, the first available wins:

```
JSON-LD  >  Microformats2  >  Open Graph / meta  >  semantic HTML  >  derived
```

Rationale: explicitly machine-authored data (JSON-LD) is more reliable than
data inferred from presentation. The chosen source is always recorded, so the
precedence decision is inspectable rather than hidden.

## 4. Sources bridged (informative)

| Field | JSON-LD | Microformats2 | Meta / OG | Semantic HTML |
|-------|---------|---------------|-----------|---------------|
| title | `headline` | `.p-name` / `.entry-title` | `og:title` | `article h1` |
| summary | `description` | — | `og:description`, `meta[name=description]` | — |
| authors | `author` (+`@id` deref) | `.p-author` / `.author` | `meta[name=author]` | — |
| published | `datePublished` | `time.published` / `.dt-published` | — | `time[datetime]` |
| modified | `dateModified` | `time.updated` / `.dt-updated` | — | — |
| publisher | `publisher` (+`@id` deref) | — | — | — |
| section | `articleSection` | — | — | — |
| keywords | `keywords` | — | — | — |
| wordCount | `wordCount` | — | — | derived from body |
| language | `inLanguage` | — | — | `html[lang]` |

`sections` is the heading outline (`h1`–`h6`, nested-aware) of the article
body (`.e-content` / `.entry-content` / `<article>` / `<main>`), with full
heading paths.

## 5. Trust

The content observation inherits the core trust model (§10): content inside
`untrusted`/ignored regions is excluded, and provenance is not authorization.
A future revision replaces the single trust level with explicit **data
provenance** (publisher / user / third-party / quotation / generated) plus
**instruction authority** (default: none), so that user-generated content
(reviews, comments) can be read as *quarantined, non-instructional data*
rather than erased.

## 6. Relationship to the action graph and to WebMCP

- **Content observation** (this doc) → what the page says. Portable,
  server-renderable, needs no JavaScript.
- **Resource/action graph** (`core.md`, `graph-serialization.md`) → what the
  page offers; the action's default binding is the visible HTML control.
- **WebMCP / native forms** → live, browser-mediated invocation.

The reference producer is `extractContent` in the `agentic-microformats`
package; `npx agentic-microformats <url> --content` prints an observation.

## Changelog

### 0.4.0 (August 2026)
- Initial content-observation layer: bridge JSON-LD / Microformats2 / OG /
  semantic HTML into a grounded, provenance-tagged observation; section
  outline; CLI `--content`.
