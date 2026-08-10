"""Agentic Microformats extractor — Python port of the reference implementation.

Stdlib-only. Produces the canonical graph serialization defined in
spec/graph-serialization.md, byte-comparable (as parsed JSON) with the
TypeScript package's ``toGraph``. Golden-parity tests in ``tests/`` compare
both implementations' output on the repository's example pages.

Public API:
    extract_all(html) -> ExtractionResult-shaped dict internals
    to_graph(html)    -> canonical graph as a dict
    to_graph_json(html, pretty=False) -> canonical graph as a JSON string
"""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from typing import Any, Optional

__version__ = "0.3.0"

GRAPH_FORMAT_VERSION = "0.3"

_VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}

_TYPE_HINTS = {
    "string", "number", "integer", "boolean", "currency",
    "date", "datetime", "url", "email", "enum", "json",
}

_HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}

_ROLES = {"primary", "secondary", "danger"}
_RISKS = {"low", "medium", "high"}


# ---------------------------------------------------------------------------
# Minimal DOM
# ---------------------------------------------------------------------------

class Node:
    __slots__ = ("tag", "attrs", "children", "parent", "_text_parts")

    def __init__(self, tag: str, attrs: dict[str, str], parent: Optional["Node"]):
        self.tag = tag
        self.attrs = attrs
        self.children: list[Any] = []  # Node | str
        self.parent = parent
        self._text_parts: Optional[list[str]] = None

    # -- DOM-ish API ---------------------------------------------------------

    def get_attribute(self, name: str) -> Optional[str]:
        return self.attrs.get(name)

    def has_attribute(self, name: str) -> bool:
        return name in self.attrs

    @property
    def text_content(self) -> str:
        parts: list[str] = []

        def walk(n: "Node") -> None:
            for c in n.children:
                if isinstance(c, str):
                    parts.append(c)
                else:
                    walk(c)

        walk(self)
        return "".join(parts)

    def descendants(self):
        """Pre-order DFS over element descendants (excluding self)."""
        for c in self.children:
            if isinstance(c, Node):
                yield c
                yield from c.descendants()

    def query_selector_all(self, selector: str) -> list["Node"]:
        preds = _parse_selector(selector)
        return [n for n in self.descendants() if _matches(n, preds)]

    def query_selector(self, selector: str) -> Optional["Node"]:
        preds = _parse_selector(selector)
        for n in self.descendants():
            if _matches(n, preds):
                return n
        return None

    def closest(self, selector: str) -> Optional["Node"]:
        preds = _parse_selector(selector)
        n: Optional[Node] = self
        while n is not None:
            if _matches(n, preds):
                return n
            n = n.parent
        return None

    def contains(self, other: "Node") -> bool:
        n = other.parent
        while n is not None:
            if n is self:
                return True
            n = n.parent
        return False


_SEL_RE = re.compile(
    r"^(?P<tag>[a-zA-Z][a-zA-Z0-9-]*)?"
    r"(?P<id>#[A-Za-z0-9_:.-]+)?"
    r"(?P<attrs>(\[[^\]]+\])*)$"
)
_ATTR_RE = re.compile(r'\[([a-zA-Z-]+)(?:="([^"]*)")?\]')


def _parse_selector(selector: str):
    """Supports the subset used by the reference implementation:
    tag, #id, [attr], [attr="value"], and combinations thereof."""
    m = _SEL_RE.match(selector.strip())
    if not m:
        raise ValueError(f"unsupported selector: {selector}")
    tag = m.group("tag").lower() if m.group("tag") else None
    node_id = m.group("id")[1:] if m.group("id") else None
    attrs = _ATTR_RE.findall(m.group("attrs") or "")
    return tag, node_id, attrs


def _matches(n: Node, preds) -> bool:
    tag, node_id, attrs = preds
    if tag and n.tag != tag:
        return False
    if node_id and n.attrs.get("id") != node_id:
        return False
    for name, value in attrs:
        if name not in n.attrs:
            return False
        # _ATTR_RE yields "" for bare [attr] (presence check); the selector
        # subset used by this spec never matches an explicit empty value.
        if value != "" and n.attrs.get(name) != value:
            return False
    return True


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("html", {}, None)
        self._stack = [self.root]
        self._got_html = False

    def handle_starttag(self, tag, attrs):
        attr_map: dict[str, str] = {}
        for k, v in attrs:
            if k not in attr_map:
                attr_map[k] = v if v is not None else ""
        if tag == "html" and not self._got_html:
            self._got_html = True
            self.root.attrs = attr_map
            return
        node = Node(tag, attr_map, self._stack[-1])
        self._stack[-1].children.append(node)
        if tag not in _VOID_ELEMENTS:
            self._stack.append(node)

    def handle_startendtag(self, tag, attrs):
        attr_map = {k: (v if v is not None else "") for k, v in attrs}
        node = Node(tag, attr_map, self._stack[-1])
        self._stack[-1].children.append(node)

    def handle_endtag(self, tag):
        if tag in _VOID_ELEMENTS:
            return
        for i in range(len(self._stack) - 1, 0, -1):
            if self._stack[i].tag == tag:
                del self._stack[i:]
                break

    def handle_data(self, data):
        if data:
            self._stack[-1].children.append(data)


def parse_html(html: str) -> Node:
    builder = _TreeBuilder()
    builder.feed(html)
    return builder.root


# ---------------------------------------------------------------------------
# Coercion — mirrors coerce.ts including JS numeric quirks
# ---------------------------------------------------------------------------

_PARSEFLOAT_RE = re.compile(r"^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")


def _parse_float_js(raw: str) -> Optional[float]:
    """JS parseFloat: parses the leading numeric prefix; NaN -> None."""
    m = _PARSEFLOAT_RE.match(raw)
    if not m:
        return None
    return float(m.group(0))


def _number_js(raw: str) -> Optional[float]:
    """JS Number(): full-string strict parse; '' -> 0; invalid -> None."""
    s = raw.strip()
    if s == "":
        return 0.0
    try:
        return float(s)
    except ValueError:
        return None


def _num(value: float):
    """Serialize like JS: integral floats become ints (42.0 -> 42)."""
    if value == int(value) and abs(value) < 2 ** 53:
        return int(value)
    return value


def coerce_value(raw: str, typehint: str):
    if typehint == "number":
        n = _parse_float_js(raw)
        return raw if n is None else _num(n)
    if typehint == "integer":
        n = _number_js(raw)
        if n is not None and n == int(n):
            return int(n)
        return raw
    if typehint == "boolean":
        if raw == "true":
            return True
        if raw == "false":
            return False
        return raw
    if typehint == "currency":
        cleaned = re.sub(r"[^0-9.,\-]", "", raw)
        if "," in cleaned and ("." not in cleaned or cleaned.rfind(",") > cleaned.rfind(".")):
            normalized = cleaned.replace(".", "").replace(",", ".", 1)
        else:
            normalized = cleaned.replace(",", "")
        n = _parse_float_js(normalized)
        return raw if n is None else _num(n)
    if typehint == "json":
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return raw
    return raw


# ---------------------------------------------------------------------------
# Trust — mirrors trust.ts
# ---------------------------------------------------------------------------

def _should_skip(el: Node) -> bool:
    trust = el.closest("[data-agent-trust]")
    if trust is not None and trust.get_attribute("data-agent-trust") == "untrusted":
        return True
    if el.closest('[data-agent-ignore="true"]') is not None:
        return True
    return False


# ---------------------------------------------------------------------------
# Hints / params / actions / resources — mirror the TS modules
# ---------------------------------------------------------------------------

def _extract_hints(el: Node) -> dict:
    hints: dict[str, Any] = {}
    role = el.get_attribute("data-agent-role")
    risk = el.get_attribute("data-agent-risk")
    if role in _ROLES:
        hints["role"] = role
    if risk in _RISKS:
        hints["risk"] = risk
    if el.get_attribute("data-agent-human-preferred") == "true":
        hints["humanPreferred"] = True
    reversible = el.get_attribute("data-agent-reversible")
    if reversible in ("true", "false"):
        hints["reversible"] = reversible == "true"
    cost_attr = el.get_attribute("data-agent-cost")
    if cost_attr:
        cost = _parse_float_js(cost_attr)
        if cost is not None:
            hints["cost"] = _num(cost)
            cc = el.get_attribute("data-agent-cost-currency")
            if cc:
                hints["costCurrency"] = cc
    return hints


def _input_value(el: Node) -> Optional[str]:
    if el.tag == "select":
        selected = el.query_selector("option[selected]")
        if selected is not None:
            v = selected.get_attribute("value")
            return v if v is not None else selected.text_content
        first = el.query_selector("option")
        if first is not None:
            v = first.get_attribute("value")
            return v if v is not None else first.text_content
        return None
    if (el.get_attribute("type") or "").lower() == "checkbox":
        return "true" if el.has_attribute("checked") else "false"
    return el.get_attribute("value")


def _bound(el: Node, attr: str):
    v = el.get_attribute(attr)
    if v is None:
        return None
    try:
        n = float(v)
    except ValueError:
        return None
    return _num(n)


def _extract_parameters(action_el: Node) -> list[dict]:
    params = []
    for el in action_el.query_selector_all("[data-agent-param]"):
        name = el.get_attribute("data-agent-param")
        if not name:
            continue
        typehint = el.get_attribute("data-agent-typehint")
        if typehint not in _TYPE_HINTS:
            typehint = "string"
        required = (
            el.has_attribute("required")
            or el.get_attribute("data-agent-required") == "true"
            or el.get_attribute("aria-required") == "true"
        )
        params.append({
            "name": name,
            "typehint": typehint,
            "required": required,
            "value": _input_value(el),
            "disabled": el.has_attribute("disabled"),
            "min": _bound(el, "data-agent-min"),
            "max": _bound(el, "data-agent-max"),
        })
    return params


def _resolve_description(el: Node, root: Node) -> Optional[str]:
    desc = el.get_attribute("data-agent-description")
    if desc:
        return desc
    aria = el.get_attribute("aria-label")
    if aria:
        return aria
    described_by = el.get_attribute("aria-describedby")
    if described_by:
        target = root.query_selector(f"#{described_by}")
        if target is not None:
            text = target.text_content.strip()
            if text:
                return text
    title = el.get_attribute("title")
    if title:
        return title
    text = el.text_content.strip()
    if text:
        return text
    return None


def _extract_action(el: Node, inherited_target: Optional[str], root: Node) -> dict:
    method = (el.get_attribute("data-agent-method") or "").upper()
    if method not in _HTTP_METHODS:
        method = "POST"

    headers = None
    headers_attr = el.get_attribute("data-agent-headers")
    if headers_attr:
        try:
            headers = json.loads(headers_attr)
        except (ValueError, TypeError):
            headers = None

    response = None
    response_attr = el.get_attribute("data-agent-response")
    if response_attr:
        try:
            parsed = json.loads(response_attr)
            if isinstance(parsed, dict):
                response = parsed
        except (ValueError, TypeError):
            pass

    idem_attr = el.get_attribute("data-agent-idempotent")
    idempotent = True if idem_attr == "true" else False if idem_attr == "false" else None

    explicit_target = el.get_attribute("data-agent-target")

    return {
        "name": el.get_attribute("data-agent-name") or "",
        "target": explicit_target if explicit_target is not None else inherited_target,
        "method": method,
        "endpoint": el.get_attribute("data-agent-endpoint"),
        "params": _extract_parameters(el),
        "headers": headers,
        "description": _resolve_description(el, root),
        "onSuccess": el.get_attribute("data-agent-on-success"),
        "response": response,
        "idempotent": idempotent,
        "hints": _extract_hints(el),
    }


def _extract_properties(resource_el: Node) -> dict:
    props: dict[str, dict] = {}
    for el in resource_el.query_selector_all("[data-agent-prop]"):
        if el.closest('[data-agent="resource"]') is not resource_el:
            continue
        name = el.get_attribute("data-agent-prop")
        if not name:
            continue
        typehint = el.get_attribute("data-agent-typehint")
        if typehint not in _TYPE_HINTS:
            typehint = "string"
        override = el.get_attribute("data-agent-value")
        raw = override if override is not None else el.text_content.strip()
        value = coerce_value(raw, typehint)
        currency = el.get_attribute("data-agent-currency")

        existing = props.get(name)
        if existing is not None:
            if "values" not in existing:
                existing["values"] = [existing["value"]]
            existing["values"].append(value)
            continue

        props[name] = {
            "value": value,
            "typehint": typehint,
            "currency": currency,
        }
    return props


def _is_direct_child_resource(candidate: Node, all_nested: list[Node]) -> bool:
    return not any(
        other is not candidate and other.contains(candidate)
        for other in all_nested
    )


def _extract_resource_tree(el: Node, root: Node) -> dict:
    nested = el.query_selector_all('[data-agent="resource"]')
    children = [
        _extract_resource_tree(n, root)
        for n in nested
        if _is_direct_child_resource(n, nested) and not _should_skip(n)
    ]
    res_id = el.get_attribute("data-agent-id") or ""
    actions = [
        _extract_action(a, res_id, root)
        for a in el.query_selector_all('[data-agent="action"]')
        if a.closest('[data-agent="resource"]') is el and not _should_skip(a)
    ]
    return {
        "type": el.get_attribute("data-agent-type") or "",
        "id": res_id,
        "properties": _extract_properties(el),
        "actions": actions,
        "children": children,
    }


def _extract_meta(root: Node) -> dict:
    script = root.query_selector("script[data-agent-meta]")
    if script is None:
        return {}
    try:
        raw = json.loads(script.text_content or "{}")
    except (ValueError, TypeError):
        return {}
    meta: dict[str, Any] = {}
    for key in ("provider", "defaults", "page", "related", "workflow", "actions", "responseSchemas"):
        if key in raw and raw[key] is not None:
            meta[key] = raw[key]
    policies = raw.get("agent_policies")
    if policies:
        agent_policies: dict[str, Any] = {}
        rate = policies.get("rate_limit")
        if rate:
            agent_policies["rateLimit"] = {"requestsPerMinute": rate.get("requests_per_minute")}
        if "require_auth" in policies:
            agent_policies["requireAuth"] = policies["require_auth"]
        if policies.get("auth_method"):
            agent_policies["authMethod"] = policies["auth_method"]
        if policies.get("errorFormat"):
            agent_policies["errorFormat"] = policies["errorFormat"]
        meta["agentPolicies"] = agent_policies
    # Reorder to match the TS extractor's assignment order
    ordered: dict[str, Any] = {}
    for key in ("provider", "defaults", "page", "related", "workflow", "actions",
                "responseSchemas", "agentPolicies"):
        if key in meta:
            ordered[key] = meta[key]
    return ordered


def extract_all(html: str) -> dict:
    root = parse_html(html)
    all_resources = root.query_selector_all('[data-agent="resource"]')
    top_level = [
        el for el in all_resources
        if _is_direct_child_resource(el, all_resources) and not _should_skip(el)
    ]
    standalone = [
        el for el in root.query_selector_all('[data-agent="action"]')
        if el.closest('[data-agent="resource"]') is None and not _should_skip(el)
    ]
    return {
        "meta": _extract_meta(root),
        "resources": [_extract_resource_tree(el, root) for el in top_level],
        "actions": [_extract_action(el, None, root) for el in standalone],
    }


# ---------------------------------------------------------------------------
# Canonical serialization — mirrors serialize.ts key-for-key
# ---------------------------------------------------------------------------

def _ser_parameter(p: dict) -> dict:
    out: dict[str, Any] = {"name": p["name"]}
    if p["typehint"] != "string":
        out["typehint"] = p["typehint"]
    if p["required"]:
        out["required"] = True
    if p["value"] is not None:
        out["value"] = p["value"]
    if p["min"] is not None:
        out["min"] = p["min"]
    if p["max"] is not None:
        out["max"] = p["max"]
    if p["disabled"]:
        out["disabled"] = True
    return out


def _ser_action(a: dict) -> dict:
    out: dict[str, Any] = {}
    if a["name"]:
        out["name"] = a["name"]
    out["method"] = a["method"]
    if a["endpoint"]:
        out["endpoint"] = a["endpoint"]
    if a["target"]:
        out["target"] = a["target"]
    if a["description"]:
        out["description"] = a["description"]
    if a["onSuccess"]:
        out["onSuccess"] = a["onSuccess"]
    if a["response"]:
        out["response"] = a["response"]
    if a["idempotent"] is not None:
        out["idempotent"] = a["idempotent"]
    if a["headers"]:
        out["headers"] = a["headers"]
    if a["hints"]:
        out["hints"] = a["hints"]
    if a["params"]:
        out["params"] = [_ser_parameter(p) for p in a["params"]]
    return out


def _ser_property(p: dict) -> dict:
    out: dict[str, Any] = {"value": p["value"]}
    if "values" in p:
        out["values"] = p["values"]
    if p["typehint"] != "string":
        out["typehint"] = p["typehint"]
    if p["currency"]:
        out["currency"] = p["currency"]
    return out


def _ser_resource(r: dict) -> dict:
    out: dict[str, Any] = {}
    if r["type"]:
        out["type"] = r["type"]
    if r["id"]:
        out["id"] = r["id"]
    out["properties"] = {name: _ser_property(p) for name, p in r["properties"].items()}
    if r["actions"]:
        out["actions"] = [_ser_action(a) for a in r["actions"]]
    if r["children"]:
        out["children"] = [_ser_resource(c) for c in r["children"]]
    return out


def to_graph(html: str) -> dict:
    result = extract_all(html)
    return {
        "agentGraph": GRAPH_FORMAT_VERSION,
        "meta": result["meta"],
        "resources": [_ser_resource(r) for r in result["resources"]],
        "actions": [_ser_action(a) for a in result["actions"]],
    }


def to_graph_json(html: str, pretty: bool = False) -> str:
    if pretty:
        return json.dumps(to_graph(html), indent=2, ensure_ascii=False)
    return json.dumps(to_graph(html), separators=(",", ":"), ensure_ascii=False)
