import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app';
import { palette } from '@/theme';

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const complete = useApp((s) => s.completeOnboarding);
  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <Image source={require('../../assets/icon.png')} style={styles.icon} accessibilityLabel="Smart Reader" />
        <Text style={styles.title}>Read.{'\n'}Capture.{'\n'}Remember.</Text>
        <Text style={styles.body}>
          Build a personal knowledge layer on top of your books. Save words and passages without leaving the page, then
          jump straight back to where they came from.
        </Text>
      </View>
      <Button label="Get Started" onPress={complete} style={styles.cta} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.navy, paddingHorizontal: 28, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center', gap: 20 },
  icon: { width: 96, height: 96, borderRadius: 24 },
  title: { color: '#fff', fontSize: 44, fontWeight: '800', lineHeight: 50 },
  body: { color: '#B9C6F5', fontSize: 17, lineHeight: 25 },
  cta: { backgroundColor: palette.amber },
});
