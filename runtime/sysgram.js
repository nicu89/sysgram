/*!
 * sysgram v1 — declarative system diagrams.
 *
 * A diagram is a JSON spec (see ../SPEC.md) embedded in an HTML page:
 *   <script type="application/sysgram+json"> { ... } </script>
 *   <script src=".../runtime/sysgram.js"></script>
 *
 * This file is self-contained: no dependencies, no network, classic script,
 * works over file://. It also loads under Node (CommonJS) for the layout
 * tests — everything above the "browser renderer" section is DOM-free.
 *
 * Public surface:
 *   browser: window.sysgram = { version, render, get, describe, toSVG, diagrams, ... }
 *   node:    module.exports  = { version, parseSpec, validate, layout, describe, KINDS, EDGE_KINDS }
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root.document !== 'undefined') {
    root.sysgram = api;
    api._autoInit(root.document);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var VERSION = '1';

  /* ================================================================
   * §1 Catalogs — node kinds, edge kinds, tones
   * ============================================================== */

  // Glyphs are 16×16 stroke paths (stroke: currentColor, fill: none, width 1.5).
  var GLYPHS = {
    gear: 'M8 5.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8M8 1.6v2.1M8 12.3v2.1M1.6 8h2.1M12.3 8h2.1M3.5 3.5l1.5 1.5M11 11l1.5 1.5M12.5 3.5 11 5M5 11l-1.5 1.5',
    window: 'M2 3.2h12v9.6H2zM2 6.2h12M4.2 4.7h.01',
    person: 'M8 2.8a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6M2.9 13.4c.6-2.9 2.6-4.2 5.1-4.2s4.5 1.3 5.1 4.2',
    bolt: 'M9 2 5 8.6h3L7 14l4-6.6H8z',
    lines: 'M3 5.3h8M5 8h8M3 10.7h8',
    route: 'M2 12.4h3.4a2 2 0 0 0 2-2V5.6a2 2 0 0 1 2-2H14M11.8 1.5 14 3.6l-2.2 2.1',
    loop: 'M12.6 5.4A5.2 5.2 0 0 0 3.7 6.5M3.5 3.3v3.2h3.2M3.4 10.6a5.2 5.2 0 0 0 8.9-1.1M12.5 12.7V9.5H9.3',
    clock: 'M8 2.4a5.6 5.6 0 1 1 0 11.2A5.6 5.6 0 0 1 8 2.4M8 4.9v3.3l2.2 1.3',
    box: 'M2.6 5.4 8 3l5.4 2.4v5.2L8 13l-5.4-2.4zM2.6 5.4 8 7.9l5.4-2.5M8 7.9V13',
    shield: 'M8 2.1 13 4v4.1c0 3-2.1 5-5 5.9-2.9-.9-5-2.9-5-5.9V4zM5.8 7.9l1.6 1.6 2.8-3',
    mail: 'M2 4.3h12v7.4H2zM2 4.8l6 4.4 6-4.4',
    key: 'M5.2 6.6a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2M7.5 8.5l6-5.2M11 5.6l1.6 1.8M13 3.9l1.2 1.4',
    split: 'M1.8 8h3.4M5.2 8c2.2 0 2.1-3.2 4.3-3.2h4.2M5.2 8c2.2 0 2.1 3.2 4.3 3.2h4.2M12.2 3.2l1.5 1.6-1.5 1.5M12.2 9.7l1.5 1.5-1.5 1.6',
    globe: 'M8 2.4a5.6 5.6 0 1 1 0 11.2A5.6 5.6 0 0 1 8 2.4M2.4 8h11.2M8 2.4C5 4.5 5 11.5 8 13.6M8 2.4c3 2.1 3 9.1 0 11.2',
    lambda: 'M4.4 3.2c1.5 0 2.1.7 2.8 2.2l4.4 8M8.2 8.6 4.4 13.4',
    spark: 'M8 2.4 9.4 6.6 13.6 8 9.4 9.4 8 13.6 6.6 9.4 2.4 8l4.2-1.4z',
    plug: 'M5.6 2.4v3.4M10.4 2.4v3.4M4 5.8h8v2.4a4 4 0 0 1-8 0zM8 12.2v1.9',
    pulse: 'M1.8 8.6h2.7l1.6-4.2 2.7 7.6 1.7-3.4h3.7',
    dot: 'M8 6.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8',
  };

  // shape: round | cylinder | pill | lid | note
  var KINDS = {
    service: { shape: 'round', glyph: 'gear', label: 'service' },
    browser: { shape: 'round', glyph: 'window', label: 'browser / client' },
    user: { shape: 'round', glyph: 'person', label: 'user / actor' },
    datastore: { shape: 'cylinder', glyph: null, label: 'datastore' },
    cache: { shape: 'cylinder', glyph: 'bolt', label: 'cache' },
    queue: { shape: 'pill', glyph: 'lines', label: 'queue' },
    bus: { shape: 'round', glyph: 'route', label: 'event bus' },
    worker: { shape: 'round', glyph: 'loop', label: 'worker' },
    scheduler: { shape: 'round', glyph: 'clock', label: 'scheduler' },
    storage: { shape: 'lid', glyph: 'box', label: 'object storage' },
    vault: { shape: 'round', glyph: 'shield', label: 'vault' },
    email: { shape: 'round', glyph: 'mail', label: 'email' },
    auth: { shape: 'round', glyph: 'key', label: 'auth / identity' },
    lb: { shape: 'round', glyph: 'split', label: 'gateway / LB' },
    cdn: { shape: 'round', glyph: 'globe', label: 'CDN / edge' },
    function: { shape: 'round', glyph: 'lambda', label: 'function' },
    ai: { shape: 'round', glyph: 'spark', label: 'AI / model' },
    external: { shape: 'round', glyph: 'plug', label: 'external SaaS', dashed: true },
    observability: { shape: 'round', glyph: 'pulse', label: 'observability' },
    note: { shape: 'note', glyph: null, label: 'note' },
  };

  // Connection meaning and appearance are separate: kind carries the semantics,
  // dash + arrowhead + weight carry it visually (tone only reinforces).
  var EDGE_KINDS = {
    sync: { width: 1.6, dash: null, head: 'tri', tone: 'accent', label: 'sync call' },
    data: { width: 2.6, dash: null, head: 'tri', tone: 'accent', label: 'data flow' },
    async: { width: 1.6, dash: '7 5', head: 'tri', tone: 'accent', label: 'async / event' },
    webhook: { width: 1.6, dash: '3 4', head: 'tri', tone: 'warn', label: 'webhook (hint)' },
    auth: { width: 1.5, dash: '9 3 2 3', head: 'vee', tone: 'accent', label: 'auth exchange' },
    schedule: { width: 1.7, dash: '1.5 4', head: 'tri', tone: 'accent', label: 'schedule / timer' },
    telemetry: { width: 1.2, dash: '1 5', head: 'vee', tone: 'muted', label: 'telemetry' },
    dep: { width: 1.5, dash: '2 3.5', head: 'vee', tone: 'muted', label: 'dependency' },
    assoc: { width: 1.2, dash: null, head: null, tone: 'muted', label: 'association' },
    isolation: { width: 1.2, dash: '5 5', head: null, tone: 'muted', label: 'isolation (no flow)' },
  };

  var TONES = ['default', 'accent', 'muted', 'warn'];
  var GROUP_STYLES = ['dashed', 'solid', 'tint'];
  // zone/platform/tier are visual groupings; the rest name what CROSSING the
  // border means (trust, network, ownership, geography, swim-lane)
  var GROUP_KINDS = ['zone', 'platform', 'tier', 'trust-boundary', 'network', 'account', 'region', 'lane'];
  // executable assertion rules — checked by validate() against the edge graph
  var RULE_KINDS = ['forbid-edge', 'forbid-path', 'only-via', 'require-edge'];
  // recommended fact keys (SPEC.md "facts vocabulary") — never required; near
  // misses get a typo warning, unknown keys stay first-class
  var FACT_VOCAB = ['protocol', 'mode', 'payload', 'authority', 'trust', 'delivery',
    'consistency', 'idempotency', 'encryption', 'retention', 'failure'];
  var SIDES = ['l', 'r', 't', 'b'];
  var TOP_FIELDS = ['sysgram', 'id', 'title', 'description', 'caption', 'direction',
    'layout', 'arrange', 'route', 'accent', 'accentDark', 'legend', 'iconCatalog', 'nodes',
    'groups', 'edges', 'flows', 'assertions', 'meta'];
  var ICON_SLOT = 24; // px per icon (20px image + gap), replaces the glyph indent

  /* ================================================================
   * §2 JSONC parsing — comments + trailing commas, string-safe
   * ============================================================== */

  function stripJsonc(text) {
    var out = '', i = 0, n = text.length, inStr = false, esc = false, ch;
    while (i < n) {
      ch = text[i];
      if (inStr) {
        out += ch;
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        i++;
        continue;
      }
      if (ch === '"') { inStr = true; out += ch; i++; continue; }
      if (ch === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
      if (ch === '/' && text[i + 1] === '*') {
        i += 2;
        while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      out += ch;
      i++;
    }
    // second pass: drop trailing commas (comments are gone, strings intact)
    var res = '', s = false, e = false, j, c, k;
    for (j = 0; j < out.length; j++) {
      c = out[j];
      if (s) {
        res += c;
        if (e) e = false;
        else if (c === '\\') e = true;
        else if (c === '"') s = false;
        continue;
      }
      if (c === '"') { s = true; res += c; continue; }
      if (c === ',') {
        k = j + 1;
        while (k < out.length && /\s/.test(out[k])) k++;
        if (out[k] === '}' || out[k] === ']') continue;
      }
      res += c;
    }
    return res;
  }

  function parseSpec(text) {
    try {
      var spec = JSON.parse(stripJsonc(String(text)));
      return { ok: true, spec: spec };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  /* ================================================================
   * §3 Normalization + validation
   * ============================================================== */

  function isArr(x) { return Array.isArray(x); }
  function isStr(x) { return typeof x === 'string'; }

  // structured facts: a flat map of scalar values, stringified
  function cleanFacts(f) {
    if (!f || typeof f !== 'object' || isArr(f)) return null;
    var out = null;
    Object.keys(f).forEach(function (k) {
      var v = f[k];
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        (out = out || {})[k] = String(v);
      }
    });
    return out;
  }
  function badFacts(f) { return f !== undefined && (typeof f !== 'object' || isArr(f) || f === null); }

  // Fill defaults; never mutate the input spec.
  function normalize(spec) {
    var m = {
      id: spec.id, title: spec.title, description: spec.description || '',
      caption: spec.caption || '', direction: spec.direction === 'down' ? 'down' : 'right',
      layout: ['tree', 'radial', 'sequence'].indexOf(spec.layout) >= 0 ? spec.layout : 'layered',
      arrange: spec.arrange === 'manual' ? 'manual' : 'auto',
      route: spec.route === 'simple' ? 'simple' : 'smart',
      accent: spec.accent, accentDark: spec.accentDark,
      legend: spec.legend === undefined ? 'auto' : spec.legend,
      meta: spec.meta || null,
      nodes: [], groups: [], edges: [], flows: [], assertions: [],
      byId: {}, parentOf: {},
    };
    function cleanAt(a) {
      return isArr(a) && a.length === 2 && Number.isFinite(a[0]) && Number.isFinite(a[1])
        ? [a[0], a[1]] : null;
    }
    if (spec.iconCatalog && typeof spec.iconCatalog === 'object' && !isArr(spec.iconCatalog)) {
      m.iconCatalog = {};
      Object.keys(spec.iconCatalog).forEach(function (k) {
        var e = spec.iconCatalog[k];
        if (!e || typeof e !== 'object') return;
        m.iconCatalog[k] = {
          src: isStr(e.src) ? e.src : null,
          label: isStr(e.label) ? e.label : k,
          source: isStr(e.source) ? e.source : '',
        };
      });
    } else {
      m.iconCatalog = {};
    }
    (isArr(spec.nodes) ? spec.nodes : []).forEach(function (n, i) {
      if (!n || typeof n !== 'object') return;
      var node = {
        id: n.id, label: n.label !== undefined ? String(n.label) : String(n.id || ''),
        sub: n.sub === undefined ? [] : (isArr(n.sub) ? n.sub.map(String) : [String(n.sub)]),
        kind: KINDS[n.kind] ? n.kind : 'service', rawKind: n.kind,
        tone: TONES.indexOf(n.tone) >= 0 ? n.tone : 'default',
        tint: !!n.tint, badges: isArr(n.badges) ? n.badges.map(String) : [],
        href: isStr(n.href) ? n.href : null, desc: isStr(n.desc) ? n.desc : '',
        rank: Number.isInteger(n.rank) && n.rank >= 0 ? n.rank : null,
        order: typeof n.order === 'number' ? n.order : null,
        band: !!n.band, at: cleanAt(n.at), facts: cleanFacts(n.facts),
        icon: isStr(n.icon) ? [n.icon] : isArr(n.icon) ? n.icon.filter(isStr).slice(0, 2) : [],
        index: i, type: 'node',
      };
      m.nodes.push(node);
      if (isStr(node.id)) m.byId[node.id] = node;
    });
    (isArr(spec.groups) ? spec.groups : []).forEach(function (g, i) {
      if (!g || typeof g !== 'object') return;
      var gkind = GROUP_KINDS.indexOf(g.kind) >= 0 ? g.kind : 'zone';
      var group = {
        id: g.id, label: g.label !== undefined ? String(g.label) : String(g.id || ''),
        sub: isStr(g.sub) ? g.sub : '', kind: gkind,
        style: GROUP_STYLES.indexOf(g.style) >= 0 ? g.style : 'dashed',
        // a trust boundary is a warning by nature — amber unless the author says otherwise
        tone: TONES.indexOf(g.tone) >= 0 ? g.tone : (gkind === 'trust-boundary' ? 'warn' : 'default'),
        children: isArr(g.children) ? g.children.slice() : [],
        direction: g.direction === 'down' || g.direction === 'right' ? g.direction : null,
        desc: isStr(g.desc) ? g.desc : '', href: isStr(g.href) ? g.href : null,
        rank: Number.isInteger(g.rank) && g.rank >= 0 ? g.rank : null,
        order: typeof g.order === 'number' ? g.order : null,
        band: false, index: i, type: 'group',
      };
      m.groups.push(group);
      if (isStr(group.id) && !m.byId[group.id]) m.byId[group.id] = group;
    });
    m.groups.forEach(function (g) {
      g.children.forEach(function (cid) {
        if (m.byId[cid] && m.parentOf[cid] === undefined) m.parentOf[cid] = g.id;
      });
    });
    (isArr(spec.edges) ? spec.edges : []).forEach(function (e, i) {
      if (!e || typeof e !== 'object') return;
      m.edges.push({
        id: isStr(e.id) ? e.id : 'e' + (i + 1),
        from: e.from, to: e.to, label: isStr(e.label) ? e.label : '',
        kind: EDGE_KINDS[e.kind] ? e.kind : 'sync', rawKind: e.kind,
        both: !!e.both,
        tone: ['accent', 'muted', 'warn'].indexOf(e.tone) >= 0 ? e.tone : EDGE_KINDS[EDGE_KINDS[e.kind] ? e.kind : 'sync'].tone,
        routing: ['auto', 'curve', 'ortho', 'straight'].indexOf(e.routing) >= 0 ? e.routing : 'auto',
        step: Number.isInteger(e.step) && e.step >= 1 ? e.step : null,
        labelAt: typeof e.labelAt === 'number' ? Math.min(0.95, Math.max(0.05, e.labelAt)) : null,
        fromSide: SIDES.indexOf(e.fromSide) >= 0 ? e.fromSide : null,
        toSide: SIDES.indexOf(e.toSide) >= 0 ? e.toSide : null,
        facts: cleanFacts(e.facts),
        desc: isStr(e.desc) ? e.desc : '', index: i,
      });
    });
    (isArr(spec.flows) ? spec.flows : []).forEach(function (f, i) {
      if (!f || typeof f !== 'object') return;
      m.flows.push({
        id: isStr(f.id) ? f.id : 'flow' + (i + 1),
        label: f.label !== undefined ? String(f.label) : String(f.id || ''),
        steps: isArr(f.steps) ? f.steps.map(String) : [],
        desc: isStr(f.desc) ? f.desc : '',
      });
    });
    (isArr(spec.assertions) ? spec.assertions : []).forEach(function (a, i) {
      if (!a || typeof a !== 'object') return;
      m.assertions.push({
        id: isStr(a.id) ? a.id : 'assert' + (i + 1),
        text: a.text !== undefined ? String(a.text) : '',
        refs: isArr(a.refs) ? a.refs.map(String) : [],
        rule: a.rule && typeof a.rule === 'object' && !isArr(a.rule) ? a.rule : null,
      });
    });
    return m;
  }

  // Non-layered views have no containment geometry. Keep groups/bands and
  // group-level facts in the authored spec, but omit them (plus references to
  // them) from a flattened viewing lens.
  function flattenContainment(spec) {
    if (!spec) return spec;
    var hasGroups = isArr(spec.groups) && spec.groups.length > 0;
    var hasBands = isArr(spec.nodes) && spec.nodes.some(function (n) { return n && n.band; });
    if (!hasGroups && !hasBands) return spec;
    var groupIds = {};
    (spec.groups || []).forEach(function (g) { if (g && isStr(g.id)) groupIds[g.id] = true; });
    var flat = {};
    Object.keys(spec).forEach(function (k) { flat[k] = spec[k]; });
    delete flat.groups;
    if (hasBands) {
      flat.nodes = spec.nodes.map(function (n) {
        if (!n || !n.band) return n;
        var copy = {};
        Object.keys(n).forEach(function (k) { if (k !== 'band') copy[k] = n[k]; });
        return copy;
      });
    }
    flat.edges = (spec.edges || []).filter(function (e) {
      return e && !groupIds[e.from] && !groupIds[e.to];
    });
    var keptIds = {};
    (flat.nodes || []).forEach(function (n) { if (n && isStr(n.id)) keptIds[n.id] = true; });
    flat.edges.forEach(function (e) { if (e && isStr(e.id)) keptIds[e.id] = true; });
    flat.flows = (spec.flows || []).map(function (f) {
      if (!f || !isArr(f.steps)) return f;
      var copy = {};
      Object.keys(f).forEach(function (k) { copy[k] = f[k]; });
      copy.steps = f.steps.filter(function (id) { return keptIds[id]; });
      return copy;
    });
    flat.assertions = (spec.assertions || []).map(function (a) {
      if (!a || !isArr(a.refs)) return a;
      var copy = {};
      Object.keys(a).forEach(function (k) { copy[k] = a[k]; });
      copy.refs = a.refs.filter(function (id) { return keptIds[id]; });
      return copy;
    });
    return flat;
  }

  function flattenSequenceContainment(spec) {
    return spec && spec.layout === 'sequence' ? flattenContainment(spec) : spec;
  }

  // edit distance exactly 1 (one substitution, insertion, or deletion)
  function lev1(a, b) {
    if (a === b) return false;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    if (la === lb) {
      var diff = 0;
      for (var i = 0; i < la; i++) if (a[i] !== b[i]) diff++;
      return diff === 1;
    }
    var s = la < lb ? a : b, l = la < lb ? b : a, si = 0, li = 0, skipped = false;
    while (si < s.length && li < l.length) {
      if (s[si] === l[li]) { si++; li++; continue; }
      if (skipped) return false;
      skipped = true;
      li++;
    }
    return true;
  }

  function validate(spec) {
    var errors = [], warnings = [];
    function err(code, msg) { errors.push({ code: code, msg: msg }); }
    function warn(code, msg) { warnings.push({ code: code, msg: msg }); }
    // near-miss fact keys are almost always typos; unknown keys are fine
    function lintFacts(facts, whose) {
      if (!facts || typeof facts !== 'object' || isArr(facts)) return;
      Object.keys(facts).forEach(function (k) {
        if (FACT_VOCAB.indexOf(k) >= 0) return;
        var lk = k.toLowerCase();
        for (var i = 0; i < FACT_VOCAB.length; i++) {
          // short vocabulary words ("mode") match on case only — at ≤4 letters,
          // distance-1 neighbors are usually different real words ("model")
          var near = FACT_VOCAB[i].length > 4 && lev1(lk, FACT_VOCAB[i]);
          if (lk === FACT_VOCAB[i] || near) {
            warn('fact-key-typo', whose + ': fact key "' + k + '" — did you mean "' + FACT_VOCAB[i] + '"?');
            return;
          }
        }
      });
    }

    if (!spec || typeof spec !== 'object' || isArr(spec)) {
      err('missing-required', 'spec must be a JSON object');
      return { errors: errors, warnings: warnings };
    }
    if (spec.sysgram !== undefined && spec.sysgram !== VERSION) {
      warn('version-mismatch', 'spec declares sysgram "' + spec.sysgram + '"; this runtime is v' + VERSION + ' (best-effort render)');
    }
    if (!isStr(spec.id) || !spec.id) err('missing-required', 'top-level "id" is required');
    if (!isStr(spec.title) || !spec.title) err('missing-required', 'top-level "title" is required');
    if (!isArr(spec.nodes) || spec.nodes.length === 0) err('missing-required', '"nodes" must be a non-empty array');

    Object.keys(spec).forEach(function (k) {
      if (TOP_FIELDS.indexOf(k) < 0) warn('unknown-field', 'unknown top-level field "' + k + '"');
    });

    if (spec.layout !== undefined && ['layered', 'tree', 'radial', 'sequence'].indexOf(spec.layout) < 0) {
      warn('unknown-layout', 'unknown layout "' + spec.layout + '" (rendered as layered)');
    }
    if (spec.layout === 'tree' || spec.layout === 'radial') {
      var hasGroups = isArr(spec.groups) && spec.groups.length > 0;
      var hasBands = isArr(spec.nodes) && spec.nodes.some(function (n) { return n && n.band; });
      if (hasGroups || hasBands) {
        err('layout-unsupported', 'layout "' + spec.layout + '" does not support ' +
          (hasGroups ? 'groups' : 'bands') + ' yet — use the default layered layout');
      }
    }

    if (spec.iconCatalog && typeof spec.iconCatalog === 'object' && !isArr(spec.iconCatalog)) {
      Object.keys(spec.iconCatalog).forEach(function (k) {
        var e = spec.iconCatalog[k];
        var src = e && e.src;
        if (!isStr(src) || !(src.endsWith('.svg') || src.indexOf('data:image/svg+xml') === 0)) {
          warn('invalid-icon-src', 'iconCatalog "' + k + '": "src" must be a relative .svg path or an image/svg+xml data URI');
        }
      });
    } else if (spec.iconCatalog !== undefined) {
      warn('invalid-icon-src', '"iconCatalog" must be an object of {src, label} entries');
    }

    var seen = {}, ids = [];
    function claim(id, what) {
      if (!isStr(id) || !id) { err('missing-required', what + ' is missing an "id"'); return; }
      if (seen[id]) err('duplicate-id', 'id "' + id + '" used by both ' + seen[id] + ' and ' + what);
      else { seen[id] = what; ids.push(id); }
    }
    var manual = spec.arrange === 'manual';
    var realNodes = {};
    (isArr(spec.nodes) ? spec.nodes : []).forEach(function (n, i) {
      claim(n && n.id, 'node #' + i);
      // external-kind nodes are declared outsiders — never membership suspects
      if (n && isStr(n.id) && n.kind !== 'external') realNodes[n.id] = true;
      if (n && !badFacts(n.facts)) lintFacts(n.facts, 'node "' + (n.id || '#' + i) + '"');
      if (n && n.kind !== undefined && !KINDS[n.kind]) warn('unknown-kind', 'node "' + (n.id || '#' + i) + '": unknown kind "' + n.kind + '" (rendered as service)');
      if (n && n.tone !== undefined && TONES.indexOf(n.tone) < 0) warn('unknown-field', 'node "' + (n.id || '#' + i) + '": unknown tone "' + n.tone + '"');
      if (n && badFacts(n.facts)) warn('invalid-facts', 'node "' + (n.id || '#' + i) + '": "facts" must be an object of scalar values');
      if (n && n.icon !== undefined) {
        var refs = isStr(n.icon) ? [n.icon] : isArr(n.icon) ? n.icon : null;
        if (!refs || refs.length > 2 || refs.some(function (r) { return !isStr(r); })) {
          warn('invalid-icon', 'node "' + (n.id || '#' + i) + '": "icon" must be a catalog id or an array of at most two');
        } else {
          refs.forEach(function (r) {
            if (!spec.iconCatalog || !spec.iconCatalog[r]) warn('unknown-icon', 'node "' + (n.id || '#' + i) + '": icon "' + r + '" is not in iconCatalog (semantic glyph shown instead)');
          });
        }
      }
      var hasAt = n && isArr(n.at) && n.at.length === 2 && Number.isFinite(n.at[0]) && Number.isFinite(n.at[1]);
      if (manual && n && !hasAt && !n.band) warn('manual-missing-at', 'node "' + (n.id || '#' + i) + '": arrange:"manual" expects "at": [x, y] (stacked below the placed content)');
      if (!manual && n && n.at !== undefined) warn('ignored-at', 'node "' + (n.id || '#' + i) + '": "at" only applies with arrange:"manual"');
    });
    (isArr(spec.groups) ? spec.groups : []).forEach(function (g, i) {
      claim(g && g.id, 'group #' + i);
      if (!g || !isArr(g.children) || g.children.length === 0) err('missing-required', 'group "' + ((g && g.id) || '#' + i) + '" needs a non-empty "children" array');
      if (g && g.kind !== undefined && GROUP_KINDS.indexOf(g.kind) < 0) {
        warn('unknown-group-kind', 'group "' + (g.id || '#' + i) + '": unknown kind "' + g.kind + '" (rendered as zone)');
      }
    });

    var parentOf = {};
    (isArr(spec.groups) ? spec.groups : []).forEach(function (g) {
      if (!g || !isArr(g.children)) return;
      g.children.forEach(function (cid) {
        if (!seen[cid]) err('unknown-ref', 'group "' + g.id + '" references missing child "' + cid + '"');
        else if (parentOf[cid] !== undefined) err('multiple-parents', '"' + cid + '" is claimed by groups "' + parentOf[cid] + '" and "' + g.id + '"');
        else parentOf[cid] = g.id;
      });
    });

    // containment cycles
    (isArr(spec.groups) ? spec.groups : []).forEach(function (g) {
      if (!g || !isStr(g.id)) return;
      var cur = parentOf[g.id], hops = 0;
      while (cur !== undefined && hops <= ids.length) {
        if (cur === g.id) { err('group-cycle', 'group "' + g.id + '" contains itself through its ancestors'); break; }
        cur = parentOf[cur];
        hops++;
      }
    });

    function isAncestor(anc, id) {
      var cur = parentOf[id], hops = 0;
      while (cur !== undefined && hops <= ids.length) {
        if (cur === anc) return true;
        cur = parentOf[cur];
        hops++;
      }
      return false;
    }

    var edgeIds = {}, edgeEnds = {};
    (isArr(spec.edges) ? spec.edges : []).forEach(function (e, i) {
      var name = 'edge "' + ((e && e.id) || 'e' + (i + 1)) + '"';
      if (!e || !isStr(e.from) || !isStr(e.to)) { err('missing-required', name + ' needs "from" and "to"'); return; }
      if (!seen[e.from]) err('unknown-ref', name + ': unknown "from" id "' + e.from + '"');
      if (!seen[e.to]) err('unknown-ref', name + ': unknown "to" id "' + e.to + '"');
      if (seen[e.from] && seen[e.to] && (isAncestor(e.from, e.to) || isAncestor(e.to, e.from))) {
        err('edge-into-own-group', name + ' connects a group with its own descendant');
      }
      if (e.kind !== undefined && !EDGE_KINDS[e.kind]) warn('unknown-edge-kind', name + ': unknown kind "' + e.kind + '" (rendered as sync)');
      if (badFacts(e.facts)) warn('invalid-facts', name + ': "facts" must be an object of scalar values');
      else lintFacts(e.facts, name);
      ['fromSide', 'toSide'].forEach(function (sk) {
        if (e[sk] !== undefined && SIDES.indexOf(e[sk]) < 0) warn('invalid-side', name + ': ' + sk + ' must be one of l, r, t, b');
      });
      var eid = isStr(e.id) ? e.id : 'e' + (i + 1);
      edgeIds[eid] = true;
      edgeEnds[eid] = { from: e.from, to: e.to, both: !!e.both, kind: EDGE_KINDS[e.kind] ? e.kind : 'sync' };
      if (Number.isInteger(e.step)) {
        if (edgeIds['step:' + e.step]) warn('duplicate-step', 'step ' + e.step + ' appears on more than one edge');
        edgeIds['step:' + e.step] = true;
      }
    });

    (isArr(spec.flows) ? spec.flows : []).forEach(function (f, i) {
      if (!f || !isArr(f.steps)) return;
      f.steps.forEach(function (sid) {
        if (!edgeIds[sid]) warn('flow-unknown-edge', 'flow "' + (f.id || '#' + i) + '" references missing edge "' + sid + '"');
      });
      // continuity: a story whose chain breaks at SOME step is probably a typo;
      // a flow where NO consecutive steps touch is a deliberate set — left alone
      var ends = f.steps.map(function (sid) { return edgeEnds[sid]; });
      var links = 0, breaks = [];
      for (var si = 0; si + 1 < ends.length; si++) {
        if (!ends[si] || !ends[si + 1]) continue;
        var touch = [ends[si].from, ends[si].to].indexOf(ends[si + 1].from) >= 0 ||
          [ends[si].from, ends[si].to].indexOf(ends[si + 1].to) >= 0;
        if (touch) links++;
        else breaks.push(si);
      }
      if (links && breaks.length) {
        breaks.forEach(function (bi) {
          warn('flow-discontinuous', 'flow "' + (f.id || '#' + i) + '": step ' + (bi + 1) +
            ' ("' + f.steps[bi] + '") does not connect to step ' + (bi + 2) + ' ("' + f.steps[bi + 1] + '")');
        });
      }
    });

    // membership suspicion: an ungrouped node whose flow enters from and
    // returns to the same group almost certainly forgot its `children` entry
    function topOf(id) {
      var cur = id, guard = 0;
      while (parentOf[cur] !== undefined && guard++ <= ids.length) cur = parentOf[cur];
      return cur === id ? null : cur;
    }
    var flowIn = {}, flowOut = {};
    Object.keys(edgeEnds).forEach(function (eid) {
      var e = edgeEnds[eid];
      function tally(src, dst) {
        if (realNodes[dst] && parentOf[dst] === undefined && topOf(src)) (flowIn[dst] = flowIn[dst] || {})[topOf(src)] = true;
        if (realNodes[src] && parentOf[src] === undefined && topOf(dst)) (flowOut[src] = flowOut[src] || {})[topOf(dst)] = true;
      }
      tally(e.from, e.to);
      if (e.both) tally(e.to, e.from);
    });
    Object.keys(flowIn).forEach(function (nid) {
      if (!flowOut[nid]) return;
      var gs = Object.keys(flowIn[nid]).filter(function (g) { return flowOut[nid][g]; });
      if (gs.length) {
        warn('maybe-member', 'node "' + nid + '" sits outside group "' + gs[0] +
          '" but its flow enters from and returns to it — missing from "children"?');
      }
    });

    // flow graph for assertion rules: every non-isolation edge carries flow;
    // `both` flows both ways; ids are matched exactly (a group id is a vertex)
    var adj = {};
    Object.keys(edgeEnds).forEach(function (eid) {
      var e = edgeEnds[eid];
      if (e.kind === 'isolation') return;
      (adj[e.from] = adj[e.from] || []).push(e.to);
      if (e.both) (adj[e.to] = adj[e.to] || []).push(e.from);
    });
    function reaches(src, dst, skip) {
      if (src === skip) return false;
      var seen2 = {}, stack = [src];
      seen2[src] = true;
      while (stack.length) {
        var cur = stack.pop();
        if (cur === dst) return true;
        (adj[cur] || []).forEach(function (nx) {
          if (nx === skip || seen2[nx]) return;
          seen2[nx] = true;
          stack.push(nx);
        });
      }
      return false;
    }
    function edgeMatches(e, from, to, alsoReverse) {
      return (e.from === from && e.to === to) ||
        ((alsoReverse || e.both) && e.from === to && e.to === from);
    }

    (isArr(spec.assertions) ? spec.assertions : []).forEach(function (a, i) {
      if (!a || typeof a !== 'object' || !isStr(a.text) || !a.text) {
        warn('invalid-assertion', 'assertion #' + i + ' needs a non-empty "text"');
        return;
      }
      var aname = 'assertion "' + (a.id || '#' + i) + '"';
      (isArr(a.refs) ? a.refs : []).forEach(function (r) {
        if (!seen[r] && !edgeIds[r]) warn('assertion-unknown-ref', aname + ' references missing id "' + r + '"');
      });
      if (a.rule === undefined) return;
      var r = a.rule;
      if (!r || typeof r !== 'object' || isArr(r) || RULE_KINDS.indexOf(r.kind) < 0) {
        warn('unknown-rule', aname + ': rule kind must be one of ' + RULE_KINDS.join(', '));
        return;
      }
      var need = r.kind === 'only-via' ? ['from', 'to', 'via'] : ['from', 'to'];
      var bad = need.filter(function (k) { return !isStr(r[k]) || !seen[r[k]]; });
      if (bad.length) {
        warn('assertion-unknown-ref', aname + ': rule references missing id' +
          (bad.length > 1 ? 's' : '') + ' ' + bad.map(function (k) { return '"' + String(r[k]) + '" (' + k + ')'; }).join(', '));
        return;
      }
      if (r.kind === 'forbid-edge') {
        var hit = Object.keys(edgeEnds).filter(function (eid) {
          return edgeEnds[eid].kind !== 'isolation' && edgeMatches(edgeEnds[eid], r.from, r.to, !!r.both);
        });
        if (hit.length) err('assertion-violated', aname + ': forbid-edge — edge "' + hit[0] + '" connects "' + r.from + '" and "' + r.to + '"');
      } else if (r.kind === 'forbid-path') {
        if (reaches(r.from, r.to)) err('assertion-violated', aname + ': forbid-path — a flow path exists from "' + r.from + '" to "' + r.to + '"');
        else if (r.both && reaches(r.to, r.from)) err('assertion-violated', aname + ': forbid-path — a flow path exists from "' + r.to + '" back to "' + r.from + '"');
      } else if (r.kind === 'only-via') {
        if (reaches(r.from, r.to, r.via)) err('assertion-violated', aname + ': only-via — a path from "' + r.from + '" to "' + r.to + '" avoids "' + r.via + '"');
      } else if (r.kind === 'require-edge') {
        var ok = Object.keys(edgeEnds).some(function (eid) {
          return edgeMatches(edgeEnds[eid], r.from, r.to, false) &&
            (r.edgeKind === undefined || edgeEnds[eid].kind === r.edgeKind);
        });
        if (!ok) err('assertion-violated', aname + ': require-edge — no ' + (r.edgeKind ? r.edgeKind + ' ' : '') + 'edge from "' + r.from + '" to "' + r.to + '"');
      }
    });

    return { errors: errors, warnings: warnings };
  }

  /* ================================================================
   * §4 Text measurement — heuristic in Node, canvas in the browser
   * ============================================================== */

  var FONT = {
    title: { size: 12.5, weight: 700, lh: 16 },
    sub: { size: 10.5, weight: 400, lh: 14 },
    zone: { size: 10, weight: 700, lh: 14, tracking: 1.6, caps: true },
    edge: { size: 10, weight: 500, lh: 13 },
    badge: { size: 9, weight: 600, lh: 12 },
  };
  var FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, Helvetica, Arial, sans-serif";
  var MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";

  function heuristicMeasure(text, font) {
    var w = 0, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if ('iIljft.,\'`·:;|!()[]{} '.indexOf(ch) >= 0) w += ch === ' ' ? 0.31 : 0.34;
      else if ('mwMW@%'.indexOf(ch) >= 0) w += 0.94;
      else if (ch >= 'A' && ch <= 'Z') w += 0.7;
      else if (ch >= '0' && ch <= '9') w += 0.62;
      else w += 0.56;
    }
    return w * font.size * (font.weight >= 600 ? 1.05 : 1) + ((font.tracking || 0) * Math.max(0, text.length - 1));
  }

  var measureText = heuristicMeasure;
  function installCanvasMeasurer(doc) {
    try {
      var ctx = doc.createElement('canvas').getContext('2d');
      if (!ctx) return;
      measureText = function (text, font) {
        ctx.font = (font.weight || 400) + ' ' + font.size + 'px ' + FAMILY;
        return ctx.measureText(text).width + ((font.tracking || 0) * Math.max(0, text.length - 1));
      };
    } catch (e) { /* keep heuristic */ }
  }

  function wrapText(text, font, maxW) {
    var words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var lines = [], cur = words[0], i, cand;
    for (i = 1; i < words.length; i++) {
      cand = cur + ' ' + words[i];
      if (measureText(cand, font) <= maxW) cur = cand;
      else { lines.push(cur); cur = words[i]; }
    }
    lines.push(cur);
    return lines;
  }

  /* ================================================================
   * §5 Layout — recursive layered auto-layout
   * ============================================================== */

  var L = {
    margin: 10,        // outer canvas margin
    rankGap: 66,       // gap along the flow axis (room for edge labels)
    nodeGap: 20,       // gap across the flow axis
    groupPadX: 18, groupPadBottom: 16,
    groupHeader: 30,   // + 13 if the group has a sub line
    bandGap: 16,
    nodePadX: 13, nodePadY: 10,
    nodeMinW: 96, nodeMaxTextW: 182,
    glyphIndent: 22, badgeH: 17,
  };

  function sizeNode(node) {
    var glyph = KINDS[node.kind].glyph;
    // catalog icons take the glyph's slot (wider); meaning still lives in the kind
    var indent = node.icon && node.icon.length ? node.icon.length * ICON_SLOT + 4 : (glyph ? L.glyphIndent : 0);
    var titleLines = wrapText(node.label, FONT.title, L.nodeMaxTextW - indent);
    if (!titleLines.length) titleLines = [''];
    var subLines = [];
    node.sub.forEach(function (s) { wrapText(s, FONT.sub, L.nodeMaxTextW).forEach(function (l) { subLines.push(l); }); });
    var w = 0;
    titleLines.forEach(function (t) { w = Math.max(w, measureText(t, FONT.title) + indent); });
    subLines.forEach(function (t) { w = Math.max(w, measureText(t, FONT.sub)); });
    var badgesW = 0;
    node.badges.forEach(function (b) { badgesW += measureText(b, FONT.badge) + 12 + 6; });
    w = Math.max(w, badgesW - 6);
    w = Math.max(L.nodeMinW, Math.ceil(w + L.nodePadX * 2));
    var shape = KINDS[node.kind].shape;
    var capExtra = shape === 'cylinder' ? 15 : shape === 'lid' ? 7 : 0;
    var h = L.nodePadY * 2 + capExtra + titleLines.length * FONT.title.lh +
      subLines.length * FONT.sub.lh + (node.badges.length ? L.badgeH + 4 : 0);
    h = Math.ceil(h);
    // pill sides are round — inset the text so it clears the caps
    var insetX = shape === 'pill' ? Math.round(h * 0.3) : 0;
    return {
      w: w + insetX * 2, h: h,
      titleLines: titleLines, subLines: subLines, capExtra: capExtra, insetX: insetX,
      indent: indent,
    };
  }

  // Deterministic layered layout of one container level.
  // units: [{id, w, h, rank(hint), order(hint), band, index}], edges: [{from, to}] (unit ids)
  // channels=false (route:"simple") skips virtual-node corridor reservation —
  // the naive router won't use corridors, so the layout shouldn't pay for them.
  function layoutLevel(units, edges, dir, channels) {
    var byId = {}, i, u;
    for (i = 0; i < units.length; i++) byId[units[i].id] = units[i];
    var flow = units.filter(function (x) { return !x.band; });
    var bands = units.filter(function (x) { return x.band; });

    // main = flow axis (x for "right", y for "down"); cross = the other.
    var mainOf = function (x) { return dir === 'right' ? x.w : x.h; };
    var crossOf = function (x) { return dir === 'right' ? x.h : x.w; };
    function median(vals) {
      vals.sort(function (p, q) { return p - q; });
      var n2 = vals.length;
      return n2 % 2 ? vals[(n2 - 1) / 2] : (vals[n2 / 2 - 1] + vals[n2 / 2]) / 2;
    }

    // --- back-edge detection (DFS in input order) ---
    var out = {};
    flow.forEach(function (x) { out[x.id] = []; });
    edges.forEach(function (e) {
      if (byId[e.from] && byId[e.to] && !byId[e.from].band && !byId[e.to].band && e.from !== e.to) out[e.from].push(e.to);
    });
    var color = {}, back = {};
    function dfs(idn) {
      color[idn] = 1;
      out[idn].forEach(function (v) {
        if (color[v] === 1) back[idn + '->' + v] = true;
        else if (!color[v]) dfs(v);
      });
      color[idn] = 2;
    }
    flow.forEach(function (x) { if (!color[x.id]) dfs(x.id); });

    // --- longest-path ranks, explicit pins win ---
    var rank = {};
    flow.forEach(function (x) { rank[x.id] = x.rank !== null ? x.rank : 0; });
    var changed = true, pass = 0;
    while (changed && pass <= flow.length + 1) {
      changed = false;
      pass++;
      edges.forEach(function (e) {
        var a = e.from, b = e.to;
        if (!byId[a] || !byId[b] || byId[a].band || byId[b].band || a === b) return;
        if (back[a + '->' + b]) { var t = a; a = b; b = t; }
        if (byId[b].rank !== null) return;
        if (rank[b] < rank[a] + 1) { rank[b] = rank[a] + 1; changed = true; }
      });
    }
    // tighten (GKNV tight ranking, approximated): longest-path leaves slack
    // sources at rank 0 even when their only edge points deep into the flow —
    // pull every unpinned unit up to (nearest out-neighbor − 1); its own
    // in-edges stay satisfied because they held before the pull. Cascades
    // until stable, so upstream chains follow.
    var tChanged = true, tPass = 0;
    while (tChanged && tPass++ <= flow.length + 1) {
      tChanged = false;
      flow.forEach(function (x) {
        if (x.rank !== null || x.band) return;
        var hiT = Infinity;
        edges.forEach(function (e) {
          var a = e.from, b = e.to;
          if (!byId[a] || !byId[b] || byId[a].band || byId[b].band || a === b) return;
          if (back[a + '->' + b]) { var t2 = a; a = b; b = t2; }
          if (a === x.id) hiT = Math.min(hiT, rank[b] - 1);
        });
        if (hiT !== Infinity && hiT > rank[x.id]) {
          rank[x.id] = hiT;
          tChanged = true;
        }
      });
    }
    var minRank = 0;
    flow.forEach(function (x) { minRank = Math.min(minRank, rank[x.id]); });
    flow.forEach(function (x) { rank[x.id] -= minRank; });
    var maxRank = 0;
    flow.forEach(function (x) { maxRank = Math.max(maxRank, rank[x.id]); });

    // --- Sugiyama virtual nodes (GKNV): an edge spanning >1 rank gets an
    // invisible 8px waypoint at every intermediate rank. Waypoints join the
    // ordering + alignment passes, so long edges get a RESERVED corridor and
    // real nodes move aside instead of being lanced or detoured around. ---
    var segments = [];
    var viaOf = {}; // edge id -> [virtual ids]
    edges.forEach(function (e, ei) {
      if (!byId[e.from] || !byId[e.to] || byId[e.from].band || byId[e.to].band || e.from === e.to) {
        return;
      }
      var r1 = rank[e.from], r2 = rank[e.to];
      if (channels === false || Math.abs(r2 - r1) <= 1) { segments.push(e); return; }
      var stepDir = r2 > r1 ? 1 : -1;
      var chain = [], prev = e.from;
      for (var rr = r1 + stepDir; rr !== r2; rr += stepDir) {
        var vid = '~v' + ei + '-' + rr;
        var vu = { id: vid, w: 16, h: 16, rank: rr, order: null, band: false, index: 100000 + ei * 100 + Math.abs(rr), virtual: true };
        byId[vid] = vu;
        flow.push(vu);
        rank[vid] = rr;
        chain.push(vid);
      }
      chain.concat([e.to]).forEach(function (nid) {
        var seg = { from: prev, to: nid };
        if (prev === e.from) seg.fromPort = e.fromPort;
        if (nid === e.to) seg.toPort = e.toPort;
        segments.push(seg);
        prev = nid;
      });
      if (e.id !== undefined) viaOf[e.id] = chain;
    });

    // --- ordering within ranks (barycenter sweeps, hints win) ---
    var ranks = [];
    for (i = 0; i <= maxRank; i++) ranks.push([]);
    flow.forEach(function (x) { ranks[rank[x.id]].push(x); });
    ranks.forEach(function (list) {
      list.sort(function (a, b) {
        var ka = a.order !== null ? a.order : a.index, kb = b.order !== null ? b.order : b.index;
        return ka - kb || a.index - b.index;
      });
    });
    var pos = {};
    function reindex() { ranks.forEach(function (list) { list.forEach(function (x, k) { pos[x.id] = k; }); }); }
    reindex();
    // Neighbor entries carry ELK-style "ports": `at` = attachment offset on the
    // neighbor (an edge into a condensed group aims at the real child's latitude
    // inside it, known because inner levels are laid out bottom-up first), `my` =
    // attachment offset on this unit. null = attach at center.
    var nbrIn = {}, nbrOut = {};
    flow.forEach(function (x) { nbrIn[x.id] = []; nbrOut[x.id] = []; });
    segments.forEach(function (e) {
      if (!byId[e.from] || !byId[e.to] || e.from === e.to) return;
      nbrOut[e.from].push({ id: e.to, at: e.toPort != null ? e.toPort : null, my: e.fromPort != null ? e.fromPort : null });
      nbrIn[e.to].push({ id: e.from, at: e.fromPort != null ? e.fromPort : null, my: e.toPort != null ? e.toPort : null });
    });
    // ordering key nudge: attaching near a big unit's top sorts before attaching
    // near its bottom, so two channels into one group don't cross each other
    function posKey(en) {
      var nudge = en.at != null && crossOf(byId[en.id]) > 0 ? (en.at / crossOf(byId[en.id]) - 0.5) * 0.9 : 0;
      return pos[en.id] + nudge;
    }
    // reading-direction tie-break: when medians are equal, terminal units take
    // the side that matches reading order — sources enter from the near side,
    // sinks exit toward the far side — and the through-spine keeps the lane.
    // Fires only on exact ties, so crossing minimization always wins.
    function roleBias(x) {
      var outs = nbrOut[x.id].length, ins = nbrIn[x.id].length;
      if (!outs && ins) return 1;
      if (outs && !ins) return -1;
      return 0;
    }
    function sweep(fromPrev) {
      ranks.forEach(function (list) {
        var keyed = list.map(function (x, k) {
          var nb = fromPrev ? nbrIn[x.id] : nbrOut[x.id];
          var vals = nb.filter(function (en) { return pos[en.id] !== undefined; }).map(posKey);
          var med = vals.length ? median(vals) : k;
          return { x: x, key: x.order !== null ? x.order : med };
        });
        keyed.sort(function (a, b) {
          return a.key - b.key || roleBias(a.x) - roleBias(b.x) || a.x.index - b.x.index;
        });
        list.length = 0;
        keyed.forEach(function (kv) { list.push(kv.x); });
      });
      reindex();
    }
    // GKNV ordering: median sweeps + transpose, judged by the true crossing
    // count, keeping the best order seen (barycenter alone misses cases like
    // sink-only nodes vs long-edge channels).
    function crossingsOf() {
      var total = 0, byRank = {};
      segments.forEach(function (s) {
        var ru = rank[s.from], rv = rank[s.to];
        if (ru === undefined || rv === undefined || Math.abs(ru - rv) !== 1) return;
        var r0 = Math.min(ru, rv);
        var pu = ru < rv ? pos[s.from] : pos[s.to];
        var pv = ru < rv ? pos[s.to] : pos[s.from];
        (byRank[r0] = byRank[r0] || []).push([pu, pv]);
      });
      Object.keys(byRank).forEach(function (k) {
        var list = byRank[k];
        for (var i2 = 0; i2 < list.length; i2++) {
          for (var j2 = i2 + 1; j2 < list.length; j2++) {
            if ((list[i2][0] - list[j2][0]) * (list[i2][1] - list[j2][1]) < 0) total++;
          }
        }
      });
      return total;
    }
    function transpose() {
      var improved = true, guard = 0;
      while (improved && guard++ < 8) {
        improved = false;
        ranks.forEach(function (list) {
          for (var k2 = 0; k2 + 1 < list.length; k2++) {
            var a = list[k2], b2 = list[k2 + 1];
            if (a.order !== null && b2.order !== null) continue; // hints are law
            var before = crossingsOf();
            list[k2] = b2;
            list[k2 + 1] = a;
            reindex();
            if (crossingsOf() < before) improved = true;
            else {
              list[k2] = a;
              list[k2 + 1] = b2;
              reindex();
            }
          }
        });
      }
    }
    var bestOrder = null, bestC = Infinity;
    for (i = 0; i < 6; i++) {
      sweep(i % 2 === 0);
      transpose();
      var cNow = crossingsOf();
      if (cNow < bestC) {
        bestC = cNow;
        bestOrder = ranks.map(function (list) { return list.slice(); });
      }
      if (cNow === 0) break;
    }
    if (bestOrder) {
      ranks.forEach(function (list, r2) {
        list.length = 0;
        bestOrder[r2].forEach(function (x) { list.push(x); });
      });
      reindex();
    }

    // --- coordinates ---
    // GKNV §5 (edge labels as virtual nodes), simplified: an adjacent-rank
    // edge label rides mid-gap, so each gap widens to fit its widest label
    // pill (+6 each side) with clearance the label scan's +2 inflation passes.
    // Cross-boundary edges (ports) are exempt — their labels slide along a
    // long traversal instead of riding the gap.
    var gapExtra = [];
    edges.forEach(function (e) {
      if (!e.labelW || e.fromPort !== null || e.toPort !== null || !byId[e.from] || !byId[e.to]) return;
      var rf = rank[e.from], rt = rank[e.to];
      if (rf === undefined || rt === undefined || Math.abs(rf - rt) !== 1) return;
      var lo = Math.min(rf, rt);
      // the gap must fit the label's extent ALONG the flow axis: its width on
      // horizontal flows, just the pill height beside a vertical line
      var extent = dir === 'right' ? e.labelW : 17;
      var need = extent + 12 + 16 - L.rankGap;
      if (need > (gapExtra[lo] || 0)) gapExtra[lo] = need;
    });
    var rankMain = [], mainStart = [], m = 0;
    ranks.forEach(function (list, r) {
      var mx = 0;
      list.forEach(function (x) { mx = Math.max(mx, mainOf(x)); });
      rankMain[r] = mx;
      mainStart[r] = m;
      m += mx + L.rankGap + (gapExtra[r] || 0);
    });
    var totalMain = Math.max(0, m - L.rankGap);

    var cross = {};
    ranks.forEach(function (list) {
      var c = 0;
      list.forEach(function (x) { cross[x.id] = c; c += crossOf(x) + L.nodeGap; });
    });
    // GKNV priority method (the dot paper's x-coordinate heuristic), port-aware.
    // Each unit's desired position is the MEDIAN of candidate positions that
    // would line its own attachment point up with each neighbor's attachment
    // point. Units move in priority order — virtual nodes are (near-)immovable
    // so multi-rank chains straighten and real nodes yield; real nodes rank by
    // degree. Movement is clamped so rank order and separation always hold:
    // already-placed and higher-priority units are walls, and space is reserved
    // for not-yet-placed units in between.
    function attachCands(x, mode) {
      var src = mode === 'in' ? nbrIn[x.id] : mode === 'out' ? nbrOut[x.id] : nbrIn[x.id].concat(nbrOut[x.id]);
      return src.filter(function (en) { return cross[en.id] !== undefined && rank[en.id] !== rank[x.id]; })
        .map(function (en) {
          var atNb = cross[en.id] + (en.at != null ? en.at : crossOf(byId[en.id]) / 2);
          return atNb - (en.my != null ? en.my : crossOf(x) / 2);
        });
    }
    function prio(x) { return x.virtual ? 1e9 : nbrIn[x.id].length + nbrOut[x.id].length; }
    function clampRank(list) {
      var k, prevEnd = -Infinity;
      for (k = 0; k < list.length; k++) {
        if (cross[list[k].id] < prevEnd) cross[list[k].id] = prevEnd;
        prevEnd = cross[list[k].id] + crossOf(list[k]) + L.nodeGap;
      }
    }
    function passRank(list, mode) {
      var byPrio = list.map(function (x, k) { return { x: x, k: k }; });
      byPrio.sort(function (a, b) { return prio(b.x) - prio(a.x) || a.x.index - b.x.index; });
      var placed = {};
      byPrio.forEach(function (it2) {
        var x = it2.x, k = it2.k, j, w2, need;
        var cands = attachCands(x, mode);
        var desired = cands.length ? median(cands) : cross[x.id];
        var lo = -Infinity;
        need = 0;
        for (j = k - 1; j >= 0; j--) {
          w2 = list[j];
          if (placed[w2.id] || prio(w2) >= prio(x)) { lo = cross[w2.id] + crossOf(w2) + L.nodeGap + need; break; }
          need += crossOf(w2) + L.nodeGap;
        }
        var hi = Infinity;
        need = 0;
        for (j = k + 1; j < list.length; j++) {
          w2 = list[j];
          if (placed[w2.id] || prio(w2) >= prio(x)) { hi = cross[w2.id] - L.nodeGap - need - crossOf(x); break; }
          need += crossOf(w2) + L.nodeGap;
        }
        if (lo <= hi) cross[x.id] = Math.max(lo, Math.min(hi, desired));
        placed[x.id] = true;
      });
      clampRank(list); // safety net — placements above already reserve the space
    }
    // Alternating sweeps: 'in' aligns each rank under its sources (flow order),
    // 'out' pulls ranks toward their targets (reverse order). Like GKNV's
    // xcoord, keep the assignment with the lowest total WEIGHTED edge length
    // (Ω = 8 virtual–virtual, 2 mixed, 1 real–real, on port-adjusted
    // attachment deltas) — sweeps oscillate and can even translate a whole
    // component per cycle; the snapshot converts that into monotone progress.
    function xlength() {
      var t = 0;
      segments.forEach(function (e) {
        if (rank[e.from] === rank[e.to]) return;
        var aF = cross[e.from] + (e.fromPort != null ? e.fromPort : crossOf(byId[e.from]) / 2);
        var aT = cross[e.to] + (e.toPort != null ? e.toPort : crossOf(byId[e.to]) / 2);
        var W = byId[e.from].virtual && byId[e.to].virtual ? 8 :
          (byId[e.from].virtual || byId[e.to].virtual) ? 2 : 1;
        t += W * Math.abs(aF - aT);
      });
      return t;
    }
    var itP, bestX = null, bestLen = Infinity;
    for (itP = 0; itP < 9; itP++) {
      if (itP % 2 === 0) {
        for (i = 1; i < ranks.length; i++) passRank(ranks[i], 'in');
      } else {
        for (i = ranks.length - 2; i >= 0; i--) passRank(ranks[i], 'out');
      }
      var xlen = xlength();
      if (xlen < bestLen - 1e-9) {
        bestLen = xlen;
        bestX = {};
        flow.forEach(function (x) { bestX[x.id] = cross[x.id]; });
      }
    }
    if (bestX) flow.forEach(function (x) { cross[x.id] = bestX[x.id]; });

    // Disconnected components never pull on each other, so pack them along the
    // cross axis (nothing else bounds their gap). Only pull closer — never
    // spread tucked-in components — and only when every rank lists components
    // in an order consistent with their extents, so rank order survives.
    var comp = {}, compN = 0;
    flow.forEach(function (x) { comp[x.id] = -1; });
    flow.forEach(function (x) {
      if (comp[x.id] >= 0) return;
      var stack = [x.id];
      comp[x.id] = compN;
      while (stack.length) {
        var cur = stack.pop();
        nbrIn[cur].concat(nbrOut[cur]).forEach(function (en) {
          if (comp[en.id] === -1) { comp[en.id] = compN; stack.push(en.id); }
        });
      }
      compN++;
    });
    if (compN > 1) {
      var ext = [];
      for (i = 0; i < compN; i++) ext.push({ min: Infinity, max: -Infinity });
      flow.forEach(function (x) {
        var c2 = comp[x.id];
        ext[c2].min = Math.min(ext[c2].min, cross[x.id]);
        ext[c2].max = Math.max(ext[c2].max, cross[x.id] + crossOf(x));
      });
      var byMin = [];
      for (i = 0; i < compN; i++) byMin.push(i);
      byMin.sort(function (a, b) { return ext[a].min - ext[b].min || a - b; });
      var rankOf = {};
      byMin.forEach(function (c2, k) { rankOf[c2] = k; });
      var consistent = ranks.every(function (list) {
        var last = -1;
        return list.every(function (x) {
          var r2 = rankOf[comp[x.id]];
          if (r2 < last) return false;
          last = r2;
          return true;
        });
      });
      if (consistent) {
        var packedMax = -Infinity;
        byMin.forEach(function (c2) {
          var delta = packedMax === -Infinity ? 0 : packedMax + L.nodeGap * 2 - ext[c2].min;
          if (delta < 0) {
            flow.forEach(function (x) { if (comp[x.id] === c2) cross[x.id] += delta; });
            ext[c2].min += delta;
            ext[c2].max += delta;
          }
          packedMax = Math.max(packedMax, ext[c2].max);
        });
      }
    }
    // shift so the min cross is 0
    var minCross = Infinity;
    flow.forEach(function (x) { minCross = Math.min(minCross, cross[x.id]); });
    if (!isFinite(minCross)) minCross = 0;
    var totalCross = 0;
    flow.forEach(function (x) {
      cross[x.id] -= minCross;
      totalCross = Math.max(totalCross, cross[x.id] + crossOf(x));
    });

    var placements = {};
    flow.forEach(function (x) {
      if (x.virtual) return;
      var main = mainStart[rank[x.id]] + (rankMain[rank[x.id]] - mainOf(x)) / 2;
      placements[x.id] = {
        x: dir === 'right' ? main : cross[x.id],
        y: dir === 'right' ? cross[x.id] : main,
        w: x.w, h: x.h, rank: rank[x.id],
      };
    });
    // waypoint centers for multi-rank edges (level-relative coordinates),
    // plus the guaranteed node-free gutter positions between ranks
    var gutters = [];
    for (i = 0; i < ranks.length - 1; i++) gutters.push((mainStart[i] + rankMain[i] + mainStart[i + 1]) / 2);
    var waypoints = {};
    Object.keys(viaOf).forEach(function (eid) {
      waypoints[eid] = {
        pts: viaOf[eid].map(function (vid) {
          var main = mainStart[rank[vid]] + rankMain[rank[vid]] / 2;
          var c = cross[vid] + 8;
          return dir === 'right' ? { x: main, y: c } : { x: c, y: main };
        }),
        ptRanks: viaOf[eid].map(function (vid) { return rank[vid]; }),
      };
    });
    // ranks of the real endpoints, for gutter lookup at the edge's ends
    var unitRanks = {};
    flow.forEach(function (x) { if (!x.virtual) unitRanks[x.id] = rank[x.id]; });

    // content box of the flow part (in x/y space)
    var w = dir === 'right' ? totalMain : totalCross;
    var h = dir === 'right' ? totalCross : totalMain;
    if (!flow.length) { w = 0; h = 0; }

    // --- bands: full-width strips below the flow ---
    var by = h;
    bands.forEach(function (x) {
      by += (by > 0 ? L.bandGap : 0);
      var bw = Math.max(w, x.w);
      placements[x.id] = { x: 0, y: by, w: bw, h: x.h, rank: -1, band: true };
      w = Math.max(w, bw);
      by += x.h;
    });
    h = by;

    return { placements: placements, w: w, h: h, waypoints: waypoints, gutters: gutters, unitRanks: unitRanks };
  }

  // layout: "sequence" — participants as lifeline columns (declaration order,
  // `order` hints win), one horizontal row per message ordered by `step` then
  // declaration. Time flows down, so the step order IS the vertical axis and
  // message labels can never collide. Adjacent-pair gaps widen to fit their
  // widest label; edge kinds keep the normal dash/head/tone grammar.
  function layoutSequence(model, sized) {
    var GAP = 56, ROW = 34;
    var cols = model.nodes.slice().sort(function (a, b) {
      var ao = a.order !== null ? a.order : a.index;
      var bo = b.order !== null ? b.order : b.index;
      return ao - bo || a.index - b.index;
    });
    var col = {};
    cols.forEach(function (n, i) { col[n.id] = i; });
    var msgs = model.edges
      .filter(function (e) { return col[e.from] !== undefined && col[e.to] !== undefined; })
      .slice().sort(function (a, b) {
        var as = a.step !== null ? a.step : Infinity;
        var bs = b.step !== null ? b.step : Infinity;
        return as - bs || a.index - b.index;
      });
    // gap between adjacent columns must fit the widest label that rides it
    var gapNeed = [];
    msgs.forEach(function (e) {
      if (!e.label || Math.abs(col[e.from] - col[e.to]) !== 1) return;
      var lo = Math.min(col[e.from], col[e.to]);
      var span = measureText(e.label, FONT.edge) + 24 -
        (sized[cols[lo].id].w + sized[cols[lo + 1].id].w) / 2;
      if (span > (gapNeed[lo] || 0)) gapNeed[lo] = span;
    });
    var placements = {}, centers = {}, x = 0, headerH = 0;
    cols.forEach(function (n, i) {
      placements[n.id] = { x: x, y: 0, rank: i };
      centers[n.id] = x + sized[n.id].w / 2;
      headerH = Math.max(headerH, sized[n.id].h);
      x += sized[n.id].w + Math.max(GAP, gapNeed[i] || 0);
    });
    var totalW = x - Math.max(GAP, gapNeed[cols.length - 1] || 0);
    var rows = {}, y = headerH + Math.round(ROW * 0.9);
    msgs.forEach(function (e) {
      var sx = centers[e.from], tx = centers[e.to];
      if (e.from === e.to) {
        rows[e.id] = { kind: 'ortho', pts: [
          { x: sx, y: y }, { x: sx + 34, y: y }, { x: sx + 34, y: y + 14 }, { x: sx, y: y + 14 },
        ] };
      } else {
        rows[e.id] = { kind: 'straight', pts: [{ x: sx, y: y }, { x: tx, y: y }] };
      }
      y += ROW;
    });
    var bottom = y - ROW + 18;
    var lifelines = cols.map(function (n) {
      return { x: centers[n.id], y1: sized[n.id].h, y2: bottom };
    });
    return { placements: placements, rows: rows, lifelines: lifelines, w: totalW, h: bottom };
  }

  // layout: "tree" — tidy forest (Reingold–Tilford family, simplified to
  // subtree-extent packing with parents centered over their children).
  // Structure: a node's parent is the source of its first in-edge that doesn't
  // close a cycle; every other edge renders as a plain cross-link.
  function layoutTree(model, sized, dir) {
    var mainOf = function (id) { return dir === 'right' ? sized[id].w : sized[id].h; };
    var crossOf = function (id) { return dir === 'right' ? sized[id].h : sized[id].w; };
    var parent = {}, children = {};
    model.nodes.forEach(function (n) { children[n.id] = []; });
    function isAncestor(a, b) {
      var cur = b, guard = 0;
      while (cur !== undefined && guard++ < 1000) {
        if (cur === a) return true;
        cur = parent[cur];
      }
      return false;
    }
    model.edges.forEach(function (e) {
      if (!children[e.from] || !children[e.to] || e.from === e.to) return;
      if (parent[e.to] !== undefined || isAncestor(e.to, e.from)) return; // cross-link
      parent[e.to] = e.from;
      children[e.from].push(e.to);
    });
    var roots = model.nodes.map(function (n) { return n.id; })
      .filter(function (id) { return parent[id] === undefined; });
    var depth = {}, maxD = 0;
    function setDepth(id, d) {
      depth[id] = d;
      maxD = Math.max(maxD, d);
      children[id].forEach(function (c) { setDepth(c, d + 1); });
    }
    roots.forEach(function (id) { setDepth(id, 0); });
    var rankMain = [], mainStart = [], m = 0, d;
    for (d = 0; d <= maxD; d++) {
      var mx = 0;
      model.nodes.forEach(function (n) { if (depth[n.id] === d) mx = Math.max(mx, mainOf(n.id)); });
      rankMain[d] = mx;
      mainStart[d] = m;
      m += mx + L.rankGap;
    }
    var extent = {}, cross = {};
    function measure(id) {
      var sum = 0;
      children[id].forEach(function (c) { sum += measure(c); });
      sum += Math.max(0, children[id].length - 1) * L.nodeGap;
      extent[id] = Math.max(crossOf(id), sum);
      return extent[id];
    }
    function placeSub(id, lo) {
      var kids = children[id], kidSum = 0;
      kids.forEach(function (c) { kidSum += extent[c]; });
      kidSum += Math.max(0, kids.length - 1) * L.nodeGap;
      var cur = lo + (extent[id] - kidSum) / 2;
      kids.forEach(function (c) {
        placeSub(c, cur);
        cur += extent[c] + L.nodeGap;
      });
      if (kids.length) {
        var first = cross[kids[0]] + crossOf(kids[0]) / 2;
        var last = cross[kids[kids.length - 1]] + crossOf(kids[kids.length - 1]) / 2;
        var mid = (first + last) / 2 - crossOf(id) / 2;
        cross[id] = Math.max(lo, Math.min(lo + extent[id] - crossOf(id), mid));
      } else {
        cross[id] = lo + (extent[id] - crossOf(id)) / 2;
      }
    }
    var forestCur = 0;
    roots.forEach(function (id) {
      measure(id);
      placeSub(id, forestCur);
      forestCur += extent[id] + L.nodeGap * 2;
    });
    var placements = {};
    model.nodes.forEach(function (n) {
      var main = mainStart[depth[n.id]] + (rankMain[depth[n.id]] - mainOf(n.id)) / 2;
      placements[n.id] = {
        x: dir === 'right' ? main : cross[n.id],
        y: dir === 'right' ? cross[n.id] : main,
        rank: depth[n.id],
      };
    });
    return placements;
  }

  // layout: "radial" — concentric BFS rings around each component's
  // highest-degree hub (Eades-style radial tree). Ring radius grows to fit the
  // ring's circumference; angles spread evenly in deterministic order.
  // `direction` does not apply.
  function layoutRadial(model, sized) {
    var ids = model.nodes.map(function (n) { return n.id; });
    var adj = {}, deg = {}, orderIx = {};
    ids.forEach(function (id, i) { adj[id] = []; deg[id] = 0; orderIx[id] = i; });
    model.edges.forEach(function (e) {
      if (!adj[e.from] || !adj[e.to] || e.from === e.to) return;
      adj[e.from].push(e.to);
      adj[e.to].push(e.from);
      deg[e.from]++;
      deg[e.to]++;
    });
    var diag = function (id) { return Math.hypot(sized[id].w, sized[id].h); };
    var placements = {}, seen = {}, compX = 0;
    ids.forEach(function (start) {
      if (seen[start]) return;
      var comp = [], stack = [start];
      seen[start] = true;
      while (stack.length) {
        var cur = stack.pop();
        comp.push(cur);
        adj[cur].forEach(function (v) { if (!seen[v]) { seen[v] = true; stack.push(v); } });
      }
      comp.sort(function (a, b) { return deg[b] - deg[a] || orderIx[a] - orderIx[b]; });
      var hub = comp[0];
      var ring = {}, rings = [[hub]], q = [hub];
      ring[hub] = 0;
      while (q.length) {
        var u = q.shift();
        adj[u].slice().sort(function (a, b) { return orderIx[a] - orderIx[b]; }).forEach(function (v) {
          if (ring[v] !== undefined) return;
          ring[v] = ring[u] + 1;
          (rings[ring[v]] = rings[ring[v]] || []).push(v);
          q.push(v);
        });
      }
      var radius = [0], maxDiag = diag(hub), r;
      comp.forEach(function (id) { maxDiag = Math.max(maxDiag, diag(id)); });
      for (r = 1; r < rings.length; r++) {
        var need = 0, prevMax = 0, curMax = 0;
        rings[r].forEach(function (id) { need += diag(id) + L.nodeGap; });
        rings[r - 1].forEach(function (id) { prevMax = Math.max(prevMax, diag(id)); });
        rings[r].forEach(function (id) { curMax = Math.max(curMax, diag(id)); });
        radius[r] = Math.max(radius[r - 1] + prevMax / 2 + curMax / 2 + 46, need / (2 * Math.PI));
      }
      rings.forEach(function (list, ri) {
        list.forEach(function (id, k) {
          var ang = -Math.PI / 2 + (k + 0.5) * (2 * Math.PI / list.length);
          var cx = ri === 0 ? 0 : Math.cos(ang) * radius[ri];
          var cy = ri === 0 ? 0 : Math.sin(ang) * radius[ri];
          placements[id] = {
            x: compX + cx - sized[id].w / 2,
            y: cy - sized[id].h / 2,
            rank: ri,
          };
        });
      });
      var half = (radius[rings.length - 1] || 0) + maxDiag / 2;
      compX += half * 2 + L.nodeGap * 2;
    });
    return placements;
  }

  // Full layout: sizes bottom-up, positions top-down, edge geometry last.
  function layout(spec, opts) {
    var model = normalize(flattenSequenceContainment(spec));
    var dir = model.direction;
    var all = {};
    model.nodes.forEach(function (n) { all[n.id] = n; });
    model.groups.forEach(function (g) { if (!all[g.id]) all[g.id] = g; });

    var childrenOf = {};
    model.groups.forEach(function (g) { childrenOf[g.id] = g.children.filter(function (c) { return all[c]; }); });
    // A unit's flow position = its earliest-declared member: cycle breaking and
    // ranking follow author order (GKNV's "input order reflects intended
    // flow"), and a group is "declared" where its first child is.
    var flowIndexMemo = {};
    function flowIndexOf(id) {
      if (flowIndexMemo[id] !== undefined) return flowIndexMemo[id];
      var u = all[id], v;
      if (u.type === 'group') {
        v = childrenOf[id].length ? Infinity : u.index + 100000;
        childrenOf[id].forEach(function (cid) { v = Math.min(v, flowIndexOf(cid)); });
      } else {
        v = u.index;
      }
      flowIndexMemo[id] = v;
      return v;
    }
    var roots = [];
    model.nodes.concat(model.groups).forEach(function (u) {
      if (model.parentOf[u.id] === undefined && all[u.id] === u) roots.push(u.id);
    });
    roots.sort(function (a, b) { return flowIndexOf(a) - flowIndexOf(b); });

    function depthOf(id) {
      var d = 0, cur = model.parentOf[id], guard = 0;
      while (cur !== undefined && guard++ < 1000) { d++; cur = model.parentOf[cur]; }
      return d;
    }
    // representative of `id` among the direct children of container `anc` (undefined = root)
    function repIn(id, anc) {
      var cur = id, guard = 0;
      while (model.parentOf[cur] !== anc && guard++ < 1000) {
        cur = model.parentOf[cur];
        if (cur === undefined) return null;
      }
      return cur;
    }
    function containerChain(id) {
      var chain = [], cur = model.parentOf[id], guard = 0;
      while (cur !== undefined && guard++ < 1000) { chain.push(cur); cur = model.parentOf[cur]; }
      chain.push(undefined); // root
      return chain;
    }
    function lca(aId, bId) {
      var ca = containerChain(aId), cb = containerChain(bId);
      for (var i = 0; i < ca.length; i++) if (cb.indexOf(ca[i]) >= 0) return ca[i];
      return undefined;
    }

    // group edges by owning container
    var edgesAt = {}; // key: container id or '' for root
    model.edges.forEach(function (e) {
      if (!all[e.from] || !all[e.to]) return; // invalid refs — validate() reports them
      var owner = lca(e.from, e.to);
      var key = owner === undefined ? '' : owner;
      (edgesAt[key] = edgesAt[key] || []).push(e);
    });

    var units = {}; // id -> {x,y,w,h,rank,type,parent}
    var seqRows = null, seqLifelines = null; // layout:"sequence" fixed geometry
    var size;
    var sized = {}; // id -> {w,h, node meta / group internals}
    var absVia = {}; // edge id -> absolute waypoint centers (virtual-node channels)

    if (model.arrange === 'manual') {
      // ---- manual arrangement: authored coordinates, groups fit their children ----
      var raw = {};
      var pb = null; // bounds of authored content
      model.nodes.forEach(function (n) {
        sized[n.id] = sizeNode(n);
        if (n.at) {
          raw[n.id] = { x: n.at[0], y: n.at[1], w: sized[n.id].w, h: sized[n.id].h };
          pb = pb || { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
          pb.x1 = Math.min(pb.x1, n.at[0]);
          pb.y1 = Math.min(pb.y1, n.at[1]);
          pb.x2 = Math.max(pb.x2, n.at[0] + sized[n.id].w);
          pb.y2 = Math.max(pb.y2, n.at[1] + sized[n.id].h);
        }
      });
      // nodes without `at` stack below the placed content (validation warns)
      var fx = pb ? pb.x1 : 0;
      var fy = pb ? pb.y2 + L.nodeGap * 2 : 0;
      model.nodes.forEach(function (n) {
        if (raw[n.id]) return;
        raw[n.id] = { x: fx, y: fy, w: sized[n.id].w, h: sized[n.id].h };
        fy += sized[n.id].h + L.nodeGap;
      });
      // groups fit around their members, deepest first
      model.groups.slice().sort(function (a, b) { return depthOf(b.id) - depthOf(a.id) || a.index - b.index; })
        .forEach(function (g) {
          var bb = null;
          childrenOf[g.id].forEach(function (cid) {
            var r = raw[cid];
            if (!r) return;
            bb = bb || { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
            bb.x1 = Math.min(bb.x1, r.x);
            bb.y1 = Math.min(bb.y1, r.y);
            bb.x2 = Math.max(bb.x2, r.x + r.w);
            bb.y2 = Math.max(bb.y2, r.y + r.h);
          });
          if (!bb) return;
          var headerH = L.groupHeader + (g.sub ? 13 : 0);
          raw[g.id] = {
            x: bb.x1 - L.groupPadX, y: bb.y1 - headerH,
            w: bb.x2 - bb.x1 + L.groupPadX * 2,
            h: bb.y2 - bb.y1 + headerH + L.groupPadBottom,
          };
        });
      // shift everything so the top-left sits at the margin
      var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
      Object.keys(raw).forEach(function (id) {
        minX = Math.min(minX, raw[id].x);
        minY = Math.min(minY, raw[id].y);
      });
      if (!isFinite(minX)) { minX = 0; minY = 0; }
      model.nodes.concat(model.groups).forEach(function (u) {
        var r = raw[u.id];
        if (!r || all[u.id] !== u) return;
        units[u.id] = {
          x: r.x - minX + L.margin, y: r.y - minY + L.margin, w: r.w, h: r.h,
          rank: 0, type: u.type, parent: model.parentOf[u.id] !== undefined ? model.parentOf[u.id] : null,
        };
        maxX = Math.max(maxX, units[u.id].x + r.w);
        maxY = Math.max(maxY, units[u.id].y + r.h);
      });
      size = { w: maxX + L.margin, h: maxY + L.margin };
    } else if (model.layout !== 'layered' && !model.groups.length &&
      !model.nodes.some(function (n) { return n.band; })) {
      // ---- tree / radial / sequence families: flat placement ----
      // (groups/bands with these layouts are a validation error; if present
      // anyway, the layered branch below handles them defensively)
      model.nodes.forEach(function (n) { sized[n.id] = sizeNode(n); });
      if (model.layout === 'sequence') {
        var seq = layoutSequence(model, sized);
        model.nodes.forEach(function (n) {
          var sp = seq.placements[n.id];
          units[n.id] = {
            x: sp.x + L.margin, y: sp.y + L.margin,
            w: sized[n.id].w, h: sized[n.id].h,
            rank: sp.rank, type: 'node', parent: null,
          };
        });
        seqRows = {};
        Object.keys(seq.rows).forEach(function (eid) {
          seqRows[eid] = {
            kind: seq.rows[eid].kind,
            pts: seq.rows[eid].pts.map(function (p) { return { x: p.x + L.margin, y: p.y + L.margin }; }),
          };
        });
        seqLifelines = seq.lifelines.map(function (l) {
          return { x: l.x + L.margin, y1: l.y1 + L.margin, y2: l.y2 + L.margin };
        });
        size = { w: seq.w + L.margin * 2, h: seq.h + L.margin * 2 };
        // fall through to the shared emission below (rows override routing)
      } else {
      var fam = model.layout === 'tree' ? layoutTree(model, sized, dir) : layoutRadial(model, sized);
      var fMinX = Infinity, fMinY = Infinity, fMaxX = 0, fMaxY = 0;
      model.nodes.forEach(function (n) {
        fMinX = Math.min(fMinX, fam[n.id].x);
        fMinY = Math.min(fMinY, fam[n.id].y);
      });
      if (!isFinite(fMinX)) { fMinX = 0; fMinY = 0; }
      model.nodes.forEach(function (n) {
        var p = fam[n.id];
        units[n.id] = {
          x: p.x - fMinX + L.margin, y: p.y - fMinY + L.margin,
          w: sized[n.id].w, h: sized[n.id].h,
          rank: p.rank, type: 'node', parent: null,
        };
        fMaxX = Math.max(fMaxX, units[n.id].x + sized[n.id].w);
        fMaxY = Math.max(fMaxY, units[n.id].y + sized[n.id].h);
      });
      size = { w: fMaxX + L.margin, h: fMaxY + L.margin };
      }
    } else {

    // ---- auto arrangement: recursive layered layout ----
    // ELK-style hierarchical port: the cross-axis attachment offset of a real
    // endpoint inside its representative unit at a level. Inner levels are
    // sized bottom-up, so the child's latitude is known before the parent level
    // lays out. Mirrors place(): content centered horizontally, below header.
    function portOf(realId, repId, levelDir) {
      if (realId === repId || !sized[repId] || !sized[repId].inner) return null;
      var ox = 0, oy = 0, cur = realId, guard = 0;
      while (cur !== repId && guard++ < 1000) {
        var par = model.parentOf[cur];
        if (par === undefined || !sized[par] || !sized[par].inner) return null;
        var pl = sized[par].inner.placements[cur];
        if (!pl) return null;
        ox += (sized[par].w - sized[par].inner.w) / 2 + pl.x;
        oy += sized[par].headerH + pl.y;
        cur = par;
      }
      var s = sized[realId];
      if (!s) return null;
      return levelDir === 'down' ? ox + s.w / 2 : oy + s.h / 2;
    }
    // bottom-up sizing
    function measureUnit(id) {
      var u = all[id];
      if (u.type === 'node') {
        sized[id] = sizeNode(u);
        return;
      }
      childrenOf[id].forEach(measureUnit);
      var gdir = u.direction || dir;
      var units = childrenOf[id].slice()
        .sort(function (a, b) { return flowIndexOf(a) - flowIndexOf(b); })
        .map(function (cid) {
        var c = all[cid], s = sized[cid];
        return { id: cid, w: s.w, h: s.h, rank: c.rank, order: c.order, band: c.type === 'node' && c.band, index: c.index + (c.type === 'group' ? 100000 : 0) };
      });
      var lvlEdges = (edgesAt[id] || []).map(function (e) {
        var f = repIn(e.from, id), t = repIn(e.to, id);
        return {
          id: e.id, from: f, to: t,
          labelW: e.label ? measureText(e.label, FONT.edge) : 0,
          fromPort: f ? portOf(e.from, f, gdir) : null,
          toPort: t ? portOf(e.to, t, gdir) : null,
        };
      }).filter(function (e) { return e.from && e.to; });
      var lay = layoutLevel(units, lvlEdges, gdir, model.route === 'smart');
      var headerH = L.groupHeader + (u.sub ? 13 : 0);
      sized[id] = {
        w: Math.max(lay.w + L.groupPadX * 2, measureText(u.label, FONT.zone) + L.groupPadX * 2 + 8),
        h: lay.h + headerH + L.groupPadBottom,
        inner: lay, headerH: headerH,
      };
    }
    roots.forEach(measureUnit);

    // root level
    var rootUnits = roots.map(function (id) {
      var u = all[id], s = sized[id];
      return { id: id, w: s.w, h: s.h, rank: u.rank, order: u.order, band: u.type === 'node' && u.band, index: u.index + (u.type === 'group' ? 100000 : 0) };
    });
    var rootEdges = (edgesAt[''] || []).map(function (e) {
      var f = repIn(e.from, undefined), t = repIn(e.to, undefined);
      return {
        id: e.id, from: f, to: t,
        labelW: e.label ? measureText(e.label, FONT.edge) : 0,
        fromPort: f ? portOf(e.from, f, dir) : null,
        toPort: t ? portOf(e.to, t, dir) : null,
      };
    }).filter(function (e) { return e.from && e.to; });
    var rootLay = layoutLevel(rootUnits, rootEdges, dir, model.route === 'smart');

    // top-down absolute placement
    function place(id, ox, oy, rel) {
      var u = all[id], s = sized[id];
      var abs = { x: ox + rel.x, y: oy + rel.y, w: rel.w, h: rel.h, rank: rel.rank, type: u.type, parent: model.parentOf[id] !== undefined ? model.parentOf[id] : null };
      units[id] = abs;
      if (u.type === 'group') {
        var cox = abs.x + (abs.w - s.inner.w) / 2; // center content horizontally
        var coy = abs.y + s.headerH;
        childrenOf[id].forEach(function (cid) {
          place(cid, cox, coy, s.inner.placements[cid]);
        });
        var gAxis = (all[id].direction || dir) === 'down' ? 'y' : 'x';
        var gOff = gAxis === 'x' ? cox : coy;
        Object.keys(s.inner.waypoints || {}).forEach(function (eid) {
          var wp = s.inner.waypoints[eid];
          absVia[eid] = {
            axis: gAxis,
            pts: wp.pts.map(function (p) { return { x: cox + p.x, y: coy + p.y }; }),
            ptRanks: wp.ptRanks,
            gutters: s.inner.gutters.map(function (gm) { return gOff + gm; }),
            unitRanks: s.inner.unitRanks,
          };
        });
      }
    }
    roots.forEach(function (id) {
      place(id, L.margin, L.margin, rootLay.placements[id]);
    });
    Object.keys(rootLay.waypoints || {}).forEach(function (eid) {
      var wp = rootLay.waypoints[eid];
      absVia[eid] = {
        axis: dir === 'down' ? 'y' : 'x',
        pts: wp.pts.map(function (p) { return { x: L.margin + p.x, y: L.margin + p.y }; }),
        ptRanks: wp.ptRanks,
        gutters: rootLay.gutters.map(function (gm) { return L.margin + gm; }),
        unitRanks: rootLay.unitRanks,
      };
    });

    size = { w: rootLay.w + L.margin * 2, h: rootLay.h + L.margin * 2 };

    } // end auto arrangement

    // ---- edge geometry ----
    function center(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
    // side: 'l','r','t','b' — pick by dominant delta between the units the edge
    // spans at its owning level (falls back to the actual boxes)
    function sideFor(sb, tb) {
      var sc = center(sb), tc = center(tb);
      var dx = tc.x - sc.x, dy = tc.y - sc.y;
      if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'r' : 'l';
      return dy >= 0 ? 'b' : 't';
    }
    var OPP = { r: 'l', l: 'r', t: 'b', b: 't' };
    // collect anchors per (unit, side) to spread multiple edges apart
    var slots = {}; // key unit|side -> [{edge, otherCoord, end:'src'|'dst'}]
    var geo = [];
    model.edges.forEach(function (e) {
      var sb = units[e.from], tb = units[e.to];
      if (!sb || !tb) return;
      var repA = repIn(e.from, lca(e.from, e.to)) || e.from;
      var repB = repIn(e.to, lca(e.from, e.to)) || e.to;
      var via = absVia[e.id] || null;
      var sSide, tSide;
      if (via && via.pts.length) {
        // anchors face along the channel's flow axis so the edge enters and
        // leaves through the gutters, never across a rank band
        var wp0 = via.pts[0];
        var wpN = via.pts[via.pts.length - 1];
        if (via.axis === 'x') {
          sSide = e.fromSide || (wp0.x >= sb.x + sb.w / 2 ? 'r' : 'l');
          tSide = e.toSide || (wpN.x >= tb.x + tb.w / 2 ? 'r' : 'l');
        } else {
          sSide = e.fromSide || (wp0.y >= sb.y + sb.h / 2 ? 'b' : 't');
          tSide = e.toSide || (wpN.y >= tb.y + tb.h / 2 ? 'b' : 't');
        }
      } else {
        var autoSide = sideFor(units[repA] || sb, units[repB] || tb);
        sSide = e.fromSide || autoSide;
        tSide = e.toSide || OPP[autoSide];
      }
      geo.push({ e: e, sb: sb, tb: tb, sSide: sSide, tSide: tSide, via: via });
      var sKey = e.from + '|' + sSide, tKey = e.to + '|' + tSide;
      (slots[sKey] = slots[sKey] || []).push({ g: geo[geo.length - 1], other: center(tb), end: 's' });
      (slots[tKey] = slots[tKey] || []).push({ g: geo[geo.length - 1], other: center(sb), end: 't' });
    });
    Object.keys(slots).sort().forEach(function (key) {
      var list = slots[key];
      var side = key.slice(key.lastIndexOf('|') + 1);
      var horiz = side === 'l' || side === 'r'; // anchors vary along y
      list.sort(function (p, q) {
        var a = horiz ? p.other.y : p.other.x, b = horiz ? q.other.y : q.other.x;
        return a - b || p.g.e.index - q.g.e.index;
      });
      list.forEach(function (p, k) {
        var f = (k + 1) / (list.length + 1);
        if (p.end === 's') p.g.sFrac = f;
        else p.g.tFrac = f;
      });
    });
    function anchor(b, side, frac) {
      if (frac === undefined) frac = 0.5;
      if (side === 'r') return { x: b.x + b.w, y: b.y + b.h * frac };
      if (side === 'l') return { x: b.x, y: b.y + b.h * frac };
      if (side === 'b') return { x: b.x + b.w * frac, y: b.y + b.h };
      return { x: b.x + b.w * frac, y: b.y };
    }
    var NORMAL = { r: { x: 1, y: 0 }, l: { x: -1, y: 0 }, b: { x: 0, y: 1 }, t: { x: 0, y: -1 } };

    function cubicAt(p0, p1, p2, p3, t) {
      var mt = 1 - t;
      return {
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
      };
    }

    // ---- collision-aware routing (route: "smart", the default) ----
    var smart = model.route === 'smart';
    var nodeBoxes = model.nodes
      .filter(function (n) { return units[n.id]; })
      .map(function (n) { return { id: n.id, b: units[n.id] }; });
    // labels must clear group header titles as well as nodes
    var labelBoxes = nodeBoxes.concat(model.groups
      .filter(function (g) { return units[g.id]; })
      .map(function (g) {
        var u = units[g.id];
        var tw = measureText(String(g.label).toUpperCase(), FONT.zone) + 14;
        return { id: g.id, b: { x: u.x + 10, y: u.y + 6, w: Math.min(tw, Math.max(0, u.w - 20)), h: 18 + (g.sub ? 13 : 0) } };
      }));
    function obstaclesFor(e) {
      if (!smart) return [];
      var out = [];
      nodeBoxes.forEach(function (nb) { if (nb.id !== e.from && nb.id !== e.to) out.push(nb.b); });
      return out;
    }
    function ptInBox(p, b, pad) {
      return p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad;
    }
    function curveHits(cp, obs) {
      for (var i = 1; i < 24; i++) {
        var p = cubicAt(cp[0], cp[1], cp[2], cp[3], i / 24);
        for (var j = 0; j < obs.length; j++) if (ptInBox(p, obs[j], 3)) return true;
      }
      return false;
    }
    function segHits(p, q, b, pad) {
      var x1 = Math.min(p.x, q.x), x2 = Math.max(p.x, q.x);
      var y1 = Math.min(p.y, q.y), y2 = Math.max(p.y, q.y);
      return x2 > b.x - pad && x1 < b.x + b.w + pad && y2 > b.y - pad && y1 < b.y + b.h + pad;
    }
    function pathScore(pp, obs) {
      var col = 0, len = 0, i, j;
      for (i = 0; i < pp.length - 1; i++) {
        len += Math.abs(pp[i + 1].x - pp[i].x) + Math.abs(pp[i + 1].y - pp[i].y);
        for (j = 0; j < obs.length; j++) if (segHits(pp[i], pp[i + 1], obs[j], 5)) col++;
      }
      return col * 1000 + (pp.length - 2) * 8 + len * 0.05;
    }
    function plainOrtho(A, B, sSide) {
      if (sSide === 'r' || sSide === 'l') {
        var mx = (A.x + B.x) / 2;
        return [A, { x: mx, y: A.y }, { x: mx, y: B.y }, B];
      }
      var my = (A.y + B.y) / 2;
      return [A, { x: A.x, y: my }, { x: B.x, y: my }, B];
    }
    // candidate orthogonal paths, scored for collisions/bends/length — best wins
    function scoredOrtho(A, B, sSide, tSide, obs) {
      var cands = [plainOrtho(A, B, sSide)];
      var horiz = sSide === 'r' || sSide === 'l';
      var sO = sSide === 'r' ? 1 : sSide === 'l' ? -1 : 0;
      var sOY = sSide === 'b' ? 1 : sSide === 't' ? -1 : 0;
      var tO = tSide === 'r' ? 1 : tSide === 'l' ? -1 : 0;
      var tOY = tSide === 'b' ? 1 : tSide === 't' ? -1 : 0;
      var blockers = obs.filter(function (b) {
        return b.x + b.w > Math.min(A.x, B.x) - 10 && b.x < Math.max(A.x, B.x) + 10 &&
          b.y + b.h > Math.min(A.y, B.y) - 10 && b.y < Math.max(A.y, B.y) + 10;
      });
      if (horiz) {
        [0.28, 0.72].forEach(function (f) {
          var mx = A.x + (B.x - A.x) * f;
          cands.push([A, { x: mx, y: A.y }, { x: mx, y: B.y }, B]);
        });
        cands.push([A, { x: A.x + sO * 28, y: A.y }, { x: A.x + sO * 28, y: B.y }, B]);
        if (blockers.length) {
          var laneT = Math.min.apply(null, blockers.map(function (b) { return b.y; })) - 24;
          var laneB = Math.max.apply(null, blockers.map(function (b) { return b.y + b.h; })) + 24;
          // shorter stub variants fit the tight gaps port-packing creates
          [26, 12, 6].forEach(function (stub) {
            var x1 = A.x + (sO || 1) * stub, x2 = B.x + (tO || -1) * stub;
            [laneT, laneB].forEach(function (ly) {
              cands.push([A, { x: x1, y: A.y }, { x: x1, y: ly }, { x: x2, y: ly }, { x: x2, y: B.y }, B]);
            });
          });
        }
      } else {
        [0.28, 0.72].forEach(function (f) {
          var my = A.y + (B.y - A.y) * f;
          cands.push([A, { x: A.x, y: my }, { x: B.x, y: my }, B]);
        });
        cands.push([A, { x: A.x, y: A.y + sOY * 28 }, { x: B.x, y: A.y + sOY * 28 }, B]);
        if (blockers.length) {
          var laneL = Math.min.apply(null, blockers.map(function (b) { return b.x; })) - 24;
          var laneR = Math.max.apply(null, blockers.map(function (b) { return b.x + b.w; })) + 24;
          [26, 12, 6].forEach(function (stub) {
            var y1 = A.y + (sOY || 1) * stub, y2 = B.y + (tOY || -1) * stub;
            [laneL, laneR].forEach(function (lx) {
              cands.push([A, { x: A.x, y: y1 }, { x: lx, y: y1 }, { x: lx, y: y2 }, { x: B.x, y: y2 }, B]);
            });
          });
        }
      }
      var best = cands[0], bestS = pathScore(cands[0], obs);
      for (var ci = 1; ci < cands.length; ci++) {
        var sc = pathScore(cands[ci], obs);
        if (sc < bestS - 1e-9) { best = cands[ci]; bestS = sc; }
      }
      return best;
    }

    // Sander-style gutter tracks: chain hops that jog (move along the cross
    // axis) inside the same gutter get parallel tracks via deterministic
    // interval coloring, instead of coinciding on the gutter's centerline.
    var jogsAt = {}; // axis@rounded-gutter-pos -> [{hop, idx}]
    geo.forEach(function (g) {
      var e = g.e;
      if (!(g.via && e.routing === 'auto' && smart)) return;
      var repFrom = repIn(e.from, lca(e.from, e.to)) || e.from;
      var repTo = repIn(e.to, lca(e.from, e.to)) || e.to;
      var A = anchor(g.sb, g.sSide, g.sFrac);
      var B = anchor(g.tb, g.tSide, g.tFrac);
      var chainRanks = [g.via.unitRanks[repFrom]]
        .concat(g.via.ptRanks, [g.via.unitRanks[repTo]]);
      var chainPts = [A].concat(g.via.pts.map(function (p) { return { x: p.x, y: p.y }; }), [B]);
      var hops = [], prev = chainPts[0];
      for (var ci = 1; ci < chainPts.length; ci++) {
        var Q = chainPts[ci];
        var boundary = Math.min(chainRanks[ci - 1], chainRanks[ci]);
        var gPos = g.via.gutters[boundary];
        if (gPos === undefined) gPos = g.via.axis === 'x' ? (prev.x + Q.x) / 2 : (prev.y + Q.y) / 2;
        var s1 = g.via.axis === 'x' ? prev.y : prev.x;
        var s2 = g.via.axis === 'x' ? Q.y : Q.x;
        var hop = { gPos: gPos, off: 0, lo: Math.min(s1, s2), hi: Math.max(s1, s2) };
        hops.push(hop);
        if (hop.hi - hop.lo > 2) {
          var jKey = g.via.axis + '@' + Math.round(gPos);
          (jogsAt[jKey] = jogsAt[jKey] || []).push({ hop: hop, idx: e.index });
        }
        prev = Q;
      }
      g.chain = { pts: chainPts, hops: hops };
    });
    Object.keys(jogsAt).sort().forEach(function (jKey) {
      var list = jogsAt[jKey];
      if (list.length < 2) return; // alone on the centerline
      list.sort(function (p, q) { return p.hop.lo - q.hop.lo || p.idx - q.idx; });
      var trackEnd = []; // per track: end of the last interval on it
      list.forEach(function (item) {
        var t = 0;
        while (t < trackEnd.length && item.hop.lo < trackEnd[t] + 6) t++;
        trackEnd[t] = item.hop.hi;
        item.hop.track = t;
      });
      var n = trackEnd.length;
      list.forEach(function (item) {
        item.hop.off = Math.max(-20, Math.min(20, (item.hop.track - (n - 1) / 2) * 8));
      });
    });

    var edgesOut = [];
    geo.forEach(function (g) {
      var e = g.e;
      var A = anchor(g.sb, g.sSide, g.sFrac);
      var B = anchor(g.tb, g.tSide, g.tFrac);
      var dist = Math.hypot(B.x - A.x, B.y - A.y);
      var routing = e.routing === 'auto' ? 'curve' : e.routing;
      var obs = obstaclesFor(e);
      var pts, kind = 'curve', smooth = false;
      if (seqRows && seqRows[e.id]) {
        // sequence family: the message row IS the geometry
        kind = seqRows[e.id].kind;
        pts = seqRows[e.id].pts;
      } else if (g.chain) {
        // multi-rank edge: run through its reserved virtual-node channel.
        // Every hop is orthogonal, and the cross-axis move ALWAYS happens on
        // its assigned track in the mid-gutter along the level's flow axis —
        // never across a rank band where real nodes live.
        kind = 'ortho';
        smooth = true;
        pts = [g.chain.pts[0]];
        for (var ci = 1; ci < g.chain.pts.length; ci++) {
          var P = pts[pts.length - 1], Q = g.chain.pts[ci];
          var gPos = g.chain.hops[ci - 1].gPos + g.chain.hops[ci - 1].off;
          if (g.via.axis === 'x') {
            if (Math.abs(Q.y - P.y) > 2) pts.push({ x: gPos, y: P.y }, { x: gPos, y: Q.y });
          } else if (Math.abs(Q.x - P.x) > 2) {
            pts.push({ x: P.x, y: gPos }, { x: Q.x, y: gPos });
          }
          pts.push(Q);
        }
      } else if (routing === 'straight') {
        pts = [A, B];
        kind = 'straight';
      } else if (routing === 'ortho') {
        kind = 'ortho';
        pts = obs.length ? scoredOrtho(A, B, g.sSide, g.tSide, obs) : plainOrtho(A, B, g.sSide);
      } else {
        var k = Math.max(26, Math.min(110, dist * 0.38));
        var C1 = { x: A.x + NORMAL[g.sSide].x * k, y: A.y + NORMAL[g.sSide].y * k };
        var C2 = { x: B.x + NORMAL[g.tSide].x * k, y: B.y + NORMAL[g.tSide].y * k };
        pts = [A, C1, C2, B];
        // "auto" edges reroute orthogonally when the naive curve lances a node
        if (e.routing === 'auto' && obs.length && curveHits(pts, obs)) {
          kind = 'ortho';
          pts = scoredOrtho(A, B, g.sSide, g.tSide, obs);
        }
      }
      edgesOut.push({
        id: e.id, from: e.from, to: e.to, kind: e.kind, tone: e.tone,
        routing: kind, both: e.both, step: e.step, pts: pts, smooth: smooth,
        _e: e,
      });
    });

    // ---- strike-aware run dodging ----
    // A channel edge reaches a deep child at its port latitude; when that
    // straight run lances sibling nodes, reroute just that run through the
    // nearest free band between the obstacles — the same scored-candidate
    // idea as scoredOrtho, applied to one segment of a settled polyline.
    function obstaclesForEntry(entry) {
      var out = [];
      nodeBoxes.forEach(function (nb) { if (nb.id !== entry.from && nb.id !== entry.to) out.push(nb.b); });
      return out;
    }
    function dropDegenerate(pts) {
      var out = [pts[0]];
      for (var i = 1; i < pts.length; i++) {
        var last = out[out.length - 1];
        if (Math.abs(pts[i].x - last.x) > 0.5 || Math.abs(pts[i].y - last.y) > 0.5) out.push(pts[i]);
      }
      return out;
    }
    function dodgeSegment(pts, i, obs) {
      var P = pts[i], Q = pts[i + 1];
      var horiz = Math.abs(P.y - Q.y) < 0.5;
      if (!horiz && Math.abs(P.x - Q.x) >= 0.5) return null; // diagonal — leave alone
      var main = function (p) { return horiz ? p.x : p.y; };
      var crossv = function (p) { return horiz ? p.y : p.x; };
      var mk = function (m2, c2) { return horiz ? { x: m2, y: c2 } : { x: c2, y: m2 }; };
      var lo = Math.min(main(P), main(Q)), hi = Math.max(main(P), main(Q));
      var pos = crossv(P);
      // free bands between the obstacles overlapping this run's span
      var iv = [];
      obs.forEach(function (b) {
        var b1 = horiz ? b.x : b.y, b2 = horiz ? b.x + b.w : b.y + b.h;
        if (b2 < lo - 6 || b1 > hi + 6) return;
        iv.push([horiz ? b.y : b.x, horiz ? b.y + b.h : b.x + b.w]);
      });
      if (!iv.length) return null;
      iv.sort(function (p2, q2) { return p2[0] - q2[0]; });
      var merged = [iv[0].slice()];
      iv.forEach(function (p2) {
        var m2 = merged[merged.length - 1];
        if (p2[0] <= m2[1] + 12) m2[1] = Math.max(m2[1], p2[1]);
        else merged.push(p2.slice());
      });
      var lanes = [merged[0][0] - 24, merged[merged.length - 1][1] + 24];
      for (var mi = 0; mi + 1 < merged.length; mi++) {
        if (merged[mi + 1][0] - merged[mi][1] >= 20) lanes.push((merged[mi][1] + merged[mi + 1][0]) / 2);
      }
      lanes = lanes.filter(function (c2) { return Math.abs(c2 - pos) <= 220; });
      var dirM = main(Q) > main(P) ? 1 : -1;
      var startBend = i > 0, endBend = i + 1 < pts.length - 1;
      var cands = [];
      lanes.forEach(function (lane) {
        [26, 12, 6].forEach(function (stub) {
          var head = startBend ? [mk(main(P), lane)]
            : [P, mk(main(P) + dirM * stub, pos), mk(main(P) + dirM * stub, lane)];
          var tail = endBend ? [mk(main(Q), lane)]
            : [mk(main(Q) - dirM * stub, lane), mk(main(Q) - dirM * stub, crossv(Q)), Q];
          cands.push(dropDegenerate(pts.slice(0, i).concat(head, tail, pts.slice(i + 2))));
        });
      });
      var bestP = null, bestS = pathScore(pts, obs);
      cands.forEach(function (c2) {
        var sc = pathScore(c2, obs);
        if (sc < bestS - 1e-9) { bestP = c2; bestS = sc; }
      });
      return bestP;
    }
    edgesOut.forEach(function (entry) {
      if (entry.routing === 'curve' || entry.routing === 'straight') return;
      var obs = obstaclesForEntry(entry);
      if (!obs.length) return;
      for (var pass = 0; pass < 3; pass++) {
        var struck = -1;
        for (var i = 0; i < entry.pts.length - 1 && struck < 0; i++) {
          for (var j = 0; j < obs.length; j++) {
            if (segHits(entry.pts[i], entry.pts[i + 1], obs[j], -2)) { struck = i; break; }
          }
        }
        if (struck < 0) break;
        var fixed = dodgeSegment(entry.pts, struck, obs);
        if (!fixed) break;
        entry.pts = fixed;
      }
    });

    // ---- run separation (Sander's tracks, for settled ortho runs) ----
    // Two edges sharing a collinear run are nudged apart when a free offset
    // exists and both run endpoints are interior bends (attachments never move).
    (function separateRuns() {
      var seenRuns = [];
      edgesOut.forEach(function (entry) {
        if (entry.routing === 'curve') return;
        var obs = null;
        for (var i = 0; i < entry.pts.length - 1; i++) {
          var P = entry.pts[i], Q = entry.pts[i + 1];
          var horiz = Math.abs(P.y - Q.y) < 0.5, vert = Math.abs(P.x - Q.x) < 0.5;
          if (horiz === vert) continue;
          var pos = horiz ? P.y : P.x;
          var lo = horiz ? Math.min(P.x, Q.x) : Math.min(P.y, Q.y);
          var hi = horiz ? Math.max(P.x, Q.x) : Math.max(P.y, Q.y);
          if (hi - lo < 16) continue;
          var overlaps = function (r, at) {
            return r.horiz === horiz && Math.abs(r.pos - at) <= 1.5 &&
              Math.min(r.hi, hi) - Math.max(r.lo, lo) >= 16;
          };
          var clash = seenRuns.some(function (r) { return overlaps(r, pos); });
          if (clash && i > 0 && i + 1 < entry.pts.length - 1) {
            obs = obs || obstaclesForEntry(entry);
            var offs = [8, -8, 16, -16];
            for (var oi = 0; oi < offs.length; oi++) {
              var np = pos + offs[oi];
              var sp = horiz ? { x: lo, y: np } : { x: np, y: lo };
              var sq = horiz ? { x: hi, y: np } : { x: np, y: hi };
              var bad = obs.some(function (b) { return segHits(sp, sq, b, 2); }) ||
                seenRuns.some(function (r) { return overlaps(r, np); });
              if (!bad) {
                if (horiz) { P.y = np; Q.y = np; } else { P.x = np; Q.x = np; }
                pos = np;
                break;
              }
            }
          }
          seenRuns.push({ horiz: horiz, pos: pos, lo: lo, hi: hi });
        }
      });
    })();

    // labels, step badges and midpoints come AFTER dodging/separation, from
    // the settled polylines. Labels placed earlier become obstacles for later
    // ones (deterministic edge order), so labels dodge each other too.
    var placedLabels = [];
    edgesOut.forEach(function (entry) {
      var e = entry._e;
      delete entry._e;
      var pts = entry.pts;
      var isCurve = entry.routing === 'curve';
      function pointAt(t) {
        if (isCurve) {
          var p = cubicAt(pts[0], pts[1], pts[2], pts[3], t);
          // cubic derivative for the tangent
          var mt = 1 - t;
          p.tx = 3 * mt * mt * (pts[1].x - pts[0].x) + 6 * mt * t * (pts[2].x - pts[1].x) + 3 * t * t * (pts[3].x - pts[2].x);
          p.ty = 3 * mt * mt * (pts[1].y - pts[0].y) + 6 * mt * t * (pts[2].y - pts[1].y) + 3 * t * t * (pts[3].y - pts[2].y);
          return p;
        }
        // arc-length parameterization over the polyline
        var lens = [], total = 0, i2;
        for (i2 = 0; i2 < pts.length - 1; i2++) {
          var l2 = Math.hypot(pts[i2 + 1].x - pts[i2].x, pts[i2 + 1].y - pts[i2].y);
          lens.push(l2);
          total += l2;
        }
        var want = t * total;
        for (i2 = 0; i2 < lens.length; i2++) {
          if (want <= lens[i2] || i2 === lens.length - 1) {
            var f = lens[i2] ? want / lens[i2] : 0;
            return {
              x: pts[i2].x + (pts[i2 + 1].x - pts[i2].x) * f,
              y: pts[i2].y + (pts[i2 + 1].y - pts[i2].y) * f,
              tx: pts[i2 + 1].x - pts[i2].x, ty: pts[i2 + 1].y - pts[i2].y,
            };
          }
          want -= lens[i2];
        }
        return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, tx: 1, ty: 0 };
      }
      // label sits beside the path, not on it: offset along the normal,
      // preferring "up" (and "right" for near-vertical runs); the scan may
      // flip to the far side (flip) or lift further (off) when walled in
      function labelPointAt(t, off, flip) {
        var p = pointAt(t);
        var tl = Math.hypot(p.tx, p.ty) || 1;
        var nx2 = -p.ty / tl, ny2 = p.tx / tl;
        if (ny2 > 0) { nx2 = -nx2; ny2 = -ny2; }
        if (Math.abs(ny2) < 0.35 && nx2 < 0) { nx2 = -nx2; ny2 = -ny2; }
        if (flip) { nx2 = -nx2; ny2 = -ny2; }
        var o = off || (e.step ? 16 : 10); // step badges ride the line — lift the label clear of them
        return { x: p.x + nx2 * o, y: p.y + ny2 * o };
      }
      // no authored labelAt: slide along the path to the first spot whose
      // label pill clears every node box (midpoint first, then outward);
      // if every primary spot is walled, escalate — denser positions, the
      // other side of the line, larger lifts — before giving up
      var labelT = e.labelAt !== null ? e.labelAt : 0.5;
      var labelOff = null, labelFlip = false;
      if (e.labelAt === null && e.label && smart) {
        var halfW = measureText(e.label, FONT.edge) / 2 + 6;
        var clearAt = function (t, off, flip) {
          var lpt = labelPointAt(t, off, flip);
          for (var bi = 0; bi < labelBoxes.length; bi++) {
            var bb = labelBoxes[bi].b;
            if (lpt.x + halfW > bb.x - 2 && lpt.x - halfW < bb.x + bb.w + 2 &&
                lpt.y + 8 > bb.y - 2 && lpt.y - 8 < bb.y + bb.h + 2) return false;
          }
          for (var pli = 0; pli < placedLabels.length; pli++) {
            var pb = placedLabels[pli];
            if (lpt.x + halfW > pb.x - 2 && lpt.x - halfW < pb.x + pb.w + 2 &&
                lpt.y + 8 > pb.y - 2 && lpt.y - 8 < pb.y + pb.h + 2) return false;
          }
          return true;
        };
        var candT = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];
        var found = false;
        for (var li = 0; li < candT.length && !found; li++) {
          if (clearAt(candT[li], null, false)) { labelT = candT[li]; found = true; }
        }
        if (!found) {
          var escT = [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74, 0.2, 0.8, 0.14, 0.86];
          // the tall lifts are the true last resort: a "bridge label" floating
          // just above two flanking boxes a long label can't fit between
          var lifts = [e.step ? 16 : 10, 16, 22, 28, 34, 40];
          esc:
          for (var oi3 = 0; oi3 < lifts.length; oi3++) {
            for (var si3 = 0; si3 < 2; si3++) {
              for (var ti3 = 0; ti3 < escT.length; ti3++) {
                if (clearAt(escT[ti3], lifts[oi3], si3 === 1)) {
                  labelT = escT[ti3];
                  labelOff = lifts[oi3];
                  labelFlip = si3 === 1;
                  break esc;
                }
              }
            }
          }
        }
      }
      var labelPt = labelPointAt(labelT, labelOff, labelFlip);
      var stepPt = pointAt(0.2);
      var mp = pointAt(0.5);
      var mtl = Math.hypot(mp.tx, mp.ty) || 1;
      entry.mid = { x: mp.x, y: mp.y, tx: mp.tx / mtl, ty: mp.ty / mtl };
      if (e.label) {
        entry.label = { x: labelPt.x, y: labelPt.y, text: e.label };
        var phw = measureText(e.label, FONT.edge) / 2 + 6;
        placedLabels.push({ x: labelPt.x - phw, y: labelPt.y - 8, w: phw * 2, h: 16 });
      }
      if (e.step) entry.stepAt = stepPt;
    });

    // expand the canvas to cover routed edges — detour lanes and lifted labels
    // may leave the node bounding box
    var ex1 = 0, ey1 = 0, ex2 = size.w, ey2 = size.h;
    edgesOut.forEach(function (en) {
      en.pts.forEach(function (p) {
        ex1 = Math.min(ex1, p.x - 8);
        ey1 = Math.min(ey1, p.y - 8);
        ex2 = Math.max(ex2, p.x + 8);
        ey2 = Math.max(ey2, p.y + 8);
      });
      if (en.label) {
        var half = measureText(en.label.text, FONT.edge) / 2 + 8;
        ex1 = Math.min(ex1, en.label.x - half);
        ex2 = Math.max(ex2, en.label.x + half);
        ey1 = Math.min(ey1, en.label.y - 13);
        ey2 = Math.max(ey2, en.label.y + 10);
      }
    });
    var shiftX = ex1 < 0 ? -ex1 : 0, shiftY = ey1 < 0 ? -ey1 : 0;
    if (shiftX || shiftY) {
      Object.keys(units).forEach(function (id) {
        units[id].x += shiftX;
        units[id].y += shiftY;
      });
      edgesOut.forEach(function (en) {
        en.pts.forEach(function (p) { p.x += shiftX; p.y += shiftY; });
        if (en.label) { en.label.x += shiftX; en.label.y += shiftY; }
        if (en.stepAt) { en.stepAt.x += shiftX; en.stepAt.y += shiftY; }
        if (en.mid) { en.mid.x += shiftX; en.mid.y += shiftY; }
      });
      if (seqLifelines) seqLifelines.forEach(function (l) { l.x += shiftX; l.y1 += shiftY; l.y2 += shiftY; });
    }
    size = { w: ex2 + shiftX, h: ey2 + shiftY };

    return { size: size, direction: dir, units: units, edges: edgesOut, lifelines: seqLifelines || undefined, sized: opts && opts.keepSizes ? sized : undefined };
  }

  /* ================================================================
   * §5.5 audit() — geometry gate
   *
   * Objective defects in a computed layout: an edge through a node, a child
   * outside its parent, overlapping units, a label on a node, two edges
   * running on top of each other. These are never intended, so the checker
   * treats every finding as a failure (crossings/bends stay judgement calls
   * and live in check.mjs --metrics instead). Tolerances sit just inside the
   * router's own avoidance thresholds so engine-approved geometry can't be
   * flagged: strikes need >2px penetration, labels are engine-cleared at
   * +2px inflation and audited at 0.
   * ============================================================== */

  function audit(spec, lay) {
    var model = normalize(flattenSequenceContainment(spec));
    var l = lay || layout(spec);
    var findings = [];
    var units = l.units;

    function sampleCurve(p) {
      var out = [], i, t, mt;
      for (i = 0; i <= 24; i++) {
        t = i / 24;
        mt = 1 - t;
        out.push({
          x: mt * mt * mt * p[0].x + 3 * mt * mt * t * p[1].x + 3 * mt * t * t * p[2].x + t * t * t * p[3].x,
          y: mt * mt * mt * p[0].y + 3 * mt * mt * t * p[1].y + 3 * mt * t * t * p[2].y + t * t * t * p[3].y,
        });
      }
      return out;
    }
    function inBox(p, b) {
      return p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
    }
    function orient(p, q, r) {
      return Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    }
    function segsCross(a, b, c, d) {
      return orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b) &&
        orient(a, b, c) !== 0 && orient(c, d, a) !== 0;
    }
    function segInBox(p, q, b) {
      if (inBox(p, b) || inBox(q, b)) return true;
      var c = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
      for (var i = 0; i < 4; i++) if (segsCross(p, q, c[i], c[(i + 1) % 4])) return true;
      return false;
    }
    function boxesOverlap(p, q, tol) {
      return p.x < q.x + q.w - tol && q.x < p.x + p.w - tol &&
        p.y < q.y + q.h - tol && q.y < p.y + p.h - tol;
    }
    function isAncestor(anc, id) {
      var cur = model.parentOf[id], guard = 0;
      while (cur !== undefined && guard++ < 1000) {
        if (cur === anc) return true;
        cur = model.parentOf[cur];
      }
      return false;
    }

    var nodeB = [];
    model.nodes.forEach(function (n) {
      if (units[n.id]) nodeB.push({ id: n.id, b: units[n.id] });
    });
    // group header strips: the top-left band where the group's title renders
    var headerB = [];
    model.groups.forEach(function (g) {
      var u = units[g.id];
      if (!u) return;
      var tw = measureText(String(g.label).toUpperCase(), FONT.zone) + 14;
      headerB.push({
        id: g.id,
        b: { x: u.x + 10, y: u.y + 6, w: Math.min(tw, Math.max(0, u.w - 20)), h: 18 + (g.sub ? 13 : 0) },
      });
    });

    // 1. edges lancing nodes they don't touch (curves audited at the router's
    //    own sample points; polylines with exact segment/box intersection)
    var PAD = 2;
    l.edges.forEach(function (e) {
      var isCurve = e.routing === 'curve' && e.pts.length === 4;
      var pts = isCurve ? sampleCurve(e.pts) : e.pts;
      nodeB.forEach(function (nb) {
        if (nb.id === e.from || nb.id === e.to) return;
        var b = { x: nb.b.x + PAD, y: nb.b.y + PAD, w: nb.b.w - PAD * 2, h: nb.b.h - PAD * 2 };
        if (b.w <= 0 || b.h <= 0) return;
        if (isCurve) {
          for (var i = 1; i < pts.length - 1; i++) {
            if (inBox(pts[i], b)) {
              findings.push({ code: 'edge-through-node', msg: 'edge "' + e.id + '" passes through node "' + nb.id + '"' });
              return;
            }
          }
        } else {
          for (var j = 0; j < pts.length - 1; j++) {
            if (segInBox(pts[j], pts[j + 1], b)) {
              findings.push({ code: 'edge-through-node', msg: 'edge "' + e.id + '" passes through node "' + nb.id + '"' });
              return;
            }
          }
        }
      });
    });

    // 2. children rendered outside their parent group box
    Object.keys(units).forEach(function (id) {
      var par = model.parentOf[id];
      if (par === undefined || !units[par]) return;
      var c = units[id], p = units[par];
      if (c.x < p.x - 0.5 || c.y < p.y - 0.5 ||
          c.x + c.w > p.x + p.w + 0.5 || c.y + c.h > p.y + p.h + 0.5) {
        findings.push({ code: 'outside-parent', msg: (units[id].type || 'unit') + ' "' + id + '" is rendered outside its parent "' + par + '"' });
      }
    });

    // 3. units overlapping without a containment relationship
    var uids = Object.keys(units);
    for (var ui = 0; ui < uids.length; ui++) {
      for (var uj = ui + 1; uj < uids.length; uj++) {
        var a2 = uids[ui], b2 = uids[uj];
        if (isAncestor(a2, b2) || isAncestor(b2, a2)) continue;
        if (boxesOverlap(units[a2], units[b2], 0.5)) {
          findings.push({ code: 'unit-overlap', msg: 'units "' + a2 + '" and "' + b2 + '" overlap' });
        }
      }
    }

    // 4. edge labels sitting on nodes, on group header titles, or on each other
    var pills = [];
    l.edges.forEach(function (e) {
      if (!e.label) return;
      var half = measureText(e.label.text, FONT.edge) / 2 + 6;
      var lb = { x: e.label.x - half, y: e.label.y - 8, w: half * 2, h: 16 };
      pills.push({ id: e.id, b: lb });
      nodeB.forEach(function (nb) {
        if (boxesOverlap(lb, nb.b, 0.5)) {
          findings.push({ code: 'label-on-node', msg: 'label of edge "' + e.id + '" ("' + e.label.text + '") sits on node "' + nb.id + '"' });
        }
      });
      headerB.forEach(function (hb) {
        if (boxesOverlap(lb, hb.b, 0.5)) {
          findings.push({ code: 'label-on-header', msg: 'label of edge "' + e.id + '" ("' + e.label.text + '") sits on group "' + hb.id + '" header' });
        }
      });
    });
    for (var pi = 0; pi < pills.length; pi++) {
      for (var pj = pi + 1; pj < pills.length; pj++) {
        if (boxesOverlap(pills[pi].b, pills[pj].b, 0.5)) {
          findings.push({ code: 'label-on-label', msg: 'labels of edges "' + pills[pi].id + '" and "' + pills[pj].id + '" overlap' });
        }
      }
    }

    // 5. two edges running on top of each other (collinear overlap ≥16px;
    //    ports and gutter tracks should always separate them further than this)
    function distToSeg(p, a2, b2) {
      var vx = b2.x - a2.x, vy = b2.y - a2.y;
      var len2 = vx * vx + vy * vy;
      var t = len2 ? ((p.x - a2.x) * vx + (p.y - a2.y) * vy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a2.x + vx * t), p.y - (a2.y + vy * t));
    }
    var curveRuns = l.edges.filter(function (e) { return e.routing === 'curve' && e.pts.length === 4; });
    for (var qi = 0; qi < curveRuns.length; qi++) {
      for (var qj = qi + 1; qj < curveRuns.length; qj++) {
        var As = sampleCurve(curveRuns[qi].pts), Bs = sampleCurve(curveRuns[qj].pts);
        var run = 0, flagged = false;
        for (var si = 1; si < As.length && !flagged; si++) {
          var near = false;
          for (var sj = 0; sj < Bs.length - 1; sj++) {
            if (distToSeg(As[si], Bs[sj], Bs[sj + 1]) <= 1.5) { near = true; break; }
          }
          if (near) {
            run += Math.hypot(As[si].x - As[si - 1].x, As[si].y - As[si - 1].y);
            if (run >= 16) {
              findings.push({ code: 'coincident-edges', msg: 'edges "' + curveRuns[qi].id + '" and "' + curveRuns[qj].id + '" trace the same path' });
              flagged = true;
            }
          } else {
            run = 0;
          }
        }
      }
    }
    var runs = l.edges.filter(function (e) { return !(e.routing === 'curve' && e.pts.length === 4); });
    for (var ei = 0; ei < runs.length; ei++) {
      for (var ej = ei + 1; ej < runs.length; ej++) {
        if (coincide(runs[ei], runs[ej])) {
          findings.push({ code: 'coincident-edges', msg: 'edges "' + runs[ei].id + '" and "' + runs[ej].id + '" run on top of each other' });
        }
      }
    }
    function coincide(ea, eb) {
      for (var i = 0; i < ea.pts.length - 1; i++) {
        var p = ea.pts[i], q = ea.pts[i + 1];
        var dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
        if (len < 8) continue;
        var ux = dx / len, uy = dy / len;
        for (var j = 0; j < eb.pts.length - 1; j++) {
          var r = eb.pts[j], s = eb.pts[j + 1];
          var dx2 = s.x - r.x, dy2 = s.y - r.y, len2 = Math.hypot(dx2, dy2);
          if (len2 < 8) continue;
          if (Math.abs(ux * (dy2 / len2) - uy * (dx2 / len2)) > 0.02) continue; // not parallel
          var dR = Math.abs(ux * (r.y - p.y) - uy * (r.x - p.x));
          var dS = Math.abs(ux * (s.y - p.y) - uy * (s.x - p.x));
          if (Math.max(dR, dS) > 1.5) continue; // parallel but laterally separated
          var tR = (r.x - p.x) * ux + (r.y - p.y) * uy;
          var tS = (s.x - p.x) * ux + (s.y - p.y) * uy;
          var lo = Math.max(0, Math.min(tR, tS)), hi = Math.min(len, Math.max(tR, tS));
          if (hi - lo >= 16) return true;
        }
      }
      return false;
    }

    return findings;
  }

  /* ================================================================
   * §6 describe() — deterministic plain-text summary
   * ============================================================== */

  function factsStr(f) {
    if (!f) return '';
    var keys = Object.keys(f);
    if (!keys.length) return '';
    return ' {' + keys.map(function (k) { return k + '=' + f[k]; }).join(', ') + '}';
  }

  function describe(spec) {
    var m = normalize(spec);
    var out = [];
    out.push('sysgram v' + VERSION + ' — ' + m.title + ' (' + m.id + ')');
    if (m.description) out.push(m.description);
    out.push('direction: ' + m.direction +
      (m.layout !== 'layered' ? ' · layout: ' + m.layout : '') +
      (m.arrange === 'manual' ? ' · arrange: manual' : ''));
    out.push('nodes (' + m.nodes.length + '):');
    m.nodes.forEach(function (n) {
      var line = '  - ' + n.id + ' "' + n.label + '" [' + n.kind + ']';
      if (n.band) line += ' (band)';
      if (n.sub.length) line += ' — ' + n.sub.join(' · ');
      if (n.desc) line += ' :: ' + n.desc;
      line += factsStr(n.facts);
      if (n.icon.length) {
        line += ' · icon: ' + n.icon.map(function (iid) {
          return m.iconCatalog[iid] ? m.iconCatalog[iid].label : iid;
        }).join(' + ');
      }
      out.push(line);
    });
    if (m.groups.length) {
      out.push('groups (' + m.groups.length + '):');
      m.groups.forEach(function (g) {
        var line = '  - ' + g.id + ' "' + g.label + '" [' + g.kind + '] children: ' + g.children.join(', ');
        if (g.desc) line += ' :: ' + g.desc;
        out.push(line);
      });
    }
    out.push('edges (' + m.edges.length + '):');
    m.edges.forEach(function (e) {
      var line = '  - ' + e.from + ' ' + (e.both ? '<->' : '->') + ' ' + e.to + ' [' + e.kind + ']';
      if (e.label) line += ' "' + e.label + '"';
      if (e.step) line += ' (step ' + e.step + ')';
      if (e.desc) line += ' :: ' + e.desc;
      line += factsStr(e.facts);
      out.push(line);
    });
    if (m.flows.length) {
      out.push('flows (' + m.flows.length + '):');
      m.flows.forEach(function (f) {
        out.push('  - ' + f.id + ' "' + f.label + '": ' + f.steps.join(' -> '));
      });
    }
    if (m.assertions.length) {
      out.push('assertions (' + m.assertions.length + '):');
      m.assertions.forEach(function (a) {
        var line = '  - ' + a.id + ': ' + a.text;
        if (a.rule && a.rule.kind) {
          line += ' [machine-checked: ' + a.rule.kind +
            (a.rule.from ? ' ' + a.rule.from + ' -> ' + a.rule.to : '') +
            (a.rule.via ? ' via ' + a.rule.via : '') + ']';
        }
        out.push(line + (a.refs.length ? ' (refs: ' + a.refs.join(', ') + ')' : ''));
      });
    }
    return out.join('\n');
  }

  /* ================================================================
   * §7 Browser renderer
   * ============================================================== */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var THEME_LIGHT = {
    surface: '#ffffff', canvas: '#ffffff', chrome: '#e7eaf1',
    ink: '#171a21', muted: '#5a6372', faint: '#8a93a3',
    nodeLine: '#39404d', nodeFill: '#ffffff',
    mutedLine: '#8f98a8', zoneLine: '#b6becd', zoneFill: 'rgba(120,132,158,0.045)',
    accent: '#2b46e0', warn: '#96690a', warnLine: '#b5891f',
  };
  var THEME_DARK = {
    surface: '#15181e', canvas: '#101318', chrome: '#2a2f3a',
    ink: '#e8ebf1', muted: '#9aa4b2', faint: '#6b7684',
    nodeLine: '#a7b0bf', nodeFill: '#1a1e26',
    mutedLine: '#5f6a78', zoneLine: '#454e5e', zoneFill: 'rgba(146,160,186,0.06)',
    accent: '#8fa2ff', warn: '#d4a930', warnLine: '#a8862a',
  };

  function hexToRgb(hex) {
    var h = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!h) return null;
    var v = parseInt(h[1], 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function lighten(hex, f) {
    var c = hexToRgb(hex);
    if (!c) return hex;
    var r = Math.round(c.r + (255 - c.r) * f), g = Math.round(c.g + (255 - c.g) * f), b = Math.round(c.b + (255 - c.b) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function alpha(hex, a) {
    var c = hexToRgb(hex);
    if (!c) return hex;
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  var TOKEN_NAMES = ['surface', 'canvas', 'chrome', 'ink', 'muted', 'faint', 'nodeLine', 'nodeFill',
    'mutedLine', 'zoneLine', 'zoneFill', 'accent', 'accentTint', 'warn', 'warnLine'];

  function cssVars(theme, accent) {
    var t = {};
    TOKEN_NAMES.forEach(function (k) { if (theme[k] !== undefined) t[k] = theme[k]; });
    if (accent) t.accent = accent;
    t.accentTint = alpha(hexToRgb(t.accent) ? t.accent : theme.accent, theme === THEME_DARK ? 0.13 : 0.07);
    var s = '';
    Object.keys(t).forEach(function (k) { s += '--sg-' + k + ':' + t[k] + ';'; });
    return s;
  }

  var STYLE_EL_ID = 'sysgram-style';
  function injectCSS(doc) {
    if (doc.getElementById(STYLE_EL_ID)) return;
    var css = '' +
      '.sysgram{' + cssVars(THEME_LIGHT) + 'margin:1.6em 0;padding:14px 16px 12px;border:1px solid var(--sg-chrome);' +
      'border-radius:12px;background:var(--sg-surface);color:var(--sg-ink);' +
      'font-family:' + FAMILY + ';box-sizing:border-box}' +
      '.sysgram *{box-sizing:border-box}' +
      '@media (prefers-color-scheme: dark){.sysgram:not([data-sysgram-theme=light]){' + cssVars(THEME_DARK) + '}}' +
      '.sysgram[data-sysgram-theme=dark]{' + cssVars(THEME_DARK) + '}' +
      '.sysgram .sg-toolbar{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}' +
      '.sysgram .sg-title{font-size:13px;font-weight:650;letter-spacing:.01em;padding-top:5px;' +
      'min-width:140px;max-width:220px;flex:0 1 auto}' +
      '.sysgram .sg-desc{font-size:11px;color:var(--sg-muted);flex:1 1 auto;min-width:0;padding-top:5px}' +
      '.sysgram .sg-btns{display:flex;gap:6px;align-items:flex-start;align-self:flex-start;margin-left:auto}' +
      '.sysgram button{font:inherit;font-size:11px;line-height:1;color:var(--sg-muted);background:transparent;' +
      'border:1px solid var(--sg-chrome);border-radius:6px;padding:5px 7px;cursor:pointer}' +
      '.sysgram button:hover{color:var(--sg-ink);border-color:var(--sg-mutedLine)}' +
      '.sysgram button.sg-full svg{display:block;width:14px;height:14px;min-width:14px;max-width:none!important;flex:none}' +
      '.sysgram select.sg-layoutsel{font:inherit;font-size:11px;line-height:1;color:var(--sg-muted);' +
      'background:transparent;border:1px solid var(--sg-chrome);border-radius:6px;padding:4px 5px;cursor:pointer}' +
      '.sysgram select.sg-layoutsel:hover{color:var(--sg-ink);border-color:var(--sg-mutedLine)}' +
      '.sysgram .sg-control-group{display:grid;border:1px solid var(--sg-chrome);border-radius:7px;overflow:hidden;' +
      'background:var(--sg-surface)}' +
      '.sysgram .sg-control-group:hover{border-color:var(--sg-mutedLine)}' +
      '.sysgram .sg-control-group button,.sysgram .sg-control-group select.sg-layoutsel{border:0;border-radius:0;' +
      'min-height:25px;margin:0}' +
      '.sysgram .sg-control-group button{transition:color .1s ease,background-color .1s ease,box-shadow .1s ease}' +
      '.sysgram .sg-control-group button.sg-control-flash{color:var(--sg-accent);background:var(--sg-accentTint);' +
      'box-shadow:inset 0 0 0 1px var(--sg-accent)}' +
      '.sysgram .sg-view-controls{grid-template-columns:repeat(2,minmax(28px,auto))}' +
      '.sysgram .sg-view-controls button:nth-child(even){border-left:1px solid var(--sg-chrome)}' +
      '.sysgram .sg-view-controls button:nth-child(n+3){border-top:1px solid var(--sg-chrome)}' +
      '.sysgram .sg-file-controls{grid-template-columns:repeat(2,minmax(34px,auto))}' +
      '.sysgram .sg-file-controls button+button{border-left:1px solid var(--sg-chrome)}' +
      '.sysgram .sg-layout-controls{display:flex}' +
      '.sysgram .sg-layout-controls select.sg-layoutsel{padding-left:7px;padding-right:7px}' +
      '@media(max-width:720px){.sysgram .sg-toolbar{flex-wrap:wrap}.sysgram .sg-btns{width:100%;margin-left:0}}' +
      '.sysgram .sg-json{display:none;margin-top:10px;border:1px solid var(--sg-chrome);border-radius:8px;' +
      'background:var(--sg-canvas);max-height:340px;overflow:auto}' +
      '.sysgram .sg-json pre{margin:0;padding:10px 12px;font-size:11px;line-height:1.5;color:var(--sg-ink);' +
      'white-space:pre;user-select:text;-webkit-user-select:text}' +
      '.sysgram .sg-canvas{position:relative;background:var(--sg-canvas);border:1px solid var(--sg-chrome);' +
      'border-radius:8px;overflow:hidden}' +
      '.sysgram .sg-scroll-stage{position:relative;width:100%}' +
      '.sysgram svg.sg-svg{display:block;width:100%;height:auto;max-height:760px;cursor:grab;-webkit-user-select:none;user-select:none}' +
      '.sysgram svg.sg-svg.sg-panning{cursor:grabbing}' +
      '.sysgram.sg-expanded{position:fixed;inset:0;z-index:2147483647;margin:0;width:100%;height:100vh;height:100dvh;' +
      'max-width:none;padding:14px 16px 12px;border-radius:0;display:flex;flex-direction:column;overflow:auto;' +
      'background:var(--sg-surface);transform:none!important}' +
      '.sysgram.sg-expanded .sg-toolbar{flex:none}' +
      '.sysgram.sg-expanded .sg-inspect,.sysgram.sg-expanded .sg-flows,.sysgram.sg-expanded .sg-asserts,' +
      '.sysgram.sg-expanded .sg-legend,.sysgram.sg-expanded figcaption{display:none!important}' +
      '.sysgram.sg-expanded .sg-canvas{display:block;flex:1 1 auto;min-height:160px;overflow:auto}' +
      '.sysgram.sg-expanded .sg-scroll-stage{position:relative;width:100%;height:100%;min-width:100%;min-height:100%}' +
      '.sysgram.sg-expanded svg.sg-svg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'max-height:none;aspect-ratio:auto!important}' +
      '.sysgram .sg-node,.sysgram .sg-group-box,.sysgram .sg-edge{transition:opacity .15s ease}' +
      '@media (prefers-reduced-motion: reduce){.sysgram .sg-node,.sysgram .sg-group-box,.sysgram .sg-edge{transition:none}}' +
      '.sysgram.sg-focusing .sg-node:not(.sg-hi),.sysgram.sg-focusing .sg-edge:not(.sg-hi){opacity:.18}' +
      '.sysgram.sg-focusing .sg-group-box:not(.sg-hi){opacity:.45}' +
      '.sysgram .sg-flows{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}' +
      '.sysgram .sg-flows button{border-radius:999px;padding:4px 10px}' +
      '.sysgram .sg-flows button[aria-pressed=true]{color:var(--sg-accent);border-color:var(--sg-accent)}' +
      '.sysgram .sg-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;padding-top:9px;' +
      'border-top:1px solid var(--sg-chrome)}' +
      '.sysgram .sg-legend .sg-li{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--sg-muted)}' +
      '.sysgram .sg-legend svg{display:block}' +
      '.sysgram .sg-inspect{display:none;margin-top:10px;border:1px solid var(--sg-chrome);border-radius:8px;' +
      'padding:10px 12px;font-size:11.5px;line-height:1.5}' +
      '.sysgram .sg-inspect.sg-open{display:block}' +
      '.sysgram .sg-ihead{display:flex;align-items:center;gap:8px}' +
      '.sysgram .sg-ihead strong{font-size:12.5px}' +
      '.sysgram .sg-ikind{font-family:' + MONO + ';font-size:9.5px;color:var(--sg-muted);' +
      'border:1px solid var(--sg-chrome);border-radius:5px;padding:2px 6px}' +
      '.sysgram .sg-ihead .sg-x{margin-left:auto}' +
      '.sysgram .sg-idesc{margin:6px 0 0;color:var(--sg-muted)}' +
      '.sysgram .sg-ifacts{display:grid;grid-template-columns:max-content 1fr;gap:2px 14px;margin-top:8px}' +
      '.sysgram .sg-ifacts .fk{color:var(--sg-faint);font-family:' + MONO + ';font-size:10px;padding-top:1px}' +
      '.sysgram .sg-iconns{margin:8px 0 0;padding:0;list-style:none}' +
      '.sysgram .sg-iconns li{padding:2px 0;color:var(--sg-muted)}' +
      '.sysgram .sg-iconns b{color:var(--sg-ink);font-weight:600}' +
      '.sysgram .sg-asserts{display:flex;flex-direction:column;gap:2px;margin-top:10px;padding-top:9px;' +
      'border-top:1px solid var(--sg-chrome)}' +
      '.sysgram .sg-asserts-h{font-size:10px;letter-spacing:1.2px;color:var(--sg-faint);text-transform:uppercase}' +
      '.sysgram button.sg-assert{text-align:left;border:1px solid transparent;padding:3px 6px;border-radius:6px;' +
      'color:var(--sg-muted);font-size:11px;line-height:1.45}' +
      '.sysgram button.sg-assert::before{content:"\\25C6  ";color:var(--sg-accent);font-size:8px}' +
      '.sysgram button.sg-assert[aria-pressed=true]{color:var(--sg-accent);background:var(--sg-accentTint);border-color:transparent}' +
      '.sysgram button.sg-assert:disabled{cursor:default;opacity:.85}' +
      '.sysgram .sg-assert-check{margin-left:7px;font-size:9px;letter-spacing:.4px;color:var(--sg-accent);' +
      'border:1px solid var(--sg-accentTint);background:var(--sg-accentTint);border-radius:4px;padding:1px 5px;white-space:nowrap}' +
      '.sysgram figcaption{margin-top:9px;font-size:11px;color:var(--sg-muted);line-height:1.45}' +
      '.sysgram .sg-errors{font-size:12px;line-height:1.5;color:#a02c2c;background:rgba(200,60,60,.07);' +
      'border:1px solid rgba(200,60,60,.35);border-radius:8px;padding:10px 12px;margin:4px 0}' +
      '.sysgram .sg-errors ul{margin:6px 0 0;padding-left:18px}' +
      '.sysgram .sg-errors pre{white-space:pre-wrap;font-family:' + MONO + ';font-size:10.5px;margin:8px 0 0;color:var(--sg-muted)}' +
      '.sysgram .sg-warnings{color:#8a6d1a;background:rgba(180,140,40,.07);border-color:rgba(180,140,40,.35)}' +
      '@media print{.sysgram .sg-btns,.sysgram .sg-flows{display:none}}' +
      '';
    var el = doc.createElement('style');
    el.id = STYLE_EL_ID;
    el.textContent = css;
    doc.head.appendChild(el);
  }

  // A transformed ancestor establishes the containing block for fixed-position
  // descendants. Portal expanded figures to the body so host-page breakout
  // wrappers cannot constrain the viewport overlay, then restore the exact DOM
  // position from a marker when expanded view closes.
  function portalExpandedFigure(doc, figure) {
    if (figure._sysgramExpandedMarker || !figure.parentNode || !doc.body || figure.parentNode === doc.body) return;
    var marker = doc.createComment('sysgram expanded view');
    figure.parentNode.insertBefore(marker, figure);
    figure._sysgramExpandedMarker = marker;
    doc.body.appendChild(figure);
  }

  function restoreExpandedFigure(figure) {
    var marker = figure._sysgramExpandedMarker;
    if (!marker) return;
    if (marker.parentNode) {
      marker.parentNode.insertBefore(figure, marker);
      marker.parentNode.removeChild(marker);
    }
    figure._sysgramExpandedMarker = null;
  }

  function svgEl(doc, name, attrs, parent) {
    var el = doc.createElementNS(SVG_NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(el);
    return el;
  }

  function tipText(desc, facts) {
    var t = desc || '';
    if (facts) {
      var lines = Object.keys(facts).map(function (k) { return k + ': ' + facts[k]; });
      if (lines.length) t += (t ? '\n' : '') + lines.join('\n');
    }
    return t;
  }

  function toneStroke(tone) {
    return tone === 'accent' ? 'var(--sg-accent)' :
      tone === 'muted' ? 'var(--sg-mutedLine)' :
      tone === 'warn' ? 'var(--sg-warnLine)' : 'var(--sg-nodeLine)';
  }
  function toneInk(tone) {
    return tone === 'accent' ? 'var(--sg-accent)' :
      tone === 'muted' ? 'var(--sg-muted)' :
      tone === 'warn' ? 'var(--sg-warn)' : 'var(--sg-ink)';
  }

  function nodeShapePath(shape, w, h) {
    // returns {body: pathD or null (use rect), extra: [pathD...] decorations}
    if (shape === 'cylinder') {
      var ry = 6.5;
      return {
        body: 'M0 ' + ry + 'A ' + (w / 2) + ' ' + ry + ' 0 0 1 ' + w + ' ' + ry +
          'V' + (h - ry) + 'A ' + (w / 2) + ' ' + ry + ' 0 0 1 0 ' + (h - ry) + 'Z',
        extra: ['M0 ' + ry + 'A ' + (w / 2) + ' ' + ry + ' 0 0 0 ' + w + ' ' + ry],
        textTop: ry * 2 - 3,
      };
    }
    if (shape === 'lid') {
      return { body: null, rx: 4, extra: ['M0 7H' + w], textTop: 7 };
    }
    if (shape === 'note') {
      var f = 12;
      return {
        body: 'M0 0H' + (w - f) + 'L' + w + ' ' + f + 'V' + h + 'H0Z',
        extra: ['M' + (w - f) + ' 0V' + f + 'H' + w],
        textTop: 0,
      };
    }
    if (shape === 'pill') return { body: null, rx: h / 2, textTop: 0 };
    return { body: null, rx: 9, textTop: 0 };
  }

  function drawGlyph(doc, parent, name, x, y, scale, colorVar) {
    var d = GLYPHS[name];
    if (!d) return;
    var g = svgEl(doc, 'g', { transform: 'translate(' + x + ',' + y + ') scale(' + (scale || 1) + ')' }, parent);
    svgEl(doc, 'path', {
      d: d, fill: 'none', stroke: colorVar || 'currentColor',
      'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }, g);
    return g;
  }

  function ptsToPath(edge) {
    var p = edge.pts;
    if (edge.routing === 'curve' && p.length === 4) {
      return 'M' + p[0].x.toFixed(1) + ' ' + p[0].y.toFixed(1) +
        'C' + p[1].x.toFixed(1) + ' ' + p[1].y.toFixed(1) + ',' +
        p[2].x.toFixed(1) + ' ' + p[2].y.toFixed(1) + ',' +
        p[3].x.toFixed(1) + ' ' + p[3].y.toFixed(1);
    }
    if (edge.routing === 'ortho' && p.length >= 3) {
      // rounded corners; channel splines get a softer bend
      var r = edge.smooth ? 18 : 8, d = 'M' + p[0].x.toFixed(1) + ' ' + p[0].y.toFixed(1);
      for (var i = 1; i < p.length - 1; i++) {
        var prev = p[i - 1], cur = p[i], next = p[i + 1];
        var v1 = { x: cur.x - prev.x, y: cur.y - prev.y }, l1 = Math.hypot(v1.x, v1.y) || 1;
        var v2 = { x: next.x - cur.x, y: next.y - cur.y }, l2 = Math.hypot(v2.x, v2.y) || 1;
        var rr = Math.min(r, l1 / 2, l2 / 2);
        var a = { x: cur.x - v1.x / l1 * rr, y: cur.y - v1.y / l1 * rr };
        var b = { x: cur.x + v2.x / l2 * rr, y: cur.y + v2.y / l2 * rr };
        d += 'L' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) +
          'Q' + cur.x.toFixed(1) + ' ' + cur.y.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
      }
      d += 'L' + p[p.length - 1].x.toFixed(1) + ' ' + p[p.length - 1].y.toFixed(1);
      return d;
    }
    return 'M' + p.map(function (q) { return q.x.toFixed(1) + ' ' + q.y.toFixed(1); }).join('L');
  }

  function ensureMarkers(doc, defs, tone, head, figId) {
    var id = 'sg-' + figId + '-' + head + '-' + tone;
    if (defs.querySelector('#' + CSS.escape(id))) return id;
    var sz = head === 'tri' ? 9.5 : 11;
    var m = svgEl(doc, 'marker', {
      id: id, viewBox: '0 0 10 10', refX: head === 'tri' ? 8.6 : 8, refY: 5,
      markerWidth: sz, markerHeight: sz, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse',
    }, defs);
    if (head === 'tri') {
      svgEl(doc, 'path', { d: 'M0.5 0.8L9.5 5L0.5 9.2Z', fill: toneStroke(tone) }, m);
    } else {
      svgEl(doc, 'path', {
        d: 'M1.5 1.2L8.8 5L1.5 8.8', fill: 'none', stroke: toneStroke(tone),
        'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }, m);
    }
    return id;
  }

  function renderInto(doc, figure, record) {
    var spec = record.spec, model = record.model, lay = record.layout;
    var figId = String(spec.id || 'sg').replace(/[^a-z0-9-]/gi, '');
    var wasExpanded = figure.classList.contains('sg-expanded');
    figure.innerHTML = '';
    figure.className = 'sysgram' + (wasExpanded ? ' sg-expanded' : '');
    figure.setAttribute('data-sysgram-id', spec.id || '');
    if (record.theme) figure.setAttribute('data-sysgram-theme', record.theme);
    if (spec.accent && hexToRgb(spec.accent)) {
      var acc = spec.accent;
      var accD = spec.accentDark && hexToRgb(spec.accentDark) ? spec.accentDark : lighten(acc, 0.42);
      var st = '--sg-accent:' + acc + ';--sg-accentTint:' + alpha(acc, 0.07) + ';';
      figure.style.cssText += st;
      // dark override for the accent, via a per-figure style rule
      var darkSel = '.sysgram[data-sysgram-id="' + figId + '"]';
      var extra = doc.createElement('style');
      extra.textContent =
        '@media (prefers-color-scheme: dark){' + darkSel + ':not([data-sysgram-theme=light]){--sg-accent:' + accD + ';--sg-accentTint:' + alpha(acc, 0.14) + ';}}' +
        darkSel + '[data-sysgram-theme=dark]{--sg-accent:' + accD + ';--sg-accentTint:' + alpha(acc, 0.14) + ';}';
      figure.appendChild(extra);
    }

    // ---- toolbar ----
    var bar = doc.createElement('div');
    bar.className = 'sg-toolbar';
    var title = doc.createElement('span');
    title.className = 'sg-title';
    title.textContent = spec.title || spec.id || 'diagram';
    bar.appendChild(title);
    var desc = doc.createElement('span');
    desc.className = 'sg-desc';
    desc.textContent = spec.description || '';
    bar.appendChild(desc);
    var btns = doc.createElement('div');
    btns.className = 'sg-btns';
    bar.appendChild(btns);
    figure.appendChild(bar);

    // ---- validation panel ----
    if (record.errors.length) {
      var panel = doc.createElement('div');
      panel.className = 'sg-errors';
      panel.textContent = 'sysgram: this spec has errors — nothing rendered.';
      var ul = doc.createElement('ul');
      record.errors.forEach(function (p) {
        var li = doc.createElement('li');
        li.textContent = '[' + p.code + '] ' + p.msg;
        ul.appendChild(li);
      });
      panel.appendChild(ul);
      var pre = doc.createElement('pre');
      pre.textContent = 'The spec stays machine-readable below:\n' + JSON.stringify(spec, null, 2).slice(0, 4000);
      panel.appendChild(pre);
      figure.appendChild(panel);
      return;
    }
    if (record.warnings.length) {
      var wp = doc.createElement('div');
      wp.className = 'sg-errors sg-warnings';
      wp.textContent = 'sysgram warnings: ' + record.warnings.map(function (p) { return '[' + p.code + '] ' + p.msg; }).join(' · ');
      figure.appendChild(wp);
    }

    // ---- svg canvas ----
    var canvas = doc.createElement('div');
    canvas.className = 'sg-canvas';
    figure.appendChild(canvas);
    var stage = doc.createElement('div');
    stage.className = 'sg-scroll-stage';
    canvas.appendChild(stage);
    var W = Math.ceil(lay.size.w), H = Math.ceil(lay.size.h);
    var svg = svgEl(doc, 'svg', {
      class: 'sg-svg', viewBox: '0 0 ' + W + ' ' + H,
      role: 'img', 'aria-label': (spec.title || '') + (spec.description ? '. ' + spec.description : ''),
      'font-family': FAMILY,
    });
    svg.style.aspectRatio = W + ' / ' + H;
    stage.appendChild(svg);
    var defs = svgEl(doc, 'defs', null, svg);
    var rootG = svgEl(doc, 'g', { class: 'sg-root' }, svg);

    var layers = {
      groups: svgEl(doc, 'g', null, rootG),
      edges: svgEl(doc, 'g', null, rootG),
      nodes: svgEl(doc, 'g', null, rootG),
      overlay: svgEl(doc, 'g', null, rootG),
    };

    // ---- groups (parents first so children draw on top) ----
    var groupsSorted = model.groups.slice().sort(function (a, b) {
      function depth(g) { var d = 0, c = model.parentOf[g.id]; while (c !== undefined) { d++; c = model.parentOf[c]; } return d; }
      return depth(a) - depth(b) || a.index - b.index;
    });
    // sequence family: lifelines behind everything (thin, recessive)
    if (lay.lifelines) {
      lay.lifelines.forEach(function (l) {
        svgEl(doc, 'path', {
          d: 'M' + l.x + ' ' + l.y1 + 'V' + l.y2,
          stroke: 'var(--sg-zoneLine)', 'stroke-width': 1.3, fill: 'none',
        }, layers.groups);
      });
    }
    groupsSorted.forEach(function (g) {
      var b = lay.units[g.id];
      if (!b) return;
      var el = svgEl(doc, 'g', { class: 'sg-group-box', 'data-id': g.id }, layers.groups);
      var stroke = toneStroke(g.tone === 'default' ? 'default' : g.tone);
      if (g.tone === 'default') stroke = 'var(--sg-zoneLine)';
      svgEl(doc, 'rect', {
        x: b.x, y: b.y, width: b.w, height: b.h, rx: 10,
        fill: g.style === 'tint' ? (g.tone === 'accent' ? 'var(--sg-accentTint)' : 'var(--sg-zoneFill)') : 'none',
        stroke: stroke, 'stroke-width': g.style === 'solid' ? 1.4 : 1.2,
        'stroke-dasharray': g.style === 'dashed' ? '7 5' : null,
      }, el);
      var lx = b.x + 14, ly = b.y + 19;
      var label = svgEl(doc, 'text', {
        x: lx, y: ly, 'font-size': FONT.zone.size, 'font-weight': FONT.zone.weight,
        'letter-spacing': FONT.zone.tracking, fill: toneInk(g.tone === 'default' ? 'muted' : g.tone),
      }, el);
      label.textContent = g.label.toUpperCase();
      if (g.sub) {
        var sub = svgEl(doc, 'text', { x: lx, y: ly + 13, 'font-size': FONT.sub.size, fill: 'var(--sg-faint)' }, el);
        sub.textContent = g.sub;
      }
      if (g.desc) { var t = svgEl(doc, 'title', null, el); t.textContent = g.desc; }
    });

    // ---- edges ----
    // paths live under the nodes; labels + step badges live above them (overlay)
    var edgeEls = {};
    lay.edges.forEach(function (edge) {
      var meta = EDGE_KINDS[edge.kind] || EDGE_KINDS.sync;
      var el = svgEl(doc, 'g', { class: 'sg-edge', 'data-id': edge.id, 'data-from': edge.from, 'data-to': edge.to }, layers.edges);
      var lbl = null;
      function labelLayer() {
        if (!lbl) lbl = svgEl(doc, 'g', { class: 'sg-edge sg-elabel', 'data-id': edge.id }, layers.overlay);
        return lbl;
      }
      var dStr = ptsToPath(edge);
      // generous invisible hit target so thin edges are hover/clickable
      var hit = svgEl(doc, 'path', { d: dStr, fill: 'none', stroke: 'transparent', 'stroke-width': 13 }, el);
      hit.style.pointerEvents = 'stroke';
      var path = svgEl(doc, 'path', {
        d: dStr, fill: 'none', stroke: toneStroke(edge.tone),
        'stroke-width': meta.width, 'stroke-dasharray': meta.dash,
        'stroke-linecap': meta.dash ? 'butt' : 'round',
      }, el);
      if (meta.head) {
        var mid = ensureMarkers(doc, defs, edge.tone, meta.head, figId);
        path.setAttribute('marker-end', 'url(#' + mid + ')');
        if (edge.both) path.setAttribute('marker-start', 'url(#' + mid + ')');
      }
      if (edge.kind === 'isolation' && edge.mid) {
        // the "deliberately no flow" mark: a double slash across the line
        var mm = edge.mid, nx2 = -mm.ty, ny2 = mm.tx;
        [-3.5, 3.5].forEach(function (o) {
          svgEl(doc, 'line', {
            x1: mm.x + mm.tx * (o - 2.6) + nx2 * 5.5, y1: mm.y + mm.ty * (o - 2.6) + ny2 * 5.5,
            x2: mm.x + mm.tx * (o + 2.6) - nx2 * 5.5, y2: mm.y + mm.ty * (o + 2.6) - ny2 * 5.5,
            stroke: toneStroke(edge.tone), 'stroke-width': 1.4, 'stroke-linecap': 'round',
          }, el);
        });
      }
      var specEdge = null;
      for (var i = 0; i < model.edges.length; i++) if (model.edges[i].id === edge.id) { specEdge = model.edges[i]; break; }
      var eTip = specEdge ? tipText(specEdge.desc, specEdge.facts) : '';
      if (eTip) { var tt = svgEl(doc, 'title', null, el); tt.textContent = eTip; }
      if (edge.label) {
        var padX = 5, tw = measureText(edge.label.text, FONT.edge);
        var ly2 = edge.label.y - 1;
        svgEl(doc, 'rect', {
          x: edge.label.x - tw / 2 - padX, y: ly2 - FONT.edge.size / 2 - 4,
          width: tw + padX * 2, height: FONT.edge.size + 8, rx: 5,
          fill: 'var(--sg-canvas)', 'fill-opacity': 0.92,
        }, labelLayer());
        var lt = svgEl(doc, 'text', {
          x: edge.label.x, y: ly2 + 3.5, 'text-anchor': 'middle',
          'font-size': FONT.edge.size, 'font-weight': FONT.edge.weight, fill: 'var(--sg-muted)',
        }, labelLayer());
        lt.textContent = edge.label.text;
      }
      if (edge.step) {
        var sp = edge.stepAt;
        svgEl(doc, 'circle', { cx: sp.x, cy: sp.y, r: 8, fill: toneStroke(edge.tone === 'muted' ? 'default' : edge.tone) }, labelLayer());
        var st2 = svgEl(doc, 'text', {
          x: sp.x, y: sp.y + 3, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, fill: 'var(--sg-surface)',
        }, labelLayer());
        st2.textContent = String(edge.step);
      }
      edgeEls[edge.id] = lbl ? [el, lbl] : [el];
    });

    // ---- nodes ----
    model.nodes.forEach(function (n) {
      var b = lay.units[n.id];
      if (!b) return;
      var kind = KINDS[n.kind];
      var s = sizeNode(n);
      var el = svgEl(doc, 'g', { class: 'sg-node', 'data-id': n.id, 'data-kind': n.kind }, layers.nodes);
      var stroke = toneStroke(n.tone);
      var fill = n.tint ? 'var(--sg-accentTint)' : 'var(--sg-nodeFill)';
      var sw = n.tone === 'accent' ? 1.8 : 1.4;
      var shape = nodeShapePath(kind.shape, b.w, b.h);
      var bodyAttrs = {
        fill: fill, stroke: stroke, 'stroke-width': sw,
        'stroke-dasharray': kind.dashed ? '5 4' : null,
      };
      var body;
      if (shape.body) {
        bodyAttrs.d = shape.body;
        body = svgEl(doc, 'path', bodyAttrs, el);
        body.setAttribute('transform', 'translate(' + b.x + ',' + b.y + ')');
      } else {
        bodyAttrs.x = b.x; bodyAttrs.y = b.y; bodyAttrs.width = b.w; bodyAttrs.height = b.h; bodyAttrs.rx = shape.rx;
        body = svgEl(doc, 'rect', bodyAttrs, el);
      }
      (shape.extra || []).forEach(function (d) {
        var ex = svgEl(doc, 'path', { d: d, fill: 'none', stroke: stroke, 'stroke-width': Math.max(1, sw - 0.4) }, el);
        ex.setAttribute('transform', 'translate(' + b.x + ',' + b.y + ')');
      });
      var textTop = (shape.textTop || 0);
      var ix = s.insetX || 0;
      var ty = b.y + L.nodePadY + textTop + FONT.title.size - 1;
      var tx = b.x + L.nodePadX + ix + s.indent;
      if (n.icon.length) {
        n.icon.forEach(function (iid, k2) {
          var slotX = b.x + L.nodePadX + ix + k2 * ICON_SLOT;
          var slotY = ty - 15.5;
          var entry = model.iconCatalog[iid];
          if (entry && entry.src) {
            var img = svgEl(doc, 'image', { x: slotX, y: slotY, width: 20, height: 20, href: entry.src }, el);
            img.addEventListener('error', function () {
              img.remove();
              if (kind.glyph) drawGlyph(doc, el, kind.glyph, slotX + 2, slotY + 3, 1, toneInk(n.tone));
            });
            if (entry.label) { var it2 = svgEl(doc, 'title', null, img); it2.textContent = entry.label; }
          } else if (kind.glyph) {
            drawGlyph(doc, el, kind.glyph, slotX + 2, slotY + 3, 1, toneInk(n.tone));
          }
        });
      } else if (kind.glyph) {
        drawGlyph(doc, el, kind.glyph, b.x + L.nodePadX + ix - 1, ty - 12.5, 1, toneInk(n.tone));
      }
      s.titleLines.forEach(function (line, i2) {
        var t = svgEl(doc, 'text', {
          x: tx, y: ty + i2 * FONT.title.lh,
          'font-size': FONT.title.size, 'font-weight': FONT.title.weight, fill: toneInk(n.tone),
        }, el);
        t.textContent = line;
      });
      var sy = ty + s.titleLines.length * FONT.title.lh - 2;
      s.subLines.forEach(function (line, i2) {
        var t = svgEl(doc, 'text', {
          x: b.x + L.nodePadX + ix, y: sy + (i2 + 1) * FONT.sub.lh - 3,
          'font-size': FONT.sub.size, fill: 'var(--sg-muted)',
        }, el);
        t.textContent = line;
      });
      if (n.badges.length) {
        var bx = b.x + L.nodePadX + ix, byy = b.y + b.h - L.nodePadY - L.badgeH + 3;
        n.badges.forEach(function (bd) {
          var bw = measureText(bd, FONT.badge) + 12;
          svgEl(doc, 'rect', { x: bx, y: byy, width: bw, height: L.badgeH - 3, rx: 7, fill: 'none', stroke: 'var(--sg-mutedLine)', 'stroke-width': 1 }, el);
          var t = svgEl(doc, 'text', {
            x: bx + bw / 2, y: byy + 10, 'text-anchor': 'middle',
            'font-size': FONT.badge.size, 'font-weight': FONT.badge.weight, fill: 'var(--sg-muted)', 'font-family': MONO,
          }, el);
          t.textContent = bd;
          bx += bw + 6;
        });
      }
      var nTip = tipText(n.desc, n.facts);
      if (nTip) { var tt2 = svgEl(doc, 'title', null, el); tt2.textContent = nTip; }
      if (n.href) {
        var a = svgEl(doc, 'a', null, layers.nodes);
        a.setAttribute('href', n.href);
        a.appendChild(el);
      }
    });

    // ---- hover + pinned highlighting (flows, assertions, inspector share one pin) ----
    var neighbors = {};
    model.edges.forEach(function (e) {
      (neighbors[e.from] = neighbors[e.from] || []).push(e);
      (neighbors[e.to] = neighbors[e.to] || []).push(e);
    });
    var pinned = null; // { key, apply }
    function resetFocus() {
      figure.classList.remove('sg-focusing');
      svg.querySelectorAll('.sg-hi').forEach(function (el) { el.classList.remove('sg-hi'); });
    }
    function setFocus(ids, edgeIdList) {
      figure.classList.add('sg-focusing');
      svg.querySelectorAll('.sg-node,.sg-edge,.sg-group-box').forEach(function (el) { el.classList.remove('sg-hi'); });
      ids.forEach(function (idn) {
        var el = svg.querySelector('.sg-node[data-id="' + CSS.escape(idn) + '"],.sg-group-box[data-id="' + CSS.escape(idn) + '"]');
        if (el) el.classList.add('sg-hi');
      });
      edgeIdList.forEach(function (eid) {
        (edgeEls[eid] || []).forEach(function (el) { el.classList.add('sg-hi'); });
      });
    }
    function clearFocus() {
      if (pinned) pinned.apply();
      else resetFocus();
    }
    function syncChips() {
      figure.querySelectorAll('[data-sg-chip]').forEach(function (b) {
        b.setAttribute('aria-pressed', pinned && pinned.key === b.getAttribute('data-sg-chip') ? 'true' : 'false');
      });
    }
    function setPinned(key, apply) {
      pinned = { key: key, apply: apply };
      apply();
      syncChips();
    }
    function unpin() {
      pinned = null;
      resetFocus();
      syncChips();
      hideInspector();
    }
    function togglePinned(key, apply) {
      if (pinned && pinned.key === key) unpin();
      else { hideInspector(); setPinned(key, apply); }
    }
    function neighborhoodFocus(idn) {
      var es = neighbors[idn] || [];
      var ids = [idn];
      es.forEach(function (e2) { ids.push(e2.from, e2.to); });
      setFocus(ids, es.map(function (e2) { return e2.id; }));
    }
    svg.addEventListener('pointerover', function (ev) {
      var g = ev.target.closest('.sg-node,.sg-group-box');
      if (g) { neighborhoodFocus(g.getAttribute('data-id')); return; }
      var eg = ev.target.closest('.sg-edge');
      if (eg) {
        var eid = eg.getAttribute('data-id');
        var e2 = null;
        for (var i = 0; i < model.edges.length; i++) if (model.edges[i].id === eid) { e2 = model.edges[i]; break; }
        if (e2) setFocus([e2.from, e2.to], [eid]);
      }
    });
    svg.addEventListener('pointerout', function (ev) {
      if (ev.target.closest('.sg-node,.sg-group-box,.sg-edge')) clearFocus();
    });

    // ---- inspector (click a node, group, or edge) ----
    var inspectEl = doc.createElement('div');
    inspectEl.className = 'sg-inspect';
    canvas.insertAdjacentElement('afterend', inspectEl);
    function hideInspector() {
      inspectEl.classList.remove('sg-open');
      inspectEl.innerHTML = '';
    }
    function labelOf(idn) { return model.byId[idn] ? model.byId[idn].label : idn; }
    function iHead(titleTxt, kindTxt) {
      var h = doc.createElement('div');
      h.className = 'sg-ihead';
      var st = doc.createElement('strong');
      st.textContent = titleTxt;
      h.appendChild(st);
      var kd = doc.createElement('span');
      kd.className = 'sg-ikind';
      kd.textContent = kindTxt;
      h.appendChild(kd);
      var x = doc.createElement('button');
      x.type = 'button';
      x.className = 'sg-x';
      x.textContent = '×';
      x.title = 'Close';
      x.addEventListener('click', unpin);
      h.appendChild(x);
      inspectEl.appendChild(h);
    }
    function iDesc(txt) {
      if (!txt) return;
      var p = doc.createElement('p');
      p.className = 'sg-idesc';
      p.textContent = txt;
      inspectEl.appendChild(p);
    }
    function iFacts(facts) {
      if (!facts) return;
      var keys = Object.keys(facts);
      if (!keys.length) return;
      var grid = doc.createElement('div');
      grid.className = 'sg-ifacts';
      keys.forEach(function (k) {
        var fk = doc.createElement('span');
        fk.className = 'fk';
        fk.textContent = k;
        grid.appendChild(fk);
        var fv = doc.createElement('span');
        fv.textContent = facts[k];
        grid.appendChild(fv);
      });
      inspectEl.appendChild(grid);
    }
    function iConns(idn) {
      var es = neighbors[idn] || [];
      if (!es.length) return;
      var ul = doc.createElement('ul');
      ul.className = 'sg-iconns';
      es.forEach(function (e2) {
        var li = doc.createElement('li');
        var out = e2.from === idn;
        var other = out ? e2.to : e2.from;
        var arrow = e2.both ? '↔' : out ? '→' : '←';
        li.appendChild(doc.createTextNode(arrow + ' '));
        var b = doc.createElement('b');
        b.textContent = labelOf(other);
        li.appendChild(b);
        li.appendChild(doc.createTextNode(' · ' + e2.kind + (e2.label ? ' · “' + e2.label + '”' : '')));
        ul.appendChild(li);
      });
      inspectEl.appendChild(ul);
    }
    function inspect(type, idn) {
      var key = 'sel:' + type + ':' + idn;
      if (pinned && pinned.key === key) { unpin(); return; }
      inspectEl.innerHTML = '';
      if (type === 'edge') {
        var e2 = null;
        for (var i = 0; i < model.edges.length; i++) if (model.edges[i].id === idn) { e2 = model.edges[i]; break; }
        if (!e2) return;
        iHead(labelOf(e2.from) + ' ' + (e2.both ? '↔' : '→') + ' ' + labelOf(e2.to), e2.kind);
        iDesc((e2.label ? '“' + e2.label + '” — ' : '') + (e2.desc || ''));
        iFacts(e2.facts);
        inspectEl.classList.add('sg-open');
        setPinned(key, function () { setFocus([e2.from, e2.to], [e2.id]); });
        return;
      }
      var u = model.byId[idn];
      if (!u) return;
      iHead(u.label, u.type === 'group' ? (u.kind + ' · ' + u.children.length + ' members') : u.kind);
      iDesc(u.desc);
      iFacts(u.facts || null);
      iConns(idn);
      inspectEl.classList.add('sg-open');
      setPinned(key, function () { neighborhoodFocus(idn); });
    }
    svg.addEventListener('click', function (ev) {
      if (panMoved) { panMoved = false; return; }
      if (ev.target.closest('a')) return; // linked nodes keep their navigation
      var g = ev.target.closest('.sg-node,.sg-group-box,.sg-edge');
      if (!g) {
        if (pinned && pinned.key.indexOf('sel:') === 0) unpin();
        return;
      }
      var type = g.classList.contains('sg-node') ? 'node' : g.classList.contains('sg-group-box') ? 'group' : 'edge';
      inspect(type, g.getAttribute('data-id'));
    });

    // ---- flows ----
    if (model.flows.length) {
      var flowsBar = doc.createElement('div');
      flowsBar.className = 'sg-flows';
      var lbl = doc.createElement('span');
      lbl.className = 'sg-li';
      lbl.style.cssText = 'font-size:10.5px;color:var(--sg-faint);align-self:center';
      lbl.textContent = 'flows:';
      flowsBar.appendChild(lbl);
      model.flows.forEach(function (f) {
        var btn = doc.createElement('button');
        btn.type = 'button';
        btn.textContent = f.label;
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('data-sg-chip', 'flow:' + f.id);
        if (f.desc) btn.title = f.desc;
        btn.addEventListener('click', function () {
          togglePinned('flow:' + f.id, function () {
            var eids = f.steps.filter(function (sid) { return edgeEls[sid]; });
            var ids = [];
            model.edges.forEach(function (e2) {
              if (eids.indexOf(e2.id) >= 0) ids.push(e2.from, e2.to);
            });
            setFocus(ids, eids);
          });
        });
        flowsBar.appendChild(btn);
      });
      figure.appendChild(flowsBar);
    }

    // ---- assertions ----
    if (model.assertions.length) {
      var ap = doc.createElement('div');
      ap.className = 'sg-asserts';
      var ah = doc.createElement('span');
      ah.className = 'sg-asserts-h';
      ah.textContent = 'assertions — true regardless of arrangement';
      ap.appendChild(ah);
      model.assertions.forEach(function (a) {
        var li = doc.createElement('button');
        li.type = 'button';
        li.className = 'sg-assert';
        li.textContent = a.text;
        if (a.rule && a.rule.kind) {
          var chk = doc.createElement('span');
          chk.className = 'sg-assert-check';
          chk.textContent = '✓ machine-checked';
          chk.title = 'validate() proves this rule against the edge graph: ' + a.rule.kind;
          li.appendChild(chk);
        }
        if (a.refs.length) {
          li.setAttribute('data-sg-chip', 'assert:' + a.id);
          li.setAttribute('aria-pressed', 'false');
          li.addEventListener('click', function () {
            togglePinned('assert:' + a.id, function () {
              var eids = [], ids = [];
              a.refs.forEach(function (r) {
                if (edgeEls[r]) eids.push(r);
                else ids.push(r);
              });
              model.edges.forEach(function (e2) {
                if (eids.indexOf(e2.id) >= 0) ids.push(e2.from, e2.to);
              });
              setFocus(ids, eids);
            });
          });
        } else {
          li.disabled = true;
        }
        ap.appendChild(li);
      });
      figure.appendChild(ap);
    }

    // ---- legend ----
    var wantLegend = spec.legend === true || (spec.legend === undefined || spec.legend === 'auto');
    var usedKinds = [], usedEdgeKinds = [];
    model.nodes.forEach(function (n) { if (usedKinds.indexOf(n.kind) < 0) usedKinds.push(n.kind); });
    model.edges.forEach(function (e) { if (usedEdgeKinds.indexOf(e.kind) < 0) usedEdgeKinds.push(e.kind); });
    var auto = spec.legend === undefined || spec.legend === 'auto';
    if (spec.legend !== false && (!auto || usedKinds.length + usedEdgeKinds.length > 2) && wantLegend) {
      var legend = doc.createElement('div');
      legend.className = 'sg-legend';
      usedKinds.forEach(function (k) {
        var item = doc.createElement('span');
        item.className = 'sg-li';
        var ic = svgEl(doc, 'svg', { width: 16, height: 16, viewBox: '0 0 16 16' });
        if (KINDS[k].glyph) drawGlyph(doc, ic, KINDS[k].glyph, 0, 0, 1, 'var(--sg-muted)');
        else if (KINDS[k].shape === 'cylinder') {
          svgEl(doc, 'path', { d: 'M3 5a5 2.4 0 0 1 10 0v6a5 2.4 0 0 1-10 0zM3 5a5 2.4 0 0 0 10 0', fill: 'none', stroke: 'var(--sg-muted)', 'stroke-width': 1.4 }, ic);
        } else {
          svgEl(doc, 'rect', { x: 2.5, y: 3.5, width: 11, height: 9, rx: 2.5, fill: 'none', stroke: 'var(--sg-muted)', 'stroke-width': 1.4 }, ic);
        }
        item.appendChild(ic);
        item.appendChild(doc.createTextNode(KINDS[k].label));
        legend.appendChild(item);
      });
      usedEdgeKinds.forEach(function (k) {
        var meta = EDGE_KINDS[k];
        var item = doc.createElement('span');
        item.className = 'sg-li';
        var ic = svgEl(doc, 'svg', { width: 26, height: 10, viewBox: '0 0 26 10' });
        svgEl(doc, 'path', {
          d: 'M1 5H' + (meta.head ? 19 : 25), fill: 'none',
          stroke: toneStroke(meta.tone), 'stroke-width': Math.min(meta.width, 2),
          'stroke-dasharray': meta.dash,
        }, ic);
        if (meta.head === 'tri') svgEl(doc, 'path', { d: 'M19 1.5L25 5L19 8.5Z', fill: toneStroke(meta.tone) }, ic);
        if (meta.head === 'vee') svgEl(doc, 'path', { d: 'M19 1.5L25 5L19 8.5', fill: 'none', stroke: toneStroke(meta.tone), 'stroke-width': 1.4 }, ic);
        item.appendChild(ic);
        item.appendChild(doc.createTextNode(meta.label));
        legend.appendChild(item);
      });
      figure.appendChild(legend);
    }

    // ---- caption ----
    if (spec.caption) {
      var cap = doc.createElement('figcaption');
      cap.textContent = spec.caption;
      figure.appendChild(cap);
    }

    // ---- pan / zoom ----
    var vb = { x: 0, y: 0, w: W, h: H };
    var expandedZoom = 1;
    var expandedFit = null;
    function applyVB() { svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); }
    function resetExpandedSizing() {
      expandedZoom = 1;
      expandedFit = null;
      stage.style.removeProperty('width');
      stage.style.removeProperty('height');
      svg.style.removeProperty('width');
      svg.style.removeProperty('height');
      canvas.scrollLeft = 0;
      canvas.scrollTop = 0;
    }
    function measureExpandedFit() {
      var cw = canvas.clientWidth;
      var ch = canvas.clientHeight;
      var scale = Math.min(cw / W, ch / H);
      expandedFit = {
        canvasW: cw, canvasH: ch,
        diagramW: W * scale, diagramH: H * scale,
      };
    }
    function setExpandedZoom(next, clientX, clientY) {
      if (!expandedFit) measureExpandedFit();
      next = Math.max(0.25, Math.min(8, next));

      // Keep the point beneath the pointer (or the viewport center for toolbar
      // zoom) stationary while the native scrollable extent changes.
      var canvasRect = canvas.getBoundingClientRect();
      var svgRect = svg.getBoundingClientRect();
      var viewportX = clientX === undefined ? canvasRect.width / 2 : clientX - canvasRect.left;
      var viewportY = clientY === undefined ? canvasRect.height / 2 : clientY - canvasRect.top;
      var relX = svgRect.width ? (canvasRect.left + viewportX - svgRect.left) / svgRect.width : 0.5;
      var relY = svgRect.height ? (canvasRect.top + viewportY - svgRect.top) / svgRect.height : 0.5;

      expandedZoom = next;
      var zoomedW = expandedFit.diagramW * expandedZoom;
      var zoomedH = expandedFit.diagramH * expandedZoom;
      stage.style.width = zoomedW > expandedFit.canvasW ? zoomedW + 'px' : '100%';
      stage.style.height = zoomedH > expandedFit.canvasH ? zoomedH + 'px' : '100%';
      svg.style.width = zoomedW + 'px';
      svg.style.height = zoomedH + 'px';

      var nextSvgRect = svg.getBoundingClientRect();
      canvas.scrollLeft += nextSvgRect.left + relX * nextSvgRect.width - (canvasRect.left + viewportX);
      canvas.scrollTop += nextSvgRect.top + relY * nextSvgRect.height - (canvasRect.top + viewportY);
    }
    function zoom(f, cx, cy) {
      if (isFull()) {
        setExpandedZoom(expandedZoom / f, cx, cy);
        return;
      }
      var nw = Math.max(W / 8, Math.min(W * 4, vb.w * f));
      var k = nw / vb.w;
      cx = cx === undefined ? vb.x + vb.w / 2 : cx;
      cy = cy === undefined ? vb.y + vb.h / 2 : cy;
      vb.x = cx - (cx - vb.x) * k;
      vb.y = cy - (cy - vb.y) * k;
      vb.w = nw;
      vb.h = vb.h * k;
      applyVB();
    }
    function fit() {
      vb = { x: 0, y: 0, w: W, h: H };
      applyVB();
      if (!isFull()) {
        resetExpandedSizing();
        return;
      }
      stage.style.width = '100%';
      stage.style.height = '100%';
      svg.style.removeProperty('width');
      svg.style.removeProperty('height');
      canvas.scrollLeft = 0;
      canvas.scrollTop = 0;
      expandedZoom = 1;
      measureExpandedFit();
      setExpandedZoom(1);
    }
    var pan = null;
    var panMoved = false;
    svg.addEventListener('pointerdown', function (ev) {
      // pans start on the background only, and the pointer is captured lazily
      // (capturing up front retargets the click and breaks the inspector)
      if (ev.target.closest('a,.sg-node,.sg-edge')) return;
      pan = {
        x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y,
        sx: canvas.scrollLeft, sy: canvas.scrollTop,
        id: ev.pointerId, captured: false,
      };
      panMoved = false;
    });
    svg.addEventListener('pointermove', function (ev) {
      if (!pan) return;
      if (!panMoved && Math.abs(ev.clientX - pan.x) + Math.abs(ev.clientY - pan.y) > 4) {
        panMoved = true;
        pan.captured = true;
        svg.classList.add('sg-panning');
        svg.setPointerCapture(pan.id);
      }
      if (!panMoved) return;
      if (isFull()) {
        canvas.scrollLeft = pan.sx - (ev.clientX - pan.x);
        canvas.scrollTop = pan.sy - (ev.clientY - pan.y);
        return;
      }
      var r = svg.getBoundingClientRect();
      vb.x = pan.vx - (ev.clientX - pan.x) * (vb.w / r.width);
      vb.y = pan.vy - (ev.clientY - pan.y) * (vb.h / r.height);
      applyVB();
    });
    ['pointerup', 'pointercancel'].forEach(function (evn) {
      svg.addEventListener(evn, function () { pan = null; svg.classList.remove('sg-panning'); });
    });
    svg.addEventListener('wheel', function (ev) {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      if (isFull()) {
        zoom(ev.deltaY > 0 ? 1.15 : 1 / 1.15, ev.clientX, ev.clientY);
        return;
      }
      var r = svg.getBoundingClientRect();
      var cx = vb.x + (ev.clientX - r.left) / r.width * vb.w;
      var cy = vb.y + (ev.clientY - r.top) / r.height * vb.h;
      zoom(ev.deltaY > 0 ? 1.15 : 1 / 1.15, cx, cy);
    }, { passive: false });

    function controlGroup(className, label) {
      var group = doc.createElement('div');
      group.className = 'sg-control-group ' + className;
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', label);
      btns.appendChild(group);
      return group;
    }
    function mkBtn(text, titleTxt, fn, parent) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.title = titleTxt;
      var flashTimer;
      b.addEventListener('click', function (ev) {
        if (flashTimer) doc.defaultView.clearTimeout(flashTimer);
        b.classList.add('sg-control-flash');
        flashTimer = doc.defaultView.setTimeout(function () {
          b.classList.remove('sg-control-flash');
          flashTimer = null;
        }, 220);
        fn(ev);
      });
      (parent || btns).appendChild(b);
      return b;
    }
    var viewControls = controlGroup('sg-view-controls', 'View controls');
    mkBtn('−', 'Zoom out', function () { zoom(1.25); }, viewControls);
    mkBtn('+', 'Zoom in', function () { zoom(1 / 1.25); }, viewControls);
    mkBtn('fit', 'Reset view', fit, viewControls);
    var fullBtn;
    function isFull() {
      return figure.classList.contains('sg-expanded');
    }
    function updateFullButton() {
      var active = isFull();
      fullBtn.replaceChildren();
      var fullIcon = svgEl(doc, 'svg', {
        viewBox: '0 0 14 14', 'aria-hidden': 'true', focusable: 'false',
      }, fullBtn);
      svgEl(doc, 'path', {
        d: active ? 'M1.5 5h3.5V1.5M9 1.5V5h3.5M12.5 9H9v3.5M5 12.5V9H1.5' :
          'M5 1.5H1.5V5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9',
        fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }, fullIcon);
      fullBtn.title = active ? 'Exit expanded view' : 'Expand diagram to fill page';
      fullBtn.setAttribute('aria-label', fullBtn.title);
      fullBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    function enterFull() {
      portalExpandedFigure(doc, figure);
      figure.classList.add('sg-expanded');
      fit();
      updateFullButton();
    }
    function exitFull() {
      restoreExpandedFigure(figure);
      figure.classList.remove('sg-expanded');
      fit();
      updateFullButton();
    }
    function toggleFull() {
      if (isFull()) exitFull();
      else enterFull();
    }
    fullBtn = mkBtn('', 'Expand diagram to fill page', toggleFull, viewControls);
    fullBtn.className = 'sg-full';
    updateFullButton();
    if (isFull()) fit();

    // render() may run again when the layout viewing lens changes. The figure
    // keeps its sg-expanded class across that render; keep one Escape listener.
    if (figure._sysgramExpandedKeydown) doc.removeEventListener('keydown', figure._sysgramExpandedKeydown);
    var expandedKeydown = function (ev) {
      if (ev.key === 'Escape' && figure.classList.contains('sg-expanded')) exitFull();
    };
    figure._sysgramExpandedKeydown = expandedKeydown;
    doc.addEventListener('keydown', expandedKeydown);

    if (figure._sysgramExpandedResize) {
      doc.defaultView.removeEventListener('resize', figure._sysgramExpandedResize);
    }
    var expandedResize = function () {
      if (!isFull()) return;
      var keepZoom = expandedZoom;
      stage.style.width = '100%';
      stage.style.height = '100%';
      canvas.scrollLeft = 0;
      canvas.scrollTop = 0;
      measureExpandedFit();
      setExpandedZoom(keepZoom);
    };
    figure._sysgramExpandedResize = expandedResize;
    doc.defaultView.addEventListener('resize', expandedResize);

    var fileControls = controlGroup('sg-file-controls', 'Diagram files');
    mkBtn('svg', 'Download standalone SVG', function () { downloadSVG(doc, figure, svg, spec, W, H); }, fileControls);
    // copy the spec; over file:// the async Clipboard API is unavailable, so
    // fall back to the legacy copy command, and if no copy path works show the
    // JSON in a selectable panel — the click always visibly does something
    var jsonPanel = null;
    function jsonPanelOpen(text) {
      if (!jsonPanel) {
        jsonPanel = doc.createElement('div');
        jsonPanel.className = 'sg-json';
        var pre = doc.createElement('pre');
        jsonPanel.appendChild(pre);
        figure.appendChild(jsonPanel);
      }
      jsonPanel.firstChild.textContent = text;
      jsonPanel.style.display = 'block';
      var selctn = doc.defaultView.getSelection();
      var range = doc.createRange();
      range.selectNodeContents(jsonPanel.firstChild);
      selctn.removeAllRanges();
      selctn.addRange(range);
    }
    // The spec is not a separate file — it lives in this page's
    // <script type="application/sysgram+json"> block. The button materializes
    // it as an in-memory .json and opens it in a new tab (read it, copy it, or
    // File → Save it); if the popup is blocked, the inline panel shows it.
    var jsonURL = null;
    mkBtn('json', 'Open the spec JSON in a new tab', function () {
      if (jsonPanel && jsonPanel.style.display === 'block') {
        jsonPanel.style.display = 'none';
        return;
      }
      var text = JSON.stringify(spec, null, 2);
      var w = doc.defaultView;
      if (!jsonURL) jsonURL = w.URL.createObjectURL(new w.Blob([text], { type: 'application/json' }));
      var opened = null;
      try { opened = w.open(jsonURL, '_blank'); } catch (e2) { opened = null; }
      if (!opened) jsonPanelOpen(text);
    }, fileControls);
    if (record.layoutPicker && spec) {
      // viewing lens, opt-in per page: previews the other layout families
      // without touching the JSON block (which stays the source of truth);
      // tree/radial/sequence previews flatten groups/bands
      var authored = ['tree', 'radial', 'sequence'].indexOf(spec.layout) >= 0 ? spec.layout : 'layered';
      var sel = doc.createElement('select');
      sel.className = 'sg-layoutsel';
      sel.title = 'Layout viewing lens — the JSON block keeps the authored layout ("' + authored +
        '"). tree/radial/sequence previews flatten groups/bands.';
      ['layered', 'tree', 'radial', 'sequence'].forEach(function (fam) {
        var o = doc.createElement('option');
        o.value = fam;
        o.textContent = fam === authored ? fam + ' •' : fam;
        sel.appendChild(o);
      });
      sel.value = record.viewLayout || authored;
      sel.addEventListener('change', function () {
        render(figure, spec, { theme: record.theme, layoutPicker: true, viewLayout: sel.value });
      });
      var layoutControls = controlGroup('sg-layout-controls', 'Diagram layout');
      layoutControls.appendChild(sel);
    }

    record.svg = svg;
  }

  function downloadSVG(doc, figure, svg, spec, W, H) {
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('width', W);
    clone.setAttribute('height', H);
    clone.removeAttribute('class');
    clone.removeAttribute('style');
    // resolve CSS variables into a concrete style block
    var cs = doc.defaultView.getComputedStyle(figure);
    var style = doc.createElementNS(SVG_NS, 'style');
    var rules = ':root{}';
    var varLine = '';
    TOKEN_NAMES.forEach(function (k) {
      var v = cs.getPropertyValue('--sg-' + k).trim();
      if (v) varLine += '--sg-' + k + ':' + v + ';';
    });
    style.textContent = 'svg{' + varLine + 'background:' + cs.getPropertyValue('--sg-canvas').trim() + ';}';
    clone.insertBefore(style, clone.firstChild);
    var blob = new doc.defaultView.Blob([new doc.defaultView.XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    var a = doc.createElement('a');
    a.href = doc.defaultView.URL.createObjectURL(blob);
    a.download = (spec.id || 'diagram') + '.svg';
    doc.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ================================================================
   * §8 Registry + auto-init
   * ============================================================== */

  var registry = {};

  function render(target, specOrText, opts) {
    var doc = target.ownerDocument;
    installCanvasMeasurer(doc);
    injectCSS(doc);
    var spec = specOrText, parseError = null;
    if (typeof specOrText === 'string') {
      var p = parseSpec(specOrText);
      if (p.ok) spec = p.spec;
      else { spec = null; parseError = p.error; }
    }
    var record = {
      spec: spec, theme: (opts && opts.theme) || null,
      layoutPicker: !!(opts && opts.layoutPicker),
      viewLayout: (opts && opts.viewLayout) || null,
      errors: [], warnings: [], model: null, layout: null, svg: null,
    };
    if (parseError) {
      record.errors.push({ code: 'parse-error', msg: parseError });
      target.innerHTML = '';
      target.className = 'sysgram';
      var panel = doc.createElement('div');
      panel.className = 'sg-errors';
      panel.textContent = 'sysgram: spec is not valid JSON — ' + parseError;
      target.appendChild(panel);
      registry['(parse-error)'] = record;
      return record;
    }
    // The picker renders a VIEW of the spec: same JSON as source of truth,
    // different family. Every non-layered view flattens containment; this also
    // lets an authored sequence retain groups/bands for its layered lens.
    var specView = spec;
    var authoredFam = spec && ['tree', 'radial', 'sequence'].indexOf(spec.layout) >= 0 ? spec.layout : 'layered';
    var selectedFam = record.viewLayout || authoredFam;
    if (spec && record.viewLayout && record.viewLayout !== authoredFam) {
      specView = JSON.parse(JSON.stringify(spec));
      specView.layout = record.viewLayout;
    }
    if (spec && selectedFam !== 'layered' &&
      (selectedFam !== authoredFam || selectedFam === 'sequence')) {
      specView = flattenContainment(specView);
    }
    var v = validate(specView);
    record.errors = v.errors;
    record.warnings = v.warnings;
    record.model = normalize(specView);
    if (!v.errors.length) record.layout = layout(specView);
    renderInto(doc, target, record);
    if (spec && spec.id) registry[spec.id] = record;
    v.errors.forEach(function (p) { console.error('[sysgram:' + (spec && spec.id) + '] ' + p.code + ': ' + p.msg); });
    v.warnings.forEach(function (p) { console.warn('[sysgram:' + (spec && spec.id) + '] ' + p.code + ': ' + p.msg); });
    return record;
  }

  function autoInit(doc) {
    function boot() {
      var scripts = doc.querySelectorAll('script[type="application/sysgram+json"], script[type="application/json"][data-sysgram]');
      scripts.forEach(function (sc) {
        if (sc.getAttribute('data-sysgram-done')) return;
        sc.setAttribute('data-sysgram-done', '1');
        var fig = doc.createElement('figure');
        sc.parentNode.insertBefore(fig, sc.nextSibling);
        render(fig, sc.textContent, {
          theme: sc.getAttribute('data-sysgram-theme'),
          layoutPicker: sc.hasAttribute('data-sysgram-layout-picker'),
        });
      });
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return {
    version: VERSION,
    KINDS: KINDS,
    EDGE_KINDS: EDGE_KINDS,
    parseSpec: parseSpec,
    validate: validate,
    normalize: normalize,
    layout: layout,
    audit: audit,
    // describe(spec) in Node; describe("diagram-id") in the browser after render.
    describe: function (specOrId) {
      if (typeof specOrId === 'string') return registry[specOrId] ? describe(registry[specOrId].spec) : null;
      return describe(specOrId);
    },
    render: render,
    get: function (id) { return registry[id]; },
    toSVG: function (id) {
      var r = registry[id];
      return r && r.svg ? new XMLSerializer().serializeToString(r.svg) : null;
    },
    diagrams: registry,
    _autoInit: autoInit,
  };
});
