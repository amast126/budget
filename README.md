# Budget Tracker — hosted version

Four files do the work: `index.html`, `app.js`, `config.js`, and `manifest.webmanifest` (plus `icon.svg`).
`firestore.rules` is pasted into Firebase, not served.

Everything is free at this scale: GitHub Pages, Firebase's Spark plan (no card needed), and Finnhub's free key.

## 1. Firebase (sign-in and sync) — about 10 minutes

1. Go to https://console.firebase.google.com and click **Create a project**. Name it anything (e.g. `budget-tracker`).
   Turn Google Analytics **off** (not needed). Leave it on the **Spark (free)** plan.
2. In the project, open **Build → Authentication → Get started → Sign-in method**, enable **Google**, pick a support email, save.
3. Open **Build → Firestore Database → Create database**. Choose a location near you, start in **production mode**, create.
4. On the Firestore page, open the **Rules** tab, replace everything with the contents of `firestore.rules`, and click **Publish**.
5. Click the gear → **Project settings**. Under **Your apps** click the **web** icon (`</>`), register the app (any nickname, do not tick Hosting),
   then copy the `firebaseConfig` object it shows. Paste its values into `config.js`.
6. Still in Authentication → **Settings → Authorized domains**, add the domain you'll host on (for GitHub Pages that's `YOURNAME.github.io`).
   `localhost` is already there for testing.

## 2. Finnhub (stock prices) — 2 minutes

Sign up at https://finnhub.io, confirm your email, copy the API key from the dashboard into `finnhubKey` in `config.js`.

## 3. Host it on GitHub Pages — 5 minutes

1. Create a new repository on GitHub (e.g. `budget`). It can be **private**: the site itself is public at its URL,
   but there's no personal data in these files — your data lives in Firebase and in your browser, never in the repo.
2. Upload the contents of this folder (the files, not the folder) to the repo. Commit.
3. Repo **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`. Save.
4. After a minute it's live at `https://YOURNAME.github.io/budget/`. Add that domain to Firebase authorized domains if you didn't in step 1.6.

Prefer no GitHub? Drag the folder onto https://app.netlify.com/drop instead. Same result, and add the Netlify domain to Firebase.

## 4. First run

1. Open the site, click **Sign in with Google to sync**.
2. In the Claude version: Settings → **Export JSON**. On the site: Settings → **Import JSON**. Everything comes across.
3. On your phone, open the same URL, sign in with the same Google account, and the data is already there.
   Add it to the home screen (Share → Add to Home Screen on iPhone) and it opens like an app.

## How saving works

- Every change saves to the browser immediately and to your Firestore document about half a second later.
- Other signed-in devices update within a second or two. Offline edits are kept locally and sync when you're back.
- If two devices edit while offline, the later edit wins when they reconnect.
- Signed out, the site still works and saves on that device only.

## Updating the app later

Replace `app.js` (and `index.html` if it changed) in the repo. `config.js` stays as is. Your data is untouched.
