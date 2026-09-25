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
  return { version: 1, kitchen: [], grocery: [], mine: JSON.parse(JSON.stringify(SEED_MINE)), hidden: [] };
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
