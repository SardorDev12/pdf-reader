import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, SectionTitle } from '@/components/ui';
import { revisitRate } from '@/lib/analytics';
import { FONT_MAX, FONT_MIN, useSettings, type ReaderTheme } from '@/store/settings';
import { useColors } from '@/theme';

const THEMES: { id: ReaderTheme; label: string; bg: string; fg: string }[] = [
  { id: 'light', label: 'Light', bg: '#FFFFFF', fg: '#111827' },
  { id: 'sepia', label: 'Sepia', bg: '#F4ECD8', fg: '#5B4636' },
  { id: 'dark', label: 'Dark', bg: '#16181D', fg: '#E5E7EB' },
];

export default function Settings() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { fontSize, setFontSize, readerTheme, setReaderTheme } = useSettings();
  const stats = useQuery({ queryKey: ['revisit'], queryFn: revisitRate });

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Text style={[styles.h1, { color: c.text }]}>Settings</Text>

      <View style={styles.section}>
        <SectionTitle>Storage</SectionTitle>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>On this device</Text>
          <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>
            Your books, words, passages, notes and bookmarks are stored locally and work fully offline. Nothing is sent
            anywhere.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle>Reading</SectionTitle>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>Font size · {fontSize}%</Text>
          <View style={styles.stepper}>
            <Button label="A−" variant="secondary" onPress={() => setFontSize(fontSize - 10)} disabled={fontSize <= FONT_MIN} style={{ flex: 1 }} />
            <Button label="A+" variant="secondary" onPress={() => setFontSize(fontSize + 10)} disabled={fontSize >= FONT_MAX} style={{ flex: 1 }} />
          </View>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', marginTop: 8 }}>Reader theme</Text>
          <View style={styles.stepper}>
            {THEMES.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setReaderTheme(t.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: readerTheme === t.id }}
                style={[
                  styles.swatch,
                  { backgroundColor: t.bg, borderColor: readerTheme === t.id ? c.primary : c.border, borderWidth: readerTheme === t.id ? 2 : 1 },
                ]}
              >
                <Text style={{ color: t.fg, fontWeight: '700' }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle>Your knowledge</SectionTitle>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
            Revisit rate · {Math.round((stats.data?.rate ?? 0) * 100)}%
          </Text>
          <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>
            You reopened {stats.data?.opened ?? 0} of {stats.data?.saved ?? 0} saved items. Capture something now, make it
            useful later.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20, paddingBottom: 48, gap: 24 },
  h1: { fontSize: 30, fontWeight: '800' },
  section: { gap: 2 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  stepper: { flexDirection: 'row', gap: 10 },
  swatch: { flex: 1, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
