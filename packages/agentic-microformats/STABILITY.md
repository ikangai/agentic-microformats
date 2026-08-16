# API stability

This package is pre-1.0, but its public surface is **not** uniformly unstable.
Each export belongs to one of three tiers, and each tier is a promise about how
much it can move under you. Depend on the tier, not the version number.

The contract here is what carries into 1.0: the **Stable** set is what 1.0 will
freeze under semver; the **Beta** runtime is what 1.0 will promote once the
consumer API has settled.

## The tiers

| Tier | Promise | Change process |
|------|---------|----------------|
| **Stable** | Will not break without a deprecation cycle. Pre-1.0 we avoid breaking it at all; if ever forced, it is called out as **BREAKING** at the top of the changelog with a migration note. Post-1.0 a break requires a major bump. | Deprecate → keep ≥1 minor → remove only at a major. |
| **Beta** | Supported and tested, but the shape may still change before 1.0. It will not change *silently* — every change ships with a changelog migration note. | Deprecate or change in a minor, always with a migration note. |
| **Experimental** | May change or be removed in **any** release, possibly without a migration note. Depends on external contracts that are not yet ratified, or on a live host environment. | No guarantee. Pin an exact version if you rely on it. |

Deprecation mechanics, in all tiers: a symbol slated for removal is first marked
`@deprecated` in its JSDoc (naming the replacement) and listed under
**Deprecated** in the changelog; runtime paths may also emit a one-time console
warning. Stable removals happen only at a major; Beta removals no sooner than one
minor after the deprecation.

## Stable

The extraction core, the canonical graph, validation, and the safety primitives.
Spec-backed, covered by the Python port at byte parity, and unchanged in shape
since 0.3.x.

| Export | Kind |
|--------|------|
| `extractAll`, `extractResources`, `extractActions`, `extractMeta` | fn |
| `toGraph`, `toGraphJSON`, `GRAPH_FORMAT_VERSION` | fn / const |
| `validate`, `ValidationIssue` | fn / type |
| `coerceValue` | fn |
| `extractHints`, `requiresConfirmation` | fn |
| `extractParameters`, `buildNestedParams` | fn |
| `isUntrusted`, `isIgnored`, `getTrustLevel`, `shouldSkip` | fn |
| `AgentDOM` | class |
| `AgentElement`, `TypeHint`, `Role`, `RiskLevel`, `TrustLevel`, `HttpMethod` | type |
| `InteractionHints`, `Property`, `Parameter`, `Action`, `Resource` | type |
| `PageMeta`, `ExtractionResult`, `PreparedAction` | type |

## Beta

The consumer runtime (added 0.4.0–0.9.0): the content bridge, the `operate`
episode loop, the SDK adapters, the typed error surface, and the WebMCP
descriptor compiler. In active use and tested, but the ergonomics are still
converging — this is where a shape change is most likely before 1.0.

| Export | Since |
|--------|-------|
| `extractContent` + `ContentObservation`, `ContentSection`, `Grounded`, `ContentSource`, `Selector`, `Provenance`, `QuarantinedContent` | 0.4.0 |
| `toWebMCPTools` + `WebMCPTool`, `ToolAnnotations`, `ToolBinding`, `JSONSchema`, `JSONSchemaProperty` | 0.5.0 |
| `operate` + `AgentAction`, `PageState`, `OperateOptions`, `EpisodeResult`, `StepRecord` | 0.6.0 |
| `toOpenAITools`, `toAnthropicTools`, `toMCPTools`, `executeTool` + `OpenAITool`, `AnthropicTool`, `MCPTool`, `ExecuteToolOptions`, `ToolResult` | 0.7.0 |
| `classifyResponse`, `classifyNetworkError` + `AgentError`, `ErrorKind` | 0.8.0 |

## Experimental

Depends on a contract we don't control (a live WebMCP host runtime, a live DOM)
or is a low-level helper. Pin an exact version if you build on these.

| Export | Why experimental |
|--------|------------------|
| `registerWebMCPTools` + `ModelContextHost`, `RegisterOptions`, `Registration` | Binds to a live WebMCP host whose runtime contract is not yet standardized. |
| `observe` + `AgentMutation`, `MutationCallback` | Live DOM mutation observation; API expected to evolve with real usage. |
| `interpretExecution` | Low-level helper exposed for advanced callers. |

## Two contracts that version independently of the package

- **The serialized graph.** `GRAPH_FORMAT_VERSION` (the `agentGraph` field, currently
  `"0.3"`) is the interop contract for `toGraphJSON` output and for graphs served
  as `application/agent+json`. It is deliberately decoupled from the npm version:
  the package can reach 1.0 without forcing a graph-format bump, and a graph-format
  change is a **Stable**-tier event announced on its own terms.
- **The CLI.** `--graph` emits the canonical graph (Stable, same contract as
  `toGraphJSON`). All other CLI output is human-readable and **Beta** — format may
  change; don't parse it, use `--graph` or the library.

## Track record (why these tiers are honest)

Both breaking changes made so far landed in **Beta**, never in Stable:

- `Grounded.selector` → `Grounded.selectors[]` (content layer)
- `ToolResult.error`: `string` → `AgentError` (adapters / errors)

Each was announced in the changelog. The Stable set has not had a breaking change.

## Path to 1.0

1.0 ships when (a) the Stable set is frozen under semver, and (b) the runtime —
`operate`, the adapters, the typed errors — has been promoted from Beta to Stable
after one cycle without a shape change. Experimental exports graduate
individually as their upstream contracts firm up.
