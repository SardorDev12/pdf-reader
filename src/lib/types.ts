/** Stable content location. The CFI is the primary key for navigation; the rest is fallback/context. */
export type Location = {
  chapterId?: string;
  cfi?: string;
  offset?: number;
  startOffset?: number;
  endOffset?: number;
};

export type Book = {
  id: string;
  title: string;
  author?: string | null;
  coverPath?: string | null;
  filePath: string;
  format: 'epub';
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
