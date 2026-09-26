// Apple Health data in the dashboard. Imported summaries live in their own owner-only documents, separate from what
// you type in, so a re-import never touches your food log or manual entries:
//   trackers/<doc>-health-hk           summary: monthly averages, workouts, readings (VO2 max, body composition…), ECG list
//   trackers/<doc>-health-hk-<year>    that year's daily numbers (steps, rings, heart, sleep, walking, sound…)
//   trackers/<doc>-health-hk-ecg       ECG traces (loaded only when you open one)
//   trackers/<doc>-health-hk-routes    workout routes (loaded only when you open a workout)
import { todayISO, addDays } from './budget-logic.js';

export const defaultHk = () => ({ version: 1, importedAt: null, exportDate: null, first: null, last: null, months: {}, workouts: [], body: [], vo2: [], steady: [], walk6: [], hrr: [], audiogram: null, ecg: [], sleepGoal: null, me: {} });
export function normalizeHk(d) {
  const b = defaultHk();
  if (!d || typeof d !== 'object') return b;
  const arr = (x) => (Array.isArray(x) ? x : []);
  return { ...b, ...d, months: d.months && typeof d.months === 'object' ? d.months : {}, workouts: arr(d.workouts), body: arr(d.body), vo2: arr(d.vo2), steady: arr(d.steady), walk6: arr(d.walk6), hrr: arr(d.hrr), ecg: arr(d.ecg), me: d.me || {} };
}
export const defaultHkYear = () => ({ version: 1, days: {} });
export function normalizeHkYear(d) {
  if (!d || typeof d !== 'object') return defaultHkYear();
  return { version: 1, days: d.days && typeof d.days === 'object' ? d.days : {} };
}
export const hasHk = (hk) => !!(hk && hk.importedAt);

// ---------------------------------------------------------------- reading days
export const hkDay = (hkYears, iso) => {
  const y = hkYears && hkYears[iso.slice(0, 4)];
  return (y && y.days[iso]) || null;
};
// Steps for a day: the larger of what you typed and what Apple Health counted (a partial day may be in the export).
export function stepsFor(day, hd) {
  const a = Number(day && day.steps) || 0;
  const b = Number(hd && hd.st) || 0;
  if (!a && !b) return { steps: null, src: null };
  return b >= a ? { steps: b, src: 'apple' } : { steps: a, src: 'manual' };
}
export const workoutsOn = (hk, iso) => (hk ? hk.workouts.filter((w) => w.d === iso) : []);

export function ringsOf(hd) {
  if (!hd || hd.sh == null) return null;
  const moveGoal = hd.mtg ? hd.mtg : hd.mg;
  const move = hd.mtg ? hd.mt : hd.ae;
  return {
    move,
    moveGoal,
    moveUnit: hd.mtg ? 'min' : 'cal',
    ex: hd.ex || 0,
    exGoal: hd.eg || 30,
    stand: hd.sh || 0,
    standGoal: hd.sg || 12,
    closed: [moveGoal > 0 && move >= moveGoal, (hd.ex || 0) >= (hd.eg || 30), (hd.sh || 0) >= (hd.sg || 12)],
  };
}

// Every loaded day in date order between two dates (inclusive).
export function daysBetween(hkYears, from, to) {
  const out = [];
  if (!hkYears) return out;
  for (let iso = from; iso <= to; iso = addDays(iso, 1)) {
    const d = hkDay(hkYears, iso);
    out.push({ iso, d });
  }
  return out;
}

// Pull one number out of a day. Keys with a dot reach into sleep: 'sl.a' = minutes asleep.
export function pick(d, key) {
  if (!d) return null;
  if (key.startsWith('sl.')) {
    const s = d.sl;
    const v = s ? s[key.slice(3)] : null;
    return v == null ? null : v;
  }
  if (key === 'sl') return d.sl && d.sl.a ? d.sl.a : null;
  const v = d[key];
  return v == null ? null : v;
}

// ---------------------------------------------------------------- monthly averages (for the "All" views)
const MONTH_AVG = ['st', 'di', 'fl', 'ae', 'ab', 'ex', 'sh', 'dl', 'rhr', 'hrv', 'whr', 'ha', 'o2', 'rr', 'ws', 'wl', 'wd', 'wa', 'su', 'sd', 'hp', 'hpm', 'en'];
const MONTH_SUM = ['hre', 'lre', 'ire', 'lde', 'hpe', 'hw', 'cy', 'mm'];
const rnd = (v, k) => (['di', 'o2', 'rr', 'ws', 'wl', 'wd', 'wa', 'su', 'sd', 'cy'].includes(k) ? Math.round(v * 100) / 100 : Math.round(v));
export function monthsFrom(days) {
  const acc = {};
  for (const iso in days) {
    const d = days[iso];
    const m = iso.slice(0, 7);
    const a = (acc[m] = acc[m] || { sums: {}, ns: {}, rings: [0, 0, 0, 0], sl: { a: [0, 0], c: [0, 0], d: [0, 0], r: [0, 0], s: [0, 0], e: [0, 0] } });
    for (const k of MONTH_AVG) {
      if (d[k] != null) {
        a.sums[k] = (a.sums[k] || 0) + d[k];
        a.ns[k] = (a.ns[k] || 0) + 1;
      }
    }
    for (const k of MONTH_SUM) if (d[k]) a.sums[k] = (a.sums[k] || 0) + d[k];
    const r = ringsOf(d);
    if (r) {
      a.rings[3]++;
      r.closed.forEach((c, i) => c && a.rings[i]++);
    }
    if (d.sl && d.sl.a >= 120) {
      for (const k of ['a', 'c', 'd', 'r', 's', 'e']) {
        if (d.sl[k] != null) {
          a.sl[k][0] += d.sl[k];
          a.sl[k][1]++;
        }
      }
    }
  }
  const out = {};
  for (const m in acc) {
    const a = acc[m];
    const o = {};
    for (const k of MONTH_AVG) if (a.ns[k]) o[k] = rnd(a.sums[k] / a.ns[k], k);
    for (const k of MONTH_SUM) if (a.sums[k]) o[k] = rnd(a.sums[k], k);
    if (a.rings[3]) o.rings = a.rings;
    const sl = {};
    for (const k in a.sl) if (a.sl[k][1]) sl[k] = Math.round(a.sl[k][0] / a.sl[k][1]);
    if (sl.a) o.sl = { ...sl, n: a.sl.a[1] };
    if (o.st != null) o.stn = a.ns.st;
    out[m] = o;
  }
  return out;
}
// Months from the import, refreshed from whatever days are loaded (so a later sync shows up).
export function allMonths(hk, hkYears) {
  const out = { ...((hk && hk.months) || {}) };
  if (hkYears) {
    const days = {};
    Object.values(hkYears).forEach((y) => Object.assign(days, y.days));
    Object.assign(out, monthsFrom(days));
  }
  return out;
}
export function monthPick(m, key) {
  if (!m) return null;
  if (key === 'sl' || key === 'sl.a') return m.sl ? m.sl.a : null;
  if (key.startsWith('sl.')) return m.sl ? m.sl[key.slice(3)] ?? null : null;
  return m[key] ?? null;
}

// ---------------------------------------------------------------- series for charts
// range: 30 | 90 | 365 | 'all'. Returns [{ t: iso or 'YYYY-MM', v }] — daily for up to a year, monthly for all time.
export function seriesOf(hk, hkYears, key, range, today = todayISO()) {
  if (range === 'all') {
    const months = allMonths(hk, hkYears);
    return Object.keys(months)
      .sort()
      .map((m) => ({ t: m, v: monthPick(months[m], key), month: true }))
      .filter((p) => p.v != null);
  }
  const from = addDays(today, -range + 1);
  return daysBetween(hkYears, from, today)
    .map(({ iso, d }) => ({ t: iso, v: pick(d, key) }))
    .filter((p) => p.v != null);
}
// Latest reading of a daily key: from loaded days, then from monthly averages.
export function latestOf(hk, hkYears, key, today = todayISO()) {
  if (hkYears) {
    const years = Object.keys(hkYears).sort().reverse();
    for (const y of years) {
      const ds = Object.keys(hkYears[y].days)
        .filter((d) => d <= today)
        .sort()
        .reverse();
      for (const iso of ds) {
        const v = pick(hkYears[y].days[iso], key);
        if (v != null) return { iso, v };
      }
    }
  }
  const months = (hk && hk.months) || {};
  const ms = Object.keys(months).sort().reverse();
  for (const m of ms) {
    const v = monthPick(months[m], key);
    if (v != null) return { iso: `${m}-15`, v, month: true };
  }
  return null;
}
export function stats(points) {
  const vals = points.map((p) => p.v).filter((v) => v != null);
  if (!vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return { n: vals.length, avg: sum / vals.length, min: Math.min(...vals), max: Math.max(...vals), sum };
}
// Weekly averages (for one-year bar charts).
export function weekly(points) {
  const out = [];
  let cur = null;
  for (const p of points) {
    const d = new Date(`${p.t}T12:00:00`);
    const monday = addDays(p.t, -((d.getDay() + 6) % 7));
    if (!cur || cur.t !== monday) {
      cur = { t: monday, sum: 0, n: 0, week: true };
      out.push(cur);
    }
    cur.sum += p.v;
    cur.n++;
  }
  return out.map((w) => ({ t: w.t, v: w.sum / w.n, week: true, n: w.n }));
}

// ---------------------------------------------------------------- sleep
export const fmtMins = (m) => {
  if (m == null) return '—';
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`;
};
// Minutes after midnight (negative = evening before) → "11:42 pm".
export function clock(m) {
  if (m == null) return '—';
  let x = Math.round(m) % 1440;
  if (x < 0) x += 1440;
  const h = Math.floor(x / 60);
  const mm = x % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
export function nightsWithSleep(hkYears) {
  const out = [];
  if (!hkYears) return out;
  for (const y of Object.values(hkYears)) for (const iso in y.days) if (y.days[iso].sl && y.days[iso].sl.a) out.push(iso);
  return out.sort();
}

// ---------------------------------------------------------------- import
// Turns a parsed export (see apple-health.js) into the changes for each document. Days in the file replace the
// same days already saved; everything else already saved is kept.
export function planImport(bundle) {
  const years = {};
  for (const iso in bundle.days) (years[iso.slice(0, 4)] = years[iso.slice(0, 4)] || {})[iso] = bundle.days[iso];
  const months = monthsFrom(bundle.days);
  const mergeBy = (old, add, key) => {
    const m = new Map((old || []).map((x) => [key(x), x]));
    (add || []).forEach((x) => m.set(key(x), x));
    return [...m.values()].sort((a, b) => (key(a) < key(b) ? -1 : 1));
  };
  return {
    years: Object.fromEntries(
      Object.entries(years).map(([y, days]) => [
        y,
        (doc) => {
          doc.days = { ...(doc.days || {}), ...days };
        },
      ])
    ),
    main(doc) {
      Object.assign(doc, {
        importedAt: Date.now(),
        exportDate: bundle.exportDate,
        first: doc.first && doc.first < bundle.first ? doc.first : bundle.first,
        last: doc.last && doc.last > bundle.last ? doc.last : bundle.last,
        months: { ...(doc.months || {}), ...months },
        workouts: mergeBy(doc.workouts, bundle.workouts, (w) => w.id),
        body: mergeBy(doc.body, bundle.body, (x) => x.date),
        vo2: mergeBy(doc.vo2, bundle.vo2, (x) => x[0]),
        steady: mergeBy(doc.steady, bundle.steady, (x) => x[0]),
        walk6: mergeBy(doc.walk6, bundle.walk6, (x) => x[0]),
        hrr: mergeBy(doc.hrr, bundle.hrr, (x) => x[0]),
        audiogram: bundle.audiogram || doc.audiogram || null,
        ecg: mergeBy(doc.ecg, bundle.ecg, (x) => x.id),
        sleepGoal: bundle.sleepGoal || doc.sleepGoal || null,
        me: { ...(doc.me || {}), ...bundle.me },
      });
    },
    ecg(doc) {
      doc.traces = { ...(doc.traces || {}), ...(bundle.ecgTraces || {}) };
    },
    routes(doc) {
      doc.routes = { ...(doc.routes || {}), ...(bundle.routes || {}) };
    },
    // Your main health document: weigh-ins you didn't already have, and profile blanks filled in.
    health(h) {
      const have = new Set(h.weights.map((w) => w.date));
      let added = 0;
      // Skip weigh-ins far from your usual weight (typed by mistake, or someone else on the scale).
      const all = [...(bundle.weights || []).map((w) => w.lb), ...h.weights.map((w) => Number(w.lb))].filter((x) => x > 0).sort((a, b) => a - b);
      const median = all.length ? all[Math.floor(all.length / 2)] : null;
      const skipped = [];
      for (const w of bundle.weights || []) {
        if (median && Math.abs(w.lb - median) / median > 0.35) {
          skipped.push(w);
          continue;
        }
        if (!have.has(w.date) && w.lb > 50 && w.lb < 700) {
          h.weights.push({ date: w.date, lb: w.lb, src: 'apple' });
          added++;
        }
      }
      h.weights.sort((a, b) => (a.date < b.date ? -1 : 1));
      const filled = [];
      const me = bundle.me || {};
      if (!h.profile.sex && (me.sex === 'male' || me.sex === 'female')) {
        h.profile.sex = me.sex;
        filled.push('sex');
      }
      if (me.dob && !h.profile.dob) {
        h.profile.dob = me.dob;
        if (!Number(h.profile.age)) filled.push('age');
        h.profile.age = ageFrom(me.dob);
      }
      if (!Number(h.profile.heightIn) && me.heightIn) {
        h.profile.heightIn = Math.round(me.heightIn);
        filled.push('height');
      }
      return { added, filled, skipped };
    },
    summary: {
      days: Object.keys(bundle.days).length,
      years: Object.keys(years).sort(),
      workouts: bundle.workouts.length,
      weights: (bundle.weights || []).length,
      ecg: (bundle.ecg || []).length,
      routes: Object.keys(bundle.routes || {}).length,
      nights: Object.values(bundle.days).filter((d) => d.sl && d.sl.a).length,
    },
  };
}
export function ageFrom(dob, today = todayISO()) {
  if (!dob) return null;
  let a = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  if (today.slice(5) < dob.slice(5, 10)) a--;
  return a > 0 && a < 120 ? a : null;
}
