/* Pagemark PDF viewer. Runs inside a WebView with PDF.js (3.x) loaded before this file.
 * Talks to React Native through window.ReactNativeWebView.postMessage and window.__pm. */
(function () {
  'use strict';

  var OPTS = window.__PM_OPTS;
  if (!OPTS) {
    try { OPTS = JSON.parse(decodeURIComponent(location.hash.slice(1))); } catch (e) { OPTS = {}; }
  }
  var RN = window.ReactNativeWebView;
  function post(o) {
    try { if (RN) RN.postMessage(JSON.stringify(o)); } catch (e) { /* ignore */ }
  }

  var pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
    new Blob([window.__PM_WORKER__], { type: 'text/javascript' })
  );

  var MAX_PIXELS = 12e6;
  var MIN_ZOOM = 0.5;
  var MAX_ZOOM = 4;
  var viewer = document.getElementById('viewer');
  var S = {
    pdf: null, n: 0, pages: [], base: { w: 612, h: 792 }, zoom: OPTS.zoom || 1, scale: 1,
    theme: OPTS.theme || 'light', sizesTo: 0, lastSel: null, outline: [],
  };

  /* ------------------------------ helpers -------------------------------- */

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function vw() { return document.documentElement.clientWidth; }
  function vh() { return window.innerHeight; }

  function showMessage(text) {
    var el = document.getElementById('msg');
    if (!el) { el = document.createElement('div'); el.id = 'msg'; document.body.appendChild(el); }
    el.textContent = text; el.style.display = 'flex';
  }

  function applyTheme(t) {
    S.theme = t;
    var colors = { light: ['#ffffff', '#ffffff'], sepia: ['#f4ecd8', '#f4ecd8'], dark: ['#16181d', '#16181d'] }[t] || ['#ffffff', '#ffffff'];
    document.documentElement.style.setProperty('--bg', colors[0]);
    document.documentElement.style.setProperty('--page', colors[1]);
    document.body.className = t === 'sepia' || t === 'dark' ? t : '';
  }

  function b64ToBytes(b64) {
    var bin = atob(b64), len = bin.length, out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ------------------------------- layout -------------------------------- */

  function computeScale() { S.scale = Math.max(0.1, ((vw() - 16) / S.base.w) * S.zoom); }

  function sizePage(p) {
    var w = (p.known ? p.w : S.base.w) * S.scale;
    var h = (p.known ? p.h : S.base.h) * S.scale;
    p.el.style.width = w + 'px';
    p.el.style.height = h + 'px';
  }

  function layoutAll() {
    for (var i = 0; i < S.pages.length; i++) sizePage(S.pages[i]);
  }

  /** A page learned its true size: update it and keep the reading position steady. */
  function learnSize(p, w, h) {
    if (p.known && Math.abs(p.w - w) < 0.01 && Math.abs(p.h - h) < 0.01) return;
    var oldTop = p.el.offsetTop, oldH = p.el.offsetHeight;
    p.w = w; p.h = h; p.known = true;
    sizePage(p);
    var delta = p.el.offsetHeight - oldH;
    if (delta && oldTop + oldH <= window.scrollY + 1) window.scrollBy(0, delta);
  }

  function pageTopIndex(y) {
    var lo = 0, hi = S.pages.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (S.pages[mid].el.offsetTop <= y) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function curLoc() {
    if (!S.pages.length) return { page: 1, y: 0 };
    var y = window.scrollY + 4;
    var i = pageTopIndex(y), p = S.pages[i];
    var frac = clamp((y - p.el.offsetTop) / Math.max(1, p.el.offsetHeight), 0, 1);
    return { page: i + 1, y: Math.round(frac * 1000) / 1000 };
  }

  function scrollToPage(i, frac) {
    var p = S.pages[i];
    window.scrollTo(window.scrollX, p.el.offsetTop + (frac || 0) * p.el.offsetHeight);
  }

  /** Fetches true sizes for pages 1..k (used before an exact jump so layout is stable). */
  function ensureSizesUpTo(k) {
    var jobs = [];
    for (var i = 0; i < Math.min(k, S.n); i++) {
      (function (p) {
        if (!p.known) jobs.push(S.pdf.getPage(p.i + 1).then(function (pg) {
          var v = pg.getViewport({ scale: 1 }); learnSize(p, v.width, v.height); pg.cleanup();
        }));
      })(S.pages[i]);
    }
    return Promise.all(jobs);
  }

  function backgroundSizes() {
    var i = 0;
    (function step() {
      if (i >= S.n) return;
      var jobs = [];
      for (var c = 0; c < 8 && i < S.n; c++, i++) {
        (function (p) {
          if (!p.known) jobs.push(S.pdf.getPage(p.i + 1).then(function (pg) {
            var v = pg.getViewport({ scale: 1 }); learnSize(p, v.width, v.height); pg.cleanup();
          }).catch(function () {}));
        })(S.pages[i]);
      }
      Promise.all(jobs).then(function () { setTimeout(step, 0); });
    })();
  }

  /* ------------------------------ rendering ------------------------------ */

  /** Page text as one string. Line ends become a space, or a newline at paragraph/heading breaks. */
  function textOffsets(p, items) {
    var offs = [], lens = [], total = 0, str = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i], sep = '';
      if (it.hasEOL) {
        var next = items[i + 1];
        var hard = false;
        if (next && next.transform && it.transform) {
          var h1 = it.height || 0, h2 = next.height || 0;
          var gap = it.transform[5] - next.transform[5];
          hard = Math.abs(h1 - h2) > 1 || gap > Math.max(h1, h2) * 1.9 || gap < 0;
        }
        sep = hard ? '\n' : ' ';
      }
      offs.push(total); lens.push(it.str.length);
      str += it.str + sep; total += it.str.length + sep.length;
    }
    p.offs = offs; p.lens = lens; p.str = str;
  }

  function renderPage(p) {
    if (p.state !== 'idle') return p.ready;
    p.state = 'rendering';
    var token = ++p.token;
    p.ready = S.pdf.getPage(p.i + 1).then(function (page) {
      if (token !== p.token) return;
      var v1 = page.getViewport({ scale: 1 });
      learnSize(p, v1.width, v1.height);
      var viewport = page.getViewport({ scale: S.scale });
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      dpr = Math.min(dpr, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      var paint = page.render({
        canvasContext: canvas.getContext('2d'), viewport: viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      });
      p.task = paint;
      var text = page.getTextContent().then(function (tc) {
        if (token !== p.token) return;
        var layer = document.createElement('div');
        layer.className = 'textLayer';
        layer.style.setProperty('--scale-factor', String(viewport.scale));
        var divs = [];
        var items = tc.items.filter(function (it) { return typeof it.str === 'string'; });
        var rt = pdfjsLib.renderTextLayer({
          textContentSource: tc, container: layer, viewport: viewport, textDivs: divs, textContentItemsStr: [],
        });
        return rt.promise.then(function () {
          if (token !== p.token) return;
          for (var i = 0; i < divs.length; i++) divs[i].setAttribute('data-i', i);
          p.divs = divs; p.items = items; textOffsets(p, items);
          p.tl = layer; p.el.appendChild(layer);
        });
      });
      return Promise.all([paint.promise, text]).then(function () {
        if (token !== p.token) return;
        p.canvas = canvas;
        p.el.insertBefore(canvas, p.el.firstChild);
        p.el.classList.add('done');
        p.state = 'done';
        page.cleanup();
      });
    }).catch(function (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      if (token === p.token) p.state = 'idle';
    });
    return p.ready;
  }

  function unrender(p) {
    p.token++;
    if (p.task) { try { p.task.cancel(); } catch (e) { /* ignore */ } p.task = null; }
    if (p.canvas) { p.canvas.width = 0; p.canvas.height = 0; if (p.canvas.parentNode) p.canvas.parentNode.removeChild(p.canvas); p.canvas = null; }
    if (p.tl && p.tl.parentNode) p.tl.parentNode.removeChild(p.tl);
    p.tl = null; p.divs = [];
    var old = p.el.querySelectorAll('.hl'); for (var i = 0; i < old.length; i++) old[i].remove();
    p.el.classList.remove('done');
    p.state = 'idle';
  }

  var visTimer = 0;
  function updateVisible() {
    visTimer = 0;
    if (!S.pages.length) return;
    var top = window.scrollY, h = vh();
    var first = pageTopIndex(Math.max(0, top - h)), last = pageTopIndex(top + 2 * h);
    var keepFrom = pageTopIndex(Math.max(0, top - 4 * h)), keepTo = pageTopIndex(top + 5 * h);
    for (var i = 0; i < S.pages.length; i++) {
      var p = S.pages[i];
      if (i >= first && i <= last) renderPage(p);
      else if ((i < keepFrom || i > keepTo) && p.state !== 'idle') unrender(p);
    }
  }
  function scheduleVisible() { if (!visTimer) visTimer = setTimeout(updateVisible, 60); }

  /* ------------------------------- location ------------------------------ */

  var locTimer = 0;
  function reportLocation() {
    locTimer = 0;
    var l = curLoc();
    var atEnd = window.scrollY + vh() >= document.documentElement.scrollHeight - 2;
    post({ type: 'loc', page: l.page, y: l.y, numPages: S.n, atEnd: atEnd });
  }
  window.addEventListener('scroll', function () {
    scheduleVisible();
    if (locTimer) clearTimeout(locTimer);
    locTimer = setTimeout(reportLocation, 200);
  }, { passive: true });

  /* ------------------------------ selection ------------------------------ */

  function sentence(str, a, b) {
    var re = /[.!?\u2026]["\u201D\u2019')\]]*\s+|\n+/g;
    var s = 0, m;
    while ((m = re.exec(str)) && m.index + m[0].length <= a) s = m.index + m[0].length;
    re.lastIndex = b;
    m = re.exec(str);
    var e = m ? m.index + m[0].replace(/\s+$/, '').length : str.length;
    return str.slice(s, e).replace(/\s+/g, ' ').trim();
  }

  function locate(node, offset, isEnd) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    if (!el) return null;
    var span = el.closest ? el.closest('span[data-i]') : null;
    var within;
    if (!span) {
      // boundary sits on the layer/page element itself: pick the neighbouring span
      var layer = el.closest ? el.closest('.textLayer') : null;
      if (!layer && el.querySelector) layer = el.querySelector('.textLayer');
      if (!layer) return null;
      var kids = layer.querySelectorAll('span[data-i]');
      if (!kids.length) return null;
      span = kids[clamp(isEnd ? offset - 1 : offset, 0, kids.length - 1)];
      within = isEnd ? span.textContent.length : 0;
    } else {
      within = node.nodeType === 3 ? offset : (isEnd ? span.textContent.length : 0);
    }
    var pageEl = span.closest('.page');
    var p = S.pages[+pageEl.getAttribute('data-page') - 1];
    var i = +span.getAttribute('data-i');
    return { p: p, off: p.offs[i] + Math.min(within, p.lens[i]) };
  }

  function selectionInfo() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    var r = sel.getRangeAt(0);
    var a = locate(r.startContainer, r.startOffset, false);
    if (!a) return null;
    var b = locate(r.endContainer, r.endOffset, true);
    var clamped = false;
    if (!b || b.p !== a.p) { b = { p: a.p, off: a.p.str.length }; clamped = true; }
    var start = Math.min(a.off, b.off), end = Math.max(a.off, b.off);
    var text = a.p.str.slice(start, end).replace(/\s+/g, ' ').trim();
    if (!text) return null;
    var rect = r.getBoundingClientRect();
    var pageRect = a.p.el.getBoundingClientRect();
    var y = clamp((rect.top - pageRect.top) / Math.max(1, pageRect.height), 0, 1);
    return {
      text: text,
      context: sentence(a.p.str, start, end),
      location: { page: a.p.i + 1, y: Math.round(y * 1000) / 1000, startOffset: start, endOffset: end },
    };
  }

  var selTimer = 0;
  document.addEventListener('selectionchange', function () {
    if (selTimer) clearTimeout(selTimer);
    selTimer = setTimeout(function () {
      var info = selectionInfo();
      if (info) S.lastSel = { info: info, t: Date.now() };
    }, 100);
  });

  /* ------------------------------ highlight ------------------------------ */

  function findItem(p, off) {
    var lo = 0, hi = p.offs.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (p.offs[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function highlightRects(p, start, end) {
    if (!p.divs || !p.divs.length || end <= start) return [];
    var i0 = findItem(p, start), i1 = findItem(p, Math.max(start, end - 1));
    var n0 = p.divs[i0] && p.divs[i0].firstChild, n1 = p.divs[i1] && p.divs[i1].firstChild;
    if (!n0 || !n1) return [];
    var range = document.createRange();
    range.setStart(n0, clamp(start - p.offs[i0], 0, n0.length));
    range.setEnd(n1, clamp(end - p.offs[i1], 0, n1.length));
    var base = p.el.getBoundingClientRect(), out = [];
    var rects = range.getClientRects();
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (r.width < 1 || r.height < 1) continue;
      out.push({ left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height });
    }
    return out;
  }

  function flash(p, rects) {
    var els = rects.map(function (r) {
      var d = document.createElement('div');
      d.className = 'hl';
      d.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
      p.el.appendChild(d);
      return d;
    });
    setTimeout(function () { els.forEach(function (d) { d.style.opacity = '0'; }); }, 2800);
    setTimeout(function () { els.forEach(function (d) { d.remove(); }); }, 3400);
  }

  /* -------------------------------- jump --------------------------------- */

  var jumpSeq = 0;
  function jump(loc, hl) {
    if (!S.n || !loc || !loc.page) return Promise.resolve();
    var seq = ++jumpSeq;
    var idx = clamp(loc.page, 1, S.n) - 1;
    return ensureSizesUpTo(idx + 1).then(function () {
      if (seq !== jumpSeq) return;
      var p = S.pages[idx];
      scrollToPage(idx, loc.y || 0);
      updateVisible();
      return renderPage(p).then(function () {
        if (seq !== jumpSeq) return;
        scrollToPage(idx, loc.y || 0);
        if (hl && loc.startOffset != null && loc.endOffset != null) {
          var rects = highlightRects(p, loc.startOffset, loc.endOffset);
          if (rects.length) {
            var absTop = p.el.offsetTop + rects[0].top;
            var absLeft = p.el.offsetLeft + rects[0].left;
            window.scrollTo(Math.max(0, absLeft - vw() * 0.15), Math.max(0, absTop - vh() * 0.3));
            flash(p, rects);
          }
        }
        reportLocation();
      });
    });
  }

  /* ---------------------------- zoom (+ pinch) --------------------------- */

  function setZoom(z, anchor) {
    z = clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(z - S.zoom) < 0.01) return;
    var before = S.scale, loc = curLoc();
    S.zoom = z;
    computeScale();
    for (var i = 0; i < S.pages.length; i++) if (S.pages[i].state !== 'idle') unrender(S.pages[i]);
    layoutAll();
    if (anchor) {
      var ratio = S.scale / before;
      window.scrollTo((anchor.docX * ratio) - anchor.cx, (anchor.docY * ratio) - anchor.cy);
    } else {
      scrollToPage(loc.page - 1, loc.y);
    }
    updateVisible();
    reportLocation();
  }

  var pinch = null;
  function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      var cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      pinch = { d0: dist(e.touches), z0: S.zoom, k: 1, cx: cx, cy: cy, docX: cx + window.scrollX, docY: cy + window.scrollY };
      viewer.style.transformOrigin = pinch.docX + 'px ' + pinch.docY + 'px';
    }
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    pinch.k = clamp(pinch.z0 * (dist(e.touches) / pinch.d0), MIN_ZOOM, MAX_ZOOM) / pinch.z0;
    viewer.style.transform = 'scale(' + pinch.k + ')';
  }, { passive: false });
  function endPinch() {
    if (!pinch) return;
    var p = pinch; pinch = null;
    viewer.style.transform = ''; viewer.style.transformOrigin = '';
    setZoom(p.z0 * p.k, p);
    post({ type: 'zoom', zoom: S.zoom });
  }
  document.addEventListener('touchend', function (e) { if (pinch && e.touches.length < 2) endPinch(); }, { passive: true });
  document.addEventListener('touchcancel', endPinch, { passive: true });

  /* ---------------------------------- tap -------------------------------- */

  var lastPinchEnd = 0;
  document.addEventListener('touchend', function () { if (!pinch) lastPinchEnd = Date.now(); }, { passive: true });
  document.addEventListener('click', function () {
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    post({ type: 'tap' });
  });

  /* ----------------------------- outline / meta -------------------------- */

  function loadOutline() {
    S.pdf.getOutline().then(function (tree) {
      if (!tree) return;
      var flat = [];
      (function walk(items, depth) {
        for (var i = 0; i < items.length && flat.length < 400; i++) {
          flat.push({ title: items[i].title, dest: items[i].dest });
          if (depth < 1 && items[i].items && items[i].items.length) walk(items[i].items, depth + 1);
        }
      })(tree, 0);
      return Promise.all(flat.map(function (it) {
        return Promise.resolve(typeof it.dest === 'string' ? S.pdf.getDestination(it.dest) : it.dest).then(function (d) {
          if (!d) return null;
          var ref = d[0];
          return typeof ref === 'number' ? ref : S.pdf.getPageIndex(ref);
        }).then(function (idx) {
          return idx == null ? null : { title: String(it.title || '').trim(), page: idx + 1 };
        }).catch(function () { return null; });
      })).then(function (res) {
        S.outline = res.filter(Boolean).sort(function (a, b) { return a.page - b.page; });
        post({ type: 'outline', items: S.outline });
      });
    }).catch(function () {});
  }

  function sendCover() {
    S.pdf.getPage(1).then(function (page) {
      var v1 = page.getViewport({ scale: 1 });
      var viewport = page.getViewport({ scale: 360 / v1.width });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
        post({ type: 'cover', data: canvas.toDataURL('image/jpeg', 0.8) });
        canvas.width = 0;
      });
    }).catch(function () {});
  }

  /* --------------------------------- init -------------------------------- */

  var triedData = false;
  function open(source) {
    var task = pdfjsLib.getDocument(source);
    task.onPassword = function () { post({ type: 'error', code: 'password', message: 'This PDF is password protected.' }); };
    return task.promise.then(function (pdf) {
      S.pdf = pdf; S.n = pdf.numPages;
      return pdf.getPage(1);
    }).then(function (page) {
      var v = page.getViewport({ scale: 1 });
      S.base = { w: v.width, h: v.height };
      page.cleanup();
      applyTheme(S.theme);
      computeScale();
      viewer.innerHTML = '';
      S.pages = [];
      for (var i = 0; i < S.n; i++) {
        var el = document.createElement('div');
        el.className = 'page'; el.setAttribute('data-page', String(i + 1));
        viewer.appendChild(el);
        var p = { i: i, el: el, known: false, w: S.base.w, h: S.base.h, state: 'idle', token: 0, offs: [], lens: [], str: '', divs: [], items: [] };
        S.pages.push(p); sizePage(p);
      }
      S.pages[0].known = true;
      return S.pdf.getMetadata().catch(function () { return null; });
    }).then(function (meta) {
      var info = (meta && meta.info) || {};
      post({ type: 'meta', numPages: S.n, title: info.Title || '', author: info.Author || '' });
      post({ type: 'ready', numPages: S.n });
      if (OPTS.loc && OPTS.loc.page) jump(OPTS.loc, !!OPTS.highlight); else { updateVisible(); reportLocation(); }
      backgroundSizes();
      loadOutline();
      if (OPTS.wantCover) sendCover();
    });
  }

  function start() {
    applyTheme(S.theme);
    var source = OPTS.data ? { data: b64ToBytes(OPTS.data) } : { url: OPTS.url };
    source.isEvalSupported = false;
    open(source).catch(function (e) {
      var msg = String((e && e.message) || e);
      if (e && e.name === 'PasswordException') return;
      if (OPTS.url && !triedData) { triedData = true; post({ type: 'needData', message: msg }); return; }
      post({ type: 'error', message: msg });
      showMessage('Could not open this PDF.');
    });
  }

  window.addEventListener('resize', function () {
    if (!S.n) return;
    var loc = curLoc();
    computeScale();
    for (var i = 0; i < S.pages.length; i++) if (S.pages[i].state !== 'idle') unrender(S.pages[i]);
    layoutAll();
    scrollToPage(loc.page - 1, loc.y);
    updateVisible();
  });

  window.__pm = {
    setZoom: function (z) { setZoom(z); },
    setTheme: applyTheme,
    jump: function (loc, hl) { return jump(loc, hl); },
    openBase64: function (b64) { S.pdf = null; return open({ data: b64ToBytes(b64), isEvalSupported: false }).catch(function (e) { post({ type: 'error', message: String((e && e.message) || e) }); showMessage('Could not open this PDF.'); }); },
    reportSelection: function (action) {
      var info = selectionInfo();
      if (!info && S.lastSel && Date.now() - S.lastSel.t < 4000) info = S.lastSel.info;
      post({ type: 'selection', action: action, info: info });
    },
    clearSelection: function () { var s = window.getSelection(); if (s) s.removeAllRanges(); S.lastSel = null; },
    _state: S,
  };

  start();
})();
