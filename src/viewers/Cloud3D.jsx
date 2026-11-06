// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * 3D — three fields as space. Moved here from SCANALYZER.Like.audio's
 * SampleCloud.tsx (2026-11-06, ROAD-3571), with everything it knew about
 * samples taken out: the axes, colour, size and shape are whatever fields the
 * view names, read through src/core/scale.mjs, so a field lands in the same
 * place it does in 2D and on the 4D ball.
 *
 * Kept from the original, because they were right:
 *   - one InstancedMesh per shape, capacity only ever grown (shrinking it makes
 *     R3F rebuild the GPU buffers on every filter), and the bounding sphere
 *     recomputed after every matrix rewrite or picking goes blind;
 *   - every hook above the empty-bucket return (a hook after a conditional
 *     return throws the moment one shape's bucket empties);
 *   - the selection's wireframe breathes while the host says it is playing;
 *   - arrow keys walk the pick to the nearest point in that screen direction;
 *   - six-axis flying (a SpaceMouse): dolly, truck, pedestal, orbit and roll,
 *     per second, never through the target. The frames now come from the host
 *     (`fly`), which decides whether a frame is fit to fly; this flies what it
 *     is sent, and stops when frames stop (FLY_STALE_MS).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { axisScale, colorScale, sizeScale, shapeScale, SHAPES } from '../core/scale.mjs';
import { Legend } from './Legend.jsx';
import { cardRows } from './Tip.jsx';
import { WebGLGate } from './WebGLGate.jsx';

const SPAN = 30; // world units each axis is spread over
const ROLES = ['x', 'y', 'z', 'color', 'size', 'shape'];

function rotationFor(shape) {
  if (shape === 'pyramid') return [Math.PI / 2, Math.PI / 4, 0];
  if (shape === 'diamond' || shape === 'cube' || shape === 'icosahedron' || shape === 'dodecahedron') return [Math.PI / 4, 0, Math.PI / 4];
  if (shape === 'cylinder' || shape === 'disc' || shape === 'torus') return [Math.PI / 2, 0, 0];
  return [0, 0, 0];
}

function Geometry({ shape, k = 1 }) {
  switch (shape) {
    case 'cylinder': return <cylinderGeometry args={[0.5 * k, 0.5 * k, 0.9 * k, 16]} />;
    case 'disc': return <cylinderGeometry args={[0.6 * k, 0.6 * k, 0.15 * k, 16]} />;
    case 'diamond': return <octahedronGeometry args={[0.6 * k, 0]} />;
    case 'pyramid': return <coneGeometry args={[0.6 * k, 0.9 * k, 4]} />;
    case 'cube': return <boxGeometry args={[0.8 * k, 0.8 * k, 0.8 * k]} />;
    case 'torus': return <torusGeometry args={[0.5 * k, 0.2 * k, 12, 16]} />;
    case 'icosahedron': return <icosahedronGeometry args={[0.6 * k, 0]} />;
    case 'dodecahedron': return <dodecahedronGeometry args={[0.55 * k, 0]} />;
    default: return <sphereGeometry args={[0.5 * k, 10, 10]} />;
  }
}

function Axes({ labels }) {
  const L = SPAN / 2 + 2;
  const style = { fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none', textShadow: '0 0 3px #000' };
  return (
    <group>
      <Line points={[[-L, 0, 0], [L, 0, 0]]} color="#4e9af1" lineWidth={1} transparent opacity={0.4} />
      <Line points={[[0, -L, 0], [0, L, 0]]} color="#0ea5e9" lineWidth={1} transparent opacity={0.4} />
      <Line points={[[0, 0, -L], [0, 0, L]]} color="#aaaaaa" lineWidth={1} transparent opacity={0.4} />
      <Html position={[L + 1, 0, 0]} center><span style={{ ...style, color: '#4e9af1' }}>X · {labels[0]}</span></Html>
      <Html position={[0, L + 1, 0]} center><span style={{ ...style, color: '#0ea5e9' }}>Y · {labels[1]}</span></Html>
      <Html position={[0, 0, L + 1]} center><span style={{ ...style, color: '#cbd5e1' }}>Z · {labels[2]}</span></Html>
    </group>
  );
}

function ShapeMesh({ shape, bucket, onPick, onHover }) {
  const ref = useRef(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const [capacity, setCapacity] = useState(Math.max(100, bucket.index.length));
  if (bucket.index.length > capacity) setCapacity(bucket.index.length);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh || !bucket.index.length) return;
    const limit = Math.min(bucket.index.length, mesh.instanceMatrix.array.length / 16);
    mesh.count = limit;
    const rot = rotationFor(shape);
    for (let k = 0; k < limit; k++) {
      dummy.position.set(...bucket.pos[k]);
      dummy.rotation.set(...rot);
      dummy.scale.setScalar(bucket.size[k]);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      mesh.setColorAt(k, bucket.color[k]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [bucket, shape, dummy, capacity]);

  useEffect(() => () => { document.body.style.cursor = 'auto'; }, []);
  if (!bucket.index.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, capacity]}
      onClick={(e) => { e.stopPropagation(); if (e.instanceId != null) onPick(bucket.index[e.instanceId]); }}
      onPointerOver={(e) => { e.stopPropagation(); if (e.instanceId != null) { onHover(bucket.index[e.instanceId]); document.body.style.cursor = 'pointer'; } }}
      onPointerOut={(e) => { e.stopPropagation(); onHover(null); document.body.style.cursor = 'auto'; }}>
      <Geometry shape={shape} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Points({ model, view, selected, pulse, onPick, onHover, layout }) {
  const { camera } = useThree();

  // Arrow keys move the pick to the nearest point that way on screen.
  useEffect(() => {
    const onKey = (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const s = selected[0];
      if (s == null || !layout.all[s]) return;
      e.preventDefault();
      const sel = new THREE.Vector3(...layout.all[s]).project(camera);
      const p = new THREE.Vector3();
      let best = -1, bestScore = Infinity;
      for (let i = 0; i < layout.all.length; i++) {
        if (i === s) continue;
        p.set(...layout.all[i]).project(camera);
        const dx = p.x - sel.x, dy = p.y - sel.y;
        const [along, perp] = e.key === 'ArrowRight' ? [dx, Math.abs(dy)] : e.key === 'ArrowLeft' ? [-dx, Math.abs(dy)] : e.key === 'ArrowUp' ? [dy, Math.abs(dx)] : [-dy, Math.abs(dx)];
        if (along <= 0 || perp > along) continue;
        const score = Math.hypot(dx, dy);
        if (score < bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0) onPick(best);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layout, selected, onPick, camera]);

  const selRef = useRef(null);
  const base = useRef(1);
  useFrame(({ clock }) => {
    const m = selRef.current;
    if (!m) return;
    if (pulse) {
      const s = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 10);
      m.scale.setScalar(base.current * (1 + 0.35 * s));
      m.material.opacity = 0.5 + 0.45 * s;
    } else {
      m.scale.setScalar(base.current);
      m.material.opacity = 0.9;
    }
  });

  const s = selected[0];
  const selPos = s != null ? layout.all[s] : null;
  const selShape = s != null ? layout.shapeOf[s] : 'sphere';
  base.current = (s != null ? layout.sizeOf[s] : 0.7) * 0.5 + 0.6;

  return (
    <>
      {SHAPES.map((sh) => <ShapeMesh key={sh} shape={sh} bucket={layout.buckets[sh]} onPick={onPick} onHover={onHover} />)}
      {selected.slice(1, 200).map((i) => layout.all[i] && (
        <mesh key={i} position={layout.all[i]}><sphereGeometry args={[0.9, 8, 8]} /><meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.5} /></mesh>
      ))}
      {selPos && (
        <mesh ref={selRef} position={selPos} rotation={rotationFor(selShape)} scale={base.current}>
          <Geometry shape={selShape} k={1.2} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.9} />
        </mesh>
      )}
    </>
  );
}

// Six axes onto six camera moves. Rates are per second; `delta` makes a 20 Hz
// beat and a 144 Hz redraw fly at the same speed.
const FLY_DOLLY = 18, FLY_TRUCK = 14, FLY_ORBIT = 1.6, FLY_ROLL = 1.2, FLY_DEAD = 0.002;
/** A frame older than this is not flown: the host stopped sending, so the hand is not there. */
export const FLY_STALE_MS = 200;

export function Fly({ fly }) {
  const { camera, controls } = useThree();
  useFrame((_s, delta) => {
    const { frame: f, at } = fly.current;
    if (!f || performance.now() - at > FLY_STALE_MS) return;
    const step = Math.min(delta, 0.1);
    const target = controls?.target ?? new THREE.Vector3();
    const v = new THREE.Vector3().subVectors(camera.position, target);
    const radius = v.length();
    if (!(radius > 0)) return;
    const yaw = Math.abs(f.yaw) > FLY_DEAD ? -f.yaw * FLY_ORBIT * step : 0;
    const pitch = Math.abs(f.pitch) > FLY_DEAD ? f.pitch * FLY_ORBIT * step : 0;
    if (yaw) v.applyAxisAngle(camera.up.clone().normalize(), yaw);
    if (pitch) v.applyAxisAngle(new THREE.Vector3().crossVectors(v, camera.up).normalize(), pitch);
    if (Math.abs(f.y) > FLY_DEAD) v.setLength(Math.max(1.5, Math.min(500, radius - f.y * FLY_DOLLY * step)));
    const right = new THREE.Vector3().crossVectors(v, camera.up).normalize();
    const pan = new THREE.Vector3();
    if (Math.abs(f.x) > FLY_DEAD) pan.addScaledVector(right, f.x * FLY_TRUCK * step);
    if (Math.abs(f.z) > FLY_DEAD) pan.addScaledVector(camera.up.clone().normalize(), f.z * FLY_TRUCK * step);
    if (pan.lengthSq() > 0) target.add(pan);
    if (Math.abs(f.roll) > FLY_DEAD) camera.up.applyAxisAngle(v.clone().normalize(), -f.roll * FLY_ROLL * step).normalize();
    camera.position.copy(target).add(v);
    camera.lookAt(target);
    controls?.update?.();
  });
  return null;
}

export default function Cloud3D({ model, view, selected, pulse, onPick, fly }) {
  const [hover, setHover] = useState(null);
  const signs = view.signs ?? [1, 1, 1];

  const layout = useMemo(() => {
    const ax = ['x', 'y', 'z'].map((r, k) => axisScale(model.field(view[r]), model.col(view[r]), { sign: signs[k] || 1 }));
    const c = colorScale(model.field(view.color), model.col(view.color));
    const sz = sizeScale(model.field(view.size), model.col(view.size));
    const sh = shapeScale(model.field(view.shape), model.col(view.shape));
    const buckets = Object.fromEntries(SHAPES.map((s) => [s, { pos: [], color: [], size: [], index: [] }]));
    const all = new Array(model.n), shapeOf = new Array(model.n), sizeOf = new Array(model.n);
    for (let i = 0; i < model.n; i++) {
      const p = [ax[0](i) * SPAN / 2, ax[1](i) * SPAN / 2, ax[2](i) * SPAN / 2];
      const shape = sh.shape(i), size = 0.7 * sz(i);
      all[i] = p; shapeOf[i] = shape; sizeOf[i] = size;
      const b = buckets[shape];
      b.pos.push(p); b.color.push(new THREE.Color(c.color(i))); b.size.push(size); b.index.push(i);
    }
    return { buckets, all, shapeOf, sizeOf, legend: c.legend, colorField: model.field(view.color) };
  }, [model, view.x, view.y, view.z, view.color, view.size, view.shape, signs[0], signs[1], signs[2]]); // eslint-disable-line react-hooks/exhaustive-deps

  const labels = ['x', 'y', 'z'].map((r) => model.field(view[r])?.label ?? '—');
  const hoverCard = hover != null && layout.all[hover] && (
    <Html position={layout.all[hover]} style={{ pointerEvents: 'none', zIndex: 100 }}>
      <div className="tip" style={{ position: 'static', transform: 'translate(22px, calc(-100% - 18px))' }}>
        <b>{model.labelOf(hover)}</b>
        {cardRows(model, hover, view, ROLES).map(([k, v]) => <div key={k}><i>{k}:</i> {v}</div>)}
      </div>
    </Html>
  );

  return (
    <div className="canvas">
      <WebGLGate what="3D view" resetKey={model}>
        <Canvas camera={{ position: [0, 0, 45], fov: 60 }} style={{ touchAction: 'none' }}
          aria-label={`Three-dimensional point cloud of ${model.n} records`}>
          <color attach="background" args={['#0B0E14']} />
          <ambientLight intensity={0.7} />
          {view.axes !== false && <Axes labels={labels} />}
          <Points model={model} view={view} selected={selected} pulse={pulse} onPick={onPick} onHover={setHover} layout={layout} />
          {hoverCard}
          <OrbitControls makeDefault enablePan enableZoom enableRotate />
          <Fly fly={fly} />
        </Canvas>
      </WebGLGate>
      <Legend field={layout.colorField} legend={layout.legend} />
    </div>
  );
}
