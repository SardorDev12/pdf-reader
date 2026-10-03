import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/ui';
import { useBooks, usePassages } from '@/lib/hooks';
import { useColors } from '@/theme';

export default function SavedTab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: passages = [] } = usePassages();
  const { data: books = [] } = useBooks();
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books
      .map((b) => ({
        title: b.title,
        data: passages.filter(
          (p) => p.bookId === b.id && (!q || p.title.toLowerCase().includes(q) || p.text.toLowerCase().includes(q)),
        ),
      }))
      .filter((s) => s.data.length);
  }, [books, passages, query]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Text style={[styles.h1, { color: c.text }]}>Saved</Text>
      <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.textMuted} />
        <TextInput
          style={[styles.input, { color: c.text }]}
          placeholder="Search saved passages"
          placeholderTextColor={c.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>
      {!sections.length ? (
        <EmptyState
          icon="bookmark-outline"
          title={passages.length ? 'No matching passages' : 'Nothing saved yet'}
          body={
            passages.length
              ? 'Try a different search.'
              : 'Select a few lines while reading and choose “Save Passage”. Give it a title and come back to it any time.'
          }
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionTitle, { color: c.textMuted }]}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/passage/[id]', params: { id: item.id } })}
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <View style={styles.cardHead}>
                <Ionicons name="bookmark" size={16} color={c.accent} />
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
              <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }} numberOfLines={3}>
                {item.text}
              </Text>
              {item.chapterLabel ? <Text style={{ color: c.primary, fontSize: 12 }}>{item.chapterLabel}</Text> : null}
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
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 10 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
