// Recipe box: your saved recipes in full (ingredients with amounts, steps, notes, a photo), searchable, and scaled
// to any number of servings. The text lives in trackers/<doc>-recipebox; each photo lives in two documents of its
// own (see recipe-photos.js) so the box stays small.
// Everything here is plain functions on plain data, so it's easy to test.
import { normalize, STAPLES } from './ingredients.mjs';
import { uid, todayISO } from './budget-logic.js';

export const MAX_BOX_BYTES = 950000; // a Firestore document holds 1 MiB; leave room
export const MAX_SERVINGS = 48;
export const MAX_PHOTO_CHARS = 900000;

export function defaultBox() {
  return { version: 1, recipes: [] };
}
export function normalizeBox(d) {
  if (!d || typeof d !== 'object') return defaultBox();
  const seen = new Set();
  const recipes = [];
  for (const raw of Array.isArray(d.recipes) ? d.recipes : []) {
    const r = normalizeRecipe(raw);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    recipes.push(r);
  }
  const movedIds = Array.isArray(d.movedIds) ? d.movedIds.filter((x) => typeof x === 'string').slice(0, 1000) : [];
  return { version: 1, recipes, movedIds, updatedAt: d.updatedAt };
}

// ---------------------------------------------------------------- small helpers
const str = (v, max = 400) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max));
const para = (v, max = 4000) =>
  v == null
    ? ''
    : String(v)
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, max);
const pos = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round2 = (n) => Math.round(n * 1000) / 1000;
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// Lowercase, no accents or apostrophes: for search and matching.
export const fold = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/&/g, ' and ');
export const slug = (s) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
const safeId = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
export function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
// A number from text like "35", "35 min" or "2.5" (null when there isn't a positive one).
const numish = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const httpUrl = (u) => {
  const s = str(u, 600);
  return /^https?:\/\/\S+$/i.test(s) ? s : '';
};

// ---------------------------------------------------------------- amounts
const VULGAR = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6 };
const VG = '[¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]';
const NUM = `(?:\\d+\\s*${VG}|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.\\d+|\\d+|${VG})`;
const QTY_RE = new RegExp(`^\\s*(${NUM})(?:\\s*(?:-|–|—|to)\\s*(${NUM}))?`, 'i');
function numOf(t) {
  const s = String(t).trim();
  let m;
  if (VULGAR[s] != null) return VULGAR[s];
  if ((m = s.match(new RegExp(`^(\\d+)\\s*(${VG})$`)))) return Number(m[1]) + VULGAR[m[2]];
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : null;
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
// "1½–2 cups" → { amt: 1.5, amt2: 2, rest: 'cups' }
export function parseQty(text) {
  const s = String(text || '');
  const m = s.match(QTY_RE);
  if (!m) return { amt: null, amt2: null, rest: s.trim() };
  const amt = numOf(m[1]);
  const amt2 = m[2] != null ? numOf(m[2]) : null;
  return { amt, amt2: amt2 != null && amt2 > amt ? amt2 : null, rest: s.slice(m[0].length).trim() };
}

// key, singular, plural, kind, spellings
const UNIT_LIST = [
  ['tsp', 'tsp', 'tsp', 'vol', ['tsp', 'tsps', 'teaspoon', 'teaspoons']],
  ['tbsp', 'tbsp', 'tbsp', 'vol', ['tbsp', 'tbsps', 'tbs', 'tbl', 'tablespoon', 'tablespoons']],
  ['cup', 'cup', 'cups', 'vol', ['cup', 'cups']],
  ['floz', 'fl oz', 'fl oz', 'vol', ['fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces']],
  ['oz', 'oz', 'oz', 'wt', ['oz', 'ounce', 'ounces']],
  ['lb', 'lb', 'lb', 'wt', ['lb', 'lbs', 'pound', 'pounds']],
  ['ml', 'ml', 'ml', 'metric', ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres']],
  ['l', 'liter', 'liters', 'metric', ['liter', 'liters', 'litre', 'litres']],
  ['g', 'g', 'g', 'metric', ['g', 'gram', 'grams']],
  ['kg', 'kg', 'kg', 'metric', ['kg', 'kilogram', 'kilograms']],
  ['clove', 'clove', 'cloves', 'count', ['clove', 'cloves']],
  ['can', 'can', 'cans', 'count', ['can', 'cans']],
  ['jar', 'jar', 'jars', 'count', ['jar', 'jars']],
  ['package', 'package', 'packages', 'count', ['package', 'packages', 'pkg', 'pack', 'packs']],
  ['packet', 'packet', 'packets', 'count', ['packet', 'packets', 'sachet', 'sachets']],
  ['container', 'container', 'containers', 'count', ['container', 'containers']],
  ['bag', 'bag', 'bags', 'count', ['bag', 'bags']],
  ['box', 'box', 'boxes', 'count', ['box', 'boxes']],
  ['bottle', 'bottle', 'bottles', 'count', ['bottle', 'bottles']],
  ['slice', 'slice', 'slices', 'count', ['slice', 'slices']],
  ['piece', 'piece', 'pieces', 'count', ['piece', 'pieces']],
  ['stick', 'stick', 'sticks', 'count', ['stick', 'sticks']],
  ['bunch', 'bunch', 'bunches', 'count', ['bunch', 'bunches']],
  ['sprig', 'sprig', 'sprigs', 'count', ['sprig', 'sprigs']],
  ['stalk', 'stalk', 'stalks', 'count', ['stalk', 'stalks']],
  ['head', 'head', 'heads', 'count', ['head', 'heads']],
  ['thumb', 'thumb', 'thumbs', 'count', ['thumb', 'thumbs']],
  ['pinch', 'pinch', 'pinches', 'count', ['pinch', 'pinches']],
  ['dash', 'dash', 'dashes', 'count', ['dash', 'dashes']],
  ['unit', '', '', 'count', ['unit', 'units', 'ea', 'each', 'ct']],
];
export const UNITS = Object.fromEntries(UNIT_LIST.map(([k, one, many, kind]) => [k, { one, many, kind }]));
const SPELL = UNIT_LIST.flatMap(([k, , , , sp]) => sp.map((s) => [s, k])).sort((a, b) => b[0].length - a[0].length);
const unitKey = (u) => {
  const s = String(u || '').trim().toLowerCase().replace(/\.$/, '');
  if (!s) return '';
  if (UNITS[s]) return s;
  const hit = SPELL.find(([sp]) => sp === s);
  return hit ? hit[1] : '';
};

// Take a unit off the front of text: → [unit key or '', the rest]
function takeUnit(rest) {
  const low = rest.toLowerCase();
  const hit = SPELL.find(([sp]) => low.startsWith(sp) && /^(?:\.|\s|,|\)|$)/.test(low.slice(sp.length)));
  return hit ? [hit[1], rest.slice(hit[0].length).replace(/^\.?\s*/, '')] : ['', rest];
}
// "1 cup + 2 tbsp", "1 lb 8 oz": the second part is added into the first, counted in the smaller unit.
const FAMILY = { tsp: ['vol', 1], tbsp: ['vol', 3], cup: ['vol', 48], oz: ['wt', 1], lb: ['wt', 16] };
function takeCompound(amt, unit, rest) {
  if (!FAMILY[unit]) return null;
  const m = rest.match(new RegExp(`^(?:\\+|plus|and)?\\s*(${NUM})\\s*`, 'i'));
  if (!m) return null;
  const [u2, after] = takeUnit(rest.slice(m[0].length));
  if (!u2 || !FAMILY[u2] || FAMILY[u2][0] !== FAMILY[unit][0] || FAMILY[u2][1] >= FAMILY[unit][1]) return null;
  const n2 = numOf(m[1]);
  if (!(n2 > 0)) return null;
  return { amt: round2((amt * FAMILY[unit][1] + n2 * FAMILY[u2][1]) / FAMILY[u2][1]), unit: u2, rest: after };
}
const PREP = /\b(minced|chopped|diced|sliced|grated|shredded|divided|taste|peeled|drained|rinsed|softened|melted|room temp\w*|cut|juiced|zested|halved|quartered|trimmed|crushed|for|optional|packed|beaten|cubed|torn|thawed|cooked|separated|plus|more|stemmed|seeded|cored|julienned|smashed|whisked|at|or|about|finely|thinly|roughly|coarsely|lightly|to)\b/i;
// "10 oz Ground beef*" → { amt: 10, unit: 'oz', item: 'Ground beef' }; "Salt, to taste" → { item: 'Salt', note: 'to taste' }
export function parseLine(text) {
  let s = str(text, 300).replace(/^[-•*·]\s*/, '');
  const out = {};
  if (/\(optional\)|,\s*optional$/i.test(s)) {
    out.o = 1;
    s = s.replace(/\s*\(optional\)|,\s*optional$/i, '');
  }
  const q = parseQty(s);
  let rest = q.rest;
  if (q.amt != null && q.amt > 0) {
    out.amt = round2(q.amt);
    if (q.amt2 != null) out.amt2 = round2(q.amt2);
    // a size right after the number: "2 (15 oz) cans chickpeas"
    const size = rest.match(/^\(([^)]{1,30})\)\s*/);
    if (size) rest = rest.slice(size[0].length);
    const [u, after] = takeUnit(rest);
    if (u) {
      out.unit = u;
      rest = after.replace(/^of\s+/i, '');
      const c = out.amt2 == null ? takeCompound(out.amt, u, rest) : null;
      if (c) {
        Object.assign(out, { amt: c.amt, unit: c.unit, cmp: 1 });
        rest = c.rest.replace(/^of\s+/i, '');
      }
    }
    const size2 = !size && rest.match(/^\(([^)]{1,30})\)\s*/); // "1 can (15 oz) black beans"
    if (size2) rest = rest.slice(size2[0].length);
    if (size || size2) out.note = (size || size2)[1].trim();
  }
  // a note in parentheses at the end ("Butter (Contains: Milk)") or after a comma when it's how to prep it
  // ("Shallot, minced"), but not describing words ("boneless, skinless chicken thighs")
  let note = '';
  const paren = rest.match(/\s*\(([^()]{1,120})\)\s*$/);
  if (paren) {
    note = paren[1];
    rest = rest.slice(0, paren.index);
  }
  const comma = rest.match(/,\s*(.{1,120})$/);
  if (comma && comma.index > 0 && PREP.test(comma[1])) {
    note = [comma[1], note].filter(Boolean).join('; ');
    rest = rest.slice(0, comma.index);
  }
  if (note) out.note = [out.note, note].filter(Boolean).join('; ');
  out.item = cap(rest.replace(/\*+$/, '').replace(/\s+/g, ' ').trim()) || cap(str(text, 120));
  return out;
}

// An amount on its own ("10 oz", "1½ cups", "2") → { amt, amt2, unit }
export function parseAmount(text) {
  if (text && typeof text === 'object') {
    const amt = pos(text.amt);
    return amt == null ? null : { amt: round2(amt), ...(pos(text.amt2) ? { amt2: round2(pos(text.amt2)) } : {}), ...(unitKey(text.unit) ? { unit: unitKey(text.unit) } : {}), ...(text.cmp ? { cmp: 1 } : {}) };
  }
  const q = parseQty(text);
  if (q.amt == null || !(q.amt > 0)) return null;
  const [u, after] = takeUnit(q.rest);
  const o = { amt: round2(q.amt) };
  if (q.amt2 != null) o.amt2 = round2(q.amt2);
  if (u) {
    o.unit = u;
    const c = o.amt2 == null ? takeCompound(o.amt, u, after) : null;
    if (c) Object.assign(o, { amt: c.amt, unit: c.unit, cmp: 1 });
  }
  return o;
}
// How much text an amount used up at the start ("1 cup + 2 tbsp water" → "1 cup + 2 tbsp")
function amountText(text) {
  const q = parseQty(text);
  if (q.amt == null) return '';
  let rest = q.rest;
  const [u, after] = takeUnit(rest);
  if (u) {
    rest = after;
    const c = q.amt2 == null ? takeCompound(q.amt, u, after) : null;
    if (c) rest = c.rest;
  }
  return text.slice(0, text.length - rest.length).trim();
}

const FR = [
  [0, ''],
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [1, ''],
];
// 1.5 → "1½", 0.33 → "⅓", 12.4 → "12½"… metric stays decimal.
export function fmtNum(x, kind) {
  if (x == null || !Number.isFinite(x)) return '';
  if (kind === 'metric') return x >= 10 ? String(Math.round(x)) : String(Math.max(0.1, Math.round(x * 10) / 10));
  if (x >= 20) return String(Math.round(x));
  if (x >= 10) {
    const h = Math.round(x * 2) / 2;
    return h % 1 ? `${Math.floor(h)}½` : String(h);
  }
  const whole = Math.floor(x + 1e-9);
  const frac = x - whole;
  const opts = FR.filter(([f]) => whole > 0 ? f !== 1 / 8 : true);
  let best = opts[0];
  for (const o of opts) if (Math.abs(frac - o[0]) < Math.abs(frac - best[0])) best = o;
  let w = whole;
  let g = best[1];
  if (best[0] === 1) {
    w += 1;
    g = '';
  }
  if (!w && !g) g = '⅛'; // never round an amount away
  return (w ? String(w) : '') + g;
}
const nearest = (x, step) => Math.round(x / step) * step;
// Tidy a scaled volume: 3 tsp → 1 tbsp, 4 tbsp → ¼ cup, ½ tbsp → 1½ tsp.
function tidyVolume(tsp) {
  const cups = tsp / 48;
  if (cups >= 0.25 - 1e-9) {
    const w = Math.floor(cups);
    const f = cups - w;
    const opts = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
    let b = 0;
    for (const o of opts) if (Math.abs(f - o) < Math.abs(f - b)) b = o;
    if (Math.abs(w + b - cups) / cups < 0.07) return { unit: 'cup', per: 48 };
    // 1⅛ cups → 1 cup + 2 tbsp
    const under = w + [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4].filter((o) => o <= f + 1e-9).pop();
    const restTbsp = ((cups - under) * 48) / 3;
    if (under >= 1 && restTbsp >= 0.5 && Math.abs(nearest(restTbsp, 0.5) - restTbsp) < 0.13) return { unit: 'cup', per: 48, whole: under, plus: nearest(restTbsp, 0.5) };
  }
  const tbsp = tsp / 3;
  if (tbsp >= 1 - 1e-9 && Math.abs(nearest(tbsp, 0.5) - tbsp) / tbsp < 0.1) return { unit: 'tbsp', per: 3 };
  return { unit: 'tsp', per: 1 };
}
const TSP = { tsp: 1, tbsp: 3, cup: 48 };
function tidy(q) {
  if (q.amt == null) return q;
  if (TSP[q.unit]) {
    const t = q.amt * TSP[q.unit];
    // a range reads best in one unit, picked by its top end: "1–1½ cups"
    if (q.amt2 != null) {
      const hi = q.amt2 * TSP[q.unit];
      const unit = hi / 48 >= 0.25 - 1e-9 ? 'cup' : hi / 3 >= 1 - 1e-9 ? 'tbsp' : 'tsp';
      return { amt: t / TSP[unit], amt2: hi / TSP[unit], unit };
    }
    const v = tidyVolume(t);
    if (v.plus && q.amt2 == null) return { amt: v.whole, unit: 'cup', plus: { amt: v.plus, unit: 'tbsp' } };
    if (v.plus) return { ...q, unit: 'tbsp', amt: t / 3, amt2: (q.amt2 * TSP[q.unit]) / 3 };
    return { ...q, unit: v.unit, amt: t / v.per, amt2: q.amt2 != null ? (q.amt2 * TSP[q.unit]) / v.per : undefined };
  }
  if (q.unit === 'oz' && q.cmp && q.amt2 == null && q.amt >= 16 && ((q.amt / 16) * 4) % 1 === 0) return { amt: q.amt / 16, unit: 'lb' };
  if (q.unit === 'oz' && q.amt >= 32) return { ...q, unit: 'lb', amt: nearest(q.amt / 16, 0.25), amt2: q.amt2 != null ? nearest(q.amt2 / 16, 0.25) : undefined };
  if (q.unit === 'g' && q.amt >= 1000) return { ...q, unit: 'kg', amt: q.amt / 1000, amt2: q.amt2 != null ? q.amt2 / 1000 : undefined };
  return q;
}

// The amount for an ingredient at a given number of servings. When the card listed amounts for other serving
// counts (HelloFresh prints 2 and 4), the closest listed count is the starting point; exact matches aren't touched.
export function amountFor(ing, servings, base) {
  if (!ing || ing.h) return null;
  const known = [[base, ing.amt != null ? { amt: ing.amt, amt2: ing.amt2, unit: ing.unit, cmp: ing.cmp } : null]];
  for (const [n, q] of Object.entries(ing.by || {})) known.push([Number(n), q]);
  const usable = known.filter(([n, q]) => n > 0 && q && q.amt != null);
  if (!usable.length) return null;
  const asIs = (q) => (q.cmp ? tidy({ amt: q.amt, unit: q.unit, cmp: 1 }) : { ...q, exact: true });
  if (!base || !servings) return asIs(usable[0][1]);
  const exact = usable.find(([n]) => n === servings);
  if (exact) return asIs(exact[1]);
  let [n0, q0] = usable[0];
  for (const [n, q] of usable) if (Math.abs(Math.log(servings / n)) < Math.abs(Math.log(servings / n0))) [n0, q0] = [n, q];
  const f = servings / n0;
  return tidy({ amt: q0.amt * f, amt2: q0.amt2 != null ? q0.amt2 * f : undefined, unit: q0.unit });
}
export function fmtAmount(q) {
  if (!q || q.amt == null) return '';
  const u = UNITS[q.unit];
  const kind = u ? u.kind : 'count';
  const a = fmtNum(q.amt, kind);
  const b = q.amt2 != null ? fmtNum(q.amt2, kind) : '';
  // singular for "1" and for fractions under one ("½ cup"), plural for the rest, going by what's shown
  const shown = b || a;
  const name = u ? (/^(1|[¼½¾⅓⅔⅛]|0\.\d+)$/.test(shown) ? u.one : u.many) : '';
  return `${a}${b && b !== a ? `–${b}` : ''}${name ? ` ${name}` : ''}${q.plus ? ` + ${fmtAmount(q.plus)}` : ''}`;
}
// Multiplier between the recipe as written and what you're making.
export const factorOf = (r, servings) => (r && r.servings && servings ? servings / r.servings : servings || 1);

// Amounts in step text are written [[1 tbsp]] so they scale with the servings: → [{ t }, { q, scaled }]
export function stepParts(text, factor = 1) {
  const out = [];
  const re = /\[\[([^\]]{1,40})\]\]/g;
  let last = 0;
  let m;
  const s = String(text || '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index) });
    const raw = m[1].trim();
    const p = parseAmount(raw);
    if (!p) out.push({ q: raw, scaled: false });
    else {
      const tail = raw.slice(amountText(raw).length).trim();
      const same = Math.abs(factor - 1) < 1e-9;
      const q = same && !p.cmp ? { ...p, exact: true } : tidy({ amt: p.amt * factor, amt2: p.amt2 != null ? p.amt2 * factor : undefined, unit: p.unit });
      out.push({ q: `${fmtAmount(q)}${tail ? ` ${tail}` : ''}`, scaled: Math.abs(factor - 1) > 1e-9 });
    }
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out;
}
export const stepText = (text, factor) =>
  stepParts(text, factor)
    .map((p) => (p.t != null ? p.t : p.q))
    .join('');

// Times in a step, for cook mode's timers: "Roast 20–25 minutes" → { secs: 1200, label: '20–25 min' }
export function timersIn(text) {
  const s = stepText(text, 1);
  const out = [];
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
  let m;
  while ((m = re.exec(s))) {
    const u = m[3].toLowerCase();
    const mult = u.startsWith('h') ? 3600 : u.startsWith('s') ? 1 : 60;
    const lo = Number(m[1]);
    const hi = m[2] != null ? Number(m[2]) : null;
    const secs = Math.round(lo * mult);
    if (!secs || secs > 12 * 3600) continue;
    const short = u.startsWith('h') ? 'hr' : u.startsWith('s') ? 'sec' : 'min';
    const label = `${m[1]}${hi != null ? `–${m[2]}` : ''} ${short}`;
    if (!out.some((t) => t.label === label)) out.push({ secs, label });
  }
  return out;
}

// ---------------------------------------------------------------- recipes
const NUT = ['cal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'];
export const NUTRIENTS = [
  ['cal', 'Calories', ''],
  ['protein', 'Protein', 'g'],
  ['carbs', 'Carbs', 'g'],
  ['fat', 'Fat', 'g'],
  ['fiber', 'Fiber', 'g'],
  ['sugar', 'Sugar', 'g'],
  ['sodium', 'Sodium', 'mg'],
];
// Per-serving nutrition as [cal, protein, carbs, fat, fiber, sugar, sodium] (the Budget Bytes shape); nulls where unknown.
const NUT_KEYS = {
  cal: ['cal', 'calories', 'kcal', 'energy'],
  protein: ['protein'],
  carbs: ['carbs', 'carbohydrates', 'carbohydrate', 'carb'],
  fat: ['fat', 'totalFat', 'total_fat'],
  fiber: ['fiber', 'dietaryFiber', 'dietary_fiber', 'fibre'],
  sugar: ['sugar', 'sugars'],
  sodium: ['sodium'],
};
const numOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
function normalizeNutrition(n, calories) {
  let arr = null;
  if (Array.isArray(n)) arr = n.slice(0, 7).map(numOrNull);
  else if (n && typeof n === 'object') arr = NUT.map((k) => numOrNull(NUT_KEYS[k].map((a) => n[a]).find((v) => v != null && v !== '')));
  if (numOrNull(calories) != null && (!arr || arr[0] == null)) (arr = arr || [])[0] = numOrNull(calories);
  if (!arr) return null;
  arr = arr.map((v) => (v != null && Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null));
  while (arr.length && arr[arr.length - 1] == null) arr.pop();
  return arr.length && arr[0] != null ? arr : null;
}
export const calOf = (r) => (r && r.nutrition && r.nutrition[0] != null ? r.nutrition[0] : null);

function normalizeIngredient(x) {
  if (x == null) return null;
  if (typeof x === 'string') return str(x) ? parseLine(x) : null;
  if (typeof x !== 'object') return null;
  if (x.h != null) return str(x.h, 80) ? { h: str(x.h, 80) } : null;
  let o;
  if (x.item != null || x.name != null) {
    const item = str(x.item != null ? x.item : x.name, 120);
    if (!item) return null;
    o = { item: cap(item.replace(/\*+$/, '')) };
    const a = parseAmount(x.amount != null ? x.amount : x.amt != null ? { amt: x.amt, amt2: x.amt2, unit: x.unit } : null);
    if (a) Object.assign(o, a);
    else if (x.amount != null && str(x.amount)) o.note = str(x.amount, 60); // "to taste", "a pinch"
  } else if (x.text != null) {
    o = parseLine(x.text);
  } else return null;
  const note = str(x.note, 160);
  if (note) o.note = o.note && o.note !== note ? `${o.note}; ${note}` : note;
  if (x.pantry) o.pantry = 1;
  if (x.o || x.optional) o.o = 1;
  const per = x.by || x.per;
  if (per && typeof per === 'object') {
    const by = {};
    for (const [n, v] of Object.entries(per)) {
      const k = Math.round(Number(n));
      const a = parseAmount(v);
      if (k > 0 && k <= MAX_SERVINGS && a) by[k] = a;
    }
    if (Object.keys(by).length) o.by = by;
  }
  return o;
}
function normalizeStep(s) {
  if (s == null) return null;
  if (typeof s === 'string') {
    const t = para(s.replace(/^\s*(?:step\s*)?\d+[.)]\s*/i, ''), 2000);
    return t ? { text: t } : null;
  }
  if (typeof s !== 'object') return null;
  const text = para(s.text, 2000);
  if (!text) return null;
  const title = str(s.title, 80);
  return title ? { title, text } : { text };
}
const list = (v, max, len = 40) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map((x) => str(x, len))
    .filter(Boolean)
    .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)
    .slice(0, max);

// ingredient lists may come as a list or as text with one per line
const linesIn = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : []);
export function normalizeRecipe(r) {
  if (!r || typeof r !== 'object') return null;
  const title = str(r.title, 160);
  if (!title) return null;
  const o = { id: safeId(r.id) || `r-${uid()}`, title };
  const put = (k, v) => {
    if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) o[k] = v;
  };
  put('subtitle', str(r.subtitle, 200));
  put('source', str(r.source, 40));
  put('url', httpUrl(r.url));
  put('servings', numish(r.servings) ? Math.min(MAX_SERVINGS, Math.max(1, Math.round(numish(r.servings)))) : null);
  put('minutes', numish(r.minutes) ? Math.round(numish(r.minutes)) : null);
  put('prepMinutes', numish(r.prepMinutes) ? Math.round(numish(r.prepMinutes)) : null);
  put('difficulty', str(r.difficulty, 20));
  put('spice', Number.isFinite(Number(r.spice)) && Number(r.spice) > 0 ? Math.min(3, Math.round(Number(r.spice))) : null);
  put('nutrition', normalizeNutrition(r.nutrition, r.calories));
  put('perServing', r.perServing != null && Number.isFinite(Number(r.perServing)) ? Number(r.perServing) : null);
  put('tags', list(r.tags, 12));
  put('allergens', list(r.allergens, 14, 30));
  put('ingredients', linesIn(r.ingredients).map(normalizeIngredient).filter(Boolean).slice(0, 80));
  put('tools', list(r.tools, 16, 60));
  put('steps', (Array.isArray(r.steps) ? r.steps : typeof r.steps === 'string' ? r.steps.split(/\n\s*\n|\n(?=\s*\d+[.)]\s)/) : []).map(normalizeStep).filter(Boolean).slice(0, 40));
  put('notes', para(r.notes, 3000));
  put('course', ['main', 'breakfast', 'side', 'dessert', 'snack'].includes(r.course) ? r.course : null);
  put('photo', typeof r.photo === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.photo) ? r.photo : null);
  put('imgUrl', httpUrl(r.imgUrl));
  put('thumb', typeof r.thumb === 'string' && /^[\w./-]{1,200}$/.test(r.thumb) ? r.thumb : null);
  put('webId', r.webId != null && r.webId !== '' ? str(r.webId, 40) : null);
  if (r.fav) o.fav = 1;
  put('made', Number(r.made) > 0 ? Math.round(Number(r.made)) : null);
  put('lastMade', /^\d{4}-\d{2}-\d{2}$/.test(r.lastMade || '') ? r.lastMade : null);
  put('added', /^\d{4}-\d{2}-\d{2}$/.test(r.added || '') ? r.added : null);
  return o;
}

export const findRecipe = (box, id) => (box && box.recipes ? box.recipes.find((r) => r.id === id) : null) || null;
export const itemsOf = (r) => (r.ingredients || []).filter((i) => !i.h && !i.pantry);
export const pantryOf = (r) => (r.ingredients || []).filter((i) => i.pantry);

// Ingredient keys for matching against the kitchen (pantry items and staples left out).
export function boxKeys(r) {
  const out = [];
  for (const i of itemsOf(r)) {
    const k = normalize(i.item);
    if (k && !STAPLES.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}
// A box recipe in the shape the kitchen matching, meal prep plan and Health logging expect.
// A saved Budget Bytes recipe keeps its Budget Bytes id here, so it lines up with the same recipe in this week's
// file and in the meal prep plan (and opens as bb-<id>, which is its id in the box).
export function asCookable(r) {
  const base = { ...r, mine: true, course: r.course || 'main', keys: boxKeys(r) };
  return r.webId != null ? { ...base, id: String(r.webId), box: false } : { ...base, box: true };
}

export function boxBytes(box) {
  const s = JSON.stringify(box);
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length;
}
export function checkSize(box) {
  if (boxBytes(box) > MAX_BOX_BYTES) throw new Error('The recipe box is full (about 1 MB of text). Remove a few recipes first.');
}

// ---------------------------------------------------------------- the add / edit form
// Recipe → the form's text fields, and back.
// Numbers written exactly for the form: fractions when they are one (1½, ⅜), decimals otherwise (15.25 stays 15.25).
const EXACT = [[1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞']];
function exactNum(x, kind) {
  if (kind === 'metric') return String(round2(x));
  const w = Math.floor(x + 1e-9);
  const f = x - w;
  if (f < 1e-6) return String(w);
  const g = EXACT.find(([v]) => Math.abs(v - f) < 2e-3);
  return g ? `${w || ''}${g[1]}` : String(round2(x));
}
function exactAmount(i) {
  const u = UNITS[i.unit];
  const kind = u ? u.kind : 'count';
  const a = exactNum(i.amt, kind);
  const b = i.amt2 != null ? exactNum(i.amt2, kind) : '';
  const top = i.amt2 != null ? i.amt2 : i.amt;
  const name = u ? (top > 1 + 1e-9 ? u.many : u.one) : '';
  return `${a}${b ? `–${b}` : ''}${name ? ` ${name}` : ''}`;
}
export function ingredientLine(i) {
  if (i.h) return `## ${i.h}`;
  const a = i.amt != null ? exactAmount(i) : '';
  return `${a ? `${a} ` : ''}${i.item}${i.note ? ` (${i.note})` : ''}${i.o ? ' (optional)' : ''}`;
}
export function toForm(r) {
  r = r || {};
  return {
    title: r.title || '',
    subtitle: r.subtitle || '',
    source: r.source || '',
    url: r.url || '',
    servings: r.servings ? String(r.servings) : '',
    minutes: r.minutes ? String(r.minutes) : '',
    calories: calOf(r) != null ? String(calOf(r)) : '',
    ingredients: (r.ingredients || [])
      .filter((i) => !i.pantry)
      .map(ingredientLine)
      .join('\n'),
    pantry: pantryOf(r).map(ingredientLine).join('\n'),
    steps: (r.steps || []).map((s) => (s.title ? `${s.title}: ${s.text}` : s.text)).join('\n\n'),
    notes: r.notes || '',
    tags: (r.tags || []).join(', '),
  };
}
const linesOf = (text, prev, pantry) =>
  String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      // a line that didn't change keeps everything it had (the card's amounts for other servings, exact amounts)
      const same = prev.find((p) => ingredientLine(p) === l && !p.pantry === !pantry);
      if (same) return { ...same };
      if (/^#{1,3}\s*\S/.test(l)) return { h: l.replace(/^#+\s*/, '') };
      const i = parseLine(l);
      if (pantry) i.pantry = 1;
      return i;
    });
const stepsOf = (text) =>
  String(text || '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\s*(?:step\s*)?\d+[.)]\s*/i, '').trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^([^:.\n]{2,40}):\s+([\s\S]+)$/);
      return m ? { title: m[1].trim(), text: m[2] } : { text: p };
    });
export function fromForm(f, prev) {
  const old = prev || {};
  const oldIng = old.ingredients || [];
  const was = toForm(prev);
  // untouched fields stay exactly as they were
  const ingredients = f.ingredients === was.ingredients && f.pantry === was.pantry && prev ? oldIng : [...linesOf(f.ingredients, oldIng, false), ...linesOf(f.pantry, oldIng, true)];
  const steps = f.steps === was.steps && prev ? old.steps || [] : stepsOf(f.steps);
  const cal = numish(f.calories);
  let nutrition = old.nutrition ? [...old.nutrition] : null;
  if (cal != null) nutrition = nutrition ? [cal, ...nutrition.slice(1)] : [cal];
  else if (nutrition && String(f.calories || '').trim() === '') nutrition = null;
  return normalizeRecipe({
    ...old,
    id: old.id || `mine-${uid()}`,
    title: cap(str(f.title, 160)),
    subtitle: f.subtitle,
    source: f.source,
    url: f.url,
    servings: f.servings,
    minutes: f.minutes,
    nutrition,
    ingredients,
    steps,
    notes: f.notes,
    tags: f.tags,
    added: old.added || todayISO(),
  });
}

// ---------------------------------------------------------------- changes to the box
export function addRecipe(box, r) {
  if (!r) return null;
  if (findRecipe(box, r.id)) r = { ...r, id: `${r.id}-${uid().slice(0, 4)}` };
  box.recipes.push({ ...r, added: r.added || todayISO() });
  checkSize(box);
  return r;
}
export function updateRecipe(box, r) {
  const i = box.recipes.findIndex((x) => x.id === r.id);
  if (i < 0) return addRecipe(box, r);
  const old = box.recipes[i];
  box.recipes[i] = { ...r, fav: old.fav, made: old.made, lastMade: old.lastMade, added: old.added || r.added, photo: r.photo !== undefined ? r.photo : old.photo };
  Object.keys(box.recipes[i]).forEach((k) => box.recipes[i][k] == null && delete box.recipes[i][k]);
  checkSize(box);
  return box.recipes[i];
}
export function removeRecipe(box, id) {
  const index = box.recipes.findIndex((r) => r.id === id);
  if (index < 0) return null;
  const [item] = box.recipes.splice(index, 1);
  return { item, index };
}
export function restoreRecipe(box, item, index) {
  if (!item || findRecipe(box, item.id)) return;
  box.recipes.splice(Math.min(index, box.recipes.length), 0, item);
}
export function toggleFav(box, id) {
  const r = findRecipe(box, id);
  if (!r) return false;
  if (r.fav) delete r.fav;
  else r.fav = 1;
  return !!r.fav;
}
export function markMade(box, id) {
  const r = findRecipe(box, id);
  if (!r) return;
  r.made = (r.made || 0) + 1;
  r.lastMade = todayISO();
}
export function setPhoto(box, id, stamp) {
  const r = findRecipe(box, id);
  if (!r) return;
  if (stamp) r.photo = stamp;
  else delete r.photo;
}
export const newStamp = () => uid().replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || String(Date.now());

// A Budget Bytes recipe (from the weekly file) kept in the box: its ingredient lines, photo and numbers;
// the steps stay on their site.
export function webToBox(r, img) {
  return normalizeRecipe({
    id: `bb-${r.id}`,
    webId: r.id,
    title: r.title,
    source: 'Budget Bytes',
    url: r.url,
    servings: r.servings,
    minutes: r.minutes,
    nutrition: r.nutrition,
    perServing: r.perServing,
    course: r.course,
    imgUrl: img,
    thumb: r.thumb,
    ingredients: r.lines ? r.lines.map((l) => (l.h ? { h: l.h } : { text: l.t, optional: !!l.o })) : (r.keys || []).map((k) => ({ item: cap(k) })),
  });
}
export function saveWebRecipe(box, r, img) {
  if (findRecipe(box, `bb-${r.id}`) || box.recipes.some((x) => x.webId != null && String(x.webId) === String(r.id))) return false;
  addRecipe(box, webToBox(r, img));
  return true;
}

// "My recipes" from before the recipe box (kept in the cooking document) move in once.
export const mineId = (m) => (m && m.id != null && m.id !== '' ? safeId(m.id) : `mine-${hashStr(fold(m && m.title))}`);
export function fromMine(m) {
  const web = m.webId != null && m.webId !== '';
  return normalizeRecipe({
    id: mineId(m),
    title: m.title,
    url: m.url,
    source: web ? 'Budget Bytes' : 'Mine',
    webId: m.webId,
    thumb: m.thumb,
    servings: m.servings,
    minutes: m.minutes,
    nutrition: m.nutrition,
    perServing: m.perServing,
    ingredients: linesIn(m.ingredients)
      .filter((t) => typeof t === 'string' || typeof t === 'number')
      .map((t) => ({ text: String(t) })),
    steps: !web && typeof m.notes === 'string' && m.notes.trim() ? [{ text: m.notes }] : [],
    notes: web && typeof m.notes === 'string' ? m.notes : '',
    made: m.made,
    lastMade: m.lastMade,
    added: todayISO(),
  });
}
// Each old entry moves once: its id is remembered in movedIds, so a recipe deleted from the box after moving
// never comes back, and running this again (after a failed save) adds nothing twice. → the ids handled
export function moveMine(box, mine) {
  box.movedIds = Array.isArray(box.movedIds) ? box.movedIds : [];
  const done = new Set(box.movedIds);
  const handled = [];
  for (const m of Array.isArray(mine) ? mine : []) {
    if (!m || typeof m !== 'object' || !m.title) continue;
    const id = mineId(m);
    handled.push(id);
    if (done.has(id)) continue;
    done.add(id);
    box.movedIds.push(id);
    const r = fromMine(m);
    if (!r || findRecipe(box, r.id) || (r.webId && box.recipes.some((x) => String(x.webId) === String(r.webId)))) continue;
    box.recipes.push(r);
  }
  checkSize(box);
  return handled;
}

// ---------------------------------------------------------------- importing recipe cards
// Accepts { recipes: [...] }, a bare list, or one recipe. Each recipe may carry photo: { card, full } as JPEG data URLs.
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const isPhoto = (u) => typeof u === 'string' && u.length >= 200 && u.length < MAX_PHOTO_CHARS && DATA_URL.test(u);
const sameDish = (a, b) => fold(a.title).trim() === fold(b.title).trim() && fold(a.subtitle).trim() === fold(b.subtitle).trim();
// The id an imported recipe gets when the file doesn't give one: its source, name, and a hash of the full name
// (so two long names that start the same never collide).
export const importId = (x) => `${slug(x.source || 'r').slice(0, 3) || 'r'}-${slug(x.title).slice(0, 40)}-${hashStr(fold(`${x.title}|${x.subtitle || ''}`))}`;
export function planImport(box, file) {
  const raw = Array.isArray(file) ? file : file && Array.isArray(file.recipes) ? file.recipes : file && file.title ? [file] : null;
  if (!raw || !raw.length) return { error: 'This file doesn’t have any recipes in it.' };
  const items = [];
  const skipped = [];
  const dupes = [];
  raw.forEach((x, n) => {
    const r = x && typeof x === 'object' && x.title ? normalizeRecipe({ ...x, photo: null, id: safeId(x.id) || importId(x) }) : null;
    if (!r) return skipped.push(n + 1);
    // the same id for a different dish (a clash) → its own id; the same dish → update it
    let existing = findRecipe(box, r.id);
    if (existing && !sameDish(existing, r)) {
      r.id = `${r.id.slice(0, 70)}-${hashStr(fold(`${r.title}|${r.subtitle || ''}`))}`;
      existing = findRecipe(box, r.id);
    }
    existing = existing || box.recipes.find((b) => sameDish(b, r)) || null;
    const id = existing ? existing.id : r.id;
    if (items.some((it) => it.r.id === id)) return dupes.push(n + 1);
    let photo = null;
    const p = x.photo;
    if (p && typeof p === 'object' && isPhoto(p.card)) photo = { card: p.card, full: isPhoto(p.full) ? p.full : p.card };
    items.push({ r: { ...r, id }, existing, photo });
  });
  return { items, skipped, dupes, add: items.filter((i) => !i.existing).length, update: items.filter((i) => i.existing).length, photos: items.filter((i) => i.photo).length };
}
// Put the planned recipes in the box. stamps: { [id]: photo stamp } for the photos that were saved.
// → the photos that were replaced ([id, old stamp]), to remove once this is saved.
export function applyImport(box, items, stamps = {}) {
  const replaced = [];
  for (const { r } of items) {
    const cur = findRecipe(box, r.id);
    const photo = stamps[r.id] || (cur && cur.photo) || undefined;
    if (cur && cur.photo && stamps[r.id] && cur.photo !== stamps[r.id]) replaced.push([r.id, cur.photo]);
    if (cur) {
      const keep = { fav: cur.fav, made: cur.made, lastMade: cur.lastMade, added: cur.added, notes: r.notes || cur.notes };
      const i = box.recipes.indexOf(cur);
      box.recipes[i] = normalizeRecipe({ ...r, ...keep, photo });
    } else box.recipes.push(normalizeRecipe({ ...r, photo, added: todayISO() }));
  }
  checkSize(box);
  return replaced;
}

// ---------------------------------------------------------------- search
const WORD = /[a-z0-9]+/g;
const words = (s) => fold(s).match(WORD) || [];
// Edit distance of at most one (a typo, a missing or extra letter, two letters swapped)?
function near(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
const stem = (w) => (w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '') : w);
function termScore(term, ws, strong) {
  const t = stem(term);
  let best = 0;
  for (const w of ws) {
    if (w === term || w === t || stem(w) === t) return strong + 2;
    if (w.startsWith(term) || w.startsWith(t)) best = Math.max(best, strong);
    else if (term.length >= 4 && (near(term, w) || near(t, stem(w)))) best = Math.max(best, strong - 3);
  }
  return best;
}
// Your recipes that match every word of the search, best first: → [{ r, score, via }] where via is the
// ingredient that matched (when it was only an ingredient).
export function searchRecipes(recipes, q, { limit = 50 } = {}) {
  const terms = words(q);
  if (!terms.length) return [];
  const phrase = fold(q).trim();
  const out = [];
  for (const r of recipes || []) {
    const title = words(r.title);
    const sub = words(r.subtitle);
    const ingr = itemsOf(r).map((i) => ({ item: i.item, ws: words(i.item) }));
    const tags = words([r.source, ...(r.tags || []), r.course].filter(Boolean).join(' '));
    const rest = words([r.notes, ...(r.steps || []).map((s) => s.text), ...pantryOf(r).map((i) => i.item)].join(' '));
    let score = 0;
    let via = null;
    let ok = true;
    for (const term of terms) {
      const s1 = termScore(term, title, 10);
      const s2 = termScore(term, sub, 6);
      let s3 = 0;
      let hit = null;
      for (const ing of ingr) {
        const s = termScore(term, ing.ws, 5);
        if (s > s3) {
          s3 = s;
          hit = ing.item;
        }
      }
      const s4 = termScore(term, tags, 4);
      const s5 = term.length >= 3 && rest.some((w) => w.startsWith(term)) ? 1 : 0;
      const best = Math.max(s1, s2, s3, s4, s5);
      if (!best) {
        ok = false;
        break;
      }
      if (s3 && s3 >= s1 && s3 >= s2 && !via) via = hit;
      score += best;
    }
    if (!ok) continue;
    if (fold(r.title).includes(phrase)) score += 8;
    if (fold(r.title).startsWith(phrase)) score += 4;
    if (r.fav) score += 1;
    out.push({ r, score, via: via && !title.some((w) => terms.includes(w)) ? via : null });
  }
  return out.sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title)).slice(0, limit);
}
// Split text into plain and matching pieces for highlighting: → [{ t, hit }]
export function highlight(text, q) {
  const terms = words(q).filter((t) => t.length >= 1);
  const s = String(text || '');
  if (!terms.length || !s) return [{ t: s }];
  // fold character by character, remembering where each folded character came from
  let f = '';
  const from = [];
  for (let i = 0; i < s.length; i++) {
    const c = /[’'`]/.test(s[i]) ? '' : s[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const ch of c) {
      f += ch;
      from.push(i);
    }
  }
  const marks = new Array(s.length).fill(false);
  const re = /[a-z0-9]+/g;
  let m;
  while ((m = re.exec(f))) {
    for (const t of terms) {
      const st = stem(t);
      const w = m[0];
      const len = w.startsWith(t) ? t.length : w.startsWith(st) ? st.length : 0;
      for (let i = 0; i < len; i++) marks[from[m.index + i]] = true;
    }
  }
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.t += s[i];
    else out.push({ t: s[i], hit: marks[i] });
  }
  return out;
}

// ---------------------------------------------------------------- browsing the box
export const BOX_SORT = [
  ['recent', 'Recently added'],
  ['az', 'A to Z'],
  ['made', 'Most made'],
  ['quick', 'Quickest'],
  ['light', 'Fewest calories'],
];
export function sortRecipes(list, how) {
  const a = [...list];
  const num = (v, d) => (v == null ? d : v);
  const by = {
    recent: (x, y) => String(y.added || '').localeCompare(String(x.added || '')) || list.indexOf(y) - list.indexOf(x),
    az: (x, y) => x.title.localeCompare(y.title),
    made: (x, y) => (y.made || 0) - (x.made || 0) || String(y.lastMade || '').localeCompare(String(x.lastMade || '')) || x.title.localeCompare(y.title),
    quick: (x, y) => num(x.minutes, 999) - num(y.minutes, 999) || x.title.localeCompare(y.title),
    light: (x, y) => num(calOf(x), 1e6) - num(calOf(y), 1e6) || x.title.localeCompare(y.title),
  };
  return a.sort(by[how] || by.recent);
}
// Filter chips: favorites, each source, quick, and the most common tags.
export function boxFilters(recipes) {
  const out = [['all', 'All', recipes.length]];
  const favs = recipes.filter((r) => r.fav).length;
  if (favs) out.push(['fav', 'Favorites', favs]);
  const src = new Map();
  for (const r of recipes) if (r.source) src.set(r.source, (src.get(r.source) || 0) + 1);
  [...src.entries()].sort((a, b) => b[1] - a[1]).forEach(([s, n]) => out.push([`src:${s}`, s, n]));
  const quick = recipes.filter((r) => r.minutes && r.minutes <= 30).length;
  if (quick) out.push(['quick', '30 min or less', quick]);
  const tags = new Map();
  for (const r of recipes) for (const t of r.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
  [...tags.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([t, n]) => out.push([`tag:${t}`, t, n]));
  return out;
}
export function applyFilter(recipes, f) {
  if (!f || f === 'all') return recipes;
  if (f === 'fav') return recipes.filter((r) => r.fav);
  if (f === 'quick') return recipes.filter((r) => r.minutes && r.minutes <= 30);
  if (f.startsWith('src:')) return recipes.filter((r) => r.source === f.slice(4));
  if (f.startsWith('tag:')) return recipes.filter((r) => (r.tags || []).includes(f.slice(4)));
  return recipes;
}
