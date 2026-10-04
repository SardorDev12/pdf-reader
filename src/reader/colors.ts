import type { ReaderTheme } from '@/store/settings';

export const READER_COLORS: Record<ReaderTheme, { bg: string; fg: string; link: string }> = {
  light: { bg: '#FFFFFF', fg: '#111827', link: '#2F6FED' },
  sepia: { bg: '#F4ECD8', fg: '#5B4636', link: '#9A5B1E' },
  dark: { bg: '#16181D', fg: '#E5E7EB', link: '#8CB0FF' },
};
