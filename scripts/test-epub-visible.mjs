// Regression test: "which saved words are on the visible EPUB page?" (src/lib/readerScripts.ts visibleScript).
// Runs the real script inside the same epub.js build the app embeds, in headless Chromium, and compares its answer
// with where each word is actually rendered on screen.   npm run test:epub
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'pagemark-epub-'));

// the app's own epub.js / jszip builds + the production script, transpiled from TypeScript
const lib = join(root, 'node_modules/@epubjs-react-native/core/lib/commonjs');
writeFileSync(join(work, 'epubjs.js'), require(join(lib, 'epubjs.js')).default);
writeFileSync(join(work, 'jszip.js'), require(join(lib, 'jszip.js')).default);
writeFileSync(join(work, 'page.html'), '<!doctype html><body style="margin:0"><div id="viewer" style="width:390px;height:700px"></div><script src="jszip.js"></script><script src="epubjs.js"></script></body>');
const js = ts.transpileModule(readFileSync(join(root, 'src/lib/readerScripts.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', js)(mod.exports, mod);
const { visibleScript } = mod.exports;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 760 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => { window.__msgs = []; window.ReactNativeWebView = { postMessage: (s) => window.__msgs.push(JSON.parse(s)) }; });
await page.goto(pathToFileURL(join(work, 'page.html')).href);
const b64 = readFileSync(join(root, 'scripts/fixtures/sample.epub')).toString('base64');

// open the book (as the app's template does) and collect a CFI for every 5th word of chapter 1
const words = await page.evaluate(async (b64) => {
  const book = ePub(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
  window.book = book;
  window.rendition = book.renderTo('viewer', { width: '100%', height: '100%', manager: 'default' });
  await window.rendition.display();
  const contents = window.rendition.getContents()[0], doc = contents.document;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  window.__ranges = []; const out = []; const all = []; let n, k = 0;
  while ((n = walker.nextNode())) {
    const re = /w\d{4}/g; let m;
    while ((m = re.exec(n.data))) {
      all.push({ node: n, at: m.index });
      if (k++ % 5 === 0) {
        const r = doc.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + 5);
        window.__ranges.push(r); out.push({ id: m[0], cfi: contents.cfiFromRange(r) });
      }
    }
  }
  // a saved passage that starts on the last line of page 1 and ends on the first line of page 2
  const delta = window.rendition.manager.layout.delta;
  const pageOf = (t) => { const r = doc.createRange(); r.setStart(t.node, t.at); r.setEnd(t.node, t.at + 5); return Math.floor(r.getBoundingClientRect().left / delta); };
  const lastOnP1 = [...all].reverse().find((t) => pageOf(t) === 0), firstOnP2 = all.find((t) => pageOf(t) === 1);
  const span = doc.createRange(); span.setStart(lastOnP1.node, lastOnP1.at); span.setEnd(firstOnP2.node, firstOnP2.at + 5);
  out.push({ id: 'SPAN', cfi: contents.cfiFromRange(span) });
  return out;
}, b64);

let failed = 0;
const ok = (c, label) => { console.log(c ? 'PASS' : 'FAIL', label); if (!c) failed++; };
ok(words.length > 100, `collected ${words.length} item CFIs (incl. a passage crossing the page 1/2 break)`);
const spanCfi = words.find((w) => w.id === 'SPAN').cfi;
ok(/^epubcfi\(.*,.*,.*\)$/.test(spanCfi), 'the straddling passage is a range CFI: ' + spanCfi);

let chapter1Pages = 0, chapter2Pages = 0;
for (let i = 0; i < 40; i++) {
  const here = await page.evaluate(() => {
    const loc = window.rendition.currentLocation();
    return loc && loc.start ? { href: loc.start.href, cfi: loc.start.cfi } : null;
  });
  if (!here) break;
  const rid = 'r' + i;
  await page.evaluate(([src]) => { window.__msgs.length = 0; (0, eval)(src); }, [visibleScript(rid, words)]);
  const ids = (await page.evaluate(() => window.__msgs)).find((m) => m.type === 'srVisible' && m.rid === rid)?.ids;
  if (here.href.includes('c1')) {
    chapter1Pages++;
    // ground truth: the word is rendered inside the visible column area
    const truth = await page.evaluate(() => {
      const c = window.rendition.manager.container.getBoundingClientRect();
      const f = window.rendition.getContents()[0].window.frameElement.getBoundingClientRect();
      return window.__ranges.map((r) => { const b = r.getBoundingClientRect(); return { id: r.toString(), full: b.left + f.left >= c.left - 1 && b.right + f.left <= c.right + 1, any: b.right + f.left > c.left + 1 && b.left + f.left < c.right - 1 }; });
    });
    const full = truth.filter((t) => t.full).map((t) => t.id), any = truth.filter((t) => t.any).map((t) => t.id);
    const missing = full.filter((id) => !ids.includes(id));
    const real = ids.filter((id) => id !== 'SPAN');
    ok(real.length > 0 && !missing.length && real.every((id) => any.includes(id)), `chapter 1 page ${chapter1Pages}: ${real.length} words, matches the screen`);
    ok(ids.includes('SPAN') === (chapter1Pages <= 2), `chapter 1 page ${chapter1Pages}: straddling passage ${ids.includes('SPAN') ? 'shown' : 'hidden'} (expected ${chapter1Pages <= 2 ? 'shown' : 'hidden'})`);
  } else {
    chapter2Pages++;
    ok(Array.isArray(ids) && ids.length === 0, `chapter 2 page ${chapter2Pages}: no chapter-1 words (${ids && ids.length})`);
  }
  await page.evaluate(() => window.rendition.next());
  await page.waitForTimeout(80);
  const after = await page.evaluate(() => window.rendition.currentLocation()?.start?.cfi);
  if (after === here.cfi) break;
}
ok(chapter1Pages >= 4 && chapter2Pages >= 4, `walked ${chapter1Pages} + ${chapter2Pages} pages`);
await browser.close();
console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
process.exit(failed ? 1 : 0);
