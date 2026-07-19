# Sysgram spec v1 — declarative system diagrams

Sysgram is a diagramming framework where a diagram is **data, not drawing**: a JSON
spec describing components, containment, and connections. The runtime
(`runtime/sysgram.js`) computes layout and renders SVG in the browser. Nobody — human or
AI — ever writes coordinates.

Design goals, in priority order:

1. **AI-readable.** The spec is the source of truth and sits verbatim inside the HTML
   page. An agent can `Read` the file and fully understand the system without executing
   anything. `desc` fields carry prose the picture can't.
2. **AI-writable.** Authoring is naming things and stating relationships. Layout,
   routing, sizing, theming, legend are computed. Hints exist but are optional.
3. **Self-contained.** Works over `file://`. One classic `<script src>` include, relative
   path, no CDN, no build step, no network.
4. **Deterministic.** Same spec → same layout, byte-for-byte. Diffs stay meaningful.

## Quickstart

Copy `examples/hello.html`, or embed in any page:

```html
<script type="application/sysgram+json">
{
  "sysgram": "1",
  "id": "hello",
  "title": "Hello system",
  "nodes": [
    { "id": "web",  "label": "Web app",  "kind": "browser" },
    { "id": "api",  "label": "API",      "kind": "service", "tone": "accent" },
    { "id": "db",   "label": "Postgres", "kind": "datastore" }
  ],
  "edges": [
    { "from": "web", "to": "api", "label": "REST/JSON" },
    { "from": "api", "to": "db",  "label": "SQL" }
  ]
}
</script>
<script src="../runtime/sysgram.js"></script>
```

The runtime replaces each spec block with a rendered `<figure class="sysgram">` (toolbar,
SVG canvas, flow chips, auto-legend, caption). Multiple spec blocks per page are fine.
Include the runtime script **once**, after the spec blocks (or anywhere — it also scans on
`DOMContentLoaded`).

JSON leniency (JSONC): `// line` and `/* block */` comments and trailing commas are
accepted and stripped before parsing. Comments never survive into the parsed spec — put
durable prose in `desc`, not comments.

## Top-level fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `sysgram` | `"1"` | yes | Format version. Unknown major → warning, best-effort render. |
| `id` | string | yes | Kebab-case, unique per page. Used for `window.sysgram.get(id)`. |
| `title` | string | yes | Figure title (toolbar) and accessibility name. |
| `description` | string | no | 1–3 sentences. Feeds `aria-label` and AI context. |
| `caption` | string | no | Footnote under the figure (like a `figcaption`). |
| `direction` | `"right"` \| `"down"` | no | Main flow axis. Default `"right"`. Ignored by `layout:"radial"`. |
| `layout` | `"layered"` \| `"tree"` \| `"radial"` \| `"sequence"` | no | Layout family. Default `"layered"` (the right pick for system/architecture flows). `"tree"` for hierarchies, `"radial"` for hub-and-spoke, `"sequence"` for time-ordered conversations — see "Layout families". Spec-declared so every reader sees the same picture. |
| `arrange` | `"auto"` \| `"manual"` | no | Default `"auto"` (computed layout). `"manual"` uses authored `at` coordinates and overrides `layout` — see below. |
| `route` | `"smart"` \| `"simple"` | no | Default `"smart"`: auto edges reroute around nodes they'd otherwise cross. `"simple"` disables collision avoidance. |
| `accent` | CSS hex | no | Theme accent for this diagram (light mode). |
| `accentDark` | CSS hex | no | Accent for dark mode. Derived from `accent` if omitted. |
| `legend` | `"auto"` \| boolean | no | Auto-legend of used kinds/edge kinds. Default `"auto"` (shown when ≥ 2 distinct kinds). |
| `nodes` | Node[] | yes | Components. |
| `groups` | Group[] | no | Containers/zones. May nest. |
| `edges` | Edge[] | no | Connections. |
| `flows` | Flow[] | no | Named edge sequences (interactive walkthroughs). |
| `assertions` | Assertion[] | no | Rules that stay true regardless of arrangement — see below. |
| `meta` | object | no | Free-form passthrough (status, date, ADR refs). Rendered nowhere; for machines. |

## Node

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | — | Required. Kebab-case, unique across nodes **and** groups. |
| `label` | string | `id` | Title line. Keep short; detail goes in `sub`/`desc`. |
| `sub` | string \| string[] | — | Secondary line(s), muted. Auto-wrapped. Use `·` separators like the house style. |
| `kind` | string | `"service"` | Visual archetype — shape + glyph. See catalog below. |
| `tone` | `"default"` \| `"accent"` \| `"muted"` \| `"warn"` | `"default"` | Border/title color role. `accent` marks emphasis (e.g. the authoritative core). |
| `tint` | boolean | `false` | Tinted background fill (accent-tinted surface). |
| `badges` | string[] | — | Tiny mono pills (e.g. `["planned"]`, `["PII"]`). |
| `href` | string | — | Click-through link (relative URLs preferred). |
| `desc` | string | — | Prose for AI readers and hover tooltip. Say what the node **does and owns**. |
| `rank` | integer ≥ 0 | auto | Layout hint: pin to flow column (row when `direction:"down"`). |
| `order` | number | auto | Layout hint: sort key within a rank. |
| `band` | boolean | `false` | Cross-cutting strip: spans the full width of its container at the far end (e.g. observability). Bands take no part in rank flow; edges to/from bands are allowed but rare. |
| `at` | `[x, y]` | — | Authored top-left position — **only** with `arrange:"manual"` (warned and ignored otherwise). Size is still computed from content so labels never clip. |
| `facts` | object | — | Structured, machine-queryable key→scalar pairs (`{"owner": "platform", "sla": "99.9"}`). Shown in the tooltip and inspector, embedded in `describe()`. |
| `icon` | id \| id[2] | — | Catalog icon(s) drawn before the title (see **SVG icons** below). Presentation only — never meaning. |

### Node kind catalog

Kinds carry **shape + glyph**, so meaning survives without color (CVD/print-safe).
Unknown kinds render as `service` plus a validation warning.

| kind | Drawn as | Use for |
|---|---|---|
| `service` | rounded rect, gear glyph | APIs, backend services, apps |
| `browser` | rounded rect, window glyph | web clients, SPAs |
| `user` | rounded rect, person glyph | humans, actors, roles |
| `datastore` | cylinder | databases (Postgres, RDS) |
| `cache` | cylinder, bolt glyph | Redis, memcached |
| `queue` | pill, stacked-lines glyph | SQS, job queues |
| `bus` | rect, route glyph | event buses, topics (EventBridge) |
| `worker` | rounded rect, cog-arrows glyph | consumers, background workers |
| `scheduler` | rounded rect, clock glyph | cron, timers, schedulers |
| `storage` | rect with lid, box glyph | object storage, buckets (S3) |
| `vault` | rect, shield glyph | evidence vaults, secrets, KMS |
| `email` | rounded rect, envelope glyph | SES, mail senders |
| `auth` | rounded rect, key glyph | Cognito, IdPs, OAuth |
| `lb` | rounded rect, split-arrow glyph | ALB, gateways, proxies |
| `cdn` | rounded rect, globe glyph | CloudFront, edges |
| `function` | rounded rect, λ glyph | Lambda, serverless fns |
| `ai` | rounded rect, sparkle glyph | models, GenAI providers |
| `external` | **dashed** rounded rect, plug glyph | third-party SaaS and hosted providers |
| `observability` | rounded rect, pulse glyph | telemetry, logging, metrics |
| `note` | folded-corner card | annotations; usually no edges |

### SVG icons

Real product artwork is opt-in presentation metadata: declare assets once in a top-level
`iconCatalog`, reference them from nodes. **Meaning never rides on artwork** — `kind`
still picks the shape/glyph and the legend entry, and a missing or unresolvable icon
falls back to the semantic glyph.

```json
{
  "iconCatalog": {
    "aws-fargate": { "src": "../assets/aws/aws-fargate.svg", "label": "AWS Fargate" }
  },
  "nodes": [ { "id": "api", "kind": "service", "icon": "aws-fargate" } ]
}
```

- `src` — a relative `.svg` path (works over `file://`) or an `image/svg+xml` data URI.
- `label` — human name; shown in tooltips/inspector and in `describe()`.
- A node takes one icon or an array of two (e.g. a CDN and function for an edge app).
- Unknown catalog ids warn (`unknown-icon`) and fall back to the glyph.
- AWS icons live in `sysgram/assets/aws/` with provenance + checksums; keep files
  unmodified and mind the AWS trademark guidance.
- Caveat: exported standalone SVGs keep *relative* icon references — move the asset
  folder along with the export, or use data-URI icons when portability matters.

## Group

Groups are containers: trust zones, vendor boundaries, tiers. They lay out their children
recursively and may nest (a group's `children` may include other group ids).

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | — | Required. Shares the id namespace with nodes. |
| `label` | string | `id` | Uppercase tracked header, top-left. |
| `sub` | string | — | Small muted line under the header. |
| `kind` | `"zone"` \| `"platform"` \| `"tier"` \| `"trust-boundary"` \| `"network"` \| `"account"` \| `"region"` \| `"lane"` | `"zone"` | Semantic flavor (inspector + machines). The boundary kinds name what **crossing** the border means: trust changes (`trust-boundary` defaults to the warn tone), network segment, cloud account / billing + IaC surface, geography, swim-lane. Unknown kinds warn and render as `zone`. |
| `style` | `"dashed"` \| `"solid"` \| `"tint"` | `"dashed"` | Border/background treatment. `dashed` = permeable boundary, `solid` = hard boundary, `tint` = filled region. |
| `tone` | as node `tone` | `"default"` | Header/border color role. |
| `children` | string[] | — | Required, non-empty. Node/group ids. Each id may appear in at most one group. |
| `direction` | `"right"` \| `"down"` | inherit | Flow axis **inside** this group. Mixing axes is the main tool for compact layouts. |
| `desc`, `href`, `rank`, `order` | | | As on nodes. |

Edges may target a group id (arrow lands on the group border) — meaning "the whole zone".
An edge between a group and its own descendant is invalid.

## Edge

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | `e<index>` | Optional but recommended (needed by `flows`). |
| `from`, `to` | id | — | Required. Node or group ids. |
| `label` | string | — | Short protocol/action text (`"REST/JSON"`, `"SQL"`, `"same-tx write"`). |
| `kind` | see below | `"sync"` | Line + arrowhead grammar. |
| `both` | boolean | `false` | Arrowheads on both ends. |
| `tone` | `"accent"` \| `"muted"` \| `"warn"` | per kind | Color role override. |
| `routing` | `"auto"` \| `"curve"` \| `"ortho"` \| `"straight"` | `"auto"` | Path style. `auto` picks curves, orthogonal for long hops. |
| `step` | integer ≥ 1 | — | Circled number badge on the edge (narrative order). |
| `labelAt` | number 0–1 | `0.5` | Slide the label along the path (0 = source end). Use when the midpoint lands on another node. |
| `fromSide` / `toSide` | `"l"` \| `"r"` \| `"t"` \| `"b"` | auto | Pin which side of the endpoint the edge attaches to. Auto-picked from geometry when omitted. |
| `facts` | object | — | Structured key→scalar semantics. Tooltip + inspector + `describe()`. Keys are free, but a **recommended vocabulary** exists so machines can rely on spelling: `protocol`, `mode`, `payload`, `authority`, `trust`, `delivery`, `consistency`, `idempotency`, `encryption`, `retention`, `failure`. None is ever required — the edge `kind` already carries the headline semantics; add a fact only where it says something the kind doesn't. Keys one edit away from a vocabulary word warn (`fact-key-typo`); genuinely custom keys stay first-class. |
| `desc` | string | — | Prose: what crosses this edge, when, and why. |

### Edge kind grammar

Meaning is carried by **dash pattern + arrowhead + weight**, color is reinforcement only.
Connection *meaning* and *appearance* are deliberately separate — pick the kind by
semantics, never by the look you want.

| kind | Line | Arrowhead | Default tone | Use for |
|---|---|---|---|---|
| `sync` | solid 1.6px | filled triangle | accent | request/response calls |
| `data` | solid 2.6px | filled triangle | accent | authoritative reads/writes, bulk data movement |
| `async` | dashed 7·5 | filled triangle | accent | events, queue hops |
| `webhook` | dashed 3·4 | filled triangle | **warn** | external hints — never authoritative truth |
| `auth` | dash-dot 9·3·2·3 | open chevron | accent | identity/token/authorization exchange |
| `schedule` | dotted 1.5·4 | filled triangle | accent | timers, cron, reconciliation triggers |
| `telemetry` | dotted 1·5 | open chevron | muted | logs, traces, metrics, analytics |
| `dep` | dotted 2·3.5 | open chevron | muted | build/config dependency, "uses" |
| `assoc` | solid 1.2px | none | muted | mere association ("these two relate") |
| `isolation` | dashed 5·5 + ⫽ mid-mark | none | muted | deliberate separation — explicitly **no** flow |

## Flow

A flow names an ordered subset of edges. The renderer shows flows as chips under the
canvas; clicking a chip highlights its edges + endpoint nodes and dims the rest.

```json
{ "id": "webhook-truth", "label": "Webhook → truth re-fetch", "steps": ["e9", "e2"], "desc": "..." }
```

Two shapes are legitimate: a **story** (consecutive steps share an endpoint — a walk
through the system) and a **set** (thematically related edges with no chain, like "all
the webhook paths"). Validation tells them apart: a flow where *some* consecutive steps
connect and others don't is almost certainly a mistyped story and warns
(`flow-discontinuous`); a flow where *no* consecutive steps connect is treated as a
deliberate set and left alone.

## Assertion

Assertions record the rules a picture can't draw — the things that stay true no matter
how the diagram is arranged ("webhooks are hints", "evidence is not media"). They render
as a list under the diagram; ones with `refs` are clickable and spotlight the referenced
nodes/edges. They also appear in `describe()`, so machine readers get them for free.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable id. |
| `text` | string | The rule, stated plainly. Required — prose is always the source of truth. |
| `refs` | id[] | Optional node/group/edge ids this rule is about (unknown ids warn). |
| `rule` | object | Optional **executable form** — `validate()` proves it against the edge graph, and a violation is an *error* (the diagram contradicts its own stated invariant). Assertions with a `rule` show a "✓ machine-checked" chip and say so in `describe()`. |

### Machine-checked rules

Four rule kinds, deliberately a closed set (this is a diagram checker, not a policy
engine). Path semantics: every non-`isolation` edge carries flow in its `from`→`to`
direction (`both` edges flow both ways); `isolation` edges carry none — that is their
meaning. Ids are matched exactly: an edge drawn to a group id is a flow to that group
vertex, not to each member.

| `rule.kind` | Fields | Proves |
|---|---|---|
| `forbid-edge` | `from`, `to`, `both?` | No direct edge connects the pair (optionally in either direction). |
| `forbid-path` | `from`, `to`, `both?` | No directed flow path exists at all (optionally in either direction). |
| `only-via` | `from`, `to`, `via` | Every flow path from `from` to `to` passes through `via` — checked by removing `via` and asserting unreachability. |
| `require-edge` | `from`, `to`, `edgeKind?` | A direct edge exists (optionally of a specific kind). |

Not every assertion is structurally checkable ("webhook payloads are hints" lives in
process, not topology) — those stay text-only, which is exactly the signal that they
need process enforcement instead. Unknown rule kinds or ids warn and skip the check,
never error: an older runtime must not reject a newer spec.

## Interacting with a rendered diagram

Hover a node/group to trace its edges; hover an edge to spotlight it. **Click** a node,
group, or edge to pin an inspector panel (description, facts, connections) — click it
again, the ×, or empty canvas to release. Flow chips and assertion rows pin the same
spotlight mechanism. Nodes with `href` navigate instead of inspecting. The expand
control fills the page viewport while leaving the browser chrome visible; it never uses
the browser Fullscreen API. Expanded state survives layout-lens rerenders and switching
away from the browser tab, and exits only from the control or the Escape key. The
embedded spec and page source remain unchanged. At 100% fit the canvas has no scrollbars;
zooming beyond the fitted width or height enables that axis's native scrollbar
independently, while **fit** returns both axes to 100%.

## Layout model (what the engine does)

The engine is a layered (Sugiyama-style) pipeline built from the published algorithms —
see [LAYOUT.md](LAYOUT.md) for the stage-by-stage account with citations. What authors
need to know:

- **Layered auto-layout** (default). Per container, units (child nodes/groups) are ranked
  along the flow axis by longest-path over that container's edges, then slack-tightened —
  a unit whose only edges point deep into the flow sits right before its nearest target
  instead of camping at rank 0. Cycles are cut deterministically. Explicit `rank` pins
  override. Within ranks, GKNV crossing minimization orders units (median sweeps +
  adjacent-swap transpose, keeping the best-scoring order seen); `order` breaks ties and
  is law. Where crossings are indifferent, remaining ties resolve by reading direction:
  the through-spine keeps its lane, sources enter from the near side, dead-end sinks
  exit toward the far side.
- **Reserved channels for long edges** (GKNV virtual nodes). An edge spanning more than
  one rank gets an invisible waypoint at every intermediate rank; waypoints join the
  ordering and coordinate passes, so the layout *reserves a corridor* — real nodes move
  aside — and the edge renders as a smooth orthogonal run through it instead of lancing
  nodes or looping around the diagram.
- **Group ports** (ELK-style). An edge whose endpoint lives inside a group attaches at
  the *latitude of that child inside the group*, not the group's center — in ordering,
  in coordinates, and in routing. Child latitudes are known because groups lay out
  bottom-up before their parents. This is why an actor two ranks away lines up exactly
  with the service it calls inside a big zone.
- **Coordinates: GKNV priority method, port-aware.** Each unit moves to the median of
  its neighbors' attachment points, processed in priority order — virtual waypoints are
  (near-)immovable so channels run straight; real nodes rank by degree; movement never
  breaks rank order or separation. Alternating sweeps keep the assignment with the
  lowest total weighted edge length (Ω = 8 virtual–virtual / 2 mixed / 1 real–real), so
  linear flows render as straight runs and sources sit at their target's latitude.
- **Space use.** Disconnected components are packed beside the flow (nothing else bounds
  their gap); rank sizes hug content. Nothing ever overlaps.
- **Recursive containment.** Groups size themselves bottom-up around their laid-out
  children (plus header), then everything is positioned top-down. Each group may set its
  own `direction`.
- **Collision-aware routing** (`route:"smart"`, default). An adjacent-rank `auto` edge
  whose curve would lance an unrelated node reroutes as a scored orthogonal path
  (candidates scored for node collisions, bends, and length; detour lanes go around
  blockers). Explicit `ortho` edges get the same scoring; explicit `curve`/`straight`
  are left as authored. Channel edges jog between ranks only inside node-free gutters,
  and jogs sharing a gutter take parallel tracks (Sander channel routing) instead of
  coinciding. After routing, two settle passes clean up what per-edge routing can't
  see: a straight run that still lances a node (typically a channel edge entering a
  group at a deep child's latitude) is re-routed through the nearest free band between
  the obstacles, and two edges left running on top of each other are nudged onto
  parallel offsets. `route:"simple"` turns the whole avoidance stack off — naive
  paths, no reserved corridors.
- **Edge endpoints.** An edge attaches to real node borders; its coarse direction comes
  from the relative position of the two top-level units involved (override per edge with
  `fromSide`/`toSide`). Multiple edges on one side spread out.
- **Labels.** With no authored `labelAt`, a label slides along its path (midpoint first,
  then outward) to the first spot whose pill clears every node box. A direct
  adjacent-rank edge whose label is wider than the default gap gets the gap widened to
  fit (GKNV's label-as-virtual-node idea, simplified), so short edges never wear their
  label on a node.
- **Flow start.** Cycle breaking and ranking follow author order: the flow starts where
  the first-declared node is, and a group counts as declared where its first child is —
  so return edges (pushes, deliveries) are the ones that read as returns.
- **Bands** render last as full-width strips at the far end of their container.

Hint sparingly, in this order: (1) let it lay out, look; (2) set `direction` on groups;
(3) pin a few `rank`s; (4) nudge `order`; (5) pin `fromSide`/`toSide` or `labelAt` on a
stubborn edge. If you're fighting it, restructure groups — containment is the strongest
layout signal.

### Layout families

`layout` picks the placement family; everything else (kinds, edges, facts, flows,
assertions, smart routing, labels, themes) works identically in all of them. The choice
lives in the spec, so the JSON stays the single deterministic source of truth. Pages may
additionally opt into a **toolbar viewing lens** — `data-sysgram-layout-picker` on the
spec's `<script>` tag adds a family dropdown that previews the other layouts without
touching the JSON (the authored family is marked `•`; non-layered views flatten
`groups`/`band`s, which are rendered only by layered).

- **`layered`** (default) — the full pipeline above. Use for anything with a flow:
  system diagrams, request paths, pipelines. The only family that supports `groups`
  and `band`s.
- **`tree`** — tidy forest (Reingold–Tilford family): a node's parent is the source of
  its first cycle-free in-edge; parents center over their subtrees; extra edges render
  as plain cross-links. Use for hierarchies: org structures, consent/permission trees,
  decision trees, taxonomy views. Depth advances along `direction`.
- **`radial`** — concentric rings (Eades radial tree): each component's highest-degree
  node becomes the hub, BFS distance picks the ring, rings grow to fit. Use for
  hub-and-spoke shapes: one service and its integrations, a broker and its clients.
- **`sequence`** — participants as lifeline columns (declaration order; `order` wins),
  one horizontal row per message, ordered by `step` then declaration. Time flows down,
  so the step order IS the vertical axis and message labels can never collide — use it
  whenever many labeled calls connect the same few participants (API journeys, call
  scripts, webhook round-trips); that shape smears any topology layout. Adjacent-pair
  gaps widen to fit their widest label; edge kinds keep the normal grammar; `from == to`
  renders a self-call hook; `direction` is ignored.

`tree` and `radial` reject authored `groups`/`band` for now (validation error
`layout-unsupported`). `sequence` accepts them as retained authoring metadata but
flattens them in the temporal view; when the layout picker switches back to `layered`,
the original containment is rendered again.

### Manual arrangement

`"arrange": "manual"` switches the whole diagram to authored coordinates: every node
takes `at: [x, y]` (top-left, any consistent unit — the canvas normalizes). Node sizes
are still computed from content, groups still fit around their members, and edges still
route (smartly) between the resulting boxes — so a manual diagram stays a semantic graph,
not a drawing. Use it for carefully composed reference views; prefer auto + hints
everywhere else. Nodes missing `at` warn and stack below the placed content. `rank`,
`order`, `band`, and per-group `direction` are auto-arrange features and are ignored.

## Validation

The runtime validates before rendering. **Errors** (render blocked, red panel + list):
duplicate ids; edge endpoint / group child referencing a missing id; a child claimed by
two groups; group containment cycles; edge between a group and its descendant; missing
required fields; `groups`/`band` with `layout:"tree"`/`"radial"` (`layout-unsupported`);
a violated assertion `rule` (`assertion-violated` — the diagram contradicts its own
stated invariant).
**Warnings** (rendered anyway, panel + console): unknown `kind`, unknown edge `kind`,
unknown group `kind`, unknown `layout` (falls back to layered), unknown top-level
fields, flow steps referencing missing edge ids, duplicate `step` numbers, version
mismatch, `fact-key-typo` (a fact key one edit from the recommended vocabulary),
`flow-discontinuous` (a story flow whose chain breaks at some step),
`maybe-member` (an ungrouped node whose flow enters from and returns to the same group
— almost certainly a forgotten `children` entry), `unknown-rule` /
`assertion-unknown-ref` (a rule that can't be checked — skipped, never fatal).

### Geometry gate (`audit`)

`sysgram.audit(spec)` (Node and browser) inspects the **computed layout** for objective
defects — things that are never intended, as opposed to judgement calls like crossing
counts: `edge-through-node`, `outside-parent`, `unit-overlap`, `label-on-node`,
`label-on-header` (an edge label on a group's title), `coincident-edges`. It returns a
findings array (empty = clean).
`scripts/check.mjs` runs it on every embedded spec and treats **any finding as a
failure**, so a diagram that validates but renders a lie cannot ship. Layout-quality
*metrics* (crossings, bends, wander, fill) stay informational under `--metrics`.

Programmatic access: `window.sysgram.get("<id>")` → `{ spec, layout, errors, warnings }`;
`window.sysgram.describe("<id>")` → deterministic plain-text adjacency summary;
`window.sysgram.toSVG("<id>")` → standalone SVG markup (what the ⬇ SVG button saves).

## How an AI should read a sysgram page

1. `Read` the HTML file; find `<script type="application/sysgram+json">` (or
   `<script type="application/json" data-sysgram>` — both are accepted).
2. The JSON inside is the complete diagram. `nodes[].desc` / `edges[].desc` carry the
   prose; `facts` carry structured semantics (protocol, trust, consistency, …).
   Containment = `groups[].children`. Topology = `edges[]` (`from`/`to`, `kind` — note
   `webhook` means hint-not-truth and `isolation` means deliberately-no-flow). Narrative
   order = `step` numbers and `flows`. Standing rules = `assertions`.
3. Never scrape the rendered SVG — it is generated output, absent from the file on disk.
4. When driving a browser (Playwright), `window.sysgram.describe(id)` gives the same
   summary post-render, and validation state is in `window.sysgram.get(id).errors`.

## Authoring style guide (for agents)

- Node `label` ≤ 3 words; put tech detail in `sub` (`"NestJS · OpenAPI 3.1"`), meaning in
  `desc`. Every non-obvious node and edge deserves a `desc` — that's the AI-readability
  contract, and it becomes the hover tooltip.
- Edge `label`s name the protocol or action, not the direction (the arrow shows that).
- Prefer semantic `kind`s over tones. Use `tone:"accent"` for the few things the diagram
  is *about* (the original architecture diagram accents its authoritative core).
- Use `external` kind for anything outside our account/control; use a `zone` group for
  trust/vendor boundaries.
- Use `step` + `flows` when the diagram tells a story (webhook → verify → persist).
- Keep one diagram per concern. Two small diagrams beat one tangled one; a page can hold
  several spec blocks.
- After authoring, open the page (or run the layout test) — fix validation output before
  shipping. Then look at the picture: if it reads badly, adjust groups/direction first.

## Versioning & evolution

`"sysgram": "1"` is this document. Additive fields may land within v1 (unknown fields are
warnings, never errors, so old runtimes degrade gracefully). Breaking changes bump the
major and must keep the v1 parser path alive. The JSON Schema
(`schema/sysgram.schema.json`) mirrors this spec — update both together, and add a gallery
example for every new capability.

v1.1 additions (all additive): the ten-kind edge taxonomy (`webhook`, `auth`,
`schedule`, `telemetry`, `isolation`), `facts`, `assertions`, `fromSide`/`toSide`,
`arrange:"manual"` + `at`, `route:"smart"` collision-aware routing, Sugiyama
virtual-node channels for multi-rank edges, flow-aware node alignment, `iconCatalog` +
`icon` SVG artwork, and the click inspector. Several of these adopt the best ideas from
the parallel `ai-diagram-toolkit` design (semantic connection taxonomy, structured edge
semantics, assertions, icon catalog).

Deliberate non-goals for v1 (revisit if needed): sequence/ERD/flowchart modes, edge
waypoints, `sameRank` alignment constraints, animation, collaborative editing, external
spec files (`fetch` breaks `file://`).
