// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// THE 4D BALL'S SOLID. Moved here from SCANALYZER.Like.audio's facialResponse.ts
// (2026-11-06, ROAD-3571): the geometry is the viewer's, and which category sits
// on which face is the host's (a `face` field and its `order`). This is the only
// copy; test/solid.test.mjs runs validateSolid on it.
//! A truncated icosahedron: 32 faces, so up to 32 values of a category each get
//! a face of their own, and a record is pulled toward its value's face.
//!
//! ## The solid
//!
//!   F = 32  (12 pentagons + 20 hexagons)
//!   E = 90
//!   V = 60  (every vertex meets two hexagons and one pentagon)
//!   V − E + F = 60 − 90 + 32 = 2                        (Euler)
//!
//! It is built by truncating a regular icosahedron, and that construction is
//! what this file actually performs — nothing here is a hardcoded coordinate
//! table. The correspondence is exact:
//!
//!   * each of the icosahedron's 12 VERTICES becomes a PENTAGON
//!   * each of its 20 FACES becomes a HEXAGON
//!   * each of its 30 EDGES becomes a pair of truncated vertices (→ 60)
//!
//! Face adjacency reproduces E = 90 as a check: a pentagon touches the 5
//! hexagons whose icosahedral faces contain its vertex (12 × 5 = 60), and two
//! hexagons touch where their icosahedral faces share an edge (30). 60 + 30 = 90.
//!
//! Circumradius, for reference: R = ¼·√(58 + 18√5)·a for edge length a.

const PHI = (1 + Math.sqrt(5)) / 2;


const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const dist2 = (a, b) => { const d = sub(a, b); return dot(d, d); };
export const normalize = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** The 12 icosahedron vertices, as the three cyclic families (0,±1,±φ).
 *  In these coordinates every edge has length exactly 2. */
function icosahedronVertices() {
  const v = [];
  for (const s of [1, -1]) {
    for (const t of [1, -1]) {
      v.push([0, s, t * PHI]);
      v.push([s, t * PHI, 0]);
      v.push([t * PHI, 0, s]);
    }
  }
  return v;
}

const EDGE2 = 4; // squared edge length in the coordinates above
const NEAR = 1e-9;

/** The 30 edges: every vertex pair exactly one edge length apart. */
function icosahedronEdges(v) {
  const e = [];
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      if (Math.abs(dist2(v[i], v[j]) - EDGE2) < NEAR) e.push([i, j]);
    }
  }
  return e;
}

/** The 20 faces: every mutually adjacent vertex triple. */
function icosahedronFaces(v) {
  const f = [];
  const adjacent = (i, j) => Math.abs(dist2(v[i], v[j]) - EDGE2) < NEAR;
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      if (!adjacent(i, j)) continue;
      for (let k = j + 1; k < v.length; k++) {
        if (adjacent(i, k) && adjacent(j, k)) f.push([i, j, k]);
      }
    }
  }
  return f;
}



/**
 * Build the solid. Pentagons come first (indices 0–11, from the icosahedron's
 * vertices), then hexagons (12–31, from its faces), and that ordering is the
 * order a host's `face` field `order` is dealt onto.
 */
export function truncatedIcosahedron() {
  const iv = icosahedronVertices();
  const ie = icosahedronEdges(iv);
  const iface = icosahedronFaces(iv);

  const centers = [
    ...iv.map((v) => ({ kind: 'pentagon', center: normalize(v) })),
    ...iface.map((f) => ({
      kind: 'hexagon',
      center: normalize(add(add(iv[f[0]], iv[f[1]]), iv[f[2]])),
    })),
  ];

  const faces = centers.map((c, index) => {
    // Any vector not parallel to the normal gives a stable tangent basis.
    const seed = Math.abs(c.center[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const tangentU = normalize(cross(c.center, seed));
    const tangentV = normalize(cross(c.center, tangentU));
    return { index, kind: c.kind, center: c.center, tangentU, tangentV, corners: [] };
  });

  // Truncated vertices: each icosahedral edge contributes the two points one
  // third and two thirds along it — the cuts that turn each vertex into a
  // pentagon while leaving each face a hexagon.
  const vertices = [];
  const vertexOfEdgeEnd = new Map();
  ie.forEach(([a, b], ei) => {
    const dir = sub(iv[b], iv[a]);
    vertexOfEdgeEnd.set(`${ei}:a`, vertices.length);
    vertices.push(normalize(add(iv[a], scale(dir, 1 / 3))));
    vertexOfEdgeEnd.set(`${ei}:b`, vertices.length);
    vertices.push(normalize(add(iv[a], scale(dir, 2 / 3))));
  });

  // 30 "hexagon-to-hexagon" edges: the two cuts on one icosahedral edge.
  const edges = ie.map((_, ei) => [
    vertexOfEdgeEnd.get(`${ei}:a`),
    vertexOfEdgeEnd.get(`${ei}:b`),
  ]);

  // 60 pentagon edges: around each icosahedral vertex, join its 5 nearest cuts
  // into a ring, ordered by angle in that vertex's tangent plane.
  iv.forEach((v, vi) => {
    const normal = normalize(v);
    const seed = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = normalize(cross(normal, seed));
    const w = normalize(cross(normal, u));
    const ring = ie
      .map((e, ei) => {
        if (e[0] === vi) return vertexOfEdgeEnd.get(`${ei}:a`);
        if (e[1] === vi) return vertexOfEdgeEnd.get(`${ei}:b`);
        return -1;
      })
      .filter((i) => i >= 0)
      .sort((p, q) => {
        const ap = Math.atan2(dot(vertices[p], w), dot(vertices[p], u));
        const aq = Math.atan2(dot(vertices[q], w), dot(vertices[q], u));
        return ap - aq;
      });
    for (let k = 0; k < ring.length; k++) {
      edges.push([ring[k], ring[(k + 1) % ring.length]]);
    }
  });

  // Face adjacency, the independent route to E = 90.
  const faceAdjacency = [];
  iface.forEach((f, fi) => {
    f.forEach((vi) => faceAdjacency.push([vi, 12 + fi])); // pentagon ↔ hexagon
  });
  for (let a = 0; a < iface.length; a++) {
    for (let b = a + 1; b < iface.length; b++) {
      const shared = iface[a].filter((x) => iface[b].includes(x));
      if (shared.length === 2) faceAdjacency.push([12 + a, 12 + b]); // hexagon ↔ hexagon
    }
  }

  // Give every face its own corners. A face's corners are simply the vertices
  // nearest its centre — 5 for a pentagon, 6 for a hexagon — and the gap to the
  // next-nearest vertex is large, so picking the top N by dot product is exact
  // rather than a tolerance guess. They are then wound by angle in the face's
  // tangent plane so consecutive corners are adjacent around the rim.
  faces.forEach((f) => {
    const want = f.kind === 'pentagon' ? 5 : 6;
    const ranked = vertices
      .map((v, i) => ({ i, d: dot(v, f.center) }))
      .sort((a, b) => b.d - a.d)
      .slice(0, want)
      .map((r) => r.i);
    ranked.sort((p, q) => {
      const ap = Math.atan2(dot(vertices[p], f.tangentV), dot(vertices[p], f.tangentU));
      const aq = Math.atan2(dot(vertices[q], f.tangentV), dot(vertices[q], f.tangentU));
      return ap - aq;
    });
    f.corners = ranked;
  });

  return { faces, vertices, edges, faceAdjacency };
}

/** Circumsphere radius for a given edge length: R = ¼·√(58 + 18√5)·a. */
export function circumradius(edgeLength) {
  return 0.25 * Math.sqrt(58 + 18 * Math.sqrt(5)) * edgeLength;
}

/** Euler check plus the counts, so a regression in the construction is loud
 *  rather than a subtly wrong ball. Returns null when everything holds. */
export function validateSolid(s) {
  const V = s.vertices.length, E = s.edges.length, F = s.faces.length;
  const pent = s.faces.filter((f) => f.kind === 'pentagon').length;
  const hex = s.faces.filter((f) => f.kind === 'hexagon').length;
  if (V !== 60) return `expected 60 vertices, built ${V}`;
  if (E !== 90) return `expected 90 edges, built ${E}`;
  if (F !== 32) return `expected 32 faces, built ${F}`;
  if (pent !== 12) return `expected 12 pentagons, built ${pent}`;
  if (hex !== 20) return `expected 20 hexagons, built ${hex}`;
  if (s.faceAdjacency.length !== 90) return `expected 90 adjacencies, built ${s.faceAdjacency.length}`;
  if (V - E + F !== 2) return `Euler: ${V} − ${E} + ${F} = ${V - E + F}, expected 2`;
  // Corners: every face must own exactly as many as its kind, all distinct, and
  // every vertex must be shared by exactly three faces (a truncated icosahedron
  // is 3-valent). Sum over faces is therefore 12×5 + 20×6 = 180 = 3 × 60.
  const seen = new Map();
  for (const f of s.faces) {
    const want = f.kind === 'pentagon' ? 5 : 6;
    if (f.corners.length !== want) return `face ${f.index} (${f.kind}) has ${f.corners.length} corners, expected ${want}`;
    if (new Set(f.corners).size !== want) return `face ${f.index} repeats a corner`;
    for (const c of f.corners) seen.set(c, (seen.get(c) ?? 0) + 1);
  }
  if (seen.size !== 60) return `corners cover ${seen.size} vertices, expected 60`;
  const wrong = [...seen.entries()].find(([, n]) => n !== 3);
  if (wrong) return `vertex ${wrong[0]} belongs to ${wrong[1]} faces, expected 3`;
  return null;
}

