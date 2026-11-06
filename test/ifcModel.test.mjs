// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// An .ifc on the 3D page: web-ifc's meshes (foreign-room.meshes.json, what web-ifc 0.0.78 gave for
// the IfcOpenShell-written foreign-room.ifc through the shared loader) as a Y-up scene.
// The browser engine itself is exercised headless by scripts/ifc-render.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isIfc, sceneOf, loadIfcModel, classColor } from '../src/core/ifcModel.mjs';

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url);
const model = JSON.parse(readFileSync(fx('foreign-room.meshes.json'), 'utf8'));
const ifcText = readFileSync(fx('foreign-room.ifc'), 'utf8');

test('an .ifc is known by its name or its STEP header; JSON and CSV are not', () => {
  assert.equal(isIfc('room.IFC'), true);
  assert.equal(isIfc('x.bin', ifcText.slice(0, 2000)), true);
  assert.equal(isIfc('data.json', '[{"a":1}]'), false);
  assert.equal(isIfc('data.csv', 'a,b\n1,2'), false);
});

test('the room as a scene: centred, longest side = span, floor on y = 0, Z-up turned Y-up', () => {
  const s = sceneOf(model, { span: 30 });
  assert.equal(s.products, 6);
  assert.deepEqual(s.size.map(Math.round), [6000, 4000, 3200]);
  assert.equal(s.scale, 30 / 6000);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of s.meshes) for (let i = 0; i < m.positions.length; i += 3) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a], m.positions[i + a]); hi[a] = Math.max(hi[a], m.positions[i + a]);
  }
  const r = (v) => Math.round(v * 100) / 100;
  assert.deepEqual(lo.map(r), [-15, 0, -10]);
  assert.deepEqual(hi.map(r), [15, 16, 10]); // 3200 mm tall (slab 200 + walls 3000) = 16 units
  // the rack (centred 4500, 2500 mm, 2 m tall) stands right of the room's centre and north of it, so toward -z
  const rack = s.meshes.find((m) => m.type === 'IfcAudioVisualAppliance');
  const ys = []; const zs = [];
  for (let i = 0; i < rack.positions.length; i += 3) { ys.push(rack.positions[i + 1]); zs.push(rack.positions[i + 2]); }
  assert.equal(r(Math.max(...ys) - Math.min(...ys)), 10);
  const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
  const xs = []; for (let i = 0; i < rack.positions.length; i += 3) xs.push(rack.positions[i]);
  assert.equal(r((Math.max(...xs) + Math.min(...xs)) / 2), 7.5);
  assert.equal(r((Math.max(...zs) + Math.min(...zs)) / 2), -2.5);
  assert.ok(mean(zs) < 0);
});

test('the legend: one row per class, counted in products, one colour each', () => {
  const s = sceneOf(model);
  assert.deepEqual(s.classes.map((c) => [c.type, c.count]), [['IfcWall', 4], ['IfcAudioVisualAppliance', 1], ['IfcSlab', 1]]);
  assert.equal(classColor('IfcWall'), '#94a3b8');
  assert.equal(classColor('IfcSomethingNew'), classColor('IfcSomethingNew'));
});

test('loadIfcModel asks the engine only when handed an .ifc, and says when there is nothing to draw', async () => {
  let asked = 0;
  const engine = async () => { asked++; return { meshes: async () => ({ ...model, version: '0.0.78' }) }; };
  const m = await loadIfcModel(new TextEncoder().encode(ifcText), 'foreign-room.ifc', engine);
  assert.equal(asked, 1);
  assert.equal(m.title, 'foreign-room.ifc');
  assert.equal(m.schema, 'IFC4X3_ADD2');
  assert.equal(m.products, 6);
  const none = async () => ({ meshes: async () => ({ meshes: [] }) });
  await assert.rejects(loadIfcModel(new Uint8Array(), 'empty.ifc', none), /no geometry to draw/);
});
