# Dashboard (formerly Budget Tracker)

Private, single-user dashboard at **https://amast126.github.io/budget/**. Only the owner's Google account gets in.

- **Home** (`index.html` + `dashboard.js`, source in `src/`): money bar, quick add, bills this week, categories running hot, and a News card (US politics from AP and Reuters, top posts on r/popular).
- **Budget** (`budget.html` + `app.js`): the original budget tracker, unchanged, shown inside the app. Its source is not in this repo; `app.js` is the prebuilt bundle.
- **Learning** (`src/learning*.js*`): Cloud & AI certification roadmap with links, descriptions and impact, progress tracking (status, exam dates, study hours, renewals). Cert details live in `src/learning-catalog.js`; progress is saved in `trackers/alec-tracker-learning`.

Both read and write the same Firestore document (`trackers/alec-tracker`), so a quick add or a bill tick on Home appears in the budget within a second, and the other way round.

## Files

| Path | What it is |
|---|---|
| `index.html` | Dashboard page. Bump `dashboard.js?v=` and `config.js?v=` when those files change. |
| `dashboard.js` | Built dashboard. Rebuild with `./build.sh`; don't edit by hand. |
| `src/app.jsx`, `src/budget-logic.js`, `src/backend.js`, `src/styles.css`, `src/ui.jsx` | Dashboard source. `budget-logic.js` mirrors the budget module's rules (paydays, bill dates, split bills, pacing). |
| `src/learning.jsx`, `src/learning-logic.js`, `src/learning-catalog.js` | Learning tab. Edit the catalog to change certs, links or the roadmap order. |
| `.github/workflows/build.yml` | Rebuilds `dashboard.js` and bumps its `?v=` in `index.html` whenever `src/` changes. |
| `budget.html`, `app.js` | The budget module. |
| `config.js` | Firebase config, Finnhub key, and the allowlist (owner only). Shared by both pages. |
| `news.json` | Written by the news job every ~30 minutes. |
| `scripts/fetch-news.mjs` | The news job. Edit `POLITICS` at the top to change sources. |
| `.github/workflows/news.yml` | Schedule for the news job. Needs Settings → Actions → General → Read and write. |
| `test/run.mjs` | Headless test at phone and desktop width using a budget export as test data. |

## Access

Access is enforced twice: `config.js` (the app refuses other accounts) and the Firestore rules in the Firebase console (the data refuses other accounts). The rules allow only the owner's verified email to read or write `trackers/*`.

## Build and test

```bash
npm install
./build.sh
BUDGET_EXPORT=/path/to/budget-tracker-export.json node test/run.mjs shots/
```

## Deploy

1. Change files in `src/` (upload at `https://github.com/amast126/budget/upload/main/src`, or edit in the GitHub web editor) and commit.
2. The **Build dashboard** workflow rebuilds `dashboard.js` and bumps the version in `index.html` automatically (Actions tab).
3. Wait 1–3 minutes for Pages, reload, and check the build number in Settings.

`config.js` and the budget module (`budget.html`, `app.js`) are not built: bump their `?v=` by hand if they ever change.
