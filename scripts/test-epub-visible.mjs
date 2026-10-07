// Regression test for "which saved items are on the visible EPUB page?" (src/lib/cfi.ts).
// Runs the same epub.js build the app embeds in headless Chromium and checks that
//   1. our CFI ordering agrees with epub.js's own CFI.compare, and
//   2. the items we say are on a page are exactly the words rendered on that page (incl. a passage that
//      straddles a page break and words in another chapter).
//   npm run test:epub   (needs a local Chromium: CHROMIUM_PATH, default /opt/pw-browsers/chromium)
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

const lib = join(root, 'node_modules/@epubjs-react-native/core/lib/commonjs');
writeFileSync(join(work, 'epubjs.js'), require(join(lib, 'epubjs.js')).default);
writeFileSync(join(work, 'jszip.js'), require(join(lib, 'jszip.js')).default);
writeFileSync(join(work, 'page.html'), '<!doctype html><body style="margin:0"><div id="viewer" style="width:390px;height:700px"></div><script src="jszip.js"></script><script src="epubjs.js"></script></body>');
const js = ts.transpileModule(readFileSync(join(root, 'src/lib/cfi.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', js)(mod.exports, mod);
const { compareCfi, cfiOnPage } = mod.exports;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 760 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(pathToFileURL(join(work, 'page.html')).href);
const b64 = readFileSync(join(root, 'scripts/fixtures/sample.epub')).toString('base64');

let failed = 0;
const ok = (c, label) => { console.log(c ? 'PASS' : 'FAIL', label); if (!c) failed++; };

// open the book like the app's template does; collect a CFI for every word in both chapters, built from real DOM ranges
const { words, chapter2 } = await page.evaluate(async (b64) => {
  const book = ePub(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
  const rendition = book.renderTo('viewer', { width: '100%', height: '100%', manager: 'default' });
  window.rendition = rendition; window.C = new ePub.CFI();
  await rendition.display();
  const collect = () => {
    const contents = rendition.getContents()[0], doc = contents.document;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const out = []; let n;
    while ((n = walker.nextNode())) {
      const re = /w\d{4}/g; let m;
      while ((m = re.exec(n.data))) {
        const r = doc.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + 5);
        out.push({ id: m[0], cfi: contents.cfiFromRange(r), node: n, at: m.index });
      }
    }
    return out;
  };
  window.__collect = collect; // re-reads the live page (the iframe is replaced when we navigate)
  const c1 = collect();
  // a saved passage that starts on the last line of page 1 and ends on the first line of page 2
  const contents = rendition.getContents()[0], doc = contents.document, delta = rendition.manager.layout.delta;
  const pageOf = (t) => { const r = doc.createRange(); r.setStart(t.node, t.at); r.setEnd(t.node, t.at + 5); return Math.floor(r.getBoundingClientRect().left / delta); };
  const a = [...c1].reverse().find((t) => pageOf(t) === 0), b = c1.find((t) => pageOf(t) === 1);
  const span = doc.createRange(); span.setStart(a.node, a.at); span.setEnd(b.node, b.at + 5);
  const spanItem = { id: 'SPAN', cfi: contents.cfiFromRange(span) };
  await rendition.display('c2.xhtml');
  const c2 = collect();
  await rendition.display(0);
  const strip = (l) => l.map(({ id, cfi }) => ({ id, cfi }));
  return { words: [...strip(c1), spanItem], chapter2: strip(c2) };
}, b64);

ok(words.length > 500 && chapter2.length > 500, `collected ${words.length - 1} + ${chapter2.length} word CFIs and a page-straddling passage`);

// 1. ordering agrees with epub.js for a large, mixed sample of pairs (same chapter, across chapters, ranges vs points)
const all = [...words, ...chapter2];
const sample = all.filter((_, i) => i % 17 === 0);
const pages = [];
for (let i = 0; i < 10; i++) {
  const loc = await page.evaluate(() => { const l = window.rendition.currentLocation(); return { start: l.start.cfi, end: l.end.cfi, href: l.start.href }; });
  pages.push(loc);
  const before = loc.start;
  await page.evaluate(() => window.rendition.next());
  await page.waitForTimeout(60);
  if ((await page.evaluate(() => window.rendition.currentLocation().start.cfi)) === before) break;
}
const probes = [...sample.map((s) => s.cfi), ...pages.flatMap((p) => [p.start, p.end])];
const pairs = [];
for (const a of probes) for (const b of probes) pairs.push([a, b]);
const theirs = await page.evaluate((pairs) => pairs.map(([a, b]) => { try { return window.C.compare(a, b); } catch (e) { return null; } }), pairs);
let mismatches = 0, checked = 0;
for (let i = 0; i < pairs.length; i++) {
  if (theirs[i] === null) continue;
  checked++;
  // epub.js compares ranges by their start; so do we
  if (compareCfi(pairs[i][0], pairs[i][1]) !== theirs[i]) { if (mismatches++ < 3) console.log('   mismatch', pairs[i], 'epub.js', theirs[i], 'ours', compareCfi(pairs[i][0], pairs[i][1])); }
}
ok(checked > 5000 && mismatches === 0, `CFI ordering agrees with epub.js on ${checked} pairs (${mismatches} mismatches)`);

// 2. per page: our answer vs what is actually rendered
await page.evaluate(() => window.rendition.display(0));
await page.waitForTimeout(100);
let c1Pages = 0, c2Pages = 0;
for (let i = 0; i < 40; i++) {
  const here = await page.evaluate(() => { const l = window.rendition.currentLocation(); return l && l.start ? { start: l.start.cfi, end: l.end.cfi, href: l.start.href } : null; });
  if (!here) break;
  const onPage = (list) => list.filter((w) => cfiOnPage(w.cfi, here.start, here.end)).map((w) => w.id);
  if (here.href.includes('c1')) {
    c1Pages++;
    const truth = await page.evaluate(() => {
      const c = window.rendition.manager.container.getBoundingClientRect();
      const f = window.rendition.getContents()[0].window.frameElement.getBoundingClientRect();
      return window.__collect().map((t) => { const r = t.node.ownerDocument.createRange(); r.setStart(t.node, t.at); r.setEnd(t.node, t.at + 5); const b = r.getBoundingClientRect(); return { id: t.id, full: b.left + f.left >= c.left - 1 && b.right + f.left <= c.right + 1, any: b.right + f.left > c.left + 1 && b.left + f.left < c.right - 1 }; });
    });
    const ours = onPage(words).filter((id) => id !== 'SPAN');
    const full = truth.filter((t) => t.full).map((t) => t.id), any = new Set(truth.filter((t) => t.any).map((t) => t.id));
    ok(ours.length > 10 && full.every((id) => ours.includes(id)) && ours.every((id) => any.has(id)), `chapter 1 page ${c1Pages}: ${ours.length} words, exactly those on screen`);
    ok(onPage(words).includes('SPAN') === (c1Pages <= 2), `chapter 1 page ${c1Pages}: straddling passage ${onPage(words).includes('SPAN') ? 'shown' : 'hidden'}`);
    ok(onPage(chapter2).length === 0, `chapter 1 page ${c1Pages}: no chapter-2 words`);
  } else {
    c2Pages++;
    ok(onPage(words).length === 0 && onPage(chapter2).length > 10, `chapter 2 page ${c2Pages}: only chapter-2 words (${onPage(chapter2).length}), no chapter-1 words`);
  }
  await page.evaluate(() => window.rendition.next());
  await page.waitForTimeout(80);
  if ((await page.evaluate(() => window.rendition.currentLocation()?.start?.cfi)) === here.start) break;
}
ok(c1Pages >= 4 && c2Pages >= 4, `walked ${c1Pages} + ${c2Pages} pages`);

await browser.close();
console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
process.exit(failed ? 1 : 0);
