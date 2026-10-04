import type { Book, Bookmark, Location } from '@/lib/types';
import type { ReaderTheme } from '@/store/settings';

/** What an engine reports whenever the visible position changes. */
export type PageInfo = {
  /** where the viewport starts: saved as reading progress and used for new bookmarks */
  location: Location;
  /** 0..100 */
  percent: number;
  /** shown in the footer and stored with captured items, e.g. "Chapter 4" or "Chapter 4 · p. 87" */
  chapterLabel: string;
  /** groups captured items by chapter in the vocabulary drawer */
  chapterId?: string;
  bookmarkTitle: string;
  /** changes whenever the visible page changes */
  key: string;
  isBookmarked: (b: Bookmark) => boolean;
};

export type SelectionKind = 'word' | 'note' | 'passage';

export type EngineSelection = {
  text: string;
  /** the sentence around the selection */
  context?: string;
  location: Location;
  chapterLabel?: string | null;
};

export type ReaderHandle = {
  jumpTo: (location: Location, highlight: boolean) => void;
};

export type ReaderViewProps = {
  book: Book;
  /** explicit deep link, otherwise saved reading progress */
  initialLocation?: Location;
  highlightOnOpen: boolean;
  theme: ReaderTheme;
  /** EPUB text size, percent */
  fontSize: number;
  /** PDF zoom, percent (100 = fit to width) */
  zoom: number;
  width: number;
  height: number;
  /** saved words, so the engine can tell which of them are on the visible page */
  vocab: { id: string; location: Location }[];
  /** ids of the saved words on the visible page, or null if the engine could not tell */
  onVisibleVocab: (ids: string[] | null) => void;
  onPage: (info: PageInfo) => void;
  onSelect: (kind: SelectionKind, selection: EngineSelection) => void;
  onTap: () => void;
  onZoomChange?: (zoomPercent: number) => void;
};
