/** Stable content location. The CFI is the primary key for navigation; the rest is fallback/context. */
export type Location = {
  chapterId?: string;
  cfi?: string;
  offset?: number;
  startOffset?: number;
  endOffset?: number;
  /** PDF: 1-based page, vertical position within it (0..1), and character offsets into the page text. */
  page?: number;
  y?: number;
};

export type BookFormat = 'epub' | 'pdf';

/** Whether a stored location can be navigated to (EPUB CFI or PDF page). */
export const hasLocation = (l: Location) => !!(l.cfi || l.page);

export type Book = {
  id: string;
  title: string;
  author?: string | null;
  coverPath?: string | null;
  filePath: string;
  format: BookFormat;
  createdAt: string;
  updatedAt: string;
  /** joined from reading_progress */
  progressPercent: number;
  lastOpenedAt?: string | null;
};

export type ReadingProgress = {
  id: string;
  bookId: string;
  location: Location;
  progressPercent: number;
  updatedAt: string;
};

export type Vocabulary = {
  id: string;
  bookId: string;
  word: string;
  context: string;
  meaning?: string | null;
  location: Location;
  chapterLabel?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SavedPassage = {
  id: string;
  bookId: string;
  title: string;
  text: string;
  location: Location;
  chapterLabel?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Note = {
  id: string;
  bookId: string;
  title: string;
  content: string;
  /** optional quoted text the note is attached to */
  quote?: string | null;
  location: Location;
  chapterLabel?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Bookmark = {
  id: string;
  bookId: string;
  title: string;
  location: Location;
  chapterLabel?: string | null;
  progressPercent: number;
  createdAt: string;
};
