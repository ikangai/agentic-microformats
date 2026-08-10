# agentic-microformats (Python)

Stdlib-only Python port of the [Agentic Microformats](https://github.com/ikangai/agentic-microformats) extractor. Parses `data-agent-*` annotated HTML and emits the **canonical graph serialization** (`spec/graph-serialization.md`) — guaranteed identical, as parsed JSON, to the TypeScript reference implementation's `toGraph` (enforced by golden-parity tests in `tests/`).

Zero dependencies. Trust filtering (`data-agent-trust="untrusted"`, `data-agent-ignore`) is applied during extraction, so the graph never contains untrusted content.

## Usage

```python
from agentic_microformats import to_graph, to_graph_json

graph = to_graph(html)          # dict: {"agentGraph": "0.3", "meta": ..., "resources": [...], "actions": [...]}
payload = to_graph_json(html)   # canonical JSON string
```

## Parity

```bash
node scripts/gen-golden.mjs                 # regenerate goldens from the TS dist
python3 -m unittest discover -s tests       # compare
```

## License

MIT
