// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * 3D — an .ifc model's geometry (ROAD-3598, answer 1). The meshes are web-ifc's,
 * through the shared loader (src/core/ifcModel.mjs); this draws them: one
 * BufferGeometry per mesh, coloured by IFC class, with its crease edges, on the
 * same orbit and six-axis fly as the point cloud. Hover names the product.
 */
import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Fly } from './Cloud3D.jsx';
import { WebGLGate } from './WebGLGate.jsx';

function Piece({ mesh, hovered, onHover }) {
  const { geometry, edges } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices instanceof Uint32Array ? mesh.indices : new Uint32Array(mesh.indices), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return { geometry: g, edges: new THREE.EdgesGeometry(g, 20) };
  }, [mesh]);
  useEffect(() => () => { geometry.dispose(); edges.dispose(); }, [geometry, edges]);
  const lit = hovered === mesh.expressID;
  return (
    <group>
      <mesh geometry={geometry}
        onPointerOver={(e) => { e.stopPropagation(); onHover({ id: mesh.expressID, at: e.point.toArray(), name: mesh.name, type: mesh.type }); }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null); }}>
        <meshStandardMaterial color={lit ? '#ffffff' : mesh.color} roughness={0.85} metalness={0.05}
          transparent={mesh.type === 'IfcSpace' || mesh.type === 'IfcWindow'} opacity={mesh.type === 'IfcSpace' ? 0.18 : mesh.type === 'IfcWindow' ? 0.5 : 1}
          side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#0B0E14" transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

export default function Model3D({ model, fly }) {
  const [hover, setHover] = useState(null);
  const h = (model.size?.[2] ?? 0) * (model.scale ?? 1);
  return (
    <div className="canvas">
      <WebGLGate what="3D model" resetKey={model}>
        <Canvas camera={{ position: [24, 18 + h, 30], fov: 50 }} style={{ touchAction: 'none' }}
          aria-label={`Three-dimensional model ${model.title}: ${model.products} products`}>
          <color attach="background" args={['#0B0E14']} />
          <hemisphereLight args={['#dbeafe', '#1e293b', 0.9]} />
          <directionalLight position={[20, 40, 25]} intensity={1.4} />
          <directionalLight position={[-25, 15, -20]} intensity={0.4} />
          <gridHelper args={[60, 30, '#334155', '#1e293b']} position={[0, -0.01, 0]} />
          {model.meshes.map((m) => <Piece key={m.key} mesh={m} hovered={hover?.id} onHover={setHover} />)}
          {hover && (
            <Html position={hover.at} style={{ pointerEvents: 'none', zIndex: 100 }}>
              <div className="tip" style={{ position: 'static', transform: 'translate(16px, calc(-100% - 12px))' }}>
                <b>{hover.name || `#${hover.id}`}</b><div><i>class:</i> {hover.type}</div>
              </div>
            </Html>
          )}
          <OrbitControls makeDefault enablePan enableZoom enableRotate target={[0, h / 2, 0]} />
          <Fly fly={fly} />
        </Canvas>
      </WebGLGate>
      <div className="legend">
        <div style={{ marginBottom: 3 }}>IFC class</div>
        {model.classes.map((c) => (
          <div key={c.type} className="item"><span className="sw" style={{ background: c.color }} />{c.type}<span style={{ color: 'var(--muted)' }}>{c.count}</span></div>
        ))}
      </div>
    </div>
  );
}
