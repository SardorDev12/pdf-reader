/**
 * Scripts injected into the epub.js WebView. `book` is the epub.js Book that the
 * reader template keeps in global scope.
 */

/** Asks the WebView for the sentence surrounding a CFI range; replies with a `srContext` message. */
export function contextScript(requestId: string, cfiRange: string) {
  return `
(function () {
  var id = ${JSON.stringify(requestId)};
  function send(ctx) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'srContext', id: id, context: ctx || '' }));
  }
  try {
    book.getRange(${JSON.stringify(cfiRange)}).then(function (range) {
      if (!range) return send('');
      var doc = range.startContainer.ownerDocument;
      var el = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
      var block = (el && el.closest && el.closest('p,li,blockquote,td,h1,h2,h3,h4,h5,h6,div')) || el;
      var pre = doc.createRange();
      pre.selectNodeContents(block);
      pre.setEnd(range.startContainer, range.startOffset);
      var start = pre.toString().length;
      var end = start + range.toString().length;
      var full = block.textContent || '';
      var re = /[.!?\\u2026]["\\u201D\\u2019')\\]]*\\s+/g;
      var s = 0, m;
      while ((m = re.exec(full)) && m.index + m[0].length <= start) s = m.index + m[0].length;
      re.lastIndex = end;
      m = re.exec(full);
      var e = m ? m.index + m[0].replace(/\\s+$/, '').length : full.length;
      send(full.slice(s, e).replace(/\\s+/g, ' ').trim());
    }).catch(function () { send(''); });
  } catch (err) { send(''); }
})();
true;
`;
}

/** Strips punctuation/quotes around a selected word. */
export function normalizeWord(text: string) {
  return text
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ');
}

/**
 * Paints saved items as permanent highlights in the epub.js page (idempotent: send the full desired list each time).
 * - highlights are keyed by CFI; items sharing a range share one highlight (the last colour wins);
 * - epub.js draws highlights in an overlay that it does NOT move when the text reflows (font size, rotation), so a
 *   one-time hook redraws the overlay after every reflow;
 * - light/sepia pages multiply the colour into the text (stays black and crisp), dark pages use a normal blend. epub.js
 *   writes mix-blend-mode as an SVG attribute, which browsers ignore, so it is set with a CSS rule instead.
 */
export function highlightScript(items: { cfi: string; color: string }[], theme: 'light' | 'sepia' | 'dark') {
  const dark = theme === 'dark';
  return `
(function () {
  try {
    var want = {}, list = ${JSON.stringify(items)};
    for (var i = 0; i < list.length; i++) want[list[i].cfi] = list[i].color;
    var st = window.__pmHl || (window.__pmHl = { applied: {}, installed: false, key: '' });
    var blend = ${JSON.stringify(dark ? 'normal' : 'multiply')}, opacity = ${JSON.stringify(dark ? '0.4' : '0.45')};

    function refresh() {
      try { rendition.views().forEach(function (v) { if (v.pane) v.pane.render(); }); } catch (e) {}
    }

    if (!st.installed) {
      st.installed = true;
      var themes = rendition.themes;
      ['fontSize', 'font', 'override'].forEach(function (name) {
        var original = themes[name];
        if (typeof original !== 'function') return;
        themes[name] = function () {
          var result = original.apply(themes, arguments);
          setTimeout(refresh, 300); setTimeout(refresh, 900); setTimeout(refresh, 1800);
          return result;
        };
      });
      rendition.on('resized', function () { setTimeout(refresh, 150); setTimeout(refresh, 800); });
    }

    var css = document.getElementById('pm-hl-style');
    if (!css) { css = document.createElement('style'); css.id = 'pm-hl-style'; document.head.appendChild(css); }
    css.textContent = '.pm-hl{mix-blend-mode:' + blend + ' !important}';

    var key = blend + opacity;
    if (st.key !== key) {
      Object.keys(st.applied).forEach(function (c) { try { rendition.annotations.remove(c, 'highlight'); } catch (e) {} });
      st.applied = {}; st.key = key;
    }
    Object.keys(st.applied).forEach(function (c) {
      if (!(c in want) || st.applied[c] !== want[c]) {
        try { rendition.annotations.remove(c, 'highlight'); } catch (e) {}
        delete st.applied[c];
      }
    });
    Object.keys(want).forEach(function (c) {
      if (st.applied[c] === want[c]) return;
      try {
        rendition.annotations.add('highlight', c, { pm: true }, function () {}, 'pm-hl',
          { fill: want[c], 'fill-opacity': opacity });
        st.applied[c] = want[c];
      } catch (e) { /* a CFI that no longer resolves just isn't painted */ }
    });
    setTimeout(refresh, 400); setTimeout(refresh, 1200);
  } catch (e) {}
})();
true;
`;
}

/**
 * A brief amber underline at a CFI, for jumping to an item that has no permanent highlight. It is an underline
 * (not a highlight) and removed by type, so it can never remove a saved item's highlight on the same range.
 */
export function flashScript(cfi: string) {
  return `
(function () {
  try {
    var c = ${JSON.stringify(cfi)};
    rendition.annotations.add('underline', c, { pm: true }, function () {}, 'pm-flash',
      { stroke: '#FBBF24', 'stroke-opacity': '0.95', 'stroke-width': '4px' });
    setTimeout(function () { try { rendition.annotations.remove(c, 'underline'); } catch (e) {} }, 3200);
  } catch (e) {}
})();
true;
`;
}
