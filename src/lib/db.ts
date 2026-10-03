import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA_VERSION = 1;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    cover_path TEXT,
    file_path TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'epub',
    last_opened_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reading_progress (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL UNIQUE REFERENCES books(id) ON DELETE CASCADE,
    location TEXT NOT NULL DEFAULT '{}',
    progress_percent REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vocabulary (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    meaning TEXT,
    location TEXT NOT NULL DEFAULT '{}',
    chapter_label TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_vocab_book ON vocabulary(book_id);
  CREATE TABLE IF NOT EXISTS saved_passages (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '{}',
    chapter_label TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_passages_book ON saved_passages(book_id);
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    quote TEXT,
    location TEXT NOT NULL DEFAULT '{}',
    chapter_label TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notes_book ON notes(book_id);
  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '{}',
    chapter_label TEXT,
    progress_percent REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(book_id);
  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    props TEXT,
    created_at TEXT NOT NULL
  );
  `,
];

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < SCHEMA_VERSION) {
    await db.execAsync(MIGRATIONS[version]);
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('smart-reader.db');
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

export const now = () => new Date().toISOString();

export function parseLocation<T = Record<string, unknown>>(raw: string | null | undefined): T {
  try {
    return JSON.parse(raw || '{}') as T;
  } catch {
    return {} as T;
  }
}
