import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { create } from 'zustand';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const FLAGS_KEY = 'smart-reader.flags';

type AuthState = {
  ready: boolean;
  session: Session | null;
  onboarded: boolean;
  /** user chose to use the app without an account (local only) */
  guest: boolean;
  init: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const saveFlags = (f: { onboarded: boolean; guest: boolean }) =>
  AsyncStorage.setItem(FLAGS_KEY, JSON.stringify(f)).catch(() => {});

export const useAuth = create<AuthState>((set, get) => ({
  ready: false,
  session: null,
  onboarded: false,
  guest: false,

  init: async () => {
    let flags = { onboarded: false, guest: false };
    try {
      flags = { ...flags, ...JSON.parse((await AsyncStorage.getItem(FLAGS_KEY)) ?? '{}') };
    } catch {
      /* first run */
    }
    let session: Session | null = null;
    if (supabase) {
      session = (await supabase.auth.getSession()).data.session;
      supabase.auth.onAuthStateChange((_event, s) => set({ session: s }));
    }
    set({ ...flags, session, ready: true });
  },

  completeOnboarding: async () => {
    set({ onboarded: true });
    await saveFlags({ onboarded: true, guest: get().guest });
  },

  continueAsGuest: async () => {
    set({ guest: true });
    await saveFlags({ onboarded: get().onboarded, guest: true });
  },

  signIn: async (email, password) => {
    if (!supabase) return 'Cloud sync is not configured.';
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error?.message ?? null;
  },

  signUp: async (email, password) => {
    if (!supabase) return 'Cloud sync is not configured.';
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return error.message;
    if (!data.session) return 'Check your email to confirm your account, then sign in.';
    return null;
  },

  signInWithGoogle: async () => {
    if (!supabase) return 'Cloud sync is not configured.';
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) return error?.message ?? 'Could not start Google sign-in.';
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return null; // user dismissed
    const code = Linking.parse(result.url).queryParams?.code;
    if (typeof code !== 'string') return 'Google sign-in did not return a code.';
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    return exchangeError?.message ?? null;
  },

  signOut: async () => {
    await supabase?.auth.signOut();
    set({ session: null });
  },
}));

export { isSupabaseConfigured };
