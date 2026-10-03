import type { useRouter } from 'expo-router';
import { track } from './analytics';
import type { Location } from './types';

/** Opens the reader at the exact stored location and flashes a highlight there. */
export function openInBook(router: ReturnType<typeof useRouter>, bookId: string, location: Location, kind: 'word' | 'passage') {
  track(kind === 'word' ? 'vocabulary_opened' : 'passage_opened', { bookId });
  router.push({
    pathname: '/reader/[id]',
    params: { id: bookId, cfi: location.cfi ?? '', highlight: location.cfi ? '1' : '' },
  });
}
