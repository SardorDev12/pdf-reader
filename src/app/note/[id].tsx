import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState } from '@/components/ui';
import { useBook, useDeleteNote, useNote, useUpdateNote } from '@/lib/hooks';
import { openInBook } from '@/lib/navigation';
import { useColors } from '@/theme';

export default function NoteDetail() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: note } = useNote(id);
  const { data: book } = useBook(note?.bookId);
  const update = useUpdateNote();
  const del = useDeleteNote();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    setTitle(note?.title ?? '');
    setContent(note?.content ?? '');
  }, [note?.title, note?.content]);

  if (!note) return <EmptyState icon="alert-circle-outline" title="Note not found" body="It may have been deleted." />;

  const dirty = content.trim() && (title.trim() !== note.title || content.trim() !== note.content);
  const input = [styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.root, { paddingTop: 28, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {note.quote ? (
          <Text style={[styles.quote, { color: c.textMuted, borderLeftColor: c.accent }]}>“{note.quote}”</Text>
        ) : null}

        <Text style={[styles.label, { color: c.textMuted }]}>Title</Text>
        <TextInput style={[input, { fontWeight: '700' }]} value={title} onChangeText={setTitle} placeholder="Untitled" placeholderTextColor={c.textMuted} />

        <Text style={[styles.label, { color: c.textMuted }]}>Note</Text>
        <TextInput style={[input, { minHeight: 140, textAlignVertical: 'top' }]} value={content} onChangeText={setContent} multiline />

        {dirty ? (
          <Button
            label="Save changes"
            variant="secondary"
            onPress={() => update.mutate({ id: note.id, title: title.trim(), content: content.trim() })}
          />
        ) : null}

        <Text style={[styles.label, { color: c.textMuted }]}>Location</Text>
        <Text style={{ color: c.text, fontSize: 15 }}>
          {book?.title ?? 'Unknown book'}
          {note.chapterLabel ? ` · ${note.chapterLabel}` : ''}
        </Text>

        <View style={{ gap: 10, marginTop: 28 }}>
          <Button
            label="Open in book"
            icon="book-outline"
            disabled={!book}
            onPress={() => {
              router.dismiss();
              openInBook(router, note.bookId, note.location, 'note');
            }}
          />
          <Button
            label="Delete note"
            variant="ghost"
            onPress={() =>
              Alert.alert('Delete note?', 'This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => del.mutate(note.id, { onSuccess: () => router.back() }) },
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
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 16 },
  quote: { fontSize: 15, lineHeight: 23, fontStyle: 'italic', borderLeftWidth: 3, paddingLeft: 12 },
});
