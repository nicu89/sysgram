# Sysgram contributor instructions

Sysgram is a declarative diagram framework. Diagram sources are Sysgram JSON specs,
never hand-authored SVG coordinates.

## Diagram work

1. Read `SPEC.md` before authoring or editing a diagram.
2. Start from `examples/hello.html`; keep every example fictional and self-contained.
3. Describe semantics—nodes, groups, edges, facts, flows, and assertions. Do not add
   coordinates unless the requested artifact explicitly needs `arrange: "manual"`.
4. Keep pages usable over `file://`: relative paths, classic scripts, no fetch, no CDN,
   and no required build step.
5. Run `npm run check` and inspect the result in a browser before finishing.

## Runtime work

1. Use test-driven development for runtime changes.
2. Keep `runtime/sysgram.js` dependency-free, deterministic, classic-script compatible,
   and loadable through CommonJS in Node.
3. Update `SPEC.md`, `schema/sysgram.schema.json`, the gallery, and tests together for
   every format capability.
4. Read `LAYOUT.md` before changing layout or routing. Extend the documented algorithms
   rather than adding unrelated heuristics beside them.
5. Run `npm test`, `npm run check`, and `npm run check:metrics` after engine changes.

Examples must not contain private, customer, employer, or product-specific architecture.
Use invented organizations, services, domains, identifiers, and data.
