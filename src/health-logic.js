// Health tab data and math. Two kinds of documents, both owner-only like the rest of the dashboard:
//   trackers/<doc>-health         profile, targets, weigh-ins, your food library (recents), settings
//   trackers/<doc>-health-<year>  that year's days: food log, steps, workouts (one per year keeps each well under Firestore's 1 MB)
import { uid, todayISO, isoOf, addDays } from './budget-logic.js';

export const MEALS = [
  ['breakfast', 'Breakfast'],
  ['lunch', 'Lunch'],
  ['dinner', 'Dinner'],
  ['snack', 'Snacks'],
];
export const ACTIVITY = [
  ['sedentary', 'Desk job, little exercise', 1.2],
  ['light', 'Light: exercise 1–3 days a week', 1.375],
  ['moderate', 'Moderate: exercise 3–5 days a week', 1.55],
  ['active', 'Very active: hard exercise 6–7 days a week', 1.725],
];
export const GOALS = [
  ['maintain', 'Maintain weight', 0],
  ['lose_slow', 'Lose about ½ lb a week', -250],
  ['lose', 'Lose about 1 lb a week', -500],
  ['gain', 'Gain slowly (build muscle)', 250],
];
// MET values (Compendium of Physical Activities) for rough calories burned: MET × kg × hours.
export const WORKOUTS = [
  ['weights', 'Weights / gym', 5],
  ['tennis', 'Tennis', 7.3],
  ['run', 'Running', 9.8],
  ['walk', 'Walking', 3.5],
  ['bike', 'Cycling', 7.5],
  ['hiit', 'HIIT / class', 8],
  ['swim', 'Swimming', 7],
  ['other', 'Other', 5],
];
const LB_KG = 0.45359237;

export function defaultHealth() {
  return { version: 1, profile: { sex: '', age: null, heightIn: null, activity: 'light', goal: 'maintain' }, custom: null, stepGoal: 8000, weights: [], foods: {}, usdaKey: '' };
}
export function normalizeHealth(d) {
  const b = defaultHealth();
  if (!d || typeof d !== 'object') return b;
  return {
    ...b,
    ...d,
    profile: { ...b.profile, ...(d.profile || {}) },
    weights: Array.isArray(d.weights) ? d.weights.filter((w) => w && w.date && Number(w.lb) > 0) : [],
    foods: d.foods && typeof d.foods === 'object' ? d.foods : {},
    stepGoal: Number(d.stepGoal) || b.stepGoal,
  };
}
export const defaultYear = () => ({ version: 1, days: {} });
export function normalizeYear(d) {
  if (!d || typeof d !== 'object') return defaultYear();
  return { version: 1, days: d.days && typeof d.days === 'object' ? d.days : {}, updatedAt: d.updatedAt };
}
export const yearOf = (iso) => iso.slice(0, 4);
export const emptyDay = () => ({ food: [], steps: null, workouts: [] });
export const getDay = (years, iso) => {
  const y = years[yearOf(iso)];
  const d = y && y.days[iso];
  return { ...emptyDay(), ...(d || {}), food: (d && d.food) || [], workouts: (d && d.workouts) || [] };
};
export function dayOf(yearDoc, iso) {
  yearDoc.days = yearDoc.days || {};
  if (!yearDoc.days[iso]) yearDoc.days[iso] = emptyDay();
  const d = yearDoc.days[iso];
  d.food = d.food || [];
  d.workouts = d.workouts || [];
  return d;
}

// ---------------------------------------------------------------- targets
export const latestWeight = (h) => [...h.weights].sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;

export function targets(h) {
  const p = h.profile;
  const w = latestWeight(h);
  const lb = w ? Number(w.lb) : null;
  const auto = (() => {
    if (!p.sex || !Number(p.age) || !Number(p.heightIn) || !lb) return null;
    const kg = lb * LB_KG;
    const cm = Number(p.heightIn) * 2.54;
    const bmr = 10 * kg + 6.25 * cm - 5 * Number(p.age) + (p.sex === 'female' ? -161 : 5);
    const act = (ACTIVITY.find((a) => a[0] === p.activity) || ACTIVITY[1])[2];
    const tdee = bmr * act;
    const adj = (GOALS.find((g) => g[0] === p.goal) || GOALS[0])[2];
    const floor = p.sex === 'female' ? 1200 : 1500;
    const cal = Math.max(floor, Math.round((tdee + adj) / 10) * 10);
    const protein = Math.round(lb * 0.8); // 0.8 g per lb of body weight
    const fat = Math.round((cal * 0.3) / 9); // 30% of calories
    const carbs = Math.max(0, Math.round((cal - protein * 4 - fat * 9) / 4));
    return { cal, p: protein, c: carbs, f: fat, bmr: Math.round(bmr), tdee: Math.round(tdee) };
  })();
  if (h.custom && Number(h.custom.cal)) return { ...auto, ...h.custom, cal: Number(h.custom.cal), p: Number(h.custom.p) || 0, c: Number(h.custom.c) || 0, f: Number(h.custom.f) || 0, source: 'custom', auto };
  if (auto) return { ...auto, source: 'auto', auto };
  return { source: 'missing', need: [!p.sex && 'sex', !Number(p.age) && 'age', !Number(p.heightIn) && 'height', !lb && 'weight'].filter(Boolean) };
}

// ---------------------------------------------------------------- foods and portions
// A food has per-100 g numbers (database foods) or per-serving numbers (quick adds, recipes), plus portions.
// Portion: { label, g } (weight-based) or { label, mult } (multiples of the food's serving).
const r1 = (n) => Math.round(n * 10) / 10;
export function nutrientsFor(food, portion, qty) {
  const q = Number(qty) || 0;
  let f = 0;
  let base = null;
  if (portion && portion.g && food.per100) {
    base = food.per100;
    f = (portion.g / 100) * q;
  } else if (food.perServing) {
    base = food.perServing;
    f = ((portion && portion.mult) || 1) * q;
  } else if (food.per100) {
    base = food.per100;
    f = q; // no portion: treat as 100 g units
  }
  if (!base) return { k: 0, p: 0, c: 0, f: 0 };
  return { k: Math.round((base.k || 0) * f), p: r1((base.p || 0) * f), c: r1((base.c || 0) * f), f: r1((base.f || 0) * f) };
}
export const foodKey = (food) => (food.src && food.ref ? `${food.src}:${food.ref}` : `q:${String(food.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`);
export function portionsOf(food) {
  const list = [...(food.portions || [])];
  if (food.per100) {
    if (!list.some((p) => p.label === 'g')) list.push({ label: 'g', g: 1 });
    if (!list.some((p) => p.label === 'oz')) list.push({ label: 'oz', g: 28.35 });
  }
  if (!list.length) list.push({ label: '1 serving', mult: 1 });
  return list;
}
export function defaultPortion(food) {
  const list = portionsOf(food);
  if (food.last && food.last.label) {
    const hit = list.find((p) => p.label === food.last.label);
    if (hit) return { portion: hit, qty: food.last.qty || 1 };
  }
  const p = list[0];
  return { portion: p, qty: p.label === 'g' ? 100 : 1 };
}
const portionText = (portion, qty) => {
  const q = Number(qty);
  const n = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100);
  if (portion.label === 'g' || portion.label === 'oz') return `${n} ${portion.label}`;
  if (q === 1) return portion.label;
  return `${n} × ${portion.label}`;
};
export function entryFor(food, portion, qty, meal) {
  const n = nutrientsFor(food, portion, qty);
  return {
    id: uid(),
    meal,
    name: food.name,
    brand: food.brand || undefined,
    amount: portionText(portion, qty),
    qty: Number(qty),
    portion: portion.label,
    key: foodKey(food),
    ...n,
  };
}
// Remember a food (for Recent) with the portion last used.
export function remember(h, food, portion, qty) {
  const key = foodKey(food);
  const prev = h.foods[key] || {};
  h.foods[key] = {
    name: food.name,
    brand: food.brand || undefined,
    src: food.src || 'quick',
    ref: food.ref || undefined,
    per100: food.per100 || undefined,
    perServing: food.perServing || undefined,
    portions: food.portions || undefined,
    last: { label: portion.label, qty: Number(qty) },
    uses: (prev.uses || 0) + 1,
    lastUsed: Date.now(),
  };
  // Keep the library small: at most 300 foods, least-recently used go first.
  const keys = Object.keys(h.foods);
  if (keys.length > 300) {
    keys.sort((a, b) => (h.foods[a].lastUsed || 0) - (h.foods[b].lastUsed || 0)).slice(0, keys.length - 300).forEach((k) => delete h.foods[k]);
  }
}
export function recentFoods(h, n = 30) {
  return Object.entries(h.foods)
    .map(([key, f]) => ({ key, ...f }))
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    .slice(0, n);
}
export function forget(h, key) {
  delete h.foods[key];
}

// ---------------------------------------------------------------- day edits
export function addEntry(yearDoc, iso, entry) {
  dayOf(yearDoc, iso).food.push(entry);
}
export function removeEntry(yearDoc, iso, id) {
  const d = dayOf(yearDoc, iso);
  d.food = d.food.filter((e) => e.id !== id);
}
export function updateEntry(yearDoc, iso, id, food, portion, qty, meal) {
  const d = dayOf(yearDoc, iso);
  const i = d.food.findIndex((e) => e.id === id);
  if (i < 0) return;
  const next = food ? entryFor(food, portion, qty, meal || d.food[i].meal) : { ...d.food[i], meal: meal || d.food[i].meal };
  next.id = id;
  d.food[i] = next;
}
export function copyMeal(fromDay, yearDoc, toIso, meal) {
  const items = (fromDay.food || []).filter((e) => e.meal === meal);
  const d = dayOf(yearDoc, toIso);
  items.forEach((e) => d.food.push({ ...e, id: uid() }));
  return items.length;
}
export function setSteps(yearDoc, iso, steps) {
  const n = Math.round(Number(String(steps).replace(/[^\d]/g, '')));
  dayOf(yearDoc, iso).steps = n > 0 ? n : null;
}
export function addWorkout(yearDoc, iso, w) {
  dayOf(yearDoc, iso).workouts.push({ id: uid(), type: w.type, minutes: Math.round(Number(w.minutes)) || 0, note: (w.note || '').trim() || undefined });
}
export function removeWorkout(yearDoc, iso, id) {
  const d = dayOf(yearDoc, iso);
  d.workouts = d.workouts.filter((w) => w.id !== id);
}
export function workoutKcal(w, lb) {
  const met = (WORKOUTS.find((x) => x[0] === w.type) || WORKOUTS[WORKOUTS.length - 1])[2];
  return lb ? Math.round(met * lb * LB_KG * ((Number(w.minutes) || 0) / 60)) : null;
}

// ---------------------------------------------------------------- totals and summaries
export function totals(entries) {
  return entries.reduce((t, e) => ({ k: t.k + (e.k || 0), p: r1(t.p + (e.p || 0)), c: r1(t.c + (e.c || 0)), f: r1(t.f + (e.f || 0)) }), { k: 0, p: 0, c: 0, f: 0 });
}
export function mealNow(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 21.5) return 'dinner';
  return 'snack';
}
export function week(years, endIso = todayISO()) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const iso = addDays(endIso, -i);
    days.push({ iso, ...getDay(years, iso) });
  }
  const logged = days.filter((d) => d.food.length);
  const stepDays = days.filter((d) => d.steps);
  const workouts = days.flatMap((d) => d.workouts);
  return {
    days,
    avgCal: logged.length ? Math.round(logged.reduce((s, d) => s + totals(d.food).k, 0) / logged.length) : null,
    loggedDays: logged.length,
    avgSteps: stepDays.length ? Math.round(stepDays.reduce((s, d) => s + d.steps, 0) / stepDays.length) : null,
    workouts: workouts.length,
    minutes: workouts.reduce((s, w) => s + (w.minutes || 0), 0),
  };
}

// ---------------------------------------------------------------- weight
export function logWeight(h, lb, date = todayISO()) {
  const v = Math.round(Number(lb) * 10) / 10;
  if (!(v > 50 && v < 700)) return false;
  h.weights = h.weights.filter((w) => w.date !== date);
  h.weights.push({ date, lb: v });
  h.weights.sort((a, b) => (a.date < b.date ? -1 : 1));
  return true;
}
export function removeWeight(h, date) {
  h.weights = h.weights.filter((w) => w.date !== date);
}
// Each weigh-in with the average of the weigh-ins in the 7 days ending that day.
export function weightSeries(h) {
  const w = [...h.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  return w.map((x) => {
    const from = addDays(x.date, -6);
    const win = w.filter((y) => y.date >= from && y.date <= x.date);
    return { date: x.date, lb: x.lb, avg: Math.round((win.reduce((s, y) => s + y.lb, 0) / win.length) * 10) / 10 };
  });
}
export function weightStats(h, today = todayISO()) {
  const s = weightSeries(h);
  if (!s.length) return null;
  const last = s[s.length - 1];
  const ago = addDays(today, -30);
  const past = [...s].reverse().find((x) => x.date <= ago);
  const first = s[0];
  return {
    latest: last,
    trend: last.avg,
    change30: past ? Math.round((last.avg - past.avg) * 10) / 10 : null,
    since: first.date !== last.date ? { date: first.date, change: Math.round((last.avg - first.avg) * 10) / 10 } : null,
  };
}
export { isoOf, addDays, todayISO };
