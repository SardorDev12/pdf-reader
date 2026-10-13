import type { useRouter } from 'expo-router';
import { track } from './analytics';
import { hasLocation, type Location } from './types';

/** Opens the reader at the exact stored location and flashes a highlight there. */
export function openInBook(
  router: ReturnType<typeof useRouter>,
  bookId: string,
  location: Location,
  kind: 'word' | 'passage' | 'note' | 'bookmark',
  /** briefly flash the spot: only for items without a permanent highlight */
  flash = false,
) {
  track(`${kind === 'word' ? 'vocabulary' : kind}_opened` as const, { bookId });
  const has = hasLocation(location);
  router.push({
    pathname: '/reader/[id]',
    params: {
      id: bookId,
      loc: has ? JSON.stringify(location) : '',
      highlight: has && flash ? '1' : '',
    },
  });
}
