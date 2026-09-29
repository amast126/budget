// The Health Sync Shortcut, version 2. One link carries the last few days of Apple Health as plain text:
//   …/#/health-sync?k=KEY&v=2&d=<the Shortcut's Text, URL-encoded>
// The text is sections. Each starts with a "#name" line, followed by the lists the Shortcut inserted (a list of
// Health samples put into a Text action comes out one per line):
//   #today                         Current Date (the phone's day and time)
//   #steps #active #resting #exercise #distance #flights #stand #water #mindful #caffeine
//                                  Value, then Start Date, of samples grouped by day
//   #hr                            Value, then Start Date, of every heart-rate reading (not grouped)
//   #hrv #rhr #resp #o2 #walkhr    Value, then Start Date (not grouped)
//   #sleep                         Value, then Start Date, then End Date, of every Sleep sample
//   #workouts                      Workout Activity Type, then Start Date, then End Date
//   #workout-cal #workout-miles    each workout's Active Energy / Distance, in the same order
//   #weight #fat                   Value, then Start Date
// Dates can be in any format Shortcuts writes (ISO 8601 keeps the link shortest). Every day's numbers are worked
// out here the same way the full Apple Health import does, so a synced day and an imported one look alike.
import { sleepNight, hrInWindow, hrHist, WORKOUT_NAMES, workoutLabel } from './apple-health.js';

const pad = (n) => String(n).padStart(2, '0');
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const addDay = (iso, n) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000);
  return d.toISOString().slice(0, 10);
};
const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const n0 = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const fmtMin = (m) => {
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h ? `${h}h ${pad(mm)}m` : `${mm}m`;
};
const plural = (n, w) => `${n0(n)} ${n === 1 ? w : `${w}s`}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Shortcuts puts narrow no-break spaces before AM/PM, and pasted text can carry invisible marks.
export const clean = (s) =>
  String(s == null ? '' : s)
    .replace(/[​-‏⁠﻿]/g, '')
    .replace(/[  -   　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Exactly one number ("8,123", "512.4 kcal", "72 count/min"); anything else is null.
export const num1 = (v) => {
  const m = clean(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g);
  if (!m || m.length !== 1) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------- dates
// A date-time as the phone's wall clock: day, "HH:MM", a millisecond count that keeps local times in order (a UTC
// stand-in, so every time from one link compares the same way), and "YYYY-MM-DD HH:MM:SS" as the import uses.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// off: minutes ahead of UTC when the text says (ISO 8601, RFC 2822, GMT±…), so durations across a clock change
// come out right; `abs` is then the real moment.
function stamp(y, mo, d, h = 0, mi = 0, sec = 0, off = null) {
  if (!(y > 2000 && y < 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h >= 0 && h < 24 && mi >= 0 && mi < 60 && sec >= 0 && sec < 61)) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, Math.min(59, sec));
  if (new Date(ms).getUTCDate() !== d) return null; // Feb 30
  const day = `${y}-${pad(mo)}-${pad(d)}`;
  return { day, hm: `${pad(h)}:${pad(mi)}`, ms, abs: off == null ? null : ms - off * 60000, str: `${day} ${pad(h)}:${pad(mi)}:${pad(Math.min(59, sec))}` };
}
const hour24 = (h, ap) => {
  const a = ap && ap.toLowerCase();
  if (a === 'p' && h < 12) return h + 12;
  if (a === 'a' && h === 12) return 0;
  return h;
};
const TIME = String.raw`(?:,?\s*(?:at\s+)?(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(?:([ap])\.?\s*m\.?)?)?`;
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]?\d{2}:?\d{2})?)?$/i;
const RE_MDY = new RegExp(String.raw`^(?:[a-z]+,?\s+)?([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})${TIME}$`, 'i');
const RE_DMY = new RegExp(String.raw`^(?:[a-z]+,?\s+)?(\d{1,2})\s+([a-z]{3,})\.?,?\s+(\d{4})${TIME}$`, 'i');
const RE_NUM = new RegExp(String.raw`^(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})${TIME}$`, 'i');
const RE_REL = new RegExp(String.raw`^(today|yesterday)${TIME}$`, 'i');
// A time zone after the time: "-0400", "GMT-4", "UTC", "EDT", "Eastern Daylight Time" (never the AM/PM).
const RE_ZONE = /\s*(?:(?:GMT|UTC)?\s*([+-])(\d{1,2}):?(\d{2})?|(GMT|UTC)|\(?[A-Z][a-z]+(?: [A-Z][a-z]+)* Time\)?|\b(?!AM\b|PM\b)[A-Z]{2,5})$/;
const month = (s) => {
  const i = MONTHS.indexOf(String(s).slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : 0;
};
function parse1(s, today, off) {
  let m = RE_ISO.exec(s);
  if (m) {
    const parts = [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
    const z = m[7];
    if (z && z.toUpperCase() === 'Z') {
      const at = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
      const d = new Date(at);
      const out = stamp(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
      return out && { ...out, abs: at };
    }
    // With an offset, the clock time shown is already the phone's local time. ("+05:30" can arrive as " 05:30".)
    let o = off;
    if (z) {
      const zz = /^([+-]?)(\d{2}):?(\d{2})$/.exec(z);
      o = (zz[1] === '-' ? -1 : 1) * (+zz[2] * 60 + +zz[3]);
    }
    return stamp(...parts, o);
  }
  const t = (m, i) => [m[i] ? hour24(+m[i], m[i + 3]) : 0, m[i + 1] ? +m[i + 1] : 0, m[i + 2] ? +m[i + 2] : 0];
  if ((m = RE_MDY.exec(s)) && month(m[1])) return stamp(+m[3], month(m[1]), +m[2], ...t(m, 4), off);
  if ((m = RE_DMY.exec(s)) && month(m[2])) return stamp(+m[3], month(m[2]), +m[1], ...t(m, 4), off);
  if ((m = RE_NUM.exec(s))) return stamp(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2], ...t(m, 4), off);
  if ((m = RE_REL.exec(s))) {
    const day = m[1].toLowerCase() === 'today' ? today : addDay(today, -1);
    return stamp(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10), ...t(m, 2), off);
  }
  return null;
}
export function parseStamp(v, today = localISO()) {
  const s = clean(v);
  if (!s || s.length > 80 || !/\d/.test(s)) return null;
  const direct = parse1(s, today, null);
  if (direct) return direct;
  const z = RE_ZONE.exec(s);
  if (!z || z.index === 0) return null;
  const off = z[1] ? (z[1] === '-' ? -1 : 1) * (+z[2] * 60 + +(z[3] || 0)) : z[4] ? 0 : null;
  return parse1(s.slice(0, z.index), today, off);
}
// Lines that are plainly dates the patterns above didn't take ("…2026…11:10…"): worth saying so, not "no dates".
const looksLikeDate = (v) => /\b20\d\d\b/.test(v) && /\d{1,2}[:.]\d{2}/.test(v);

// ---------------------------------------------------------------- sections
const ALIAS = {
  now: 'today',
  date: 'today',
  step: 'steps',
  'active-energy': 'active',
  activeenergy: 'active',
  'resting-energy': 'resting',
  restingenergy: 'resting',
  dist: 'distance',
  walking: 'distance',
  miles: 'distance',
  flight: 'flights',
  heart: 'hr',
  heartrate: 'hr',
  'heart-rate': 'hr',
  'resting-hr': 'rhr',
  restinghr: 'rhr',
  'walking-hr': 'walkhr',
  respiratory: 'resp',
  oxygen: 'o2',
  workout: 'workouts',
  'workout-calories': 'workout-cal',
  wcal: 'workout-cal',
  'workout-distance': 'workout-miles',
  wdist: 'workout-miles',
  'body-fat': 'fat',
  bodyfat: 'fat',
};
export function sections(text) {
  const out = Object.create(null);
  let cur = null;
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = clean(raw);
    const h = /^#\s*([a-z][a-z0-9-]*)$/i.exec(line);
    if (h) {
      const name = h[1].toLowerCase();
      cur = own(ALIAS, name) ? ALIAS[name] : name;
      out[cur] = out[cur] || [];
      continue;
    }
    if (cur) out[cur].push(line);
  }
  return out;
}
// A section's lines as values and dates, in the order the Shortcut wrote them.
function split(lines, today) {
  const vals = [];
  const dates = [];
  for (const l of lines) {
    if (!l) continue;
    const t = parseStamp(l, today);
    if (t) dates.push(t);
    else vals.push(l);
  }
  return { vals, dates };
}
// A per-workout list lines up with the workouts when it has one entry each (blank lines count when they're needed).
function aligned(lines, n) {
  const full = lines.filter((l) => l !== '');
  if (full.length === n) return full;
  const trimmed = [...lines];
  while (trimmed.length > n && trimmed[trimmed.length - 1] === '') trimmed.pop();
  while (trimmed.length > n && trimmed[0] === '') trimmed.shift();
  return trimmed.length === n ? trimmed : null;
}

// ---------------------------------------------------------------- units
const has = (raw, re) => re.test(clean(raw));
const kcal = (n, raw) => (has(raw, /\bkj\b/i) ? n / 4.184 : n);
const mins = (n, raw) => (has(raw, /\b(h|hr|hrs|hours?)\b/i) ? n * 60 : has(raw, /\b(s|sec|secs|seconds?)\b/i) ? n / 60 : n);
const miles = (n, raw) => (has(raw, /\bkm\b/i) ? n * 0.621371 : has(raw, /\bm\b/) ? n / 1609.344 : has(raw, /\byd\b/i) ? n / 1760 : n);
const oz = (n, raw) => (has(raw, /\bml\b/i) ? n / 29.5735 : has(raw, /\bl\b/i) ? n * 33.814 : n);
const mg = (n, raw) => (has(raw, /\bg\b/) ? n * 1000 : n);
const pct = (n) => (n > 0 && n <= 1 ? n * 100 : n);
const lb = (n, raw) => (has(raw, /\bkg\b/i) ? n * 2.20462 : has(raw, /\bst\b/i) ? n * 14 : n);

// Totals per day (Find Health Samples grouped by day): [section, day key, label, [lo, hi], decimals, unit]
export const SUMS = [
  ['steps', 'st', 'steps', [1, 150000], 0],
  ['active', 'ae', 'active calories', [1, 8000], 0, kcal],
  ['resting', 'ab', 'resting calories', [300, 5000], 0, kcal],
  ['exercise', 'ex', 'exercise minutes', [0, 1440], 0, mins],
  ['distance', 'di', 'miles', [0.01, 150], 2, miles],
  ['flights', 'fl', 'flights climbed', [1, 500], 0],
  ['stand', 'sh', 'stand hours', [0, 24], 0],
  ['water', 'wat', 'oz of water', [1, 400], 0, oz],
  ['mindful', 'mm', 'mindful minutes', [1, 1440], 0, mins],
  ['caffeine', 'caf', 'mg of caffeine', [1, 2000], 0, mg],
];
// Readings averaged per day (not grouped): [section, day key, label, [lo, hi], decimals, unit]
export const AVGS = [
  ['hrv', 'hrv', 'HRV', [5, 300], 0],
  ['rhr', 'rhr', 'resting heart rate', [25, 150], 0],
  ['resp', 'rr', 'breathing rate', [4, 40], 1, null],
  ['o2', 'o2', 'blood oxygen', [70, 100], 1, pct],
  ['walkhr', 'whr', 'walking heart rate', [40, 200], 0],
];
const round = (v, dec) => (dec === 2 ? r2(v) : dec === 1 ? r1(v) : r0(v));

// ---------------------------------------------------------------- sleep and workouts
// Sleep values as Shortcuts writes them ("Core", "Asleep (REM)", "In Bed"…) or HealthKit's numbers.
const SLEEP_CODES = ['InBed', 'AsleepUnspecified', 'Awake', 'AsleepCore', 'AsleepDeep', 'AsleepREM'];
export function sleepValue(v) {
  const s = clean(v).toLowerCase();
  if (/^\d$/.test(s)) return SLEEP_CODES[+s] || null;
  if (/in ?bed/.test(s)) return 'InBed';
  if (/awake/.test(s)) return 'Awake';
  if (/deep/.test(s)) return 'AsleepDeep';
  if (/\brem\b/.test(s)) return 'AsleepREM';
  if (/core|light/.test(s)) return 'AsleepCore';
  if (/asleep|unspecified|sleep/.test(s)) return 'AsleepUnspecified';
  return null;
}
// Workout names as the Fitness app shows them ("Outdoor Run", "HIIT") and HealthKit's type numbers.
const WALIAS = {
  outdoorrun: 'Running',
  indoorrun: 'Running',
  run: 'Running',
  outdoorwalk: 'Walking',
  indoorwalk: 'Walking',
  walk: 'Walking',
  outdoorcycle: 'Cycling',
  indoorcycle: 'Cycling',
  cycle: 'Cycling',
  biking: 'Cycling',
  poolswim: 'Swimming',
  openwaterswim: 'Swimming',
  swim: 'Swimming',
  hiit: 'HighIntensityIntervalTraining',
  strength: 'TraditionalStrengthTraining',
  strengthtraining: 'TraditionalStrengthTraining',
  hike: 'Hiking',
  stairs: 'StairClimbing',
  stairstepper: 'StairClimbing',
  rower: 'Rowing',
};
const WCODES = { 6: 'Basketball', 11: 'CrossTraining', 13: 'Cycling', 14: 'Dance', 16: 'Elliptical', 20: 'FunctionalStrengthTraining', 21: 'Golf', 24: 'Hiking', 35: 'Rowing', 37: 'Running', 41: 'Soccer', 44: 'StairClimbing', 46: 'Swimming', 48: 'Tennis', 50: 'TraditionalStrengthTraining', 52: 'Walking', 57: 'Yoga', 59: 'CoreTraining', 63: 'HighIntensityIntervalTraining', 79: 'Pickleball', 80: 'Cooldown' };
export function workoutKind(name) {
  const s = clean(name).replace(/^HKWorkoutActivityType/, '');
  const key = s.replace(/[^A-Za-z]/g, '').toLowerCase();
  const raw = (/^\d+$/.test(s) && own(WCODES, s) && WCODES[s]) || Object.keys(WORKOUT_NAMES).find((k) => k.toLowerCase() === key) || (own(WALIAS, key) && WALIAS[key]) || null;
  return raw ? { type: WORKOUT_NAMES[raw], label: workoutLabel(raw) } : { type: 'other', label: s || 'Workout' };
}

// ---------------------------------------------------------------- the whole link
// Totals and heart rate that only cover part of a day: the first day of a link that starts partway through it
// (the Shortcut's "last 3 days" can count back from the moment it runs), and today so far.
export const PARTIAL_KEYS = ['st', 'di', 'fl', 'ae', 'ab', 'ex', 'sh', 'wat', 'mm', 'caf', 'ha'];
// blob: the decoded text; today: this browser's day (the phone's #today wins when it's there).
export function parseSyncText(blob, today = localISO()) {
  const text = String(blob || '');
  const sec = sections(text);
  const problems = [];
  const found = [];
  const skipped = [];
  const days = {};
  const D = (iso) => (days[iso] = days[iso] || {});
  // Without URL Encode, the browser drops the line breaks and everything runs together.
  if (!/\n/.test(text) && (text.match(/#[a-z]/gi) || []).length > 1) {
    problems.push('The text arrived as one long line. Add a URL Encode action on the Text, and put the URL Encoded Text at the end of the link.');
  }
  const known = new Set(['today', 'end', 'hr', 'sleep', 'workouts', 'workout-cal', 'workout-miles', 'weight', 'fat', ...SUMS.map((x) => x[0]), ...AVGS.map((x) => x[0])]);
  for (const k of Object.keys(sec)) if (!known.has(k)) problems.push(`#${k} isn’t a section this page knows, so it was left out.`);

  // the phone's own "now"
  let now = null;
  if (sec.today) {
    now = split(sec.today, today).dates[0] || null;
    if (!now) problems.push('#today: no date found. Insert Current Date under it.');
  }
  const day0 = now ? now.day : today;
  const parts = {};
  const part = (name) => (parts[name] = parts[name] || split(sec[name], day0));
  // A section is usable when its dates can be read, have times where times matter, and none is after today.
  const usable = (name, label, { timed = false } = {}) => {
    const { vals, dates } = part(name);
    const odd = vals.filter(looksLikeDate);
    if (odd.length && odd.length >= vals.length / 3) {
      problems.push(`${cap(label)}: dates like “${odd[0]}” are in a format this page can’t read. Tap each date bubble under #${name} and set Date Format to ISO 8601, with the time on.`);
      return false;
    }
    const late = dates.find((t) => t.day > day0);
    if (late) {
      problems.push(`${cap(label)}: a date after today (${late.day}). Under #${name}, check that it uses Start Date${timed ? ' (then End Date)' : ''}, not End Date.`);
      return false;
    }
    if (timed && dates.length >= 2 && dates.every((t) => t.hm === '00:00')) {
      problems.push(`${cap(label)}: the dates have no times. Tap each date bubble under #${name} and turn the time on (Time Format, or Include ISO 8601 Time).`);
      return false;
    }
    return true;
  };
  // Heart rate, sleep and workouts are matched up by time: real moments when every one of their dates says its
  // time zone (so a night across a clock change adds up), otherwise the phone's clock times.
  const timedDates = ['hr', 'sleep', 'workouts'].filter((n) => sec[n]).flatMap((n) => part(n).dates);
  const useAbs = timedDates.length > 0 && timedDates.every((t) => t.abs != null);
  const T = (t) => (useAbs ? t.abs : t.ms);
  // Two lists of the same length, paired in order; a mismatch means a variable is missing or doubled.
  const pairs = (name, label, opts) => {
    const { vals, dates } = part(name);
    if (!vals.length && !dates.length) return null;
    if (!usable(name, label, opts)) return null;
    if (vals.length !== dates.length) {
      problems.push(`${cap(label)}: ${plural(vals.length, 'value')} but ${plural(dates.length, 'date')}. Under #${name}, insert Value, then Start Date.`);
      return null;
    }
    return vals.map((v, i) => ({ raw: v, at: dates[i] }));
  };

  // totals per day
  for (const [name, key, label, range, dec, unit] of SUMS) {
    if (!sec[name]) continue;
    const list = pairs(name, label);
    if (!list) continue;
    const byDay = {};
    let dup = false;
    for (const { raw, at } of list) {
      if (byDay[at.day] != null) dup = true;
      const n = num1(raw);
      byDay[at.day] = n == null ? NaN : unit ? unit(n, raw) : n;
    }
    if (dup) {
      problems.push(`${cap(label)}: more than one value for a day. In that Find Health Samples action, set Group By to Day.`);
      continue;
    }
    let bad = 0;
    for (const iso in byDay) {
      const v = round(byDay[iso], dec);
      if (Number.isFinite(v) && v >= range[0] && v <= range[1]) D(iso)[key] = v;
      else if (!(Number.isFinite(v) && v === 0)) bad++;
    }
    if (bad) skipped.push(`${bad} ${label} value${bad === 1 ? '' : 's'}`);
    found.push(`${cap(label)}: ${plural(Object.keys(byDay).length, 'day')}`);
  }

  // readings averaged per day
  for (const [name, key, label, range, dec, unit] of AVGS) {
    if (!sec[name]) continue;
    const list = pairs(name, label);
    if (!list) continue;
    const acc = {};
    for (const { raw, at } of list) {
      let n = num1(raw);
      if (n == null) continue;
      if (unit) n = unit(n, raw);
      if (!(n >= range[0] && n <= range[1])) continue;
      const a = (acc[at.day] = acc[at.day] || [0, 0]);
      a[0] += n;
      a[1]++;
    }
    for (const iso in acc) {
      D(iso)[key] = round(acc[iso][0] / acc[iso][1], dec);
      (D(iso).sc = D(iso).sc || {})[key] = acc[iso][1];
    }
    found.push(`${cap(label)}: ${plural(list.length, 'reading')}`);
  }

  // heart rate: every reading → each day's average, lowest and highest, and each workout's
  const hr = { hrT: new Float64Array(0), hrV: new Float32Array(0), hrN: 0 };
  let partialDay = null;
  if (sec.hr) {
    const list = pairs('hr', 'heart rate', { timed: true });
    if (list) {
      const pts = [];
      for (const { raw, at } of list) {
        const v = num1(raw);
        if (v > 20 && v < 250) pts.push([T(at), v, at.day, at.hm]);
      }
      pts.sort((a, b) => a[0] - b[0]);
      hr.hrT = Float64Array.from(pts, (p) => p[0] / 1000);
      hr.hrV = Float32Array.from(pts, (p) => p[1]);
      hr.hrN = pts.length;
      const acc = {};
      for (const [, v, iso] of pts) {
        const a = (acc[iso] = acc[iso] || [v, v, 0, 0]);
        if (v < a[0]) a[0] = v;
        if (v > a[1]) a[1] = v;
        a[2] += v;
        a[3]++;
      }
      for (const iso in acc) {
        const [mn, mx, sum, n] = acc[iso];
        if (n < 3) continue;
        Object.assign(D(iso), { ha: r0(sum / n), hl: r0(mn), hh: r0(mx) });
        (D(iso).sc = D(iso).sc || {}).hr = n;
      }
      // The Watch reads heart rate every few minutes, so a first day whose readings start well after midnight is
      // one the link only has part of.
      if (pts.length) {
        const first = pts.reduce((m, p) => (p[2] < m[2] || (p[2] === m[2] && p[3] < m[3]) ? p : m));
        if (first[3] > '01:00' && first[2] < day0) partialDay = first[2];
      }
      found.push(`Heart rate: ${plural(pts.length, 'reading')}`);
    }
  }

  // sleep: each night (named for the morning you wake up) worked out as the import does, one source per night
  let nights = 0;
  if (sec.sleep) {
    const { vals, dates } = part('sleep');
    const n = dates.length / 2;
    const withSource = Number.isInteger(n) && n > 0 && vals.length === n * 2;
    if (!vals.length && dates.length) {
      problems.push('Sleep: dates but no values. Under #sleep, insert Value first, then Start Date, End Date and Source.');
    } else if (vals.length && !usable('sleep', 'sleep', { timed: true })) {
      // said why above
    } else if (vals.length && !withSource && dates.length !== vals.length * 2) {
      problems.push(`Sleep: ${plural(vals.length, 'value')} but ${plural(dates.length, 'date')}. Under #sleep, insert Value, then Start Date, then End Date, then Source.`);
    } else if (vals.length) {
      const k = withSource ? n : vals.length;
      const src = withSource ? vals.slice(k) : null;
      const by = Object.create(null);
      let unknown = 0;
      let backwards = 0;
      for (let i = 0; i < k; i++) {
        const val = sleepValue(vals[i]);
        const a = dates[i];
        const b = dates[i + k];
        if (!val) {
          unknown++;
          continue;
        }
        const len = T(b) - T(a);
        if (!(len > 0)) {
          backwards++;
          continue;
        }
        if (len > 20 * 3600000) continue;
        const night = Number(a.hm.slice(0, 2)) >= 18 ? addDay(a.day, 1) : a.day;
        const who = src ? clean(src[i]) || 'Unknown' : 'Shortcut';
        ((by[night] = by[night] || Object.create(null))[who] = by[night][who] || []).push([T(a), T(b), val, a.str, b.str]);
      }
      if (unknown) problems.push(`Sleep: ${plural(unknown, 'value')} like “${vals.slice(0, k).find((v) => !sleepValue(v))}” weren’t sleep stages. Under #sleep, the first list should be Value.`);
      if (backwards > k / 2) problems.push('Sleep: most samples end before they start. Under #sleep, insert Start Date before End Date.');
      const keys = Object.keys(by).sort();
      keys.forEach((night, i) => {
        const bySrc = by[night];
        // The earliest night is only whole if it starts the evening before (a link that begins at midnight, or
        // partway through the night, has just its tail); runs overlap, so the one before had it whole.
        if (i === 0 && !Object.values(bySrc).some((l) => l.some((x) => x[3].slice(0, 10) < night))) return;
        // Without sources, drop plain "Asleep" from other apps when the Watch recorded stages that night.
        if (!src) {
          const l = bySrc.Shortcut;
          if (l.some((x) => x[2] === 'AsleepCore' || x[2] === 'AsleepDeep' || x[2] === 'AsleepREM')) bySrc.Shortcut = l.filter((x) => x[2] !== 'AsleepUnspecified');
        }
        const sl = sleepNight(night, bySrc);
        if (!sl) return;
        sl.src = 'Shortcut';
        D(night).sl = sl;
        nights++;
      });
      found.push(`Sleep: ${plural(nights, 'night')} (${plural(k, 'sample')}${src ? ` from ${plural(new Set(src.map(clean)).size, 'source')}` : ''})`);
    }
  }

  // workouts, with heart rate from the readings above
  const workouts = [];
  if (sec.workouts) {
    const { vals, dates } = part('workouts');
    const n = vals.length;
    if (!n && dates.length) {
      problems.push('Workouts: dates but no workout types. Under #workouts, insert Workout Type first, then Start Date, then End Date.');
    } else if (n && !usable('workouts', 'workouts', { timed: true })) {
      // said why above
    } else if (n && dates.length !== n * 2) {
      problems.push(`Workouts: ${plural(n, 'type')} but ${plural(dates.length, 'date')}. Under #workouts, insert Workout Type, then Start Date, then End Date.`);
    } else if (n) {
      const cal = sec['workout-cal'] ? aligned(sec['workout-cal'], n) : null;
      const mi = sec['workout-miles'] ? aligned(sec['workout-miles'], n) : null;
      if (sec['workout-cal'] && !cal) problems.push(`Workout calories: the list doesn’t line up with the ${plural(n, 'workout')}, so calories were left out.`);
      if (sec['workout-miles'] && !mi) problems.push(`Workout distance: the list doesn’t line up with the ${plural(n, 'workout')}, so distance was left out.`);
      let backwards = 0;
      for (let i = 0; i < n; i++) {
        const a = dates[i];
        const b = dates[i + n];
        const min = (T(b) - T(a)) / 60000;
        if (!(min > 0)) backwards++;
        if (!(min >= 1 && min <= 24 * 60)) continue;
        const k = workoutKind(vals[i]);
        const w = { id: `${a.day}T${a.hm}-${k.type}`, d: a.day, t: a.hm, type: k.type, label: k.label, min: r0(min) };
        const kc = cal ? num1(cal[i]) : null;
        if (kc > 0 && kc < 10000) w.kcal = r0(kcal(kc, cal[i]));
        const m = mi ? num1(mi[i]) : null;
        if (m > 0 && m < 500) w.mi = r2(miles(m, mi[i]));
        const h = hr.hrN ? hrInWindow(hr, T(a), T(b)) : null;
        if (h) {
          w.hr = r0(h.avg);
          if (h.max) w.hrMax = r0(h.max);
        }
        const hb = hr.hrN ? hrHist(hr, T(a), T(b)) : null;
        if (hb) w.hb = hb;
        w.src = 'Shortcut';
        if (!workouts.some((x) => x.id === w.id)) workouts.push(w);
      }
      if (backwards > n / 2) problems.push('Workouts: most end before they start. Under #workouts, insert Start Date before End Date.');
      if (vals.every((v) => /^workouts?$/i.test(clean(v)))) problems.push('Workouts: the type came through as “Workouts”. Tap that bubble under #workouts and pick Workout Type (or Name) instead of Type.');
      found.push(`Workouts: ${workouts.length}`);
    }
  }

  // weigh-ins: the last one each day
  const weights = [];
  if (sec.weight) {
    const list = pairs('weight', 'weight');
    const fat = sec.fat ? pairs('fat', 'body fat') : null;
    const fatBy = {};
    for (const { raw, at } of fat || []) {
      const f = num1(raw);
      if (f != null && pct(f) > 2 && pct(f) < 70) fatBy[at.day] = r1(pct(f));
    }
    const by = {};
    for (const { raw, at } of list || []) {
      const n = num1(raw);
      if (n == null) continue;
      const v = lb(n, raw);
      if (!(v > 50 && v < 700)) {
        skipped.push('a weight');
        continue;
      }
      if (!by[at.day] || by[at.day].ms <= T(at)) by[at.day] = { ms: T(at), lb: r1(v) };
    }
    for (const date of Object.keys(by).sort()) {
      const w = { date, lb: by[date].lb };
      if (fatBy[date]) w.fat = fatBy[date];
      weights.push(w);
    }
    if (list) found.push(`Weight: ${plural(weights.length, 'weigh-in')}`);
  }

  // The first day of a link that starts partway through it: its totals and heart rate would undercount.
  if (partialDay && days[partialDay]) {
    const d = days[partialDay];
    for (const k of [...PARTIAL_KEYS, 'hl', 'hh', ...AVGS.map((x) => x[1])]) delete d[k];
    if (d.sc) {
      delete d.sc.hr;
      for (const [, k] of AVGS) delete d.sc[k];
      if (!Object.keys(d.sc).length) delete d.sc;
    }
    if (!Object.keys(d).length) delete days[partialDay];
    found.push(`Left out ${partialDay}’s totals: the link starts partway through that day`);
  }

  const dayKeys = Object.keys(days).sort();
  const count = dayKeys.reduce((n, iso) => n + Object.keys(days[iso]).filter((k) => k !== 'sc').length, 0) + workouts.length + weights.length;
  // A missing #end means the text was cut short on the way (or the line was left off).
  if (count && !sec.end) problems.push('The text has no #end line at the bottom, so the link may have been cut short. Make #end the last line of the Text.');
  return { v: 2, today: day0, now: now ? now.hm : null, days, workouts, weights, found, problems, skipped, count, first: dayKeys[0] || null, last: dayKeys[dayKeys.length - 1] || null };
}

// ---------------------------------------------------------------- saving
// Links overlap (each run sends the last few days), so each value keeps whichever run saw more of that day:
// totals keep the bigger number, averages the one from more readings, a night the longer sleep, and the day's
// lowest and highest heart rate widen. Numbers from a full Apple Health import stay unless the sync saw more.
const betterNight = (cur, sl) => {
  if (!cur) return true;
  if (cur.src !== 'Shortcut' && cur.d != null) return false; // an imported night with stages
  if (sl.d != null && cur.d == null && (sl.a || 0) >= 0.7 * (cur.a || 0)) return true; // stages, and about as long
  return (sl.a || 0) >= (cur.a || 0);
};
export function mergeSyncDay(d, n) {
  for (const [, key] of SUMS) if (n[key] != null && !(d[key] >= n[key])) d[key] = n[key];
  const sc = { ...(d.sc || {}) };
  for (const [, key] of AVGS) {
    if (n[key] == null) continue;
    const imported = d[key] != null && !(sc[key] > 0);
    if (!imported && n.sc[key] >= (sc[key] || 0)) {
      d[key] = n[key];
      sc[key] = n.sc[key];
    }
  }
  if (n.ha != null) {
    const imported = d.ha != null && !(sc.hr > 0);
    if (!imported && n.sc.hr >= (sc.hr || 0)) {
      d.ha = n.ha;
      sc.hr = n.sc.hr;
    }
    d.hl = d.hl != null ? Math.min(d.hl, n.hl) : n.hl;
    d.hh = d.hh != null ? Math.max(d.hh, n.hh) : n.hh;
  }
  if (Object.keys(sc).length) d.sc = sc;
  if (n.sl && betterNight(d.sl, n.sl)) d.sl = { ...n.sl };
  d.sy = 1;
  return d;
}
export function planSyncText(s) {
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
  for (const iso of Object.keys(s.days)) {
    put(iso, (d, doc) => {
      mergeSyncDay(d, s.days[iso]);
      // Today so far: charts and monthly averages leave its totals out until a later run has the whole day.
      if (iso === s.today) d.pt = 1;
      else delete d.pt;
      // Ring goals: the latest ones the import saw (the Shortcut doesn't read them), so the rings still close.
      if (d.ae != null && d.mg == null && d.mtg == null) {
        const prev = Object.keys(doc.days)
          .filter((k) => k < iso && doc.days[k].mg != null)
          .sort()
          .pop();
        const g = prev ? doc.days[prev] : null;
        if (g) Object.assign(d, { mg: g.mg, eg: d.eg || g.eg || 30, sg: d.sg || g.sg || 12 });
      }
    });
  }
  return {
    years,
    health(h) {
      h.weights = h.weights || [];
      for (const sw of s.weights) {
        const at = h.weights.findIndex((w) => w.date === sw.date);
        if (at >= 0 && !h.weights[at].src) continue; // a weigh-in you typed wins
        const w = { date: sw.date, lb: sw.lb, src: 'sync' };
        if (at >= 0) h.weights[at] = w;
        else h.weights.push(w);
      }
      h.weights.sort((a, b) => (a.date < b.date ? -1 : 1));
    },
    sync(h, now = Date.now()) {
      const prev = h.sync || {};
      // v2At: when the Shortcut first synced (after that, its links save without asking). problems: kept so the
      // card can say something's off even when nobody looked at the page after a morning run.
      h.sync = { ...prev, lastAt: now, lastDate: s.today, lastLink: s.link, count: (prev.count || 0) + 1, v2At: prev.v2At || now, problems: (s.problems || []).slice(0, 6) };
    },
    main(hk) {
      hk.syncedAt = Date.now();
      const all = [...Object.keys(s.days), ...s.workouts.map((w) => w.d)].sort();
      if (all.length) {
        if (!hk.last || hk.last < all[all.length - 1]) hk.last = all[all.length - 1];
        if (!hk.first) hk.first = all[0];
      }
      hk.workouts = hk.workouts || [];
      for (const w of s.workouts) {
        const at = hk.workouts.findIndex((x) => x.id === w.id || (x.d === w.d && x.t === w.t));
        if (at < 0) hk.workouts.push(w);
        else if (hk.workouts[at].src === 'Shortcut') hk.workouts[at] = w; // an imported workout (zones, route) stays
      }
      hk.workouts.sort((a, b) => (a.id < b.id ? -1 : 1));
      const fats = s.weights.filter((w) => w.fat);
      if (fats.length) {
        const old = new Map((hk.body || []).map((b) => [b.date, b]));
        for (const w of fats) old.set(w.date, { ...(old.get(w.date) || {}), date: w.date, fat: w.fat, lb: w.lb });
        hk.body = [...old.values()];
        hk.body.sort((a, b) => (a.date < b.date ? -1 : 1));
      }
    },
  };
}

// ---------------------------------------------------------------- what the page shows
// One entry per day, newest first: a line each for activity, heart, sleep and weight, then the workouts.
export function syncDays(s) {
  const rows = {};
  const R = (iso) => (rows[iso] = rows[iso] || { iso, lines: [], workouts: [] });
  for (const iso of Object.keys(s.days)) {
    const d = s.days[iso];
    const act = [];
    if (d.st) act.push(`${n0(d.st)} steps`);
    if (d.ae) act.push(`${n0(d.ae)} active cal`);
    if (d.ex != null) act.push(`${d.ex} min exercise`);
    if (d.di) act.push(`${d.di} mi`);
    if (d.wat) act.push(`${d.wat} oz water`);
    const heart = [];
    if (d.ha) heart.push(`Heart ${d.ha} avg, ${d.hl}–${d.hh}`);
    if (d.rhr) heart.push(`resting ${d.rhr}`);
    if (d.hrv) heart.push(`HRV ${d.hrv} ms`);
    const r = R(iso);
    if (act.length) r.lines.push(act.join(' · '));
    if (heart.length) r.lines.push(heart.join(' · '));
    if (d.sl) {
      const st = d.sl.d != null ? `: deep ${fmtMin(d.sl.d)} · REM ${fmtMin(d.sl.r || 0)} · core ${fmtMin(d.sl.c || 0)}` : '';
      r.lines.push(`Slept ${fmtMin(d.sl.a || 0)}${st}`);
    }
  }
  for (const w of s.weights) R(w.date).lines.push(`Weighed ${w.lb} lb`);
  for (const w of s.workouts) R(w.d).workouts.push(`${w.label} ${fmtMin(w.min)}${w.kcal ? ` · ${n0(w.kcal)} cal` : ''}${w.hr ? ` · avg ${w.hr} bpm` : ''}`);
  return Object.values(rows)
    .map((r) => ({ ...r, bits: r.lines }))
    .sort((a, b) => (a.iso < b.iso ? 1 : -1));
}
export function syncTextSummary(s) {
  const bits = [];
  const n = Object.keys(s.days).length;
  if (n) bits.push(plural(n, 'day'));
  const nights = Object.values(s.days).filter((d) => d.sl).length;
  if (nights) bits.push(plural(nights, 'night') + ' of sleep');
  if (s.workouts.length) bits.push(plural(s.workouts.length, 'workout'));
  if (s.weights.length) bits.push(plural(s.weights.length, 'weigh-in'));
  return bits;
}

// ---------------------------------------------------------------- building the Shortcut
// The Text action's contents: each section name, then what to insert under it. [Brackets] are placeholders the
// guide says to replace with the variable of that name; the rest is typed (or pasted) as is.
// Heart rate is the long list, so it goes last: if a link were ever cut short, the rest would still be there, and
// the missing #end says so.
export const TEXT_TEMPLATE = [
  ['today', ['Current Date']],
  ['steps', ['Steps › Value', 'Steps › Start Date']],
  ['active', ['Active Energy › Value', 'Active Energy › Start Date']],
  ['exercise', ['Exercise Minutes › Value', 'Exercise Minutes › Start Date']],
  ['rhr', ['Resting Heart Rate › Value', 'Resting Heart Rate › Start Date']],
  ['hrv', ['Heart Rate Variability › Value', 'Heart Rate Variability › Start Date']],
  ['sleep', ['Sleep Analysis › Value', 'Sleep Analysis › Start Date', 'Sleep Analysis › End Date', 'Sleep Analysis › Source']],
  ['workouts', ['Workouts › Workout Type', 'Workouts › Start Date', 'Workouts › End Date']],
  ['workout-cal', ['Workouts › Active Energy']],
  ['hr', ['Heart Rate › Value', 'Heart Rate › Start Date']],
  ['end', []],
];
export const TEXT_EXTRAS = [
  ['resting', ['Resting Energy › Value', 'Resting Energy › Start Date']],
  ['distance', ['Walking + Running Distance › Value', 'Walking + Running Distance › Start Date']],
  ['flights', ['Flights Climbed › Value', 'Flights Climbed › Start Date']],
  ['weight', ['Weight › Value', 'Weight › Start Date']],
];
export const templateText = (list = TEXT_TEMPLATE) => list.map(([name, vars]) => [`#${name}`, ...vars.map((v) => `[${v}]`)].join('\n')).join('\n');
export const SHORTCUT_NAME = 'Health Sync';
export const runShortcutUrl = (name = SHORTCUT_NAME) => `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`;
export const linkStart = (base, key, dry = false) => `${base}#/health-sync?k=${key}&v=2&${dry ? 'dry=1&' : ''}d=`;
