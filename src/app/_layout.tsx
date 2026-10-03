import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDb } from '@/lib/db';
import { requestSync, syncNow } from '@/lib/sync';
import { isSupabaseConfigured, useAuth } from '@/store/auth';
import { useColors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: false } },
});

export default function RootLayout() {
  const colors = useColors();
  const { ready, session, onboarded, guest, init } = useAuth();
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    getDb().then(() => setDbReady(true));
    init();
  }, [init]);

  useEffect(() => {
    if (ready && dbReady) SplashScreen.hideAsync().catch(() => {});
  }, [ready, dbReady]);

  // Cloud sync triggers: sign-in, app foreground, connectivity regained.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    syncNow();
    const appSub = AppState.addEventListener('change', (s) => s === 'active' && requestSync(500));
    const netSub = Network.addNetworkStateListener((s) => s.isInternetReachable && requestSync(500));
    return () => {
      appSub.remove();
      netSub.remove();
    };
  }, [userId]);

  if (!ready || !dbReady) return null;

  const needsAuth = isSupabaseConfigured && !session && !guest;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Protected guard={!onboarded}>
              <Stack.Screen name="onboarding" />
            </Stack.Protected>
            <Stack.Protected guard={onboarded && needsAuth}>
              <Stack.Screen name="sign-in" />
            </Stack.Protected>
            <Stack.Protected guard={onboarded && !needsAuth}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="reader/[id]" options={{ animation: 'fade', gestureEnabled: false }} />
              <Stack.Screen name="word/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="passage/[id]" options={{ presentation: 'modal' }} />
            </Stack.Protected>
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
