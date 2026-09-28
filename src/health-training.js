// Training: heart-rate zones and training load, the strength log, and the tennis log.
// Stored with the rest of Health (owner-only):
//   trackers/<doc>-health          strength { custom exercises, routines }, tennis notes by session, maxHr
//   trackers/<doc>-health-<year>   each day's lifts: [{ id, ex, sets: [{ r, lb }] }]
// Apple Watch workouts carry a heart-rate histogram from the import (hb: [first bpm, minutes per 5 bpm…]), so
// zones can be worked out for any max heart rate.
import { uid, todayISO, addDays, sum } from './budget-logic.js';
import { getDay, dayOf, WORKOUTS, ageOf } from './health-logic.js';

const r1 = (n) => Math.round(n * 10) / 10;
const mondayOf = (iso) => addDays(iso, -((new Date(`${iso}T12:00:00`).getDay() + 6) % 7));

// ---------------------------------------------------------------- heart-rate zones
// Zones as a share of max heart rate: 1 = 50–60%, 2 = 60–70%, 3 = 70–80%, 4 = 80–90%, 5 = 90%+.
export const ZONES = [
  ['Z1', 'Easy', 0.5],
  ['Z2', 'Aerobic', 0.6],
  ['Z3', 'Tempo', 0.7],
  ['Z4', 'Threshold', 0.8],
  ['Z5', 'Max', 0.9],
];
// Max heart rate: what you set, else 208 − 0.7 × age (Tanaka), else 185.
export function maxHr(health) {
  const set = Number(health && health.maxHr);
  if (set >= 120 && set <= 230) return Math.round(set);
  const age = health ? ageOf(health.profile || {}) : null;
  return age ? Math.round(208 - 0.7 * age) : 185;
}
export const zoneOf = (bpm, max) => {
  const f = bpm / max;
  let z = 0;
  ZONES.forEach(([, , lo], i) => {
    if (f >= lo) z = i + 1;
  });
  return z; // 0 = below zone 1
};
// Minutes in each zone for one workout: [z1…z5] plus below, from the histogram, else from the average heart rate.
export function zonesOf(w, max) {
  if (w.hb && w.hb.length > 1) {
    const out = [0, 0, 0, 0, 0];
    let below = 0;
    const start = w.hb[0];
    for (let i = 1; i < w.hb.length; i++) {
      const bpm = start + (i - 1) * 5 + 2.5;
      const z = zoneOf(bpm, max);
      if (z) out[z - 1] += w.hb[i];
      else below += w.hb[i];
    }
    return { mins: out.map(r1), below: r1(below), est: false };
  }
  if (w.hr && w.min) {
    const out = [0, 0, 0, 0, 0];
    const z = zoneOf(w.hr, max);
    if (z) out[z - 1] = w.min;
    return { mins: out, below: z ? 0 : w.min, est: true };
  }
  return null;
}
// Training load (Edwards' TRIMP): minutes × zone number. Without heart rate, minutes × a typical effort for the sport.
const EFFORT = { walk: 1, hike: 1.5, yoga: 1, cooldown: 0.5, golf: 1, weights: 2, core: 2, tennis: 2.5, pickleball: 2, bike: 2.5, elliptical: 2.5, swim: 2.5, row: 2.5, dance: 2, stairs: 3, run: 3, hiit: 3.5, basketball: 3, soccer: 3, other: 2 };
export function loadOf(w, max) {
  const min = Number(w.min != null ? w.min : w.minutes) || 0;
  const z = w.hb || w.hr ? zonesOf({ ...w, min }, max) : null;
  if (z) return Math.round(z.mins.reduce((s, m, i) => s + m * (i + 1), 0) + z.below * 0.5);
  return Math.round(min * (EFFORT[w.type] || 2));
}
// Every workout on a day: Apple's (hk.workouts) and the ones you logged by hand. Apple's are indexed by day once
// per list, since readiness, load and the monthly report look up many days at a time.
const BY_DAY = new WeakMap();
function appleOn(list, iso) {
  let m = BY_DAY.get(list);
  if (!m) {
    m = new Map();
    for (const w of list) (m.get(w.d) || m.set(w.d, []).get(w.d)).push(w);
    BY_DAY.set(list, m);
  }
  return m.get(iso) || [];
}
export function workoutsFor(ctx, iso) {
  const apple = ctx.hk && ctx.hk.workouts ? appleOn(ctx.hk.workouts, iso) : [];
  const own = getDay(ctx.years || {}, iso).workouts.map((w) => ({ ...w, d: iso, min: w.minutes, own: true }));
  return [...apple, ...own];
}
export function dayLoad(ctx, iso, max = maxHr(ctx.health)) {
  return sum(workoutsFor(ctx, iso), (w) => loadOf(w, max));
}
// This week (last 7 days) against the 4 weeks before it, plus 12 weeks of weekly totals for a chart.
export function trainingLoad(ctx, today = todayISO(), weeks = 12) {
  const max = maxHr(ctx.health);
  const cache = {};
  const L = (iso) => (cache[iso] != null ? cache[iso] : (cache[iso] = dayLoad(ctx, iso, max)));
  let acute = 0;
  for (let i = 0; i < 7; i++) acute += L(addDays(today, -i));
  let chronic = 0;
  for (let i = 7; i < 35; i++) chronic += L(addDays(today, -i));
  chronic /= 4;
  const series = [];
  const m0 = mondayOf(today);
  for (let k = weeks - 1; k >= 0; k--) {
    const start = addDays(m0, -7 * k);
    let v = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (d <= today) v += L(d);
    }
    series.push({ t: start, v, week: true });
  }
  const zones = [0, 0, 0, 0, 0];
  for (let i = 0; i < 7; i++) {
    for (const w of workoutsFor(ctx, addDays(today, -i))) {
      const z = zonesOf(w, max);
      if (z) z.mins.forEach((m, j) => (zones[j] += m));
    }
  }
  const ratio = chronic > 0 ? acute / chronic : null;
  let state = null;
  if (ratio != null) state = ratio > 1.5 ? 'spike' : ratio > 1.3 ? 'high' : ratio < 0.8 ? 'low' : 'steady';
  return { acute, chronic: Math.round(chronic), ratio: ratio != null ? Math.round(ratio * 100) / 100 : null, state, series, zones: zones.map(r1), max };
}
export const LOAD_TEXT = {
  spike: 'A big jump over your usual. Injury risk rises with sudden spikes; ease back or build up over a few weeks.',
  high: 'Above your usual. Fine for a week or two; plan an easier week after.',
  steady: 'In your usual range: a good place to build from.',
  low: 'Lighter than your usual. Good for recovery; fitness slips if it stays low for weeks.',
};

// ---------------------------------------------------------------- strength log
export const GROUPS = [
  ['chest', 'Chest'],
  ['back', 'Back'],
  ['legs', 'Legs'],
  ['shoulders', 'Shoulders'],
  ['arms', 'Arms'],
  ['core', 'Core'],
];
export const EXERCISES = [
  ['bench', 'Bench press', 'chest'],
  ['incline', 'Incline dumbbell press', 'chest'],
  ['fly', 'Chest fly', 'chest'],
  ['squat', 'Back squat', 'legs'],
  ['legpress', 'Leg press', 'legs'],
  ['rdl', 'Romanian deadlift', 'legs'],
  ['lunge', 'Lunges', 'legs'],
  ['legcurl', 'Leg curl', 'legs'],
  ['calf', 'Calf raise', 'legs'],
  ['deadlift', 'Deadlift', 'back'],
  ['row', 'Barbell row', 'back'],
  ['pulldown', 'Lat pulldown', 'back'],
  ['pullup', 'Pull-ups', 'back'],
  ['cablerow', 'Seated cable row', 'back'],
  ['ohp', 'Overhead press', 'shoulders'],
  ['lateral', 'Lateral raise', 'shoulders'],
  ['facepull', 'Face pull', 'shoulders'],
  ['curl', 'Biceps curl', 'arms'],
  ['hammer', 'Hammer curl', 'arms'],
  ['pushdown', 'Triceps pushdown', 'arms'],
  ['dips', 'Dips', 'arms'],
  ['plank', 'Plank (seconds)', 'core'],
  ['crunch', 'Cable crunch', 'core'],
].map(([id, name, group]) => ({ id, name, group }));
export function exercises(h) {
  const custom = (h && h.strength && h.strength.custom) || [];
  return [...EXERCISES, ...custom];
}
export const exerciseOf = (h, id) => exercises(h).find((e) => e.id === id) || { id, name: 'Exercise', group: 'other' };
export function strengthOf(h) {
  h.strength = h.strength && typeof h.strength === 'object' ? h.strength : {};
  h.strength.custom = h.strength.custom || [];
  h.strength.routines = h.strength.routines || [];
  return h.strength;
}
export function addExercise(h, name, group) {
  const n = String(name || '').trim();
  if (!n) return null;
  const s = strengthOf(h);
  const hit = exercises(h).find((e) => e.name.toLowerCase() === n.toLowerCase());
  if (hit) return hit;
  const e = { id: `x${uid()}`, name: n, group: GROUPS.some((g) => g[0] === group) ? group : 'other' };
  s.custom.push(e);
  return e;
}
export function saveRoutine(h, name, ex, id) {
  const s = strengthOf(h);
  const r = { id: id || uid(), name: String(name || '').trim() || 'Routine', ex: [...new Set(ex)] };
  const i = s.routines.findIndex((x) => x.id === r.id);
  if (i >= 0) s.routines[i] = r;
  else s.routines.push(r);
  return r;
}
export function removeRoutine(h, id) {
  const s = strengthOf(h);
  s.routines = s.routines.filter((r) => r.id !== id);
}

const liftsOf = (d) => (d.lifts = d.lifts || []);
export function addLift(yearDoc, iso, ex) {
  const d = dayOf(yearDoc, iso);
  const have = liftsOf(d).find((l) => l.ex === ex);
  if (have) return have;
  const l = { id: uid(), ex, sets: [] };
  d.lifts.push(l);
  return l;
}
export function startRoutine(yearDoc, iso, routine) {
  routine.ex.forEach((ex) => addLift(yearDoc, iso, ex));
}
export function addSet(yearDoc, iso, liftId, set) {
  const l = liftsOf(dayOf(yearDoc, iso)).find((x) => x.id === liftId);
  const r = Math.round(Number(set.r));
  const lb = Math.round(Number(set.lb || 0) * 10) / 10;
  if (!l || !(r > 0) || !(lb >= 0)) return false;
  l.sets.push({ r, lb });
  return true;
}
export function copySets(yearDoc, iso, liftId, sets) {
  const l = liftsOf(dayOf(yearDoc, iso)).find((x) => x.id === liftId);
  if (l) sets.forEach((s) => l.sets.push({ r: s.r, lb: s.lb }));
}
export function removeSet(yearDoc, iso, liftId, i) {
  const l = liftsOf(dayOf(yearDoc, iso)).find((x) => x.id === liftId);
  if (l) l.sets.splice(i, 1);
}
export function removeLift(yearDoc, iso, liftId) {
  const d = dayOf(yearDoc, iso);
  d.lifts = liftsOf(d).filter((l) => l.id !== liftId);
}
// Estimated one-rep max (Epley). Sets above 12 reps say little about a max, so they count as their weight.
export const e1rm = (s) => (s.r <= 1 ? s.lb : s.r > 12 ? s.lb : Math.round(s.lb * (1 + s.r / 30) * 10) / 10);
export const lifts = (years, iso) => (getDay(years, iso).lifts || []).filter((l) => l && l.ex);
// Every session of one exercise, oldest first: date, sets, best estimated max, heaviest weight, volume.
export function history(years, ex) {
  const out = [];
  for (const y of Object.keys(years || {}).sort()) {
    const days = years[y].days || {};
    for (const iso of Object.keys(days).sort()) {
      for (const l of days[iso].lifts || []) {
        if (l.ex !== ex || !l.sets || !l.sets.length) continue;
        const best = Math.max(...l.sets.map(e1rm));
        out.push({ date: iso, sets: l.sets, best, top: Math.max(...l.sets.map((s) => s.lb)), reps: sum(l.sets, (s) => s.r), volume: sum(l.sets, (s) => s.r * s.lb) });
      }
    }
  }
  return out;
}
export function lastSession(years, ex, before) {
  const h = history(years, ex).filter((s) => s.date < before);
  return h.length ? h[h.length - 1] : null;
}
// Personal records: a session whose best estimated max beats every earlier one (the first session doesn't count).
export function prs(years, from = '0000', to = '9999') {
  const out = [];
  const exs = new Set();
  for (const y of Object.values(years || {})) for (const d of Object.values(y.days || {})) (d.lifts || []).forEach((l) => exs.add(l.ex));
  for (const ex of exs) {
    let best = null;
    for (const s of history(years, ex)) {
      if (best != null && s.best > best && s.date >= from && s.date <= to) {
        const set = s.sets.reduce((a, b) => (e1rm(b) > e1rm(a) ? b : a));
        out.push({ date: s.date, ex, best: s.best, prev: best, set });
      }
      if (best == null || s.best > best) best = s.best;
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
// Hard sets and pounds moved per muscle group for the week starting Monday `start`.
export function weeklyVolume(h, years, start) {
  const out = {};
  for (let i = 0; i < 7; i++) {
    for (const l of lifts(years, addDays(start, i))) {
      const g = exerciseOf(h, l.ex).group;
      const o = (out[g] = out[g] || { sets: 0, volume: 0 });
      o.sets += l.sets.length;
      o.volume += sum(l.sets, (s) => s.r * s.lb);
    }
  }
  return out;
}
export function strengthDays(years, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (lifts(years, d).some((l) => l.sets.length)) out.push(d);
  return out;
}

// ---------------------------------------------------------------- tennis
export const TENNIS_KINDS = [
  ['singles', 'Singles'],
  ['doubles', 'Doubles'],
  ['practice', 'Practice / hitting'],
  ['lesson', 'Lesson'],
];
// Sessions: Apple Watch tennis workouts plus tennis you logged by hand, with your notes attached.
export function tennisSessions(ctx, from = '0000', to = '9999') {
  const notes = (ctx.health && ctx.health.tennis) || {};
  const apple = ((ctx.hk && ctx.hk.workouts) || []).filter((w) => w.type === 'tennis' && w.d >= from && w.d <= to).map((w) => ({ id: w.id, d: w.d, t: w.t, min: w.min, kcal: w.kcal, hr: w.hr, hb: w.hb, src: 'apple', w }));
  const own = [];
  for (const y of Object.values(ctx.years || {})) {
    for (const [iso, d] of Object.entries(y.days || {})) {
      if (iso < from || iso > to) continue;
      (d.workouts || []).filter((w) => w.type === 'tennis').forEach((w) => own.push({ id: w.id, d: iso, min: w.minutes, src: 'own', w: { ...w, min: w.minutes, d: iso } }));
    }
  }
  return [...apple, ...own].map((s) => ({ ...s, note: notes[s.id] || null })).sort((a, b) => (a.d + (a.t || '') < b.d + (b.t || '') ? 1 : -1));
}
export function setTennisNote(h, id, note) {
  h.tennis = h.tennis && typeof h.tennis === 'object' ? h.tennis : {};
  const clean = {
    kind: TENNIS_KINDS.some((k) => k[0] === note.kind) ? note.kind : '',
    partner: String(note.partner || '').trim().slice(0, 60),
    score: String(note.score || '').trim().slice(0, 40),
    result: note.result === 'W' || note.result === 'L' ? note.result : '',
    note: String(note.note || '').trim().slice(0, 300),
  };
  if (Object.values(clean).every((v) => !v)) delete h.tennis[id];
  else h.tennis[id] = clean;
}
export function tennisSummary(ctx, today = todayISO(), months = 12) {
  const [y, m] = today.split('-').map(Number);
  const keys = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const all = tennisSessions(ctx, `${keys[0]}-01`, today);
  const byMonth = Object.fromEntries(keys.map((k) => [k, 0]));
  all.forEach((s) => {
    const k = s.d.slice(0, 7);
    if (k in byMonth) byMonth[k] += (s.min || 0) / 60;
  });
  const thisMonth = today.slice(0, 7);
  const lastMonth = keys[keys.length - 2];
  const year = all.filter((s) => s.d.slice(0, 4) === today.slice(0, 4));
  const w = year.filter((s) => s.note && s.note.result === 'W').length;
  const l = year.filter((s) => s.note && s.note.result === 'L').length;
  const partners = {};
  year.forEach((s) => {
    const p = s.note && s.note.partner;
    if (p) partners[p] = (partners[p] || 0) + 1;
  });
  return {
    sessions: all,
    months: keys.map((k) => ({ t: k, v: Math.round(byMonth[k] * 10) / 10, month: true })),
    hoursThis: Math.round(byMonth[thisMonth] * 10) / 10,
    hoursLast: lastMonth ? Math.round(byMonth[lastMonth] * 10) / 10 : 0,
    countThis: all.filter((s) => s.d.slice(0, 7) === thisMonth).length,
    record: { w, l },
    partners: Object.entries(partners).sort((a, b) => b[1] - a[1]),
  };
}
export const workoutName = (type) => (WORKOUTS.find((t) => t[0] === type) || [type, type])[1];
export { mondayOf };
