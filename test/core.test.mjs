// Core tests for the sysgram engine (DOM-free surface: parse, validate, layout, describe).
// Run: node --test sysgram/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sysgram from '../runtime/sysgram.js';

const runtimeSource = readFileSync(new URL('../runtime/sysgram.js', import.meta.url), 'utf8');

// ---------- helpers ----------

const spec = (over = {}) => ({
  sysgram: '1',
  id: 'demo',
  title: 'Demo',
  nodes: [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ],
  edges: [
    { id: 'e1', from: 'a', to: 'b', label: 'call' },
    { id: 'e2', from: 'b', to: 'c' },
  ],
  ...over,
});

const box = (l, id) => {
  const u = l.units[id];
  assert.ok(u, `layout has unit ${id}`);
  return u;
};
const overlaps = (p, q) =>
  p.x < q.x + q.w - 0.01 && q.x < p.x + p.w - 0.01 &&
  p.y < q.y + q.h - 0.01 && q.y < p.y + p.h - 0.01;
const inside = (child, parent) =>
  child.x >= parent.x - 0.01 && child.y >= parent.y - 0.01 &&
  child.x + child.w <= parent.x + parent.w + 0.01 &&
  child.y + child.h <= parent.y + parent.h + 0.01;
const codes = (list) => list.map((p) => p.code);

// ---------- API shape ----------

test('exports the core API', () => {
  assert.equal(sysgram.version, '1');
  assert.equal(typeof sysgram.parseSpec, 'function');
  assert.equal(typeof sysgram.validate, 'function');
  assert.equal(typeof sysgram.layout, 'function');
  assert.equal(typeof sysgram.describe, 'function');
});

test('expanded view stays in-page and never invokes the browser Fullscreen API', () => {
  assert.match(runtimeSource, /\.sysgram\.sg-expanded\{position:fixed/);
  assert.match(runtimeSource, /\.sysgram\.sg-expanded\{[^}]*transform:none!important/);
  assert.match(runtimeSource, /\.sysgram\.sg-expanded \.sg-canvas\{[^}]*overflow:auto/);
  assert.match(runtimeSource, /stage\.style\.width = zoomedW > expandedFit\.canvasW/);
  assert.match(runtimeSource, /stage\.style\.height = zoomedH > expandedFit\.canvasH/);
  assert.doesNotMatch(runtimeSource,
    /requestFullscreen|webkitRequestFullscreen|exitFullscreen|webkitExitFullscreen|fullscreenchange|webkitfullscreenchange|:fullscreen/);
});

test('expanded view escapes transformed host wrappers and restores its source position', () => {
  assert.match(runtimeSource, /function portalExpandedFigure\(doc, figure\)/);
  assert.match(runtimeSource, /doc\.body\.appendChild\(figure\)/);
  assert.match(runtimeSource, /function restoreExpandedFigure\(figure\)/);
  assert.match(runtimeSource, /marker\.parentNode\.insertBefore\(figure, marker\)/);
  assert.match(runtimeSource, /portalExpandedFigure\(doc, figure\);[\s\S]*figure\.classList\.add\('sg-expanded'\)/);
  assert.match(runtimeSource, /restoreExpandedFigure\(figure\);[\s\S]*figure\.classList\.remove\('sg-expanded'\)/);
});

// ---------- parseSpec (JSONC leniency) ----------

test('parses plain JSON', () => {
  const r = sysgram.parseSpec('{"sysgram":"1","id":"x","title":"X","nodes":[{"id":"n"}]}');
  assert.equal(r.ok, true);
  assert.equal(r.spec.id, 'x');
});

test('strips line and block comments', () => {
  const r = sysgram.parseSpec(`{
    // the version
    "sysgram": "1", /* inline */ "id": "x",
    "title": "X",
    "nodes": [{ "id": "n" }]
  }`);
  assert.equal(r.ok, true);
  assert.equal(r.spec.title, 'X');
});

test('tolerates trailing commas in objects and arrays', () => {
  const r = sysgram.parseSpec(`{
    "sysgram": "1", "id": "x", "title": "X",
    "nodes": [ { "id": "n", }, ],
  }`);
  assert.equal(r.ok, true);
  assert.equal(r.spec.nodes.length, 1);
});

test('leaves comment-looking text inside strings intact', () => {
  const r = sysgram.parseSpec(
    '{"sysgram":"1","id":"x","title":"a // b /* c */ d","nodes":[{"id":"n","href":"https://example.com/p"}]}'
  );
  assert.equal(r.ok, true);
  assert.equal(r.spec.title, 'a // b /* c */ d');
  assert.equal(r.spec.nodes[0].href, 'https://example.com/p');
});

test('handles escaped quotes before comment markers', () => {
  const r = sysgram.parseSpec('{"sysgram":"1","id":"x","title":"say \\"hi\\" // ok","nodes":[{"id":"n"}]}');
  assert.equal(r.ok, true);
  assert.equal(r.spec.title, 'say "hi" // ok');
});

test('reports malformed JSON as ok:false with a message', () => {
  const r = sysgram.parseSpec('{"sysgram": }');
  assert.equal(r.ok, false);
  assert.equal(typeof r.error, 'string');
  assert.ok(r.error.length > 0);
});

// ---------- validate ----------

test('accepts a well-formed spec', () => {
  const v = sysgram.validate(spec());
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings, []);
});

test('rejects duplicate ids across nodes and groups', () => {
  const v = sysgram.validate(spec({ groups: [{ id: 'a', children: ['b'] }] }));
  assert.ok(codes(v.errors).includes('duplicate-id'));
});

test('rejects unknown references from edges and group children', () => {
  const v = sysgram.validate(spec({
    edges: [{ from: 'a', to: 'ghost' }],
    groups: [{ id: 'g', children: ['phantom'] }],
  }));
  const c = codes(v.errors);
  assert.equal(c.filter((x) => x === 'unknown-ref').length, 2);
});

test('rejects a child claimed by two groups', () => {
  const v = sysgram.validate(spec({
    groups: [
      { id: 'g1', children: ['a'] },
      { id: 'g2', children: ['a'] },
    ],
  }));
  assert.ok(codes(v.errors).includes('multiple-parents'));
});

test('rejects group containment cycles', () => {
  const v = sysgram.validate(spec({
    groups: [
      { id: 'g1', children: ['g2', 'a'] },
      { id: 'g2', children: ['g1', 'b'] },
    ],
  }));
  assert.ok(codes(v.errors).includes('group-cycle'));
});

test('rejects an edge between a group and its own descendant', () => {
  const v = sysgram.validate(spec({
    groups: [{ id: 'g', children: ['a', 'b'] }],
    edges: [{ from: 'g', to: 'a' }],
  }));
  assert.ok(codes(v.errors).includes('edge-into-own-group'));
});

test('rejects missing required fields', () => {
  const v = sysgram.validate({ sysgram: '1', nodes: [{}] });
  assert.ok(codes(v.errors).includes('missing-required'));
});

test('warns on unknown kinds but does not error', () => {
  const v = sysgram.validate(spec({
    nodes: [{ id: 'a', kind: 'zeppelin' }, { id: 'b' }, { id: 'c' }],
    edges: [{ from: 'a', to: 'b', kind: 'telepathy' }],
  }));
  assert.deepEqual(v.errors, []);
  const w = codes(v.warnings);
  assert.ok(w.includes('unknown-kind'));
  assert.ok(w.includes('unknown-edge-kind'));
});

test('warns on flows referencing missing edges and on version mismatch', () => {
  const v = sysgram.validate(spec({
    sysgram: '9',
    flows: [{ id: 'f', label: 'F', steps: ['e1', 'nope'] }],
  }));
  const w = codes(v.warnings);
  assert.ok(w.includes('flow-unknown-edge'));
  assert.ok(w.includes('version-mismatch'));
});

// ---------- layout ----------

test('lays a chain out along the flow axis without overlap', () => {
  const l = sysgram.layout(spec());
  const [a, b, c] = ['a', 'b', 'c'].map((id) => box(l, id));
  assert.ok(a.x + a.w <= b.x, 'a left of b');
  assert.ok(b.x + b.w <= c.x, 'b left of c');
  assert.ok(l.size.w > 0 && l.size.h > 0);
});

test('direction "down" stacks the chain vertically', () => {
  const l = sysgram.layout(spec({ direction: 'down' }));
  const [a, b] = ['a', 'b'].map((id) => box(l, id));
  assert.ok(a.y + a.h <= b.y, 'a above b');
});

test('fan-out targets share a rank and never overlap', () => {
  const l = sysgram.layout(spec({
    edges: [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ],
  }));
  const [b, c] = ['b', 'c'].map((id) => box(l, id));
  assert.equal(b.rank, c.rank);
  assert.ok(!overlaps(b, c), 'siblings must not overlap');
});

test('explicit rank pins override edge-derived ranks', () => {
  const l = sysgram.layout(spec({
    nodes: [{ id: 'a' }, { id: 'b', rank: 0 }, { id: 'c' }],
  }));
  assert.equal(box(l, 'b').rank, 0);
});

test('group children sit inside the group box, transitively', () => {
  const l = sysgram.layout(spec({
    groups: [
      { id: 'outer', children: ['inner', 'c'] },
      { id: 'inner', children: ['a', 'b'] },
    ],
  }));
  const outer = box(l, 'outer');
  const inner = box(l, 'inner');
  assert.ok(inside(inner, outer), 'inner group inside outer');
  for (const id of ['a', 'b']) assert.ok(inside(box(l, id), inner), `${id} inside inner`);
  assert.ok(inside(box(l, 'c'), outer), 'c inside outer');
});

test('a group may flow in its own direction', () => {
  const l = sysgram.layout(spec({
    direction: 'right',
    groups: [{ id: 'g', children: ['b', 'c'], direction: 'down' }],
  }));
  const [b, c] = ['b', 'c'].map((id) => box(l, id));
  assert.ok(b.y + b.h <= c.y, 'inside the group, b stacks above c');
});

test('band nodes span their container below the flow', () => {
  const l = sysgram.layout(spec({
    nodes: [
      { id: 'a' }, { id: 'b' }, { id: 'c' },
      { id: 'obs', label: 'Observability', band: true },
    ],
  }));
  const obs = box(l, 'obs');
  const others = ['a', 'b', 'c'].map((id) => box(l, id));
  for (const o of others) {
    assert.ok(obs.y >= o.y + o.h, 'band sits below every flow node');
    assert.ok(obs.w >= o.w, 'band is at least as wide as any node');
  }
  const span = Math.max(...others.map((o) => o.x + o.w)) - Math.min(...others.map((o) => o.x));
  assert.ok(obs.w >= span - 0.01, 'band spans the full flow width');
});

test('no two siblings overlap in a busy graph', () => {
  const l = sysgram.layout(spec({
    nodes: 'abcdefgh'.split('').map((ch) => ({ id: ch })),
    edges: [
      { from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'a', to: 'd' },
      { from: 'b', to: 'e' }, { from: 'c', to: 'e' }, { from: 'd', to: 'f' },
      { from: 'e', to: 'g' }, { from: 'f', to: 'g' }, { from: 'g', to: 'h' },
      { from: 'h', to: 'a', kind: 'async' }, // cycle — must not hang or stack
    ],
  }));
  const ids = 'abcdefgh'.split('');
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      assert.ok(!overlaps(box(l, ids[i]), box(l, ids[j])), `${ids[i]} vs ${ids[j]}`);
});

test('edges get finite geometry and label anchors', () => {
  const l = sysgram.layout(spec());
  assert.equal(l.edges.length, 2);
  const e1 = l.edges.find((e) => e.id === 'e1');
  assert.ok(e1.pts.length >= 2);
  for (const p of e1.pts) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'finite points');
  }
  assert.ok(e1.label && Number.isFinite(e1.label.x), 'labelled edge has a label anchor');
});

test('an edge may target a group', () => {
  const l = sysgram.layout(spec({
    groups: [{ id: 'g', children: ['b', 'c'] }],
    edges: [{ id: 'e1', from: 'a', to: 'g' }],
  }));
  assert.equal(l.edges.length, 1);
  assert.ok(l.edges[0].pts.length >= 2);
});

test('layout is deterministic', () => {
  const s = spec({ groups: [{ id: 'g', children: ['b', 'c'] }] });
  const one = JSON.stringify(sysgram.layout(s));
  const two = JSON.stringify(sysgram.layout(s));
  assert.equal(one, two);
});

// ---------- v1.1: semantic edge taxonomy ----------

test('exposes the ten-kind edge taxonomy with sane defaults', () => {
  for (const k of ['sync', 'async', 'data', 'webhook', 'auth', 'schedule', 'telemetry', 'dep', 'assoc', 'isolation']) {
    assert.ok(sysgram.EDGE_KINDS[k], `kind ${k} exists`);
  }
  assert.equal(sysgram.EDGE_KINDS.webhook.tone, 'warn', 'webhooks default to the warn tone');
  assert.equal(sysgram.EDGE_KINDS.telemetry.tone, 'muted');
  assert.equal(sysgram.EDGE_KINDS.isolation.head, null, 'isolation draws no arrowhead');
  assert.equal(sysgram.EDGE_KINDS.auth.head, 'vee');
});

test('accepts the new edge kinds without warnings', () => {
  const v = sysgram.validate(spec({
    edges: [
      { from: 'a', to: 'b', kind: 'webhook' },
      { from: 'a', to: 'b', kind: 'auth' },
      { from: 'b', to: 'c', kind: 'schedule' },
      { from: 'b', to: 'c', kind: 'telemetry' },
      { from: 'a', to: 'c', kind: 'isolation' },
    ],
  }));
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings, []);
});

// ---------- v1.1: structured facts ----------

test('facts on nodes and edges survive into describe()', () => {
  const d = sysgram.describe(spec({
    nodes: [
      { id: 'a', facts: { owner: 'platform team' } },
      { id: 'b' }, { id: 'c' },
    ],
    edges: [{
      id: 'e1', from: 'a', to: 'b',
      facts: { protocol: 'PostgreSQL wire', mode: 'synchronous' },
    }],
  }));
  assert.ok(d.includes('owner=platform team'));
  assert.ok(d.includes('protocol=PostgreSQL wire'));
  assert.ok(d.includes('mode=synchronous'));
});

test('non-object facts warn instead of crashing', () => {
  const v = sysgram.validate(spec({
    nodes: [{ id: 'a', facts: 'fast' }, { id: 'b' }, { id: 'c' }],
  }));
  assert.deepEqual(v.errors, []);
  assert.ok(codes(v.warnings).includes('invalid-facts'));
});

// ---------- v1.1: assertions ----------

test('assertions validate their refs and appear in describe()', () => {
  const s = spec({
    assertions: [
      { id: 'hints-only', text: 'Webhooks are hints, never truth.', refs: ['e1', 'a'] },
    ],
  });
  const v = sysgram.validate(s);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings, []);
  const d = sysgram.describe(s);
  assert.ok(d.includes('assertions (1)'));
  assert.ok(d.includes('Webhooks are hints, never truth.'));
  assert.ok(d.includes('refs: e1, a'));
});

test('assertion refs to unknown ids warn', () => {
  const v = sysgram.validate(spec({
    assertions: [{ id: 'x', text: 'Ghost rule.', refs: ['nobody'] }],
  }));
  assert.ok(codes(v.warnings).includes('assertion-unknown-ref'));
});

// ---------- v1.1: endpoint side hints ----------

test('fromSide/toSide override the auto-picked anchors', () => {
  const l = sysgram.layout(spec({
    edges: [{ id: 'e1', from: 'a', to: 'b', routing: 'straight', fromSide: 'b', toSide: 't' }],
  }));
  const a = box(l, 'a'), b = box(l, 'b');
  const e = l.edges.find((x) => x.id === 'e1');
  assert.ok(Math.abs(e.pts[0].y - (a.y + a.h)) < 0.01, 'edge leaves the bottom of a');
  assert.ok(e.pts[0].x >= a.x && e.pts[0].x <= a.x + a.w);
  assert.ok(Math.abs(e.pts[e.pts.length - 1].y - b.y) < 0.01, 'edge enters the top of b');
});

test('invalid side values warn and fall back to auto', () => {
  const v = sysgram.validate(spec({
    edges: [{ from: 'a', to: 'b', fromSide: 'north' }],
  }));
  assert.deepEqual(v.errors, []);
  assert.ok(codes(v.warnings).includes('invalid-side'));
});

// ---------- v1.1: SVG icon catalog ----------

test('unknown icon references and bad catalog entries warn', () => {
  const v = sysgram.validate(spec({
    iconCatalog: {
      'aws-x': { src: './assets/aws/x.svg', label: 'AWS X' },
      'bad-entry': { label: 'no src' },
    },
    nodes: [
      { id: 'a', icon: 'aws-x' },
      { id: 'b', icon: 'ghost-icon' },
      { id: 'c' },
    ],
  }));
  assert.deepEqual(v.errors, []);
  const w = codes(v.warnings);
  assert.ok(w.includes('unknown-icon'), 'ghost-icon ref warns');
  assert.ok(w.includes('invalid-icon-src'), 'catalog entry without src warns');
});

test('icons surface in describe() and reserve node width', () => {
  const withIcons = spec({
    iconCatalog: {
      'ic-one': { src: './one.svg', label: 'One Service' },
      'ic-two': { src: 'data:image/svg+xml;base64,PHN2Zy8+', label: 'Two' },
    },
    nodes: [
      { id: 'a', label: 'UnwrappableComponentName', icon: ['ic-one', 'ic-two'] },
      { id: 'b' }, { id: 'c' },
    ],
  });
  const d = sysgram.describe(withIcons);
  assert.ok(d.includes('icon: One Service + Two'));
  const wide = sysgram.layout(withIcons).units.a.w;
  const plain = sysgram.layout(spec({
    nodes: [{ id: 'a', label: 'UnwrappableComponentName' }, { id: 'b' }, { id: 'c' }],
  })).units.a.w;
  assert.ok(wide >= plain + 20, `two icons reserve width (${wide} vs ${plain})`);
});

// ---------- v1.1: manual arrangement ----------

test('manual arrange honors authored positions relative to each other', () => {
  const l = sysgram.layout(spec({
    arrange: 'manual',
    nodes: [
      { id: 'a', at: [0, 0] },
      { id: 'b', at: [300, 40] },
      { id: 'c', at: [0, 160] },
    ],
  }));
  const a = box(l, 'a'), b = box(l, 'b'), c = box(l, 'c');
  assert.equal(Math.round(b.x - a.x), 300);
  assert.equal(Math.round(b.y - a.y), 40);
  assert.equal(Math.round(c.y - a.y), 160);
});

test('manual groups fit around their placed children', () => {
  const l = sysgram.layout(spec({
    arrange: 'manual',
    nodes: [
      { id: 'a', at: [0, 0] },
      { id: 'b', at: [40, 130] },
      { id: 'c', at: [420, 0] },
    ],
    groups: [{ id: 'g', children: ['a', 'b'] }],
  }));
  assert.ok(inside(box(l, 'a'), box(l, 'g')));
  assert.ok(inside(box(l, 'b'), box(l, 'g')));
  assert.ok(!overlaps(box(l, 'c'), box(l, 'g')), 'outsider stays outside');
});

test('manual arrange without positions warns but still renders every node', () => {
  const v = sysgram.validate(spec({ arrange: 'manual' }));
  assert.deepEqual(v.errors, []);
  assert.ok(codes(v.warnings).includes('manual-missing-at'));
  const l = sysgram.layout(spec({ arrange: 'manual' }));
  for (const id of ['a', 'b', 'c']) box(l, id);
});

// ---------- v1.1: flow-aware node alignment ----------

const centerY = (u) => u.y + u.h / 2;

test('a hub aligns to its median in-neighbor, not the mean', () => {
  const l = sysgram.layout(spec({
    nodes: [
      { id: 's1', sub: ['line one', 'line two', 'line three', 'line four'] },
      { id: 's2' },
      { id: 's3' },
      { id: 'hub' },
    ],
    edges: [
      { from: 's1', to: 'hub' },
      { from: 's2', to: 'hub' },
      { from: 's3', to: 'hub' },
    ],
  }));
  assert.ok(Math.abs(centerY(box(l, 'hub')) - centerY(box(l, 's2'))) < 0.5,
    'hub sits exactly on the middle source');
});

test('chain nodes snap onto their upstream axis for straight runs', () => {
  const l = sysgram.layout(spec({
    nodes: [{ id: 'a' }, { id: 'z' }, { id: 'v' }, { id: 'w' }],
    edges: [
      { from: 'a', to: 'v' },
      { from: 'v', to: 'w' },
      { from: 'z', to: 'w' },
    ],
  }));
  assert.ok(Math.abs(centerY(box(l, 'v')) - centerY(box(l, 'a'))) < 0.5,
    'the a→v run is perfectly straight');
});

// ---------- v1.1: collision-minimizing routing ----------

const edgeSamples = (e) => {
  const pts = e.pts;
  const out = [];
  if (e.routing === 'curve' && pts.length === 4) {
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, mt = 1 - t;
      out.push({
        x: mt ** 3 * pts[0].x + 3 * mt * mt * t * pts[1].x + 3 * mt * t * t * pts[2].x + t ** 3 * pts[3].x,
        y: mt ** 3 * pts[0].y + 3 * mt * mt * t * pts[1].y + 3 * mt * t * t * pts[2].y + t ** 3 * pts[3].y,
      });
    }
  } else {
    for (let s = 0; s < pts.length - 1; s++) {
      for (let i = 0; i <= 8; i++) {
        const f = i / 8;
        out.push({ x: pts[s].x + (pts[s + 1].x - pts[s].x) * f, y: pts[s].y + (pts[s + 1].y - pts[s].y) * f });
      }
    }
  }
  return out;
};
const hitsBox = (e, b, pad = 2) =>
  edgeSamples(e).some((p) => p.x > b.x + pad && p.x < b.x + b.w - pad && p.y > b.y + pad && p.y < b.y + b.h - pad);

test('auto routing does not run edges through unrelated nodes', () => {
  const l = sysgram.layout(spec({
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { id: 'skip', from: 'a', to: 'c' },
    ],
  }));
  const e = l.edges.find((x) => x.id === 'skip');
  assert.ok(!hitsBox(e, box(l, 'b')), 'a→c must route around b');
});

test('the canvas covers every routed edge, detours included', () => {
  const l = sysgram.layout(spec({
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { id: 'skip', from: 'a', to: 'c', label: 'detours' },
    ],
  }));
  for (const e of l.edges) {
    for (const p of e.pts) {
      assert.ok(p.x >= 0 && p.x <= l.size.w, `x ${p.x} within 0..${l.size.w}`);
      assert.ok(p.y >= 0 && p.y <= l.size.h, `y ${p.y} within 0..${l.size.h}`);
    }
    if (e.label) assert.ok(e.label.y >= 0 && e.label.y <= l.size.h, 'label inside canvas');
  }
});

test('multi-rank edges run through reserved channels, not outside detours', () => {
  // Sugiyama-style virtual nodes: the long edge must stay inside the rank band
  // (a reserved corridor) instead of looping around the whole diagram.
  const l = sysgram.layout(spec({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
      { id: 'long', from: 'a', to: 'd' },
    ],
  }));
  const e = l.edges.find((x) => x.id === 'long');
  for (const id of ['b', 'c']) assert.ok(!hitsBox(e, box(l, id)), `long edge clears ${id}`);
  const lo = Math.min(...['a', 'b', 'c', 'd'].map((id) => box(l, id).y)) - 12;
  const hi = Math.max(...['a', 'b', 'c', 'd'].map((id) => box(l, id).y + box(l, id).h)) + 12;
  for (const p of edgeSamples(e)) {
    assert.ok(p.y >= lo && p.y <= hi, `stays inside the band (${p.y} in ${lo}..${hi})`);
  }
});

test('crossing minimization keeps channels below sink-only nodes', () => {
  // Reference-architecture repro: a browser feeds web+identity; two hosted providers feed a
  // far hub through rank-1 channels. Zero-crossing order puts both channels
  // path below identity; barycenter-only ordering wedges them between web and
  // identity (2 crossings) and the webhooks tangle with the client cluster.
  const l = sysgram.layout(spec({
    nodes: [
      { id: 'browser', order: 0 },
      { id: 'provider-a', order: 1 },
      { id: 'provider-b', order: 2 },
      { id: 'web' },
      { id: 'identity' },
      { id: 'hub' },
    ],
    edges: [
      { from: 'browser', to: 'web' },
      { from: 'browser', to: 'identity' },
      { from: 'web', to: 'hub' },
      { id: 'a-hub', from: 'provider-a', to: 'hub', kind: 'webhook' },
      { id: 'b-hub', from: 'provider-b', to: 'hub', kind: 'webhook' },
    ],
  }));
  const identity = box(l, 'identity'), web = box(l, 'web');
  for (const eid of ['a-hub', 'b-hub']) {
    const e = l.edges.find((x) => x.id === eid);
    assert.ok(!hitsBox(e, web), `${eid} clears web`);
    assert.ok(!hitsBox(e, identity), `${eid} clears identity`);
    // the channel run through the rank-1 column stays below identity
    for (const p of edgeSamples(e)) {
      if (p.x > identity.x - 4 && p.x < identity.x + identity.w + 4) {
        assert.ok(p.y >= identity.y + identity.h - 1, `${eid} passes below identity (${p.y})`);
      }
    }
  }
});

test('channels run straight — no U-turns below blockers', () => {
  // Priority coordinates: the channel claims its latitude and the client
  // cluster yields upward, so the webhook line goes monotonically toward its
  // target instead of dipping under identity and climbing back up.
  const l = sysgram.layout(spec({
    nodes: [
      { id: 'browser', order: 0 },
      { id: 'provider-a', order: 1 },
      { id: 'provider-b', order: 2 },
      { id: 'web' },
      { id: 'identity' },
      { id: 'api' },
      { id: 'f1', sub: ['filler', 'filler'] },
      { id: 'f2', sub: ['filler', 'filler'] },
      { id: 'f3', sub: ['filler', 'filler'] },
    ],
    groups: [{ id: 'cloud', children: ['api', 'f1', 'f2', 'f3'] }],
    edges: [
      { from: 'browser', to: 'web' },
      { from: 'browser', to: 'identity' },
      { from: 'web', to: 'api' },
      { id: 'a-hub', from: 'provider-a', to: 'api', kind: 'webhook' },
      { id: 'b-hub', from: 'provider-b', to: 'f3', kind: 'webhook' },
    ],
  }));
  for (const eid of ['a-hub', 'b-hub']) {
    const e = l.edges.find((x) => x.id === eid);
    let wander = 0;
    for (let i = 0; i < e.pts.length - 1; i++) wander += Math.abs(e.pts[i + 1].y - e.pts[i].y);
    const direct = Math.abs(e.pts[e.pts.length - 1].y - e.pts[0].y);
    assert.ok(wander <= direct + 40, `${eid}: vertical wander ${Math.round(wander)} vs direct ${Math.round(direct)}`);
  }
});

test('edge labels dodge nodes when the midpoint is covered', () => {
  // The reference-page repro: a disconnected node packs beside the edge's real
  // target inside a group, and the incoming edge's midpoint — where the label
  // sits by default — lands on that neighbor. The label must slide along the
  // path to a clear spot instead.
  const l = sysgram.layout(spec({
    nodes: [
      { id: 'src', label: 'Source system' },
      { id: 'floater', label: 'Floating box no edges', sub: ['packs beside target'] },
      { id: 'target', label: 'Target service' },
    ],
    groups: [{ id: 'zone', direction: 'down', children: ['floater', 'target'] }],
    edges: [{ id: 'in', from: 'src', to: 'target', label: 'REST' }],
  }));
  const e = l.edges.find((x) => x.id === 'in');
  const f = box(l, 'floater');
  const onFloater =
    e.label.x > f.x - 14 && e.label.x < f.x + f.w + 14 &&
    e.label.y > f.y - 9 && e.label.y < f.y + f.h + 9;
  assert.ok(!onFloater,
    `label (${Math.round(e.label.x)},${Math.round(e.label.y)}) clears the floater box (${Math.round(f.x)},${Math.round(f.y)} ${Math.round(f.w)}×${Math.round(f.h)})`);
});

test('cycle breaking follows author order — groups flow by their earliest member', () => {
  // clients(group, declared first via its members) → mid(node) → zone(group)
  // → back to clients. The return edge must be the one reversed for ranking,
  // even though standalone nodes list before groups internally — the author
  // declared the clients first, so the flow starts there.
  const l = sysgram.layout(spec({
    nodes: [
      { id: 't', label: 'Visitor' },
      { id: 'm', label: 'Frontend' },
      { id: 'w', label: 'Worker' },
    ],
    groups: [
      { id: 'g1', label: 'Clients', children: ['t'] },
      { id: 'g2', label: 'Zone', children: ['w'] },
    ],
    edges: [
      { from: 't', to: 'm' },
      { from: 'm', to: 'w' },
      { id: 'return', from: 'w', to: 't', kind: 'data' },
    ],
  }));
  assert.equal(l.units.g1.rank, 0, 'clients group starts the flow');
  assert.equal(l.units.m.rank, 1, 'frontend follows');
  assert.equal(l.units.g2.rank, 2, 'zone comes last; the return edge is the reversed one');
});

test('slack sources tighten toward their targets instead of camping at rank 0', () => {
  // GKNV tight ranking: a node whose only edge points deep into the flow
  // (the scheduler pattern) must sit right before its target — longest-path
  // alone leaves it at rank 0 with a pointless multi-rank channel.
  const l = sysgram.layout(spec({
    nodes: [
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
      { id: 'late' },
      { id: 'pinned', rank: 0 },
    ],
    edges: [
      { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' },
      { from: 'late', to: 'd' },
      { from: 'pinned', to: 'd' },
    ],
  }));
  assert.equal(box(l, 'late').rank, 2, 'late sits right before its target');
  assert.equal(box(l, 'pinned').rank, 0, 'explicit rank pins stay law');
  assert.equal(box(l, 'd').rank, 3);
});

test('disconnected components pack beside the flow, not far away', () => {
  // A component with no edges to the rest (the media/evidence pair in the reference
  // diagram) must sit next to the main flow — the coordinate passes must not
  // let the components drift apart (unanchored translation per sweep).
  const l = sysgram.layout(spec({
    direction: 'right',
    groups: [{ id: 'platform', direction: 'down', children: ['gateway', 'api', 'db', 'outbox', 'bus', 'sched', 'workers', 'mailer', 'store-a', 'store-b'] }],
    nodes: [
      { id: 'gateway' }, { id: 'api', label: 'Application API long name' },
      { id: 'db', sub: ['state machines'] }, { id: 'outbox', sub: ['committed events'] },
      { id: 'bus', label: 'Event bus' }, { id: 'sched', rank: 3, sub: ['one-shots'] },
      { id: 'workers', order: 0, sub: ['background jobs'] }, { id: 'mailer', rank: 4, order: 1 },
      { id: 'store-a', sub: ['encrypted media'] }, { id: 'store-b', sub: ['audit evidence'] },
    ],
    edges: [
      { from: 'gateway', to: 'api' }, { from: 'api', to: 'db' }, { from: 'api', to: 'outbox' },
      { from: 'outbox', to: 'bus' }, { from: 'bus', to: 'workers' }, { from: 'bus', to: 'mailer' },
      { from: 'sched', to: 'workers' }, { from: 'workers', to: 'mailer' }, { from: 'store-a', to: 'store-b' },
    ],
  }));
  const main = ['gateway', 'api', 'db', 'outbox', 'bus', 'sched', 'workers', 'mailer'];
  const mainMax = Math.max(...main.map((id) => box(l, id).x + box(l, id).w));
  const pairMin = Math.min(box(l, 'store-a').x, box(l, 'store-b').x);
  assert.ok(pairMin - mainMax <= 60,
    `storage pair hugs the flow (gap ${Math.round(pairMin - mainMax)}px)`);
  for (const id of main) {
    assert.ok(!overlaps(box(l, id), box(l, 'store-a')) && !overlaps(box(l, id), box(l, 'store-b')),
      `${id} does not overlap the packed pair`);
  }
});

test('two channels sharing a gutter run on separate tracks', () => {
  // Sander channel routing: horizontal runs that share an inter-rank gutter
  // get parallel tracks — two crossing chains must not lay their vertical
  // segments on the exact same gutter line.
  const l = sysgram.layout(spec({
    nodes: [
      { id: 's1', order: 0 },
      { id: 's2', order: 1 },
      { id: 'm' },
      { id: 'tTop', sub: ['filler', 'filler'] },
      { id: 'tBottom', sub: ['filler', 'filler'] },
    ],
    groups: [{ id: 'zone', children: ['tTop', 'tBottom'] }],
    edges: [
      { from: 's1', to: 'm' },
      { from: 'm', to: 'tTop' },
      { id: 'x1', from: 's1', to: 'tBottom', kind: 'async' },
      { id: 'x2', from: 's2', to: 'tTop', kind: 'async' },
    ],
  }));
  const vert = (e) => {
    const runs = [];
    for (let i = 0; i < e.pts.length - 1; i++) {
      const p = e.pts[i], q = e.pts[i + 1];
      if (Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) > 6) {
        runs.push({ x: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) });
      }
    }
    return runs;
  };
  const r1 = vert(l.edges.find((e) => e.id === 'x1'));
  const r2 = vert(l.edges.find((e) => e.id === 'x2'));
  for (const a of r1) {
    for (const b of r2) {
      const yOverlap = Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo);
      if (yOverlap > 4) {
        assert.ok(Math.abs(a.x - b.x) >= 5,
          `overlapping vertical runs share a line (x=${Math.round(a.x)} vs ${Math.round(b.x)}, overlap ${Math.round(yOverlap)})`);
      }
    }
  }
});

test('route:"simple" turns collision avoidance off', () => {
  const l = sysgram.layout(spec({
    route: 'simple',
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { id: 'skip', from: 'a', to: 'c' },
    ],
  }));
  const e = l.edges.find((x) => x.id === 'skip');
  assert.ok(hitsBox(e, box(l, 'b')), 'simple mode keeps the naive path');
});

test('ordering ties send sinks toward the reading side', () => {
  // api feeds a dead-end store (rds) and a continuing spine (outbox → eb).
  // Both children tie on median under api; the tie must resolve by role —
  // spine keeps the lane, the sink exits to the right — not by declaration
  // order (rds is deliberately declared first here).
  const l = sysgram.layout(spec({
    direction: 'down',
    nodes: [
      { id: 'api' }, { id: 'rds' }, { id: 'outbox' }, { id: 'eb' },
    ],
    edges: [
      { from: 'api', to: 'rds' },
      { from: 'api', to: 'outbox' },
      { from: 'outbox', to: 'eb' },
    ],
  }));
  assert.ok(box(l, 'rds').x > box(l, 'outbox').x,
    `sink rds sits right of the outbox spine (${Math.round(box(l, 'rds').x)} vs ${Math.round(box(l, 'outbox').x)})`);
  const cx = (id) => box(l, id).x + box(l, id).w / 2;
  assert.ok(Math.abs(cx('outbox') - cx('api')) < 2, 'spine stays in the api lane');
});

// ---------- layout families ----------

test('layout:"tree" builds a tidy tree — parents centered over their subtrees', () => {
  const l = sysgram.layout(spec({
    layout: 'tree',
    nodes: [
      { id: 'root' }, { id: 'l' }, { id: 'r' },
      { id: 'll' }, { id: 'lr' }, { id: 'rr' },
    ],
    edges: [
      { from: 'root', to: 'l' }, { from: 'root', to: 'r' },
      { from: 'l', to: 'll' }, { from: 'l', to: 'lr' }, { from: 'r', to: 'rr' },
    ],
  }));
  assert.ok(box(l, 'l').x >= box(l, 'root').x + box(l, 'root').w, 'children sit one depth further');
  assert.ok(box(l, 'll').x >= box(l, 'l').x + box(l, 'l').w);
  const cy = (id) => box(l, id).y + box(l, id).h / 2;
  const mid = (cy('ll') + cy('lr')) / 2;
  assert.ok(Math.abs(cy('l') - mid) < 2, `l centered over ll+lr (${cy('l')} vs ${mid})`);
  for (const [a, b] of [['l', 'r'], ['ll', 'lr'], ['lr', 'rr']]) {
    assert.ok(!overlaps(box(l, a), box(l, b)), `${a}/${b} clear`);
  }
});

test('layout:"radial" rings neighbors around the hub at equal radius', () => {
  const l = sysgram.layout(spec({
    layout: 'radial',
    nodes: [{ id: 'hub' }, { id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' }],
    edges: [1, 2, 3, 4, 5].map((i) => ({ from: 'hub', to: 's' + i })),
  }));
  const c = (id) => { const b = box(l, id); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };
  const hub = c('hub');
  const radii = [1, 2, 3, 4, 5].map((i) => Math.hypot(c('s' + i).x - hub.x, c('s' + i).y - hub.y));
  const spread = Math.max(...radii) - Math.min(...radii);
  assert.ok(spread < 2, `spokes share one radius (spread ${Math.round(spread)})`);
  for (let i = 1; i <= 5; i++) {
    for (let j = i + 1; j <= 5; j++) {
      assert.ok(!overlaps(box(l, 's' + i), box(l, 's' + j)), `s${i}/s${j} clear`);
    }
  }
});

test('tree/radial layouts reject groups for now, loudly', () => {
  const v = sysgram.validate(spec({
    layout: 'tree',
    groups: [{ id: 'g', children: ['b'] }],
  }));
  assert.ok(codes(v.errors).includes('layout-unsupported'));
});

test('unknown layout warns and falls back to layered', () => {
  const v = sysgram.validate(spec({ layout: 'sunburst' }));
  assert.ok(codes(v.warnings).includes('unknown-layout'));
  const l = sysgram.layout(spec({ layout: 'sunburst' }));
  assert.ok(l.units.a && l.units.c, 'still renders (layered fallback)');
});

test('layout is byte-deterministic — same spec, identical output', () => {
  // The engine's standing promise (no randomness, no dates, total-order
  // tiebreaks): two runs over one spec must agree on every coordinate.
  const make = () => spec({
    groups: [{ id: 'g', direction: 'down', children: ['b', 'c'] }],
    nodes: [
      { id: 'a' }, { id: 'b' }, { id: 'c', sub: ['line'] }, { id: 'd' }, { id: 'lone' },
    ],
    edges: [
      { id: 'e1', from: 'a', to: 'b', label: 'call' },
      { id: 'e2', from: 'b', to: 'c' },
      { id: 'e3', from: 'c', to: 'd' },
      { id: 'e4', from: 'd', to: 'a', kind: 'async' },
    ],
  });
  const l1 = sysgram.layout(make());
  const l2 = sysgram.layout(make());
  assert.deepEqual(l1.units, l2.units);
  assert.deepEqual(l1.edges, l2.edges);
  assert.deepEqual(l1.size, l2.size);
});

// ---------- describe ----------

test('describe() renders a deterministic adjacency summary', () => {
  const d = sysgram.describe(spec({
    groups: [{ id: 'g', label: 'Zone', children: ['b', 'c'] }],
    flows: [{ id: 'f1', label: 'Happy path', steps: ['e1', 'e2'] }],
  }));
  assert.ok(d.includes('Demo'));
  assert.ok(d.includes('nodes (3)'));
  assert.ok(d.includes('- a "Alpha" [service]'));
  assert.ok(d.includes('groups (1)'));
  assert.ok(d.includes('children: b, c'));
  assert.ok(d.includes('edges (2)'));
  assert.ok(d.includes('- a -> b [sync] "call"'));
  assert.ok(d.includes('flows (1)'));
  assert.equal(d, sysgram.describe(spec({
    groups: [{ id: 'g', label: 'Zone', children: ['b', 'c'] }],
    flows: [{ id: 'f1', label: 'Happy path', steps: ['e1', 'e2'] }],
  })));
});

// ---------- geometry audit (sysgram.audit) ----------

// Manual arrangement lets tests force bad geometry the auto-layout would avoid.
const strikeSpec = (over = {}) => ({
  sysgram: '1',
  id: 'geom',
  title: 'Geometry fixture',
  arrange: 'manual',
  nodes: [
    { id: 'a', label: 'A', at: [0, 40] },
    { id: 'mid', label: 'Mid', at: [180, 40] },
    { id: 'b', label: 'B', at: [400, 40] },
  ],
  edges: [{ id: 'ab', from: 'a', to: 'b', routing: 'straight' }],
  ...over,
});

test('audit: reports an edge passing through a node', () => {
  const found = sysgram.audit(strikeSpec());
  assert.ok(found.some((f) => f.code === 'edge-through-node' && f.msg.includes('mid')),
    JSON.stringify(found));
});

test('audit: clean on a well-laid-out spec', () => {
  assert.deepEqual(sysgram.audit(spec()), []);
});

test('audit: reports a child rendered outside its group box', () => {
  const s = spec({ groups: [{ id: 'g', label: 'G', children: ['a', 'b'] }] });
  const lay = sysgram.layout(s);
  lay.units.a.x = lay.units.g.x + lay.units.g.w + 60;
  const found = sysgram.audit(s, lay);
  assert.ok(found.some((f) => f.code === 'outside-parent' && f.msg.includes('"a"')),
    JSON.stringify(found));
});

test('audit: reports a label sitting on a node', () => {
  const s = strikeSpec();
  s.edges = [{ id: 'ab', from: 'a', to: 'b', routing: 'straight',
    label: 'a very long edge label riding the line', labelAt: 0.5 }];
  const found = sysgram.audit(s);
  assert.ok(found.some((f) => f.code === 'label-on-node'), JSON.stringify(found));
});

test('audit: reports coincident overlapping edge runs', () => {
  const s = strikeSpec({
    nodes: [
      { id: 'a', label: 'A', at: [0, 0] },
      { id: 'b', label: 'B', at: [500, 0] },
      { id: 'c', label: 'C', at: [150, 0] },
      { id: 'd', label: 'D', at: [330, 0] },
    ],
    edges: [
      { id: 'ab', from: 'a', to: 'b', routing: 'straight' },
      { id: 'cd', from: 'c', to: 'd', routing: 'straight' },
    ],
  });
  const found = sysgram.audit(s);
  assert.ok(found.some((f) => f.code === 'coincident-edges'), JSON.stringify(found));
});

test('audit: reports overlapping units', () => {
  const s = strikeSpec({
    nodes: [
      { id: 'a', label: 'A', at: [0, 0] },
      { id: 'b', label: 'B', at: [40, 10] },
    ],
    edges: [],
  });
  const found = sysgram.audit(s);
  assert.ok(found.some((f) => f.code === 'unit-overlap'), JSON.stringify(found));
});

// ---------- flow continuity ----------

test('validate: warns when a flow story breaks its chain at one step', () => {
  const s = spec({
    nodes: [
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' },
    ],
    edges: [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'b', to: 'c' },
      { id: 'e4', from: 'd', to: 'e' },
    ],
    flows: [{ id: 'f', label: 'F', steps: ['e1', 'e2', 'e4'] }],
  });
  const v = sysgram.validate(s);
  assert.ok(codes(v.warnings).includes('flow-discontinuous'), JSON.stringify(v.warnings));
});

test('validate: a fully disconnected flow is a set, not a broken story', () => {
  const s = spec({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'd' }, { id: 'e' }],
    edges: [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e4', from: 'd', to: 'e' },
    ],
    flows: [{ id: 'f', label: 'F', steps: ['e1', 'e4'] }],
  });
  assert.ok(!codes(sysgram.validate(s).warnings).includes('flow-discontinuous'));
});

// ---------- membership suspicion ----------

test('validate: flags an ungrouped node sandwiched inside one group\'s flow', () => {
  const s = spec({ groups: [{ id: 'g', label: 'G', children: ['a', 'c'] }] });
  // a -> b -> c with a and c in g: flow enters g, leaves to b, returns — b
  // almost certainly forgot its membership
  const v = sysgram.validate(s);
  const w = v.warnings.filter((x) => x.code === 'maybe-member');
  assert.equal(w.length, 1, JSON.stringify(v.warnings));
  assert.ok(w[0].msg.includes('"b"') && w[0].msg.includes('"g"'));
});

test('validate: no membership suspicion across different groups', () => {
  const s = spec({ groups: [{ id: 'g', label: 'G', children: ['a'] }] });
  assert.ok(!codes(sysgram.validate(s).warnings).includes('maybe-member'));
});

// ---------- facts vocabulary ----------

test('validate: warns on near-miss fact keys, leaves custom keys alone', () => {
  const s = spec();
  s.edges = [{ id: 'e1', from: 'a', to: 'b',
    facts: { protocl: 'https', trust: 'hint', playbook: 'x' } }];
  const v = sysgram.validate(s);
  const w = v.warnings.filter((x) => x.code === 'fact-key-typo');
  assert.equal(w.length, 1, JSON.stringify(v.warnings));
  assert.ok(w[0].msg.includes('protocol'));
});

// ---------- machine-checked assertion rules ----------

const ruled = (rule, extraEdges = []) => spec({
  edges: [
    { id: 'e1', from: 'a', to: 'b', label: 'call' },
    { id: 'e2', from: 'b', to: 'c' },
    ...extraEdges,
  ],
  assertions: [{ id: 'r1', text: 'rule under test', rule }],
});

test('validate: only-via passes when every path goes through the waypoint', () => {
  const v = sysgram.validate(ruled({ kind: 'only-via', from: 'a', to: 'c', via: 'b' }));
  assert.deepEqual(v.errors, []);
});

test('validate: only-via fails when a bypass path exists', () => {
  const v = sysgram.validate(ruled({ kind: 'only-via', from: 'a', to: 'c', via: 'b' },
    [{ id: 'e3', from: 'a', to: 'c' }]));
  assert.ok(codes(v.errors).includes('assertion-violated'), JSON.stringify(v.errors));
});

test('validate: forbid-edge fails on a direct edge', () => {
  const v = sysgram.validate(ruled({ kind: 'forbid-edge', from: 'a', to: 'b' }));
  assert.ok(codes(v.errors).includes('assertion-violated'));
});

test('validate: forbid-path ignores isolation edges', () => {
  const s = spec({
    edges: [{ id: 'iso', from: 'a', to: 'b', kind: 'isolation' }],
    assertions: [{ id: 'r', text: 't', rule: { kind: 'forbid-path', from: 'a', to: 'b' } }],
  });
  assert.deepEqual(sysgram.validate(s).errors, []);
});

test('validate: forbid-path with both checks the reverse direction too', () => {
  const s = spec({
    assertions: [{ id: 'r', text: 't',
      rule: { kind: 'forbid-path', from: 'c', to: 'a', both: true } }],
  });
  assert.ok(codes(sysgram.validate(s).errors).includes('assertion-violated'));
});

test('validate: require-edge fails when absent, passes with matching kind', () => {
  const bad = sysgram.validate(spec({
    assertions: [{ id: 'r', text: 't', rule: { kind: 'require-edge', from: 'a', to: 'c' } }],
  }));
  assert.ok(codes(bad.errors).includes('assertion-violated'));
  const good = sysgram.validate(spec({
    assertions: [{ id: 'r', text: 't',
      rule: { kind: 'require-edge', from: 'a', to: 'b', edgeKind: 'sync' } }],
  }));
  assert.deepEqual(good.errors, []);
});

test('validate: unknown rule kinds and rule ids warn, never error', () => {
  const v = sysgram.validate(spec({
    assertions: [
      { id: 'r1', text: 't', rule: { kind: 'quantum-check', from: 'a', to: 'b' } },
      { id: 'r2', text: 't', rule: { kind: 'forbid-edge', from: 'ghost', to: 'b' } },
    ],
  }));
  assert.deepEqual(v.errors, []);
  assert.ok(codes(v.warnings).includes('unknown-rule'));
  assert.ok(codes(v.warnings).includes('assertion-unknown-ref'));
});

test('describe: a machine-checked assertion says so', () => {
  const d = sysgram.describe(ruled({ kind: 'only-via', from: 'a', to: 'c', via: 'b' }));
  assert.ok(d.includes('machine-checked'), d);
});

// ---------- boundary group kinds ----------

test('validate: boundary group kinds are first-class, unknown kinds warn', () => {
  const ok = sysgram.validate(spec({
    groups: [{ id: 'g', label: 'G', kind: 'trust-boundary', children: ['a', 'b'] }],
  }));
  assert.deepEqual(ok.warnings.filter((w) => w.code === 'unknown-group-kind'), []);
  const d = sysgram.describe(spec({
    groups: [{ id: 'g', label: 'G', kind: 'trust-boundary', children: ['a', 'b'] }],
  }));
  assert.ok(d.includes('[trust-boundary]'), d);

  const bad = sysgram.validate(spec({
    groups: [{ id: 'g', label: 'G', kind: 'castle', children: ['a'] }],
  }));
  assert.ok(codes(bad.warnings).includes('unknown-group-kind'));
});

test('normalize: trust-boundary groups default to the warn tone', () => {
  const m = sysgram.normalize(spec({
    groups: [{ id: 'g', label: 'G', kind: 'trust-boundary', children: ['a', 'b'] }],
  }));
  assert.equal(m.groups[0].tone, 'warn');
});

test('layout: a wide label on a short edge widens the gap so the label fits', () => {
  const s = {
    sysgram: '1', id: 'lbl', title: 'L',
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    edges: [{ id: 'e1', from: 'a', to: 'b', label: 'a considerably wide edge label' }],
  };
  assert.deepEqual(sysgram.audit(s), []);
  const lay = sysgram.layout(s);
  const gap = lay.units.b.x - (lay.units.a.x + lay.units.a.w);
  assert.ok(gap > 66, `gap widened for the label, got ${gap}`);
});

test('layout: a channel edge dodges siblings on its way to a deep group child', () => {
  // cli -> b is multi-rank into group g where sibling a sits between the
  // border and b at the same latitude — the entry run must dodge a
  const s = {
    sysgram: '1', id: 'deep', title: 'D',
    nodes: [{ id: 'cli' }, { id: 'mid' }, { id: 'a' }, { id: 'b' }],
    groups: [{ id: 'g', label: 'G', children: ['a', 'b'] }],
    edges: [
      { id: 'e1', from: 'cli', to: 'mid' },
      { id: 'e2', from: 'mid', to: 'a' },
      { id: 'e3', from: 'a', to: 'b' },
      { id: 'e4', from: 'cli', to: 'b' },
    ],
  };
  const strikes = sysgram.audit(s).filter((f) => f.code === 'edge-through-node');
  assert.deepEqual(strikes, []);
});

test('layout: coincident parallel runs get separated onto tracks', () => {
  // two channel edges into deep children of the same group at nearby
  // latitudes must not share a run
  const s = {
    sysgram: '1', id: 'sep', title: 'S',
    nodes: [{ id: 'cli' }, { id: 'mid' }, { id: 'a' }, { id: 'b' }, { id: 'c' }],
    groups: [{ id: 'g', label: 'G', children: ['a', 'b', 'c'] }],
    edges: [
      { id: 'e1', from: 'cli', to: 'mid' },
      { id: 'e2', from: 'mid', to: 'a' },
      { id: 'e3', from: 'a', to: 'b' },
      { id: 'e3b', from: 'a', to: 'c' },
      { id: 'e4', from: 'cli', to: 'b' },
      { id: 'e5', from: 'cli', to: 'c' },
    ],
  };
  const co = sysgram.audit(s).filter((f) => f.code === 'coincident-edges');
  assert.deepEqual(co, []);
});

test('layout: label scan escalates to the far side when the near side is walled', () => {
  // an "awning" of nodes blocks every primary label position above the line;
  // the free side below must be found instead of shipping a label on a node
  const s = {
    sysgram: '1', id: 'awning', title: 'A', arrange: 'manual',
    nodes: [
      { id: 'a', label: 'A', at: [0, 100] },
      { id: 'b', label: 'B', at: [700, 100] },
      { id: 'w1', label: 'W', at: [110, 80] },
      { id: 'w2', label: 'W', at: [210, 80] },
      { id: 'w3', label: 'W', at: [310, 80] },
      { id: 'w4', label: 'W', at: [410, 80] },
      { id: 'w5', label: 'W', at: [510, 80] },
    ],
    edges: [{ id: 'ab', from: 'a', to: 'b', routing: 'straight', label: 'a route label long enough' }],
  };
  const labels = sysgram.audit(s).filter((f) => f.code === 'label-on-node');
  assert.deepEqual(labels, []);
});

test('validate: short vocabulary words match on case only, never distance', () => {
  const s = spec();
  s.edges = [{ id: 'e1', from: 'a', to: 'b', facts: { model: 'claims-from-DB', Mode: 'sync' } }];
  const w = sysgram.validate(s).warnings.filter((x) => x.code === 'fact-key-typo');
  assert.equal(w.length, 1, JSON.stringify(w));
  assert.ok(w[0].msg.includes('"Mode"'));
});

test('validate: external nodes are never membership suspects', () => {
  const s = spec({
    nodes: [{ id: 'a' }, { id: 'b', kind: 'external' }, { id: 'c' }],
    groups: [{ id: 'g', label: 'G', children: ['a', 'c'] }],
  });
  assert.ok(!codes(sysgram.validate(s).warnings).includes('maybe-member'));
});

test('layout: a long label between adjacent groups lifts clear of both boxes', () => {
  const s = {
    sysgram: '1', id: 'glabel', title: 'G',
    nodes: [
      { id: 'a', label: 'Alpha thing', sub: 'with a sub line' },
      { id: 'b', label: 'Beta thing', sub: 'with a sub line' },
    ],
    groups: [
      { id: 'g1', label: 'G1', children: ['a'] },
      { id: 'g2', label: 'G2', children: ['b'] },
    ],
    edges: [{ id: 'e1', from: 'a', to: 'b', label: 'a rather long bridging label' }],
  };
  const labels = sysgram.audit(s).filter((f) => f.code === 'label-on-node');
  assert.deepEqual(labels, []);
});

// header-strip fixture: an edge whose natural label position sits where a
// group's title renders
const headerSpec = () => ({
  sysgram: '1', id: 'hdr', title: 'H', arrange: 'manual',
  nodes: [
    { id: 'a', label: 'A', at: [0, 0] },
    { id: 'b', label: 'B', at: [500, 0] },
    { id: 'c', label: 'C', at: [200, 26] },
  ],
  groups: [{ id: 'g', label: 'A GROUP WITH A LONG HEADER', children: ['c'] }],
  edges: [{ id: 'ab', from: 'a', to: 'b', routing: 'straight', label: 'crossing label' }],
});

test('audit: reports a label sitting on a group header', () => {
  const s = headerSpec();
  const lay = sysgram.layout(s);
  const gu = lay.units.g;
  const e = lay.edges.find((x) => x.id === 'ab');
  e.label.x = gu.x + 40;
  e.label.y = gu.y + 14;
  const found = sysgram.audit(s, lay).filter((f) => f.code === 'label-on-header');
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.ok(found[0].msg.includes('"g"'));
});

test('layout: the label scan avoids group headers too', () => {
  const labels = sysgram.audit(headerSpec())
    .filter((f) => f.code === 'label-on-header' || f.code === 'label-on-node');
  assert.deepEqual(labels, []);
});

// ---------- sequence layout family ----------

const journey = () => ({
  sysgram: '1', id: 'seqj', title: 'Journey', layout: 'sequence',
  nodes: [
    { id: 'client', label: 'Client' },
    { id: 'api', label: 'API' },
    { id: 'ext', label: 'Provider', kind: 'external' },
  ],
  edges: [
    { id: 'm1', from: 'client', to: 'api', step: 1, label: 'POST /jobs creates a request' },
    { id: 'm2', from: 'client', to: 'api', step: 2, label: 'GET /jobs/:id polls the state' },
    { id: 'm3', from: 'api', to: 'ext', step: 3, label: 'scan requested', kind: 'async' },
    { id: 'm4', from: 'ext', to: 'api', step: 4, label: 'decision webhook', kind: 'webhook' },
    { id: 'm5', from: 'client', to: 'api', step: 5, label: 'GET /jobs/:id (poll until ready)' },
    { id: 'm6', from: 'client', to: 'api', step: 6, label: 'POST /exports' },
    { id: 'm7', from: 'client', to: 'api', step: 7, label: 'GET /exports/:id streams the bytes' },
  ],
});

test('sequence: one horizontal row per message, in step order', () => {
  const lay = sysgram.layout(journey());
  const ys = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'].map((id) => {
    const e = lay.edges.find((x) => x.id === id);
    assert.ok(e, `edge ${id} laid out`);
    assert.equal(e.pts.length, 2, `${id} is a straight row`);
    assert.ok(Math.abs(e.pts[0].y - e.pts[1].y) < 0.01, `${id} horizontal`);
    return e.pts[0].y;
  });
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] > ys[i - 1], 'rows descend in step order');
  const cardBottom = Math.max(...Object.values(lay.units).map((u) => u.y + u.h));
  assert.ok(ys[0] > cardBottom, 'rows start below the participant cards');
});

test('sequence: many same-pair labeled messages never collide', () => {
  assert.deepEqual(sysgram.audit(journey()), []);
});

test('sequence: participants keep declaration order; lifelines span the rows', () => {
  const lay = sysgram.layout(journey());
  assert.ok(lay.units.client.x < lay.units.api.x && lay.units.api.x < lay.units.ext.x);
  assert.ok(Array.isArray(lay.lifelines) && lay.lifelines.length === 3, 'one lifeline per participant');
  const lastRow = Math.max(...lay.edges.map((e) => e.pts[0].y));
  lay.lifelines.forEach((l) => assert.ok(l.y2 >= lastRow, 'lifeline reaches the last row'));
});

test('sequence: authored groups and bands flatten without mutating the spec', () => {
  const s = journey();
  s.groups = [{ id: 'g', label: 'G', children: ['client'] }];
  s.nodes[0].band = true;
  s.edges.push({ id: 'gm', from: 'g', to: 'ext', label: 'group-level fact' });
  s.flows = [{ id: 'f', label: 'Flow', steps: ['m1', 'gm'] }];
  s.assertions = [{ id: 'a', text: 'Group boundary holds', refs: ['g', 'gm'] }];
  assert.ok(!codes(sysgram.validate(s).errors).includes('layout-unsupported'));
  const lay = sysgram.layout(s);
  assert.equal(lay.units.g, undefined, 'group has no geometry in the sequence view');
  assert.equal(lay.edges.some((e) => e.id === 'gm'), false, 'group-level edges stay out of the flat view');
  assert.ok(Array.isArray(lay.lifelines), 'sequence geometry still renders');
  assert.deepEqual(sysgram.audit(s, lay), []);
  assert.equal(s.groups[0].id, 'g', 'authored containment is retained');
  assert.equal(s.nodes[0].band, true, 'authored band metadata is retained');
  assert.equal(s.edges.at(-1).id, 'gm', 'authored group-level edge is retained');
  assert.deepEqual(s.assertions[0].refs, ['g', 'gm'], 'authored group assertion is retained');
});

test('sequence: deterministic', () => {
  assert.deepEqual(sysgram.layout(journey()), sysgram.layout(journey()));
});

// ---------- label-vs-label + curve coincidence ----------

const crossing = () => ({
  sysgram: '1', id: 'lx', title: 'X', arrange: 'manual',
  nodes: [
    { id: 'a', label: 'A', at: [0, 0] },
    { id: 'b', label: 'B', at: [500, 60] },
    { id: 'c', label: 'C', at: [0, 60] },
    { id: 'd', label: 'D', at: [500, 0] },
  ],
  edges: [
    { id: 'ab', from: 'a', to: 'b', routing: 'straight', label: 'first crossing label' },
    { id: 'cd', from: 'c', to: 'd', routing: 'straight', label: 'second crossing label' },
  ],
});

test('audit: reports labels stacked on labels', () => {
  const s = crossing();
  const lay = sysgram.layout(s);
  const [e1, e2] = lay.edges;
  e2.label.x = e1.label.x;
  e2.label.y = e1.label.y;
  const found = sysgram.audit(s, lay).filter((f) => f.code === 'label-on-label');
  assert.ok(found.length >= 1, JSON.stringify(found));
});

test('layout: labels dodge already-placed labels', () => {
  assert.deepEqual(sysgram.audit(crossing()).filter((f) => f.code === 'label-on-label'), []);
});

test('audit: reports two curves tracing the same path', () => {
  const s = spec();
  const lay = sysgram.layout(s);
  const [e1, e2] = lay.edges;
  assert.equal(e1.routing, 'curve');
  e2.pts = e1.pts.map((p) => ({ ...p }));
  assert.ok(sysgram.audit(s, lay).some((f) => f.code === 'coincident-edges'));
});
