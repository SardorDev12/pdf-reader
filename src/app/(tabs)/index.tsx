import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Cover, EmptyState, ProgressBar, SectionTitle } from '@/components/ui';
import { pickAndImportEpub } from '@/lib/epub';
import { useAfterWrite, useBooks, useDeleteBook, useSearch } from '@/lib/hooks';
import type { Book } from '@/lib/types';
import { useColors } from '@/theme';

export default function Library() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: books = [], isLoading } = useBooks();
  const deleteBook = useDeleteBook();
  const afterWrite = useAfterWrite();
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const search = useSearch(query);

  const { reading, finished, rest } = useMemo(() => {
    const reading = books.filter((b) => b.progressPercent > 0 && b.progressPercent < 98);
    const finished = books.filter((b) => b.progressPercent >= 98);
    const rest = books.filter((b) => b.progressPercent <= 0);
    return { reading, finished, rest };
  }, [books]);

  const open = (id: string) => router.push({ pathname: '/reader/[id]', params: { id } });

  const add = async () => {
    setImporting(true);
    try {
      const res = await pickAndImportEpub();
      afterWrite();
      if (res.status === 'imported') open(res.id);
    } catch (e) {
      Alert.alert('Could not add book', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setImporting(false);
    }
  };

  const confirmDelete = (b: Book) =>
    Alert.alert(`Remove “${b.title}”?`, 'The book, its saved words and passages will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteBook.mutate(b) },
    ]);

  const searching = query.trim().length > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={[styles.h1, { color: c.text }]}>My Library</Text>
        <Button label="Add" icon="add" onPress={add} loading={importing} style={styles.addBtn} />
      </View>
      <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Search books, words and passages"
          placeholderTextColor={c.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={c.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {search.data && !search.data.books.length && !search.data.vocabulary.length && !search.data.passages.length ? (
            <EmptyState icon="search" title="No results" body={`Nothing matches “${query.trim()}”.`} />
          ) : null}
          {search.data?.books.length ? (
            <View style={styles.section}>
              <SectionTitle>Books</SectionTitle>
              {search.data.books.map((b) => (
                <ResultRow key={b.id} title={b.title} sub={b.author ?? undefined} icon="book" onPress={() => open(b.id)} />
              ))}
            </View>
          ) : null}
          {search.data?.vocabulary.length ? (
            <View style={styles.section}>
              <SectionTitle>Vocabulary</SectionTitle>
              {search.data.vocabulary.map((v) => (
                <ResultRow
                  key={v.id}
                  title={v.word}
                  sub={v.meaning ?? v.context}
                  icon="text"
                  onPress={() => router.push({ pathname: '/word/[id]', params: { id: v.id } })}
                />
              ))}
            </View>
          ) : null}
          {search.data?.passages.length ? (
            <View style={styles.section}>
              <SectionTitle>Saved passages</SectionTitle>
              {search.data.passages.map((p) => (
                <ResultRow
                  key={p.id}
                  title={p.title}
                  sub={p.text}
                  icon="bookmark"
                  onPress={() => router.push({ pathname: '/passage/[id]', params: { id: p.id } })}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : !isLoading && !books.length ? (
        <EmptyState
          icon="library-outline"
          title="Your library is empty"
          body="Add an EPUB from your device to start reading and capturing what matters."
          action={<Button label="Add your first book" icon="add" onPress={add} loading={importing} />}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {reading.length ? (
            <View style={styles.section}>
              <SectionTitle>Currently reading</SectionTitle>
              {reading.map((b) => (
                <ReadingRow key={b.id} book={b} onPress={() => open(b.id)} onLongPress={() => confirmDelete(b)} />
              ))}
            </View>
          ) : null}
          {rest.length ? (
            <View style={styles.section}>
              <SectionTitle>{reading.length || finished.length ? 'Not started' : 'All books'}</SectionTitle>
              <Grid books={rest} onOpen={open} onLongPress={confirmDelete} />
            </View>
          ) : null}
          {finished.length ? (
            <View style={styles.section}>
              <SectionTitle>Finished</SectionTitle>
              <Grid books={finished} onOpen={open} onLongPress={confirmDelete} />
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function ReadingRow({ book, onPress, onLongPress }: { book: Book; onPress: () => void; onLongPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.readingRow, { backgroundColor: c.surface, borderColor: c.border }]}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}, ${Math.round(book.progressPercent)} percent read`}
    >
      <Cover book={book} width={64} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={[styles.bookTitle, { color: c.text }]} numberOfLines={2}>
          {book.title}
        </Text>
        {book.author ? (
          <Text style={{ color: c.textMuted, fontSize: 14 }} numberOfLines={1}>
            {book.author}
          </Text>
        ) : null}
        <View style={{ marginTop: 6, gap: 4 }}>
          <ProgressBar percent={book.progressPercent} />
          <Text style={{ color: c.textMuted, fontSize: 12 }}>{Math.round(book.progressPercent)}%</Text>
        </View>
      </View>
    </Pressable>
  );
}

function Grid({ books, onOpen, onLongPress }: { books: Book[]; onOpen: (id: string) => void; onLongPress: (b: Book) => void }) {
  const c = useColors();
  return (
    <FlatList
      data={books}
      scrollEnabled={false}
      numColumns={3}
      keyExtractor={(b) => b.id}
      columnWrapperStyle={{ gap: 14 }}
      contentContainerStyle={{ gap: 18 }}
      renderItem={({ item }) => (
        <Pressable
          style={styles.gridItem}
          onPress={() => onOpen(item.id)}
          onLongPress={() => onLongPress(item)}
          accessibilityRole="button"
          accessibilityLabel={item.title}
        >
          <Cover book={item} width={100} />
          <Text style={[styles.gridTitle, { color: c.text }]} numberOfLines={2}>
            {item.title}
          </Text>
        </Pressable>
      )}
    />
  );
}

function ResultRow({
  title,
  sub,
  icon,
  onPress,
}: {
  title: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.result, { borderBottomColor: c.border }]}>
      <Ionicons name={icon} size={20} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={{ color: c.textMuted, fontSize: 14 }} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  h1: { fontSize: 30, fontWeight: '800' },
  addBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  content: { padding: 20, paddingBottom: 40, gap: 28 },
  section: { gap: 2 },
  readingRow: { flexDirection: 'row', gap: 14, padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  bookTitle: { fontSize: 17, fontWeight: '700' },
  gridItem: { flex: 1 / 3, maxWidth: '33%', gap: 8 },
  gridTitle: { fontSize: 13, fontWeight: '600' },
  result: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
});
