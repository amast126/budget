// Patterns in your own Health data: how regular your sleep is (and a bedtime that fits your wake time), what
// seems to go with better or worse nights, and a one-page summary of any month. Nothing new is stored.
import { todayISO, addDays, sum } from './budget-logic.js';
import { getDay, totals, targets } from './health-logic.js';
import { hkDay, stepsFor, fmtMins, clock } from './hk-logic.js';
import { habitsOf, habitValue, habitDone, weightTrend, readiness, extraTotals } from './health-more.js';
import { dayLoad, workoutsFor, tennisSessions, prs, strengthDays, maxHr, zonesOf } from './health-training.js';

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = (a) => {
  const m = mean(a);
  return a.length > 1 ? Math.sqrt(sum(a, (x) => (x - m) ** 2) / (a.length - 1)) : 0;
};
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const r1 = (n) => Math.round(n * 10) / 10;
const n0 = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric' });

// ---------------------------------------------------------------- sleep consistency
export function sleepGoalMins(ctx) {
  const set = Number(ctx.health && ctx.health.sleepGoal);
  if (set >= 300 && set <= 660) return set;
  const hk = ctx.hk && ctx.hk.sleepGoal;
  return hk && hk.hours ? Math.round(hk.hours * 60) : 480;
}
export function sleepConsistency(ctx, today = todayISO(), nights = 14) {
  const list = [];
  for (let i = 0; i < nights; i++) {
    const iso = addDays(today, -i);
    const d = hkDay(ctx.hkYears, iso);
    if (d && d.sl && d.sl.a >= 120) list.push({ iso, ...d.sl });
  }
  const goal = sleepGoalMins(ctx);
  const timed = list.filter((x) => x.s != null && x.e != null);
  const week = list.filter((x) => x.iso > addDays(today, -7));
  const out = { goal, nights: list.length };
  if (week.length >= 3) {
    // Debt over the nights tracked this week, scaled to 7 so a missing night doesn't count as sleep.
    const short = sum(week, (x) => goal - x.a);
    out.debt = Math.round((short / week.length) * 7);
    out.debtNights = week.length;
  }
  if (timed.length < 5) return out;
  const bed = timed.map((x) => x.s);
  const wake = timed.map((x) => x.e);
  const sdBed = sd(bed);
  const sdWake = sd(wake);
  const spread = (sdBed + sdWake) / 2;
  out.score = Math.max(0, Math.min(100, Math.round(100 - spread * 1.2)));
  out.label = out.score >= 80 ? 'Very regular' : out.score >= 60 ? 'Fairly regular' : 'Irregular';
  out.sdBed = Math.round(sdBed);
  out.sdWake = Math.round(sdWake);
  out.bed = mean(bed);
  out.wake = mean(wake);
  // Minutes in bed but not asleep (falling asleep, waking in the night), 10–60.
  const lag = timed.filter((x) => x.b).map((x) => x.b - x.a);
  out.lag = Math.max(10, Math.min(60, Math.round(lag.length ? median(lag) : 20)));
  const wakeAt = median(wake);
  let lights = wakeAt - goal - out.lag;
  if (out.debt > 120) lights -= 30; // a few earlier nights to pay some back
  out.suggest = { lights: Math.round(lights / 5) * 5, wake: Math.round(wakeAt / 5) * 5, catchUp: out.debt > 120 };
  return out;
}

// ---------------------------------------------------------------- what goes with better or worse sleep
// Each factor is something from the day before a night; outcomes are that night's sleep and the next morning's HRV
// and resting heart rate. Only differences big enough to notice, with 4+ nights on each side, are reported.
export function sleepFactors(ctx, today = todayISO(), days = 150) {
  const habits = habitsOf(ctx.health);
  const has = (id) => habits.some((x) => x.id === id);
  const t = ctx.health ? targets(ctx.health) : {};
  const goal = (ctx.health && ctx.health.stepGoal) || 8000;
  const max = maxHr(ctx.health);
  const rows = [];
  const loads = [];
  for (let i = 1; i <= days; i++) {
    const iso = addDays(today, -i);
    const next = hkDay(ctx.hkYears, addDays(iso, 1));
    if (!next) continue;
    const o = { sleep: next.sl && next.sl.a >= 120 ? next.sl.a : null, hrv: next.hrv != null ? next.hrv : null, rhr: next.rhr != null ? next.rhr : null };
    if (o.sleep == null && o.hrv == null) continue;
    const day = getDay(ctx.years || {}, iso);
    const hd = hkDay(ctx.hkYears, iso);
    const ws = workoutsFor(ctx, iso);
    const load = dayLoad(ctx, iso, max);
    loads.push(load);
    const f = {};
    if (has('alcohol') && (day.hb || day.hbAt)) f.alcohol = (habitValue(ctx.years, ctx.hkYears, { id: 'alcohol', kind: 'count' }, iso) || 0) > 0;
    const caf = habitValue(ctx.years, ctx.hkYears, { id: 'caffeine', kind: 'count' }, iso);
    if (caf != null || day.hbAt) f.caffeine = (caf || 0) >= 3;
    const timed = ws.filter((w) => w.t);
    if (timed.length || ws.length === 0) f.late = timed.some((w) => {
      const [h, m] = w.t.split(':').map(Number);
      return h * 60 + m + (w.min || 0) >= 20 * 60;
    });
    const steps = stepsFor(day, hd).steps;
    if (steps) f.steps = steps >= goal * 1.25;
    if (day.food.length >= 2 && t.cal) f.overate = totals(day.food).k > t.cal + 300;
    if (hd && hd.mm != null) f.mindful = hd.mm > 0;
    rows.push({ iso, f, o, load });
  }
  // A hard training day: in the top quarter of your days with any training.
  const trained = loads.filter((x) => x > 0).sort((a, b) => a - b);
  const hard = trained.length >= 8 ? trained[Math.floor(trained.length * 0.75)] : null;
  if (hard) rows.forEach((r) => (r.f.hard = r.load >= hard));
  const FACT = [
    ['alcohol', 'After a drink', 'nights after you drink'],
    ['caffeine', '3+ cups of coffee', 'nights after 3+ cups of caffeine'],
    ['late', 'Late workout', 'nights after a workout that ran past 8 pm'],
    ['hard', 'Hard training day', 'nights after a hard training day'],
    ['steps', 'Very active day', `nights after ${n0(goal * 1.25)}+ steps`],
    ['overate', 'Big eating day', 'nights after eating 300+ calories over target'],
    ['mindful', 'Mindful minutes', 'nights after a mindfulness session'],
  ];
  const out = [];
  for (const [id, label, phrase] of FACT) {
    const yes = rows.filter((r) => r.f[id] === true);
    const no = rows.filter((r) => r.f[id] === false);
    const diff = (k) => {
      const a = yes.map((r) => r.o[k]).filter((v) => v != null);
      const b = no.map((r) => r.o[k]).filter((v) => v != null);
      return a.length >= 4 && b.length >= 4 ? { d: mean(a) - mean(b), base: mean(b), n: [a.length, b.length] } : null;
    };
    const s = diff('sleep');
    const h = diff('hrv');
    const r = diff('rhr');
    if (!s && !h && !r) continue;
    const bits = [];
    let weight = 0;
    let good = 0;
    if (s && Math.abs(s.d) >= 15) {
      bits.push(`you sleep ${fmtMins(Math.abs(s.d))} ${s.d < 0 ? 'less' : 'more'}`);
      weight += Math.abs(s.d) / 30;
      good += Math.sign(s.d);
    }
    if (h && Math.abs(h.d / h.base) >= 0.05) {
      const p = Math.round(Math.abs(h.d / h.base) * 100);
      bits.push(`your HRV is ${p}% ${h.d < 0 ? 'lower' : 'higher'}`);
      weight += Math.abs(h.d / h.base) / 0.1;
      good += Math.sign(h.d);
    }
    if (r && Math.abs(r.d) >= 1.5) {
      bits.push(`your resting heart rate is ${r1(Math.abs(r.d))} bpm ${r.d > 0 ? 'higher' : 'lower'}`);
      weight += Math.abs(r.d) / 3;
      good -= Math.sign(r.d);
    }
    const n = (s || h || r).n;
    if (!bits.length) {
      out.push({ id, label, none: true, n, text: `No clear difference on ${phrase} (${n[0]} nights vs ${n[1]}).` });
      continue;
    }
    const list = bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : bits[0];
    out.push({ id, label, n, weight, tone: good > 0 ? 'good' : good < 0 ? 'bad' : 'mixed', sleep: s && r1(s.d), hrv: h && r1(h.d), rhr: r && r1(r.d), text: `On ${phrase}, ${list} (${n[0]} nights vs ${n[1]}).` });
  }
  out.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  return { factors: out, nights: rows.length };
}

// ---------------------------------------------------------------- monthly report
const monthDays = (month, today) => {
  const out = [];
  for (let d = `${month}-01`; d.slice(0, 7) === month && d <= today; d = addDays(d, 1)) out.push(d);
  return out;
};
export function prevMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthTitle(month) {
  return new Date(`${month}-15T12:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
function monthNumbers(ctx, month, today) {
  const days = monthDays(month, today);
  const hds = days.map((iso) => ({ iso, d: hkDay(ctx.hkYears, iso), day: getDay(ctx.years || {}, iso) }));
  const pickAvg = (fn) => {
    const v = hds.map(fn).filter((x) => x != null && Number.isFinite(x));
    return v.length ? { v: mean(v), n: v.length } : null;
  };
  const t = ctx.health ? targets(ctx.health) : {};
  const logged = hds.filter((x) => x.day.food.length >= 2 && (!t.cal || totals(x.day.food).k >= t.cal * 0.5));
  const ext = logged.map((x) => extraTotals(x.day.food)).filter((x) => x.counted >= x.of * 0.6);
  const ws = days.flatMap((iso) => workoutsFor(ctx, iso));
  const max = maxHr(ctx.health);
  const zone = [0, 0, 0, 0, 0];
  ws.forEach((w) => {
    const z = zonesOf(w, max);
    if (z) z.mins.forEach((m, i) => (zone[i] += m));
  });
  const tennis = tennisSessions(ctx, days[0] || `${month}-01`, days[days.length - 1] || `${month}-01`);
  return {
    days: days.length,
    steps: pickAvg((x) => stepsFor(x.day, x.d).steps),
    active: pickAvg((x) => (x.d ? x.d.ae : null)),
    exercise: pickAvg((x) => (x.d ? x.d.ex : null)),
    sleep: pickAvg((x) => (x.d && x.d.sl && x.d.sl.a >= 120 ? x.d.sl.a : null)),
    rhr: pickAvg((x) => (x.d ? x.d.rhr : null)),
    hrv: pickAvg((x) => (x.d ? x.d.hrv : null)),
    cal: logged.length ? { v: mean(logged.map((x) => totals(x.day.food).k)), n: logged.length } : null,
    protein: logged.length ? { v: mean(logged.map((x) => totals(x.day.food).p)), n: logged.length } : null,
    fiber: ext.length ? { v: mean(ext.map((x) => x.fib)), n: ext.length } : null,
    sodium: ext.length ? { v: mean(ext.map((x) => x.na)), n: ext.length } : null,
    workouts: ws.length,
    workoutMin: Math.round(sum(ws, (w) => w.min)),
    load: Math.round(sum(days, (iso) => dayLoad(ctx, iso, max))),
    zone: zone.map(Math.round),
    tennisHours: r1(sum(tennis, (s) => s.min || 0) / 60),
    tennisN: tennis.length,
    liftDays: days.length ? strengthDays(ctx.years || {}, days[0], days[days.length - 1]).length : 0,
  };
}
// Best and worst 7-night stretch (with at least 5 nights tracked) inside the month.
function sleepWeeks(ctx, month, today) {
  const days = monthDays(month, today);
  const weeks = [];
  for (let i = 0; i + 6 < days.length; i++) {
    const v = days
      .slice(i, i + 7)
      .map((iso) => hkDay(ctx.hkYears, iso))
      .filter((d) => d && d.sl && d.sl.a >= 120)
      .map((d) => d.sl.a);
    if (v.length >= 5) weeks.push({ from: days[i], to: days[i + 6], avg: mean(v) });
  }
  if (!weeks.length) return null;
  const best = weeks.reduce((a, b) => (b.avg > a.avg ? b : a));
  const worst = weeks.reduce((a, b) => (b.avg < a.avg ? b : a));
  return best.from === worst.from ? { best } : { best, worst };
}
export function monthReport(ctx, month, today = todayISO()) {
  const cur = monthNumbers(ctx, month, today);
  const prev = monthNumbers(ctx, prevMonth(month), today);
  const days = monthDays(month, today);
  const first = days[0];
  const last = days[days.length - 1];
  // Weight: the smoothed trend at the start and end of the month.
  let weight = null;
  if (ctx.health && last) {
    const tEnd = weightTrend(ctx.health, last);
    const tStart = weightTrend(ctx.health, addDays(first, -1));
    const inMonth = (ctx.health.weights || []).filter((w) => w.date.slice(0, 7) === month).length;
    if (tEnd && inMonth) weight = { end: tEnd.trend, start: tStart ? tStart.trend : null, change: tStart ? r1(tEnd.trend - tStart.trend) : null, n: inMonth };
  }
  const monthPrs = first ? prs(ctx.years || {}, first, last) : [];
  // Habits: share of tracked days you kept each one.
  const habits = habitsOf(ctx.health).map((hb) => {
    let done = 0;
    let tracked = 0;
    let run = 0;
    let best = 0;
    for (const iso of days) {
      const day = getDay(ctx.years || {}, iso);
      const v = habitValue(ctx.years, ctx.hkYears, hb, iso);
      const any = day.hb || day.hbAt || (hb.kind !== 'check' && v != null);
      if (any) tracked++;
      if (habitDone(ctx.years, ctx.hkYears, hb, iso)) {
        done++;
        best = Math.max(best, ++run);
      } else run = 0;
    }
    return { id: hb.id, name: hb.name, done, tracked, best };
  });
  // Readiness mix, for mornings with enough data.
  const mix = { ready: 0, normal: 0, easy: 0 };
  let rsum = 0;
  let rn = 0;
  for (const iso of days) {
    const r = readiness(ctx, iso);
    if (r) {
      mix[r.level]++;
      rsum += r.score;
      rn++;
    }
  }
  const sc = { bed: [], wake: [] };
  days.forEach((iso) => {
    const d = hkDay(ctx.hkYears, iso);
    if (d && d.sl && d.sl.s != null && d.sl.e != null && d.sl.a >= 120) {
      sc.bed.push(d.sl.s);
      sc.wake.push(d.sl.e);
    }
  });
  return {
    month,
    title: monthTitle(month),
    partial: last && last === today,
    days: days.length,
    cur,
    prev,
    weight,
    prs: monthPrs,
    habits: habits.filter((x) => x.tracked),
    readiness: rn ? { ...mix, avg: Math.round(rsum / rn), n: rn } : null,
    sleepWeeks: sleepWeeks(ctx, month, today),
    bedtime: sc.bed.length >= 5 ? { bed: clock(mean(sc.bed)), wake: clock(mean(sc.wake)) } : null,
    range: first ? `${shortDate(first)} – ${shortDate(last)}` : '',
  };
}
// Months that have anything to report, newest first (for the month picker).
export function reportMonths(ctx, today = todayISO(), max = 24) {
  const out = [];
  const [y, m] = today.split('-').map(Number);
  for (let i = 0; i < max; i++) {
    const d = new Date(y, m - 1 - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const yr = String(d.getFullYear());
    const anyHk = ctx.hkYears && ctx.hkYears[yr] && Object.keys(ctx.hkYears[yr].days).some((x) => x.startsWith(k));
    const anyMine = ctx.years && ctx.years[yr] && Object.keys(ctx.years[yr].days).some((x) => x.startsWith(k));
    if (anyHk || anyMine) out.push(k);
  }
  return out;
}
