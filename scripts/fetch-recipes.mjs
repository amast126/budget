/**
 * Builds recipes.json for the Cooking tab. Runs once a week in GitHub Actions (.github/workflows/recipes.yml).
 * No dependencies: Node 20+ has fetch built in.
 *
 * Source: Budget Bytes' public recipe feed (WordPress / WP Recipe Maker REST API), about 20 requests a week.
 *   pool   popular recipes (at least 25 ratings, 4.3 stars or better): title, link, photo, cost, time, rating and
 *          ingredient names, so the tab can match them against your kitchen
 *   picks  12 of those for this week (8 dinners, 2 breakfasts, 2 sides), not repeated for 12 weeks,
 *          with the full ingredient list. Cooking steps always stay on budgetbytes.com.
 *
 * If the site can't be reached, the previous recipes.json stays and the error is noted in it.
 * Run locally: node scripts/fetch-recipes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalize, cleanName, STAPLES } from '../src/ingredients.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'recipes.json');
const SITE = 'https://www.budgetbytes.com';
const UPLOADS = `${SITE}/wp-content/uploads/`;
const API = `${SITE}/wp-json/wp/v2`;
const UA = 'Mozilla/5.0 (compatible; dashboard-recipes/1.0; personal weekly recipe list; +https://amast126.github.io/budget/)';
const FIELDS = 'id,link,recipe.name,recipe.rating,recipe.tags,recipe.image_id,recipe.servings,recipe.servings_unit,recipe.total_time,recipe.ingredients_flat';

// Edit these to change what counts as popular and how many picks you get.
const MIN_RATINGS = 25;
const MIN_STARS = 4.3;
const PICKS = { main: 8, breakfast: 2, side: 2 };
const NO_REPEAT_WEEKS = 12;

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 2) {
  for (let i = 1; i <= tries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { json: await res.json(), headers: res.headers };
    } catch (e) {
      if (i === tries) throw e;
      await sleep(3000);
    } finally {
      clearTimeout(t);
    }
  }
}

// ---------------------------------------------------------------- shaping
const MAIN = /^(dinner|main course|main dish|main|dinn|diner|soup|lunch|pasta|sandwich|stew|chili)$/i;
const BREAKFAST = /^(breakfast|brunch)$/i;
const SIDE = /^(side dish|side|appetizer|snack|bread|dip|salad)$/i;
function courseOf(tags) {
  const c = ((tags && tags.course) || []).map((t) => String(t.name || '').trim());
  if (c.some((x) => MAIN.test(x))) return 'main';
  if (c.some((x) => BREAKFAST.test(x))) return 'breakfast';
  if (c.some((x) => SIDE.test(x))) return 'side';
  return null; // desserts, drinks, sauces, seasonings
}
function costOf(tags) {
  const s = ((tags && tags.recipe_cost) || []).map((t) => t.name).join(' ');
  const m = s.match(/\$\s*([\d.]+)\s*recipe\s*\/\s*\$\s*([\d.]+)\s*serving/i);
  return m ? { total: Number(m[1]), perServing: Number(m[2]) } : { total: null, perServing: null };
}
const slugOf = (link) => {
  const m = String(link || '').match(/^https:\/\/www\.budgetbytes\.com\/([^?#]+?)\/?$/);
  return m && !m[1].includes('wprm_recipe') ? m[1] : null;
};
const uploadPath = (url) => (url && url.startsWith(UPLOADS) ? url.slice(UPLOADS.length) : null);
const cleanNotes = (s) =>
  cleanName(s)
    .replace(/\s*,?\s*$/, '')
    .replace(/^\s*,\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*$/, '')
    .trim();

function shape(x) {
  const r = x.recipe || {};
  const ratings = Number((r.rating && r.rating.count) || 0);
  const stars = Number((r.rating && r.rating.average) || 0);
  const slug = slugOf(x.link);
  const course = courseOf(r.tags);
  if (!slug || !course || !r.name) return null;
  const lines = [];
  const keys = [];
  for (const i of r.ingredients_flat || []) {
    if (i.type === 'group') {
      if (i.name) lines.push({ h: cleanName(i.name) });
      continue;
    }
    const name = cleanName(i.name);
    if (!name) continue;
    const key = normalize(i.name);
    const notes = cleanNotes(i.notes || '');
    const optional = /optional/i.test(`${i.name} ${i.notes || ''}`);
    const text = [cleanName(i.amount), cleanName(i.unit), name].filter(Boolean).join(' ') + (notes ? `, ${notes}` : '');
    lines.push(optional ? { t: text, k: key, o: 1 } : { t: text, k: key });
    if (key && !optional && !STAPLES.has(key) && !keys.includes(key)) keys.push(key);
  }
  const cost = costOf(r.tags);
  return {
    id: x.id,
    title: cleanName(r.name),
    slug,
    course,
    perServing: cost.perServing,
    total: cost.total,
    stars: Math.round(stars * 100) / 100,
    ratings,
    minutes: Number(r.total_time) || null,
    servings: Number(r.servings) || null,
    servingsUnit: cleanName(r.servings_unit || '') || null,
    imageId: r.image_id || null,
    keys,
    lines,
  };
}

// ---------------------------------------------------------------- picking
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
function rng(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Weighted draw without replacement: more ratings and more stars → more likely.
function draw(cands, n, rand) {
  const pool = cands.map((r) => ({ r, w: Math.sqrt(r.ratings) * Math.pow(r.stars, 2) }));
  const out = [];
  while (out.length < n && pool.length) {
    const tot = pool.reduce((a, x) => a + x.w, 0);
    let x = rand() * tot;
    let i = 0;
    while (i < pool.length - 1 && (x -= pool[i].w) > 0) i++;
    out.push(pool[i].r);
    pool.splice(i, 1);
  }
  return out;
}
function choosePicks(pool, history, week) {
  const byId = new Map(pool.map((r) => [r.id, r]));
  const same = history.find((h) => h.week === week);
  if (same && same.ids.every((id) => byId.has(id))) return same.ids.map((id) => byId.get(id));
  const recent = new Set(history.filter((h) => h.week !== week).slice(0, NO_REPEAT_WEEKS).flatMap((h) => h.ids));
  const rand = rng(week);
  const out = [];
  for (const [course, n] of Object.entries(PICKS)) {
    const all = pool.filter((r) => r.course === course);
    let cands = all.filter((r) => !recent.has(r.id));
    if (cands.length < n) cands = all; // ran through them all: start over
    out.push(...draw(cands, n, rand));
  }
  return out;
}

// ---------------------------------------------------------------- main
async function fetchAll() {
  const first = await getJSON(`${API}/wprm_recipe?per_page=100&page=1&_fields=${FIELDS}`);
  const pages = Number(first.headers.get('x-wp-totalpages')) || 1;
  const total = Number(first.headers.get('x-wp-total')) || first.json.length;
  const items = [...first.json];
  for (let p = 2; p <= pages; p++) {
    await sleep(1000);
    const { json } = await getJSON(`${API}/wprm_recipe?per_page=100&page=${p}&_fields=${FIELDS}`);
    items.push(...json);
  }
  log(`Fetched ${items.length} of ${total} recipes in ${pages} pages`);
  return { items, total };
}
async function fetchImages(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    await sleep(1000);
    const chunk = ids.slice(i, i + 100);
    const { json } = await getJSON(`${API}/media?per_page=100&include=${chunk.join(',')}&_fields=id,source_url,media_details`);
    for (const m of json) {
      const s = (m.media_details && m.media_details.sizes) || {};
      const pick = (...names) => {
        for (const n of names) if (s[n] && s[n].source_url) return uploadPath(s[n].source_url);
        return uploadPath(m.source_url);
      };
      out.set(m.id, { thumb: pick('thumbnail', 'wprm-metadata-1_1', 'medium'), card: pick('medium', 'cwp_small', 'wprm-metadata-4_3', 'medium_large', 'large') });
    }
  }
  return out;
}

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const week = isoWeek();
let result;
try {
  const { items, total } = await fetchAll();
  const shaped = items.map(shape).filter(Boolean);
  const pool = shaped.filter((r) => r.ratings >= MIN_RATINGS && r.stars >= MIN_STARS).sort((a, b) => b.ratings - a.ratings);
  if (pool.length < 50) throw new Error(`only ${pool.length} popular recipes found; the feed may have changed`);
  const history = (prev && prev.history) || [];
  const picks = choosePicks(pool, history, week);
  let images = new Map();
  try {
    images = await fetchImages([...new Set(pool.map((r) => r.imageId).filter(Boolean))]);
  } catch (e) {
    log('Photos skipped:', e.message);
  }
  const freq = new Map();
  pool.forEach((r) => r.keys.forEach((k) => freq.set(k, (freq.get(k) || 0) + 1)));
  const base = (r) => {
    const img = images.get(r.imageId) || {};
    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      course: r.course,
      perServing: r.perServing,
      total: r.total,
      stars: r.stars,
      ratings: r.ratings,
      minutes: r.minutes,
      servings: r.servings,
      thumb: img.thumb || null,
      keys: r.keys,
    };
  };
  result = {
    generated: new Date().toISOString(),
    week,
    site: SITE,
    uploads: UPLOADS,
    source: { name: 'Budget Bytes', ok: true, recipes: total, popular: pool.length },
    picks: picks.map((r) => ({ ...base(r), image: (images.get(r.imageId) || {}).card || null, servingsUnit: r.servingsUnit, lines: r.lines })),
    pool: pool.map(base),
    common: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80),
    history: [{ week, ids: picks.map((r) => r.id) }, ...history.filter((h) => h.week !== week)].slice(0, 26),
  };
  log(`Week ${week}: ${pool.length} popular recipes, picks: ${picks.map((r) => r.title).join(' | ')}`);
} catch (e) {
  log('Recipe fetch failed:', e.message);
  if (!prev) {
    result = { generated: new Date().toISOString(), week, site: SITE, uploads: UPLOADS, source: { name: 'Budget Bytes', ok: false, error: String(e.message) }, picks: [], pool: [], common: [], history: [] };
  } else {
    result = { ...prev, source: { ...(prev.source || {}), ok: false, error: String(e.message), failedAt: new Date().toISOString() } };
  }
}

// Only rewrite when something other than the timestamp changed.
const strip = (o) => JSON.stringify({ ...o, generated: undefined, source: { ...(o && o.source), failedAt: undefined } });
if (prev && strip(prev) === strip(result)) log('No change.');
else {
  fs.writeFileSync(OUT, JSON.stringify(result));
  log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}
