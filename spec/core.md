# Agentic Microformats Specification

**Version:** 0.2.0
**Status:** Working Draft
**Date:** February 2026  
**Authors:** Martin Treiber, [IKANGAI](https://www.ikangai.com)
**License:** MIT

---

## Abstract

Agentic Microformats turns the web into a shared, observable workspace where humans and agents act on the same interface—the DOM—with semantic hints that allow agents to learn by watching and assisting rather than replacing.

The specification defines a vocabulary of `data-agent-*` attributes that annotate existing HTML elements, making the meaning of UI elements and state changes legible to both human users and AI agents. This enables a mode of collaboration we call **shared operation**: like a sewing machine with both motor and hand wheel, the mechanism doesn't know or care which operator is active. Either can observe, act, and hand off to the other at any point.

This is not automation. It's assisted operation of the web.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Design Principles](#2-design-principles)
3. [Conformance](#3-conformance)
4. [Core Vocabulary](#4-core-vocabulary)
5. [Resource Layer](#5-resource-layer)
6. [Action Layer](#6-action-layer)
7. [Parameter Layer](#7-parameter-layer)
8. [Interaction Hints](#8-interaction-hints)
9. [Meta Layer](#9-meta-layer)
10. [Trust and Scope](#10-trust-and-scope)
11. [Processing Model](#11-processing-model)
12. [Security Considerations](#12-security-considerations)
13. [Accessibility Integration](#13-accessibility-integration)
14. [Internationalization](#14-internationalization)
15. [Extensibility](#15-extensibility)
16. [Examples](#16-examples)
17. [ABNF Grammar](#17-abnf-grammar)
18. [Glossary](#18-glossary)
19. [References](#19-references)
20. [Appendix A: Mapping to Other Specifications](#appendix-a-mapping-to-other-specifications)
21. [Appendix B: Relationship to Emerging Standards](#appendix-b-relationship-to-emerging-standards)
22. [Appendix C: Implementation Notes for Agent Developers](#appendix-c-implementation-notes-for-agent-developers)
23. [Appendix D: The Apprenticeship Model](#appendix-d-the-apprenticeship-model)
24. [Appendix E: Browser-Embedded Agents](#appendix-e-browser-embedded-agents)
25. [Changelog](#changelog)

---

## 1. Introduction

### 1.1 Background

When a user interacts with a web page, what actually happens is a sequence of DOM changes:

- Click → DOM changes
- Form submit → DOM changes  
- Navigation → DOM replaced
- Modal opens → DOM changes
- Error message → DOM changes

From the browser's perspective, everything is state transitions in the DOM. Humans interpret these changes semantically—they understand intention, progress, success, failure. AI agents can observe the same changes but need help interpreting what they mean.

Current approaches to web automation treat agents as replacements for humans: scripts that take over, workflows that execute independently, chatbots that operate in separate interfaces. These approaches create a fundamental split between "human mode" and "agent mode."

### 1.2 A Different Approach

Agentic Microformats takes a different stance: **there is no agent mode**.

Humans and agents operate on the same interface—the DOM. Both can observe the current state, perform available actions, and hand off to the other at any point. The semantic annotations don't control agents or define automation rules. They simply make the DOM legible to any operator, human or machine.

Think of a sewing machine with both a motor and a hand wheel:

- The motor provides automation
- The hand wheel provides manual control
- Both connect to the same mechanism
- You can switch mid-stitch without stopping
- The machine doesn't know or care which operator is active

This is the model for Agentic Microformats. The DOM is the shared mechanism. Actions from either operator produce the same state changes. The semantic annotations are the **clutch** that allows agents to engage meaningfully with the shared workspace.

### 1.3 What This Enables

When agents can interpret DOM state and changes, new modes of collaboration become possible:

**Observation**: An agent watches human actions alongside DOM changes, building understanding of what the interface does.

**Interpretation**: Semantic annotations explain what changes mean—"a project moved from pending to approved," not just "some text changed."

**Assistance**: The agent offers to help with similar actions, informed by what it has observed.

**Handoff**: Human and agent alternate freely. The human can step in at any DOM state; the agent can resume from any DOM state.

This is **apprenticeship**, not automation. The human doesn't write instructions—they do their work, and the agent watches with the benefit of semantic hints.

### 1.4 Scope

This specification defines:

- A vocabulary of HTML data attributes for marking up resources, actions, and metadata
- A processing model for agents to extract and interpret this information
- Security considerations for safe shared operation
- Integration with accessibility attributes
- Internationalization guidelines

This specification does NOT define:

- Agent behavior or decision-making algorithms
- Training mechanisms or learning systems
- Workflow engines or automation scripts
- Authentication or transport protocols

### 1.5 Relationship to Other Specifications

| Specification | Relationship |
|---------------|--------------|
| Microformats2 | Shares the philosophy of HTML-embedded semantics discovered through navigation |
| Schema.org | Complementary; can coexist; tools can generate mappings |
| JSON-LD | Agentic Microformats annotates visible elements; JSON-LD provides hidden metadata |
| MCP | Actions can be exposed as MCP tools; see Appendix A |
| HATEOAS | Makes REST's hypermedia principle explicit for shared human-agent operation |
| llms.txt | Complementary; llms.txt provides site-level discovery; Agentic Microformats provides page-level UI semantics |
| AGENTS.md | Complementary; AGENTS.md guides coding agents in repositories; Agentic Microformats guides browsing agents on pages |
| NLWeb | Complementary; NLWeb provides query interface; Agentic Microformats provides action discovery |

---

## 2. Design Principles

### 2.1 Shared Operation

Humans and agents operate on the same interface—the DOM. There is no separate "agent mode." Both can:

- Observe the current state
- Perform available actions
- Hand off to the other at any point

Like a sewing machine with both motor and hand wheel, the mechanism doesn't know or care which operator is active. Agentic Microformats makes this shared operation possible by ensuring both parties can interpret state and available actions.

### 2.2 Visible Truth

Agents read what users see. There is no separate metadata layer that can become inconsistent with the rendered page. If a price is displayed as "€50", the agent reads "€50" from the annotated element.

This ensures data integrity: by attaching semantics to visible content that humans view and verify, the data stays accurate and current. The DOM is the single source of truth for both operators.

### 2.3 HTML-First

All semantics are expressed as standard HTML `data-*` attributes. No new elements, no new file formats, no JavaScript requirements. The annotations live in the same document that humans see.

### 2.4 Progressive Enhancement

Pages MUST remain fully functional for human users when agent attributes are ignored. Agent annotations are additive, never required for basic functionality. A site without any annotations still works—agents just understand less.

### 2.5 Graceful Degradation

Agents MUST handle partially annotated pages without failure. A page with only one annotated action is valid. Missing optional attributes are not errors. Agents can still observe and act; they just have less semantic context.

### 2.6 Discovery Through Navigation

Agents discover site capabilities through navigation, not centralized manifests. As agents traverse pages, they accumulate understanding of available resource types, actions, and patterns.

This mirrors how humans learn to use a website: by exploring, observing, and building a mental model through experience. The sum of all page-level annotations *is* the site's agent interface.

### 2.7 Implicit Workflows

Rather than requiring explicit state machine definitions, agents infer workflows from:

- The current state of resources (via properties)
- The actions currently available
- Interaction hints that constrain behavior

This matches how real applications work and how humans understand them.

### 2.8 Safety by Default

The specification includes interaction hints that help agents make safe decisions: risk levels, human preference flags, and reversibility indicators. When hints are absent, agents SHOULD assume higher risk and request human confirmation.

### 2.9 Accessibility Integration

Agentic Microformats integrates with existing HTML and ARIA accessibility features. Where possible, agents SHOULD fall back to accessibility attributes. Don't annotate what HTML already expresses.

### 2.10 Reversible Autonomy

Because humans and agents share the same interface, humans can always:

- See what the agent is doing (visible DOM changes)
- Intervene at any point (take over the hand wheel)
- Correct mistakes (perform compensating actions)
- Resume agent assistance (let the motor run again)

There is no black box. The DOM is always visible, always inspectable, always controllable.

---

## 3. Conformance

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

### 3.1 Document Conformance

A conforming document:

1. MUST use valid HTML5 syntax
2. MUST use only the attributes defined in this specification for the `data-agent-*` namespace
3. MUST NOT use `data-agent-*` attributes in ways that contradict their defined semantics
4. SHOULD mark untrusted content regions appropriately (see Section 10)

### 3.2 Agent Conformance

A conforming agent:

1. MUST correctly parse all attributes defined in this specification
2. MUST ignore unknown `data-agent-*` attributes without error
3. MUST respect interaction hints when present
4. MUST ignore `data-agent-*` attributes within regions marked as untrusted
5. MUST respect HTML DOM state (disabled, hidden) when processing elements
6. SHOULD implement the processing model defined in Section 11
7. SHOULD fall back to accessibility attributes when agent-specific attributes are absent
8. SHOULD provide mechanisms for human oversight and intervention

---

## 4. Core Vocabulary

### 4.1 Attribute Overview

| Attribute | Layer | Purpose |
|-----------|-------|---------|
| `data-agent` | Core | Declares element type: `resource` or `action` |
| `data-agent-type` | Resource | Semantic type of the resource |
| `data-agent-id` | Resource | Unique identifier for the resource |
| `data-agent-prop` | Resource | Declares a property of a resource |
| `data-agent-typehint` | Resource | Data type hint for a property value |
| `data-agent-currency` | Resource | ISO 4217 currency code for monetary values |
| `data-agent-value` | Resource | Machine-readable value (when display differs) |
| `data-agent-name` | Action | Canonical name of the action |
| `data-agent-target` | Action | Resource ID this action applies to |
| `data-agent-method` | Action | HTTP method |
| `data-agent-endpoint` | Action | URL endpoint for the action |
| `data-agent-params` | Action | Comma-separated list of parameter names |
| `data-agent-headers` | Action | JSON object of required HTTP headers |
| `data-agent-param` | Parameter | Declares an input as a named parameter |
| `data-agent-required` | Parameter | Indicates a required parameter |
| `data-agent-role` | Hint | Semantic priority: primary, secondary, danger |
| `data-agent-risk` | Hint | Risk level: low, medium, high |
| `data-agent-human-preferred` | Hint | Suggests human confirmation |
| `data-agent-reversible` | Hint | Whether the action can be undone |
| `data-agent-cost` | Hint | Monetary cost indicator |
| `data-agent-on-success` | Action | Expected outcome after successful execution |
| `data-agent-response` | Action | JSON describing the response schema |
| `data-agent-min` | Parameter | Minimum allowed value |
| `data-agent-max` | Parameter | Maximum allowed value |
| `data-agent-description` | Meta | Human-readable description for agents |
| `data-agent-trust` | Scope | Trust level for a content region |
| `data-agent-ignore` | Scope | Excludes a subtree from agent parsing |

### 4.2 Naming Conventions

All attribute names:

- Begin with `data-agent-`
- Use lowercase letters and hyphens only

All attribute values:

- Are case-sensitive unless otherwise specified
- Use UTF-8 encoding
- Should avoid leading/trailing whitespace

---

## 5. Resource Layer

A **resource** is a logical domain object represented on the page: a product, project, ticket, user, invoice, or any entity the user can view or interact with.

### 5.1 Declaring a Resource

```html
<div data-agent="resource"
     data-agent-type="project"
     data-agent-id="PRJ-2025-001">
  <!-- Resource content -->
</div>
```

#### Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-agent="resource"` | REQUIRED | Declares this element as a resource container |
| `data-agent-type` | REQUIRED | The semantic type of the resource |
| `data-agent-id` | REQUIRED | A unique identifier for this resource instance |

### 5.2 Resource Properties

Properties are data fields belonging to a resource:

```html
<div data-agent="resource"
     data-agent-type="product"
     data-agent-id="SKU-12345">
  <h2 data-agent-prop="name">USB-C Cable 2m</h2>
  <span data-agent-prop="price" 
        data-agent-typehint="currency" 
        data-agent-currency="EUR">14.99</span>
  <span data-agent-prop="availability">in_stock</span>
</div>
```

### 5.3 Type Hints

Type hints help agents parse property values correctly:

| Typehint | Description | Example |
|----------|-------------|---------|
| `string` | Plain text (default) | "Hello World" |
| `number` | Numeric value | "14.99" |
| `integer` | Whole number | "42" |
| `boolean` | True/false | "true", "false" |
| `currency` | Monetary amount | "14.99" |
| `date` | ISO 8601 date | "2025-01-15" |
| `datetime` | ISO 8601 datetime | "2025-01-15T14:30:00Z" |
| `url` | Valid URL | "https://example.com" |
| `email` | Email address | "user@example.com" |
| `enum` | Fixed set of values | "pending", "approved" |
| `json` | JSON-encoded value | '{"key": "value"}' |

### 5.4 Currency Handling

For monetary values, specify the currency explicitly using ISO 4217 codes:

```html
<span data-agent-prop="price" 
      data-agent-typehint="currency"
      data-agent-currency="EUR">14.99</span>
```

Page-level default currency can be set in `data-agent-meta`:

```html
<script type="application/json" data-agent-meta>
{
  "defaults": { "currency": "EUR" }
}
</script>
```

### 5.5 Display vs. Machine Values

When displayed values differ from machine-readable values, use `data-agent-value`:

```html
<span data-agent-prop="deadline"
      data-agent-typehint="date"
      data-agent-value="2025-03-31">31. März 2025</span>
```

The agent reads `2025-03-31`; the human sees `31. März 2025`.

### 5.6 Nested Resources

Resources MAY be nested:

```html
<div data-agent="resource" data-agent-type="order" data-agent-id="ORD-789">
  <span data-agent-prop="status">processing</span>
  
  <div data-agent="resource" data-agent-type="order-item" data-agent-id="ITEM-001">
    <span data-agent-prop="product_name">Widget</span>
    <span data-agent-prop="quantity" data-agent-typehint="integer">2</span>
  </div>
</div>
```

---

## 6. Action Layer

An **action** is an operation that can be performed, typically corresponding to a button, link, or form submission in the UI.

### 6.1 Declaring an Action

```html
<button data-agent="action"
        data-agent-name="approve"
        data-agent-target="PRJ-2025-001"
        data-agent-method="POST"
        data-agent-endpoint="/api/projects/PRJ-2025-001/approve">
  Approve Project
</button>
```

#### Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-agent="action"` | REQUIRED | Declares this element as an action |
| `data-agent-name` | REQUIRED | Canonical name of the action |
| `data-agent-target` | RECOMMENDED | The resource ID this action operates on |
| `data-agent-method` | RECOMMENDED | HTTP method (defaults to POST) |
| `data-agent-endpoint` | RECOMMENDED | The URL to call |
| `data-agent-params` | OPTIONAL | Comma-separated parameter names |
| `data-agent-headers` | OPTIONAL | JSON object of HTTP headers |
| `data-agent-on-success` | OPTIONAL | Description of expected outcome |
| `data-agent-response` | OPTIONAL | JSON describing the response schema |
| `data-agent-description` | OPTIONAL | Human-readable description |

### 6.2 Actions Within Resources

When `data-agent-target` is omitted, the action applies to the nearest ancestor resource:

```html
<div data-agent="resource" data-agent-type="ticket" data-agent-id="T-91">
  <span data-agent-prop="status">open</span>
  
  <button data-agent="action"
          data-agent-name="close"
          data-agent-method="POST"
          data-agent-endpoint="/api/tickets/T-91/close">
    Close Ticket
  </button>
</div>
```

### 6.3 Form-Based Actions

For complex actions with multiple parameters:

```html
<form data-agent="action"
      data-agent-name="submit_application"
      data-agent-method="POST"
      data-agent-endpoint="/api/applications"
      data-agent-headers='{"Content-Type": "application/json"}'>
  
  <input data-agent-param="applicant_name" name="name" required>
  <input data-agent-param="email" type="email" required>
  
  <button type="submit">Submit</button>
</form>
```

### 6.4 HTTP Headers

For APIs requiring specific headers:

```html
<form data-agent="action"
      data-agent-headers='{"Content-Type": "application/json", "X-Requested-With": "AgentRequest"}'>
```

### 6.5 Authentication Context

This specification does not define authentication mechanisms. 

**Browser-based agents** operating within a user's session MAY inherit session cookies. Publishers should implement CSRF protections.

**External agents** MUST obtain credentials through out-of-band mechanisms. The meta layer can hint at authentication requirements:

```html
<script type="application/json" data-agent-meta>
{
  "agent_policies": {
    "require_auth": true,
    "auth_method": "oauth2"
  }
}
</script>
```

### 6.6 Response Handling

Agents SHOULD interpret HTTP status codes conventionally:
- 2xx = success
- 3xx = redirect
- 4xx = client error
- 5xx = server error

### 6.7 Response Schema

Actions MAY declare their expected response shape using `data-agent-response`:

```html
<form data-agent="action"
      data-agent-name="add_to_cart"
      data-agent-method="POST"
      data-agent-endpoint="/api/cart/add"
      data-agent-response='{"success":"boolean","message":"string","cartCount":"integer","cartTotal":"number"}'>
```

The value is a JSON object where keys are field names and values are type hints (matching the vocabulary from Section 5.3). This lets agents plan multi-step workflows without trial-and-error—they know what data will be available after an action succeeds.

### 6.8 Success Outcome Hints

Actions MAY describe the expected outcome after successful execution using `data-agent-on-success`:

```html
<form data-agent="action"
      data-agent-name="add_to_cart"
      data-agent-on-success="Item added to cart. Cart count and total updated in response. Navigate to /cart to view cart.">
```

The value is natural-language text describing what happens next—whether the page updates in place, a redirect occurs, or the agent should navigate elsewhere. This helps agents chain actions into multi-step workflows.

---

## 7. Parameter Layer

**Parameters** are input values required or accepted by an action.

### 7.1 Declaring Parameters

```html
<input data-agent-param="quantity"
       data-agent-typehint="integer"
       type="number"
       min="1"
       required>
```

### 7.2 Required Parameters

A parameter is required if ANY of these is true:

1. `data-agent-required="true"` is present
2. HTML `required` attribute is present
3. `aria-required="true"` is present

Agents SHOULD check all three (Minimal Annotation principle).

### 7.3 Nested Parameters

For nested JSON structures, use dot notation:

```html
<input data-agent-param="user.preferences.theme" value="dark">
<input data-agent-param="user.preferences.language" value="de">
```

Agents construct:

```json
{
  "user": {
    "preferences": {
      "theme": "dark",
      "language": "de"
    }
  }
}
```

### 7.4 Validation Constraints

Parameters MAY declare value constraints using `data-agent-min` and `data-agent-max`:

```html
<input data-agent-param="quantity"
       data-agent-typehint="integer"
       data-agent-min="1"
       data-agent-max="10"
       type="number" min="1" max="10" required>
```

| Attribute | Description |
|-----------|-------------|
| `data-agent-min` | Minimum allowed value (numeric) or minimum length (string) |
| `data-agent-max` | Maximum allowed value (numeric) or maximum length (string) |

The interpretation depends on `data-agent-typehint`:
- For `integer` and `number`: numeric range (e.g., quantity 1–10)
- For `string`: character length (e.g., max 16 characters for a card number)

These attributes mirror server-side validation rules, helping agents construct valid requests without trial-and-error. Where HTML `min`/`max` attributes are present, `data-agent-min`/`data-agent-max` provide explicit confirmation for agents that may not inspect native HTML validation attributes.

### 7.5 DOM State

Agents MUST respect HTML DOM state:

- Parameters on `disabled` inputs are **unavailable**
- Parameters on `hidden` inputs are **available** (intentionally hidden)
- Actions on disabled elements are **unavailable**

---

## 8. Interaction Hints

**Interaction hints** guide agent decision-making around safety and human involvement.

### 8.1 Role

```html
<button data-agent="action" data-agent-role="primary">Save</button>
<button data-agent="action" data-agent-role="secondary">Cancel</button>
<button data-agent="action" data-agent-role="danger">Delete</button>
```

| Value | Meaning |
|-------|---------|
| `primary` | Main/expected action |
| `secondary` | Alternative action |
| `danger` | Destructive action—request confirmation |

### 8.2 Risk Level

```html
<button data-agent="action" data-agent-risk="high">Delete Account</button>
```

| Value | Meaning |
|-------|---------|
| `low` | Safe for automatic execution |
| `medium` | Inform user before executing |
| `high` | MUST request explicit confirmation |

### 8.3 Human Preferred

```html
<button data-agent="action" data-agent-human-preferred="true">Approve</button>
```

When `true`, agents SHOULD present the action to the user rather than executing automatically. This is the "hand wheel" moment—the human should turn this one.

### 8.4 Reversibility

```html
<button data-agent="action" data-agent-reversible="true">Archive</button>
<button data-agent="action" data-agent-reversible="false">Delete</button>
```

Irreversible actions warrant extra caution and confirmation.

### 8.5 Cost

```html
<button data-agent="action"
        data-agent-cost="49.99"
        data-agent-cost-currency="EUR">
  Purchase
</button>
```

When `data-agent-cost` is present and greater than zero, agents MUST request user confirmation.

### 8.6 Description Fallback

When `data-agent-description` is absent, agents SHOULD fall back to:

1. `aria-label`
2. `aria-describedby` content
3. `title` attribute
4. Element text content

---

## 9. Meta Layer

The **meta layer** provides page-level context.

### 9.1 Page-Level Metadata

```html
<script type="application/json" data-agent-meta>
{
  "provider": {
    "name": "IKANGAI GmbH",
    "jurisdiction": "AT"
  },
  "defaults": {
    "currency": "EUR",
    "locale": "de-AT"
  },
  "page": {
    "type": "project-dashboard"
  },
  "agent_policies": {
    "rate_limit": { "requests_per_minute": 60 }
  }
}
</script>
```

### 9.2 Extended Metadata

The meta layer MAY include additional sections to help agents plan multi-step workflows before navigating:

#### 9.2.1 Workflow Graph

A `workflow` object describes the navigation flow between page types:

```html
<script type="application/json" data-agent-meta>
{
  "workflow": {
    "graph": {
      "product-catalog": { "next": ["product-detail", "shopping-cart"] },
      "product-detail": { "next": ["shopping-cart"] },
      "shopping-cart": { "next": ["checkout", "product-catalog"] },
      "checkout": { "next": ["order-confirmation"] }
    },
    "entryPoint": "product-catalog"
  }
}
</script>
```

Keys in `graph` correspond to `page.type` values. Each entry lists the page types reachable from that page. The `entryPoint` identifies the starting page for a typical user journey.

#### 9.2.2 Actions Summary

An `actions` object lists available actions per page type:

```json
{
  "actions": {
    "product-catalog": [
      { "name": "add_to_cart", "method": "POST", "endpoint": "/api/cart/add" }
    ],
    "shopping-cart": [
      { "name": "update_quantity", "method": "PATCH", "endpoint": "/api/cart/:id" },
      { "name": "remove_from_cart", "method": "DELETE", "endpoint": "/api/cart/:id" }
    ]
  }
}
```

This lets agents know what capabilities a page offers before navigating to it.

#### 9.2.3 Response Schemas

A `responseSchemas` object describes the expected JSON response for each action:

```json
{
  "responseSchemas": {
    "add_to_cart": {
      "success": "boolean",
      "message": "string",
      "cartCount": "integer",
      "cartTotal": "number"
    }
  }
}
```

Type values match the vocabulary from Section 5.3. This complements per-action `data-agent-response` attributes (Section 6.7) by providing a centralized reference.

### 9.4 Discovery Through Navigation

Agents discover site capabilities through navigation, not centralized manifests. As agents traverse pages, they encounter resources, actions, and patterns, building understanding incrementally.

This mirrors human learning: you don't read a manual before using a website—you explore, observe, and develop a mental model.

Sites MAY provide navigation hints:

```html
<!-- Suggest good starting points -->
<a href="/products" rel="agent-start">Browse Products</a>
<a href="/account" rel="agent-start">Account Settings</a>
```

There is no required central manifest. The sum of all page-level annotations *is* the site's agent interface.

### 9.5 Linking Related Resources

Sites with complementary documentation MAY reference it:

```html
<script type="application/json" data-agent-meta>
{
  "related": {
    "documentation": "/llms.txt",
    "api_spec": "/api/openapi.json"
  }
}
</script>
```

This helps agents find additional context without requiring a separate discovery mechanism.

---

## 10. Trust and Scope

### 10.1 Trust Levels

User-generated content may contain malicious annotations. Mark trust boundaries explicitly:

```html
<main data-agent-trust="system">
  <!-- Safe to parse -->
</main>

<section class="comments" data-agent-trust="untrusted">
  <!-- Agents MUST ignore all data-agent-* here -->
</section>
```

| Value | Meaning |
|-------|---------|
| `system` | Site-generated content (default) |
| `untrusted` | User-generated content—ignore agent attributes |
| `verified` | Verified content (e.g., verified reviews) |

### 10.2 Ignoring Subtrees

```html
<aside data-agent-ignore="true">
  <!-- Agents skip this entirely -->
</aside>
```

### 10.3 Trust Inheritance

Trust levels inherit to descendants unless overridden.

---

## 11. Processing Model

### 11.1 Extraction Phase

1. Parse HTML into DOM tree
2. Identify trust boundaries (`data-agent-trust`, `data-agent-ignore`)
3. Find resources outside untrusted regions
4. For each resource, extract properties and actions
5. Find standalone actions
6. Apply accessibility fallbacks
7. Extract page metadata

### 11.2 Observation Phase

When operating alongside a human user, agents observe:

1. **DOM mutations**: What elements changed?
2. **User actions**: What preceded the change?
3. **Semantic context**: What do annotations say about the change?

This builds the agent's understanding of how the interface works.

### 11.3 Execution Phase

When executing an action:

1. Verify trust (not in untrusted region)
2. Check DOM state (not disabled)
3. Check hints (risk, cost, human-preferred)
4. Request confirmation if needed
5. Gather and validate parameters
6. Construct and send request
7. Observe response and DOM changes

### 11.4 Handoff

At any point:

- Human can perform an action the agent was about to do
- Agent can assist with an action the human started
- Either can pause and let the other continue

The DOM state after any action is equally valid for either operator to continue from.

### 11.5 Dynamic Content

In SPAs, DOM changes continuously. Browser-based agents SHOULD observe mutations. The annotations on dynamically added content are processed the same as initial content.

---

## 12. Security Considerations

### 12.1 Trust Region Enforcement

Agents MUST:

1. Never execute actions from untrusted regions
2. Never read resources from ignored regions
3. Verify parent trust before acting

### 12.2 High-Risk Actions

For `data-agent-risk="high"`, `data-agent-cost > 0`, or `data-agent-reversible="false"`:

1. Request explicit user confirmation
2. Display action details clearly
3. Provide cancel option

### 12.3 Visible Operation

Because agents operate on the visible DOM:

- Humans see what agents do
- Humans can intervene
- Debugging is straightforward
- Trust is verifiable

This is the opposite of "AI magic behind the scenes."

### 12.4 Rate Limiting

Respect `agent_policies.rate_limit`. Default to conservative behavior (1 request/second) when unspecified.

---

## 13. Accessibility Integration

### 13.1 Fallback Hierarchy

Agents use existing accessibility attributes:

| Agent Attribute | Fallback |
|-----------------|----------|
| `data-agent-description` | `aria-label` → `aria-describedby` → `title` |
| `data-agent-required` | HTML `required` → `aria-required` |

### 13.2 No Duplication

Don't annotate what HTML already expresses:

```html
<!-- Good: let HTML express required -->
<input data-agent-param="email" type="email" required>

<!-- Unnecessary: duplicates HTML -->
<input data-agent-param="email" data-agent-required="true" required>
```

### 13.3 Shared Semantics

Accessibility and agent semantics often align. Both make interfaces understandable to non-visual operators. Accessible sites are often easier for agents to understand.

---

## 14. Internationalization

### 14.1 Currency

Use ISO 4217 codes:

```html
<span data-agent-prop="price"
      data-agent-typehint="currency"
      data-agent-currency="EUR">14,99</span>
```

### 14.2 Dates

Use ISO 8601 with `data-agent-value` for machine-readable format:

```html
<span data-agent-prop="deadline"
      data-agent-typehint="date"
      data-agent-value="2025-03-31">31. März 2025</span>
```

### 14.3 Locale

Set defaults in meta:

```html
<script type="application/json" data-agent-meta>
{
  "defaults": {
    "locale": "de-AT",
    "timezone": "Europe/Vienna"
  }
}
</script>
```

---

## 15. Extensibility

### 15.1 Custom Attributes

Use `data-agent-x-` prefix:

```html
<button data-agent="action"
        data-agent-x-workflow-step="3"
        data-agent-x-requires-approval="manager">
```

### 15.2 Custom Resource Types

Any `data-agent-type` value is valid. Document custom types for interoperability.

### 15.3 Future Extensions

Reserved for future versions:

- Process Layer: Explicit workflow notation
- Trust Layer: Cryptographic verification
- Federation: Cross-site workflows

---

## 16. Examples

### 16.1 E-Commerce Product Page

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>USB-C Cable - Example Shop</title>
</head>
<body>
  <script type="application/json" data-agent-meta>
  {
    "provider": { "name": "Example Shop GmbH", "jurisdiction": "AT" },
    "defaults": { "currency": "EUR" }
  }
  </script>

  <main data-agent-trust="system">
    <article data-agent="resource"
             data-agent-type="product"
             data-agent-id="SKU-USB-C-2M">
      
      <h1 data-agent-prop="name">USB-C Cable 2m</h1>
      
      <span data-agent-prop="price" 
            data-agent-typehint="currency"
            data-agent-currency="EUR">14.99</span>
      
      <span data-agent-prop="availability">in_stock</span>
      
      <form data-agent="action"
            data-agent-name="add_to_cart"
            data-agent-method="POST"
            data-agent-endpoint="/cart/add"
            data-agent-role="primary">
        
        <input data-agent-param="product_id" type="hidden" value="SKU-USB-C-2M">
        
        <input data-agent-param="quantity"
               data-agent-typehint="integer"
               type="number" min="1" value="1" required>
        
        <button type="submit">Add to Cart</button>
      </form>
    </article>
  </main>
  
  <section class="reviews" data-agent-trust="untrusted">
    <h2>Customer Reviews</h2>
    <!-- Agent ignores annotations in reviews -->
  </section>
</body>
</html>
```

### 16.2 Project Dashboard with Shared Operation

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Project Dashboard - IKANGAI</title>
</head>
<body>
  <script type="application/json" data-agent-meta>
  {
    "provider": { "name": "IKANGAI GmbH" },
    "defaults": { "currency": "EUR", "timezone": "Europe/Vienna" },
    "page": { "type": "project-dashboard" },
    "agent_policies": { "require_auth": true }
  }
  </script>

  <main data-agent-trust="system">
    <section data-agent="resource"
             data-agent-type="project"
             data-agent-id="PRJ-2025-001">
      
      <h2 data-agent-prop="name">Website Redesign</h2>
      
      <dl>
        <dt>Status</dt>
        <dd data-agent-prop="status">active</dd>
        
        <dt>Progress</dt>
        <dd data-agent-prop="progress" data-agent-typehint="integer">65</dd>
        
        <dt>Due</dt>
        <dd data-agent-prop="due_date" 
            data-agent-typehint="date"
            data-agent-value="2025-03-31">31. März 2025</dd>
      </dl>
      
      <!-- Primary action: agent may execute if appropriate -->
      <button data-agent="action"
              data-agent-name="update_progress"
              data-agent-method="PATCH"
              data-agent-endpoint="/api/projects/PRJ-2025-001"
              data-agent-params="progress"
              data-agent-role="primary">
        Update Progress
      </button>
      
      <!-- Human-preferred: agent should let human decide -->
      <button data-agent="action"
              data-agent-name="mark_complete"
              data-agent-method="POST"
              data-agent-endpoint="/api/projects/PRJ-2025-001/complete"
              data-agent-human-preferred="true"
              aria-label="Mark this project as complete">
        Complete Project
      </button>
      
      <!-- Danger: agent must confirm before executing -->
      <button data-agent="action"
              data-agent-name="delete"
              data-agent-method="DELETE"
              data-agent-endpoint="/api/projects/PRJ-2025-001"
              data-agent-role="danger"
              data-agent-risk="high"
              data-agent-reversible="false">
        Delete
      </button>
    </section>
  </main>
</body>
</html>
```

In this example:
- **Update Progress**: Agent may execute autonomously (motor running)
- **Complete Project**: Agent should present to human (hand wheel moment)
- **Delete**: Agent must stop and confirm (safety interlock)

The human can perform any of these at any time. The agent can assist or step back. Same interface, shared operation.

---

## 17. ABNF Grammar

```abnf
; Core
resource-decl     = 'data-agent="resource"'
action-decl       = 'data-agent="action"'

; Resource
resource-type     = 'data-agent-type="' type-value '"'
resource-id       = 'data-agent-id="' id-value '"'
prop-decl         = 'data-agent-prop="' prop-name '"'
typehint          = 'data-agent-typehint="' hint-value '"'
currency-attr     = 'data-agent-currency="' currency-code '"'
value-override    = 'data-agent-value="' text-value '"'

; Action
action-name       = 'data-agent-name="' name-value '"'
action-target     = 'data-agent-target="' id-value '"'
action-method     = 'data-agent-method="' method-value '"'
action-endpoint   = 'data-agent-endpoint="' url-value '"'
action-params     = 'data-agent-params="' params-list '"'
action-headers    = 'data-agent-headers="' json-value '"'
action-on-success = 'data-agent-on-success="' text-value '"'
action-response   = 'data-agent-response="' json-value '"'

; Parameter
param-decl        = 'data-agent-param="' param-path '"'
param-required    = 'data-agent-required="' bool-value '"'
param-min         = 'data-agent-min="' number-value '"'
param-max         = 'data-agent-max="' number-value '"'

; Hints
hint-role         = 'data-agent-role="' role-value '"'
hint-risk         = 'data-agent-risk="' risk-value '"'
hint-human        = 'data-agent-human-preferred="' bool-value '"'
hint-reversible   = 'data-agent-reversible="' bool-value '"'
hint-cost         = 'data-agent-cost="' number-value '"'

; Trust
trust-level       = 'data-agent-trust="' trust-value '"'
ignore-region     = 'data-agent-ignore="' bool-value '"'

; Values
type-value        = 1*( ALPHA / DIGIT / "-" / "_" )
id-value          = 1*( ALPHA / DIGIT / "-" / "_" / "." )
prop-name         = 1*( ALPHA / DIGIT / "_" )
param-path        = prop-name *( "." prop-name )
name-value        = 1*( ALPHA / DIGIT / "_" )
method-value      = "GET" / "POST" / "PUT" / "PATCH" / "DELETE" / "HEAD" / "OPTIONS"
hint-value        = "string" / "number" / "integer" / "boolean" / 
                    "currency" / "date" / "datetime" / "url" / "email" / "enum" / "json"
role-value        = "primary" / "secondary" / "danger"
risk-value        = "low" / "medium" / "high"
trust-value       = "system" / "untrusted" / "verified"
bool-value        = "true" / "false"
number-value      = [ "-" ] 1*DIGIT [ "." 1*DIGIT ]
currency-code     = 3ALPHA
params-list       = param-path *( "," param-path )
```

---

## 18. Glossary

**Action**: An operation that can be performed, corresponding to a UI element like a button or form.

**Agent**: An automated system capable of observing the DOM, interpreting annotations, and performing actions.

**Apprenticeship**: The mode of learning where agents observe human actions and DOM changes to build understanding.

**Handoff**: The moment when control passes from human to agent or vice versa.

**Human-Preferred**: An action that should be presented to the human rather than executed automatically.

**Resource**: A domain object represented on the page (product, project, ticket, etc.).

**Shared Operation**: The principle that humans and agents operate on the same interface without mode switching.

**Visible Truth**: The principle that agents read what users see, with no hidden metadata layer.

---

## 19. References

### Normative

- **[RFC2119]** Key words for use in RFCs
- **[HTML5]** WHATWG HTML Living Standard
- **[ISO4217]** Currency codes
- **[ISO8601]** Date and time format

### Informative

- **[Microformats2]** http://microformats.org/wiki/microformats2
- **[MCP]** Model Context Protocol, https://modelcontextprotocol.io/
- **[ARIA]** WAI-ARIA 1.2
- **[llms.txt]** https://llmstxt.org/
- **[AGENTS.md]** https://agents.md/
- **[NLWeb]** https://github.com/microsoft/NLWeb

---

## Appendix A: Mapping to Other Specifications

### A.1 MCP Tool Definition

```javascript
// From Agentic Microformat
const action = {
  name: "add_to_cart",
  method: "POST",
  endpoint: "/cart/add",
  params: [{ name: "product_id" }, { name: "quantity", typehint: "integer" }]
};

// To MCP tool
const mcpTool = {
  name: "add_to_cart",
  inputSchema: {
    type: "object",
    properties: {
      product_id: { type: "string" },
      quantity: { type: "integer" }
    },
    required: ["product_id", "quantity"]
  }
};
```

### A.2 Schema.org Mapping

| Agentic Type | Schema.org |
|--------------|------------|
| `product` | `schema:Product` |
| `order` | `schema:Order` |
| `event` | `schema:Event` |

---

## Appendix B: Relationship to Emerging Standards

| Standard | Layer | Purpose |
|----------|-------|---------|
| AGENTS.md | Repository | Instructions for coding agents working on source code |
| llms.txt | Site | Curated site overview and navigation for LLMs |
| NLWeb | Site | Natural language query interface |
| agents.json | Site | API contracts and policies |
| **Agentic Microformats** | Page | UI semantics for shared operation |

These are complementary. A project might use:
- AGENTS.md for coding agents working in the repository
- llms.txt for LLMs approaching the deployed site
- NLWeb for conversational queries
- Agentic Microformats for understanding and interacting with individual pages

The key difference: Agentic Microformats embeds semantics in the visible UI, enabling human-agent shared operation on the same interface.

---

## Appendix C: Implementation Notes

### C.1 For Agent Developers

Agents should:

1. Observe DOM state and changes
2. Correlate user actions with DOM mutations
3. Use annotations to interpret meaning
4. Build affordance mappings over time
5. Offer assistance based on observed patterns
6. Respect human-preferred hints
7. Confirm high-risk actions

### C.2 For Site Publishers

Publishers should:

1. Annotate key resources and actions
2. Mark user-generated content as untrusted
3. Use interaction hints for dangerous actions
4. Rely on HTML/ARIA where possible
5. Test with agents to verify interpretability

---

## Appendix D: The Apprenticeship Model

Agentic Microformats enables a mode of human-AI collaboration we call **apprenticeship**.

### D.1 How It Works

1. **Observation**: The agent watches human actions alongside DOM changes
2. **Interpretation**: Semantic annotations explain what changes mean
3. **Assistance**: The agent offers help with similar tasks
4. **Handoff**: Human and agent alternate freely

### D.2 What the Agent Learns

Not rules or scripts—**affordance mappings**:

- "This button usually finalizes a transaction"
- "This field is required before that action"
- "This action often follows human confirmation"
- "When this DOM change occurs, it usually means success"

### D.3 Key Properties

**No hidden state**: Everything happens in the observable DOM.

**Reversible autonomy**: Humans can intervene at any point.

**Graceful degradation**: Without metadata, agents can still observe; they just understand less.

**Continuous handoff**: No "start agent" or "stop agent"—just shared operation.

### D.4 The Sewing Machine Metaphor

Like a sewing machine with motor and hand wheel:

- Both connect to the same mechanism
- Either can operate at any time
- The machine doesn't know which is active
- You can switch mid-stitch
- The fabric is always visible
- You can stop instantly

The DOM is the fabric. Actions are stitches. The annotations are the guides that help both operators work precisely.

### D.5 Why This Matters

This approach avoids the classic automation trap:

| Traditional Automation | Apprenticeship Model |
|------------------------|----------------------|
| Formalize everything upfront | Reality (DOM) is primary |
| Automation breaks when reality changes | Semantics are hints, not constraints |
| Human or machine—pick one | Humans can always intervene |
| Black box operation | Visible, inspectable, controllable |

The web remains a human interface. Agents become assistants who can observe, learn, and help—without taking over.

---

## Appendix E: Browser-Embedded Agents

Modern browsers are beginning to integrate LLMs directly into the browsing experience. Examples include Atlas (OpenAI), Comet (Perplexity), and various AI features in browsers like Arc. These browser-embedded agents represent the natural home for Agentic Microformats—where the sewing machine metaphor becomes literal rather than analogical.

### E.1 The Browser as Shared Workspace

When the LLM lives inside the browser, the architecture looks like this:

```
┌─────────────────────────────────────────────────┐
│                   BROWSER                        │
│  ┌───────────────────────────────────────────┐  │
│  │                  DOM                       │  │
│  │         (the shared mechanism)             │  │
│  └───────────────────────────────────────────┘  │
│         ▲                         ▲             │
│         │                         │             │
│    ┌────┴────┐               ┌────┴────┐        │
│    │  Human  │               │ Browser │        │
│    │  Input  │               │   LLM   │        │
│    │(hand wheel)             │ (motor) │        │
│    └─────────┘               └─────────┘        │
└─────────────────────────────────────────────────┘
```

There is no API call, no network hop, no separate agent runtime. The LLM observes the same DOM the human sees, in real-time, with full access to mutations as they happen. Both operators manipulate the same mechanism within the same process.

### E.2 Advantages Over External Agents

External agents (such as cloud-based computer-use systems) typically operate through a perception-action loop:

1. Capture screenshot
2. Process through vision model
3. Infer UI state
4. Plan action
5. Execute via automation framework
6. Repeat

This introduces latency, potential for stale state, and vision errors (misidentified buttons, misread text, lost context).

Browser-embedded agents bypass this entirely:

| External Agent | Browser-Embedded Agent |
|----------------|------------------------|
| Screenshot → Vision → Inference | Direct DOM access |
| Latency per action | Real-time observation |
| Vision errors possible | No vision required |
| State may be stale | State is always current |
| Separate runtime | Shared runtime with UI |

For browser-embedded agents, Agentic Microformats become a **native interface** rather than a layer on top of computer vision.

### E.3 No Vision Required

One of the persistent challenges with computer-use agents is vision reliability. Buttons may be misidentified, text misread, dynamic content missed. 

With DOM-level annotations, a browser-embedded agent doesn't need vision at all for annotated elements:

```html
<button data-agent="action"
        data-agent-name="submit_order"
        data-agent-risk="high"
        data-agent-cost="149.99"
        data-agent-cost-currency="EUR">
  Complete Purchase
</button>
```

The agent reads directly:
- This is an action named `submit_order`
- Risk level: high
- Cost: €149.99
- Requires confirmation

No OCR. No bounding box detection. No "is this a button or a div styled like a button?" inference. The semantics are explicit and machine-readable.

### E.4 Native Observation Loop

Section 11.2 describes the Observation Phase where agents watch DOM mutations alongside user actions. For browser-embedded LLMs, this is trivially implemented:

```javascript
// Browser-embedded agent observation (conceptual)
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    // Extract semantic context from Agentic Microformats
    const context = extractAgentAnnotations(mutation.target);
    
    // Correlate with recent user action
    const userAction = getRecentUserAction();
    
    // Build affordance mapping
    agent.learn({
      trigger: userAction,
      result: mutation,
      semantics: context
    });
  }
});

observer.observe(document.body, { 
  childList: true, 
  subtree: true, 
  attributes: true,
  attributeFilter: ['data-agent-prop', 'class', 'disabled']
});
```

The apprenticeship model (Appendix D) isn't a theoretical possibility for browser-embedded agents—it's the natural operating mode. The agent continuously:

1. Watches what the human does
2. Observes how the DOM responds
3. Reads annotations to understand meaning
4. Builds affordance mappings
5. Offers assistance based on learned patterns

### E.5 Handoff Within the Browser

The handoff between human and agent becomes seamless in a browser-embedded context:

**Human working, agent watching:**
> User fills out a form. Agent observes field values, notes which fields have `data-agent-required`, learns the submission pattern.

**Agent assists:**
> "I notice you're filling out the shipping form. Based on your previous orders, would you like me to fill in your saved address?"

**Human takes over:**
> User declines, prefers to enter a different address manually. Agent observes the new values.

**Agent completes:**
> "Ready to submit? This will charge €149.99 to your card." User confirms. Agent clicks submit.

**Human verifies:**
> User sees confirmation page. Agent reads `data-agent-prop="order_status"` showing "confirmed."

This isn't a mode switch. It's continuous collaboration within the same interface, each party taking the wheel as appropriate.

### E.6 Trust in the Browser Context

Browser-embedded agents operate with the user's session credentials. This raises important trust considerations:

**Session Inheritance**: The agent acts with the user's authenticated session. Actions have real consequences—purchases, data changes, account modifications.

**Trust Boundaries**: The `data-agent-trust` attribute (Section 10) becomes critical. Browser-embedded agents MUST respect trust regions, ignoring annotations in user-generated content that might attempt session hijacking.

**User Consent**: Browsers implementing embedded agents SHOULD provide clear UI for:
- When the agent is observing
- When the agent is about to act
- How to pause or disable agent assistance

**CSRF Awareness**: Since the agent shares the user's session, it also shares CSRF vulnerabilities. Sites SHOULD implement standard CSRF protections. Agents SHOULD respect `data-agent-human-preferred` for state-changing actions.

### E.7 Browser Extension Bridge

Even before browsers ship native LLM integration, the benefits of browser-embedded agents can be approximated via extensions:

```
┌─────────────────────────────────────────────────┐
│                   BROWSER                        │
│  ┌───────────────────────────────────────────┐  │
│  │                  DOM                       │  │
│  └───────────────────────────────────────────┘  │
│         ▲                         ▲             │
│         │                         │             │
│    ┌────┴────┐          ┌────────┴────────┐    │
│    │  Human  │          │    Extension    │    │
│    │  Input  │          │  ┌───────────┐  │    │
│    └─────────┘          │  │  LLM API  │  │    │
│                         │  │  (remote) │  │    │
│                         │  └───────────┘  │    │
│                         └─────────────────┘    │
└─────────────────────────────────────────────────┘
```

A browser extension can:
1. Parse Agentic Microformats from any page
2. Send structured context to an LLM backend
3. Receive action suggestions
4. Execute actions on behalf of the user
5. Observe and report results

This provides the "motor" capability today, while native browser integration matures.

### E.8 Implications for Publishers

Sites that implement Agentic Microformats are preparing for the browser-embedded agent future:

**Today**: Annotations help external agents (Claude Computer Use, OpenAI Operator) understand pages more reliably than vision alone.

**Tomorrow**: Annotations become the native language that browser-embedded LLMs speak, enabling seamless human-agent collaboration.

Publishers who annotate now will have agent-ready sites when browser-embedded LLMs become mainstream. The investment in semantic markup pays dividends across multiple agent architectures.

### E.9 The Literal Sewing Machine

For browser-embedded agents, the sewing machine metaphor is no longer a metaphor:

- **The DOM** is the mechanism—the actual shared state
- **Human input** is the hand wheel—direct manipulation
- **The browser LLM** is the motor—automated operation
- **Agentic Microformats** are the clutch—engaging the motor meaningfully

Both operators work on the same fabric (the page), create the same stitches (DOM mutations), and can take over from each other at any point (seamless handoff). The machine genuinely doesn't know or care which operator is active.

This is the tightest human-agent coupling this specification envisions, and browser-embedded LLMs are where it becomes real.

---

## Changelog

### Version 0.2.0 (February 2026)

- New attributes: `data-agent-on-success`, `data-agent-response`, `data-agent-min`, `data-agent-max`
- New sections: 6.7 Response Schema, 6.8 Success Outcome Hints, 7.4 Validation Constraints
- Extended `data-agent-meta` with workflow graph, actions summary, responseSchemas, errorFormat, related links
- Added AGENTS.md and llms.txt to related standards (Section 1.5, Appendix B)
- Fixed broken internal links and outdated references

### Version 0.1.0 (January 2026)

- Initial public draft

---

*End of Specification*

---

**One-sentence summary:**

Same interface. Shared wheel. Semantic clutch.
