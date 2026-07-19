#!/usr/bin/env node
// One-shot validator for sysgram pages: extracts every embedded spec block,
// parses, validates, lays it out headlessly, and runs the geometry gate
// (sysgram.audit: edges through nodes, children outside their group, unit
// overlaps, labels on nodes, coincident edge runs — objective defects, always
// failures). Non-zero exit on any failure.
//
//   node sysgram/scripts/check.mjs [files-or-directories...] [--strict] [--metrics]
//
// Default file set: every .html under sysgram/. A spec block may declare
// data-sysgram-expect-errors (deliberate fixtures) — then errors are REQUIRED.
// --strict also fails on warnings. --metrics prints layout-quality numbers
// (crossings, bends, wander, space use) per diagram — informational only,
// because unlike the gate they are topology-dependent judgement calls.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sysgram = require('../runtime/sysgram.js');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const strict = process.argv.includes('--strict');
const metrics = process.argv.includes('--metrics');
const args = process.argv.slice(2).filter((a) => a !== '--strict' && a !== '--metrics');

// ---- layout-quality metrics (informational; never fail the check) ----
const samplePts = (e) => {
  if (e.routing !== 'curve' || e.pts.length !== 4) return e.pts;
  const [p0, p1, p2, p3] = e.pts;
  const out = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, mt = 1 - t;
    out.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
};
const segsCross = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) &&
    o(a, b, c) !== 0 && o(c, d, a) !== 0;
};
function qualityOf(lay) {
  const polys = lay.edges.map(samplePts);
  let crossings = 0;
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      const share = ['from', 'to'].some((k) =>
        [lay.edges[j].from, lay.edges[j].to].includes(lay.edges[i][k]));
      if (share) continue; // fan-out from one node is not a defect
      let hit = false;
      for (let s = 0; s < polys[i].length - 1 && !hit; s++) {
        for (let t = 0; t < polys[j].length - 1 && !hit; t++) {
          if (segsCross(polys[i][s], polys[i][s + 1], polys[j][t], polys[j][t + 1])) hit = true;
        }
      }
      if (hit) crossings++;
    }
  }
  let bends = 0, wander = 0, direct = 0;
  for (const e of lay.edges) {
    const pts = samplePts(e);
    if (e.routing !== 'curve') {
      for (let i = 1; i < pts.length - 1; i++) {
        const d1 = { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
        const d2 = { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y };
        if (Math.abs(d1.x * d2.y - d1.y * d2.x) > 1) bends++;
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      wander += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
    }
    const a = pts[0], b = pts[pts.length - 1];
    direct += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  const nodes = Object.values(lay.units).filter((u) => u.type === 'node');
  const nodeArea = nodes.reduce((s, u) => s + u.w * u.h, 0);
  const gap = (axis) => {
    const iv = nodes.map((u) => [u[axis], u[axis] + (axis === 'x' ? u.w : u.h)])
      .sort((p, q) => p[0] - q[0]);
    let end = -Infinity, worst = 0;
    for (const [s, e] of iv) {
      if (end > -Infinity && s - end > worst) worst = s - end;
      end = Math.max(end, e);
    }
    return Math.round(worst);
  };
  return {
    crossings, bends,
    wander: direct ? +(wander / direct).toFixed(2) : 1,
    fill: +(nodeArea / (lay.size.w * lay.size.h)).toFixed(2),
    voidX: gap('x'), voidY: gap('y'),
  };
}

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function expandHtmlInputs(inputs) {
  const out = [];
  for (const input of inputs) {
    const p = resolve(input);
    if (!existsSync(p)) throw new Error(`sysgram check input does not exist: ${input}`);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else out.push(p);
  }
  return out;
}

const files = args.length ? expandHtmlInputs(args) : htmlFiles(root);
const BLOCK = /<script([^>]*)>([\s\S]*?)<\/script>/gi;

let checked = 0;
let failures = 0;
let warningsTotal = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(process.cwd(), file);
  for (const m of text.matchAll(BLOCK)) {
    const attrs = m[1] || '';
    const isSpec = /type="application\/sysgram\+json"/.test(attrs) ||
      (/type="application\/json"/.test(attrs) && /data-sysgram(?![-\w])/.test(attrs));
    if (!isSpec) continue;
    const expectErrors = /data-sysgram-expect-errors/.test(attrs);
    checked++;
    const label = () => `${rel} :: ${(spec && spec.id) || '(no id)'}`;
    const fail = (msg) => { failures++; console.error(`  ✖ ${label()} — ${msg}`); };

    const parsed = sysgram.parseSpec(m[2]);
    let spec = parsed.ok ? parsed.spec : null;
    if (!parsed.ok) {
      if (expectErrors) { console.log(`  ✔ ${rel} :: (parse error, expected)`); continue; }
      fail(`spec is not valid JSON — ${parsed.error}`);
      continue;
    }
    const v = sysgram.validate(spec);
    if (expectErrors) {
      if (v.errors.length) console.log(`  ✔ ${label()} — ${v.errors.length} error(s), expected`);
      else fail('marked data-sysgram-expect-errors but validated clean');
      continue;
    }
    if (v.errors.length) {
      fail(v.errors.map((e) => `[${e.code}] ${e.msg}`).join(' · '));
      continue;
    }
    let lay;
    try {
      lay = sysgram.layout(spec);
    } catch (err) {
      fail(`layout threw — ${err && err.message}`);
      continue;
    }
    if (!Number.isFinite(lay.size.w) || !Number.isFinite(lay.size.h) || lay.size.w <= 0 || lay.size.h <= 0) {
      fail(`layout produced a degenerate canvas (${lay.size.w}×${lay.size.h})`);
      continue;
    }
    const badPts = lay.edges.some((e) => e.pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)));
    if (badPts) {
      fail('layout produced non-finite edge geometry');
      continue;
    }
    const geometry = sysgram.audit(spec, lay);
    if (geometry.length) {
      geometry.forEach((f) => fail(`[${f.code}] ${f.msg}`));
      continue;
    }
    let iconMissing = false;
    if (spec.iconCatalog && typeof spec.iconCatalog === 'object') {
      for (const [k, e] of Object.entries(spec.iconCatalog)) {
        const src = e && e.src;
        if (typeof src === 'string' && src.endsWith('.svg') && !src.startsWith('data:')) {
          if (!existsSync(resolve(dirname(file), src))) {
            fail(`icon "${k}" missing on disk: ${src}`);
            iconMissing = true;
          }
        }
      }
    }
    if (iconMissing) continue;
    warningsTotal += v.warnings.length;
    const wtxt = v.warnings.length
      ? ` — ${v.warnings.length} warning(s): ${v.warnings.map((w) => `[${w.code}] ${w.msg}`).join(' · ')}`
      : '';
    const q = metrics ? qualityOf(lay) : null;
    const qtxt = q
      ? ` [cross ${q.crossings} · bends ${q.bends} · wander ×${q.wander} · fill ${q.fill} · void ${q.voidX}×${q.voidY}]`
      : '';
    console.log(`  ✔ ${label()} (${Math.round(lay.size.w)}×${Math.round(lay.size.h)}, ${spec.nodes.length} nodes, ${(spec.edges || []).length} edges)${qtxt}${wtxt}`);
    if (strict && v.warnings.length) failures++;
  }
}

console.log(`sysgram check: ${checked} diagram(s) across ${files.length} file(s) — ` +
  `${failures ? failures + ' FAILURE(S)' : 'OK'}${warningsTotal ? `, ${warningsTotal} warning(s)` : ''}${strict ? ' [strict]' : ''}`);
process.exit(failures ? 1 : 0);
