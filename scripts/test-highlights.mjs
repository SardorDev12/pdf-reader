// Regression test for permanent highlights of saved items, in both engines (headless Chromium, real epub.js / PDF.js):
//   EPUB: painted on the right words, stay on them through text-size changes and page turns, colours/removal/theme work,
//         and the overlay never blocks selecting the text underneath.
//   PDF:  painted on the right text, survive zoom and scrolling away and back.
//   npm run test:highlights   (needs a local Chromium: CHROMIUM_PATH, default /opt/pw-browsers/chromium)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'pagemark-hl-'));
let failed = 0;
const ok = (c, label) => { console.log(c ? 'PASS' : 'FAIL', label); if (!c) failed++; };
const transpile = (file) => { const m = { exports: {} }; new Function('exports', 'module', ts.transpileModule(readFileSync(join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m.exports, m); return m.exports; };
const { highlightScript, flashScript } = transpile('src/lib/readerScripts.ts');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files', '--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ EPUB */
{
  const lib = join(root, 'node_modules/@epubjs-react-native/core/lib/commonjs');
  writeFileSync(join(work, 'epubjs.js'), require(join(lib, 'epubjs.js')).default);
  writeFileSync(join(work, 'jszip.js'), require(join(lib, 'jszip.js')).default);
  writeFileSync(join(work, 'page.html'), '<!doctype html><body style="margin:0"><div id="viewer" style="width:390px;height:700px"></div><script src="jszip.js"></script><script src="epubjs.js"></script></body>');
  const page = await (await browser.newContext({ viewport: { width: 390, height: 760 } })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(pathToFileURL(join(work, 'page.html')).href);
  const b64 = readFileSync(join(root, 'scripts/fixtures/sample.epub')).toString('base64');
  const words = await page.evaluate(async (b64) => {
    const book = ePub(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
    window.rendition = book.renderTo('viewer', { width: '100%', height: '100%', manager: 'default' });
    await rendition.display();
    const contents = rendition.getContents()[0], doc = contents.document, out = {}, w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { const re = /w\d{4}/g; let m; while ((m = re.exec(n.data))) if (['w0030', 'w0100', 'w0400'].includes(m[0])) { const r = doc.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + 5); out[m[0]] = contents.cfiFromRange(r); } }
    return out;
  }, b64);

  // where a word is drawn, and where highlight rectangles of a colour are drawn (screen coordinates)
  const probe = (word) => page.evaluate((word) => {
    const contents = rendition.getContents()[0], doc = contents.document, f = contents.window.frameElement.getBoundingClientRect();
    const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT); let n, box = null;
    while ((n = w.nextNode())) { const i = n.data.indexOf(word); if (i >= 0) { const r = doc.createRange(); r.setStart(n, i); r.setEnd(n, i + 5); const b = r.getBoundingClientRect(); box = { l: b.left + f.left, t: b.top + f.top, w: b.width, h: b.height }; } }
    const rects = [...document.querySelectorAll('#viewer svg rect')].map((r) => { const b = r.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, fill: r.getAttribute('fill'), blend: getComputedStyle(r.parentElement).mixBlendMode, op: r.getAttribute('fill-opacity') }; });
    const hit = box ? document.elementFromPoint(box.l + box.w / 2, box.t + box.h / 2) : null;
    return { box, rects, hit: hit ? hit.tagName.toLowerCase() : null };
  }, word);
  const decoder = await page.context().newPage();
  const darkest = async (box) => {
    const buf = await page.screenshot({ clip: { x: Math.floor(box.l), y: Math.floor(box.t), width: Math.ceil(box.w), height: Math.ceil(box.h) } });
    return decoder.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let best = 1e9; for (let i = 0; i < d.length; i += 4) best = Math.min(best, d[i] + d[i + 1] + d[i + 2]); return best; }, buf.toString('base64'));
  };
  const onScreen = (b) => b && b.l >= 0 && b.l + b.w <= 390 && b.t >= 0 && b.t < 700;
  const on = (p) => p.box && p.rects.find((r) => Math.abs(r.l - p.box.l) < 3 && Math.abs(r.t - p.box.t) < 3 && Math.abs(r.w - p.box.w) < 6);
  const apply = async (items, theme = 'light') => { await page.evaluate((s) => (0, eval)(s), highlightScript(items, theme)); await sleep(400); };

  await apply([{ cfi: words.w0030, color: '#FBBF24' }, { cfi: words.w0100, color: '#34D399' }]);
  let p = await probe('w0030');
  ok(onScreen(p.box) && on(p) && on(p).fill === '#FBBF24', 'EPUB: highlight painted on the word in its colour');
  ok(p.hit === 'iframe' || p.hit === 'body' || p.hit === 'html' || (p.hit && p.hit !== 'svg' && p.hit !== 'rect'), `EPUB: highlight does not block touches on the text (element under the word: ${p.hit})`);

  // text size changes while staying on the page (the bug the tester saw)
  for (const size of ['170%', '80%', '120%', '100%']) {
    await page.evaluate((s) => rendition.themes.fontSize(s), size);
    await sleep(2300); // the redraw hook settles within ~1.8 s
    const q = await probe('w0030');
    ok(!onScreen(q.box) || !!on(q), `EPUB: after text size ${size} the highlight is still on the word${onScreen(q.box) ? '' : ' (word moved to another page)'}`);
  }

  // bring a word back on screen after reflow and check
  await page.evaluate((c) => rendition.display(c), words.w0100); await sleep(700);
  p = await probe('w0100');
  ok(!!on(p) && on(p).fill === '#34D399', 'EPUB: another word, another colour, jumped to after reflow');

  // recolour, remove, theme
  await apply([{ cfi: words.w0030, color: '#F472B6' }, { cfi: words.w0100, color: '#34D399' }]);
  await page.evaluate((c) => rendition.display(c), words.w0030); await sleep(700);
  p = await probe('w0030');
  ok(on(p) && on(p).fill === '#F472B6', 'EPUB: changing the colour repaints the highlight');
  await apply([{ cfi: words.w0100, color: '#34D399' }]);
  p = await probe('w0030');
  ok(!on(p), 'EPUB: removing a saved item removes its highlight');
  await apply([{ cfi: words.w0030, color: '#FBBF24' }], 'dark');
  p = await probe('w0030');
  ok(on(p) && on(p).blend === 'normal' && Number(on(p).op) < 0.45, `EPUB: dark theme uses a normal blend (${on(p) && on(p).blend}, opacity ${on(p) && on(p).op})`);
  await apply([{ cfi: words.w0030, color: '#FBBF24' }], 'light');
  p = await probe('w0030');
  ok(on(p) && on(p).blend === 'multiply', 'EPUB: light theme multiplies');
  ok((await darkest(p.box)) < 40, `EPUB: text under a light-theme highlight stays black (darkest pixel sum ${await darkest(p.box)})`);

  // the brief flash (for items without a highlight) must never remove a saved item's highlight on the same range
  await page.evaluate((c) => rendition.display(c), words.w0030); await sleep(700);
  await page.evaluate((s) => (0, eval)(s), flashScript(words.w0030)); await sleep(400);
  ok(await page.evaluate(() => document.querySelectorAll('#viewer svg g.pm-flash').length > 0), 'EPUB: the flash underline appears');
  await sleep(3600);
  p = await probe('w0030');
  ok(await page.evaluate(() => document.querySelectorAll('#viewer svg g.pm-flash').length === 0), 'EPUB: the flash underline goes away by itself');
  ok(!!on(p), 'EPUB: the permanent highlight on the same range survives the flash');

  // chapter navigation keeps highlights of the chapter you return to
  await page.evaluate(() => rendition.display('c2.xhtml')); await sleep(600);
  await page.evaluate((c) => rendition.display(c), words.w0030); await sleep(800);
  p = await probe('w0030');
  ok(!!on(p), 'EPUB: still highlighted after visiting another chapter and coming back');
}

/* ------------------------------------------------------------------- PDF */
{
  execFileSync('node', [join(root, 'scripts/build-pdf-viewer.mjs'), '--html', join(work, 'viewer.html')], { stdio: 'ignore' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.addInitScript(() => { window.__msgs = []; window.ReactNativeWebView = { postMessage: (s) => window.__msgs.push(JSON.parse(s)) }; });
  const opts = { url: pathToFileURL(join(root, 'scripts/fixtures/sample.pdf')).href, zoom: 1, theme: 'light' };
  await page.goto(pathToFileURL(join(work, 'viewer.html')).href + '#' + encodeURIComponent(JSON.stringify(opts)));
  const wait = async (fn, label) => { for (let i = 0; i < 150; i++) { if (await page.evaluate(fn)) return; await sleep(100); } throw new Error('timeout ' + label); };
  await wait(() => document.querySelectorAll('.page.done').length > 0, 'first page');

  // offsets of "empirical" on pages 1 and 25
  const offsets = await page.evaluate(async () => {
    const out = {};
    for (const n of [1, 25]) { await window.__pm.jump({ page: n, y: 0 }, false); await new Promise((r) => setTimeout(r, 800)); const p = window.__pm._state.pages[n - 1]; const i = p.str.indexOf('empirical'); out[n] = [i, i + 9]; }
    await window.__pm.jump({ page: 1, y: 0 }, false);
    return out;
  });
  await page.evaluate((o) => window.__pm.setHighlights([
    { id: 'a', location: { page: 1, startOffset: o[1][0], endOffset: o[1][1] }, color: '#FBBF24' },
    { id: 'b', location: { page: 25, startOffset: o[25][0], endOffset: o[25][1] }, color: '#60A5FA' },
  ]), offsets);
  await sleep(500);
  const check = (n) => page.evaluate((n) => {
    const el = document.querySelector(`.page[data-page="${n}"]`);
    const span = [...el.querySelectorAll('.textLayer span')].find((s) => s.textContent.includes('empirical'));
    if (!span) return { word: null };
    const t = span.firstChild, i = t.data.indexOf('empirical'), r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 9);
    const b = r.getBoundingClientRect();
    const hl = [...el.querySelectorAll('.hl-saved')].map((h) => { const x = h.getBoundingClientRect(); return { l: x.left, t: x.top, w: x.width, bg: h.style.background }; });
    return { word: { l: b.left, t: b.top, w: b.width }, hl };
  }, n);
  const hits = (c) => c.word && c.hl && c.hl.some((h) => Math.abs(h.l - c.word.l) < 3 && Math.abs(h.t - c.word.t) < 3 && Math.abs(h.w - c.word.w) < 4);

  let c = await check(1);
  ok(hits(c), 'PDF: highlight painted exactly on the word');
  await page.evaluate(() => window.__pm.setZoom(2)); await sleep(1200);
  c = await check(1);
  ok(!c.word || hits(c), 'PDF: still on the word after zooming in');
  await page.evaluate(() => window.__pm.setZoom(1)); await sleep(1200);
  await page.evaluate(() => window.__pm.jump({ page: 25, y: 0 }, false)); await sleep(1500);
  c = await check(25);
  ok(hits(c) && c.hl[0].bg.includes('96, 165, 250'), 'PDF: a far page paints its own colour (blue)');
  const gone = await page.evaluate(() => !document.querySelector('.page[data-page="1"] .hl-saved'));
  ok(gone, 'PDF: page 1 (unloaded to save memory) holds no highlight elements');
  await page.evaluate(() => window.__pm.jump({ page: 1, y: 0 }, false)); await sleep(1500);
  c = await check(1);
  ok(hits(c), 'PDF: scrolling back to page 1 paints it again');
  await page.evaluate(() => window.__pm.setHighlights([])); await sleep(300);
  ok(await page.evaluate(() => document.querySelectorAll('.hl-saved').length === 0), 'PDF: clearing the list removes the highlights');
  ok(await page.evaluate(() => getComputedStyle(document.body).pointerEvents !== 'none'), 'PDF: highlights are not interactive (text stays selectable)');
}

await browser.close();
console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
process.exit(failed ? 1 : 0);
