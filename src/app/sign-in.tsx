import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { useColors } from '@/theme';

export default function SignIn() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithGoogle, continueAsGuest } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setBusy('email');
    setMessage(null);
    const err = await (mode === 'in' ? signIn : signUp)(email, password);
    setBusy(null);
    if (err) setMessage(err);
  };

  const google = async () => {
    setBusy('google');
    setMessage(null);
    const err = await signInWithGoogle();
    setBusy(null);
    if (err) setMessage(err);
  };

  const input = [styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.root, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: c.text }]}>{mode === 'in' ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>
          Sign in to back up and sync your library, words and saved passages.
        </Text>

        <View style={{ gap: 12, marginTop: 28 }}>
          <TextInput
            style={input}
            placeholder="Email"
            placeholderTextColor={c.textMuted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={input}
            placeholder="Password"
            placeholderTextColor={c.textMuted}
            secureTextEntry
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChangeText={setPassword}
          />
          {message ? <Text style={{ color: c.danger, fontSize: 14 }}>{message}</Text> : null}
          <Button
            label={mode === 'in' ? 'Sign in' : 'Sign up'}
            onPress={submit}
            loading={busy === 'email'}
            disabled={!email || password.length < 6}
          />
          <Button label="Continue with Google" icon="logo-google" variant="secondary" onPress={google} loading={busy === 'google'} />
          <Button
            label={mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
            variant="ghost"
            onPress={() => setMode(mode === 'in' ? 'up' : 'in')}
          />
        </View>

        <View style={{ flex: 1 }} />
        <Button label="Use without an account" variant="ghost" onPress={continueAsGuest} />
        <Text style={[styles.note, { color: c.textMuted }]}>Your data stays on this device until you sign in.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: 24 },
  title: { fontSize: 30, fontWeight: '800' },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  input: { height: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, fontSize: 16 },
  note: { textAlign: 'center', fontSize: 13, marginTop: 4 },
});
