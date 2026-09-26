// "Pulse" of the dashboard: numbers that connect the tabs. Life rings, streaks, the week in review, insights,
// countdowns, the Home header's line for the time of day, and per-day series for the heatmap.
// Everything here is computed from documents the app already loads; nothing new is stored except the to-do log.
import { homeSummary, keyOf, daysIn, addDays, todayISO, fmt0, sum, dateLabel } from './budget-logic.js';
import { getDay, totals, targets, weightSeries } from './health-logic.js';
import { hkDay, stepsFor, workoutsOn } from './hk-logic.js';
import { currentStep, projectPlan, hoursThisWeek, certState } from './learning-logic.js';
import { CERTS } from './learning-catalog.js';
import { deadlines, carMoney } from './auto-logic.js';

export const GTA6_RELEASE = '2026-11-19'; // Rockstar Games newswire, Nov 2025
const n0 = (n) => Math.round(Number(n) || 0).toLocaleString();
const plural = (n, w, many = `${w}s`) => `${n0(n)} ${Math.round(n) === 1 ? w : many}`;
const daysFrom = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);
const weekdayOf = (iso) => new Date(`${iso}T12:00:00`).toLocaleString('en-US', { weekday: 'short' });
const monthName = (iso) => new Date(`${iso.slice(0, 7)}-15T12:00:00`).toLocaleString('en-US', { month: 'long' });
const cleanName = (s) => String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();

// ---------------------------------------------------------------- per-day readers
export function spendByDay(data) {
  const out = {};
  for (const k in (data && data.months) || {}) {
    for (const t of data.months[k].transactions || []) {
      if (!t.date) continue;
      out[t.date] = (out[t.date] || 0) + (Number(t.amount) || 0);
    }
  }
  return out;
}
export const monthBudget = (data) => sum((data && data.config && data.config.categories) || [], (c) => Number(c.budget) || 0);
export const allowanceOn = (data, iso) => monthBudget(data) / daysIn(keyOf(iso));
function firstSpendDay(data) {
  const ks = Object.keys((data && data.months) || {})
    .filter((k) => (data.months[k].transactions || []).length)
    .sort();
  return ks.length ? `${ks[0]}-01` : null;
}
const txIn = (data, from, to) =>
  Object.keys((data && data.months) || {})
    .filter((k) => k >= from.slice(0, 7) && k <= to.slice(0, 7))
    .flatMap((k) => data.months[k].transactions || [])
    .filter((t) => t.date >= from && t.date <= to);

export function bodyOn(ctx, iso) {
  const d = getDay(ctx.years || {}, iso);
  const hd = hkDay(ctx.hkYears, iso);
  const steps = stepsFor(d, hd).steps || 0;
  const apple = workoutsOn(ctx.hk, iso);
  const minutes = sum(d.workouts, (w) => w.minutes) + sum(apple, (w) => w.min);
  const workouts = d.workouts.length + apple.length;
  const goal = (ctx.health && ctx.health.stepGoal) || 8000;
  return { steps, workouts, minutes, goal, ok: steps >= goal || workouts > 0 };
}
export const studyOn = (learning, iso) => sum(((learning && learning.log) || []).filter((e) => e.date === iso), (e) => e.minutes);
export function doneOn(home, iso) {
  if (!home) return 0;
  const logged = (home.doneLog && home.doneLog[iso]) || 0;
  const still = home.todos.filter((t) => t.done && t.doneAt === iso).length;
  return Math.max(logged, still);
}
const foodOn = (ctx, iso) => getDay(ctx.years || {}, iso).food;

// ---------------------------------------------------------------- life rings
// Money: at or under this month's budget pace. Body: step goal or a workout. Mind: today's share of your weekly
// study goal (or the week's goal already met). Home: finish up to 3 to-dos (or have a clear list).
export function lifeRings(ctx) {
  const today = ctx.today || todayISO();
  const out = [];
  if (ctx.data) {
    const s = homeSummary(ctx.data, ctx.now || new Date());
    const allowed = s.budget * s.pacing.frac;
    const closed = s.spent <= allowed + 0.005;
    out.push({ id: 'money', label: 'Money', value: closed ? 1 : allowed > 0 ? allowed / s.spent : 0, closed, detail: closed ? `${fmt0(allowed - s.spent)} under pace` : `${fmt0(s.spent - allowed)} over pace`, href: '#/budget', goal: 'At or under your budget pace for the month' });
  } else out.push({ id: 'money', label: 'Money', value: 0, closed: false, detail: '…', pending: true });
  if (ctx.health && ctx.years) {
    const b = bodyOn(ctx, today);
    out.push({ id: 'body', label: 'Body', value: b.workouts ? 1 : Math.min(1, b.steps / b.goal), closed: b.ok, detail: b.workouts ? `${plural(b.workouts, 'workout')} logged` : `${n0(b.steps)} of ${n0(b.goal)} steps`, href: '#/health', goal: `${n0(b.goal)} steps or any workout` });
  } else out.push({ id: 'body', label: 'Body', value: 0, closed: false, detail: '…', pending: true });
  if (ctx.learning) {
    const L = ctx.learning;
    const daily = Math.max(10, Math.round((L.hoursPerWeek * 60) / 7));
    const mins = studyOn(L, today);
    const weekDone = hoursThisWeek(L, ctx.now || new Date()) >= L.hoursPerWeek;
    const closed = mins >= daily || weekDone;
    out.push({ id: 'mind', label: 'Mind', value: closed ? 1 : mins / daily, closed, detail: weekDone && mins < daily ? 'Week goal met' : `${n0(mins)} of ${daily} min study`, href: '#/learning', goal: `${daily} min of study (your ${L.hoursPerWeek}h week ÷ 7), or the week’s goal met`, left: Math.max(0, daily - mins) });
  } else out.push({ id: 'mind', label: 'Mind', value: 0, closed: false, detail: '…', pending: true });
  if (ctx.home) {
    const open = ctx.home.todos.filter((t) => !t.done).length;
    const done = doneOn(ctx.home, today);
    const goal = Math.min(3, open + done);
    const closed = goal === 0 || done >= goal;
    out.push({ id: 'home', label: 'Home', value: goal ? Math.min(1, done / goal) : 1, closed, detail: goal === 0 ? 'List is clear' : `${done} of ${goal} to-do${goal === 1 ? '' : 's'}`, href: '#/', goal: 'Finish 3 to-dos (or clear the list)' });
  } else out.push({ id: 'home', label: 'Home', value: 0, closed: false, detail: '…', pending: true });
  return out;
}

// ---------------------------------------------------------------- streaks
function runOf(ok, today, first, cap = 800) {
  if (!first || first > today) return { current: ok(today) ? 1 : 0, best: ok(today) ? 1 : 0, today: ok(today) };
  const start = daysFrom(first, today) > cap ? addDays(today, -cap) : first;
  let best = 0;
  let run = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (ok(d)) {
      run++;
      if (run > best) best = run;
    } else run = 0;
  }
  const todayOk = ok(today);
  let current = todayOk ? 1 : 0;
  for (let d = addDays(today, -1); d >= start && ok(d); d = addDays(d, -1)) current++;
  return { current, best, today: todayOk };
}
function earliest(list) {
  const xs = list.filter(Boolean).sort();
  return xs[0] || null;
}
export function streaks(ctx) {
  const today = ctx.today || todayISO();
  const out = [];
  if (ctx.data) {
    const spend = spendByDay(ctx.data);
    // Only count days the card data covers (imports can lag behind today).
    const end = asOfDay(ctx.data, today);
    const r = runOf((d) => (spend[d] || 0) <= allowanceOn(ctx.data, d) + 0.005, end, firstSpendDay(ctx.data), 400);
    out.push({ id: 'money', label: 'under daily budget', short: 'Under budget', ...r, hint: `${fmt0(allowanceOn(ctx.data, today))}/day${end < today ? `, card data through ${dateLabel(end)}` : ''}` });
  }
  if (ctx.health && ctx.years) {
    const dates = [...Object.values(ctx.years).flatMap((y) => Object.keys(y.days || {})), ...Object.values(ctx.hkYears || {}).flatMap((y) => Object.keys(y.days || {})), ...((ctx.hk && ctx.hk.workouts) || []).map((w) => w.d)];
    const r = runOf((d) => bodyOn(ctx, d).ok, today, earliest(dates.filter((d) => d >= addDays(today, -730))), 730);
    out.push({ id: 'body', label: 'active days', short: 'Active', ...r, hint: 'step goal or a workout' });
    const food = Object.values(ctx.years).flatMap((y) => Object.keys(y.days || {}).filter((d) => (y.days[d].food || []).length));
    const f = runOf((d) => foodOn(ctx, d).length > 0, today, earliest(food), 730);
    out.push({ id: 'food', label: 'days of food logged', short: 'Food logged', ...f, hint: 'anything logged' });
  }
  if (ctx.learning) {
    const L = ctx.learning;
    const r = runOf((d) => studyOn(L, d) > 0, today, earliest(L.log.map((e) => e.date)), 730);
    out.push({ id: 'mind', label: 'study days', short: 'Study', ...r, hint: 'any study logged' });
  }
  if (ctx.home) {
    const H = ctx.home;
    const first = earliest([...Object.keys(H.doneLog || {}).filter((d) => H.doneLog[d] > 0), ...H.todos.map((t) => t.doneAt)]);
    const r = runOf((d) => doneOn(H, d) > 0, today, first, 400);
    out.push({ id: 'home', label: 'days with a to-do done', short: 'To-dos', ...r, hint: 'a to-do finished' });
  }
  return out;
}

// ---------------------------------------------------------------- week in review
export function mondayOf(iso) {
  const dow = (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
  return addDays(iso, -dow);
}
export function weekReview(ctx, start) {
  const today = ctx.today || todayISO();
  const end = addDays(start, 6);
  const last = end < today ? end : today;
  const days = [];
  for (let d = start; d <= last; d = addDays(d, 1)) days.push(d);
  const out = { start, end, last, n: days.length, complete: end < today };
  if (ctx.data && asOfDay(ctx.data, today) < start) out.noCard = asOfDay(ctx.data, today);
  else if (ctx.data) {
    const through = asOfDay(ctx.data, today);
    if (through < last) out.cardThrough = through;
    const tx = txIn(ctx.data, start, last);
    out.spent = sum(tx, (t) => t.amount);
    out.allowance = sum(days, (d) => allowanceOn(ctx.data, d));
    const dining = tx.filter((t) => /dining|restaurant|takeout/i.test(t.category || ''));
    out.dining = { n: dining.length, amount: sum(dining, (t) => t.amount) };
    out.groceries = sum(tx.filter((t) => /grocer/i.test(t.category || '')), (t) => t.amount);
  }
  if (ctx.health && ctx.years) {
    const body = days.map((d) => bodyOn(ctx, d));
    out.workouts = { n: sum(body, (b) => b.workouts), minutes: sum(body, (b) => b.minutes) };
    const stepDays = body.filter((b) => b.steps > 0);
    out.steps = stepDays.length ? sum(stepDays, (b) => b.steps) / stepDays.length : null;
    out.activeDays = body.filter((b) => b.ok).length;
    const logged = days.map((d) => foodOn(ctx, d)).filter((f) => f.length);
    const t = targets(ctx.health);
    out.food = { days: logged.length, avg: logged.length ? sum(logged, (f) => totals(f).k) / logged.length : null, target: t.cal || null };
    const nights = days.map((d) => hkDay(ctx.hkYears, d)).filter((x) => x && x.sl && x.sl.a >= 120);
    out.sleep = nights.length ? { avg: sum(nights, (x) => x.sl.a) / nights.length, n: nights.length } : null;
  }
  if (ctx.learning) out.study = { minutes: sum(days, (d) => studyOn(ctx.learning, d)), goal: ctx.learning.hoursPerWeek * 60 };
  if (ctx.home) out.todos = sum(days, (d) => doneOn(ctx.home, d));
  return out;
}
// One line for the top of the recap.
export function weekHeadline(w) {
  const parts = [];
  if (w.spent != null && w.allowance) {
    const diff = w.allowance - w.spent;
    parts.push(diff >= 0 ? `${fmt0(diff)} under your weekly budget` : `${fmt0(-diff)} over your weekly budget`);
  }
  if (w.workouts && w.workouts.n) parts.push(plural(w.workouts.n, 'workout'));
  if (w.study && w.study.minutes) parts.push(`${(Math.round((w.study.minutes / 60) * 10) / 10).toString()}h of study`);
  if (w.todos) parts.push(plural(w.todos, 'to-do') + ' done');
  if (!parts.length) return 'A quiet week so far.';
  const s = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

// ---------------------------------------------------------------- insights (cross-tab)
// Each returns { id, tone: 'good' | 'watch' | 'info', text, href } or null. Ranked: things to watch, then wins, then context.
// Budget transactions are imported from card statements, so they can lag. Compare only through the latest
// day that has transactions this month.
export function asOfDay(data, today) {
  const key = keyOf(today);
  const ds = ((data.months || {})[key] ? data.months[key].transactions || [] : []).map((t) => t.date).filter((d) => d && d <= today);
  const last = ds.length ? ds.sort().pop() : null;
  return last && last < today ? last : today;
}
const throughNote = (asOf, today) => (asOf < addDays(today, -2) ? ` (card data through ${dateLabel(asOf).replace(/^\w+, /, '')})` : '');
function monthPaceCompare(data, re, today) {
  const key = keyOf(today);
  const asOf = asOfDay(data, today);
  const day = Number(asOf.slice(8, 10));
  const prev = Object.keys(data.months || {})
    .filter((k) => k < key && (data.months[k].transactions || []).length)
    .sort()
    .slice(-3);
  if (prev.length < 2) return null;
  const catTotal = (k) => sum((data.months[k].transactions || []).filter((t) => re.test(t.category || '')), (t) => t.amount);
  const usualDaily = sum(prev, (k) => catTotal(k) / daysIn(k)) / prev.length;
  const now = catTotal(key);
  const usualByNow = usualDaily * day;
  return { now, usualByNow, diff: usualByNow - now, day, asOf, usualMonth: usualDaily * daysIn(key) };
}
export function insights(ctx) {
  const today = ctx.today || todayISO();
  const out = [];
  const D = ctx.data;
  if (D && D.config) {
    // Dining vs usual, with groceries alongside.
    const dine = monthPaceCompare(D, /dining|restaurant/i, today);
    if (dine && dine.day >= 5 && Math.abs(dine.diff) >= 15) {
      const g = monthPaceCompare(D, /grocer/i, today);
      const tail = g ? ` Groceries so far: ${fmt0(g.now)}.` : '';
      const note = throughNote(dine.asOf, today);
      out.push(
        dine.diff > 0
          ? { id: 'dining', tone: 'good', text: `Dining out is running ${fmt0(dine.diff)} under your usual pace for ${monthName(today)}: ${fmt0(dine.now)} vs about ${fmt0(dine.usualByNow)} by this point${note}.${tail}`, href: '#/budget' }
          : { id: 'dining', tone: 'watch', text: `Dining out is ${fmt0(-dine.diff)} ahead of your usual pace for ${monthName(today)}: ${fmt0(dine.now)} vs about ${fmt0(dine.usualByNow)} by this point${note}.${tail}`, href: '#/budget' }
      );
    }
    // The category furthest from usual (not dining, already covered).
    let worst = null;
    for (const c of D.config.categories || []) {
      if (/dining|restaurant/i.test(c.name)) continue;
      const esc = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const x = monthPaceCompare(D, new RegExp(`^${esc}$`), today);
      if (!x || x.usualByNow < 20) continue;
      const pct = (x.now - x.usualByNow) / x.usualByNow;
      if (x.now - x.usualByNow >= 40 && pct >= 0.3 && (!worst || pct > worst.pct)) worst = { name: c.name, pct, ...x };
    }
    if (worst && worst.day >= 5) out.push({ id: 'category', tone: 'watch', text: `${worst.name} is ${Math.round(worst.pct * 100)}% above your usual pace: ${fmt0(worst.now)} so far vs about ${fmt0(worst.usualByNow)} by this point${throughNote(worst.asOf, today)}.`, href: '#/budget' });
    // Priciest weekday, over the last 13 weeks.
    const spend = spendByDay(D);
    const from = addDays(today, -91);
    const first = firstSpendDay(D);
    const asOf = asOfDay(D, today);
    if (first && first <= addDays(today, -56)) {
      // Medians, so one big purchase doesn't make a day look expensive.
      const byDow = [[], [], [], [], [], [], []];
      for (let d = from > first ? from : first; d <= asOf && d < today; d = addDays(d, 1)) byDow[new Date(`${d}T12:00:00`).getDay()].push(spend[d] || 0);
      const med = byDow.map((v) => {
        if (!v.length) return 0;
        const x = [...v].sort((a, b) => a - b);
        return x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2;
      });
      const hi = med.indexOf(Math.max(...med));
      const lo = med.indexOf(Math.min(...med));
      const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
      if (med[hi] >= 20 && med[hi] >= med[lo] * 1.6) out.push({ id: 'weekday', tone: 'info', text: `${names[hi]} are your priciest day: a typical one runs about ${fmt0(med[hi])}, vs ${fmt0(med[lo])} on ${names[lo]} (last 3 months).`, href: '#/budget' });
    }
    // Runway to payday.
    const s = homeSummary(D, ctx.now || new Date());
    if (s.payday && s.payday.days > 0 && s.payday.days <= 7 && s.left > 0) {
      out.push({ id: 'payday', tone: 'info', text: `Payday is ${s.payday.days === 1 ? 'tomorrow' : `in ${s.payday.days} days`}. You have ${fmt0(s.left)} left in this month’s budget, about ${fmt0(s.left / Math.max(1, s.pacing.days - s.pacing.day + 1))} a day.`, href: '#/budget' });
    }
  }
  const Hh = ctx.health;
  if (Hh && ctx.years) {
    // Weight trend, when you weigh in regularly.
    const series = weightSeries(Hh).filter((p) => p.date >= addDays(today, -35));
    if (series.length >= 4) {
      const a = series[0].avg;
      const b = series[series.length - 1].avg;
      const ch = Math.round((b - a) * 10) / 10;
      const goal = Hh.profile.goal || 'maintain';
      const good = goal === 'maintain' ? Math.abs(ch) <= 1 : goal === 'gain' ? ch > 0 : ch < 0;
      out.push({ id: 'weight', tone: good ? 'good' : 'watch', text: Math.abs(ch) < 0.3 ? `Your weight is holding steady at ${b} lb (7-day average) this month.` : `Your weight is ${ch < 0 ? 'down' : 'up'} ${Math.abs(ch)} lb over the last month (7-day average, now ${b} lb).`, href: '#/health' });
    }
    // Calories this week vs target.
    const t = targets(Hh);
    const wk = [];
    for (let i = 0; i < 7; i++) {
      const f = foodOn(ctx, addDays(today, -i));
      if (f.length && i > 0) wk.push(totals(f).k);
    }
    if (t.cal && wk.length >= 3) {
      const avg = sum(wk) / wk.length;
      const d = Math.round(avg - t.cal);
      out.push({ id: 'calories', tone: Math.abs(d) <= 150 ? 'good' : 'watch', text: `You’ve averaged ${n0(avg)} calories on the ${wk.length} days you logged this week, ${Math.abs(d) <= 150 ? 'right around' : d < 0 ? `${n0(-d)} under` : `${n0(d)} over`} your ${n0(t.cal)} target.`, href: '#/health' });
    }
    // Steps, this month vs the one before (typed or from Apple Health).
    const avgSteps = (a, b) => {
      const v = [];
      for (let d = a; d <= b; d = addDays(d, 1)) {
        const st = bodyOn(ctx, d).steps;
        if (st) v.push(st);
      }
      return v.length >= 14 ? sum(v) / v.length : null;
    };
    const cur = avgSteps(addDays(today, -29), addDays(today, -1));
    const prev = avgSteps(addDays(today, -59), addDays(today, -30));
    if (cur && prev) {
      const pct = Math.round(((cur - prev) / prev) * 100);
      if (Math.abs(pct) >= 10) out.push({ id: 'steps', tone: pct > 0 ? 'good' : 'watch', text: `Steps are ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% on the month before: ${n0(cur)} a day vs ${n0(prev)}.`, href: '#/health' });
    }
  }
  const L = ctx.learning;
  if (L) {
    const id = currentStep(L);
    if (id) {
      const step = projectPlan(L, ctx.now || new Date()).find((p) => p.id === id);
      const week = hoursThisWeek(L, ctx.now || new Date());
      const need = Math.max(0, L.hoursPerWeek - week);
      const c = CERTS[id];
      const name = c.kind === 'cert' ? c.code : c.name;
      const when = step && step.target ? new Date(`${step.target}T12:00:00`).toLocaleString('en-US', { month: 'short', year: 'numeric' }) : null;
      const st = certState(L, id);
      const text =
        st.status === 'booked' && st.examDate
          ? `Your ${name} exam is ${dateLabel(st.examDate)}. ${need ? `${Math.round(need * 10) / 10}h more study this week hits your ${L.hoursPerWeek}h goal.` : 'You’ve hit this week’s study goal.'}`
          : `${need ? `${Math.round(need * 10) / 10}h more study this week hits your ${L.hoursPerWeek}h goal` : `You’ve hit this week’s ${L.hoursPerWeek}h study goal`}${when ? `; at that pace ${name} lands around ${when}` : ''}.`;
      out.push({ id: 'study', tone: need ? 'info' : 'good', text, href: '#/learning' });
    }
  }
  const rank = { watch: 0, good: 1, info: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// ---------------------------------------------------------------- countdowns for the header
export function countdowns(ctx) {
  const today = ctx.today || todayISO();
  const out = [];
  if (ctx.data) {
    const s = homeSummary(ctx.data, ctx.now || new Date());
    if (s.payday) out.push({ id: 'payday', n: s.payday.days, unit: s.payday.days === 1 ? 'day' : 'days', label: 'to payday', text: s.payday.days === 0 ? 'Payday today' : null, href: '#/budget', sort: s.payday.days });
  }
  if (ctx.auto) {
    for (const d of deadlines(ctx.auto, today)) {
      if (d.days == null || d.days > 90) continue;
      const name = d.id === 'inspection' ? 'inspection' : d.id === 'registration' ? 'registration' : 'insurance renewal';
      out.push({ id: d.id, n: Math.abs(d.days), unit: Math.abs(d.days) === 1 ? 'day' : 'days', label: d.days < 0 ? `${name} overdue` : `to ${name}`, tone: d.days <= 14 ? 'soon' : '', href: '#/auto', sort: d.days });
    }
  }
  if (ctx.learning) {
    const id = currentStep(ctx.learning);
    if (id) {
      const c = CERTS[id];
      const st = certState(ctx.learning, id);
      const name = c.kind === 'cert' ? c.code : c.name;
      if (st.status === 'booked' && st.examDate) {
        const n = daysFrom(today, st.examDate);
        if (n >= 0) out.push({ id: 'exam', n, unit: n === 1 ? 'day' : 'days', label: `to ${name} exam`, href: '#/learning', sort: n });
      } else {
        const step = projectPlan(ctx.learning, ctx.now || new Date()).find((p) => p.id === id);
        if (step && step.target) {
          const n = daysFrom(today, step.target);
          if (n >= 0) out.push({ id: 'target', n, unit: n === 1 ? 'day' : 'days', label: `to ${name} target`, href: '#/learning', sort: n });
        }
      }
    }
  }
  const g = daysFrom(today, GTA6_RELEASE);
  if (g >= 0) out.push({ id: 'gta', n: g, unit: g === 1 ? 'day' : 'days', label: 'to GTA VI', text: g === 0 ? 'GTA VI is out' : null, sort: g });
  if (ctx.data) {
    const m = carMoney(ctx.data, today);
    if (m && m.loan && m.loan.left) out.push({ id: 'car', n: m.loan.left, unit: m.loan.left === 1 ? 'payment' : 'payments', label: 'left on the car', href: '#/auto', sort: 9999 });
  }
  return out.sort((a, b) => a.sort - b.sort);
}

// ---------------------------------------------------------------- the header's line for right now
export function phaseOf(date = new Date()) {
  const h = date.getHours();
  return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 16 ? 'midday' : h >= 16 && h < 21 ? 'evening' : 'night';
}
export function dayLine(ctx) {
  const now = ctx.now || new Date();
  const today = ctx.today || todayISO();
  const phase = ctx.phase || phaseOf(now);
  const urgent = [];
  const extra = [];
  const wx = ctx.wx;
  let s = null;
  if (ctx.data) s = homeSummary(ctx.data, now);
  if (ctx.auto) {
    for (const d of deadlines(ctx.auto, today)) {
      if (d.days == null) continue;
      if (d.days < 0) urgent.push(`Your ${d.name.replace('NYS ', '')} ran out ${dateLabel(d.date)}.`);
      else if (d.days <= 7) urgent.push(`${d.name} ${d.days === 0 ? 'is due today' : d.days === 1 ? 'is due tomorrow' : `is due ${weekdayOf(d.date)} (${d.days} days)`}.`);
    }
  }
  if (s) {
    if (s.payday && s.payday.days === 0) urgent.push('It’s payday.');
    else if (s.payday && s.payday.days === 1 && phase !== 'morning') urgent.push('Payday is tomorrow.');
    const soon = s.upcoming.filter((u) => !u.paid && u.daysAway <= 1);
    if (soon.length) {
      const u = soon[0];
      urgent.push(`${cleanName(u.name)} (${fmt0(u.cost)}) charges ${u.daysAway === 0 ? 'today' : 'tomorrow'}${soon.length > 1 ? `, plus ${soon.length - 1} more` : ''}.`);
    }
  }
  const t = ctx.health ? targets(ctx.health) : null;
  const food = ctx.health && ctx.years ? foodOn(ctx, today) : [];
  const calLeft = t && t.cal && food.length ? t.cal - totals(food).k : null;
  if (phase === 'morning') {
    if (wx) extra.push(`${wx.dayText}, high ${wx.high}°${wx.rainFrom && !wx.rainNow ? `, rain from about ${wx.rainFrom}` : wx.rainNow ? ', rain around now' : ''}.`);
    if (wx && wx.tennis && wx.tennis.when === 'today') extra.push(`Good tennis weather ${wx.tennis.label}.`);
    if (ctx.home) {
      const open = ctx.home.todos.filter((x) => !x.done).length;
      if (open) extra.push(`${plural(open, 'to-do')} on your list.`);
    }
  } else if (phase === 'midday') {
    if (s && s.budget) {
      const allowed = s.budget * s.pacing.frac;
      extra.push(s.spent <= allowed ? `You’re ${fmt0(allowed - s.spent)} under budget pace for ${monthName(today)}.` : `You’re ${fmt0(s.spent - allowed)} over budget pace for ${monthName(today)}.`);
    }
    if (calLeft != null) extra.push(calLeft >= 0 ? `${n0(calLeft)} calories left today.` : `${n0(-calLeft)} calories over today.`);
    if (wx && wx.tennis && wx.tennis.when === 'today') extra.push(`Good tennis weather ${wx.tennis.label}.`);
  } else if (phase === 'evening') {
    if (calLeft != null) extra.push(calLeft >= 0 ? `${n0(calLeft)} calories left for tonight.` : `${n0(-calLeft)} calories over today.`);
    if (ctx.pick && ctx.pick.m && !ctx.pick.m.missing.length) extra.push(`You have everything for ${ctx.pick.r.title}.`);
    const rings = lifeRings(ctx);
    const closed = rings.filter((r) => r.closed).length;
    if (closed === 4) extra.push('All four rings closed today.');
    else {
      const mind = rings.find((r) => r.id === 'mind' && !r.closed && r.left && r.left <= 45);
      extra.push(`${closed} of 4 rings closed${mind ? `; ${mind.left} more minutes of study closes Mind` : ''}.`);
    }
  } else {
    if (wx && wx.tomorrow) extra.push(`Tomorrow: ${wx.tomorrow.text.toLowerCase()}, high ${wx.tomorrow.high}°${wx.tomorrow.rain >= 40 ? `, ${wx.tomorrow.rain}% chance of rain` : ''}.`);
    if (wx && wx.tennis && wx.tennis.when === 'tomorrow') extra.push(`Good tennis weather ${wx.tennis.label}.`);
    if (s) {
      const tmr = s.upcoming.filter((u) => !u.paid && u.daysAway === 1);
      if (tmr.length && !urgent.some((x) => /tomorrow/.test(x))) extra.push(`${cleanName(tmr[0].name)} charges tomorrow.`);
    }
  }
  return [...urgent.slice(0, 2), ...extra].slice(0, 3);
}

// ---------------------------------------------------------------- sky for the header
// Phase of the sky from the place's sunrise/sunset ("2026-09-26T06:48"), and where the sun or moon sits (0–1 across).
export function skyOf(now = new Date(), sunriseISO, sunsetISO, code) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (iso, fallback) => (iso ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : fallback);
  const rise = toMin(sunriseISO, 6 * 60 + 45);
  const set = toMin(sunsetISO, 18 * 60 + 45);
  let phase;
  if (mins < rise - 40 || mins > set + 50) phase = 'night';
  else if (mins < rise + 60) phase = 'dawn';
  else if (mins > set - 75 && mins <= set + 10) phase = 'golden';
  else if (mins > set + 10) phase = 'dusk';
  else phase = 'day';
  const day = Math.min(1, Math.max(0, (mins - rise) / (set - rise)));
  const night = mins > set ? (mins - set) / (1440 - set + rise) : (mins + 1440 - set) / (1440 - set + rise);
  const c = Number(code);
  const kind = c >= 95 ? 'storm' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow' : c >= 51 ? 'rain' : c === 45 || c === 48 ? 'fog' : c === 3 ? 'cloudy' : c === 2 ? 'partly' : 'clear';
  return { phase, kind, x: phase === 'night' ? Math.min(1, Math.max(0, night)) : day };
}

// ---------------------------------------------------------------- heatmap series
export const HEAT_METRICS = [
  ['spend', 'Spending'],
  ['steps', 'Steps'],
  ['study', 'Study'],
  ['food', 'Calories'],
];
export function heatValue(ctx, metric, iso, cache) {
  if (metric === 'spend') {
    if (!ctx.data) return null;
    cache.spend = cache.spend || spendByDay(ctx.data);
    cache.first = cache.first === undefined ? firstSpendDay(ctx.data) : cache.first;
    return cache.first && iso >= cache.first ? cache.spend[iso] || 0 : null;
  }
  if (metric === 'steps') {
    if (!ctx.years) return null;
    const v = bodyOn(ctx, iso).steps;
    return v || null;
  }
  if (metric === 'study') {
    if (!ctx.learning) return null;
    cache.firstStudy = cache.firstStudy === undefined ? earliest(ctx.learning.log.map((e) => e.date)) : cache.firstStudy;
    return cache.firstStudy && iso >= cache.firstStudy ? studyOn(ctx.learning, iso) : null;
  }
  if (metric === 'food') {
    if (!ctx.years) return null;
    const f = foodOn(ctx, iso);
    return f.length ? totals(f).k : null;
  }
  return null;
}
// Four equal-count bins over the non-zero values (zero gets its own lightest step).
export function binsOf(values) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return [q(0.25), q(0.5), q(0.75)];
}
export const binOf = (v, cuts) => (v == null ? -1 : v <= 0 ? 0 : 1 + cuts.filter((c) => v > c).length);
