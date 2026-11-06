// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The contract, its samples, and the viewer's own messages held to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkSamples, validateMessage, messageTypes } from '../contract/validate.mjs';
import { PROTOCOL, message, connectViewer, asData } from '../src/core/bridge.mjs';
import { VIEWERS, VERSION } from '../src/core/viewers.mjs';
import { buildModel, proposeView, fieldsReport } from '../src/core/infer.mjs';
import { demoRecords, DEMO_SCHEMA } from '../src/core/demo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const schema = JSON.parse(readFileSync(join(ROOT, 'contract/host@1/host.schema.json'), 'utf8'));
const samples = JSON.parse(readFileSync(join(ROOT, 'contract/host@1/samples.json'), 'utf8'));

test('the schema is the output of scripts/write-contract.py (edit the script, not the JSON)', () => {
  execFileSync('python3', [join(ROOT, 'scripts/write-contract.py'), '--check']);
});

test('every sample fits, one of each message both ways', () => {
  assert.deepEqual(checkSamples(schema, samples), []);
  assert.deepEqual(messageTypes(schema, 'toViewer'), ['data', 'fly', 'hello', 'select', 'view']);
  assert.deepEqual(messageTypes(schema, 'toHost'), ['error', 'fields', 'pick', 'ready', 'select', 'view']);
});

test('the bridge speaks the schema\'s protocol', () => {
  assert.equal(PROTOCOL, schema['x-protocol']);
});

test('the validator is the CAD\'s, unchanged (when the CAD is checked out beside us)', (t) => {
  const cad = join(ROOT, '../../EDITORS/EDITORS.CAD.Like.audio/contract/validate.mjs');
  if (!existsSync(cad)) return t.skip('no CAD checkout beside this repo');
  assert.equal(readFileSync(join(ROOT, 'contract/validate.mjs'), 'utf8'), readFileSync(cad, 'utf8'));
});

/** A fake window pair: the viewer's window with a parent that records what it is sent. */
function fakeWindows() {
  const posted = [];
  const listeners = [];
  const parent = { postMessage: (m, o) => posted.push({ m, o }) };
  const w = { parent, addEventListener: (t, fn) => listeners.push(fn), removeEventListener: () => {} };
  const fire = (data, source = parent, origin = 'http://host.example') => listeners.forEach((fn) => fn({ data, source, origin }));
  return { w, parent, posted, fire };
}

for (const [id, v] of Object.entries(VIEWERS)) {
  test(`${id}: ready, fields and an error all fit toHost`, () => {
    const { w, posted, fire } = fakeWindows();
    const got = [];
    const bridge = connectViewer({ viewer: id, needs: v.needs, version: VERSION, w, handlers: { data: (m) => got.push(m) } });
    assert.equal(posted[0].o, '*', 'ready goes to any origin');
    assert.deepEqual(validateMessage(schema, 'toHost', posted[0].m), []);
    // A data message from the host reaches the handler; the answer goes to the host's origin.
    fire(samples.toViewer.find((m) => m.type === 'data'));
    assert.equal(got.length, 1);
    const model = buildModel(got[0].records, got[0].schema);
    const view = proposeView(model, v.needs, got[0].schema.view);
    bridge.send('fields', { fields: fieldsReport(model), view, records: model.n });
    assert.equal(posted[1].o, 'http://host.example');
    assert.deepEqual(validateMessage(schema, 'toHost', posted[1].m), []);
    assert.deepEqual(validateMessage(schema, 'toHost', message('error', { code: 'too-few-fields', message: 'x' })), []);
  });
}

test('a message from anyone but the host is not heard; nor is another protocol', () => {
  const { w, fire } = fakeWindows();
  const got = [];
  connectViewer({ viewer: '3d', needs: VIEWERS['3d'].needs, w, handlers: { data: (m) => got.push(m) } });
  fire(message('data', { records: [] }), { postMessage() {} });
  fire({ protocol: 'cad.like.audio/host@1', type: 'data', records: [] });
  assert.equal(got.length, 0);
});

test('the demo is a valid data message, and every viewer can draw it', () => {
  const m = message('data', { records: demoRecords(), schema: DEMO_SCHEMA, title: 'Demo' });
  assert.deepEqual(validateMessage(schema, 'toViewer', m), []);
  const model = buildModel(m.records, m.schema);
  for (const [id, v] of Object.entries(VIEWERS)) {
    const view = proposeView(model, v.needs, {});
    for (const need of v.needs.filter((n) => n.required)) assert.ok(view[need.role], `${id} has no ${need.role}`);
  }
});

test('asData takes an array, a data body, or an object holding an array of records', () => {
  assert.equal(asData([{ a: 1 }]).records.length, 1);
  assert.equal(asData({ records: [{ a: 1 }], title: 't' }).title, 't');
  assert.equal(asData({ parts: [{ a: 1 }, { a: 2 }], total: 2 }).records.length, 2);
  assert.throws(() => asData({ total: 2 }));
});
