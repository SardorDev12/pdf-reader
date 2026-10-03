import { getDb, now } from './db';

export type AnalyticsEvent =
  | 'book_added'
  | 'book_opened'
  | 'reading_started'
  | 'reading_progress'
  | 'word_saved'
  | 'passage_saved'
  | 'passage_opened'
  | 'vocabulary_opened'
  | 'book_completed';

/**
 * Local-only event log. Kept deliberately tiny so a real analytics sink can be
 * plugged in later without touching call sites.
 */
export async function track(name: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO analytics_events (name, props, created_at) VALUES (?, ?, ?)',
      name,
      props ? JSON.stringify(props) : null,
      now(),
    );
  } catch {
    // analytics must never break the app
  }
}

/** Saved Knowledge Revisit Rate = reopened saved items / total saved items. */
export async function revisitRate(): Promise<{ saved: number; opened: number; rate: number }> {
  const db = await getDb();
  const count = async (name: string) =>
    (await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM analytics_events WHERE name = ?', name))?.c ?? 0;
  const saved = (await count('passage_saved')) + (await count('word_saved'));
  const opened = (await count('passage_opened')) + (await count('vocabulary_opened'));
  return { saved, opened, rate: saved ? Math.min(1, opened / saved) : 0 };
}
