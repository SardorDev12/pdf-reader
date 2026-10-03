# Pagemark

An offline-first Android EPUB reader (Expo + React Native) for building a personal knowledge layer on top of books:
**Read → Capture → Organize → Revisit.**

```
← Vocabulary | Reader | Saved →
```

- Swipe in from the **left edge** for vocabulary captured in the current book (words from the chapter you're in come first).
- Swipe in from the **right edge** for saved passages.
- Tap any item to jump to its exact place in the book; the passage is highlighted for a few seconds.
- Long-press a word or select lines → **Add to Vocabulary** / **Save Passage** / **Add Note**.
- Tap the bookmark icon in the top bar to bookmark the current page; everything lives in the Saved drawer (Passages · Notes · Marks).

## Stack

Expo SDK 57 · Expo Router · TypeScript · SQLite (`expo-sqlite`, source of truth) · Zustand · TanStack Query ·
`@epubjs-react-native/core` (epub.js in a WebView, EPUB CFI locations).

## Run

```bash
npm install
npx expo start           # open in Expo Go / dev client on Android
npx expo run:android     # or build a dev build locally
npm run typecheck
```

## Releasing

GitHub Actions builds the Android app and publishes OTA updates with EAS. Step-by-step platform setup (Expo,
GitHub, Google Play) is in [docs/RELEASING.md](docs/RELEASING.md).

## Data

Everything is stored locally in SQLite (`pagemark.db`) and works fully offline; nothing leaves the device.
Deleting a book removes its words, passages, notes and bookmarks with it (`ON DELETE CASCADE`).

## Layout

```
src/app/            Expo Router screens: onboarding, (tabs) library/vocabulary/saved/settings,
                    reader/[id], word/[id], passage/[id], note/[id]
src/components/     EdgeDrawer (edge gestures), CaptureSheet, UI primitives
src/lib/            db (SQLite schema + migrations), repo (queries), epub (import + metadata),
                    analytics (local event log), readerScripts (WebView injection)
src/store/          app (onboarding flag), settings
```

## Notes

- Locations are stored as EPUB CFIs, so they survive font-size, screen-size and layout changes.
- App icon assets in `assets/` are generated from the supplied icon (adaptive foreground/background/monochrome,
  splash, favicon).
- Out of scope: cloud sync/accounts, social, AI, flashcards/spaced repetition, Kindle, web app.
