import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { getDb } from './db';
import { supabase } from './supabase';

/**
 * Offline-first sync. SQLite is the source of truth for the UI; this module
 * pushes rows whose sync_status is not 'synced' and pulls remote rows newer than
 * the last pull. Conflicts resolve last-write-wins on updated_at.
 */

type Row = Record<string, any>;

const PULL_KEY = 'smart-reader.lastPull';

let running = false;
let queued = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(state: SyncState) => void>();

export type SyncState = { status: 'idle' | 'syncing' | 'error' | 'offline'; lastSyncedAt?: string; error?: string };
let state: SyncState = { status: 'idle' };
const setState = (s: Partial<SyncState>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l(state));
};
export const getSyncState = () => state;
export const subscribeSync = (l: (s: SyncState) => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const ext = (path: string) => path.split('.').pop()?.toLowerCase() || 'jpg';

async function pushTable(
  table: string,
  local: string,
  userId: string,
  toRemote: (r: Row) => Row,
  onConflict = 'id',
  beforePush?: (rows: Row[]) => Promise<void>,
) {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM ${local} WHERE sync_status != 'synced'`);
  if (!rows.length) return;
  try {
    await beforePush?.(rows);
    const payload = rows.map((r) => ({ ...toRemote(r), user_id: userId }));
    const { error } = await supabase!.from(table).upsert(payload, { onConflict });
    if (error) throw error;
    const ids = rows.map((r) => r.id);
    await db.runAsync(
      `UPDATE ${local} SET sync_status = 'synced' WHERE id IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    );
  } catch (e) {
    const ids = rows.map((r) => r.id);
    await db.runAsync(
      `UPDATE ${local} SET sync_status = 'failed' WHERE id IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    );
    throw e;
  }
}

async function uploadBookFiles(userId: string, rows: Row[]) {
  for (const r of rows) {
    if (r.deleted) continue;
    const file = new File(r.file_path);
    if (file.exists) {
      const { error } = await supabase!.storage
        .from('books')
        .upload(`${userId}/${r.id}/book.epub`, await file.arrayBuffer(), {
          contentType: 'application/epub+zip',
          upsert: true,
        });
      if (error) throw error;
    }
    if (r.cover_path) {
      const cover = new File(r.cover_path);
      if (cover.exists) {
        const { error } = await supabase!.storage
          .from('covers')
          .upload(`${userId}/${r.id}.${ext(r.cover_path)}`, await cover.arrayBuffer(), {
            contentType: `image/${ext(r.cover_path) === 'jpg' ? 'jpeg' : ext(r.cover_path)}`,
            upsert: true,
          });
        if (error) throw error;
      }
    }
  }
}

async function download(bucket: string, path: string, dest: File) {
  const { data, error } = await supabase!.storage.from(bucket).createSignedUrl(path, 600);
  if (error || !data) throw error ?? new Error('No signed URL');
  await File.downloadFileAsync(data.signedUrl, dest, { idempotent: true });
}

async function pullBooks(userId: string, since: string) {
  const db = await getDb();
  const { data, error } = await supabase!.from('books').select('*').gt('updated_at', since).order('updated_at');
  if (error) throw error;
  for (const r of data ?? []) {
    const existing = await db.getFirstAsync<Row>('SELECT id, updated_at FROM books WHERE id = ?', r.id);
    if (existing) {
      if (existing.updated_at >= r.updated_at) continue;
      await db.runAsync(
        "UPDATE books SET title=?, author=?, deleted=?, updated_at=?, sync_status='synced' WHERE id=?",
        r.title,
        r.author,
        r.deleted ? 1 : 0,
        r.updated_at,
        r.id,
      );
      continue;
    }
    if (r.deleted) continue;
    const dir = new Directory(Paths.document, 'books', r.id);
    dir.create({ intermediates: true, idempotent: true });
    const epub = new File(dir, 'book.epub');
    await download('books', `${userId}/${r.id}/book.epub`, epub);
    let coverPath: string | null = null;
    if (r.cover_url) {
      try {
        const cover = new File(dir, `cover.${ext(r.cover_url)}`);
        await download('covers', r.cover_url, cover);
        coverPath = cover.uri;
      } catch {
        /* cover is optional */
      }
    }
    await db.runAsync(
      `INSERT INTO books (id, title, author, cover_path, file_path, format, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      r.id,
      r.title,
      r.author,
      coverPath,
      epub.uri,
      r.format,
      r.created_at,
      r.updated_at,
    );
  }
}

async function pullSimple(
  remote: string,
  local: string,
  since: string,
  cols: string[],
  conflictCol = 'id',
) {
  const db = await getDb();
  const { data, error } = await supabase!.from(remote).select('*').gt('updated_at', since).order('updated_at');
  if (error) throw error;
  for (const r of data ?? []) {
    const existing = await db.getFirstAsync<Row>(
      `SELECT id, updated_at FROM ${local} WHERE ${conflictCol} = ?`,
      r[conflictCol],
    );
    if (existing && existing.updated_at >= r.updated_at) continue;
    const values = cols.map((c) => {
      const v = r[c];
      if (c === 'location') return JSON.stringify(v ?? {});
      if (c === 'deleted') return v ? 1 : 0;
      return v ?? null;
    });
    if (existing) {
      await db.runAsync(
        `UPDATE ${local} SET ${cols.map((c) => `${c} = ?`).join(', ')}, sync_status = 'synced' WHERE id = ?`,
        ...values,
        existing.id,
      );
    } else {
      await db.runAsync(
        `INSERT INTO ${local} (id, ${cols.join(', ')}, sync_status) VALUES (?, ${cols.map(() => '?').join(', ')}, 'synced')`,
        r.id,
        ...values,
      );
    }
  }
}

async function runSync() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;

  setState({ status: 'syncing', error: undefined });
  const startedAt = new Date().toISOString();
  const since = (await AsyncStorage.getItem(PULL_KEY)) ?? '1970-01-01T00:00:00.000Z';

  // push: books first so foreign keys resolve
  await pushTable(
    'books',
    'books',
    userId,
    (r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      cover_url: r.cover_path ? `${userId}/${r.id}.${ext(r.cover_path)}` : null,
      file_path: `${userId}/${r.id}/book.epub`,
      format: r.format,
      deleted: !!r.deleted,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }),
    'id',
    (rows) => uploadBookFiles(userId, rows),
  );
  await pushTable('reading_progress', 'reading_progress', userId, (r) => ({
    id: r.id,
    book_id: r.book_id,
    location: JSON.parse(r.location || '{}'),
    progress_percent: r.progress_percent,
    updated_at: r.updated_at,
  }), 'user_id,book_id');
  await pushTable('vocabulary', 'vocabulary', userId, (r) => ({
    id: r.id,
    book_id: r.book_id,
    word: r.word,
    context: r.context,
    meaning: r.meaning,
    location: JSON.parse(r.location || '{}'),
    chapter_label: r.chapter_label,
    deleted: !!r.deleted,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  await pushTable('saved_passages', 'saved_passages', userId, (r) => ({
    id: r.id,
    book_id: r.book_id,
    title: r.title,
    text: r.text,
    location: JSON.parse(r.location || '{}'),
    chapter_label: r.chapter_label,
    deleted: !!r.deleted,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  // pull
  await pullBooks(userId, since);
  await pullSimple('reading_progress', 'reading_progress', since, ['book_id', 'location', 'progress_percent', 'updated_at'], 'book_id');
  await pullSimple('vocabulary', 'vocabulary', since, [
    'book_id', 'word', 'context', 'meaning', 'location', 'chapter_label', 'deleted', 'created_at', 'updated_at',
  ]);
  await pullSimple('saved_passages', 'saved_passages', since, [
    'book_id', 'title', 'text', 'location', 'chapter_label', 'deleted', 'created_at', 'updated_at',
  ]);

  await AsyncStorage.setItem(PULL_KEY, startedAt);
  setState({ status: 'idle', lastSyncedAt: new Date().toISOString() });
}

/** Run a sync now (coalesces overlapping calls). Never throws. */
export async function syncNow() {
  if (!supabase) return;
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    await runSync();
  } catch (e: any) {
    const offline = /network|fetch|timeout/i.test(String(e?.message));
    setState({ status: offline ? 'offline' : 'error', error: e?.message ?? String(e) });
  } finally {
    running = false;
    if (queued) {
      queued = false;
      syncNow();
    }
  }
}

/** Debounced sync request, safe to call after every local write. */
export function requestSync(delay = 2500) {
  if (!supabase) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncNow();
  }, delay);
}

export async function resetSyncCursor() {
  await AsyncStorage.removeItem(PULL_KEY);
}
