# Releasing Pagemark (builds + OTA updates)

Work happens directly on `main` (no pull requests). Everything below is done in a browser: expo.dev, GitHub and (for the Play Store) Google Play Console / Google Cloud.
No local CLI is needed; GitHub Actions runs the EAS CLI for you.

## How it works

Nothing runs automatically. Both workflows are **manual**: open the repo's **Actions** tab, pick a workflow and
press **Run workflow**.

| Workflow | What it does |
| --- | --- |
| **EAS Update (OTA)** | Publishes a JS/asset-only update to the `production` (or `preview`) update branch; installed apps pick it up on next launch |
| **EAS Build (Android)** | Builds a store-ready `.aab` (production) or an installable `.apk` (preview) on Expo's servers; optionally submits to Google Play |

**Rule of thumb:** changed only screens/logic/images → commit to `main` and run the OTA workflow. Added or upgraded a native
library, changed `app.json` plugins/permissions/icon/splash, or upgraded Expo → bump `version` in `app.json` and ship a
new build (run the build workflow). OTA updates only reach installed builds whose `version` matches (`runtimeVersion` policy is
`appVersion`), so a version bump also protects old installs from receiving JS they can't run.

---

## Part 1 — One-time setup

Do these in order. The workflows refuse to run until steps 3 and 4 are done, which is intentional.

### 1. Create the Expo project (expo.dev)

1. Sign in at <https://expo.dev> (create a free account if needed).
2. **Projects → Create a project**. Use display name `Pagemark` and **slug `pagemark`** (must match
   `expo.slug` in `app.json`).
3. Open the project's **Overview** page and copy the **Project ID** (a UUID).

### 2. Create an access token (expo.dev)

1. Top-right avatar → **Account settings → Access tokens → Create token** (name it `github-actions`).
2. Copy the token now; it is shown once.

### 3. Add the token to GitHub

1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**.
2. Name: `EXPO_TOKEN`, value: the token from step 2.

### 4. Put the Project ID in `app.json` (GitHub web editor)

1. GitHub repo → open `app.json` → pencil icon.
2. Replace **both** occurrences of `REPLACE_WITH_EAS_PROJECT_ID`:
   - `updates.url` → `https://u.expo.dev/<PROJECT_ID>`
   - `extra.eas.projectId` → `<PROJECT_ID>`
3. Commit to `main` (nothing runs automatically).

### 5. Connect GitHub to the Expo project (expo.dev) — recommended

Project → **GitHub** tab (project settings) → connect the `SardorDev12/pdf-reader` repo. This also lets you start
builds directly from the Expo dashboard, which you need for the first build (step 6).

### 6. First production build + signing key (expo.dev)

CI builds are non-interactive and **cannot create a new Android signing keystore**, so the very first build must be
started from the dashboard, where Expo generates and stores the keystore for you.

1. Project → **Builds → Create build** (or **Start build** from the GitHub-connected repo).
2. Platform **Android**, profile **production**, branch `main`.
3. When asked about credentials, choose to let Expo **generate a new keystore**.
4. Wait for it to finish. Afterwards confirm under Project → **Credentials → Android** that a keystore exists for
   `com.pagemark.app`. All later builds (including from GitHub Actions) reuse it.

> I couldn't open the Expo docs from my environment to double-check the exact button names on the dashboard, so the
> labels above may differ slightly. If you can't find a way to generate the keystore in the dashboard, tell me what
> you see and I'll adjust the steps.

### 7. Check the update channel (expo.dev)

Project → **Updates** (or **Channels**): the channel `production` should point at the update branch `production`.
Builds made with the `production` profile listen to the `production` channel; the OTA workflow publishes to the
`production` branch. If the channel isn't linked to that branch, link it here. The same applies to `preview` ↔
`preview`.

---

## Part 2 — Publish to Google Play (one-time, then automated)

1. **Google Play Console** (<https://play.google.com/console>, one-time developer registration fee applies):
   **Create app** → name *Pagemark*, default language, app/free, accept declarations.
   Complete the dashboard tasks (privacy policy URL, content rating, data safety, target audience). The app stores
   everything locally and collects no data, which you declare in **Data safety**.
2. Use package name **`com.pagemark.app`** (it's baked into the build; Play ties the app to it permanently, so
   change it in `app.json` *before* your first upload if you want a different one).
3. **First upload must be manual.** On expo.dev open the finished production build → download the `.aab` →
   Play Console → **Testing → Internal testing → Create new release → upload the `.aab`** → add testers → roll out.
   Accept **Play App Signing** when prompted (Google holds the app signing key; your EAS keystore is the upload key).
4. Once the app has one release, you can automate submissions:
   1. **Google Cloud console** (<https://console.cloud.google.com>): create/select a project → **IAM & Admin →
      Service accounts → Create service account** (e.g. `eas-submit`) → **Keys → Add key → JSON** and download it.
      Also enable the **Google Play Android Developer API** for that project (APIs & Services → Library).
   2. **Play Console → Users and permissions → Invite new users**: invite the service account's email and grant it
      access to the app with release permissions.
   3. **expo.dev → Project → Credentials → Android → Service Credentials**: upload the JSON key.
5. From now on, run **Actions → EAS Build (Android) → Run workflow** with *profile = production* and *submit* ticked;
   the build is sent to Play's **internal testing** track as a draft (see `eas.json`). Promote it to production in
   Play Console when you're happy.

---

## Part 3 — Day-to-day releases

### Ship a JS-only change (OTA)

1. Commit your change to `main`.
2. **Actions → EAS Update (OTA) → Run workflow** (branch `production`). A green run means the update is live.
3. Verify on expo.dev → **Updates**. On a phone, open the app and close/reopen it (the update downloads on launch and
   applies the next time the app starts), or open **Settings → App → Check for updates**.

Try a change safely first: **Actions → EAS Update (OTA) → Run workflow**, branch `preview`, then test on a build made
with the `preview` profile.

### Ship a new native build

1. Edit `app.json` on GitHub and bump `version` (e.g. `1.0.0` → `1.1.0`). Commit to `main`.
2. **Actions → EAS Build (Android) → Run workflow**, profile `production`. The job just queues the build and exits.
   Follow progress on expo.dev → **Builds**. Remote build numbers (`versionCode`) auto-increment.
3. Download the `.aab` for the Play Console, or rerun the workflow manually with *submit* ticked to push it to Play
   automatically.

### Get a test APK on your phone

**Actions → EAS Build (Android) → Run workflow → profile `preview`.** When done, open the build page on expo.dev from
your phone and install the APK. Preview builds receive updates from the `preview` branch only.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Workflow fails: *Missing EXPO_TOKEN* | Redo step 2–3; secret name must be exactly `EXPO_TOKEN`. |
| Workflow fails: *REPLACE_WITH_EAS_PROJECT_ID* | Do step 4 (both occurrences). |
| Build fails asking for credentials / keystore | Do step 6 (first build from the dashboard). |
| *Slug mismatch* / project not found | Project slug on expo.dev must be `pagemark`, and the token's account must own it. |
| Update published but the phone doesn't get it | The installed build's `version` must equal `app.json`'s `version` at publish time; the build's channel must be linked to the branch (step 7); updates apply on the **second** launch. Dev builds and Expo Go never receive updates. |
| App crashes right after an OTA | You shipped JS that needs a native change. Bump `version`, ship a new build, and re-publish. |
