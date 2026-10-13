/** Highlight colours for saved words, passages and notes. */
export const HIGHLIGHT_COLORS = [
  { hex: '#FBBF24', label: 'Yellow' },
  { hex: '#34D399', label: 'Green' },
  { hex: '#60A5FA', label: 'Blue' },
  { hex: '#F472B6', label: 'Pink' },
  { hex: '#FB923C', label: 'Orange' },
  { hex: '#A78BFA', label: 'Purple' },
] as const;

export const DEFAULT_HIGHLIGHT = HIGHLIGHT_COLORS[0].hex;
/** stored when the user picks "no highlight" */
export const NO_HIGHLIGHT = 'none';

/** The colour to paint, or null when the item should not be highlighted. Items saved before colours existed get the default. */
export function paintColor(stored?: string | null): string | null {
  if (stored === NO_HIGHLIGHT) return null;
  return stored || DEFAULT_HIGHLIGHT;
}

export type Highlight = { id: string; location: import('./types').Location; color: string };
