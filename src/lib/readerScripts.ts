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
 * Asks the WebView which saved items (words, passages, notes, bookmarks) touch the page that is currently
 * displayed. An item counts when any part of its CFI range overlaps the page's start..end range, so a passage that
 * runs across a page break shows on both pages. Replies with an `srVisible` message.
 */
export function visibleScript(requestId: string, items: { id: string; cfi: string }[]) {
  return `
(function () {
  var rid = ${JSON.stringify(requestId)};
  function send(ids) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'srVisible', rid: rid, ids: ids }));
  }
  // "epubcfi(/6/4!/4/2,/1:0,/1:5)" -> its start and end as point CFIs (top-level commas only)
  function ends(c) {
    var m = /^epubcfi\\((.*)\\)$/.exec(c);
    if (!m) return [c, c];
    var parts = [], depth = 0, cur = '', body = m[1];
    for (var i = 0; i < body.length; i++) {
      var ch = body.charAt(i);
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    return parts.length === 3
      ? ['epubcfi(' + parts[0] + parts[1] + ')', 'epubcfi(' + parts[0] + parts[2] + ')']
      : [c, c];
  }
  try {
    var loc = rendition.currentLocation();
    if (!loc || !loc.start) return send(null);
    var C = new ePub.CFI(), out = [], list = ${JSON.stringify(items)};
    for (var i = 0; i < list.length; i++) {
      try {
        var e = ends(list[i].cfi);
        if (C.compare(e[0], loc.end.cfi) <= 0 && C.compare(e[1], loc.start.cfi) >= 0) out.push(list[i].id);
      } catch (err) { /* unresolvable CFI: not on this page */ }
    }
    send(out);
  } catch (err) { send(null); }
})();
true;
`;
}
