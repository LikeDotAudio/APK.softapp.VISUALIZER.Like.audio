// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE ANALYZER'S ARITHMETIC — per field, whatever the field is.
 *
 * number / time  count, missing, min, max, mean, median, std, quartiles, a
 *                histogram, and the outliers (beyond 1.5 × IQR of the quartiles,
 *                Tukey's fences) as record indices
 * category / id / label / color / text
 *                count, missing, distinct, the busiest values with their counts
 * vector         count, length, per-dimension mean spread
 * correlations   Pearson r between every pair of number fields, pairwise
 *                complete (a record missing either value is left out of that pair)
 * percentile     where one record's value sits in its field (the Examiner's
 *                "this sample against the library" bar, for any field)
 */

export function describe(f, col, n) {
  if (!f || !col) return null;
  if (f.kind === 'number' || f.kind === 'time') return describeNumbers(col, n);
  if (f.kind === 'vector') {
    const vs = col.filter((v) => Array.isArray(v));
    return { count: vs.length, missing: n - vs.length, dims: f.dims };
  }
  const counts = new Map();
  let count = 0;
  for (const v of col) if (v !== null && v !== undefined) { count++; counts.set(v, (counts.get(v) ?? 0) + 1); }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, c]) => ({ value, count: c }));
  return { count, missing: n - count, distinct: counts.size, top };
}

export function describeNumbers(col, n = col.length) {
  const idx = [];
  for (let i = 0; i < col.length; i++) if (Number.isFinite(col[i])) idx.push(i);
  const count = idx.length;
  if (!count) return { count: 0, missing: n };
  const sorted = idx.map((i) => col[i]).sort((a, b) => a - b);
  const q = (p) => {
    const x = (sorted.length - 1) * p;
    const lo = Math.floor(x), hi = Math.ceil(x);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
  };
  const mean = sorted.reduce((a, v) => a + v, 0) / count;
  const std = Math.sqrt(sorted.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, count - 1));
  const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr, highFence = q3 + 1.5 * iqr;
  const outliers = iqr > 0 ? idx.filter((i) => col[i] < lowFence || col[i] > highFence) : [];
  outliers.sort((a, b) => Math.abs(col[b] - (q1 + q3) / 2) - Math.abs(col[a] - (q1 + q3) / 2));
  return {
    count, missing: n - count, min: sorted[0], max: sorted[count - 1], mean, std,
    median: q(0.5), q1, q3, lowFence, highFence, outliers,
    histogram: histogram(col, sorted[0], sorted[count - 1], Math.min(40, Math.max(5, Math.ceil(Math.sqrt(count))))),
  };
}

/** Equal-width bins: [{ lo, hi, count, indices }]. */
export function histogram(col, lo, hi, bins) {
  if (!(hi > lo)) {
    const indices = [];
    col.forEach((v, i) => { if (Number.isFinite(v)) indices.push(i); });
    return [{ lo, hi, count: indices.length, indices }];
  }
  const w = (hi - lo) / bins;
  const out = Array.from({ length: bins }, (_, b) => ({ lo: lo + b * w, hi: lo + (b + 1) * w, count: 0, indices: [] }));
  col.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    const b = Math.min(bins - 1, Math.floor((v - lo) / w));
    out[b].count++;
    out[b].indices.push(i);
  });
  return out;
}

/** Pearson r, pairwise complete. NaN when fewer than three pairs or a side is constant. */
export function pearson(a, b) {
  let n = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) { n++; sa += a[i]; sb += b[i]; }
  if (n < 3) return NaN;
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    if (!(Number.isFinite(a[i]) && Number.isFinite(b[i]))) continue;
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

/** The r matrix for `names` (columns from `col`), and the strongest pairs first. */
export function correlations(names, col) {
  const cols = names.map(col);
  const matrix = names.map((_, i) => names.map((__, j) => (i === j ? 1 : NaN)));
  const pairs = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const r = pearson(cols[i], cols[j]);
    matrix[i][j] = matrix[j][i] = r;
    if (Number.isFinite(r)) pairs.push({ a: names[i], b: names[j], r });
  }
  pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  return { names, matrix, pairs };
}

/** Where `v` sits among the finite values of `col`, 0..1 (the share at or below it). NaN when it is missing. */
export function percentile(col, v) {
  if (!Number.isFinite(v)) return NaN;
  let below = 0, count = 0;
  for (const x of col) if (Number.isFinite(x)) { count++; if (x <= v) below++; }
  return count ? below / count : NaN;
}
