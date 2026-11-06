// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * Every viewer, framed by a throwaway host page, sent a payload over
 * viz.like.audio/host@1, and photographed (headless Chrome). Prints every
 * message each viewer sent back and fails when one does not fit the schema.
 *
 *   node scripts/screenshots.mjs [outDir] [payload.json]
 *
 * Needs a built dist/ and puppeteer (the monorepo root has it; or PUPPETEER=<path>).
 * Chrome: CHROME=<path>, else /usr/bin/google-chrome.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { validateMessage } from '../contract/validate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'shots'));
const PAYLOAD = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : null;
mkdirSync(OUT, { recursive: true });
const schema = JSON.parse(readFileSync(join(ROOT, 'contract/host@1/host.schema.json'), 'utf8'));

const findPuppeteer = () => {
  const tries = [process.env.PUPPETEER, join(ROOT, 'node_modules/puppeteer'), join(ROOT, '../../../../../node_modules/puppeteer')].filter(Boolean);
  for (const t of tries) if (existsSync(t)) return createRequire(import.meta.url).resolve(t);
  throw new Error('no puppeteer: set PUPPETEER=<path to node_modules/puppeteer>');
};
const puppeteer = (await import(pathToFileURL(findPuppeteer()).href)).default;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const HOST = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<iframe id="v" style="border:0;width:100vw;height:100vh"></iframe>
<script>
  window.got = [];
  addEventListener('message', (e) => { if (e.source === document.getElementById('v').contentWindow) got.push(e.data); });
  window.open1 = (src) => { got = []; document.getElementById('v').src = src; };
  window.send = (m) => document.getElementById('v').contentWindow.postMessage(m, location.origin);
</script>`;
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/host.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(HOST); }
  const p = join(ROOT, url);
  if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const { demoRecords, DEMO_SCHEMA } = await import('../src/core/demo.mjs');
const payload = PAYLOAD ?? { protocol: 'viz.like.audio/host@1', type: 'data', title: 'Demo — made-up stars', records: demoRecords(), schema: DEMO_SCHEMA };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let bad = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text()); });
  page.on('pageerror', (e) => console.log('  pageerror:', e.message));
  await page.goto(`${base}/host.html`);
  for (const v of ['2d', '3d', '4d', 'analyzer']) {
    await page.evaluate((src) => window.open1(src), `${base}/dist/${v}.html`);
    await page.waitForFunction(() => got.some((m) => m.type === 'ready'), { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 300));
    const frame = page.frames().find((f) => f.url().includes(`/dist/${v}.html`));
    await page.screenshot({ path: join(OUT, `${v}-empty.png`) });
    await page.evaluate((m) => window.send(m), payload);
    await page.waitForFunction(() => got.some((m) => m.type === 'fields'), { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1500));
    // Pick something, the way a host would see a click: select the first record and wait for it to draw.
    const first = await page.evaluate(() => got.find((m) => m.type === 'fields'));
    await page.evaluate((m) => window.send(m), { protocol: 'viz.like.audio/host@1', type: 'select', ids: [payload.records[0]?.[payload.schema?.id ?? 'id'] ?? 0] });
    if (v === 'analyzer') {
      // Focus the field the 2D viewer would put on X, as a host's `view` would.
      await page.evaluate((m) => window.send(m), { protocol: 'viz.like.audio/host@1', type: 'view', view: { focus: first.view.focus ?? null } });
    }
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: join(OUT, `${v}.png`) });
    if (v === '3d' || v === '4d') {
      // Fly: frames move the camera, and when they stop the camera stops (FLY_STALE_MS), never runs on.
      const shot = () => page.screenshot({ encoding: 'base64' });
      const before = await shot();
      await page.evaluate(async () => {
        for (let k = 0; k < 25; k++) { window.send({ protocol: 'viz.like.audio/host@1', type: 'fly', x: 0, y: 0, z: 0, yaw: 1, pitch: 0, roll: 0 }); await new Promise((r) => setTimeout(r, 30)); }
      });
      const during = await shot();
      await new Promise((r) => setTimeout(r, 400));
      const settled = await shot();
      await new Promise((r) => setTimeout(r, 900));
      const later = await shot();
      const moved = before !== during, stopped = settled === later;
      console.log(`  fly: camera moved ${moved}, stopped after frames stopped ${stopped}`);
      if (!moved || !stopped) bad++;
    }
    const got = await page.evaluate(() => got);
    console.log(`${v}: ${got.map((m) => m.type).join(', ')}`);
    for (const m of got) {
      const errs = validateMessage(schema, 'toHost', m);
      if (errs.length) { bad++; console.log(`  ${m.type} does not fit: ${errs.join('; ')}`); }
      if (m.type === 'fields') console.log(`  read ${m.records} records, ${m.fields.length} fields; view ${JSON.stringify(m.view)}`);
      if (m.type === 'error') console.log(`  error: ${m.message}`);
    }
    void frame;
  }
  // The standalone pages: the index and the demo state, with no host at all.
  await page.goto(`${base}/dist/index.html`);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: join(OUT, 'index.png') });
} finally {
  await browser.close();
  server.close();
}
console.log(`screenshots in ${OUT}`);
process.exit(bad ? 1 : 0);
