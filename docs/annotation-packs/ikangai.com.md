# Annotation pack: ikangai.com

Ready-to-paste `data-agent-*` annotations for www.ikangai.com, built against
the live markup fetched 2026-08-10 and **verified locally**: each snippet was
applied to the fetched HTML and validated with the reference CLI.

## ✅ DEPLOYED 2026-08-11 — live on production

ikangai.com is the spec's first live production site. Verified against the
running site:

```
$ npx agentic-microformats https://www.ikangai.com/
  announced   : meta ✓ (0.3)
  agent sees  : 8 resources, 1 action   ← organization + 4 services + 3 news teasers + contact CTA
  • structurally valid, navigable, has actions

$ npx agentic-microformats https://www.ikangai.com/news-2/
  agent sees  : 17 resources, 1 action  ← every article, with name + canonical URL
```

The homepage also serves a page-level `data-agent-meta` provider block
(name / url / jurisdiction / locale) and an `organization` resource carrying
IKANGAI's description and contact URL, so a graph-only agent gets the site's
identity, not just a list of links.

> Content-layer caveat (external review, Aug 2026): this is a good navigation
> and identity index, but not yet a rich *content* interface — article dates,
> authors, summaries, and the article body are not in the graph. The existing
> `hentry`/Schema.org markup already carries them; bridging those into the
> graph is 0.4 direction work (see `docs/plans/2026-08-12-webmcp-and-content-layer.md`).

**How it was deployed (and how to revert):** the site is a SiteOrigin
page-builder theme (Polestar Child), whose TinyMCE widgets strip unknown
`data-*` attributes on save — so widget-level pasting was not viable.
Instead the annotations are applied **server-side** by a single WPCode PHP
snippet (front-end output filter, additive only, no visual change). The exact
snippet is committed alongside this file as
[`ikangai.com.snippet.php`](./ikangai.com.snippet.php).

- **Location:** wp-admin → Code Snippets → "Agentic Microformats annotations
  (data-agent-*)" (snippet id 17717).
- **Revert:** toggle that snippet Inactive (or delete it) and clear cache —
  the site returns to exactly its prior HTML. Fully reversible, one switch.
- The meta announcement tag is separate: WPCode → Header & Footer → Header.

The snippets below document the *intended markup* per element (what the PHP
filter injects), useful for a theme-native implementation or for other sites.

## Before / after (measured on the real pages)

| Page | Before | After (this pack) |
|------|--------|-------------------|
| Homepage (107 KB) | 0 resources, 0 actions | **4 resources, 1 action** — valid, 0 warnings, graph 0.8 KB (~1 %) |
| /news-2/ (125 KB) | 0 resources, 0 actions | **17 article resources** — valid, graph 3.7 KB (~3 %) |

Verify after pasting:

```bash
npx agentic-microformats https://www.ikangai.com/
npx agentic-microformats https://www.ikangai.com/news-2/
```

## 1 · Announcement — theme `<head>`

Via the theme's `header.php`, a child theme, or any head-injection plugin:

```html
<meta name="agent-annotations" content="0.3">
```

## 2 · Contact CTA — wherever the button HTML lives

The homepage CTA is a plain link (`Contact Form →`). Annotated:

```html
<a href="https://www.ikangai.com/contact/"
   data-agent="action"
   data-agent-name="contact"
   data-agent-method="GET"
   data-agent-endpoint="/contact/"
   data-agent-role="primary"
   data-agent-risk="low"
   data-agent-reversible="true"
   data-agent-description="Open the contact form">Contact Form →</a>
```

## 3 · Services — SiteOrigin text widgets (editable as raw HTML)

Each service lives in a `siteorigin-widget-tinymce textwidget` block. The
pattern, using **AI Workshops** as the template (repeat for Strategic AI
Consultation, AI Tool and Platform Selection, AI Projects — change the id,
url, and heading):

```html
<div class="siteorigin-widget-tinymce textwidget"
     data-agent="resource"
     data-agent-type="service"
     data-agent-id="ai-workshops">
  <div id="rectangle" style="width: 40px; height: 8px; background-color: #f22938; margin-bottom: 14px;"
       data-agent-prop="url" data-agent-typehint="url"
       data-agent-value="/ai-workshops/"></div>
  <h2 style="text-align: left; font-size: 32px; line-height: 42px; font-weight: bold; margin-bottom: 20px;"
      class="ikg-h-fix ikg-h-fix-2"
      data-agent-prop="name">AI Workshops</h2>
  <!-- existing description paragraph stays as-is; optionally add
       data-agent-prop="summary" to it -->
</div>
```

Notes: the accent-rectangle div carries the `url` property via
`data-agent-value` (the heading isn't a link in the current markup — this
keeps the resource navigable per spec §5.2 without changing the design).
If a service has no detail page yet, omit the url property.

## 4 · News cards — theme loop template (`entry-title` pattern)

The news listing renders `<h3 class="entry-title"><a …>Title</a></h3>` per
post. Annotated template (in the theme's content/loop template, so it
applies to every card; `%slug%` / `%title%` stand for the loop values):

```html
<h3 class="entry-title"
    data-agent="resource" data-agent-type="article" data-agent-id="%slug%">
  <a href="https://www.ikangai.com/%slug%/" rel="bookmark"
     data-agent-prop="url" data-agent-typehint="url" data-agent-value="/%slug%/">
    <span data-agent-prop="name">%title%</span>
  </a>
</h3>
```

If the cards expose dates, add `data-agent-prop="date"
data-agent-typehint="date" data-agent-value="YYYY-MM-DD"` on the date
element. If a comments section exists on article pages, fence it:
`data-agent-trust="untrusted"` on its container.

## What agents can do after this

Enumerate all services and articles with typed names and canonical URLs,
navigate the site from the extraction graph alone (no HTML reading), and
discover the contact action with its declared semantics — verified with
`spec/graph-serialization.md` tooling on the patched copies of the live
pages. Next step after pasting: honor `Accept: application/agent+json`
(see `demo/server.js` for a ~30-line reference) and add the
`X-Agent-Annotations` header.
