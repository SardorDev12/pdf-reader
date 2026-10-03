import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme';
import { Button } from './ui';

export type CaptureDraft =
  | { kind: 'word'; cfi: string; word: string; context: string }
  | { kind: 'passage'; cfi: string; text: string };

export function CaptureSheet({
  draft,
  onCancel,
  onSaveWord,
  onSavePassage,
}: {
  draft: CaptureDraft | null;
  onCancel: () => void;
  onSaveWord: (v: { word: string; meaning: string }, d: Extract<CaptureDraft, { kind: 'word' }>) => void;
  onSavePassage: (v: { title: string }, d: Extract<CaptureDraft, { kind: 'passage' }>) => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!draft) return;
    setMeaning('');
    if (draft.kind === 'word') setWord(draft.word);
    else setTitle(draft.text.split(/\s+/).slice(0, 6).join(' ').replace(/[,.;:]+$/, ''));
  }, [draft]);

  const input = [styles.input, { backgroundColor: c.bg, borderColor: c.border, color: c.text }];

  return (
    <Modal visible={!!draft} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={onCancel} />
        <View style={styles.bottom} pointerEvents="box-none">
          <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.grabber, { backgroundColor: c.border }]} />
            {draft?.kind === 'word' ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
                <Text style={[styles.heading, { color: c.text }]}>Add to Vocabulary</Text>
                <Text style={[styles.label, { color: c.textMuted }]}>Word</Text>
                <TextInput style={input} value={word} onChangeText={setWord} autoCapitalize="none" autoCorrect={false} />
                <Text style={[styles.label, { color: c.textMuted }]}>Meaning (optional)</Text>
                <TextInput
                  style={[input, { minHeight: 52, textAlignVertical: 'top' }]}
                  value={meaning}
                  onChangeText={setMeaning}
                  placeholder="Definition or your own note"
                  placeholderTextColor={c.textMuted}
                  multiline
                />
                {draft.context ? (
                  <>
                    <Text style={[styles.label, { color: c.textMuted }]}>Context</Text>
                    <Text style={[styles.quote, { color: c.text, borderLeftColor: c.accent }]} numberOfLines={5}>
                      “{draft.context}”
                    </Text>
                  </>
                ) : null}
                <Button
                  label="Save word"
                  disabled={!word.trim()}
                  onPress={() => onSaveWord({ word: word.trim(), meaning }, draft)}
                />
              </ScrollView>
            ) : draft?.kind === 'passage' ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
                <Text style={[styles.heading, { color: c.text }]}>Save Passage</Text>
                <Text style={[styles.quote, { color: c.text, borderLeftColor: c.accent }]} numberOfLines={6}>
                  “{draft.text}”
                </Text>
                <Text style={[styles.label, { color: c.textMuted }]}>Title</Text>
                <TextInput
                  style={input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Why does this matter?"
                  placeholderTextColor={c.textMuted}
                  selectTextOnFocus
                />
                <Button
                  label="Save"
                  disabled={!title.trim()}
                  onPress={() => onSavePassage({ title: title.trim() }, draft)}
                />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 10, maxHeight: '85%' },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  heading: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  quote: { fontSize: 15, lineHeight: 22, fontStyle: 'italic', borderLeftWidth: 3, paddingLeft: 12 },
});
