# Smart Reader

An offline-first Android EPUB reader (Expo + React Native) for building a personal knowledge layer on top of books:
**Read → Capture → Organize → Revisit.**

```
← Vocabulary | Reader | Saved →
```

- Swipe in from the **left edge** for vocabulary captured in the current book (words from the chapter you're in come first).
- Swipe in from the **right edge** for saved passages.
- Tap any item to jump to its exact place in the book; the passage is highlighted for a few seconds.
- Long-press a word or select lines → **Add to Vocabulary** / **Save Passage**.

## Stack

Expo SDK 57 · Expo Router · TypeScript · SQLite (`expo-sqlite`, source of truth) · Zustand · TanStack Query ·
Supabase (Auth, Postgres, Storage) · `@epubjs-react-native/core` (epub.js in a WebView, EPUB CFI locations).

## Run

```bash
npm install
cp .env.example .env     # optional – see "Cloud sync"
npx expo start           # open in Expo Go / dev client on Android
npx expo run:android     # or build a dev build locally
npm run typecheck
```

The app works fully without Supabase configured (local-only mode).

## Cloud sync (optional)

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor
   (tables, Row Level Security `user_id = auth.uid()`, private storage buckets scoped to `<user_id>/`).
2. Put the project URL and anon key in `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
3. For Google Sign-In, enable the Google provider in Supabase Auth and add `smartreader://auth-callback`
   to the allowed redirect URLs.

Sync is offline-first: every row carries `sync_status` (`pending` / `synced` / `failed`), writes land in SQLite
immediately, and a debounced sync pushes pending rows and pulls newer remote rows (last-write-wins on `updated_at`).
It triggers on sign-in, app foreground, connectivity regained and after local writes. Book files and covers are
uploaded to private buckets and downloaded on other devices.

## Layout

```
src/app/            Expo Router screens: onboarding, sign-in, (tabs) library/vocabulary/saved/settings,
                    reader/[id], word/[id], passage/[id]
src/components/     EdgeDrawer (edge gestures), CaptureSheet, UI primitives
src/lib/            db (SQLite schema + migrations), repo (queries), epub (import + metadata),
                    sync, supabase, analytics (local event log), readerScripts (WebView injection)
src/store/          auth, settings
supabase/schema.sql Postgres schema, RLS and storage policies
```

## Notes

- Locations are stored as EPUB CFIs, so they survive font-size, screen-size and layout changes.
- App icon assets in `assets/` are generated from the supplied icon (adaptive foreground/background/monochrome,
  splash, favicon).
- Covers are stored at `covers/<user_id>/<book_id>.<ext>` (user-scoped so storage policies can be enforced).
- Out of MVP scope per the PRD: social, AI, flashcards/spaced repetition, Kindle, web app.
