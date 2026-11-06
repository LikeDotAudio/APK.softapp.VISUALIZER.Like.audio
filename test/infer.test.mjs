// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// What the viewers read from contents they were never told about.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, proposeView, judgeKind, flatten, missingRoles, sameGrouping } from '../src/core/infer.mjs';
import { VIEWERS } from '../src/core/viewers.mjs';
import { axisScale, colorScale, shapeScale, niceTicks } from '../src/core/scale.mjs';
import { describe, correlations, percentile } from '../src/core/stats.mjs';
import { principalComponents } from '../src/core/pca.mjs';

const kindOf = (m, name) => m.field(name)?.kind;

test('flatten reads nested objects as dotted paths and keeps number arrays whole', () => {
  assert.deepEqual(flatten({ a: { b: { c: 1 } }, v: [1, 2], s: ['x', 'y'], o: [{ k: 1, t: 'a' }, { k: 2 }] }), { 'a.b.c': 1, v: [1, 2], s: 'x, y', 'o.length': 2, 'o[].k Σ': 3 });
});

test('kinds come from the values', () => {
  const recs = Array.from({ length: 40 }, (_, i) => ({
    uid: `u-${i}`, title: `Thing number ${i}`, maker: ['Acme', 'Bolt', 'Core'][i % 3],
    watts: i * 1.5, volts: String(110 + (i % 2) * 120), on: i % 2 === 0, made: `2026-0${1 + (i % 9)}-1${i % 10}`,
    hue: ['#ff0000', '#00ff00'][i % 2], vec: [i, i * 2, i % 5, 1], notes: `${'long free text '.repeat(6)}${i}`,
    meta: { size: { w: i } }, serial: 1000 + i,
  }));
  const m = buildModel(recs);
  assert.equal(kindOf(m, 'uid'), 'id');
  assert.equal(kindOf(m, 'title'), 'label');
  assert.equal(kindOf(m, 'maker'), 'category');
  assert.equal(kindOf(m, 'watts'), 'number');
  assert.equal(kindOf(m, 'volts'), 'number', 'numeric strings are numbers');
  assert.equal(kindOf(m, 'on'), 'category');
  assert.equal(kindOf(m, 'made'), 'time');
  assert.equal(kindOf(m, 'hue'), 'color');
  assert.equal(kindOf(m, 'vec'), 'vector');
  assert.equal(kindOf(m, 'notes'), 'text');
  assert.equal(kindOf(m, 'meta.size.w'), 'number');
  assert.equal(kindOf(m, 'serial'), 'id', 'unique integers named like an identifier');
  assert.equal(m.idField, 'uid');
  assert.equal(m.labelField, 'title');
  assert.equal(m.labelOf(3), 'Thing number 3');
  assert.equal(m.idOf(3), 'u-3');
  assert.equal(m.indexOfId('u-7'), 7);
  // A four-wide vector yields its components and three principal components.
  for (const d of ['vec[0]', 'vec[3]', 'vec · PC1', 'vec · PC3']) assert.equal(kindOf(m, d), 'number', d);
});

test('a hint wins over a guess', () => {
  const m = buildModel([{ t: 1700000000000, c: 1 }, { t: 1700000100000, c: 2 }, { t: 1700000200000, c: 1 }], { fields: { t: { kind: 'time' }, c: { kind: 'category', order: ['2', '1'] } } });
  assert.equal(kindOf(m, 't'), 'time');
  assert.deepEqual(m.field('c').order, ['2', '1']);
});

test('no id field: the index is the id', () => {
  const m = buildModel([{ a: 1 }, { a: 2 }]);
  assert.equal(m.idField, null);
  assert.equal(m.idOf(1), 1);
  assert.equal(m.labelOf(1), '#2');
});

test('proposals fill each viewer\'s required roles from numbers first, colour from a modest category', () => {
  const recs = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, a: i, b: (i * 7) % 13, c: Math.sin(i), d: i % 2 ? 'x' : 'y', grp: `g${i % 5}` }));
  const m = buildModel(recs);
  const v3 = proposeView(m, VIEWERS['3d'].needs, {});
  assert.deepEqual(new Set([v3.x, v3.y, v3.z]), new Set(['a', 'b', 'c']));
  assert.equal(v3.color, 'grp', 'five values beat two for colour');
  assert.equal(v3.shape, null);
  const v4 = proposeView(m, VIEWERS['4d'].needs, {});
  assert.equal(v4.face, 'grp');
  assert.deepEqual(missingRoles(m, VIEWERS['4d'].needs, v4), []);
  // A hint naming a real field is kept; one naming nothing is replaced.
  const h = proposeView(m, VIEWERS['2d'].needs, { x: 'c', y: 'nope', color: null });
  assert.equal(h.x, 'c');
  assert.ok(h.y && h.y !== 'c');
  assert.equal(h.color, null);
});

test('too little to draw is said, not drawn', () => {
  const m = buildModel([{ name: 'one', v: 1 }, { name: 'two', v: 2 }]);
  const v = proposeView(m, VIEWERS['3d'].needs, {});
  assert.ok(missingRoles(m, VIEWERS['3d'].needs, v).length > 0);
});

test('scales: numbers span -1..1, robust clamps an outlier, categories band in order, missing is the centre', () => {
  const m = buildModel([...Array.from({ length: 50 }, (_, i) => ({ v: i, k: ['b', 'a'][i % 2] })), { v: 10000, k: null }]);
  const s = axisScale(m.field('v'), m.col('v'));
  assert.equal(s(0), -1);
  assert.equal(s(50), 1);
  const r = axisScale(m.field('v'), m.col('v'), { robust: true });
  assert.equal(r(50), 1);
  assert.ok(r(25) > -0.1 && r(25) < 0.1, 'robust keeps the bulk spread');
  const k = axisScale(m.field('k'), m.col('k'), { jitterBand: 0 });
  assert.equal(k(1), -1, 'a sorts first');
  assert.equal(k(0), 1);
  assert.equal(k(50), 0);
  const c = colorScale(m.field('k'), m.col('k'));
  assert.equal(c.legend.length, 2);
  assert.notEqual(c.color(0), c.color(1));
  const sh = shapeScale(buildModel([{ s: 'cube' }, { s: 'torus' }, { s: 'cube' }]).field('s'), ['cube', 'torus', 'cube']);
  assert.equal(sh.shape(1), 'torus', 'values that are shape names keep their shape');
  assert.deepEqual(niceTicks(0, 10, 5), [0, 2, 4, 6, 8, 10]);
});

test('stats: describe, outliers, correlations, percentile', () => {
  const col = [...Array.from({ length: 99 }, (_, i) => i % 10), 500];
  const d = describe({ kind: 'number' }, col, 100);
  assert.equal(d.count, 100);
  assert.equal(d.max, 500);
  assert.deepEqual(d.outliers, [99]);
  assert.equal(d.histogram.reduce((a, b) => a + b.count, 0), 100);
  const a = [1, 2, 3, 4, 5], b = [2, 4, 6, 8, 10], c = [5, 4, 3, 2, 1];
  const cor = correlations(['a', 'b', 'c'], (n) => ({ a, b, c })[n]);
  assert.ok(Math.abs(cor.matrix[0][1] - 1) < 1e-12);
  assert.ok(Math.abs(cor.matrix[0][2] + 1) < 1e-12);
  assert.equal(percentile(a, 3), 0.6);
  const cat = describe({ kind: 'category' }, ['x', 'y', 'x', null], 4);
  assert.deepEqual(cat.top[0], { value: 'x', count: 2 });
  assert.equal(cat.missing, 1);
});

test('PCA finds the direction the data spreads along', () => {
  const vs = Array.from({ length: 50 }, (_, i) => [i, i * 2 + (i % 3) * 0.01, 5]);
  const [pc1] = principalComponents(vs, 1);
  const r = correlations(['p', 'i'], (n) => (n === 'p' ? pc1 : vs.map((v) => v[0])));
  assert.ok(r.matrix[0][1] > 0.999);
});

test('a bare string field with judgeKind: few repeats is a category, all-unique short tokens are ids', () => {
  assert.equal(judgeKind('x', ['a', 'b', 'a', 'b'], 4), 'category');
  assert.equal(judgeKind('x', ['k1', 'k2', 'k3'], 3), 'id');
  assert.equal(judgeKind('x', ['one thing', 'two things', 'three'], 3), 'label');
});

test('an axis one outlier stretches is not proposed first; 4D colour is not the face field again', async () => {
  const { demoRecords, DEMO_SCHEMA } = await import('../src/core/demo.mjs');
  const m = buildModel(demoRecords(), DEMO_SCHEMA);
  const v = proposeView(m, VIEWERS['3d'].needs, {});
  assert.ok(![v.x, v.y].includes('luminosity'), `luminosity (one 9000 among ~1s) was proposed: ${JSON.stringify(v)}`);
  const v4 = proposeView(m, VIEWERS['4d'].needs, {});
  assert.notEqual(v4.color, v4.face);
});

test('a category that only relabels another is not a second axis; numbers come before categories', () => {
  const recs = Array.from({ length: 90 }, (_, i) => ({ maker: `m${i % 30}`, makerName: `Maker ${i % 30}`, cat: `c${i % 6}`, n: i % 7, ports: [{ count: i % 4 }] }));
  const m = buildModel(recs);
  assert.equal(sameGrouping(m, 'maker', 'makerName'), true);
  assert.equal(sameGrouping(m, 'maker', 'cat'), false);
  const v = proposeView(m, VIEWERS['3d'].needs, {});
  assert.deepEqual([v.x, v.y].sort(), ['n', 'ports[].count Σ'].sort());
  assert.ok(['cat', 'maker', 'makerName'].includes(v.z));
  // Only three categories, two of them the same split: the relabel is used last, rather than leave Z empty.
  const m2 = buildModel(recs.map(({ n, ports, ...r }) => r));
  const v2 = proposeView(m2, VIEWERS['3d'].needs, {});
  assert.deepEqual(missingRoles(m2, VIEWERS['3d'].needs, v2), []);
  assert.ok([v2.x, v2.y, v2.z].includes('cat'));
});
