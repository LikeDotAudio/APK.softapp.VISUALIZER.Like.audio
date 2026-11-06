// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * READ THE CONTENTS, NOT A DATASET
 *
 * The viewers know nothing about samples, parts, recordings or anything else a
 * host might hold. What they are handed is an array of objects, and this file
 * is the whole of what they understand about it: every leaf of every record
 * (nested objects read as dotted paths, `a.b.c`), and what kind of thing each
 * leaf is, judged from the values themselves.
 *
 *   number    finite numbers (or strings that all parse as one)
 *   time      ISO-8601 date strings; epoch numbers only when a hint says so
 *   category  a small set of repeated values (booleans are one)
 *   vector    equal-length arrays of numbers — an embedding
 *   id        a value unique to each record, named like an identifier
 *   label     a short string unique (or nearly) to each record: its name
 *   color     CSS colour strings
 *   text      anything else: long or unique strings nothing is plotted by
 *
 * A list of objects inside a record (ports, tracks, readings) is read as
 * `list.length` and, for each number its items carry, `list[].key Σ`.
 *
 * A host may say what it knows (`schema.fields[name].kind` and friends); a hint
 * always wins over a guess. Nothing here is told what any field MEANS — that is
 * the host's, and it says it with a hint or not at all.
 *
 * A vector also yields derived number fields, so an embedding can be put on an
 * axis: its components when it is short (≤ 6), and its first three principal
 * components (`name · PC1`…) when it has three or more dimensions.
 */
import { principalComponents } from './pca.mjs';

export const KINDS = ['number', 'category', 'time', 'vector', 'id', 'label', 'color', 'text'];

/** A field kind each role can be drawn by, in the order a viewer prefers them. */
export const AXIS_KINDS = ['number', 'time', 'category'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const CSS_COLOR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?)\([^)]*\))$/i;
const ID_NAME = /(?:^|[._\s-])(?:id|uuid|guid|key|serial|mac|sku|code)$/i;
const LABEL_NAME = /(?:^|[._\s-])(?:name|label|title|caption)$/i;
const MAX_DEPTH = 5;
/** A string field with more distinct values than this, and few repeats, is a label or text, not a category. */
const CATEGORY_MAX = 512;

/** Every leaf of one record as [path, value]. Arrays of numbers are leaves (vectors), arrays of strings are joined, arrays of objects give a count and per-key totals. */
export function flatten(record, prefix = '', depth = 0, out = {}) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return out;
  for (const [k, v] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) { out[path] = null; continue; }
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => typeof x === 'number')) out[path] = v;
      else if (v.length && v.every((x) => typeof x === 'string')) out[path] = v.join(', ');
      else if (v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
        // A list of things (ports, tracks, readings): how many, and the total of each number they carry.
        out[`${path}.length`] = v.length;
        const sums = {};
        for (const item of v) for (const [ik, iv] of Object.entries(item)) if (typeof iv === 'number' && Number.isFinite(iv)) sums[ik] = (sums[ik] ?? 0) + iv;
        for (const [ik, total] of Object.entries(sums)) out[`${path}[].${ik} Σ`] = total;
      }
      continue;
    }
    if (typeof v === 'object') {
      if (depth < MAX_DEPTH) flatten(v, path, depth + 1, out);
      continue;
    }
    out[path] = v;
  }
  return out;
}

const isNumericString = (s) => typeof s === 'string' && s.trim() !== '' && Number.isFinite(Number(s));

/** Decide one field's kind from its values (nulls already removed). */
export function judgeKind(name, values, n) {
  if (!values.length) return 'text';
  let nums = 0, numStrs = 0, bools = 0, strs = 0, vecs = 0, iso = 0, colors = 0;
  for (const v of values) {
    if (typeof v === 'number') { if (Number.isFinite(v)) nums++; }
    else if (typeof v === 'boolean') bools++;
    else if (Array.isArray(v)) vecs++;
    else if (typeof v === 'string') {
      strs++;
      if (isNumericString(v)) numStrs++;
      else if (ISO_DATE.test(v)) iso++;
      else if (CSS_COLOR.test(v.trim())) colors++;
    }
  }
  const m = values.length;
  const most = (k) => k >= m * 0.9;
  if (most(vecs)) return 'vector';
  if (most(bools)) return 'category';
  const distinct = new Set(values.map((v) => (Array.isArray(v) ? v.join(',') : String(v)))).size;
  const unique = distinct === m && m > 1;
  if (most(nums + numStrs)) {
    if (unique && ID_NAME.test(name) && values.every((v) => Number.isInteger(Number(v)))) return 'id';
    return 'number';
  }
  if (most(iso)) return 'time';
  if (most(colors)) return 'color';
  if (most(strs + bools)) {
    if (unique || distinct > Math.max(CATEGORY_MAX, m * 0.9)) {
      if (ID_NAME.test(name)) return 'id';
      if (LABEL_NAME.test(name)) return 'label';
      const avg = values.reduce((a, v) => a + String(v).length, 0) / m;
      if (unique && avg <= 40 && values.every((v) => !/\s/.test(String(v)))) return 'id';
      return avg <= 64 ? 'label' : 'text';
    }
    if (distinct <= CATEGORY_MAX || distinct <= m * 0.5) return 'category';
    return LABEL_NAME.test(name) ? 'label' : 'text';
  }
  return 'text';
}

const toTime = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : NaN;
};

/** One column, converted to what its kind reads as. */
function column(raw, kind) {
  switch (kind) {
    case 'number': return raw.map((v) => (v === null || v === undefined || v === '' ? NaN : Number(v))).map((v) => (Number.isFinite(v) ? v : NaN));
    case 'time': return raw.map((v) => (v === null || v === undefined ? NaN : toTime(v)));
    case 'vector': return raw.map((v) => (Array.isArray(v) ? v : null));
    case 'category': return raw.map((v) => (v === null || v === undefined || v === '' ? null : String(v)));
    default: return raw.map((v) => (v === null || v === undefined ? null : String(v)));
  }
}

function numericSummary(col) {
  let mn = Infinity, mx = -Infinity, count = 0;
  const seen = new Set();
  for (const v of col) {
    if (!Number.isFinite(v)) continue;
    count++;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    if (seen.size <= 4096) seen.add(v);
  }
  // How much of the range the middle 96% fills: near 0 when one outlier stretches the axis.
  let fill = 1;
  if (count > 10 && mx > mn) {
    const sorted = col.filter(Number.isFinite).sort((a, b) => a - b);
    const q = (p) => sorted[Math.round((sorted.length - 1) * p)];
    fill = (q(0.98) - q(0.02)) / (mx - mn);
  }
  return { count, distinct: seen.size, min: count ? mn : undefined, max: count ? mx : undefined, fill };
}

/**
 * The model every viewer draws from.
 *
 *   model.n                  records
 *   model.fields             [{ name, kind, label, unit, count, distinct, min?, max?, dims?, order?, colors?, hidden?, derived? }]
 *   model.field(name)        that entry, or undefined
 *   model.col(name)          its column: numbers (NaN = missing), strings (null = missing) or arrays
 *   model.idOf(i) / labelOf(i)
 *   model.records            what was sent, untouched (for the hover card and the Analyzer's record view)
 */
export function buildModel(records, hint = {}) {
  const recs = Array.isArray(records) ? records.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) : [];
  const n = recs.length;
  const rows = recs.map((r) => flatten(r));
  const names = [];
  const seen = new Set();
  for (const row of rows) for (const k of Object.keys(row)) if (!seen.has(k)) { seen.add(k); names.push(k); }
  const hints = hint.fields ?? {};
  const fields = [];
  const cols = new Map();

  for (const name of names) {
    const raw = rows.map((r) => (name in r ? r[name] : null));
    const present = raw.filter((v) => v !== null && v !== undefined && v !== '');
    const h = hints[name] ?? {};
    // A host that orders or colours a field's values has said it is a category.
    const kind = KINDS.includes(h.kind) ? h.kind : h.order || h.colors ? 'category' : judgeKind(name, present, n);
    const col = column(raw, kind);
    cols.set(name, col);
    const f = { name, kind, label: h.label ?? name };
    if (h.unit) f.unit = h.unit;
    if (h.hidden) f.hidden = true;
    if (h.group) f.group = String(h.group);
    if (kind === 'number' || kind === 'time') Object.assign(f, numericSummary(col));
    else if (kind === 'vector') {
      const lens = col.filter(Boolean).map((v) => v.length);
      const dims = mode(lens);
      f.count = lens.filter((l) => l === dims).length;
      f.dims = dims;
    } else {
      const vals = col.filter((v) => v !== null);
      f.count = vals.length;
      f.distinct = new Set(vals).size;
    }
    if (kind === 'category') {
      const counts = new Map();
      for (const v of col) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
      const listed = (h.order ?? []).map(String).filter((v) => counts.has(v));
      const rest = [...counts.keys()].filter((v) => !listed.includes(v)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      f.order = [...listed, ...rest];
      if (h.order) f.declaredOrder = h.order.map(String);
      f.counts = Object.fromEntries(counts);
      if (h.colors) f.colors = { ...h.colors };
    }
    fields.push(f);
  }

  // Derived number fields from vectors: components when short, principal components when long.
  for (const f of fields.filter((x) => x.kind === 'vector' && x.dims >= 2)) {
    const col = cols.get(f.name);
    if (f.dims <= 6) {
      for (let d = 0; d < f.dims; d++) {
        const name = `${f.name}[${d}]`;
        const c = col.map((v) => (v && v.length === f.dims && Number.isFinite(v[d]) ? v[d] : NaN));
        cols.set(name, c);
        fields.push({ name, kind: 'number', label: name, derived: f.name, ...numericSummary(c) });
      }
    }
    if (f.dims >= 3) {
      const pcs = principalComponents(col.map((v) => (v && v.length === f.dims ? v : null)), 3);
      pcs.forEach((c, k) => {
        const name = `${f.name} · PC${k + 1}`;
        cols.set(name, c);
        fields.push({ name, kind: 'number', label: name, derived: f.name, ...numericSummary(c) });
      });
    }
  }

  const byName = new Map(fields.map((f) => [f.name, f]));
  const pickName = (want, kinds, re) => {
    if (want && byName.has(want)) return want;
    const cands = fields.filter((f) => kinds.includes(f.kind));
    // The plainest name first (`id`, `name`), else the first such field in record order.
    return (cands.find((f) => re.test(f.name)) ?? cands[0])?.name ?? null;
  };
  const idField = pickName(hint.id, ['id'], /^_?(?:id|uuid|guid|key)$/i);
  const labelField = pickName(hint.label, ['label'], /^(?:name|label|title)$/i) ?? idField;
  const idCol = idField ? cols.get(idField) : null;
  const labelCol = labelField ? cols.get(labelField) : null;
  const idRaw = idField ? rows.map((r) => r[idField]) : null;

  return {
    n,
    records: recs,
    fields,
    idField,
    labelField,
    field: (name) => byName.get(name),
    col: (name) => cols.get(name),
    idOf: (i) => (idRaw && idRaw[i] !== null && idRaw[i] !== undefined ? idRaw[i] : i),
    labelOf: (i) => (labelCol && labelCol[i] !== null ? String(labelCol[i]) : idCol && idCol[i] !== null ? String(idCol[i]) : `#${i + 1}`),
    indexOfId: (() => {
      let map = null;
      return (id) => {
        if (!map) { map = new Map(); for (let i = 0; i < n; i++) map.set(String(idRaw ? idRaw[i] : i), i); }
        return map.get(String(id));
      };
    })(),
  };
}

function mode(xs) {
  const c = new Map();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let best = 0, bestN = -1;
  for (const [k, v] of c) if (v > bestN) { best = k; bestN = v; }
  return best;
}

/** The fields a role may be drawn by. */
export function candidates(model, kinds) {
  return model.fields.filter((f) => kinds.includes(f.kind) && !f.hidden && (f.count ?? 0) > 0 &&
    !(f.kind === 'category' && (f.distinct ?? 0) < 1));
}

/** How much an axis would show: coverage times spread of distinct values; derived fields after the record's own. */
function axisScore(f, n) {
  const coverage = n ? (f.count ?? 0) / n : 0;
  if (f.kind === 'category') {
    // Bands read best in the tens; hundreds of them are mush on an axis.
    const d = f.distinct ?? 1;
    return coverage * (d <= 48 ? Math.log2(d + 1) : Math.log2(49) * (48 / d)) * 0.5;
  }
  const varied = (f.distinct ?? 0) > 1 ? Math.log2(Math.min(f.distinct, 4096) + 1) : 0;
  // A field one outlier stretches draws everything else as a sliver: last resort, not first pick.
  const spread = f.fill === undefined ? 1 : Math.min(1, 0.25 + f.fill);
  return coverage * varied * spread * (f.derived ? 0.6 : 1) * (f.kind === 'time' ? 0.9 : 1);
}

/** The categories best for colour: few enough to tell apart, more than one. */
function colorScore(f, n) {
  const d = f.distinct ?? 0;
  if (d < 2) return -1;
  const coverage = n ? (f.count ?? 0) / n : 0;
  return coverage / (1 + Math.abs(Math.log2(d / 8)));
}

/**
 * The view a viewer starts with: the host's (when it names fields that exist), else a proposal.
 * `needs` is the viewer's own list of { role, kinds, required }.
 */
export function proposeView(model, needs, hinted = {}) {
  const view = {};
  const used = new Set();
  const ok = (name, kinds) => {
    const f = name && model.field(name);
    return !!f && kinds.includes(f.kind);
  };
  for (const need of needs) {
    const r = need.role;
    const want = hinted[r];
    if (r === 'corners') {
      view.corners = Array.isArray(want) ? want.filter((x) => ok(x, need.kinds)).slice(0, 6) : [];
      continue;
    }
    if (want === null) { view[r] = null; continue; }
    if (ok(want, need.kinds)) { view[r] = want; if (['x', 'y', 'z'].includes(r)) used.add(want); continue; }
    view[r] = null;
  }
  const pool = (kinds) => candidates(model, kinds).filter((f) => !used.has(f.name));
  for (const need of needs) {
    const r = need.role;
    if (view[r] !== null || hinted[r] === null || r === 'corners') continue;
    if (['x', 'y', 'z'].includes(r)) {
      // Numbers before times before categories, then by what the axis would show; never a
      // category that only relabels one already on an axis (a maker's slug and its name).
      const rank = (f) => need.kinds.indexOf(f.kind);
      const order = (fs) => fs.sort((a, b) => rank(a) - rank(b) || axisScore(b, model.n) - axisScore(a, model.n));
      const all = pool(need.kinds);
      const fresh = all.filter((f) => (f.distinct ?? 0) > 1 && (f.kind !== 'category' || ![...used].some((u) => sameGrouping(model, f.name, u))));
      const best = order(fresh)[0] ?? order(all)[0]; // a constant or a relabel is still better than an empty axis
      if (best) { view[r] = best.name; used.add(best.name); }
    } else if (r === 'color') {
      const literal = candidates(model, ['color']).filter((f) => need.kinds.includes('color'))[0];
      const best = literal ?? candidates(model, ['category']).filter((f) => !used.has(f.name) && f.name !== view.face)
        .sort((a, b) => colorScore(b, model.n) - colorScore(a, model.n)).find((f) => colorScore(f, model.n) > 0);
      if (best) view.color = best.name;
    } else if (r === 'face') {
      const cats = candidates(model, ['category']).filter((f) => (f.distinct ?? 0) >= 2);
      const cover = (f) => (model.n ? (f.count ?? 0) / model.n : 0);
      const within = cats.filter((f) => f.distinct <= 32).sort((a, b) => cover(b) * Math.log2(b.distinct + 1) - cover(a) * Math.log2(a.distinct + 1))[0];
      const best = within ?? cats.sort((a, b) => a.distinct - b.distinct)[0];
      if (best) view.face = best.name;
    }
    // size, shape, faceGroup, focus: none until somebody picks one.
  }
  for (const k of ['signs', 'pull', 'cornerPull', 'outline', 'faceIntensity', 'axes']) if (k in hinted) view[k] = hinted[k];
  return view;
}

/** True when two category fields split the records identically (each value of one maps to exactly one of the other). */
export function sameGrouping(model, a, b) {
  const fa = model.field(a), fb = model.field(b);
  if (!fa || !fb || fa.kind !== 'category' || fb.kind !== 'category' || fa.distinct !== fb.distinct) return false;
  const ca = model.col(a), cb = model.col(b);
  const ab = new Map(), ba = new Map();
  for (let i = 0; i < model.n; i++) {
    const x = ca[i], y = cb[i];
    if (ab.has(x) && ab.get(x) !== y) return false;
    if (ba.has(y) && ba.get(y) !== x) return false;
    ab.set(x, y); ba.set(y, x);
  }
  return true;
}

/** The roles a viewer cannot draw without, that this model cannot fill — [] when it can. */
export function missingRoles(model, needs, view) {
  return needs.filter((nd) => nd.required && !view[nd.role]).map((nd) => nd.role);
}

/** The `fields` message body: what was read, compactly (the counts and colour maps stay home). */
export function fieldsReport(model) {
  return model.fields.map((f) => {
    const o = { name: f.name, kind: f.kind, count: f.count ?? 0 };
    if (f.label !== f.name) o.label = f.label;
    if (f.distinct !== undefined) o.distinct = f.distinct;
    if (f.min !== undefined && Number.isFinite(f.min)) o.min = f.min;
    if (f.max !== undefined && Number.isFinite(f.max)) o.max = f.max;
    if (f.dims) o.dims = f.dims;
    return o;
  });
}
