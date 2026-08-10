# Annotation Strategy v0.1

This document defines how to apply `data-agent-*` attributes to HTML pages.
It is the editable file in the autoresearch loop — updated by the agent when
experiments suggest improvements, reverted when they do not.

---

## Core principles

1. Annotate existing elements only — never add new HTML elements.
2. Every page must have at least one `data-agent="resource"` identifying the page's primary content.
3. Every primary action (CTA button, form submit) must have `data-agent="action"`.
4. Properties that answer common questions (name, price, date, status) must have `data-agent-prop`.

---

## Resource annotation

Apply `data-agent="resource"` to the main content container of each page type:

```
data-agent="resource"
data-agent-type="<type>"      # page | article | product | service | api-endpoint | spec | support-article
data-agent-id="<unique-id>"   # slug or id if available
```

**Page type mapping:**
- Corporate homepage → `data-agent-type="page"` on `<main>`
- Blog overview → `data-agent-type="listing"` on `<section class="article-listing">`
- Each article card → `data-agent-type="article"` with `data-agent-id` from the article slug
- API docs → `data-agent-type="documentation"` on `<main>`
- Spec page → `data-agent-type="specification"` on `<main>`
- Support article → `data-agent-type="support-article"` on `<article>`
- News homepage → `data-agent-type="listing"` on the top-stories section

---

## Property annotation

Apply `data-agent-prop="<name>"` to elements containing key data:

| Property name   | Element type                  | Used on           |
|-----------------|-------------------------------|-------------------|
| `name`          | `<h1>`, `<h2>`, `<h3>`        | articles, products, services |
| `url`           | `<a>` with canonical href     | article cards, CTAs |
| `date`          | `<time>`                      | articles, news items |
| `views`         | span with view count          | blog articles |
| `category`      | category/label elements       | articles, news |
| `summary`       | `<p>` lead paragraph          | articles |
| `author`        | byline elements               | news, blog |
| `section-label` | nav section labels            | news |

---

## Action annotation

Apply `data-agent="action"` to interactive elements:

```
data-agent="action"
data-agent-name="<verb>"          # contact | read_more | navigate | submit | search
data-agent-method="GET|POST"
data-agent-endpoint="<url>"       # the href or form action
data-agent-role="primary|secondary|danger"
data-agent-reversible="true|false"
data-agent-risk="low|medium|high"
```

**Defaults:**
- Navigation links: `data-agent-name="navigate"`, `data-agent-method="GET"`, `data-agent-risk="low"`, `data-agent-reversible="true"`
- Contact CTAs: `data-agent-name="contact"`, `data-agent-role="primary"`
- Read more links: `data-agent-name="read_more"`, `data-agent-role="secondary"`

---

## Code block annotation (API docs pages)

For pages with executable code examples, annotate `<pre>` elements:

```
data-agent="action"
data-agent-name="run_example"
data-agent-method="execute"
data-agent-language="<language>"    # python | curl | javascript | bash
data-agent-executable="true"
data-agent-risk="low|medium|high"   # low = read-only; medium = creates resources; high = destructive
data-agent-reversible="true|false"
data-agent-requires-auth="true|false"
```

Risk assessment for code blocks:
- `GET` requests → `risk="low"`, `reversible="true"`
- `POST` requests creating resources → `risk="medium"`, `reversible="false"`
- `DELETE` requests → `risk="high"`, `reversible="false"`
- Code requiring `YOUR_API_KEY` → `data-agent-requires-auth="true"`

---

## Navigation annotation

Primary navigation is annotated with REGISTERED vocabulary only (the values
`data-agent="navigation"` and `data-agent-section` are NOT part of the spec
and fail validation):

- Mark the nav container as a resource: `data-agent="resource" data-agent-type="navigation"`
- Annotate each nav link with `data-agent-prop="section-name"` and
  `data-agent-prop="url"`-style link annotation where the section has its own page
- For extensions beyond the registry, use the `data-agent-x-*` prefix (always legal)

---

## Trust regions

```
data-agent-trust="system"      # site-authored content, safe to parse
data-agent-trust="untrusted"   # user-generated content, skip annotations
```

Apply `data-agent-trust="system"` to `<main>`, `<article>`, `<nav>`.
Apply `data-agent-trust="untrusted"` to comment sections, user reviews, forum posts.

---

## Page-type-specific rules

### Corporate homepage
- Annotate the hero CTA as `data-agent="action" data-agent-name="contact" data-agent-role="primary"`
- Annotate the services section as `data-agent="resource" data-agent-type="service-listing"`
- Annotate each service card as `data-agent="resource" data-agent-type="service"`
- Annotate the AI products section: each product link gets `data-agent="resource" data-agent-type="product"`

### Blog / news listing
- Annotate the listing container as `data-agent="resource" data-agent-type="listing"`
- Each article card: `data-agent="resource" data-agent-type="article"`
- Mark the `<time datetime="...">` elements with `data-agent-prop="date"`
- Mark view counts with `data-agent-prop="views" data-agent-typehint="integer"`
- Sort key: `data-agent-sort="date-desc"` on the listing container

### API documentation
- Annotate each `<section>` with `data-agent="resource" data-agent-type="doc-section" data-agent-id="<section-id>"`
- Annotate each code block with the code block annotation rules above
- Mark the authentication method: `data-agent-prop="auth-method"` on the element describing auth

### Specification pages
- Annotate the spec title: `data-agent-prop="spec-name"` on `<h1>`
- Annotate each linked document in lists: `data-agent-prop="doc-link"` on `<a>` elements
- Mark the file format: `data-agent-prop="file-format"` on the relevant element

### Support articles
- Annotate the article: `data-agent="resource" data-agent-type="support-article"`
- Mark the answer to "what is X": `data-agent-prop="definition"` on the first `<p>` of the main section
- Mark step counts: `data-agent-prop="step-count" data-agent-typehint="integer"` on `<ol>` elements

### News homepage
- Annotate the featured story: `data-agent="resource" data-agent-type="article" data-agent-role="featured"`
- Annotate each story card in the listing
- Mark navigation sections: `data-agent-prop="section-name"` on primary nav items
- Mark live updates: `data-agent-prop="live-status"` on live badges

### E-commerce category page
- Annotate each product card as `data-agent="resource" data-agent-type="product"` with `data-agent-id` set to the article number (SKU)
- Mark the product name heading: `data-agent-prop="name"`
- Mark the CURRENT selling price (not the struck-through original, not member/club prices): `data-agent-prop="price" data-agent-typehint="currency" data-agent-value="<normalized decimal with dot, e.g. 44.90>"`
- Mark unit prices (per 100 g etc.): `data-agent-prop="unit-price" data-agent-value="<normalized decimal>"`
- Mark stock status: `data-agent-prop="availability" data-agent-value="in_stock|low_stock|sold_out|preorder"` on the stock line
- Annotate the add-to-cart button: `data-agent="action" data-agent-name="add_to_cart" data-agent-method="POST" data-agent-endpoint="<the URL path the page's JavaScript actually posts to>"`
- Do the same for wishlist/notification buttons with their real endpoints from the page's JavaScript

### Changelog / release notes page
- Annotate each release entry as `data-agent="resource" data-agent-type="release"` with `data-agent-id` set to the version number
- Mark the version: `data-agent-prop="version"`; mark prerelease/beta entries `data-agent-prop="channel" data-agent-value="beta"` and stable entries `data-agent-value="stable"`
- Mark the release date: `data-agent-prop="date" data-agent-typehint="date" data-agent-value="<ISO date YYYY-MM-DD>"` — normalize whatever format the page displays
- Mark deprecations: ONE `data-agent-prop="deprecations"` per release whose `data-agent-value` lists ALL deprecations announced in that release, separated by "; " — e.g. `data-agent-value="/v1/render -> /v2/render/jobs; renderSync() -> renderAsync()"`. Never annotate two properties with the same name on one release (later ones overwrite earlier ones during extraction).
- Mark breaking changes: `data-agent-prop="breaking-changes" data-agent-typehint="integer" data-agent-value="<number of breaking changes listed>"` on each release that has a breaking-changes section
- Mark version requirements (SDK/CLI minimums): `data-agent-prop="requires" data-agent-value="<feature>: <component> >= <version>"` — always include the feature name so the requirement is understandable without the surrounding prose

### Event / schedule page
- Annotate each session as `data-agent="resource" data-agent-type="session"`, `data-agent-id` from the session anchor id
- Mark the title: `data-agent-prop="name"`; the room/location: `data-agent-prop="location"`
- Mark the start time: `data-agent-prop="start" data-agent-typehint="datetime" data-agent-value="<ISO 8601 UTC instant, converting from the local timezone stated on the page>"`
- Mark availability: `data-agent-prop="availability" data-agent-value="available|sold_out|waitlist"`
- Mark prices: `data-agent-prop="price" data-agent-typehint="currency" data-agent-value="<decimal>"` for the standard rate and `data-agent-prop="member-price"` for member rates
- Annotate booking buttons: `data-agent="action" data-agent-name="reserve_seat|join_waitlist" data-agent-method="<method from the page's JavaScript>" data-agent-endpoint="<endpoint from the page's JavaScript>"`
