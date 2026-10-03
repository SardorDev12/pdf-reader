import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState } from '@/components/ui';
import { useBook, useDeletePassage, usePassages, useRenamePassage } from '@/lib/hooks';
import { openInBook } from '@/lib/navigation';
import { useColors } from '@/theme';

export default function PassageDetail() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: all = [] } = usePassages();
  const passage = all.find((p) => p.id === id);
  const { data: book } = useBook(passage?.bookId);
  const rename = useRenamePassage();
  const del = useDeletePassage();
  const [title, setTitle] = useState('');

  useEffect(() => setTitle(passage?.title ?? ''), [passage?.title]);

  if (!passage) return <EmptyState icon="alert-circle-outline" title="Passage not found" body="It may have been deleted." />;

  const dirty = title.trim() && title.trim() !== passage.title;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.root, { paddingTop: 28, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: c.textMuted }]}>Title</Text>
        <TextInput
          style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
          value={title}
          onChangeText={setTitle}
        />
        {dirty ? (
          <Button label="Save title" variant="secondary" onPress={() => rename.mutate({ id: passage.id, title: title.trim() })} />
        ) : null}

        <Text style={[styles.label, { color: c.textMuted }]}>Passage</Text>
        <Text style={[styles.text, { color: c.text, borderLeftColor: c.accent }]}>{passage.text}</Text>

        <Text style={[styles.label, { color: c.textMuted }]}>Location</Text>
        <Text style={{ color: c.text, fontSize: 15 }}>
          {book?.title ?? 'Unknown book'}
          {passage.chapterLabel ? ` · ${passage.chapterLabel}` : ''}
        </Text>

        <View style={{ gap: 10, marginTop: 28 }}>
          <Button
            label="Open in book"
            icon="book-outline"
            disabled={!book}
            onPress={() => {
              router.dismiss();
              openInBook(router, passage.bookId, passage.location, 'passage');
            }}
          />
          <Button
            label="Delete passage"
            variant="ghost"
            onPress={() =>
              Alert.alert('Delete passage?', `“${passage.title}” will be removed.`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => del.mutate(passage.id, { onSuccess: () => router.back() }),
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
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 18, fontWeight: '700' },
  text: { fontSize: 17, lineHeight: 27, borderLeftWidth: 3, paddingLeft: 12 },
});
