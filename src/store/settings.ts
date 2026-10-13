import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DEFAULT_HIGHLIGHT } from '@/lib/highlight';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ReaderTheme = 'light' | 'sepia' | 'dark';

type SettingsState = {
  /** percent, 100 = book default */
  fontSize: number;
  readerTheme: ReaderTheme;
  /** PDF zoom in percent, 100 = fit to width */
  pdfZoom: number;
  setPdfZoom: (n: number) => void;
  /** the colour used for the next saved word / passage / note */
  highlightColor: string;
  setHighlightColor: (c: string) => void;
  setFontSize: (n: number) => void;
  setReaderTheme: (t: ReaderTheme) => void;
};

export const FONT_MIN = 70;
export const FONT_MAX = 220;
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 400;

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      fontSize: 110,
      readerTheme: 'light',
      pdfZoom: 100,
      highlightColor: DEFAULT_HIGHLIGHT,
      setHighlightColor: (highlightColor) => set({ highlightColor }),
      setPdfZoom: (n) => set({ pdfZoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(n))) }),
      setFontSize: (n) => set({ fontSize: Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(n))) }),
      setReaderTheme: (readerTheme) => set({ readerTheme }),
    }),
    { name: 'pagemark.settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
