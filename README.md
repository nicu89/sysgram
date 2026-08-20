# Sysgram

Declarative system diagrams: put a JSON spec in an HTML page and let one
dependency-free runtime validate it, lay it out, and render it as SVG.

Sysgram is designed for diagrams that need to stay understandable in source control.
The source of truth is a list of components, groups, connections, flows, and assertions—not
authored SVG coordinates. A person or an AI agent can understand the system by reading the
embedded JSON without executing the page.

## Features

- Dependency-free classic script; works directly over `file://`.
- Deterministic layered, tree, radial, and sequence layouts.
- Compound groups, trust boundaries, semantic node and edge kinds, and SVG icon catalogs.
- Flow walkthroughs, structured facts, assertions, inspection, pan/zoom, and SVG export.
- The same core loads through CommonJS for validation, tests, and headless layout checks.
- A geometry gate catches overlaps, edge strikes, label collisions, and coincident runs.

## Repository map

| Path | Purpose |
|---|---|
| `SPEC.md` | Authoring contract and complete format reference. |
| `LAYOUT.md` | Layout algorithms, rationale, metrics, and upgrade paths. |
| `schema/sysgram.schema.json` | JSON Schema mirror of the authoring contract. |
| `runtime/sysgram.js` | Browser renderer and DOM-free validation/layout core. |
| `examples/hello.html` | Smallest useful page. |
| `examples/architecture.html` | Fictional but realistic system-architecture example. |
| `examples/sequence.html` | Fictional request and event conversation. |
| `examples/gallery.html` | One focused example per capability; also the visual test sheet. |
| `scripts/check.mjs` | Validates every embedded spec and runs the geometry gate. |
| `assets/aws/` | Complete optional AWS Architecture Service Icons set plus curated shortcuts, provenance, and checksums. |
| `test/core.test.mjs` | DOM-free parser, validation, layout, routing, and audit tests. |

## Quick start

Copy `examples/hello.html`, or add a spec and the runtime to an existing page:

```html
<script type="application/sysgram+json">
{
  "sysgram": "1",
  "id": "hello",
  "title": "Hello system",
  "nodes": [
    { "id": "web", "label": "Web app", "kind": "browser" },
    { "id": "api", "label": "API", "kind": "service", "tone": "accent" },
    { "id": "db", "label": "Database", "kind": "datastore" }
  ],
  "edges": [
    { "from": "web", "to": "api", "label": "HTTP" },
    { "from": "api", "to": "db", "kind": "data", "label": "SQL" }
  ]
}
</script>
<script src="../runtime/sysgram.js"></script>
```

No build step or server is required. Open the HTML file directly in a browser.

## Commands

```bash
npm test
npm run check
npm run check:metrics
```

`npm run check` parses every example spec, validates it, computes its layout, runs
`sysgram.audit`, and confirms referenced SVG icon files exist. The gallery includes
deliberately invalid examples marked with `data-sysgram-expect-errors`; those must fail
validation for the check to pass.

You can check other HTML files or directories with the CLI:

```bash
node scripts/check.mjs path/to/page.html path/to/docs
```

## Authoring model

The canonical artifact is an embedded JSON or JSONC block. Coordinates are normally
computed. If an automatic layout reads poorly, first improve containment and group
direction, then use a small number of `rank` or `order` hints. Manual coordinates are
available for exceptional reference views, not as the default workflow.

Four layout families cover the common shapes:

- `layered` for systems and directed flows;
- `tree` for hierarchies;
- `radial` for hub-and-spoke relationships;
- `sequence` for time-ordered conversations.

Read [SPEC.md](SPEC.md) before authoring and [LAYOUT.md](LAYOUT.md) before changing the
layout engine.

## Runtime API

In the browser:

```js
window.sysgram.get('diagram-id')
window.sysgram.describe('diagram-id')
window.sysgram.toSVG('diagram-id')
window.sysgram.render(element, spec)
```

In Node:

```js
const sysgram = require('./runtime/sysgram.js');

const parsed = sysgram.parseSpec(source);
const validation = sysgram.validate(parsed.spec);
const layout = sysgram.layout(parsed.spec);
const findings = sysgram.audit(parsed.spec, layout);
```

## Extending Sysgram

Add node kinds in `KINDS` and edge kinds in `EDGE_KINDS`. Every format capability must
update `SPEC.md`, the JSON Schema, the gallery, and relevant core tests together. Layout
changes should be test-driven and evaluated with both the geometry gate and metrics.

Additive format changes remain in spec version `1`; breaking changes require a new major
format version and a preserved v1 parse path.

## License

Except for separately identified third-party materials, Sysgram's original source code
and documentation are licensed under the [Apache License 2.0](LICENSE). See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for exclusions and attribution,
including the AWS Architecture Icons under `assets/aws/`.
