import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaptureSheet, type CaptureDraft } from '@/components/CaptureSheet';
import { EdgeDrawer, EdgeZone } from '@/components/EdgeDrawer';
import { Button, IconButton, Segmented } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useAfterWrite, useBook, useBookmarks, useNotes, usePassages, useVocabulary } from '@/lib/hooks';
import { normalizeWord } from '@/lib/readerScripts';
import * as repo from '@/lib/repo';
import { hasLocation, type Bookmark, type BookFormat, type Location, type Note, type SavedPassage, type Vocabulary } from '@/lib/types';
import { READER_COLORS } from '@/reader/colors';
import { EpubView } from '@/reader/EpubView';
import { PdfView } from '@/reader/PdfView';
import type { EngineSelection, PageInfo, ReaderHandle, SelectionKind } from '@/reader/types';
import { FONT_MAX, FONT_MIN, useSettings, ZOOM_MAX, ZOOM_MIN, type ReaderTheme } from '@/store/settings';
import { useColors } from '@/theme';

type SavedTab = 'passages' | 'notes' | 'bookmarks';

const clean = (t: string) => t.replace(/\s+/g, ' ').trim();

export default function ReaderScreen() {
  const { id, loc, highlight } = useLocalSearchParams<{ id: string; loc?: string; highlight?: string }>();
  const router = useRouter();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const afterWrite = useAfterWrite();

  const { data: book } = useBook(id);
  const { data: words = [] } = useVocabulary(id);
  const { data: passages = [] } = usePassages(id);
  const { data: notes = [] } = useNotes(id);
  const { data: bookmarks = [] } = useBookmarks(id);
  const { fontSize, pdfZoom, setPdfZoom, readerTheme } = useSettings();
  const colors = READER_COLORS[readerTheme];
  const engine = useRef<ReaderHandle>(null);

  // initial location: an explicit deep link wins over saved reading progress
  const [initial, setInitial] = useState<{ location?: Location } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      let deepLink: Location | undefined;
      try {
        deepLink = loc ? (JSON.parse(loc) as Location) : undefined;
      } catch {
        deepLink = undefined;
      }
      const progress = await repo.getProgress(id);
      if (alive) setInitial({ location: deepLink && hasLocation(deepLink) ? deepLink : progress?.location });
    })();
    repo.touchBook(id);
    track('book_opened', { bookId: id });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ----------------------------- chrome / panels ------------------------- */

  const [chrome, setChrome] = useState(true);
  const [panel, setPanel] = useState<null | 'vocab' | 'saved'>(null);
  const [showDisplay, setShowDisplay] = useState(false);
  const [savedTab, setSavedTab] = useState<SavedTab>('passages');
  const drawerWidth = Math.min(width * 0.84, 380);
  const vocabP = useSharedValue(0);
  const savedP = useSharedValue(0);

  useEffect(() => {
    vocabP.value = withTiming(panel === 'vocab' ? 1 : 0, { duration: 220 });
    savedP.value = withTiming(panel === 'saved' ? 1 : 0, { duration: 220 });
  }, [panel, vocabP, savedP]);

  useEffect(() => {
    if (!panel) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPanel(null);
      return true;
    });
    return () => sub.remove();
  }, [panel]);

  useEffect(() => {
    const t = setTimeout(() => setChrome(false), 3000);
    return () => clearTimeout(t);
  }, []);

  /* ------------------------------- progress ------------------------------ */

  const [page, setPage] = useState<PageInfo | null>(null);
  const pageRef = useRef<PageInfo | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ location: Location; percent: number } | null>(null);
  const milestone = useRef(-1);
  const startedTracked = useRef(false);

  const flushProgress = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const p = pending.current;
    if (p && id) {
      pending.current = null;
      repo.saveProgress(id, p.location, p.percent).then(() => afterWrite());
    }
  }, [id, afterWrite]);

  useEffect(() => flushProgress, [flushProgress]);

  const onPage = useCallback(
    (info: PageInfo) => {
      pageRef.current = info;
      setPage(info);
      pending.current = { location: info.location, percent: info.percent };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushProgress, 700);

      if (!startedTracked.current) {
        startedTracked.current = true;
        track('reading_started', { bookId: id });
      }
      const step = Math.floor(info.percent / 10);
      if (step > milestone.current) {
        if (milestone.current >= 0) track('reading_progress', { bookId: id, percent: step * 10 });
        milestone.current = step;
        if (info.percent >= 98) track('book_completed', { bookId: id });
      }
    },
    [flushProgress, id],
  );

  /* --------------------------------- jump -------------------------------- */

  const jumpTo = useCallback((location: Location, highlightIt = true) => {
    setPanel(null);
    if (!hasLocation(location)) return;
    engine.current?.jumpTo(location, highlightIt);
  }, []);

  /* -------------------------------- capture ------------------------------ */

  const [draft, setDraft] = useState<CaptureDraft | null>(null);

  const onSelect = useCallback((kind: SelectionKind, sel: EngineSelection) => {
    const base = { location: sel.location, chapterLabel: sel.chapterLabel ?? null };
    if (kind === 'word') {
      setDraft({ kind: 'word', ...base, word: normalizeWord(sel.text), context: clean(sel.context || sel.text).slice(0, 500) });
    } else if (kind === 'note') {
      setDraft({ kind: 'note', ...base, quote: clean(sel.text) });
    } else {
      setDraft({ kind: 'passage', ...base, text: clean(sel.text) });
    }
  }, []);

  /** "+ Add" actions without a selection attach to the current page. */
  const hereDraft = () => ({ location: pageRef.current?.location ?? {}, chapterLabel: pageRef.current?.chapterLabel || null });

  const manualWord = () => {
    setPanel(null);
    setDraft({ kind: 'word', ...hereDraft(), word: '', context: '' });
  };

  const manualNote = () => {
    setPanel(null);
    setDraft({ kind: 'note', ...hereDraft(), quote: '' });
  };

  const saveWord = async (v: { word: string; meaning: string }, d: Extract<CaptureDraft, { kind: 'word' }>) => {
    if (!id) return;
    setDraft(null);
    await repo.addVocabulary({
      bookId: id,
      word: v.word,
      meaning: v.meaning,
      context: d.context,
      location: d.location,
      chapterLabel: d.chapterLabel ?? null,
    });
    track('word_saved', { bookId: id });
    afterWrite();
  };

  const savePassage = async (v: { title: string }, d: Extract<CaptureDraft, { kind: 'passage' }>) => {
    if (!id) return;
    setDraft(null);
    await repo.addPassage({
      bookId: id,
      title: v.title,
      text: d.text,
      location: d.location,
      chapterLabel: d.chapterLabel ?? null,
    });
    track('passage_saved', { bookId: id });
    afterWrite();
  };

  const saveNote = async (v: { title: string; content: string }, d: Extract<CaptureDraft, { kind: 'note' }>) => {
    if (!id) return;
    setDraft(null);
    await repo.addNote({
      bookId: id,
      title: v.title,
      content: v.content,
      quote: d.quote || null,
      location: d.location,
      chapterLabel: d.chapterLabel ?? null,
    });
    track('note_saved', { bookId: id });
    afterWrite();
  };

  /* ------------------------------- bookmarks ----------------------------- */

  // bookmarks on the page that is currently visible
  const pageBookmarks = useMemo(
    () => (page ? bookmarks.filter(page.isBookmarked) : ([] as Bookmark[])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookmarks, page?.key],
  );

  const toggleBookmark = async () => {
    const p = pageRef.current;
    if (!id || !p) return;
    if (pageBookmarks.length) {
      await Promise.all(pageBookmarks.map((b) => repo.deleteBookmark(b.id)));
    } else {
      await repo.addBookmark({
        bookId: id,
        title: p.bookmarkTitle,
        location: p.location,
        chapterLabel: p.chapterLabel || null,
        progressPercent: p.percent,
      });
      track('bookmark_added', { bookId: id });
    }
    afterWrite();
  };

  /* -------------------------------- render ------------------------------- */

  const goBack = () => {
    flushProgress();
    router.back();
  };

  if (!book || !initial) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const readerHeight = height - insets.top - insets.bottom - 30;
  const engineProps = {
    book,
    initialLocation: initial.location,
    highlightOnOpen: !!highlight,
    theme: readerTheme,
    fontSize,
    zoom: pdfZoom,
    width,
    height: readerHeight,
    onPage,
    onSelect,
    onTap: () => setChrome((v) => !v),
    onZoomChange: setPdfZoom,
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={{ paddingTop: insets.top }}>
        {book.format === 'pdf' ? <PdfView ref={engine} {...engineProps} /> : <EpubView ref={engine} {...engineProps} />}
      </View>

      {/* minimal footer: progress + chapter */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 4 }]} pointerEvents="none">
        <Text style={[styles.footerText, { color: colors.fg }]} numberOfLines={1}>
          {page?.chapterLabel ? `${page.chapterLabel}  ·  ` : ''}
          {Math.round(page?.percent ?? 0)}%
        </Text>
      </View>

      {chrome ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={[styles.topBar, { paddingTop: insets.top + 4, backgroundColor: c.surface, borderBottomColor: c.border }]}
        >
          <IconButton name="chevron-back" label="Back to library" onPress={goBack} />
          <IconButton name="text" label="Open vocabulary" onPress={() => setPanel('vocab')} />
          <Text style={[styles.topTitle, { color: c.text }]} numberOfLines={1}>
            {book.title}
          </Text>
          <IconButton name="text-outline" label="Display settings" onPress={() => setShowDisplay(true)} size={20} />
          <IconButton
            name={pageBookmarks.length ? 'bookmark' : 'bookmark-outline'}
            label={pageBookmarks.length ? 'Remove bookmark from this page' : 'Bookmark this page'}
            onPress={toggleBookmark}
            color={pageBookmarks.length ? c.accent : undefined}
          />
          <IconButton name="albums-outline" label="Open saved items" onPress={() => setPanel('saved')} />
        </Animated.View>
      ) : null}

      {/* edge gestures — only active while no drawer is open */}
      {!panel ? (
        <>
          <EdgeZone side="left" drawerWidth={drawerWidth} progress={vocabP} onOpen={() => setPanel('vocab')} />
          <EdgeZone side="right" drawerWidth={drawerWidth} progress={savedP} onOpen={() => setPanel('saved')} />
        </>
      ) : null}

      <EdgeDrawer
        side="left"
        width={drawerWidth}
        progress={vocabP}
        open={panel === 'vocab'}
        title="Vocabulary"
        subtitle={`${words.length} ${words.length === 1 ? 'word' : 'words'} in this book`}
        onClose={() => setPanel(null)}
        footer={<Button label="Add word" icon="add" variant="secondary" onPress={manualWord} style={styles.drawerBtn} />}
      >
        <VocabList
          words={words}
          chapterId={page?.chapterId}
          onJump={(w) => {
            track('vocabulary_opened', { bookId: id });
            jumpTo(w.location);
          }}
          onInfo={(w) => router.push({ pathname: '/word/[id]', params: { id: w.id } })}
        />
      </EdgeDrawer>

      <EdgeDrawer
        side="right"
        width={drawerWidth}
        progress={savedP}
        open={panel === 'saved'}
        title="Saved"
        subtitle="Passages, notes and bookmarks in this book"
        onClose={() => setPanel(null)}
        footer={
          savedTab === 'notes' ? (
            <Button label="Add note" icon="add" variant="secondary" onPress={manualNote} style={styles.drawerBtn} />
          ) : savedTab === 'bookmarks' ? (
            <Button
              label={pageBookmarks.length ? 'Remove bookmark here' : 'Bookmark this page'}
              icon={pageBookmarks.length ? 'bookmark' : 'bookmark-outline'}
              variant="secondary"
              onPress={toggleBookmark}
              style={styles.drawerBtn}
            />
          ) : null
        }
      >
        <View style={styles.drawerTabs}>
          <Segmented
            value={savedTab}
            onChange={setSavedTab}
            options={[
              { id: 'passages', label: 'Passages', count: passages.length },
              { id: 'notes', label: 'Notes', count: notes.length },
              { id: 'bookmarks', label: 'Marks', count: bookmarks.length },
            ]}
          />
        </View>
        {savedTab === 'passages' ? (
          <PassageList
            passages={passages}
            onJump={(p) => {
              track('passage_opened', { bookId: id });
              jumpTo(p.location);
            }}
            onInfo={(p) => router.push({ pathname: '/passage/[id]', params: { id: p.id } })}
          />
        ) : savedTab === 'notes' ? (
          <NoteList
            notes={notes}
            onJump={(n) => {
              track('note_opened', { bookId: id });
              jumpTo(n.location, !!n.quote);
            }}
            onInfo={(n) => router.push({ pathname: '/note/[id]', params: { id: n.id } })}
          />
        ) : (
          <BookmarkList
            bookmarks={bookmarks}
            onJump={(b) => {
              track('bookmark_opened', { bookId: id });
              jumpTo(b.location, false);
            }}
            onDelete={async (b) => {
              await repo.deleteBookmark(b.id);
              afterWrite();
            }}
          />
        )}
      </EdgeDrawer>

      <CaptureSheet
        draft={draft}
        onCancel={() => setDraft(null)}
        onSaveWord={saveWord}
        onSavePassage={savePassage}
        onSaveNote={saveNote}
      />
      <DisplaySheet visible={showDisplay} format={book.format} onClose={() => setShowDisplay(false)} />
    </View>
  );
}

function VocabList({
  words,
  chapterId,
  onJump,
  onInfo,
}: {
  words: Vocabulary[];
  chapterId?: string;
  onJump: (w: Vocabulary) => void;
  onInfo: (w: Vocabulary) => void;
}) {
  const c = useColors();
  // words from the chapter being read come first
  const sorted = useMemo(
    () =>
      [...words].sort((a, b) => {
        const am = chapterId && a.location.chapterId === chapterId ? 0 : 1;
        const bm = chapterId && b.location.chapterId === chapterId ? 0 : 1;
        return am - bm || a.word.localeCompare(b.word);
      }),
    [words, chapterId],
  );
  if (!sorted.length) {
    return (
      <Text style={[styles.hint, { color: c.textMuted }]}>
        Long-press a word in the text and choose “Add to Vocabulary”. It will show up here.
      </Text>
    );
  }
  return (
    <FlatList
      data={sorted}
      keyExtractor={(w) => w.id}
      contentContainerStyle={{ paddingHorizontal: 20 }}
      renderItem={({ item }) => {
        const here = !!chapterId && item.location.chapterId === chapterId;
        return (
          <Pressable
            onPress={() => onJump(item)}
            style={[styles.listRow, { borderBottomColor: c.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${item.word}`}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>{item.word}</Text>
              <Text style={{ color: c.textMuted, fontSize: 13 }} numberOfLines={2}>
                {item.meaning || item.context}
              </Text>
              {here ? <Text style={{ color: c.primary, fontSize: 11, fontWeight: '700' }}>THIS CHAPTER</Text> : null}
            </View>
            <IconButton name="information-circle-outline" label={`Details for ${item.word}`} onPress={() => onInfo(item)} color={c.textMuted} />
          </Pressable>
        );
      }}
    />
  );
}

function PassageList({
  passages,
  onJump,
  onInfo,
}: {
  passages: SavedPassage[];
  onJump: (p: SavedPassage) => void;
  onInfo: (p: SavedPassage) => void;
}) {
  const c = useColors();
  if (!passages.length) {
    return (
      <Text style={[styles.hint, { color: c.textMuted }]}>
        Select a few lines and choose “Save Passage”. Tap one here to jump straight back to it.
      </Text>
    );
  }
  return (
    <FlatList
      data={passages}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ paddingHorizontal: 20 }}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onJump(item)}
          style={[styles.listRow, { borderBottomColor: c.border }]}
          accessibilityRole="button"
          accessibilityLabel={`Jump to ${item.title}`}
        >
          <Ionicons name="bookmark" size={18} color={c.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 13 }} numberOfLines={2}>
              {item.text}
            </Text>
            {item.chapterLabel ? <Text style={{ color: c.primary, fontSize: 11 }}>{item.chapterLabel}</Text> : null}
          </View>
          <IconButton name="information-circle-outline" label={`Details for ${item.title}`} onPress={() => onInfo(item)} color={c.textMuted} />
        </Pressable>
      )}
    />
  );
}

function NoteList({ notes, onJump, onInfo }: { notes: Note[]; onJump: (n: Note) => void; onInfo: (n: Note) => void }) {
  const c = useColors();
  if (!notes.length) {
    return (
      <Text style={[styles.hint, { color: c.textMuted }]}>
        Select text and choose “Add Note”, or tap “Add note” below to attach a thought to this page.
      </Text>
    );
  }
  return (
    <FlatList
      data={notes}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ paddingHorizontal: 20 }}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onJump(item)}
          style={[styles.listRow, { borderBottomColor: c.border }]}
          accessibilityRole="button"
          accessibilityLabel={`Jump to note ${item.title || item.content.slice(0, 30)}`}
        >
          <Ionicons name="create-outline" size={18} color={c.primary} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 2 }}>
            {item.title ? (
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                {item.title}
              </Text>
            ) : null}
            <Text style={{ color: item.title ? c.textMuted : c.text, fontSize: 14 }} numberOfLines={3}>
              {item.content}
            </Text>
            {item.chapterLabel ? <Text style={{ color: c.primary, fontSize: 11 }}>{item.chapterLabel}</Text> : null}
          </View>
          <IconButton name="information-circle-outline" label="Note details" onPress={() => onInfo(item)} color={c.textMuted} />
        </Pressable>
      )}
    />
  );
}

function BookmarkList({
  bookmarks,
  onJump,
  onDelete,
}: {
  bookmarks: Bookmark[];
  onJump: (b: Bookmark) => void;
  onDelete: (b: Bookmark) => void;
}) {
  const c = useColors();
  if (!bookmarks.length) {
    return (
      <Text style={[styles.hint, { color: c.textMuted }]}>
        Tap the bookmark icon in the top bar to mark the page you're on.
      </Text>
    );
  }
  return (
    <FlatList
      data={bookmarks}
      keyExtractor={(b) => b.id}
      contentContainerStyle={{ paddingHorizontal: 20 }}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onJump(item)}
          style={[styles.listRow, { borderBottomColor: c.border }]}
          accessibilityRole="button"
          accessibilityLabel={`Jump to bookmark ${item.title}`}
        >
          <Ionicons name="bookmark" size={18} color={c.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <IconButton name="trash-outline" label={`Delete bookmark ${item.title}`} onPress={() => onDelete(item)} color={c.textMuted} size={20} />
        </Pressable>
      )}
    />
  );
}

function DisplaySheet({ visible, format, onClose }: { visible: boolean; format: BookFormat; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { fontSize, setFontSize, pdfZoom, setPdfZoom, readerTheme, setReaderTheme } = useSettings();
  const isPdf = format === 'pdf';
  const value = isPdf ? pdfZoom : fontSize;
  const set = isPdf ? setPdfZoom : setFontSize;
  const [min, max, step] = isPdf ? [ZOOM_MIN, ZOOM_MAX, 15] : [FONT_MIN, FONT_MAX, 10];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={onClose} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.displaySheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>{isPdf ? 'Zoom & theme' : 'Display'}</Text>
          <View style={styles.row}>
            <Button label={isPdf ? '−' : 'A−'} variant="secondary" onPress={() => set(value - step)} disabled={value <= min} style={{ flex: 1 }} />
            <Text style={{ color: c.text, fontWeight: '700', width: 64, textAlign: 'center' }}>{value}%</Text>
            <Button label={isPdf ? '+' : 'A+'} variant="secondary" onPress={() => set(value + step)} disabled={value >= max} style={{ flex: 1 }} />
          </View>
          <View style={styles.row}>
            {(Object.keys(READER_COLORS) as ReaderTheme[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setReaderTheme(t)}
                accessibilityRole="button"
                accessibilityLabel={`${t} theme`}
                accessibilityState={{ selected: readerTheme === t }}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: READER_COLORS[t].bg,
                    borderColor: readerTheme === t ? c.primary : c.border,
                    borderWidth: readerTheme === t ? 2 : 1,
                  },
                ]}
              >
                <Text style={{ color: READER_COLORS[t].fg, fontWeight: '700', textTransform: 'capitalize' }}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 4,
  },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', paddingHorizontal: 4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  footerText: { fontSize: 12, opacity: 0.5, maxWidth: '80%' },
  drawerTabs: { paddingHorizontal: 20, paddingBottom: 10 },
  drawerBtn: { marginHorizontal: 20, marginTop: 8 },
  hint: { paddingHorizontal: 20, fontSize: 15, lineHeight: 22 },
  listRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  displaySheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 16 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  swatch: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
