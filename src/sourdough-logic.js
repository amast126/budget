// Sourdough corner (a section of the Cooking tab): the starter's feedings and when it should peak, a bake planner
// that works back from when you want bread, a dough calculator in baker's percentages, and a bake log.
// Saved in trackers/<doc>-sourdough. Times are rules of thumb: warmth speeds everything up, cold slows it down,
// so the numbers scale with room temperature (roughly twice as fast for every 17°F warmer).
import { uid, todayISO } from './budget-logic.js';

const HOUR = 3600000;
export const RATIOS = ['1:1:1', '1:2:2', '1:3:3', '1:5:5', '1:10:10'];
// Hours from feeding to peak at 75°F, by starter:flour:water.
const PEAK_AT_75 = { '1:1:1': 5, '1:2:2': 7, '1:3:3': 8.5, '1:5:5': 11, '1:10:10': 14 };
export const tempFactor = (f) => Math.pow(2, (75 - (Number(f) || 75)) / 17);
export const peakHours = (ratio, tempF) => (PEAK_AT_75[ratio] || 6) * tempFactor(tempF);

export function defaultSourdough() {
  return {
    version: 1,
    starter: { name: '', where: 'counter', ratio: '1:1:1', temp: 72, feeds: [] },
    calc: { loaves: 1, flour: 500, hydration: 75, levain: 20, salt: 2, adjust: false },
    plan: { ready: '', temp: 72, retard: true },
    bakes: [],
  };
}
export function normalizeSourdough(d) {
  const base = defaultSourdough();
  if (!d || typeof d !== 'object') return base;
  const s = d.starter && typeof d.starter === 'object' ? d.starter : {};
  return {
    version: 1,
    starter: {
      name: String(s.name || ''),
      where: s.where === 'fridge' ? 'fridge' : 'counter',
      ratio: RATIOS.includes(s.ratio) ? s.ratio : base.starter.ratio,
      temp: Number(s.temp) > 40 && Number(s.temp) < 100 ? Number(s.temp) : base.starter.temp,
      feeds: Array.isArray(s.feeds) ? s.feeds.filter((f) => f && f.at) : [],
    },
    calc: { ...base.calc, ...(d.calc && typeof d.calc === 'object' ? d.calc : {}) },
    plan: { ...base.plan, ...(d.plan && typeof d.plan === 'object' ? d.plan : {}) },
    bakes: Array.isArray(d.bakes) ? d.bakes.filter((b) => b && b.date) : [],
    updatedAt: d.updatedAt,
  };
}

// ---------------------------------------------------------------- starter
export function feed(d, at = new Date(), note = '') {
  const f = { id: uid(), at: at.toISOString(), ratio: d.starter.ratio, where: d.starter.where, note: String(note || '').trim() };
  d.starter.feeds.push(f);
  d.starter.feeds = d.starter.feeds.slice(-120);
  return f;
}
export function removeFeed(d, id) {
  d.starter.feeds = d.starter.feeds.filter((f) => f.id !== id);
}
export const lastFeed = (d) => {
  const f = d.starter.feeds;
  return f.length ? [...f].sort((a, b) => (a.at < b.at ? -1 : 1))[f.length - 1] : null;
};
// Where the starter is in its rise: from the last feeding, its ratio, and the room temperature.
export function starterState(d, now = new Date()) {
  const f = lastFeed(d);
  if (!f) return { state: 'none', text: 'No feedings logged yet' };
  const since = (now - new Date(f.at)) / HOUR;
  if ((f.where || d.starter.where) === 'fridge') {
    const days = since / 24;
    return {
      state: days > 7 ? 'hungry' : 'resting',
      since,
      text: days > 7 ? `In the fridge, last fed ${Math.floor(days)} days ago. Time for its weekly feed.` : `Resting in the fridge, fed ${days < 1 ? 'today' : `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'} ago`}.`,
      nextFeed: new Date(new Date(f.at).getTime() + 7 * 24 * HOUR),
    };
  }
  const peak = peakHours(f.ratio || d.starter.ratio, d.starter.temp);
  const from = new Date(new Date(f.at).getTime() + peak * 0.8 * HOUR);
  const to = new Date(new Date(f.at).getTime() + peak * 1.2 * HOUR);
  const frac = since / peak;
  const state = since >= 24 ? 'hungry' : frac < 0.8 ? 'rising' : frac <= 1.2 ? 'peak' : 'falling';
  const text = {
    rising: 'Rising',
    peak: 'Around its peak: use it now',
    falling: 'Past its peak and falling. Feed it before you use it.',
    hungry: 'Hungry: it’s been a day since its last feed',
  }[state];
  return { state, since, peak, from, to, frac: Math.min(1.5, frac), text };
}

// ---------------------------------------------------------------- bake planner
// Every step from feeding the levain to bread out of the oven, worked back from `ready` ("2026-10-03T17:00").
// The cold proof can run 8 to 16 hours and the levain can be fed at different ratios, so the planner picks the
// combination that keeps the hands-on steps between 7 AM and 11 PM (closest to a 12-hour proof and a 1:2:2 feed).
const LEVAIN = { '1:1:1': [50, 50, 50], '1:2:2': [25, 50, 50], '1:5:5': [10, 50, 50], '1:10:10': [5, 50, 50] };
const awakeAt = (d) => d.getHours() >= 7 && d.getHours() + d.getMinutes() / 60 <= 23;
export function bakePlan({ ready, temp = 72, retard = true } = {}) {
  if (!ready || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ready)) return null;
  const end = new Date(ready);
  if (isNaN(end)) return null;
  const k = tempFactor(temp);
  // times land on 5-minute marks (the bake itself stays exactly when you asked)
  const at = (t, h) => new Date(Math.round((t.getTime() - h * HOUR) / 300000) * 300000);
  const bakeStart = at(end, 0.75);
  const preheat = at(bakeStart, 1);
  const bulkH = 5 * k;
  const build = (proofH, ratio) => {
    const proofStart = at(bakeStart, proofH);
    const shape = at(proofStart, 0.5);
    const bulkStart = at(shape, bulkH);
    const autolyse = at(bulkStart, 0.75);
    const levainH = peakHours(ratio, temp);
    const levain = at(bulkStart, levainH);
    const g = LEVAIN[ratio];
    return {
      proofH,
      levain,
      steps: [
        { id: 'levain', at: levain, title: 'Build the levain', body: `Feed starter ${ratio} (e.g. ${g[0]} g starter, ${g[1]} g flour, ${g[2]} g water). It should peak in about ${Math.round(levainH)} hours.` },
        { id: 'autolyse', at: autolyse, title: 'Autolyse', body: 'Mix the flour and most of the water until no dry bits remain. Cover and rest 45 minutes.' },
        { id: 'mix', at: bulkStart, title: 'Mix in levain and salt', body: `Add the levain, then the salt with the last of the water. Bulk ferments about ${fmtHours(bulkH)} at ${temp}°F.` },
        { id: 'folds', at: new Date(bulkStart.getTime() + 0.5 * HOUR), title: 'Stretch and folds', body: 'Four sets, every 30 minutes, over the first 2 hours. Then leave it alone.' },
        { id: 'shape', at: shape, title: 'Pre-shape and shape', body: 'Bulk is done when the dough has grown about 50%, is domed and jiggly, with bubbles on the sides. Pre-shape, rest 20 minutes, shape into the banneton.' },
        retard
          ? { id: 'fridge', at: proofStart, title: 'Into the fridge', body: `Cold proof, covered, about ${fmtHours(proofH)}. Anywhere from 8 to 16 hours works, so the bake time can slide.` }
          : { id: 'proof', at: proofStart, title: 'Final proof', body: `Covered on the counter, about ${fmtHours(proofH)}. Ready when a floured poke springs back slowly.` },
        { id: 'preheat', at: preheat, title: 'Preheat', body: 'Oven to 500°F with the Dutch oven inside, for a full hour.' },
        { id: 'bake', at: bakeStart, title: 'Score and bake', body: `${retard ? 'Straight from the fridge: ' : ''}score, then 20 minutes lid on at 500°F and 25 minutes lid off at 450°F, until deep brown (about 208°F inside).` },
        { id: 'done', at: end, title: 'Bread’s out', body: 'Cool on a rack at least an hour before slicing.' },
      ],
    };
  };
  const proofs = retard ? [12, 11.5, 12.5, 11, 13, 10.5, 13.5, 10, 14, 9.5, 14.5, 9, 15, 8.5, 15.5, 8, 16] : [2 * k];
  const ratios = ['1:2:2', '1:1:1', '1:5:5', '1:10:10'];
  const hands = ['levain', 'autolyse', 'mix', 'folds', 'shape', 'fridge', 'proof'];
  let pick = null;
  for (const p of proofs) {
    for (const r of ratios) {
      const b = build(p, r);
      if (b.steps.filter((x) => hands.includes(x.id)).every((x) => awakeAt(x.at))) {
        pick = b;
        break;
      }
    }
    if (pick) break;
  }
  const night = !pick;
  if (!pick) pick = build(proofs[0], '1:2:2');
  return {
    steps: pick.steps,
    start: pick.levain,
    end,
    hours: (end - pick.levain) / HOUR,
    proofH: pick.proofH,
    note: night ? (retard ? 'Some steps land overnight at this time. With a cold proof, a bake finishing between 9 and 11 AM fits the day best.' : 'Some steps land overnight at this time. Try a later finish, or the overnight cold proof.') : null,
  };
}
export function fmtHours(h) {
  const whole = Math.floor(h);
  const m = Math.round((h - whole) * 60 / 15) * 15;
  if (m === 60) return `${whole + 1} h`;
  return m ? `${whole} h ${m} min` : `${whole} h`;
}

// ---------------------------------------------------------------- dough calculator
// Baker's percentages of the flour. With `adjust`, the starter's own flour and water (it's 100% hydration) count
// toward the totals, so the dough's true hydration is what you asked for.
export function doughFor({ loaves = 1, flour = 500, hydration = 75, levain = 20, salt = 2, adjust = false } = {}) {
  const F = Math.max(0, Number(loaves) || 0) * Math.max(0, Number(flour) || 0);
  const L = (F * (Number(levain) || 0)) / 100;
  const W = (F * (Number(hydration) || 0)) / 100;
  const S = (F * (Number(salt) || 0)) / 100;
  const out = adjust ? { flour: F - L / 2, water: W - L / 2, levain: L, salt: S } : { flour: F, water: W, levain: L, salt: S };
  const r = (x) => Math.max(0, Math.round(x));
  const res = { flour: r(out.flour), water: r(out.water), levain: r(out.levain), salt: Math.max(0, Math.round(out.salt * 10) / 10) };
  res.total = Math.round(res.flour + res.water + res.levain + res.salt);
  res.perLoaf = loaves > 0 ? Math.round(res.total / loaves) : 0;
  // true hydration including the starter
  const tf = res.flour + res.levain / 2;
  res.trueHydration = tf ? Math.round(((res.water + res.levain / 2) / tf) * 100) : 0;
  return res;
}

// ---------------------------------------------------------------- bake log
export function logBake(d, { date = todayISO(), hydration, rating = 0, notes = '' }) {
  const b = { id: uid(), date, hydration: Number(hydration) || null, rating: Math.max(0, Math.min(5, Number(rating) || 0)), notes: String(notes || '').trim() };
  d.bakes.push(b);
  return b;
}
export function removeBake(d, id) {
  d.bakes = d.bakes.filter((b) => b.id !== id);
}
export function rateBake(d, id, rating) {
  const b = d.bakes.find((x) => x.id === id);
  if (b) b.rating = Math.max(0, Math.min(5, Number(rating) || 0));
}
