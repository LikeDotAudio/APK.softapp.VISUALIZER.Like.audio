// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * PRINCIPAL COMPONENTS OF A VECTOR FIELD, so an embedding can sit on an axis.
 *
 * Power iteration on the centred data without forming the covariance matrix
 * (X^T X v costs n·d per step, a d×d matrix would cost d² memory for a 1536-wide
 * embedding), with deflation for the 2nd and 3rd component. Deterministic: the
 * start vector is fixed, so the same records always project the same way. The
 * sign of each component is fixed too (its largest loading positive), so a
 * reload does not mirror the cloud.
 */
export function principalComponents(vectors, k = 3, iterations = 60) {
  const rows = [];
  const at = [];
  vectors.forEach((v, i) => { if (v && v.every(Number.isFinite)) { rows.push(v); at.push(i); } });
  const n = vectors.length;
  const out = Array.from({ length: k }, () => new Array(n).fill(NaN));
  if (rows.length < 2) return out;
  const d = rows[0].length;
  const mean = new Array(d).fill(0);
  for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r[j] / rows.length;
  const X = rows.map((r) => r.map((x, j) => x - mean[j]));
  const comps = [];
  for (let c = 0; c < k && c < d; c++) {
    let v = Array.from({ length: d }, (_, j) => 1 / Math.sqrt(d) * (1 + ((j * 7 + c * 13) % 5) / 10));
    for (let it = 0; it < iterations; it++) {
      const xv = X.map((r) => dot(r, v));
      const w = new Array(d).fill(0);
      X.forEach((r, i) => { for (let j = 0; j < d; j++) w[j] += r[j] * xv[i]; });
      for (const p of comps) { const s = dot(w, p); for (let j = 0; j < d; j++) w[j] -= s * p[j]; }
      const norm = Math.sqrt(dot(w, w));
      if (!(norm > 1e-12)) break;
      v = w.map((x) => x / norm);
    }
    let big = 0;
    for (let j = 1; j < d; j++) if (Math.abs(v[j]) > Math.abs(v[big])) big = j;
    if (v[big] < 0) v = v.map((x) => -x);
    comps.push(v);
    X.forEach((r, i) => { out[c][at[i]] = dot(r, v); });
  }
  return out;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
