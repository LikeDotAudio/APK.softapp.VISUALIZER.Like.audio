// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * 4D — three fields as space, and a CATEGORY as geometry. Moved here from
 * SCANALYZER.Like.audio's FaceBall.tsx (2026-11-06, ROAD-3571).
 *
 * The 3D cloud spends all three dimensions on fields, so a category is carried
 * by colour alone and categories that sit alike smear together. Here the `face`
 * field's values are dealt onto the 32 faces of a truncated icosahedron (in the
 * field's order — a host that declares an `order` decides which value gets which
 * face; past 32 values, the rest share the last face), and each record is pulled
 * toward its value's face. That pull is the fourth dimension:
 *
 *   pull 0      the plain three-field scatter
 *   pull 1      every record seated on its face: 32 small scatters on a ball
 *   pull > 1    overshoot, which pulls crowded neighbouring faces apart
 *
 * A record that stays far from its face is one whose numbers disagree with its
 * category. `corners` (up to six number fields) weight each face's 5 or 6
 * corners, so where a record sits WITHIN its face says which of them dominates.
 * `faceGroup` colours the faces (each face takes its records' majority value).
 *
 * Kept from the original because it was measured: instance colours are written
 * in a layout effect (the shader compiles its instancing-colour path only if the
 * attribute exists when the program is built), and the material has NO
 * `vertexColors` (sphereGeometry has no colour attribute, so it would multiply
 * every dot by black).
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { truncatedIcosahedron, validateSolid } from '../core/solid.mjs';
import { axisScale, colorScale, PALETTE } from '../core/scale.mjs';
import { candidates } from '../core/infer.mjs';
import { Legend } from './Legend.jsx';
import { cardRows } from './Tip.jsx';
import { WebGLGate } from './WebGLGate.jsx';
import { Fly } from './Cloud3D.jsx';

const R = 26;
const WIREFRAME = '#6b7d8c';
const FACE_SPREAD = 3.4, FACE_DEPTH = 2.2, FREE_SPAN = 30;
const FACES = 32;
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** Which face each record is on, and what each face is: the face field's values, in its order. */
export function dealFaces(model, faceName, groupName) {
  const f = model.field(faceName);
  const col = model.col(faceName) ?? [];
  const declared = f?.declaredOrder ?? [];
  const values = [...declared, ...(f?.order ?? []).filter((v) => !declared.includes(v))];
  const index = new Map(values.map((v, i) => [v, Math.min(i, FACES - 1)]));
  const faceOf = new Int16Array(model.n).fill(-1);
  const faces = Array.from({ length: FACES }, (_, i) => ({ index: i, values: [], count: 0, members: [] }));
  values.forEach((v, i) => faces[Math.min(i, FACES - 1)].values.push(v));
  for (let i = 0; i < model.n; i++) {
    const k = index.get(col[i]);
    if (k === undefined) continue;
    faceOf[i] = k;
    faces[k].count++;
    faces[k].members.push(i);
  }
  // Face colour: the majority value of the group field, through its colour scale.
  const g = model.field(groupName);
  const gcol = model.col(groupName);
  const gscale = g ? colorScale(g, gcol) : null;
  for (const face of faces) {
    face.label = face.values.length > 1 ? `${face.values[0]} + ${face.values.length - 1} more` : face.values[0] ?? '';
    if (gscale && face.members.length) {
      const c = new Map();
      for (const i of face.members) c.set(gcol[i], (c.get(gcol[i]) ?? 0) + 1);
      const [top] = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
      face.group = top;
      face.color = gscale.color(face.members.find((i) => gcol[i] === top));
    } else face.color = PALETTE[face.index % PALETTE.length];
  }
  return { faceOf, faces, overflow: Math.max(0, values.length - FACES) };
}

function Wireframe({ solid, intensity }) {
  const geometry = useMemo(() => {
    const pts = [];
    for (const [a, b] of solid.edges) { const va = solid.vertices[a], vb = solid.vertices[b]; pts.push(va[0] * R, va[1] * R, va[2] * R, vb[0] * R, vb[1] * R, vb[2] * R); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [solid]);
  const color = useMemo(() => { const c = new THREE.Color(WIREFRAME); if (intensity > 1) c.lerp(new THREE.Color('#ffffff'), Math.min(1, intensity - 1)); return c; }, [intensity]);
  if (intensity <= 0) return null;
  return <lineSegments geometry={geometry}><lineBasicMaterial color={color} transparent opacity={Math.min(1, intensity)} toneMapped={false} /></lineSegments>;
}

function FaceMarkers({ solid, deal, hovered, onHover, solo, intensity }) {
  if (intensity <= 0) return null;
  return (
    <group>
      {solid.faces.map((f) => {
        if (solo != null && solo !== f.index) return null;
        const face = deal.faces[f.index];
        if (!face.values.length) return null;
        const isHovered = hovered === f.index;
        const facing = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(f.center));
        const span = f.kind === 'pentagon' ? 2.6 : 3.2;
        return (
          <group key={f.index} position={v3(f.center).multiplyScalar(R)} quaternion={facing}>
            <mesh onPointerOver={(e) => { e.stopPropagation(); onHover(f.index); }} onPointerOut={() => onHover(null)}>
              <circleGeometry args={[isHovered ? span * 1.15 : span, f.kind === 'pentagon' ? 5 : 6]} />
              <meshBasicMaterial color={face.color} transparent opacity={Math.min(1, (isHovered ? 0.55 : 0.22) * intensity)} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
            </mesh>
            {isHovered && (
              <Html distanceFactor={40} style={{ pointerEvents: 'none' }}>
                <div className="tip" style={{ position: 'static', borderColor: face.color, transform: 'translate(-50%,-160%)' }}>
                  <b>{face.label}</b> <i>({f.kind}, {face.count})</i>
                  {face.group && <div><i>{face.group}</i></div>}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

function Samples({ model, view, layout, selected, onPick, onHover }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    layout.positions.forEach((p, k) => { m.makeTranslation(p.x, p.y, p.z); mesh.setMatrixAt(k, m); mesh.setColorAt(k, layout.colors[k]); });
    mesh.count = layout.positions.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.material.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [layout]);
  const at = (i) => layout.slot.get(i);
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, layout.positions.length)]}
        onClick={(e) => { e.stopPropagation(); if (e.instanceId != null) onPick(layout.items[e.instanceId]); }}
        onPointerOver={(e) => { e.stopPropagation(); if (e.instanceId != null) onHover(layout.items[e.instanceId]); }}
        onPointerOut={() => onHover(null)}>
        <sphereGeometry args={[0.42, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {selected.slice(0, 200).map((i) => at(i) != null && (
        <mesh key={i} position={layout.positions[at(i)]}><sphereGeometry args={[0.75, 16, 16]} /><meshBasicMaterial color="#ffffff" wireframe /></mesh>
      ))}
    </>
  );
}

export default function FaceBall4D({ model, view, changeView, selected, onPick, onSelect, fly }) {
  const solid = useMemo(() => truncatedIcosahedron(), []);
  const geometryError = useMemo(() => validateSolid(solid), [solid]);
  const [hoverFace, setHoverFace] = useState(null);
  const [hover, setHover] = useState(null);
  const [solo, setSolo] = useState(null);
  const pull = view.pull ?? 0.85, cornerPull = view.cornerPull ?? 0.6;
  const outline = view.outline ?? 0.75, faceIntensity = view.faceIntensity ?? 1;
  const signs = view.signs ?? [1, 1, 1];
  const corners = view.corners ?? [];

  const deal = useMemo(() => dealFaces(model, view.face, view.faceGroup), [model, view.face, view.faceGroup]);

  const layout = useMemo(() => {
    const ax = ['x', 'y', 'z'].map((r, k) => axisScale(model.field(view[r]), model.col(view[r]), { robust: true, sign: signs[k] || 1 }));
    const cn = corners.map((n) => axisScale(model.field(n), model.col(n), { robust: true }));
    const useCorners = cornerPull > 0 && cn.length > 0;
    const c = view.color ? colorScale(model.field(view.color), model.col(view.color)) : null;
    const positions = [], colors = [], items = [], slot = new Map();
    for (let i = 0; i < model.n; i++) {
      const fi = deal.faceOf[i];
      if (fi < 0 || (solo != null && fi !== solo)) continue;
      const face = solid.faces[fi];
      const a = ax[0](i), b = ax[1](i), z = ax[2](i);
      const free = new THREE.Vector3(a * FREE_SPAN * 0.5, b * FREE_SPAN * 0.5, z * FREE_SPAN * 0.5);
      let anchored = v3(face.center).multiplyScalar(R + z * FACE_DEPTH)
        .add(v3(face.tangentU).multiplyScalar(a * FACE_SPREAD))
        .add(v3(face.tangentV).multiplyScalar(b * FACE_SPREAD));
      if (useCorners) {
        let wx = 0, wy = 0, wz = 0, ws = 0;
        face.corners.forEach((vi, k) => {
          const t = (cn[k % cn.length](i) + 1) / 2, w = t * t;
          const cv = solid.vertices[vi];
          wx += cv[0] * w; wy += cv[1] * w; wz += cv[2] * w; ws += w;
        });
        if (ws > 1e-9) {
          const dir = new THREE.Vector3(wx / ws, wy / ws, wz / ws);
          if (dir.lengthSq() > 1e-12) anchored = anchored.lerp(dir.normalize().multiplyScalar(R + z * FACE_DEPTH), Math.min(1, cornerPull));
        }
      }
      slot.set(i, positions.length);
      positions.push(free.lerp(anchored, pull));
      colors.push(new THREE.Color(c ? c.color(i) : deal.faces[fi].color));
      items.push(i);
    }
    return { positions, colors, items, slot, legend: c?.legend ?? [], colorField: model.field(view.color) };
  }, [model, view.x, view.y, view.z, view.color, pull, cornerPull, corners.join('|'), signs[0], signs[1], signs[2], deal, solo, solid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (geometryError) return <div className="empty"><div className="card">Truncated icosahedron failed to build: {geometryError}</div></div>;

  const numberFields = candidates(model, ['number', 'time']);
  const shownFaces = deal.faces.filter((f) => f.values.length);
  const slider = (label, key, value, max) => (
    <label className="slider">{label} — {Math.round(value * 100)}%
      <input type="range" min={0} max={max} step={0.01} value={value} onChange={(e) => changeView({ [key]: Number(e.target.value) })} />
    </label>
  );

  return (
    <>
      <div className="canvas" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="bar" style={{ borderTop: 'none' }}>
          {slider('Category pull', 'pull', pull, 2)}
          {slider('Outline', 'outline', outline, 2)}
          {slider('Face intensity', 'faceIntensity', faceIntensity, 2)}
          {corners.length > 0 && slider('Corner pull', 'cornerPull', cornerPull, 1)}
          <span style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 320 }}>0 % is the plain scatter; 100 % seats every record on its face; past 100 % they overshoot. A record that resists the pull disagrees with its category.</span>
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <WebGLGate what="4D view" resetKey={model}>
            <Canvas camera={{ position: [0, 0, 78], fov: 50 }} style={{ background: '#0a0e12' }} aria-label={`Face ball of ${model.n} records over ${shownFaces.length} faces`}>
              <ambientLight intensity={1} />
              <Wireframe solid={solid} intensity={outline} />
              <FaceMarkers solid={solid} deal={deal} hovered={hoverFace} onHover={setHoverFace} solo={solo} intensity={faceIntensity} />
              <Samples model={model} view={view} layout={layout} selected={selected} onPick={onPick} onHover={setHover} />
              {hover != null && layout.slot.has(hover) && (
                <Html position={layout.positions[layout.slot.get(hover)]} style={{ pointerEvents: 'none' }}>
                  <div className="tip" style={{ position: 'static', transform: 'translate(18px, calc(-100% - 14px))' }}>
                    <b>{model.labelOf(hover)}</b>
                    {cardRows(model, hover, view, ['face', 'x', 'y', 'z', 'color']).map(([k, v]) => <div key={k}><i>{k}:</i> {v}</div>)}
                  </div>
                </Html>
              )}
              <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
              <Fly fly={fly} />
            </Canvas>
          </WebGLGate>
          <Legend field={layout.colorField} legend={layout.legend} />
        </div>
      </div>
      <aside className="side">
        <h3>{shownFaces.length} faces · {model.field(view.face)?.label ?? '—'}</h3>
        <small>12 pentagons, then 20 hexagons, dealt in the field's order{deal.overflow ? `; ${deal.overflow} more values share the last face` : ''}. Click one to isolate it.</small>
        {solo != null && <button className="btn" style={{ width: '100%', margin: '6px 0' }} onClick={() => setSolo(null)}>Show all faces</button>}
        <div style={{ marginTop: 6 }}>
          {shownFaces.map((f) => (
            <button key={f.index} className={`btn face${solo === f.index ? ' on' : ''}`} style={{ opacity: f.count ? 1 : 0.45, borderLeft: `3px solid ${f.color}` }}
              onClick={() => { const next = solo === f.index ? null : f.index; setSolo(next); if (next != null) onSelect(f.members, `${model.field(view.face)?.label} = ${f.label}`); }}>
              {f.label}<span className="n">{f.count}</span>
              <div><small>{f.index < 12 ? 'pentagon' : 'hexagon'}{f.group ? ` · ${f.group}` : ''}</small></div>
            </button>
          ))}
        </div>
        <h3 style={{ marginTop: 12 }}>Corner weighting</h3>
        <small>Up to six number fields weight each face's corners.</small>
        <div style={{ marginTop: 4, maxHeight: 220, overflow: 'auto' }}>
          {numberFields.map((f) => (
            <label key={f.name} style={{ display: 'block', fontSize: 11 }}>
              <input type="checkbox" checked={corners.includes(f.name)} disabled={!corners.includes(f.name) && corners.length >= 6}
                onChange={(e) => changeView({ corners: e.target.checked ? [...corners, f.name] : corners.filter((n) => n !== f.name) })} /> {f.label}
            </label>
          ))}
        </div>
      </aside>
    </>
  );
}
