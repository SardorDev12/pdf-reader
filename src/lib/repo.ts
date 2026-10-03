import { getDb, now, parseLocation } from './db';
import { newId } from './ids';
import type { Book, Bookmark, Location, Note, SavedPassage, Vocabulary } from './types';

/* ------------------------------- books ---------------------------------- */

type BookRow = {
  id: string;
  title: string;
  author: string | null;
  cover_path: string | null;
  file_path: string;
  format: 'epub';
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
  progress_percent: number | null;
};

const mapBook = (r: BookRow): Book => ({
  id: r.id,
  title: r.title,
  author: r.author,
  coverPath: r.cover_path,
  filePath: r.file_path,
  format: r.format,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastOpenedAt: r.last_opened_at,
  progressPercent: r.progress_percent ?? 0,
});

const BOOK_SELECT = `
  SELECT b.*, p.progress_percent AS progress_percent
  FROM books b LEFT JOIN reading_progress p ON p.book_id = b.id
  WHERE 1 = 1`;

export async function listBooks(): Promise<Book[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<BookRow>(
    `${BOOK_SELECT} ORDER BY COALESCE(b.last_opened_at, b.created_at) DESC`,
  );
  return rows.map(mapBook);
}

export async function getBook(id: string): Promise<Book | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<BookRow>(`${BOOK_SELECT} AND b.id = ?`, id);
  return row ? mapBook(row) : null;
}

export async function insertBook(input: {
  id: string;
  title: string;
  author?: string | null;
  coverPath?: string | null;
  filePath: string;
}) {
  const db = await getDb();
  const t = now();
  await db.runAsync(
    `INSERT INTO books (id, title, author, cover_path, file_path, format, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'epub', ?, ?)`,
    input.id,
    input.title,
    input.author ?? null,
    input.coverPath ?? null,
    input.filePath,
    t,
    t,
  );
}

export async function touchBook(id: string) {
  const db = await getDb();
  await db.runAsync('UPDATE books SET last_opened_at = ? WHERE id = ?', now(), id);
}

/** Deletes the book and (via ON DELETE CASCADE) everything captured from it. */
export async function deleteBook(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM books WHERE id = ?', id);
}

/* ----------------------------- progress --------------------------------- */

export async function getProgress(bookId: string): Promise<{ location: Location; progressPercent: number } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ location: string; progress_percent: number }>(
    'SELECT location, progress_percent FROM reading_progress WHERE book_id = ?',
    bookId,
  );
  return row ? { location: parseLocation<Location>(row.location), progressPercent: row.progress_percent } : null;
}

export async function saveProgress(bookId: string, location: Location, progressPercent: number) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO reading_progress (id, book_id, location, progress_percent, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       location = excluded.location,
       progress_percent = excluded.progress_percent,
       updated_at = excluded.updated_at`,
    newId(),
    bookId,
    JSON.stringify(location),
    progressPercent,
    now(),
  );
}

/* ----------------------------- vocabulary ------------------------------- */

type VocabRow = {
  id: string;
  book_id: string;
  word: string;
  context: string;
  meaning: string | null;
  location: string;
  chapter_label: string | null;
  created_at: string;
  updated_at: string;
};

const mapVocab = (r: VocabRow): Vocabulary => ({
  id: r.id,
  bookId: r.book_id,
  word: r.word,
  context: r.context,
  meaning: r.meaning,
  location: parseLocation<Location>(r.location),
  chapterLabel: r.chapter_label,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listVocabulary(bookId?: string): Promise<Vocabulary[]> {
  const db = await getDb();
  const rows = bookId
    ? await db.getAllAsync<VocabRow>('SELECT * FROM vocabulary WHERE book_id = ? ORDER BY created_at DESC', bookId)
    : await db.getAllAsync<VocabRow>('SELECT * FROM vocabulary ORDER BY created_at DESC');
  return rows.map(mapVocab);
}

export async function getVocabulary(id: string): Promise<Vocabulary | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<VocabRow>('SELECT * FROM vocabulary WHERE id = ?', id);
  return row ? mapVocab(row) : null;
}

export async function addVocabulary(input: {
  bookId: string;
  word: string;
  context: string;
  meaning?: string;
  location: Location;
  chapterLabel?: string | null;
}): Promise<Vocabulary> {
  const db = await getDb();
  const id = newId();
  const t = now();
  await db.runAsync(
    `INSERT INTO vocabulary (id, book_id, word, context, meaning, location, chapter_label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.bookId,
    input.word,
    input.context,
    input.meaning?.trim() || null,
    JSON.stringify(input.location),
    input.chapterLabel ?? null,
    t,
    t,
  );
  return (await getVocabulary(id))!;
}

export async function updateVocabularyMeaning(id: string, meaning: string) {
  const db = await getDb();
  await db.runAsync('UPDATE vocabulary SET meaning = ?, updated_at = ? WHERE id = ?', meaning.trim() || null, now(), id);
}

export async function deleteVocabulary(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM vocabulary WHERE id = ?', id);
}

/* ----------------------------- passages --------------------------------- */

type PassageRow = {
  id: string;
  book_id: string;
  title: string;
  text: string;
  location: string;
  chapter_label: string | null;
  created_at: string;
  updated_at: string;
};

const mapPassage = (r: PassageRow): SavedPassage => ({
  id: r.id,
  bookId: r.book_id,
  title: r.title,
  text: r.text,
  location: parseLocation<Location>(r.location),
  chapterLabel: r.chapter_label,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listPassages(bookId?: string): Promise<SavedPassage[]> {
  const db = await getDb();
  const rows = bookId
    ? await db.getAllAsync<PassageRow>('SELECT * FROM saved_passages WHERE book_id = ? ORDER BY created_at DESC', bookId)
    : await db.getAllAsync<PassageRow>('SELECT * FROM saved_passages ORDER BY created_at DESC');
  return rows.map(mapPassage);
}

export async function addPassage(input: {
  bookId: string;
  title: string;
  text: string;
  location: Location;
  chapterLabel?: string | null;
}) {
  const db = await getDb();
  const t = now();
  await db.runAsync(
    `INSERT INTO saved_passages (id, book_id, title, text, location, chapter_label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    input.bookId,
    input.title,
    input.text,
    JSON.stringify(input.location),
    input.chapterLabel ?? null,
    t,
    t,
  );
}

export async function renamePassage(id: string, title: string) {
  const db = await getDb();
  await db.runAsync('UPDATE saved_passages SET title = ?, updated_at = ? WHERE id = ?', title, now(), id);
}

export async function deletePassage(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM saved_passages WHERE id = ?', id);
}

/* ------------------------------- notes ---------------------------------- */

type NoteRow = {
  id: string;
  book_id: string;
  title: string;
  content: string;
  quote: string | null;
  location: string;
  chapter_label: string | null;
  created_at: string;
  updated_at: string;
};

const mapNote = (r: NoteRow): Note => ({
  id: r.id,
  bookId: r.book_id,
  title: r.title,
  content: r.content,
  quote: r.quote,
  location: parseLocation<Location>(r.location),
  chapterLabel: r.chapter_label,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listNotes(bookId?: string): Promise<Note[]> {
  const db = await getDb();
  const rows = bookId
    ? await db.getAllAsync<NoteRow>('SELECT * FROM notes WHERE book_id = ? ORDER BY created_at DESC', bookId)
    : await db.getAllAsync<NoteRow>('SELECT * FROM notes ORDER BY created_at DESC');
  return rows.map(mapNote);
}

export async function getNote(id: string): Promise<Note | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<NoteRow>('SELECT * FROM notes WHERE id = ?', id);
  return row ? mapNote(row) : null;
}

export async function addNote(input: {
  bookId: string;
  title: string;
  content: string;
  quote?: string | null;
  location: Location;
  chapterLabel?: string | null;
}) {
  const db = await getDb();
  const t = now();
  await db.runAsync(
    `INSERT INTO notes (id, book_id, title, content, quote, location, chapter_label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    input.bookId,
    input.title,
    input.content,
    input.quote ?? null,
    JSON.stringify(input.location),
    input.chapterLabel ?? null,
    t,
    t,
  );
}

export async function updateNote(id: string, title: string, content: string) {
  const db = await getDb();
  await db.runAsync('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?', title, content, now(), id);
}

export async function deleteNote(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM notes WHERE id = ?', id);
}

/* ----------------------------- bookmarks -------------------------------- */

type BookmarkRow = {
  id: string;
  book_id: string;
  title: string;
  location: string;
  chapter_label: string | null;
  progress_percent: number;
  created_at: string;
};

const mapBookmark = (r: BookmarkRow): Bookmark => ({
  id: r.id,
  bookId: r.book_id,
  title: r.title,
  location: parseLocation<Location>(r.location),
  chapterLabel: r.chapter_label,
  progressPercent: r.progress_percent,
  createdAt: r.created_at,
});

export async function listBookmarks(bookId?: string): Promise<Bookmark[]> {
  const db = await getDb();
  const rows = bookId
    ? await db.getAllAsync<BookmarkRow>(
        'SELECT * FROM bookmarks WHERE book_id = ? ORDER BY progress_percent, created_at',
        bookId,
      )
    : await db.getAllAsync<BookmarkRow>('SELECT * FROM bookmarks ORDER BY created_at DESC');
  return rows.map(mapBookmark);
}

export async function addBookmark(input: {
  bookId: string;
  title: string;
  location: Location;
  chapterLabel?: string | null;
  progressPercent: number;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO bookmarks (id, book_id, title, location, chapter_label, progress_percent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    input.bookId,
    input.title,
    JSON.stringify(input.location),
    input.chapterLabel ?? null,
    input.progressPercent,
    now(),
  );
}

export async function deleteBookmark(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM bookmarks WHERE id = ?', id);
}

/* ------------------------------ search ---------------------------------- */

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function searchAll(query: string) {
  const q = query.trim();
  const empty = {
    books: [] as Book[],
    vocabulary: [] as Vocabulary[],
    passages: [] as SavedPassage[],
    notes: [] as Note[],
    bookmarks: [] as Bookmark[],
  };
  if (!q) return empty;
  const db = await getDb();
  const p = like(q);
  const [books, vocab, passages, notes, bookmarks] = await Promise.all([
    db.getAllAsync<BookRow>(
      `${BOOK_SELECT} AND (b.title LIKE ? ESCAPE '\\' OR b.author LIKE ? ESCAPE '\\') ORDER BY b.title`,
      p,
      p,
    ),
    db.getAllAsync<VocabRow>(
      `SELECT * FROM vocabulary WHERE word LIKE ? ESCAPE '\\' OR meaning LIKE ? ESCAPE '\\' OR context LIKE ? ESCAPE '\\' ORDER BY word`,
      p,
      p,
      p,
    ),
    db.getAllAsync<PassageRow>(
      `SELECT * FROM saved_passages WHERE title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' ORDER BY created_at DESC`,
      p,
      p,
    ),
    db.getAllAsync<NoteRow>(
      `SELECT * FROM notes WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR quote LIKE ? ESCAPE '\\' ORDER BY created_at DESC`,
      p,
      p,
      p,
    ),
    db.getAllAsync<BookmarkRow>(
      `SELECT * FROM bookmarks WHERE title LIKE ? ESCAPE '\\' OR chapter_label LIKE ? ESCAPE '\\' ORDER BY created_at DESC`,
      p,
      p,
    ),
  ]);
  return {
    books: books.map(mapBook),
    vocabulary: vocab.map(mapVocab),
    passages: passages.map(mapPassage),
    notes: notes.map(mapNote),
    bookmarks: bookmarks.map(mapBookmark),
  };
}
