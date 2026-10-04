import { Directory, File, Paths } from 'expo-file-system';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useAfterWrite } from '@/lib/hooks';
import * as repo from '@/lib/repo';
import type { Location } from '@/lib/types';
import { useColors } from '@/theme';
import { READER_COLORS } from './colors';
import type { ReaderHandle, ReaderViewProps, SelectionKind } from './types';

/** Largest PDF we will push through the JS bridge as base64 (fallback path only). */
const MAX_BRIDGE_BYTES = 40 * 1024 * 1024;
const VIEWER_PREFIX = 'pagemark-pdf-viewer-';

/** Writes the bundled viewer page to the cache directory (once per viewer version) and returns its file URI. */
async function ensureViewerFile(): Promise<string> {
  // required lazily: the generated module is ~1.4 MB and only needed when a PDF is opened
  const { PDF_VIEWER_HTML, PDF_VIEWER_VERSION } = require('./pdf/viewerAssets') as typeof import('./pdf/viewerAssets');
  const name = `${VIEWER_PREFIX}${PDF_VIEWER_VERSION}.html`;
  const file = new File(Paths.cache, name);
  if (!file.exists) {
    file.create({ overwrite: true });
    file.write(PDF_VIEWER_HTML);
    try {
      for (const entry of new Directory(Paths.cache).list()) {
        if (entry instanceof File && entry.name.startsWith(VIEWER_PREFIX) && entry.name !== name) entry.delete();
      }
    } catch {
      /* stale viewer files are harmless */
    }
  }
  return file.uri;
}

type Outline = { title: string; page: number }[];

const MENU_KINDS: Record<string, SelectionKind> = { vocab: 'word', note: 'note', passage: 'passage' };

function usableTitle(t?: string) {
  const s = (t ?? '').trim();
  return s.length >= 2 && s.length <= 150 && !/^(untitled|microsoft word)/i.test(s) ? s : undefined;
}

export const PdfView = forwardRef<ReaderHandle, ReaderViewProps>(function PdfView(
  { book, initialLocation, highlightOnOpen, theme, zoom, width, height, vocab, onVisibleVocab, onPage, onSelect, onTap, onZoomChange },
  ref,
) {
  const c = useColors();
  const colors = READER_COLORS[theme];
  const afterWrite = useAfterWrite();
  const web = useRef<WebView>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const ready = useRef(false);
  const numPages = useRef(0);
  const outline = useRef<Outline>([]);
  const cb = useRef({ onPage, onSelect, onTap, onZoomChange, onVisibleVocab });
  cb.current = { onPage, onSelect, onTap, onZoomChange, onVisibleVocab };

  // saved words on the pages that are (mostly) on screen
  const vocabRef = useRef(vocab);
  vocabRef.current = vocab;
  const visiblePages = useRef<number[] | null>(null);
  const emitVisible = useCallback(() => {
    const pages = visiblePages.current;
    if (!pages) return;
    const on = new Set(pages);
    cb.current.onVisibleVocab(vocabRef.current.filter((w) => w.location.page && on.has(w.location.page)).map((w) => w.id));
  }, []);
  useEffect(() => emitVisible(), [vocab, emitVisible]);

  useEffect(() => {
    let alive = true;
    ensureViewerFile()
      .then((uri) => alive && setViewerUri(uri))
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Could not prepare the PDF viewer.');
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  // opening options are fixed for the lifetime of this screen; later changes go through __pm commands
  const source = useMemo(() => {
    if (!viewerUri) return null;
    const opts = {
      url: book.filePath,
      loc: initialLocation?.page ? initialLocation : undefined,
      highlight: highlightOnOpen,
      zoom: zoom / 100,
      theme,
      wantCover: !book.coverPath,
    };
    return { uri: `${viewerUri}#${encodeURIComponent(JSON.stringify(opts))}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerUri]);

  const run = useCallback((js: string) => web.current?.injectJavaScript(`${js};true;`), []);

  useEffect(() => {
    if (ready.current) run(`window.__pm.setTheme(${JSON.stringify(theme)})`);
  }, [theme, run]);
  useEffect(() => {
    if (ready.current) run(`window.__pm.setZoom(${zoom / 100})`);
  }, [zoom, run]);

  useImperativeHandle(
    ref,
    () => ({
      jumpTo: (location: Location, highlight: boolean) => {
        if (!location.page) return;
        run(`window.__pm.jump(${JSON.stringify(location)}, ${highlight})`);
      },
    }),
    [run],
  );

  const labelFor = useCallback((page: number) => {
    const entry = [...outline.current].reverse().find((o) => o.page <= page);
    return { chapter: entry?.title || undefined, label: `${entry?.title ? `${entry.title} · ` : ''}p. ${page}` };
  }, []);

  const saveCover = useCallback(
    async (dataUrl: string) => {
      try {
        const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const file = new File(new File(book.filePath).parentDirectory, 'cover.jpg');
        file.create({ overwrite: true });
        file.write(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
        await repo.updateBookMeta(book.id, { coverPath: file.uri });
        afterWrite();
      } catch {
        /* the generic icon stays */
      }
    },
    [book.filePath, book.id, afterWrite],
  );

  const sendFileAsBase64 = useCallback(async () => {
    try {
      const file = new File(book.filePath);
      if ((file.size ?? 0) > MAX_BRIDGE_BYTES) throw new Error('This PDF is too large to open on this device.');
      run(`window.__pm.openBase64(${JSON.stringify(await file.base64())})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this PDF.');
      setStatus('error');
    }
  }, [book.filePath, run]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'ready':
          ready.current = true;
          numPages.current = msg.numPages;
          setStatus('ready');
          break;
        case 'loc': {
          const page: number = msg.page;
          const { chapter, label } = labelFor(page);
          visiblePages.current = Array.isArray(msg.visible) && msg.visible.length ? msg.visible : [page];
          emitVisible();
          const total = Math.max(1, numPages.current);
          const percent = msg.atEnd ? 100 : Math.max(0, Math.min(100, ((page - 1 + msg.y) / total) * 100));
          cb.current.onPage({
            location: { page, y: msg.y, chapterId: chapter },
            percent,
            chapterLabel: label,
            chapterId: chapter,
            bookmarkTitle: `${chapter ? `${chapter} · ` : ''}Page ${page}`,
            key: String(page),
            isBookmarked: (b) => b.location.page === page,
          });
          break;
        }
        case 'outline':
          outline.current = msg.items ?? [];
          break;
        case 'selection': {
          const kind = MENU_KINDS[msg.action];
          const info = msg.info;
          if (!kind || !info) break;
          const { chapter, label } = labelFor(info.location.page);
          cb.current.onSelect(kind, {
            text: info.text,
            context: info.context,
            location: { ...info.location, chapterId: chapter },
            chapterLabel: label,
          });
          run('window.__pm.clearSelection()');
          break;
        }
        case 'tap':
          cb.current.onTap();
          break;
        case 'zoom':
          cb.current.onZoomChange?.(Math.round(msg.zoom * 100));
          break;
        case 'meta': {
          if (book.coverPath) break; // first open only
          const title = usableTitle(msg.title);
          const author = (msg.author ?? '').trim() || undefined;
          if (title || author) repo.updateBookMeta(book.id, { title, author }).then(() => afterWrite());
          break;
        }
        case 'cover':
          saveCover(msg.data);
          break;
        case 'needData':
          // the WebView could not read the file directly: hand it the bytes instead
          sendFileAsBase64();
          break;
        case 'error':
          setError(msg.message || 'Could not open this PDF.');
          setStatus('error');
          break;
      }
    },
    [labelFor, run, book.coverPath, book.id, afterWrite, saveCover, sendFileAsBase64, emitVisible],
  );

  return (
    <View style={{ width, height, backgroundColor: colors.bg }}>
      {source ? (
        <WebView
          ref={web}
          source={source}
          style={{ flex: 1, backgroundColor: colors.bg }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          scalesPageToFit={false}
          setBuiltInZoomControls={false}
          setDisplayZoomControls={false}
          overScrollMode="never"
          bounces={false}
          showsVerticalScrollIndicator={false}
          menuItems={[
            { key: 'vocab', label: 'Add to Vocabulary' },
            { key: 'note', label: 'Add Note' },
            { key: 'passage', label: 'Save Passage' },
          ]}
          onCustomMenuSelection={(e) => run(`window.__pm.reportSelection(${JSON.stringify(e.nativeEvent.key)})`)}
          onMessage={onMessage}
          // the viewer only ever shows local files; never let the page navigate elsewhere
          onShouldStartLoadWithRequest={(req) => req.url.startsWith('file:')}
          onError={() => {
            setError('The PDF viewer failed to load.');
            setStatus('error');
          }}
        />
      ) : null}
      {status === 'loading' ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.bg }]} pointerEvents="none">
          <ActivityIndicator color={c.primary} />
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.bg, padding: 32 }]}>
          <Text style={{ color: colors.fg, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>Could not open this PDF</Text>
          <Text style={{ color: colors.fg, opacity: 0.7, marginTop: 8, textAlign: 'center' }}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
