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
 * Asks the WebView which of the given word locations lie on the page that is currently displayed
 * (CFI range comparison against the page's start/end). Replies with an `srVisible` message.
 */
export function visibleScript(requestId: string, words: { id: string; cfi: string }[]) {
  return `
(function () {
  var rid = ${JSON.stringify(requestId)};
  function send(ids) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'srVisible', rid: rid, ids: ids }));
  }
  try {
    var loc = rendition.currentLocation();
    if (!loc || !loc.start) return send(null);
    var C = new ePub.CFI(), out = [], list = ${JSON.stringify(words)};
    for (var i = 0; i < list.length; i++) {
      try {
        if (C.compare(list[i].cfi, loc.start.cfi) >= 0 && C.compare(list[i].cfi, loc.end.cfi) <= 0) out.push(list[i].id);
      } catch (e) { /* unresolvable CFI: not on this page */ }
    }
    send(out);
  } catch (err) { send(null); }
})();
true;
`;
}
