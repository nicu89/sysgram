# sysgram layout — the algorithms and why

The auto-layout in `runtime/sysgram.js` §5 is a layered (Sugiyama) pipeline assembled
from the published algorithms rather than ad-hoc heuristics. This file records what each
stage runs, where it comes from, what was deliberately rejected, and the upgrade paths —
so engine work starts from the literature, not from scratch. Companion: the survey that
drove these choices compared Graphviz/dot, dagre, ELK Layered, D2/TALA, and Mermaid.

Constraints every stage honors: deterministic (no randomness, no dates, total-order
tiebreaks ending in declaration index — two renders of one spec are byte-identical);
dependency-free classic-script JS; recursive bottom-up compound layout (each group lays
out first, then becomes one condensed unit in its parent's level).

## Pipeline (per container level)

| Stage | Algorithm | Source |
|---|---|---|
| Cycle handling | DFS back-edge reversal in declaration order; a group's flow position is its **earliest-declared member**, so DFS starts where the author started and return edges (pushes, deliveries) are the ones reversed | GKNV §2.1 (dot's default; "input order reflects intended flow", extended to compound units) |
| Ranking | Longest-path from sources, then **slack tightening** — every unpinned unit pulls up to (nearest out-neighbor − 1), cascading until stable, so a scheduler-pattern node sits beside its target instead of camping at rank 0; `rank` pins win | GKNV §2 (longest-path + the tight-tree idea, approximated) |
| Label gaps | A **direct** adjacent-rank edge (no group ports) whose label pill is wider than the rank gap widens exactly that gap along the flow axis (label height, not width, on vertical flows) — so short edges never wear their label on a node | GKNV §5 (edge labels as virtual label nodes doubling ranksep), simplified to per-gap widening |
| Long edges | Virtual (dummy) node per intermediate rank; chains carry the edge through ordering + coordinates as a reserved corridor | Sugiyama 1981; GKNV §3 |
| Ordering | Median sweeps alternating direction + adjacent-swap transpose, judged by true crossing count, **keep best order seen**; `order` hints are law; port nudge (below) breaks big-unit ties; remaining exact ties resolve by **reading direction** — the through-spine keeps the lane, sources enter from the near side, sinks exit toward the far side | GKNV §3 (wmedian + transpose + keep-best); reading-direction tie-break is a house policy, applied only where crossings are indifferent |
| Group ports | Cross-boundary edges attach at the real child's latitude inside the condensed group — computable because inner levels are sized bottom-up first. Used in ordering keys (`pos + portFraction`), coordinate attachment deltas, and routing targets | ELK external-port dummies / `FIXED_POS` hierarchical ports (Schulze et al., *Drawing Layered Graphs with Port Constraints*, JVLC 2014) |
| Coordinates | **GKNV priority method, port-aware**: units move to the median of neighbor attachment points in priority order (virtual ≈ ∞, else degree); movement clamped so rank order + separation always hold, with space reserved for not-yet-placed units. Alternating in/out sweeps; **keep the assignment minimizing Σ Ω·\|Δattach\|** with Ω = 8 virtual–virtual / 2 mixed / 1 real–real | GKNV §4.2 (`medianpos` + priority + Ω weights + keep-best `xlength`) |
| Component packing | Disconnected components pulled to `2×nodeGap` of each other on the cross axis (never spread apart; skipped if any rank interleaves components) — nothing else bounds their gap | dot's component packing, simplified |
| Routing | Adjacent-rank edges: cubic, rerouted as scored orthogonal when they'd lance a node (score = collisions·1000 + bends·8 + length·0.05 — bends before length, cf. libavoid). Detour lanes try shorter entry stubs (26/12/6) so they fit the tight gaps port-packing creates. Channel edges: orthogonal through their corridor; cross-axis jogs happen **only in node-free gutters**, and jogs sharing a gutter get parallel tracks by deterministic interval coloring. Labels with no authored `labelAt` slide along the path to the first pill position clearing every node box | Sander, *A Fast Heuristic for Hierarchical Manhattan Layout*, GD'95 (channels/tracks); Wybrow et al., GD 2009 (bend-averse scoring) |
| Settle passes | Two deterministic post-passes on the routed polylines. **Run dodging**: a straight run that still lances nodes (typically a channel edge crossing a group's interior at a deep child's port latitude) is replaced by the best-scoring candidate through a free band between the obstacles (band midpoints + cluster edges × stub variants, same score as above). **Run separation**: two edges sharing a collinear run ≥16px are nudged onto ±8/±16 offsets when both run endpoints are interior bends and the offset stays clear of nodes and other runs. Labels/step badges/midpoints are computed *after* both passes | Same scored-candidate objective (Wybrow); separation is Sander's track idea applied to settled runs |

Why the pieces compose: ports give every edge a true target latitude; virtual chains with
top priority claim that latitude and stay straight; keep-best turns oscillating sweeps
into monotone progress (and stops unanchored components translating per cycle); packing
bounds what no edge constrains; gutters + tracks make the residual jogs collide-free.

## Layout families

`layout: "layered"` (default) runs the pipeline above. Two more families exist for
shapes a layered flow renders badly; both are deterministic, flat (no groups/bands —
validation error), and share the node sizing, edge routing, label, and theme machinery:

- **`tree`** — tidy forest in the Reingold–Tilford tradition, simplified to
  subtree-extent packing with parents centered over their children (Wetherell–Shannon
  style; full RT contours are unnecessary at sysgram sizes). Parent = source of the
  first cycle-free in-edge; other edges are cross-links. Depth columns reuse the
  layered per-rank sizing rhythm.
- **`radial`** — Eades-style radial tree: per component, the highest-degree node is the
  hub, BFS distance assigns rings, ring radius grows to fit its circumference, angles
  spread evenly in declaration order. Components pack left-to-right.
- **`sequence`** — UML-sequence-style lifelines: participants as columns (declaration
  order, `order` hints win), one horizontal row per message ordered by `step` then
  declaration, adjacent-pair gaps widened to fit their widest label. Exists because
  conversation-shaped content (many labeled calls between the same few participants)
  smears any topology layout — the row structure makes label collisions impossible by
  construction, so it needs none of the routing/scan machinery.

The family is **spec-declared** — the authored layout is the canonical picture
(deterministic, same for every reader, meaningful diffs). A page can opt into a toolbar
**viewing lens** (`data-sysgram-layout-picker`) that previews other families without
touching the JSON; tree/radial previews flatten containment. Within the layered family,
alternative coordinate algorithms
(Brandes–Köpf, network simplex) are deliberately NOT exposed as options: at sysgram
scale they converge on near-identical pictures (measured against the fictional reference
architecture), so they are engine upgrade paths,
not authoring choices.

## Key sources

- Gansner, Koutsofios, North, Vo — *A Technique for Drawing Directed Graphs*, IEEE TSE
  19(3), 1993 (`graphviz.org/documentation/TSE93.pdf`). Ranking, ordering, priority
  coordinates, Ω weights, spline regions.
- Schulze, Spönemann, von Hanxleden — *Drawing Layered Graphs with Port Constraints*,
  JVLC 25(2), 2014; ELK Layered docs (`eclipse.dev/elk`). Port-aware sweeps, hierarchical
  ports, recursive compound layout (`INHERIT`).
- Sander — GD'95 Manhattan layout (gutter channels, track assignment).
- Brandes, Köpf — GD 2001 coordinate assignment; **Brandes, Walter, Zink —
  *Erratum*, arXiv:2008.01252 (2020)**: the original compaction double-shifts classes and
  fails to accumulate shifts across class chains; dagre's `bk.js` predates the fix and
  has documented overlap bugs (dagre #158/#229/#432).
- Eades, Wormald — Algorithmica 1994 (median is a 3-approximation; barycenter unbounded).
- Wybrow, Marriott, Stuckey — *Orthogonal Connector Routing*, GD 2009 (libavoid).

## Rejected / deferred (and when to revisit)

- **Brandes–Köpf node placement** (dagre/ELK default): guaranteed straight inner
  segments and O(V+E), but correctness requires the 2020 erratum and the size/port-aware
  variant (Rüegg et al., GD 2015); at sysgram scale (≤ ~60 units/level) the priority
  method with keep-best matches its quality without the compaction subtleties. Revisit if
  containers grow past ~100 units.
- **Network-simplex ranking and coordinates** (dot's preferred x-engine: rank an
  auxiliary graph with a node per edge, Ω·ω weights, separation edges): *optimal* for the
  weighted objective and the natural next upgrade — one simplex doubles as ranker
  (tight-tree + cutvalues) and placer. Adopt if priority-method artifacts show up
  (slack ranks from longest-path are the first symptom to watch for).
- **Interpolated median + tie-flip refinements** in ordering (GKNV §3): plain median +
  transpose + keep-best hits 0 crossings on every current diagram; add if a real diagram
  shows residual crossings.
- **One global layered layout across hierarchy** (ELK `INCLUDE_CHILDREN`): rejected —
  per-group `direction` is a core sysgram feature; D2's docs call a single global
  direction "fundamental" to flat engines, and ELK's own default is the recursive mode
  sysgram uses. Fix quality *inside* the recursion (ports), not by flattening it.
- **Full visibility-graph routing** (libavoid): heavier than needed at this scale; the
  scored-candidate router borrows its bends-before-length objective instead.

## Measuring, not eyeballing

Two instruments, deliberately separate:

- **The geometry gate** — `sysgram.audit(spec)`, run by `check.mjs` on every embedded
  spec — reports *objective defects*: an edge through a node, a child outside its
  parent box, overlapping units, a label on a node, two edges running coincident.
  Any finding fails the check; these are never intended, so they are never a
  judgement call. The reference architecture fixtures have repeatedly caught
  edge-through-node strikes that visual inspection missed.
- **Metrics** — `node sysgram/scripts/check.mjs --metrics` prints per diagram:
  polyline/sampled-curve **crossings**, orthogonal **bends**, **wander** (path length ÷
  Manhattan endpoint distance; ×1 = monotone), **fill** (node area ÷ canvas), and the
  largest per-axis **void** between nodes. These are topology-dependent trade-offs
  (dodging a node adds crossings — correctly), so they inform but never fail.

Regressions in either are the cheap early warning; the engine tests in
`test/core.test.mjs` pin the semantic guarantees (straight channels, no U-turns,
corridor reservation, port alignment, component packing, gutter tracks, label-gap
widening, run dodging, overlap-freedom, determinism).
