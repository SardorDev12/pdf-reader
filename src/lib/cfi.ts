/**
 * Minimal EPUB CFI ordering, enough to answer "is this saved item on the visible page?" without asking the WebView.
 * Validated against epub.js's own CFI.compare (see scripts/test-epub-visible.mjs).
 *
 * A CFI is a path of numbered steps (spine item, element, text node ...) ending in an optional character offset:
 *   epubcfi(/6/14[ch3]!/4/2/6/1:12)          a point
 *   epubcfi(/6/14!/4/2,/6/1:0,/8/1:9)        a range: common path + start + end
 * Two positions are ordered by comparing their step numbers left to right, then the offset.
 */

type Point = { steps: number[]; offset: number };

// "[assertion]" parts (which may contain ^-escaped characters) carry no ordering information
const ASSERTION = /\[(?:[^\]^]|\^.)*\]/g;

function parsePath(path: string): Point | null {
  const steps: number[] = [];
  let offset = 0;
  for (const m of path.replace(ASSERTION, '').matchAll(/\/(\d+)(?::(\d+))?/g)) {
    steps.push(Number(m[1]));
    if (m[2] !== undefined) offset = Number(m[2]);
  }
  return steps.length ? { steps, offset } : null;
}

/** Start and end of a CFI (a point is its own start and end). null if it cannot be understood. */
export function cfiEnds(cfi: string): [Point, Point] | null {
  const m = /^epubcfi\((.*)\)$/.exec(cfi.trim());
  if (!m) return null;
  const parts = m[1].replace(ASSERTION, '').split(',');
  if (parts.length === 1) {
    const p = parsePath(parts[0]);
    return p ? [p, p] : null;
  }
  if (parts.length !== 3) return null;
  const start = parsePath(parts[0] + parts[1]);
  const end = parsePath(parts[0] + parts[2]);
  return start && end ? [start, end] : null;
}

function comparePoints(a: Point, b: Point): number {
  const n = Math.min(a.steps.length, b.steps.length);
  for (let i = 0; i < n; i++) {
    if (a.steps[i] !== b.steps[i]) return a.steps[i] < b.steps[i] ? -1 : 1;
  }
  // one path is a prefix of the other: the shorter one (the element itself) comes first
  if (a.steps.length !== b.steps.length) return a.steps.length < b.steps.length ? -1 : 1;
  return a.offset === b.offset ? 0 : a.offset < b.offset ? -1 : 1;
}

/** Orders two CFIs by their start positions: -1, 0 or 1 (null if either cannot be parsed). */
export function compareCfi(a: string, b: string): number | null {
  const pa = cfiEnds(a), pb = cfiEnds(b);
  return pa && pb ? comparePoints(pa[0], pb[0]) : null;
}

/** True when any part of the item's CFI (point or range) lies within the page spanning pageStart..pageEnd. */
export function cfiOnPage(itemCfi: string, pageStart: string, pageEnd: string): boolean {
  const item = cfiEnds(itemCfi), start = cfiEnds(pageStart), end = cfiEnds(pageEnd);
  if (!item || !start || !end) return false;
  return comparePoints(item[0], end[0]) <= 0 && comparePoints(item[1], start[0]) >= 0;
}
