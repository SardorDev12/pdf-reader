import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDb } from '@/lib/db';
import { useApp } from '@/store/app';
import { useColors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: false } },
});

export default function RootLayout() {
  const colors = useColors();
  const { ready, onboarded, init } = useApp();
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    getDb().then(() => setDbReady(true));
    init();
  }, [init]);

  useEffect(() => {
    if (ready && dbReady) SplashScreen.hideAsync().catch(() => {});
  }, [ready, dbReady]);

  if (!ready || !dbReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Protected guard={!onboarded}>
              <Stack.Screen name="onboarding" />
            </Stack.Protected>
            <Stack.Protected guard={onboarded}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="reader/[id]" options={{ animation: 'fade', gestureEnabled: false }} />
              <Stack.Screen name="word/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="passage/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="note/[id]" options={{ presentation: 'modal' }} />
            </Stack.Protected>
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
