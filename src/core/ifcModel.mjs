// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * AN .ifc AS GEOMETRY, for the 3D page (ROAD-3598, answer 1).
 *
 * The meshes come from web-ifc through the shared lazy loader
 * (FrontEnd/shared/apk-webifc.js, vendored at public/vendor/apk-webifc/): it is
 * injected the first time the page is handed an .ifc — dropped, picked, or
 * `?ifc=<url>` — so a page that only ever draws records never fetches it, nor
 * the 7.5 MB engine behind it. Any .ifc, ours or foreign: 3D geometry is the
 * engine's job, the small STEP codec draws none.
 *
 * Positions arrive in mm in the file's own frame (Z up). sceneOf() centres the
 * model, scales its longest side to `span` scene units and turns it Y-up for
 * three.js, and groups the products by IFC class for the legend.
 */

/** A colour per IFC class (anything else: by hash, so one class keeps one colour). */
export const CLASS_COLOR = {
  IfcWall: '#94a3b8', IfcWallStandardCase: '#94a3b8', IfcCurtainWall: '#94a3b8',
  IfcSlab: '#64748b', IfcRoof: '#64748b', IfcCovering: '#64748b',
  IfcDoor: '#f59e0b', IfcWindow: '#38bdf8',
  IfcColumn: '#a3a3a3', IfcBeam: '#a3a3a3', IfcMember: '#a3a3a3', IfcPlate: '#a3a3a3',
  IfcStair: '#c084fc', IfcStairFlight: '#c084fc', IfcRailing: '#c084fc', IfcRamp: '#c084fc',
  IfcSpace: '#22c55e',
  IfcAudioVisualAppliance: '#4e9af1', IfcCommunicationsAppliance: '#4e9af1', IfcFurniture: '#eab308', IfcFurnishingElement: '#eab308',
};
const SPARE = ['#f472b6', '#2dd4bf', '#fb923c', '#a78bfa', '#facc15', '#4ade80', '#60a5fa', '#f87171'];

export function classColor(type) {
  if (CLASS_COLOR[type]) return CLASS_COLOR[type];
  let h = 0;
  for (const c of String(type)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SPARE[h % SPARE.length];
}

/** Is this file an .ifc (by name, or by its STEP header)? */
export function isIfc(name, head) {
  if (/\.ifc$/i.test(name ?? '')) return true;
  return typeof head === 'string' && /^\s*ISO-10303-21;[\s\S]{0,4096}FILE_SCHEMA\s*\(\s*\(\s*'IFC/i.test(head);
}

/**
 * The model ready to draw: one entry per mesh with Y-up scene positions, the
 * products grouped by class, the bounds in mm, and the scale used.
 */
export function sceneOf(model, { span = 30 } = {}) {
  const meshes = model?.meshes ?? [];
  if (!meshes.length) return { meshes: [], classes: [], products: 0, size: [0, 0, 0], scale: 1 };
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        if (p[i + a] < min[a]) min[a] = p[i + a];
        if (p[i + a] > max[a]) max[a] = p[i + a];
      }
    }
  }
  const size = max.map((v, a) => v - min[a]);
  const centre = max.map((v, a) => (v + min[a]) / 2);
  const scale = span / Math.max(size[0], size[1], size[2], 1e-9);
  const byClass = new Map();
  const products = new Set();
  const out = meshes.map((m, k) => {
    const p = m.positions, q = new Float32Array(p.length);
    // file (X, Y, Z-up) → three.js (x, y-up, z toward the viewer) = (X, Z, -Y); the floor sits on y = 0
    for (let i = 0; i < p.length; i += 3) {
      q[i] = (p[i] - centre[0]) * scale;
      q[i + 1] = (p[i + 2] - min[2]) * scale;
      q[i + 2] = 0 - (p[i + 1] - centre[1]) * scale;
    }
    products.add(m.expressID);
    const c = byClass.get(m.type) ?? { type: m.type, color: classColor(m.type), products: new Set() };
    c.products.add(m.expressID);
    byClass.set(m.type, c);
    return { key: `${m.expressID}:${k}`, expressID: m.expressID, type: m.type, name: m.name ?? null, positions: q, indices: m.indices, color: classColor(m.type) };
  });
  const classes = [...byClass.values()].map((c) => ({ type: c.type, color: c.color, count: c.products.size })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  return { meshes: out, classes, products: products.size, size, scale, min, max };
}

/** window.APKWebIfc, injected on first use from the copy beside this page. */
export async function webIfcEngine(doc = globalThis.document) {
  const g = globalThis;
  if (g.APKWebIfc) return g.APKWebIfc;
  const src = new URL('./vendor/apk-webifc/apk-webifc.js', doc.baseURI).href;
  await new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`the IFC engine loader did not load (${src})`));
    doc.head.appendChild(s);
  });
  if (!g.APKWebIfc) throw new Error(`the IFC engine loader at ${src} did not set APKWebIfc`);
  return g.APKWebIfc;
}

/** An .ifc (bytes or text) into a drawable model, through the engine. */
export async function loadIfcModel(input, title, engine = webIfcEngine) {
  const E = await engine();
  const model = await E.meshes(input);
  if (!model.meshes.length) throw new Error(`${title}: the file has no geometry to draw`);
  return { title, schema: model.schema, version: model.version, ...sceneOf(model) };
}
