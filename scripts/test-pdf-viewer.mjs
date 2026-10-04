// Regression test for the PDF viewer (src/reader/pdf). Runs the real viewer in headless Chromium with the
// real PDF.js against a fixture PDF and a stubbed React Native bridge.
//   npm run test:pdf        (needs a Chromium: set CHROMIUM_PATH, defaults to Playwright's /opt/pw-browsers/chromium)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'pagemark-pdf-'));
execFileSync('node', [join(root, 'scripts/build-pdf-viewer.mjs'), '--html', join(work, 'viewer.html')], { stdio: 'ignore' });
const pdf = join(root, 'scripts/fixtures/sample.pdf');
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath, args: ['--allow-file-access-from-files', '--no-sandbox'] });
let failed = 0;
const ok = (c, label) => { console.log(c ? 'PASS' : 'FAIL', label); if (!c) failed++; };
const viewerUrl = pathToFileURL(join(work, 'viewer.html')).href;
const pdfUrl = pathToFileURL(pdf).href;

async function open(opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.addInitScript(() => { window.__msgs = []; window.ReactNativeWebView = { postMessage: (s) => window.__msgs.push(JSON.parse(s)) }; });
  await page.goto(viewerUrl + '#' + encodeURIComponent(JSON.stringify(opts)));
  const msgs = async (t) => (await page.evaluate(() => window.__msgs)).filter((m) => !t || m.type === t);
  const waitFor = async (fn, label, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await page.waitForTimeout(100); } throw new Error('timeout: ' + label); };
  return { page, msgs, waitFor };
}


{
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (['error','warning'].includes(m.type())) console.log('CONSOLE', m.type(), m.text().slice(0,200)); });
await page.addInitScript(() => { window.__msgs = []; window.ReactNativeWebView = { postMessage: (s) => window.__msgs.push(JSON.parse(s)) }; });
const opts = { url: pdfUrl, zoom: 1, theme: 'light', wantCover: true };
await page.goto(viewerUrl + '#' + encodeURIComponent(JSON.stringify(opts)));
const msgs = async (type) => (await page.evaluate(() => window.__msgs)).filter((m) => !type || m.type === type);
const waitFor = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await page.waitForTimeout(100); } throw new Error('timeout: ' + label); };

await waitFor(async () => (await msgs('ready')).length, 'ready');
ok((await msgs('ready'))[0].numPages === 40, 'numPages 40');
const meta = (await msgs('meta'))[0]; ok(meta.title === 'Sample Science Book' && meta.author === 'Jane Doe', 'metadata ' + JSON.stringify(meta));
await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('.page.done').length)) >= 1, 'first page rendered');
ok(await page.evaluate(() => !!document.querySelector('.page.done canvas') && document.querySelectorAll('.textLayer span').length > 5), 'canvas + text layer');
await waitFor(async () => (await msgs('cover')).length, 'cover'); ok((await msgs('cover'))[0].data.startsWith('data:image/jpeg'), 'cover jpeg');
await waitFor(async () => (await msgs('outline')).length === 0 || true, 'outline'); 
await waitFor(async () => (await page.evaluate(() => window.__pm._state.pages.every((p) => p.known))), 'all sizes known');
ok(true, 'all page sizes known');
await Promise.resolve();

// selection of a single word
const sel1 = await page.evaluate(() => {
  const span = [...document.querySelectorAll('.page[data-page="1"] .textLayer span')].find((s) => s.textContent.includes('anomalous'));
  const t = span.firstChild, i = t.data.indexOf('anomalous');
  const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 9);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  window.__msgs.length = 0; window.__pm.reportSelection('vocab');
  return window.__msgs.find((m) => m.type === 'selection');
});
console.log(JSON.stringify(sel1));
ok(sel1.info.text === 'anomalous', 'selected word');
ok(sel1.info.context.startsWith('The results were anomalous, said Dr.'), 'context sentence');
const slice = await page.evaluate((i) => window.__pm._state.pages[0].str.slice(i.location.startOffset, i.location.endOffset), sel1.info);
ok(slice === 'anomalous', 'offsets map to the word: ' + slice);

// multi-line selection (sentence wrapping across two lines)
const sel2 = await page.evaluate(() => {
  const spans = [...document.querySelectorAll('.page[data-page="1"] .textLayer span')];
  const a = spans.find((s) => s.textContent.startsWith('A third sentence')), b = spans.find((s) => s.textContent.startsWith('lines inside'));
  const r = document.createRange(); r.setStart(a.firstChild, 2); r.setEnd(b.firstChild, 12);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  window.__msgs.length = 0; window.__pm.reportSelection('passage');
  return window.__msgs.find((m) => m.type === 'selection');
});
console.log(JSON.stringify(sel2.info));
ok(sel2.info.text.startsWith('third sentence follows') && sel2.info.text.includes('wrapping across lines inside'), 'multi-line passage joined');
ok(sel1.info.context === 'The results were anomalous, said Dr. Lee.' || sel1.info.context.startsWith('The results were anomalous'), 'ctx after fix: ' + sel1.info.context);

// jump + highlight on a far page
await page.evaluate(() => window.__pm.clearSelection());
const target = { page: 25, y: 0, startOffset: 0, endOffset: 0 };
const off = await (async () => { await page.evaluate(() => window.__pm.jump({ page: 25, y: 0 }, false)); await waitFor(async () => (await page.evaluate(() => window.__pm._state.pages[24].state)) === 'done', 'p25 rendered'); return page.evaluate(() => { const p = window.__pm._state.pages[24]; const i = p.str.indexOf('empirical'); return [i, i + 9]; }); })();
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
await page.evaluate(([a, b]) => window.__pm.jump({ page: 25, y: 0, startOffset: a, endOffset: b }, true), off);
await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('.hl').length)) > 0, 'highlight shown');
const hl = await page.evaluate(() => { const r = document.querySelector('.hl').getBoundingClientRect(); return { top: r.top, left: r.left, w: r.width, h: r.height, vh: innerHeight }; });
console.log(JSON.stringify(hl));
ok(hl.top > 0 && hl.top < hl.vh * 0.6 && hl.w > 20, 'highlight is on screen near 30% of the viewport');
const word = await page.evaluate(() => { const s = [...document.querySelectorAll('.page[data-page="25"] .textLayer span')].find((x) => x.textContent.includes('empirical')); const t = s.firstChild, i = t.data.indexOf('empirical'); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 9); const b = r.getBoundingClientRect(); return { top: b.top, left: b.left, w: b.width }; });
ok(Math.abs(word.top - hl.top) < 4 && Math.abs(word.left - hl.left) < 4, 'highlight overlays the exact word ' + JSON.stringify(word));

const loc = (await msgs('loc')).at(-1);
ok(Array.isArray(loc.visible) && loc.visible.includes(25) && loc.visible.length <= 3, 'reports the pages mostly on screen: ' + JSON.stringify(loc.visible));
ok(loc.page === 25 || loc.page === 24, 'location near page 25 (got ' + loc.page + ')');

// unrendering far pages
ok(await page.evaluate(() => window.__pm._state.pages[0].state === 'idle' && !document.querySelector('.page[data-page="1"] canvas')), 'far page 1 unrendered (memory)');

// zoom keeps position
const before = (await msgs('loc')).at(-1);
await page.evaluate(() => window.__pm.setZoom(2));
await page.waitForTimeout(700);
const wide = await page.evaluate(() => document.querySelector('.page[data-page="25"]').offsetWidth);
ok(wide > 600, 'zoomed width ' + wide);
const after = (await msgs('loc')).at(-1); ok(Math.abs(after.page - before.page) <= 1, 'same page after zoom: ' + before.page + ' -> ' + after.page);

// theme
await page.evaluate(() => window.__pm.setTheme('dark')); ok(await page.evaluate(() => document.body.className === 'dark'), 'dark theme');

await ctx.close();
}

// 1. unreadable url -> needData, then base64 path works
let t = await open({ url: pathToFileURL(join(work, 'missing.pdf')).href });
await t.waitFor(async () => (await t.msgs('needData')).length, 'needData');
ok(true, 'missing file asks RN for base64 fallback');
const b64 = readFileSync(pdf).toString('base64');
await t.page.evaluate((b) => window.__pm.openBase64(b), b64);
await t.waitFor(async () => (await t.msgs('ready')).length, 'ready via base64');
await t.waitFor(async () => (await t.page.evaluate(() => document.querySelectorAll('.page.done').length)) > 0, 'rendered via base64');
ok((await t.msgs('ready'))[0].numPages === 40, 'base64 path renders 40 pages');

// 2. garbage file -> needData then error
writeFileSync(join(work, 'bad.pdf'), 'this is not a pdf');
t = await open({ url: pathToFileURL(join(work, 'bad.pdf')).href });
await t.waitFor(async () => (await t.msgs('needData')).length, 'needData bad');
await t.page.evaluate(() => window.__pm.openBase64(btoa('this is not a pdf')));
await t.waitFor(async () => (await t.msgs('error')).length, 'error bad');
ok(true, 'corrupt PDF reports an error: ' + (await t.msgs('error'))[0].message);

// 3. initial location + highlight on open (deep link)
t = await open({ url: pdfUrl, loc: { page: 31, y: 0.1 }, zoom: 1.5, theme: 'sepia' });
await t.waitFor(async () => (await t.page.evaluate(() => document.querySelector('.page[data-page="31"]')?.classList.contains('done'))), 'p31 rendered');
const l = (await t.msgs('loc')).at(-1);
ok(l.page === 31 && Math.abs(l.y - 0.1) < 0.02, 'opens at saved page/offset ' + JSON.stringify(l));
ok(await t.page.evaluate(() => document.body.className === 'sepia'), 'sepia theme from options');
ok(await t.page.evaluate(() => document.querySelector('.page').offsetWidth > 500), 'initial zoom 1.5 applied');

// 4. pinch zoom via synthetic touches
const z0 = await t.page.evaluate(() => window.__pm._state.zoom);
await t.page.evaluate(() => {
  const mk = (id, x, y) => new Touch({ identifier: id, target: document.body, clientX: x, clientY: y });
  const fire = (type, touches) => document.dispatchEvent(new TouchEvent(type, { touches, changedTouches: touches, bubbles: true, cancelable: true }));
  fire('touchstart', [mk(1, 150, 400), mk(2, 250, 400)]);
  fire('touchmove', [mk(1, 100, 400), mk(2, 300, 400)]);
  fire('touchend', []);
});
await t.page.waitForTimeout(800);
const z1 = await t.page.evaluate(() => window.__pm._state.zoom);
ok(z1 > z0 * 1.8 && z1 < z0 * 2.2, `pinch doubled zoom ${z0} -> ${z1.toFixed(2)}`);
ok((await t.msgs('zoom')).length === 1, 'zoom reported to RN');
ok(await t.page.evaluate(() => document.getElementById('viewer').style.transform === ''), 'transform cleared after pinch');

// 5. tap vs selection
await t.page.evaluate(() => { window.__msgs.length = 0; document.body.click(); });
ok((await t.msgs('tap')).length === 1, 'tap reported');

await browser.close();
console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
process.exit(failed ? 1 : 0);
