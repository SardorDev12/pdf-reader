import {
  Reader,
  ReaderProvider,
  useReader,
  type Location as EpubLocation,
  type Section,
  type Theme,
} from '@epubjs-react-native/core';
import { useFileSystem } from '@epubjs-react-native/expo-file-system';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { newId } from '@/lib/ids';
import { contextScript, visibleScript } from '@/lib/readerScripts';
import type { Location } from '@/lib/types';
import type { ReaderTheme } from '@/store/settings';
import { palette, useColors } from '@/theme';
import { READER_COLORS } from './colors';
import type { ReaderHandle, ReaderViewProps, SelectionKind } from './types';

function buildTheme(t: ReaderTheme): Theme {
  const { bg, fg, link } = READER_COLORS[t];
  const text = { color: `${fg} !important` };
  return {
    body: { background: `${bg} !important`, color: `${fg} !important` },
    p: text,
    span: text,
    li: text,
    div: text,
    blockquote: text,
    h1: text,
    h2: text,
    h3: text,
    h4: text,
    h5: text,
    h6: text,
    a: { color: `${link} !important`, 'pointer-events': 'auto', cursor: 'pointer' },
    '::selection': { background: 'rgba(47,111,237,0.35)' },
  };
}

export const EpubView = forwardRef<ReaderHandle, ReaderViewProps>(function EpubView(props, ref) {
  return (
    <ReaderProvider>
      <EpubInner {...props} handleRef={ref} />
    </ReaderProvider>
  );
});

function EpubInner({
  book,
  initialLocation,
  highlightOnOpen,
  theme,
  fontSize,
  width,
  height,
  vocab,
  onVisibleVocab,
  onPage,
  onSelect,
  onTap,
  handleRef,
}: ReaderViewProps & { handleRef: Ref<ReaderHandle> }) {
  const c = useColors();
  const colors = READER_COLORS[theme];
  const epubTheme = useMemo(() => buildTheme(theme), [theme]);
  const { goToLocation, changeTheme, changeFontSize, injectJavascript, addAnnotation, removeAnnotationByCfi } = useReader();

  // latest callbacks, so the menu items / reader handlers below can stay referentially stable
  const cb = useRef({ onPage, onSelect, onVisibleVocab });
  cb.current = { onPage, onSelect, onVisibleVocab };

  const section = useRef<Section | null>(null);
  const readyRef = useRef(false);

  /* ---------------------- which saved words are on this page ---------------------- */

  const vocabRef = useRef(vocab);
  vocabRef.current = vocab;
  const visSeq = useRef('');
  const visTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleVisible = useRef(() => {});
  scheduleVisible.current = () => {
    if (visTimer.current) clearTimeout(visTimer.current);
    visTimer.current = setTimeout(() => {
      if (!readyRef.current) return;
      const words = vocabRef.current.filter((w) => w.location.cfi).map((w) => ({ id: w.id, cfi: w.location.cfi! }));
      visSeq.current = newId();
      injectJavascript(visibleScript(visSeq.current, words));
    }, 120);
  };
  useEffect(() => {
    scheduleVisible.current();
  }, [vocab]);

  useEffect(() => {
    if (readyRef.current) changeTheme(epubTheme);
  }, [epubTheme, changeTheme]);
  useEffect(() => {
    if (readyRef.current) changeFontSize(`${fontSize}%`);
  }, [fontSize, changeFontSize]);

  /* ----------------------------- location -------------------------------- */

  const onLocationChange = useCallback((_total: number, loc: EpubLocation, progress: number, current: Section | null) => {
    if (!loc?.start) return;
    section.current = current;
    const fraction = progress > 0 ? progress : (loc.start.percentage ?? 0);
    const pct = Math.max(0, Math.min(100, fraction * 100));
    const start = (loc.start.percentage ?? 0) * 100;
    const end = (loc.end?.percentage ?? loc.start.percentage ?? 0) * 100;
    const label = current?.label?.trim() ?? '';
    cb.current.onPage({
      location: { cfi: loc.start.cfi, chapterId: current?.href },
      percent: pct,
      chapterLabel: label,
      chapterId: current?.href,
      bookmarkTitle: `${label || 'Page'} · ${Math.round(pct)}%`,
      key: loc.start.cfi,
      // exact CFI, or anywhere within the page's progress range
      isBookmarked: (b) =>
        b.location.cfi === loc.start.cfi || (end > start && b.progressPercent >= start - 0.01 && b.progressPercent <= end),
    });
    scheduleVisible.current();
  }, []);

  /* --------------------------- jump + highlight --------------------------- */

  const flash = useCallback(
    (cfi: string) => {
      try {
        addAnnotation('highlight', cfi, { temporary: true }, { color: palette.amber, opacity: 0.6 });
        setTimeout(() => removeAnnotationByCfi(cfi), 3200);
      } catch {
        /* range may no longer resolve; navigation still worked */
      }
    },
    [addAnnotation, removeAnnotationByCfi],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      jumpTo: (location: Location, highlight: boolean) => {
        if (!location.cfi) return;
        goToLocation(location.cfi);
        if (highlight) setTimeout(() => flash(location.cfi!), 750);
      },
    }),
    [goToLocation, flash],
  );

  const onReady = useCallback(() => {
    readyRef.current = true;
    changeFontSize(`${fontSize}%`);
    if (highlightOnOpen && initialLocation?.cfi) setTimeout(() => flash(initialLocation.cfi!), 1100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------- selection ------------------------------ */

  const contextWaiters = useRef(new Map<string, (ctx: string) => void>());

  const onWebViewMessage = useCallback((msg: { type: string; id?: string; context?: string; rid?: string; ids?: string[] | null }) => {
    if (msg.type === 'srContext' && msg.id) {
      contextWaiters.current.get(msg.id)?.(msg.context ?? '');
      contextWaiters.current.delete(msg.id);
    } else if (msg.type === 'srVisible' && msg.rid === visSeq.current) {
      cb.current.onVisibleVocab(msg.ids ?? null);
    }
  }, []);

  const fetchContext = useCallback(
    (cfi: string, fallback: string) =>
      new Promise<string>((resolve) => {
        const rid = newId();
        const timeout = setTimeout(() => {
          contextWaiters.current.delete(rid);
          resolve(fallback);
        }, 800);
        contextWaiters.current.set(rid, (ctx) => {
          clearTimeout(timeout);
          resolve(ctx || fallback);
        });
        injectJavascript(contextScript(rid, cfi));
      }),
    [injectJavascript],
  );

  const select = useCallback(
    async (kind: SelectionKind, cfiRange: string, text: string) => {
      const label = section.current?.label?.trim() || null;
      const location: Location = { cfi: cfiRange, chapterId: section.current?.href };
      const context = kind === 'word' ? await fetchContext(cfiRange, text.trim()) : undefined;
      cb.current.onSelect(kind, { text, context, location, chapterLabel: label });
    },
    [fetchContext],
  );

  const menuItems = useMemo(
    () => [
      { key: 'vocab', label: 'Add to Vocabulary', action: (cfi: string, text: string) => (select('word', cfi, text), true) },
      { key: 'note', label: 'Add Note', action: (cfi: string, text: string) => (select('note', cfi, text), true) },
      { key: 'passage', label: 'Save Passage', action: (cfi: string, text: string) => (select('passage', cfi, text), true) },
    ],
    [select],
  );

  const spinner = (
    <View style={[styles.center, { backgroundColor: colors.bg }]}>
      <ActivityIndicator color={c.primary} />
    </View>
  );

  return (
    <Reader
      src={book.filePath}
      fileSystem={useFileSystem}
      width={width}
      height={height}
      initialLocation={initialLocation?.cfi}
      defaultTheme={epubTheme}
      menuItems={menuItems}
      onReady={onReady}
      onLocationChange={onLocationChange}
      onSingleTap={onTap}
      onWebViewMessage={onWebViewMessage}
      onDisplayError={(reason) => console.warn('EPUB display error', reason)}
      renderLoadingFileComponent={() => spinner}
      renderOpeningBookComponent={() => spinner}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
