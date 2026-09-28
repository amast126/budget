// Cooking tab data: kitchen list, grocery list, your own recipes, and matching against the weekly recipe file.
// Saved in trackers/<doc>-cooking. All changes go through small functions so they're easy to test.
import { normalize, matchRecipe, guessWhere, STAPLES } from './ingredients.mjs';
import { uid, todayISO } from './budget-logic.js';

export const PLACES = [
  ['fridge', 'Fridge'],
  ['freezer', 'Freezer'],
  ['pantry', 'Pantry'],
  ['spices', 'Spices'],
];
export const PLACE_LABEL = Object.fromEntries(PLACES);
export const COURSES = [
  ['main', 'Dinners'],
  ['breakfast', 'Breakfast'],
  ['side', 'Sides'],
];

// Two saved recipes to start "My recipes" with.
const SEED_MINE = [
  {
    id: 'mine-chipotle-steak',
    title: 'Chipotle-style steak',
    ingredients: [
      '2–2½ lb sirloin tip or flank, cut in ½–¾" cubes',
      'olive oil',
      'juice of 2 limes',
      '3 chipotles in adobo, plus some sauce',
      'garlic',
      'ground cumin',
      'smoked paprika',
      'dried oregano',
      'chili powder',
      'salt and pepper',
    ],
    notes:
      'Blend everything but the steak into a paste. Marinate at least 1 hour. Grill at 425–450°F, 4–5 minutes a side, and pull at 125–135°F inside. Toss with salt, chili powder and a squeeze of lime, then rest 5 minutes.',
    made: 0,
  },
  {
    id: 'mine-chipotle-guac',
    title: 'Chipotle-style guacamole',
    ingredients: ['4 Hass avocados', '¼ cup red onion', '1 jalapeño', '¼ cup cilantro', 'juice of 2 limes', '1–1¼ tsp kosher salt'],
    notes: 'Mash chunky. No garlic, tomato or cumin. Lime-forward and properly salted.',
    made: 0,
  },
];

export function defaultCooking() {
  return { version: 1, kitchen: [], grocery: [], mine: JSON.parse(JSON.stringify(SEED_MINE)), hidden: [], plan: [] };
}

export function normalizeCooking(d) {
  const base = defaultCooking();
  if (!d || typeof d !== 'object') return base;
  return {
    version: 1,
    kitchen: Array.isArray(d.kitchen) ? d.kitchen.filter((i) => i && i.name) : [],
    grocery: Array.isArray(d.grocery) ? d.grocery.filter((i) => i && i.name) : [],
    mine: Array.isArray(d.mine) ? d.mine.filter((r) => r && r.title) : base.mine,
    hidden: Array.isArray(d.hidden) ? d.hidden : [],
    plan: Array.isArray(d.plan) ? d.plan.filter((r) => r && r.id && r.title) : [],
    updatedAt: d.updatedAt,
  };
}

const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// "eggs, milk and butter" → ["eggs", "milk", "butter"]
export const splitItems = (text) =>
  String(text || '')
    .split(/\n|,|;/)
    .map(tidy)
    .filter(Boolean);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ---------------------------------------------------------------- kitchen
export const keyOfItem = (i) => normalize(i.name);
export const kitchenKeys = (d) => d.kitchen.map(keyOfItem).filter(Boolean);
const findByKey = (list, key) => list.find((i) => normalize(i.name) === key);

export function addKitchen(d, names, where) {
  let added = 0;
  for (const raw of names) {
    const name = cap(tidy(raw));
    const key = normalize(name);
    if (!name || !key) continue;
    const have = findByKey(d.kitchen, key);
    if (have) {
      have.low = false;
      continue;
    }
    d.kitchen.push({ id: uid(), name, where: where || guessWhere(name), added: todayISO() });
    added++;
  }
  return added;
}
export function removeKitchen(d, id) {
  d.kitchen = d.kitchen.filter((i) => i.id !== id);
}
export function setWhere(d, id, where) {
  const i = d.kitchen.find((x) => x.id === id);
  if (i) i.where = where;
}
// Running low puts it on the grocery list; un-flagging takes it back off (unless already ticked).
export function toggleLow(d, id) {
  const i = d.kitchen.find((x) => x.id === id);
  if (!i) return;
  i.low = !i.low;
  const key = normalize(i.name);
  if (i.low) addGrocery(d, [i.name]);
  else d.grocery = d.grocery.filter((g) => g.done || normalize(g.name) !== key);
}

// ---------------------------------------------------------------- grocery list
export function addGrocery(d, names, forTitle) {
  let added = 0;
  for (const raw of names) {
    const name = cap(tidy(raw));
    const key = normalize(name);
    if (!name) continue;
    const have = key && d.grocery.find((g) => !g.done && normalize(g.name) === key);
    if (have) {
      if (forTitle && !(have.for || []).includes(forTitle)) have.for = [...(have.for || []), forTitle];
      continue;
    }
    d.grocery.push({ id: uid(), name, for: forTitle ? [forTitle] : [], added: todayISO() });
    added++;
  }
  return added;
}
export function toggleGrocery(d, id) {
  const g = d.grocery.find((x) => x.id === id);
  if (g) g.done = !g.done;
}
export function removeGrocery(d, id) {
  d.grocery = d.grocery.filter((g) => g.id !== id);
}
// Bought items go into the kitchen (or clear their "running low" flag) and leave the list.
export function putAway(d) {
  const bought = d.grocery.filter((g) => g.done);
  for (const g of bought) {
    const key = normalize(g.name);
    const have = key && findByKey(d.kitchen, key);
    if (have) have.low = false;
    else if (key) d.kitchen.push({ id: uid(), name: g.name, where: guessWhere(g.name), added: todayISO() });
  }
  d.grocery = d.grocery.filter((g) => !g.done);
  return bought.length;
}
export function clearDone(d) {
  const n = d.grocery.filter((g) => g.done).length;
  d.grocery = d.grocery.filter((g) => !g.done);
  return n;
}

// ---------------------------------------------------------------- recipes
export const recipeUrl = (recipes, r) => (r.url ? r.url : r.slug && recipes ? `${recipes.site}/${r.slug}/` : null);
export const imageUrl = (recipes, p) => (p && recipes ? recipes.uploads + p : null);

// Ingredient keys a recipe needs (staples and blanks left out).
export function keysOf(r) {
  if (r.keys) return r.keys;
  return (r.ingredients || []).map(normalize).filter((k) => k && !STAPLES.has(k));
}
export function match(r, kKeys) {
  return matchRecipe(keysOf(r), kKeys);
}

// Best recipes to cook from what's in the kitchen: fewest missing first, then more you have, then popularity.
export function rankRecipes(list, kKeys, { course, limit = 8, hidden = [] } = {}) {
  const hide = new Set(hidden);
  return list
    .filter((r) => (!course || r.course === course) && !hide.has(r.id))
    .map((r) => ({ r, m: match(r, kKeys) }))
    .filter((x) => x.m.total > 0 && x.m.have.length > 0)
    .sort((a, b) => a.m.missing.length - b.m.missing.length || b.m.ratio - a.m.ratio || (b.r.ratings || 0) - (a.r.ratings || 0))
    .slice(0, limit);
}

// Display name for an ingredient key: keys are singular for matching, lists read better plural ("Black beans").
const PLURAL = {
  tomato: 'tomatoes', potato: 'potatoes', leaf: 'leaves', chile: 'chiles', jalapeño: 'jalapeños', avocado: 'avocados',
  bean: 'beans', egg: 'eggs', carrot: 'carrots', flake: 'flakes', thigh: 'thighs', breast: 'breasts', onion: 'onions',
  mushroom: 'mushrooms', chickpea: 'chickpeas', pea: 'peas', lentil: 'lentils', oat: 'oats', noodle: 'noodles',
  tortilla: 'tortillas', crumb: 'crumbs', chip: 'chips', seed: 'seeds', lime: 'limes', lemon: 'lemons', pepper: 'peppers',
  apple: 'apples', banana: 'bananas', olive: 'olives', walnut: 'walnuts', almond: 'almonds', peanut: 'peanuts', raisin: 'raisins',
  shallot: 'shallots', scallion: 'scallions', zucchini: 'zucchini', cucumber: 'cucumbers', drumstick: 'drumsticks', wing: 'wings',
  cranberry: 'cranberries', blueberry: 'blueberries', strawberry: 'strawberries', date: 'dates', caper: 'capers', sprout: 'sprouts',
};
export const label = (k) => {
  const w = String(k || '').split(' ');
  const last = w[w.length - 1];
  if (k === 'black pepper' || k === 'red pepper flake' ? false : PLURAL[last]) w[w.length - 1] = PLURAL[last];
  return cap(k === 'red pepper flake' ? 'red pepper flakes' : w.join(' '));
};

export function addMine(d, { title, url, ingredients, notes }) {
  const r = {
    id: 'mine-' + uid(),
    title: cap(tidy(title)),
    url: tidy(url) || undefined,
    ingredients: String(ingredients || '')
      .split('\n')
      .map(tidy)
      .filter(Boolean),
    notes: tidy(notes) || undefined,
    made: 0,
  };
  if (!r.title) return null;
  d.mine.push(r);
  return r;
}
// Keep a web recipe in "My recipes" (its ingredient lines if we have them, else its ingredient names).
export function saveWeb(d, r, recipes) {
  const id = 'bb-' + r.id;
  if (d.mine.some((m) => m.id === id)) return false;
  d.mine.push({
    id,
    webId: r.id,
    title: r.title,
    url: recipeUrl(recipes, r),
    thumb: r.thumb || null,
    perServing: r.perServing ?? null,
    minutes: r.minutes ?? null,
    nutrition: r.nutrition || null,
    servings: r.servings || null,
    ingredients: r.lines ? r.lines.filter((l) => l.t).map((l) => l.t + (l.o ? ' (optional)' : '')) : (r.keys || []).map(label),
    made: 0,
  });
  return true;
}
export function removeMine(d, id) {
  d.mine = d.mine.filter((r) => r.id !== id);
}
export function madeIt(d, id) {
  const r = d.mine.find((x) => x.id === id);
  if (!r) return;
  r.made = (r.made || 0) + 1;
  r.lastMade = todayISO();
}

// Missing ingredients as grocery names: the recipe's own wording when we have lines, else the key.
export function missingNames(r, m) {
  const miss = new Set(m.missing);
  if (r.lines) {
    const out = [];
    for (const l of r.lines) if (l.k && miss.has(l.k) && !l.o && !out.some((x) => normalize(x) === l.k)) out.push(label(l.k));
    return out;
  }
  return m.missing.map(label);
}

// Grocery category in the budget (whatever it's called there).
export function groceriesCategory(names) {
  return names.find((n) => /grocer/i.test(n)) || names.find((n) => /food/i.test(n)) || names[0] || 'Groceries';
}

// ---------------------------------------------------------------- meal prep: finding recipes and planning the week
// A recipe's main protein, from Budget Bytes' meal prep tags or else its ingredients.
const MEAT = [
  ['poultry', /\b(chicken|turkey)\b(?!.*\b(broth|stock|bouillon|base)\b)/],
  ['beef', /\b(beef|steak|brisket|chuck|sirloin|flank)\b(?!.*\b(broth|stock|bouillon|base)\b)/],
  ['pork', /\b(pork|sausage|bacon|ham|chorizo|pancetta|prosciutto|andouille|kielbasa|pepperoni|salami)\b/],
  ['seafood', /\b(shrimp|salmon|tuna|cod|tilapia|fish|crab|scallop|clam|mussel|anchov\w*)\b(?! sauce)/],
];
export function proteinOf(r) {
  const tags = r.prep || [];
  if (tags.includes('chicken')) return 'poultry';
  for (const t of ['beef', 'pork']) if (tags.includes(t)) return t;
  if (tags.includes('veg')) return 'veg';
  const keys = keysOf(r);
  for (const [name, re] of MEAT) if (keys.some((k) => re.test(k) && !/fish sauce/.test(k))) return name;
  return 'veg';
}
export const MP_SHOW = [
  ['all', 'All'],
  ['mp', 'Meal prep'],
  ['main', 'Dinners'],
  ['breakfast', 'Breakfast'],
  ['noreheat', 'No-reheat lunches'],
  ['side', 'Sides'],
];
export const MP_PROTEIN = [
  ['any', 'Any protein'],
  ['poultry', 'Chicken & turkey'],
  ['beef', 'Beef'],
  ['pork', 'Pork'],
  ['seafood', 'Seafood'],
  ['veg', 'Vegetarian'],
];
export const MP_EXTRAS = [
  ['cheap', 'Under $2 a serving'],
  ['quick', '30 min or less'],
  ['protein', '25g+ protein'],
  ['have', 'Mostly in my kitchen'],
];
export const MP_SORT = [
  ['best', 'Best picks first'],
  ['popular', 'Most popular'],
  ['cheap', 'Cheapest'],
  ['quick', 'Quickest'],
  ['protein', 'Most protein'],
  ['missing', 'Fewest to buy'],
];
const proteinG = (r) => (r.nutrition ? Number(r.nutrition[1]) || 0 : 0);
// Filter and sort recipes; returns [{ r, m }] (m: what you have and what's missing).
export function findRecipes(list, { q = '', show = 'all', protein = 'any', extras = [], kKeys = [], sort = 'best' } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const ex = new Set(extras);
  const out = [];
  list.forEach((r, i) => {
    if (show === 'mp' && !r.mp) return;
    if (['main', 'breakfast', 'side'].includes(show) && r.course !== show) return;
    if (show === 'noreheat' && !(r.prep || []).includes('noreheat')) return;
    if (protein !== 'any' && proteinOf(r) !== protein) return;
    if (ex.has('cheap') && !(r.perServing != null && r.perServing < 2)) return;
    if (ex.has('quick') && !(r.minutes && r.minutes <= 30)) return;
    if (ex.has('protein') && proteinG(r) < 25) return;
    if (words.length) {
      const hay = `${r.title} ${keysOf(r).join(' ')}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return;
    }
    const m = match(r, kKeys);
    if (ex.has('have') && !(m.total && m.missing.length <= 2)) return;
    out.push({ r, m, i });
  });
  const pop = (r) => Math.sqrt(r.ratings || 0) * Math.pow(r.stars || 4, 2) * (r.mp ? 1.3 : 1);
  const num = (v, dflt) => (v == null || Number.isNaN(Number(v)) ? dflt : Number(v));
  const by = {
    best: (a, b) => a.i - b.i,
    popular: (a, b) => pop(b.r) - pop(a.r),
    cheap: (a, b) => num(a.r.perServing, 99) - num(b.r.perServing, 99),
    quick: (a, b) => num(a.r.minutes, 999) - num(b.r.minutes, 999),
    protein: (a, b) => proteinG(b.r) - proteinG(a.r),
    missing: (a, b) => a.m.missing.length - b.m.missing.length || b.m.ratio - a.m.ratio || pop(b.r) - pop(a.r),
  };
  return out.sort(by[sort] || by.best);
}

// This week's prep: recipes you've lined up, kept with enough of each to work after they leave the weekly file.
const PLAN_FIELDS = ['id', 'title', 'subtitle', 'slug', 'url', 'course', 'perServing', 'total', 'servings', 'minutes', 'nutrition', 'thumb', 'image', 'imgUrl', 'box', 'source', 'mp', 'prep', 'webId'];
export function planItem(r) {
  const o = { added: todayISO() };
  PLAN_FIELDS.forEach((f) => r[f] != null && (o[f] = r[f]));
  o.keys = keysOf(r);
  return o;
}
// Ids compare as text: a saved Budget Bytes recipe carries its id as text, the weekly file as a number.
const sameId = (a, b) => String(a) === String(b);
export const inPlan = (d, id) => (d.plan || []).some((x) => sameId(x.id, id));
export function togglePlan(d, r) {
  d.plan = d.plan || [];
  if (inPlan(d, r.id)) {
    d.plan = d.plan.filter((x) => !sameId(x.id, r.id));
    return false;
  }
  d.plan.push(planItem(r));
  return true;
}
export function removePlan(d, id) {
  d.plan = (d.plan || []).filter((x) => !sameId(x.id, id));
}
export function clearPlan(d) {
  const n = (d.plan || []).length;
  d.plan = [];
  return n;
}
// Servings, cost, and calories and protein per serving across the plan.
export function planTotals(plan) {
  let servings = 0;
  let cost = 0;
  let priced = 0;
  let cal = 0;
  let prot = 0;
  let fed = 0;
  for (const r of plan || []) {
    const n = Number(r.servings) || 4;
    servings += n;
    const c = r.total != null ? Number(r.total) : r.perServing != null ? Number(r.perServing) * n : null;
    if (c != null) {
      cost += c;
      priced++;
    }
    // recipes with calories and protein count toward the averages (cards often only print calories)
    if (r.nutrition && r.nutrition[0] != null && r.nutrition[1] != null) {
      cal += Number(r.nutrition[0]) * n;
      prot += Number(r.nutrition[1]) * n;
      fed += n;
    }
  }
  return { recipes: (plan || []).length, servings, cost, priced, calories: fed ? cal / fed : null, protein: fed ? prot / fed : null };
}
// Everything the plan needs that isn't in the kitchen, merged: [{ name, key, for: [titles] }].
export function planShopping(plan, kKeys) {
  const out = new Map();
  for (const r of plan || []) {
    for (const k of match(r, kKeys).missing) {
      const e = out.get(k) || { name: label(k), key: k, for: [] };
      if (!e.for.includes(r.title)) e.for.push(r.title);
      out.set(k, e);
    }
  }
  return [...out.values()].sort((a, b) => b.for.length - a.for.length || a.name.localeCompare(b.name));
}
export function addPlanToGrocery(d, kKeys) {
  let added = 0;
  for (const r of d.plan || []) added += addGrocery(d, missingNames(r, match(r, kKeys)), r.title);
  return added;
}
