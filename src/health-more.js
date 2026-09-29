// More for the Health tab: the daily sync link from an iPhone Shortcut, the morning readiness score, the weight
// goal and smoothed trend, the adaptive calorie target, fiber/sugar/sodium, saved meals, habits, checkups and labs.
// Everything lives in the owner-only Health documents:
//   trackers/<doc>-health          goalWeight, adaptive, checkins, meals, habits, checkups, labs, sync (the link key)
//   trackers/<doc>-health-<year>   each day's habit marks (hb)
//   trackers/<doc>-health-hk-<y>   synced Apple Health numbers go into the same days an import fills
import { uid, todayISO, addDays, sum } from './budget-logic.js';
import { getDay, dayOf, totals, targets, latestWeight, GOALS, ageOf } from './health-logic.js';
import { hkDay, fmtMins } from './hk-logic.js';
import { dayLoad } from './health-training.js';
import { parseSyncText, planSyncText, syncTextSummary } from './health-sync.js';

const r1 = (n) => Math.round(n * 10) / 10;
const n0 = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const daysApart = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric' });

// ---------------------------------------------------------------- the sync link
// The Shortcut opens …/#/health-sync?k=KEY&date=YYYY-MM-DD&steps=…&sleep=… . `date` is the day the activity totals
// belong to (yesterday when it runs in the morning); overnight numbers (sleep, HRV, resting heart rate, weight) go to
// `on`, which defaults to the day the link is opened, since "last night" is the night that ended this morning.
// Exactly one number in the text ("8,123", "172.4 lb"), else null: a leftover [Placeholder] or two values run
// together are skipped rather than saved as something they aren't.
const num = (v) => {
  if (v == null || v === '') return null;
  const m = String(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g);
  if (!m || m.length !== 1) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
};
// The unit a bare number most likely is, for a night's total: hours up to 24, minutes up to a day, else seconds.
export const durationUnit = (v) => {
  const s = String(v == null ? '' : v).trim();
  if (!/^[\d.,]+$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return n <= 24 ? 'h' : n <= 1440 ? 'm' : 's';
};
// "7:12", "7h 12m", "1h05m", "7 hr 12 min", "25920s", or a bare number in `unit` (default: guessed) → minutes
export function parseDuration(v, unit) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  let m = /^(\d+):(\d{1,2})(?::\d{1,2})?$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /(\d+(?:\.\d+)?)\s*h(?:ours?|rs?|r)?(?![a-z])/.exec(s);
  const mm = /(\d+(?:\.\d+)?)\s*m(?:in(?:utes?|s)?)?(?![a-z])/.exec(s);
  if (m || mm) return Math.round((m ? Number(m[1]) * 60 : 0) + (mm ? Number(mm[1]) : 0));
  const sec = /^([\d.]+)\s*s(ec(ond)?s?)?$/.exec(s);
  if (sec) return Math.round(Number(sec[1]) / 60);
  const n = num(s);
  if (n == null) return null;
  const u = unit || durationUnit(s);
  return u === 'h' ? Math.round(n * 60) : u === 's' ? Math.round(n / 60) : Math.round(n);
}
// "23:10", "11:10 PM", "2026-09-27T23:10:00" → minutes after midnight
export function parseClock(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?/i.exec(s.includes('T') ? s.split('T')[1] : s);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3] && m[3].toLowerCase();
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return h >= 0 && h < 24 ? h * 60 + Number(m[2]) : null;
}
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const validDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return y > 2000 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};
export function parseDate(v, fallback) {
  const out = parseDate0(v, fallback);
  return out && out !== fallback && !validDay(out) ? fallback : out;
}
function parseDate0(v, fallback) {
  if (!v) return fallback;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // "Sep 27, 2026" or "September 27, 2026 at 12:00 AM" (a Shortcuts date as text), or "9/27/2026"
  let m = /([A-Za-z]{3,})\.? (\d{1,2}),? (\d{4})/.exec(s);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return ymd(m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, m[2]);
  m = /(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/.exec(s);
  if (m) return ymd(m[3].length === 2 ? `20${m[3]}` : m[3], m[1], m[2]);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return fallback;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// [link name, day key, label, kind, valid range]
export const SYNC_ACTIVITY = [
  ['steps', 'st', 'steps', 'int', [1, 150000]],
  ['dist', 'di', 'miles walked', 'dec', [0.01, 150]],
  ['flights', 'fl', 'flights climbed', 'int', [1, 500]],
  ['active', 'ae', 'active calories', 'int', [1, 8000]],
  ['resting', 'ab', 'resting calories', 'int', [500, 5000]],
  ['exercise', 'ex', 'exercise minutes', 'int', [0, 1440]],
  ['stand', 'sh', 'stand hours', 'int', [0, 24]],
  ['mindful', 'mm', 'mindful minutes', 'int', [1, 1440]],
  ['water', 'wat', 'oz of water', 'int', [1, 400]],
  ['caffeine', 'caf', 'mg of caffeine', 'int', [1, 2000]],
];
export const SYNC_MORNING = [
  ['hrv', 'hrv', 'HRV (ms)', 'int', [5, 300]],
  ['rhr', 'rhr', 'resting heart rate', 'int', [25, 150]],
  ['resp', 'rr', 'breaths a minute', 'dec', [4, 40]],
  ['o2', 'o2', 'blood oxygen %', 'dec', [70, 100]],
];
const inRange = (v, [lo, hi]) => v != null && v >= lo && v <= hi;
export function parseSync(query, today = todayISO()) {
  const q = new URLSearchParams(String(query || '').replace(/^.*?\?/, ''));
  const get = (k) => q.get(k);
  // Version 2: the last few days as text (see health-sync.js).
  if (get('v') === '2' || q.has('d')) {
    const blob = get('d') || '';
    const t = parseSyncText(blob, today);
    return { ...t, key: get('k') || '', dry: get('dry') === '1', link: `v2:${hashText(blob)}`, date: t.last || t.today, on: t.today, onGiven: true, act: {}, morn: {}, sl: null, weight: null };
  }
  const date = parseDate(get('date'), addDays(today, -1));
  const on = parseDate(get('on'), today);
  const act = {};
  const morn = {};
  const skipped = [];
  for (const [k, key, label, kind, range] of SYNC_ACTIVITY) {
    if (!q.has(k) || get(k) === '') continue;
    let v = num(get(k));
    if (kind === 'int' && v != null) v = Math.round(v);
    if (kind === 'dec' && v != null) v = Math.round(v * 100) / 100;
    if (inRange(v, range)) act[key] = v;
    else skipped.push(label);
  }
  for (const [k, key, label, kind, range] of SYNC_MORNING) {
    if (!q.has(k) || get(k) === '') continue;
    let v = num(get(k));
    if (key === 'o2' && v != null && v <= 1) v *= 100;
    if (kind === 'int' && v != null) v = Math.round(v);
    if (kind === 'dec' && v != null) v = Math.round(v * 10) / 10;
    if (inRange(v, range)) morn[key] = v;
    else skipped.push(label);
  }
  let sl = null;
  const a = parseDuration(get('sleep'));
  if (a != null) {
    if (a >= 30 && a <= 16 * 60) {
      sl = { a, src: 'Shortcut' };
      // Bare stage numbers are in the same unit as the night's total (minutes when that isn't clear).
      const unit = durationUnit(get('sleep')) || 'm';
      for (const [k, key] of [
        ['deep', 'd'],
        ['rem', 'r'],
        ['core', 'c'],
        ['awake', 'w'],
      ]) {
        if (!q.has(k) || get(k) === '') continue;
        const v = parseDuration(get(k), unit);
        if (v != null && v >= 0 && v <= a + 240) sl[key] = v;
        else skipped.push(`${k} sleep`);
      }
      const bed = parseClock(get('bed'));
      const wake = parseClock(get('wake'));
      // Bedtime after 6 pm belongs to the evening before (negative minutes), as in the import.
      if (bed != null) sl.s = bed >= 18 * 60 ? bed - 1440 : bed;
      if (wake != null) sl.e = wake >= 18 * 60 ? wake - 1440 : wake;
      if (sl.s != null && sl.e != null) sl.b = Math.max(a, sl.e - sl.s);
    } else skipped.push('sleep');
  }
  let weight = null;
  const lb = num(get('weight'));
  if (lb != null) {
    const unitKg = /kg/i.test(get('weight') || '');
    const v = unitKg ? lb * 2.20462 : lb;
    if (v > 50 && v < 700) weight = { lb: r1(v), date: parseDate(get('weighed'), on) };
    else skipped.push('weight');
  }
  const fat = num(get('fat'));
  if (weight && fat != null && fat > 0 && fat < 70) weight.fat = r1(fat <= 1 ? fat * 100 : fat);
  const mg = num(get('movegoal'));
  if (mg != null && mg > 0 && mg < 5000 && Object.keys(act).length) act.mg = Math.round(mg);
  const count = Object.keys(act).length + Object.keys(morn).length + (sl ? 1 : 0) + (weight ? 1 : 0);
  const norm = new URLSearchParams(q);
  norm.delete('k');
  norm.delete('dry');
  norm.sort();
  return { key: get('k') || '', date, on, onGiven: q.has('on') && !!get('on'), act, morn, sl, weight, skipped, count, dry: q.get('dry') === '1', link: norm.toString() };
}
// The changes to each document. Days keep whatever else is already saved there (an import's heart-rate range, say).
export function planSync(s) {
  if (s.v === 2) return planSyncText(s);
  const years = {};
  const put = (iso, fn) => {
    const y = iso.slice(0, 4);
    const prev = years[y];
    years[y] = (doc) => {
      if (prev) prev(doc);
      doc.days = doc.days || {};
      doc.days[iso] = { ...(doc.days[iso] || {}) };
      fn(doc.days[iso], doc);
    };
  };
  if (Object.keys(s.act).length) put(s.date, (d, doc) => {
    Object.assign(d, s.act, { sy: 1 });
    // Ring goals: the latest ones the import saw (the Shortcut doesn't read them), so the rings still close.
    if (d.sh != null && d.mg == null && d.mtg == null) {
      const prev = Object.keys(doc.days)
        .filter((k) => k < s.date && doc.days[k].mg != null)
        .sort()
        .pop();
      const g = prev ? doc.days[prev] : null;
      if (g) Object.assign(d, { mg: g.mg, eg: d.eg || g.eg || 30, sg: d.sg || g.sg || 12 });
    }
  });
  if (Object.keys(s.morn).length || s.sl) {
    put(s.on, (d) => {
      Object.assign(d, s.morn, { sy: 1 });
      // Keep an imported night with sleep stages unless the Shortcut sent stages too.
      if (s.sl && !(d.sl && d.sl.d != null && s.sl.d == null && d.sl.src !== 'Shortcut')) d.sl = { ...s.sl };
    });
  }
  return {
    years,
    health(h) {
      if (!s.weight) return;
      const at = h.weights.findIndex((w) => w.date === s.weight.date);
      if (at >= 0 && !h.weights[at].src) return; // a weigh-in you typed wins
      const w = { date: s.weight.date, lb: s.weight.lb, src: 'sync' };
      if (at >= 0) h.weights[at] = w;
      else h.weights.push(w);
      h.weights.sort((a, b) => (a.date < b.date ? -1 : 1));
    },
    sync(h, now = Date.now()) {
      h.sync = { ...(h.sync || {}), lastAt: now, lastDate: s.date, lastLink: s.link, count: ((h.sync && h.sync.count) || 0) + 1 };
    },
    main(hk) {
      hk.syncedAt = Date.now();
      const last = [s.date, s.on].sort().pop();
      if (!hk.last || hk.last < last) hk.last = last;
      if (!hk.first) hk.first = s.date;
      if (s.weight && s.weight.fat) {
        hk.body = (hk.body || []).filter((b) => b.date !== s.weight.date);
        hk.body.push({ date: s.weight.date, fat: s.weight.fat, lb: s.weight.lb });
        hk.body.sort((a, b) => (a.date < b.date ? -1 : 1));
      }
    },
  };
}
// A short fingerprint of a link, so opening it again (a reload, Back) is recognized without storing the whole thing.
export function hashText(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const newSyncKey = () => Array.from({ length: 20 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
export function syncTemplate(base, key) {
  const p = ['k=' + key, 'date=[Yesterday]', 'steps=[Steps]', 'active=[Active]', 'resting=[Resting]', 'exercise=[Exercise]', 'stand=[Stand]', 'sleep=[Sleep]', 'bed=[Bedtime]', 'wake=[Wake]', 'hrv=[HRV]', 'rhr=[Resting HR]', 'weight=[Weight]', 'water=[Water]'];
  return `${base}#/health-sync?${p.join('&')}`;
}
export function syncSummary(s) {
  if (s.v === 2) return syncTextSummary(s);
  const bits = [];
  if (s.act.st) bits.push(`${n0(s.act.st)} steps`);
  if (s.act.ae) bits.push(`${n0(s.act.ae)} active cal`);
  if (s.act.ex != null) bits.push(`${s.act.ex} exercise min`);
  if (s.sl) bits.push(`slept ${fmtMins(s.sl.a)}`);
  if (s.morn.hrv) bits.push(`HRV ${s.morn.hrv} ms`);
  if (s.morn.rhr) bits.push(`resting HR ${s.morn.rhr}`);
  if (s.weight) bits.push(`${s.weight.lb} lb`);
  if (s.act.wat) bits.push(`${s.act.wat} oz water`);
  return bits;
}

// ---------------------------------------------------------------- readiness
// A morning read on recovery: last night's sleep against your usual, HRV and resting heart rate against your
// 30-day baseline, and how hard yesterday was against your usual training load. 15–100: a typical morning lands
// around 60 (Normal); 75+ is Ready, under 45 Take it easy.
export const READY = {
  ready: ['Ready', 'Good day for a hard session.'],
  normal: ['Normal', 'Train as planned; no need to push for a PR.'],
  easy: ['Take it easy', 'Keep today light and give sleep a head start tonight.'],
};
function baseline(hkYears, key, today, days = 30) {
  const vals = [];
  for (let i = 1; i <= days; i++) {
    const d = hkDay(hkYears, addDays(today, -i));
    if (!d) continue;
    const v = key === 'sl' ? (d.sl && d.sl.a >= 120 ? d.sl.a : null) : d[key];
    if (v != null) vals.push(v);
  }
  return vals.length >= 7 ? { v: mean(vals), n: vals.length } : null;
}
export function readiness(ctx, today = todayISO()) {
  const hkYears = ctx.hkYears;
  if (!hkYears) return null;
  const t = hkDay(hkYears, today) || {};
  const y = hkDay(hkYears, addDays(today, -1)) || {};
  const sleep = t.sl && t.sl.a >= 120 ? t.sl.a : null;
  const hrv = t.hrv != null ? t.hrv : null;
  const rhr = t.rhr != null ? t.rhr : y.rhr != null ? y.rhr : null;
  if (sleep == null && hrv == null) return null;
  const parts = [];
  const reasons = [];
  if (sleep != null) {
    const b = baseline(hkYears, 'sl', today);
    const set = Number(ctx.health && ctx.health.sleepGoal);
    const goal = set >= 300 && set <= 660 ? set : ctx.hk && ctx.hk.sleepGoal && ctx.hk.sleepGoal.hours ? ctx.hk.sleepGoal.hours * 60 : 450;
    const base = b ? b.v : goal;
    const ratio = sleep / base;
    const s = clamp((ratio - 0.8) / 0.35, 0, 1);
    parts.push({ id: 'sleep', w: 0.35, s });
    const diff = Math.round(base - sleep);
    reasons.push({ s, text: diff >= 25 ? `Slept ${fmtMins(sleep)}, ${fmtMins(diff)} under your usual` : diff <= -25 ? `Slept ${fmtMins(sleep)}, more than your usual ${fmtMins(base)}` : `Slept ${fmtMins(sleep)}, about your usual` });
  }
  if (hrv != null) {
    const b = baseline(hkYears, 'hrv', today);
    if (b) {
      const pct = (hrv - b.v) / b.v;
      const s = clamp(0.5 + pct / 0.4, 0, 1);
      parts.push({ id: 'hrv', w: 0.3, s });
      const p = Math.round(Math.abs(pct) * 100);
      reasons.push({ s, text: pct <= -0.08 ? `HRV ${hrv} ms, ${p}% below your norm of ${Math.round(b.v)}` : pct >= 0.08 ? `HRV ${hrv} ms, ${p}% above your norm` : `HRV ${hrv} ms, near your norm` });
    }
  }
  if (rhr != null) {
    const b = baseline(hkYears, 'rhr', today);
    if (b) {
      const diff = rhr - b.v;
      const s = clamp(0.5 - diff / 8, 0, 1);
      parts.push({ id: 'rhr', w: 0.2, s });
      const d = Math.round(Math.abs(diff));
      if (d >= 2) reasons.push({ s, text: diff > 0 ? `Resting heart rate ${rhr}, ${d} above normal` : `Resting heart rate ${rhr}, ${d} below normal` });
    }
  }
  if (ctx.health) {
    const yl = dayLoad(ctx, addDays(today, -1));
    let tot = 0;
    for (let i = 2; i <= 29; i++) tot += dayLoad(ctx, addDays(today, -i));
    const avg = tot / 28;
    if (avg > 5) {
      const ratio = yl / avg;
      const s = ratio <= 0.5 ? 0.9 : clamp(0.9 - (ratio - 0.5) * 0.35, 0.2, 0.9);
      parts.push({ id: 'load', w: 0.15, s });
      if (ratio >= 1.6) reasons.push({ s, text: `Hard day yesterday (${Math.round(ratio * 10) / 10}× your usual training load)` });
      else if (yl === 0 && avg > 20) reasons.push({ s: 0.9, text: 'Rest day yesterday' });
    }
  }
  if (!parts.length) return null;
  const W = sum(parts, (p) => p.w);
  const score = Math.round(15 + (85 * sum(parts, (p) => p.w * p.s)) / W);
  const level = score >= 75 ? 'ready' : score >= 45 ? 'normal' : 'easy';
  reasons.sort((a, b) => (level === 'ready' ? b.s - a.s : a.s - b.s));
  return { score, level, label: READY[level][0], advice: READY[level][1], reasons: reasons.map((r) => r.text), parts: parts.map((p) => p.id), sleep, hrv, rhr };
}

// ---------------------------------------------------------------- weight: smoothed trend, goal, projection
// Daily weights (linearly filled between weigh-ins) smoothed with a 10% exponential average, like a trend scale.
export function weightTrend(h, today = todayISO(), days = 150) {
  const w = [...(h.weights || [])].filter((x) => x.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const recent = w.filter((x) => x.date >= addDays(today, -days));
  if (recent.length < 2) return null;
  const series = [];
  let trend = mean(recent.slice(0, 3).map((x) => Number(x.lb)));
  for (let i = 0; i < recent.length; i++) {
    const a = recent[i];
    const b = recent[i + 1];
    const span = b ? daysApart(a.date, b.date) : 1;
    for (let k = 0; k < span; k++) {
      const iso = addDays(a.date, k);
      const v = b ? Number(a.lb) + ((Number(b.lb) - Number(a.lb)) * k) / span : Number(a.lb);
      trend += 0.1 * (v - trend);
      series.push({ t: iso, v: r1(trend), lb: k === 0 ? Number(a.lb) : null });
    }
  }
  const last = recent[recent.length - 1];
  const stale = daysApart(last.date, today) > 14;
  // Rate: straight-line fit through the last 28 days of weigh-ins (needs 4+ over 2+ weeks, and a recent one).
  const win = recent.filter((x) => x.date >= addDays(last.date, -28));
  let rate = null;
  if (!stale && win.length >= 4 && daysApart(win[0].date, last.date) >= 14) {
    const xs = win.map((x) => daysApart(win[0].date, x.date));
    const ys = win.map((x) => Number(x.lb));
    const mx = mean(xs);
    const my = mean(ys);
    const slope = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sum(xs.map((x) => (x - mx) ** 2));
    rate = Math.round(slope * 7 * 100) / 100; // lb per week
  }
  return { series, trend: series[series.length - 1].v, rate, last, stale };
}
export const GOAL_RATE = { maintain: 0, lose_slow: -0.5, lose: -1, gain: 0.5 };
export function weightGoal(h, today = todayISO()) {
  const goal = Number(h.goalWeight) || null;
  const t = weightTrend(h, today);
  if (!t) return { goal, t: null };
  const out = { goal, t, rate: t.rate };
  const planned = GOAL_RATE[(h.profile && h.profile.goal) || 'maintain'];
  if (t.rate != null) {
    const pct = (Math.abs(t.rate) / t.trend) * 100;
    if (t.rate < 0 && (pct > 1 || t.rate < -2)) out.warn = `Losing ${Math.abs(t.rate)} lb a week is more than 1% of your weight. Faster than that tends to cost muscle; eat a little more.`;
    else if (t.rate > 0.5 && planned >= 0) out.warn = `Gaining ${t.rate} lb a week is faster than muscle can be built; most of the extra will be fat.`;
    else if (planned < 0 && t.rate > 0.2) out.note = 'Your goal is to lose, but your trend is going up.';
    else if (planned > 0 && t.rate < -0.2) out.note = 'Your goal is to gain, but your trend is going down.';
  }
  if (!goal) return out;
  const left = r1(goal - t.trend);
  out.left = left;
  if (Math.abs(left) < 0.6) {
    out.reached = true;
    return out;
  }
  if (t.rate != null && Math.sign(t.rate) === Math.sign(left) && Math.abs(t.rate) >= 0.1) {
    const weeks = left / t.rate;
    if (weeks <= 260) out.eta = addDays(today, Math.round(weeks * 7));
  }
  if (planned && Math.sign(planned) === Math.sign(left)) out.plannedEta = addDays(today, Math.round((left / planned) * 7));
  return out;
}

// ---------------------------------------------------------------- adaptive calorie target
// What you really burn: average logged intake minus the energy of your weight change (3,500 cal per lb), over the
// last 4 weeks. Blended with the formula until there are 3 weeks of logging, then yours alone.
export function adaptive(h, years, today = todayISO()) {
  const t = targets(h);
  const ref = t.cal || 2000;
  let n = 0;
  let kcal = 0;
  for (let i = 1; i <= 28; i++) {
    const food = getDay(years || {}, addDays(today, -i)).food;
    const k = totals(food).k;
    if (food.length >= 2 && k >= ref * 0.5) {
      n++;
      kcal += k;
    }
  }
  const w = (h.weights || []).filter((x) => x.date >= addDays(today, -31) && x.date <= today);
  const need = [];
  if (n < 10) need.push(`${10 - n} more fully logged day${10 - n === 1 ? '' : 's'}`);
  const span = w.length ? daysApart(w[0].date, w[w.length - 1].date) : 0;
  if (w.length < 4 || span < 14) need.push('weigh-ins over at least 2 weeks (4 or more)');
  const state = h.adaptive || {};
  if (need.length) return { ready: false, need, n, state };
  const xs = w.map((x) => daysApart(w[0].date, x.date));
  const ys = w.map((x) => Number(x.lb));
  const mx = mean(xs);
  const my = mean(ys);
  const slope = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sum(xs.map((x) => (x - mx) ** 2)); // lb/day
  const intake = kcal / n;
  const measured = intake - slope * 3500;
  const formula = t.auto ? t.auto.tdee : null;
  const f = Math.min(1, n / 21);
  const est = Math.round(formula ? f * measured + (1 - f) * formula : measured);
  const adj = (GOALS.find((g) => g[0] === ((h.profile && h.profile.goal) || 'maintain')) || GOALS[0])[2];
  const floor = h.profile && h.profile.sex === 'female' ? 1200 : 1500;
  const suggested = Math.max(floor, Math.round((est + adj) / 10) * 10);
  const lastAt = state.at || null;
  const skip = state.skip || null;
  const due = (!lastAt || lastAt <= addDays(today, -7)) && (!skip || skip <= addDays(today, -7)) && Math.abs(suggested - (t.cal || 0)) >= 50;
  return { ready: true, n, intake: Math.round(intake), rate: Math.round(slope * 7 * 100) / 100, measured: Math.round(measured), formula, est, suggested, current: t.cal || null, due, state };
}
export function acceptAdaptive(h, a, today = todayISO()) {
  h.adaptive = { on: true, cal: a.suggested, at: today, est: a.est };
  h.checkins = [...(h.checkins || []), { date: today, est: a.est, intake: a.intake, rate: a.rate, cal: a.suggested }].slice(-26);
  h.custom = null;
}
export const skipAdaptive = (h, today = todayISO()) => (h.adaptive = { ...(h.adaptive || {}), skip: today });
export const adaptiveOff = (h) => (h.adaptive = { ...(h.adaptive || {}), on: false });

// ---------------------------------------------------------------- fiber, sugar, sodium
// Fiber: 14 g per 1,000 calories (Dietary Guidelines). Sodium: under 2,300 mg. Sugar: total sugars, shown against 10%
// of calories (the added-sugar limit), since food labels in the database don't separate added from natural.
export function nutrientGoals(t) {
  const cal = (t && t.cal) || 2000;
  return { fib: Math.round((cal / 1000) * 14), na: 2300, sug: Math.round((cal * 0.1) / 4) };
}
export function extraTotals(food) {
  const has = food.filter((e) => e.fib != null || e.na != null || e.sug != null);
  return {
    fib: r1(sum(has, (e) => e.fib)),
    sug: r1(sum(has, (e) => e.sug)),
    na: Math.round(sum(has, (e) => e.na)),
    counted: has.length,
    of: food.length,
  };
}
export function proteinByMeal(food) {
  const out = {};
  for (const e of food) out[e.meal] = r1((out[e.meal] || 0) + (Number(e.p) || 0));
  return out;
}
export function weekNutrients(years, today = todayISO()) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const food = getDay(years || {}, addDays(today, -i)).food;
    const x = extraTotals(food);
    if (x.counted && x.counted >= x.of * 0.6) days.push(x);
  }
  if (!days.length) return null;
  return { n: days.length, fib: r1(mean(days.map((d) => d.fib))), sug: r1(mean(days.map((d) => d.sug))), na: Math.round(mean(days.map((d) => d.na))) };
}

// ---------------------------------------------------------------- saved meals
const ENTRY_KEYS = ['name', 'brand', 'amount', 'qty', 'portion', 'key', 'k', 'p', 'c', 'f', 'fib', 'sug', 'na'];
const pickEntry = (e) => Object.fromEntries(ENTRY_KEYS.filter((k) => e[k] != null).map((k) => [k, e[k]]));
export function saveMeal(h, name, meal, entries) {
  const items = entries.map(pickEntry);
  if (!items.length) return null;
  h.meals = Array.isArray(h.meals) ? h.meals : [];
  const m = { id: uid(), name: String(name || '').trim() || 'Saved meal', meal, items };
  h.meals.push(m);
  return m;
}
export function removeMeal(h, id) {
  h.meals = (h.meals || []).filter((m) => m.id !== id);
}
export function mealEntries(saved, meal) {
  return saved.items.map((it) => ({ ...it, id: uid(), meal }));
}
export const mealTotals = (saved) => totals(saved.items);
// One serving of a recipe (from the weekly picks or your meal prep plan) as a food you can log.
export function recipeFood(r) {
  const [k, p, c, f, fib, sug, na] = r.nutrition || [];
  const perServing = { k: Number(k) || 0, p: Number(p) || 0, c: Number(c) || 0, f: Number(f) || 0 };
  if (fib != null) perServing.fib = Number(fib);
  if (sug != null) perServing.sug = Number(sug);
  if (na != null) perServing.na = Number(na);
  return { name: r.title, src: 'bb', ref: String(r.webId || r.id), perServing, portions: [{ label: '1 serving', mult: 1 }] };
}

// ---------------------------------------------------------------- habits and hydration
// count habits: goal is a floor (water) or, with limit, a ceiling (caffeine, alcohol). check habits: done or not.
export const DEFAULT_HABITS = [
  { id: 'water', name: 'Water', kind: 'count', unit: 'glass', goal: 8 },
  { id: 'caffeine', name: 'Caffeine', kind: 'count', unit: 'cup', goal: 3, limit: true },
  { id: 'alcohol', name: 'Alcohol', kind: 'count', unit: 'drink', goal: 2, limit: true },
  { id: 'vitamins', name: 'Vitamins', kind: 'check' },
];
export const habitsOf = (h) => (Array.isArray(h && h.habits) ? h.habits : DEFAULT_HABITS);
export function addHabit(h, name, kind = 'check', unit, goal, limit) {
  const n = String(name || '').trim();
  if (!n) return null;
  h.habits = [...habitsOf(h)];
  const x = { id: `h${uid()}`, name: n, kind: kind === 'count' ? 'count' : 'check' };
  if (x.kind === 'count') Object.assign(x, { unit: String(unit || 'time').trim() || 'time', goal: Math.max(0, Number(goal) || 1), limit: !!limit });
  h.habits.push(x);
  return x;
}
export function removeHabit(h, id) {
  h.habits = habitsOf(h).filter((x) => x.id !== id);
}
export function updateHabit(h, id, patch) {
  h.habits = habitsOf(h).map((x) => (x.id === id ? { ...x, ...patch } : x));
}
// What Apple Health counted for water (8 oz glasses) and caffeine (95 mg cups), from the daily sync.
export function appleHabit(hkYears, id, iso) {
  const hd = hkDay(hkYears, iso);
  if (hd && id === 'water' && hd.wat) return Math.round(hd.wat / 8);
  if (hd && id === 'caffeine' && hd.caf) return Math.round(hd.caf / 95);
  return null;
}
// A day's value: what you marked, else (for water and caffeine) what Apple Health counted.
export function habitValue(years, hkYears, habit, iso) {
  const d = getDay(years || {}, iso);
  const mine = d.hb ? d.hb[habit.id] : undefined;
  if (habit.kind === 'check') return mine ? 1 : 0;
  if (mine != null) return Number(mine) || 0;
  return appleHabit(hkYears, habit.id, iso);
}
export function setHabit(yearDoc, iso, id, v) {
  const d = dayOf(yearDoc, iso);
  d.hb = { ...(d.hb || {}) };
  if (v == null || v === false) delete d.hb[id];
  else d.hb[id] = v === true ? 1 : Math.max(0, Math.round(Number(v) * 10) / 10);
  if (!Object.keys(d.hb).length) delete d.hb;
  d.hbAt = 1; // this day was tracked (so a limit habit left at zero counts as kept)
}
// One more or one less, worked out inside the save (so quick taps all count), starting from what was shown.
export function stepHabit(yearDoc, iso, id, delta, shown = 0) {
  const d = dayOf(yearDoc, iso);
  const cur = d.hb && d.hb[id] != null ? Number(d.hb[id]) || 0 : Number(shown) || 0;
  setHabit(yearDoc, iso, id, Math.max(0, cur + delta));
}
const tracked = (years, iso) => {
  const d = getDay(years || {}, iso);
  return !!(d.hb || d.hbAt);
};
export function habitDone(years, hkYears, habit, iso) {
  const v = habitValue(years, hkYears, habit, iso);
  if (habit.kind === 'check') return v === 1;
  if (habit.limit) return tracked(years, iso) && (v || 0) <= habit.goal;
  return v != null && v >= habit.goal;
}
export function habitStreak(years, hkYears, habit, today = todayISO(), cap = 400) {
  const ok = (iso) => habitDone(years, hkYears, habit, iso);
  let cur = 0;
  let d = ok(today) ? today : addDays(today, -1);
  while (cur < cap && ok(d)) {
    cur++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  for (let i = cap; i >= 0; i--) {
    if (ok(addDays(today, -i))) best = Math.max(best, ++run);
    else run = 0;
  }
  return { current: cur, best, today: ok(today) };
}
export function habitWeek(years, hkYears, habit, today = todayISO()) {
  let done = 0;
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const iso = addDays(today, -i);
    const v = habitValue(years, hkYears, habit, iso);
    if (habit.kind === 'count') total += v || 0;
    if (habitDone(years, hkYears, habit, iso)) done++;
  }
  return { done, total };
}

// ---------------------------------------------------------------- checkups and labs
export const DEFAULT_CHECKUPS = [
  { id: 'physical', name: 'Physical', every: 12 },
  { id: 'dentist', name: 'Dental cleaning', every: 6 },
  { id: 'eye', name: 'Eye exam', every: 24 },
];
export const checkupsOf = (h) => (Array.isArray(h && h.checkups) ? h.checkups : DEFAULT_CHECKUPS);
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const dt = new Date(y, m - 1 + n, Math.min(d, last));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
// A booked visit whose day has passed counts as your last visit.
export const lastVisit = (c, today = todayISO()) => (c.booked && c.booked < today && (!c.last || c.last < c.booked) ? c.booked : c.last || null);
export function checkupStatus(c, today = todayISO()) {
  if (c.booked && c.booked >= today) return { state: 'booked', date: c.booked, days: daysApart(today, c.booked) };
  const last = lastVisit(c, today);
  if (!last) return { state: 'unknown' };
  const due = addMonths(last, Number(c.every) || 12);
  const days = daysApart(today, due);
  return { state: days < 0 ? 'overdue' : days <= 30 ? 'soon' : 'ok', date: due, days };
}
export function updateCheckup(h, id, patch) {
  const list = checkupsOf(h).map((c) => ({ ...c }));
  const i = list.findIndex((c) => c.id === id);
  if (i >= 0) Object.assign(list[i], patch);
  else list.push({ id: id || `c${uid()}`, every: 12, ...patch });
  h.checkups = list;
}
export function doneCheckup(h, id, date = todayISO()) {
  updateCheckup(h, id, { last: date, booked: null });
}
export function removeCheckup(h, id) {
  h.checkups = checkupsOf(h).filter((c) => c.id !== id);
}
// Checkups to mention on Home: overdue, due within 30 days, or booked within the week.
export function checkupReminders(h, today = todayISO()) {
  return checkupsOf(h)
    .map((c) => ({ c, st: checkupStatus(c, today) }))
    .filter(({ st }) => st.state === 'overdue' || st.state === 'soon' || (st.state === 'booked' && st.days <= 7))
    .sort((a, b) => (a.st.date < b.st.date ? -1 : 1))
    .map(({ c, st }) => ({ id: c.id, name: c.name, ...st, text: st.state === 'booked' ? `${c.name} ${st.days === 0 ? 'today' : st.days === 1 ? 'tomorrow' : shortDate(st.date)}` : st.state === 'overdue' ? `${c.name} overdue since ${shortDate(st.date)}` : `${c.name} due ${shortDate(st.date)}` }));
}
// Typical adult reference ranges. [id, name, unit, low, high, note]
export const LABS = [
  ['tc', 'Total cholesterol', 'mg/dL', null, 200, 'Under 200 is desirable'],
  ['ldl', 'LDL cholesterol', 'mg/dL', null, 100, 'Under 100 is optimal'],
  ['hdl', 'HDL cholesterol', 'mg/dL', 40, null, '40 or more (50+ for women)'],
  ['tg', 'Triglycerides', 'mg/dL', null, 150, 'Under 150 is normal'],
  ['a1c', 'Hemoglobin A1c', '%', null, 5.7, 'Under 5.7% is normal'],
  ['glu', 'Fasting glucose', 'mg/dL', 70, 100, '70–99 is normal'],
  ['vitd', 'Vitamin D (25-OH)', 'ng/mL', 30, 100, '30–100 is sufficient'],
  ['tsh', 'TSH', 'mIU/L', 0.4, 4.0, '0.4–4.0 is typical'],
  ['b12', 'Vitamin B12', 'pg/mL', 200, 900, '200–900 is typical'],
  ['ferritin', 'Ferritin', 'ng/mL', 24, 336, '24–336 is typical for men'],
].map(([id, name, unit, lo, hi, note]) => ({ id, name, unit, lo, hi, note }));
export function labTests(h) {
  const sex = h && h.profile && h.profile.sex;
  const list = LABS.map((t) => (t.id === 'hdl' && sex === 'female' ? { ...t, lo: 50 } : t.id === 'ferritin' && sex === 'female' ? { ...t, lo: 11, hi: 307, note: '11–307 is typical for women' } : t));
  return [...list, ...((h && h.labTests) || [])];
}
export function addLabTest(h, name, unit, lo, hi) {
  const n = String(name || '').trim();
  if (!n) return null;
  h.labTests = Array.isArray(h.labTests) ? h.labTests : [];
  const t = { id: `l${uid()}`, name: n, unit: String(unit || '').trim(), lo: num(lo), hi: num(hi), note: '' };
  h.labTests.push(t);
  return t;
}
export function addLab(h, test, date, value) {
  const v = num(value);
  if (v == null || !test || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  h.labs = Array.isArray(h.labs) ? h.labs : [];
  h.labs = h.labs.filter((x) => !(x.test === test && x.date === date));
  h.labs.push({ id: uid(), test, date, value: v });
  h.labs.sort((a, b) => (a.date < b.date ? -1 : 1));
  return true;
}
export function removeLab(h, id) {
  h.labs = (h.labs || []).filter((x) => x.id !== id);
}
export const labFlag = (t, v) => (t.lo != null && v < t.lo ? 'low' : t.hi != null && (t.id === 'glu' || t.id === 'a1c' ? v >= t.hi : v > t.hi) ? 'high' : 'ok');
export function labSummary(h) {
  const byTest = {};
  for (const x of (h && h.labs) || []) (byTest[x.test] = byTest[x.test] || []).push(x);
  return labTests(h)
    .filter((t) => byTest[t.id])
    .map((t) => {
      const list = byTest[t.id];
      const last = list[list.length - 1];
      const prev = list.length > 1 ? list[list.length - 2] : null;
      return { t, list, last, prev, flag: labFlag(t, last.value) };
    });
}
export { latestWeight, ageOf };
