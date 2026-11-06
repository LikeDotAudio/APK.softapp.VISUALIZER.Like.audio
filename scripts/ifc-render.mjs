// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * A FOREIGN .ifc on the 3D page, rendered headless and photographed (ROAD-3598,
 * answer 1). Serves dist/ and the file, opens dist/3d.html?ifc=<file>, and fails
 * unless the page drew the model through web-ifc (its bar names the products and
 * the engine) and fetched the engine as published — and unless a ?demo page
 * fetched none of it.
 *
 *   node scripts/ifc-render.mjs [model.ifc] [out.png]
 *
 * Needs a built dist/ and puppeteer (the monorepo root has it; or PUPPETEER=<path>).
 * Chrome: CHROME=<path>, else /usr/bin/google-chrome.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const IFC = resolve(process.argv[2] ?? join(ROOT, 'test/fixtures/foreign-room.ifc'));
const OUT = resolve(process.argv[3] ?? join(ROOT, 'shots/ifc-3d.png'));

const findPuppeteer = () => {
  const tries = [process.env.PUPPETEER, join(ROOT, 'node_modules/puppeteer'), join(ROOT, '../../../../../node_modules/puppeteer')].filter(Boolean);
  for (const t of tries) if (existsSync(t)) return createRequire(import.meta.url).resolve(t);
  throw new Error('no puppeteer: set PUPPETEER=<path to node_modules/puppeteer>');
};
const puppeteer = (await import(pathToFileURL(findPuppeteer()).href)).default;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.ifc': 'application/x-step' };
const fetched = [];
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = p === '/model.ifc' ? IFC : join(DIST, p);
  if ((p !== '/model.ifc' && !f.startsWith(DIST)) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  fetched.push(p);
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));

  await page.goto(`${base}/3d.html?demo`, { waitUntil: 'networkidle0' });
  check(!fetched.some((p) => /apk-webifc|web-ifc/.test(p)), 'a page drawing records fetched no engine');

  await page.goto(`${base}/3d.html?ifc=${encodeURIComponent('/model.ifc')}`, { waitUntil: 'networkidle0' });
  const drawn = await page.waitForFunction(() => /products · IFC[\w]+ · .* mm · web-ifc /.test(document.querySelector('.bar')?.innerText ?? ''), { timeout: 60000 })
    .then(() => true, () => false);
  check(drawn, `${basename(IFC)} drawn through web-ifc`);
  check(fetched.includes('/vendor/apk-webifc/apk-webifc.js') && fetched.includes('/vendor/apk-webifc/web-ifc/web-ifc.wasm'), 'the shared loader and web-ifc.wasm were fetched');
  check(await page.$('canvas') !== null, 'a WebGL canvas is on the page');
  console.log(`     ${(await page.evaluate(() => document.querySelector('.bar')?.innerText ?? '')).replace(/\n+/g, ' | ')}`);
  console.log(`     legend: ${(await page.evaluate(() => document.querySelector('.legend')?.innerText ?? '')).replace(/\n+/g, ' ')}`);
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: OUT });
  console.log(`shot ${OUT}`);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
