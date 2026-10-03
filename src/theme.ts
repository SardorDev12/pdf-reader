import { useColorScheme } from 'react-native';

export const palette = {
  navy: '#0E1F5C',
  navyDeep: '#0A164A',
  blue: '#2F6FED',
  blueSoft: '#DCE8FF',
  amber: '#FBBF24',
  danger: '#DC2626',
};

export type Colors = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryText: string;
  accent: string;
  danger: string;
  overlay: string;
};

const light: Colors = {
  bg: '#F5F7FC',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EEFA',
  text: '#0B1437',
  textMuted: '#5B6794',
  border: '#DDE3F3',
  primary: palette.blue,
  primaryText: '#FFFFFF',
  accent: palette.amber,
  danger: palette.danger,
  overlay: 'rgba(8,14,40,0.45)',
};

const dark: Colors = {
  bg: '#070D26',
  surface: '#0E1736',
  surfaceAlt: '#17224A',
  text: '#EEF2FF',
  textMuted: '#9AA6D1',
  border: '#1F2B58',
  primary: '#5B8CFF',
  primaryText: '#FFFFFF',
  accent: palette.amber,
  danger: '#F87171',
  overlay: 'rgba(0,0,0,0.6)',
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
