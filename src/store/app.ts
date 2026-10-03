import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const ONBOARDED_KEY = 'smart-reader.onboarded';

type AppState = {
  ready: boolean;
  onboarded: boolean;
  init: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
};

export const useApp = create<AppState>((set) => ({
  ready: false,
  onboarded: false,
  init: async () => {
    const onboarded = (await AsyncStorage.getItem(ONBOARDED_KEY).catch(() => null)) === '1';
    set({ onboarded, ready: true });
  },
  completeOnboarding: async () => {
    set({ onboarded: true });
    await AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {});
  },
}));
