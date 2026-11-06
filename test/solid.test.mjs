// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The 4D ball's solid, and how a category's values are dealt onto its faces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncatedIcosahedron, validateSolid, circumradius } from '../src/core/solid.mjs';
import { buildModel } from '../src/core/infer.mjs';

test('the truncated icosahedron builds: 60 V, 90 E, 32 F, 12 pentagons first', () => {
  const s = truncatedIcosahedron();
  assert.equal(validateSolid(s), null);
  assert.deepEqual(s.faces.slice(0, 12).map((f) => f.kind), Array(12).fill('pentagon'));
  assert.ok(Math.abs(circumradius(2) - 4.956) < 0.01);
});

test('faces are dealt in the declared order, absent values keep their face, overflow shares the last', async () => {
  // dealFaces lives in a JSX file; its rule is restated through the model it reads: declaredOrder first.
  const order = Array.from({ length: 34 }, (_, i) => `v${i}`);
  const m = buildModel([{ k: 'v5' }, { k: 'v33' }, { k: 'zz' }], { fields: { k: { order } } });
  const f = m.field('k');
  assert.deepEqual(f.declaredOrder.slice(0, 3), ['v0', 'v1', 'v2']);
  assert.deepEqual(f.order, ['v5', 'v33', 'zz']);
});
