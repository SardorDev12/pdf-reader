import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, IconButton, Segmented } from '@/components/ui';
import { useBookmarks, useBooks, useDeleteBookmark, useNotes, usePassages } from '@/lib/hooks';
import { openInBook } from '@/lib/navigation';
import { useColors } from '@/theme';

type Tab = 'passages' | 'notes' | 'bookmarks';

type Row = {
  id: string;
  bookId: string;
  title: string;
  body?: string;
  meta?: string | null;
  kind: Tab;
};

const EMPTY: Record<Tab, { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = {
  passages: {
    icon: 'bookmark-outline',
    title: 'No passages yet',
    body: 'Select a few lines while reading and choose “Save Passage”. Give it a title and come back any time.',
  },
  notes: {
    icon: 'create-outline',
    title: 'No notes yet',
    body: 'Select text and choose “Add Note”, or add a note to any page from the Saved drawer in the reader.',
  },
  bookmarks: {
    icon: 'bookmark-outline',
    title: 'No bookmarks yet',
    body: 'Tap the bookmark icon in the reader’s top bar to mark the page you’re on.',
  },
};

export default function SavedTab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: passages = [] } = usePassages();
  const { data: notes = [] } = useNotes();
  const { data: bookmarks = [] } = useBookmarks();
  const { data: books = [] } = useBooks();
  const deleteBookmark = useDeleteBookmark();
  const [tab, setTab] = useState<Tab>('passages');
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: Row[] =
      tab === 'passages'
        ? passages.map((p) => ({ id: p.id, bookId: p.bookId, title: p.title, body: p.text, meta: p.chapterLabel, kind: tab }))
        : tab === 'notes'
          ? notes.map((n) => ({
              id: n.id,
              bookId: n.bookId,
              title: n.title || n.content.split('\n')[0],
              body: n.title ? n.content : n.quote ? `“${n.quote}”` : undefined,
              meta: n.chapterLabel,
              kind: tab,
            }))
          : bookmarks.map((b) => ({ id: b.id, bookId: b.bookId, title: b.title, kind: tab }));
    return books
      .map((b) => ({
        title: b.title,
        data: rows.filter(
          (r) => r.bookId === b.id && (!q || r.title.toLowerCase().includes(q) || r.body?.toLowerCase().includes(q)),
        ),
      }))
      .filter((s) => s.data.length);
  }, [books, passages, notes, bookmarks, tab, query]);

  const total = { passages: passages.length, notes: notes.length, bookmarks: bookmarks.length }[tab];

  const open = (r: Row) => {
    if (r.kind === 'passages') router.push({ pathname: '/passage/[id]', params: { id: r.id } });
    else if (r.kind === 'notes') router.push({ pathname: '/note/[id]', params: { id: r.id } });
    else {
      const b = bookmarks.find((x) => x.id === r.id);
      if (b) openInBook(router, b.bookId, b.location, 'bookmark');
    }
  };

  const confirmDeleteBookmark = (r: Row) =>
    Alert.alert('Remove bookmark?', r.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteBookmark.mutate(r.id) },
    ]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Text style={[styles.h1, { color: c.text }]}>Saved</Text>
      <View style={styles.pad}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'passages', label: 'Passages', count: passages.length },
            { id: 'notes', label: 'Notes', count: notes.length },
            { id: 'bookmarks', label: 'Bookmarks', count: bookmarks.length },
          ]}
        />
      </View>
      <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.textMuted} />
        <TextInput
          style={[styles.input, { color: c.text }]}
          placeholder={`Search ${tab}`}
          placeholderTextColor={c.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>
      {!sections.length ? (
        <EmptyState
          icon={EMPTY[tab].icon}
          title={total ? 'No matches' : EMPTY[tab].title}
          body={total ? 'Try a different search.' : EMPTY[tab].body}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionTitle, { color: c.textMuted }]}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              onLongPress={item.kind === 'bookmarks' ? () => confirmDeleteBookmark(item) : undefined}
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
              accessibilityRole="button"
            >
              <View style={styles.cardHead}>
                <Ionicons
                  name={item.kind === 'notes' ? 'create-outline' : 'bookmark'}
                  size={16}
                  color={item.kind === 'notes' ? c.primary : c.accent}
                />
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.kind === 'bookmarks' ? (
                  <IconButton
                    name="trash-outline"
                    label={`Remove bookmark ${item.title}`}
                    onPress={() => confirmDeleteBookmark(item)}
                    color={c.textMuted}
                    size={18}
                  />
                ) : null}
              </View>
              {item.body ? (
                <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }} numberOfLines={3}>
                  {item.body}
                </Text>
              ) : null}
              {item.meta ? <Text style={{ color: c.primary, fontSize: 12 }}>{item.meta}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  h1: { fontSize: 30, fontWeight: '800', paddingHorizontal: 20, marginBottom: 12 },
  pad: { paddingHorizontal: 20, marginBottom: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 10 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
