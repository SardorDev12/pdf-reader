import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState } from '@/components/ui';
import { useBook, useDeleteWord, useUpdateMeaning, useWord } from '@/lib/hooks';
import { openInBook } from '@/lib/navigation';
import { useColors } from '@/theme';

export default function WordDetail() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: word } = useWord(id);
  const { data: book } = useBook(word?.bookId);
  const updateMeaning = useUpdateMeaning();
  const del = useDeleteWord();
  const [meaning, setMeaning] = useState('');

  useEffect(() => setMeaning(word?.meaning ?? ''), [word?.meaning]);

  if (!word) return <EmptyState icon="alert-circle-outline" title="Word not found" body="It may have been deleted." />;

  const dirty = meaning.trim() !== (word.meaning ?? '');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.root, { paddingTop: 28, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.word, { color: c.text }]}>{word.word}</Text>

        <Text style={[styles.label, { color: c.textMuted }]}>Meaning</Text>
        <TextInput
          style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
          placeholder="Add a definition or your own note"
          placeholderTextColor={c.textMuted}
          value={meaning}
          onChangeText={setMeaning}
          multiline
        />
        {dirty ? (
          <Button label="Save meaning" variant="secondary" onPress={() => updateMeaning.mutate({ id: word.id, meaning })} />
        ) : null}

        <Text style={[styles.label, { color: c.textMuted }]}>Context</Text>
        <Text style={[styles.context, { color: c.text, borderLeftColor: c.accent }]}>“{word.context}”</Text>

        <Text style={[styles.label, { color: c.textMuted }]}>Location</Text>
        <Text style={{ color: c.text, fontSize: 15 }}>
          {book?.title ?? 'Unknown book'}
          {word.chapterLabel ? ` · ${word.chapterLabel}` : ''}
        </Text>

        <View style={{ gap: 10, marginTop: 28 }}>
          <Button
            label="Open in book"
            icon="book-outline"
            disabled={!book}
            onPress={() => {
              router.dismiss();
              openInBook(router, word.bookId, word.location, 'word');
            }}
          />
          <Button
            label="Delete word"
            variant="ghost"
            onPress={() =>
              Alert.alert('Delete word?', `“${word.word}” will be removed from your vocabulary.`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => del.mutate(word.id, { onSuccess: () => router.back() }),
                },
              ])
            }
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 22, gap: 8 },
  word: { fontSize: 36, fontWeight: '800', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 16, minHeight: 56, textAlignVertical: 'top' },
  context: { fontSize: 17, lineHeight: 26, borderLeftWidth: 3, paddingLeft: 12, fontStyle: 'italic' },
});
