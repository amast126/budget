# Dashboard (formerly Budget Tracker)

Private, single-user dashboard at **https://amast126.github.io/budget/**. Only the owner's Google account gets in.

- **Home** (`index.html` + `dashboard.js`, source in `src/`): weather for the day (Open-Meteo, no key; location editable, default Dix Hills, NY 11746), a to-do list, money bar, quick add, bills this week, categories running hot, Learning and Cooking cards. Weather location and to-dos are saved in `trackers/alec-tracker-home` (`src/home-logic.js`, `src/home-cards.jsx`).
- **News**: its own tab with US politics (AP, Reuters), Tech & AI (The Verge, Ars Technica, TechCrunch, Wired, Reuters tech), Reddit (r/popular), Pop culture (Variety, THR, Vulture, EW) and Music (Pitchfork, Billboard, Stereogum, Rolling Stone, Guitar World). Sources are set at the top of `scripts/fetch-news.mjs`.
- **Budget** (`budget.html` + `app.js`): the original budget tracker, unchanged, shown inside the app. Its source is not in this repo; `app.js` is the prebuilt bundle.
- **Learning** (`src/learning*.js*`): Cloud & AI certification roadmap with links, descriptions and impact, progress tracking (status, exam dates, study hours, renewals). Cert details live in `src/learning-catalog.js`; progress is saved in `trackers/alec-tracker-learning`.
- **Cooking** (`src/cooking*.js*`, `src/ingredients.mjs`): kitchen list (fridge, freezer, pantry, spices, with a "running low" flag), grocery list, and recipes matched against what you have. "Finish shop" logs the total under Groceries in the budget and moves bought items into the kitchen. Saved in `trackers/alec-tracker-cooking`.
- **Auto** (`src/auto.jsx`, `src/auto-logic.js`): the 2021 Altima SL AWD. Deadlines (NYS inspection, registration, insurance renewal), maintenance on Nissan's schedule with a service log (costs can go straight into Gas & Auto), mileage, warranty, NHTSA recalls, and costs read from the budget (car payment, Geico, Gas & Auto). A Home card shows what's due. Saved in `trackers/alec-tracker-auto`.
- **Health** (`src/health.jsx`, `src/health-logic.js`, `src/food-api.js`): daily calories and macros against a target (Mifflin–St Jeor from sex, age, height, weight and activity, or your own numbers), a food log by meal with USDA FoodData Central search, barcode lookup (Open Food Facts, then USDA) by camera, photo or number, recent foods, quick add, and copy-yesterday; weight with a 7-day trend chart; steps and workouts; a 7-day summary; a Home card. Budget Bytes recipes on the Cooking tab can be logged by the serving. Profile, weigh-ins and the food library are in `trackers/alec-tracker-health`; each year's days are in `trackers/alec-tracker-health-<year>`. Barcode reading on iPhone uses ZXing (`vendor/zxing-0.23.0.min.js`, Apache-2.0, loaded only when scanning).
- **Recipes** (`recipes.json`, written weekly by `scripts/fetch-recipes.mjs`): popular Budget Bytes recipes (25+ ratings, 4.3+ stars) with cost per serving and ingredient names, plus 12 picks a week that don't repeat for 12 weeks. Only titles, links, photos, costs and ingredients are kept; the cooking steps stay on budgetbytes.com.

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
| `recipes.json` | Written by the recipes job every Saturday morning. |
| `scripts/fetch-recipes.mjs`, `.github/workflows/recipes.yml` | The recipes job. Settings (popularity bar, picks per week, no-repeat weeks) are at the top of the script. Runs on Saturdays, by hand from the Actions tab, or when the script or `src/ingredients.mjs` changes. |
| `src/ingredients.mjs` | Turns ingredient text into comparable names ("2 cloves garlic, minced" → "garlic"). Shared by the recipes job and the Cooking tab. |
| `scripts/fetch-news.mjs` | The news job. Edit `POLITICS` at the top to change sources. |
| `.github/workflows/news.yml` | Schedule for the news job. Needs Settings → Actions → General → Read and write. |
| `test/run.mjs` | Headless test at phone and desktop width using a budget export as test data. |

## Access

Access is enforced twice: `config.js` (the app refuses other accounts) and the Firestore rules in the Firebase console (the data refuses other accounts). The rules allow only the owner's verified email to read or write `trackers/*`.

## Build and test

```bash
npm install
./build.sh
BUDGET_EXPORT=/path/to/budget-tracker-export.json RECIPES_FIXTURE=/path/to/recipes.json EAN_IMAGE=/path/to/barcode.png node test/run.mjs shots/
```

## Deploy

1. Change files in `src/` (upload at `https://github.com/amast126/budget/upload/main/src`, or edit in the GitHub web editor) and commit.
2. The **Build dashboard** workflow rebuilds `dashboard.js` and bumps the version in `index.html` automatically (Actions tab).
3. Wait 1–3 minutes for Pages, reload, and check the build number in Settings.

`config.js` and the budget module (`budget.html`, `app.js`) are not built: bump their `?v=` by hand if they ever change.
