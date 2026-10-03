import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/ui';
import { useBooks, useVocabulary } from '@/lib/hooks';
import { useColors } from '@/theme';

export default function VocabularyTab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: words = [] } = useVocabulary();
  const { data: books = [] } = useBooks();
  const [bookId, setBookId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const titles = useMemo(() => new Map(books.map((b) => [b.id, b.title])), [books]);
  const bookIdsWithWords = useMemo(() => [...new Set(words.map((w) => w.bookId))].filter((id) => titles.has(id)), [words, titles]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return words
      .filter((w) => titles.has(w.bookId))
      .filter((w) => !bookId || w.bookId === bookId)
      .filter((w) => !q || w.word.toLowerCase().includes(q) || w.meaning?.toLowerCase().includes(q))
      .sort((a, b) => a.word.localeCompare(b.word));
  }, [words, bookId, query, titles]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Text style={[styles.h1, { color: c.text }]}>Vocabulary</Text>
      <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.textMuted} />
        <TextInput
          style={[styles.input, { color: c.text }]}
          placeholder="Search vocabulary"
          placeholderTextColor={c.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>
      {bookIdsWithWords.length > 1 ? (
        <View style={{ height: 52 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="All books" active={!bookId} onPress={() => setBookId(null)} />
            {bookIdsWithWords.map((id) => (
              <Chip key={id} label={titles.get(id)!} active={bookId === id} onPress={() => setBookId(id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {!filtered.length ? (
        <EmptyState
          icon="text-outline"
          title={words.length ? 'No matching words' : 'No words yet'}
          body={
            words.length
              ? 'Try a different search.'
              : 'While reading, long-press a word and choose “Add to Vocabulary”. It will appear here with its context.'
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(w) => w.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/word/[id]', params: { id: item.id } })}
              style={[styles.row, { borderBottomColor: c.border }]}
            >
              <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>{item.word}</Text>
              <Text style={{ color: c.textMuted, fontSize: 14 }} numberOfLines={2}>
                {item.meaning || item.context}
              </Text>
              <Text style={{ color: c.primary, fontSize: 12 }} numberOfLines={1}>
                {titles.get(item.bookId)}
                {item.chapterLabel ? ` · ${item.chapterLabel}` : ''}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? c.primary : c.surfaceAlt }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={{ color: active ? c.primaryText : c.text, fontSize: 14, fontWeight: '600', maxWidth: 180 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  h1: { fontSize: 30, fontWeight: '800', paddingHorizontal: 20, marginBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  chips: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center' },
  row: { paddingVertical: 14, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth },
});
