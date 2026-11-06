// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * FROM A FIELD TO A POSITION, A COLOUR, A SIZE, A SHAPE — for any field kind.
 *
 * Every viewer places by the same rules, so a field means the same place in 2D,
 * 3D and on the 4D ball:
 *
 *   number / time   linear over the loaded range → [-1, 1]; `robust` takes the
 *                   2nd–98th percentile and clamps (one outlier must not squash
 *                   everything else into a sliver — the 4D ball's rule)
 *   category        evenly spaced bands in the field's order, with a small
 *                   deterministic jitter so a band reads as a cloud, not a line
 *   missing         the centre (0): absent is not "lowest"
 */

/** Deterministic jitter in [-1, 1] from an integer index (stable across renders). */
export function jitter(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** index → [-1, 1] for field `f` (a model field) over column `col`. `sign` -1 flips it. */
export function axisScale(f, col, { robust = false, sign = 1, jitterBand = 0.35 } = {}) {
  if (!f || !col) return () => 0;
  if (f.kind === 'category') {
    const order = f.order ?? [];
    const pos = new Map(order.map((v, i) => [v, i]));
    const span = Math.max(1, order.length - 1);
    const band = order.length > 1 ? jitterBand / span : 0;
    return (i) => {
      const k = pos.get(col[i]);
      if (k === undefined) return 0;
      const t = order.length > 1 ? (k / span) * 2 - 1 : 0;
      return sign * (t + jitter(i) * band);
    };
  }
  const values = [];
  for (const v of col) if (Number.isFinite(v)) values.push(v);
  if (!values.length) return () => 0;
  let lo, hi;
  if (robust && values.length > 4) {
    values.sort((a, b) => a - b);
    const q = (p) => values[Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * p)))];
    lo = q(0.02); hi = q(0.98);
    if (!(hi > lo)) { lo = values[0]; hi = values[values.length - 1]; }
  } else {
    lo = Infinity; hi = -Infinity;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  const range = hi - lo || 1;
  return (i) => {
    const v = col[i];
    if (!Number.isFinite(v)) return 0;
    const t = ((v - lo) / range) * 2 - 1;
    return sign * Math.max(-1, Math.min(1, t));
  };
}

/** The value range an axis shows, for ticks: { lo, hi } (numbers/time) or { categories }. */
export function axisDomain(f, col) {
  if (!f) return null;
  if (f.kind === 'category') return { categories: f.order ?? [] };
  let lo = Infinity, hi = -Infinity;
  for (const v of col) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return Number.isFinite(lo) ? { lo, hi } : null;
}

/** Twelve categorical hues, tuned to read on a near-black ground and to stay apart for common colour-vision deficiencies. */
export const PALETTE = ['#4e9af1', '#f28e2b', '#59c47a', '#e15759', '#b07aa1', '#edc948', '#76b7b2', '#ff9da7', '#9c755f', '#a0cbe8', '#8cd17d', '#d4a6c8'];
const OTHER = '#6b7280';

/** A sequential ramp (dark blue → teal → yellow) for numbers. */
const RAMP = [[0.15, 0.2, 0.55], [0.13, 0.45, 0.6], [0.2, 0.65, 0.5], [0.6, 0.8, 0.3], [0.99, 0.9, 0.15]];
export function ramp(t) {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const c = RAMP[i].map((a, k) => a + (RAMP[i + 1][k] - a) * f);
  return '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

/**
 * index → CSS colour for the colour role, and the legend that explains it.
 * category: the host's colours first, then the palette by the field's order (past 12, grey).
 * number/time: the ramp. color: the value itself.
 */
export function colorScale(f, col, fallback = '#4e9af1') {
  if (!f || !col) return { color: () => fallback, legend: [] };
  if (f.kind === 'color') return { color: (i) => col[i] ?? OTHER, legend: [] };
  if (f.kind === 'category') {
    const map = new Map();
    const order = f.order ?? [];
    // Busiest values get the palette first, so the twelve hues go where the records are.
    const byCount = [...order].sort((a, b) => (f.counts?.[b] ?? 0) - (f.counts?.[a] ?? 0));
    let k = 0;
    for (const v of byCount) {
      if (f.colors?.[v]) map.set(v, f.colors[v]);
      else map.set(v, k < PALETTE.length ? PALETTE[k++] : OTHER);
    }
    const legend = order.map((v) => ({ value: v, color: map.get(v), count: f.counts?.[v] ?? 0 }));
    return { color: (i) => map.get(col[i]) ?? OTHER, legend };
  }
  const s = axisScale(f, col);
  return { color: (i) => (Number.isFinite(col[i]) ? ramp((s(i) + 1) / 2) : OTHER), legend: [{ value: 'low', color: ramp(0) }, { value: 'high', color: ramp(1) }] };
}

/** index → size multiplier in [0.5, 2.2] for the size role; 1 when there is none. */
export function sizeScale(f, col) {
  if (!f || !col || f.kind === 'category') return () => 1;
  const s = axisScale(f, col);
  return (i) => (Number.isFinite(col[i]) ? 0.5 + ((s(i) + 1) / 2) * 1.7 : 0.8);
}

export const SHAPES = ['sphere', 'cube', 'pyramid', 'cylinder', 'diamond', 'torus', 'icosahedron', 'disc', 'dodecahedron'];

/** index → one of SHAPES. A category whose values ARE shape names keeps them; otherwise values are dealt shapes in order. */
export function shapeScale(f, col) {
  if (!f || !col || f.kind !== 'category') return { shape: () => 'sphere', legend: [] };
  const order = f.order ?? [];
  const literal = order.every((v) => SHAPES.includes(v));
  const map = new Map(order.map((v, i) => [v, literal ? v : SHAPES[i % SHAPES.length]]));
  return { shape: (i) => map.get(col[i]) ?? 'sphere', legend: order.map((v) => ({ value: v, shape: map.get(v) })) };
}

/** Readable ticks between lo and hi (about `count` of them). */
export function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** A value as the viewer prints it. */
export function formatValue(v, f) {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '—';
  if (f?.kind === 'time' && typeof v === 'number') return new Date(v).toISOString().replace('T', ' ').replace(/:00\.000Z$|\.000Z$/, 'Z').replace(/ 00:00Z$/, '');
  if (Array.isArray(v)) return `[${v.slice(0, 4).map((x) => formatValue(x)).join(', ')}${v.length > 4 ? `, … ${v.length}` : ''}]`;
  if (typeof v === 'number') {
    const a = Math.abs(v);
    const s = Number.isInteger(v) ? String(v) : a >= 1000 ? v.toFixed(0) : a >= 1 ? v.toFixed(2) : a >= 0.001 ? v.toPrecision(3) : v.toExponential(2);
    return f?.unit ? `${s} ${f.unit}` : s;
  }
  return String(v);
}
