// Learning tab data and math. Progress lives in its own Firestore document (trackers/<id>-learning),
// separate from the budget, as { json: JSON.stringify(learning), updatedAt }.
import { CERTS, PLAN } from './learning-catalog.js';
import { OUTLINES, outlineItems } from './learning-outlines.js';
import { isoOf, todayISO, addDays, uid } from './budget-logic.js';

export const STATUSES = [
  ['planned', 'Planned'],
  ['studying', 'Studying'],
  ['booked', 'Exam booked'],
  ['passed', 'Passed'],
  ['skipped', 'Skipped'],
];
export const STATUS_TEXT = Object.fromEntries(STATUSES);

export function defaultLearning() {
  return {
    version: 1,
    hoursPerWeek: 4,
    plan: [...PLAN],
    certs: { 'ai-901': { status: 'studying' } },
    log: [],
  };
}

export function normalize(d) {
  const base = defaultLearning();
  if (!d || typeof d !== 'object') return base;
  const plan = Array.isArray(d.plan) ? d.plan.filter((id) => CERTS[id]) : base.plan;
  return {
    ...base,
    ...d,
    hoursPerWeek: Number(d.hoursPerWeek) > 0 ? Number(d.hoursPerWeek) : base.hoursPerWeek,
    plan,
    certs: d.certs && typeof d.certs === 'object' ? d.certs : base.certs,
    log: Array.isArray(d.log) ? d.log : [],
    prep: d.prep && typeof d.prep === 'object' ? d.prep : {},
  };
}

export const certState = (d, id) => (d.certs && d.certs[id]) || { status: 'planned' };
export const statusOf = (d, id) => certState(d, id).status || 'planned';
export const loggedHours = (d, id) => d.log.filter((e) => e.cert === id).reduce((a, e) => a + (Number(e.minutes) || 0), 0) / 60;

export function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return isoOf(d);
}
export function hoursThisWeek(d, now = new Date()) {
  const start = weekStart(now);
  return d.log.filter((e) => e.date >= start).reduce((a, e) => a + (Number(e.minutes) || 0), 0) / 60;
}

const monthLabel = (iso) => {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleString('en-US', { month: 'short', year: 'numeric' });
};
export const dayLabel = (iso) => {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
export const daysUntil = (iso, now = new Date()) => {
  const [y, m, day] = iso.split('-').map(Number);
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, day) - t) / 86400000);
};

// Walk the plan in order at the chosen pace. Booked exams pin to their date; passed ones drop out of the queue.
export function projectPlan(d, now = new Date()) {
  const pace = Math.max(0.5, Number(d.hoursPerWeek) || 4);
  let cursor = isoOf(now);
  return d.plan
    .filter((id) => CERTS[id])
    .map((id) => {
      const c = CERTS[id];
      const st = certState(d, id);
      const status = st.status || 'planned';
      const logged = loggedHours(d, id);
      const est = c.estHours;
      const out = { id, c, status, logged, est, pct: Math.min(1, logged / est) };
      if (status === 'skipped') return { ...out, target: null, label: 'Skipped' };
      if (status === 'passed') {
        const when = st.passedDate || null;
        return { ...out, pct: 1, target: when, label: when ? `Passed ${dayLabel(when)}` : 'Passed' };
      }
      if (status === 'booked' && st.examDate) {
        if (st.examDate > cursor) cursor = st.examDate;
        return { ...out, target: st.examDate, label: `Exam ${dayLabel(st.examDate)}`, exam: true };
      }
      const remaining = Math.max(est - logged, est * 0.1);
      const days = Math.ceil((remaining / pace) * 7) + (c.kind === 'cert' ? 7 : 0); // a week to book and sit the exam
      cursor = addDays(cursor, days);
      return { ...out, target: cursor, label: `Target ${monthLabel(cursor)}`, remaining };
    });
}

export function currentStep(d) {
  const order = d.plan.filter((id) => CERTS[id]);
  return (
    order.find((id) => statusOf(d, id) === 'booked') ||
    order.find((id) => statusOf(d, id) === 'studying') ||
    order.find((id) => statusOf(d, id) === 'planned') ||
    null
  );
}

// Passed certs that expire yearly: when they lapse and whether the free renewal window (6 months before) is open.
export function renewals(d, now = new Date()) {
  const today = isoOf(now);
  return Object.entries(d.certs || {})
    .filter(([id, st]) => CERTS[id] && CERTS[id].renewYearly && st.status === 'passed' && (st.expires || st.passedDate))
    .map(([id, st]) => {
      const expires = st.expires || addYear(st.passedDate);
      const opens = addMonths(expires, -6);
      return { id, c: CERTS[id], expires, opens, open: today >= opens, days: daysUntil(expires, now) };
    })
    .sort((a, b) => (a.expires < b.expires ? -1 : 1));
}
export function addYear(iso) {
  const [y, m, day] = iso.split('-').map(Number);
  return isoOf(new Date(y + 1, m - 1, day));
}
function addMonths(iso, n) {
  const [y, m, day] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1 + n, day));
}

export function remainingCost(d) {
  return d.plan.filter((id) => CERTS[id] && !['passed', 'skipped'].includes(statusOf(d, id))).reduce((a, id) => a + (CERTS[id].cost || 0), 0);
}

// ---- mutations (run inside a Firestore transaction) ----
export function setStatus(d, id, status) {
  d.certs = d.certs || {};
  const st = { ...(d.certs[id] || {}) };
  st.status = status;
  if (status === 'passed' && !st.passedDate) st.passedDate = todayISO();
  if (status === 'passed' && CERTS[id] && CERTS[id].renewYearly && !st.expires) st.expires = addYear(st.passedDate);
  if (status !== 'passed') {
    delete st.passedDate;
    delete st.expires;
  }
  d.certs[id] = st;
}
export function setField(d, id, key, value) {
  d.certs = d.certs || {};
  const st = { status: 'planned', ...(d.certs[id] || {}) };
  if (value === '' || value == null) delete st[key];
  else st[key] = value;
  if (key === 'passedDate' && value && CERTS[id] && CERTS[id].renewYearly) st.expires = addYear(value);
  d.certs[id] = st;
}
export function markRenewed(d, id) {
  const st = d.certs[id];
  if (!st) return;
  st.expires = addYear(st.expires || addYear(st.passedDate));
}
export function logTime(d, id, minutes, date = todayISO()) {
  const entry = { id: uid(), cert: id, minutes, date };
  d.log = [...(d.log || []), entry].slice(-2000);
  // logging time on something only planned means you've started it
  if (statusOf(d, id) === 'planned') setStatus(d, id, 'studying');
  return entry;
}
export function removeLog(d, entryId) {
  d.log = (d.log || []).filter((e) => e.id !== entryId);
}
export function addToPlan(d, id, afterId) {
  if (d.plan.includes(id)) return;
  const i = afterId ? d.plan.indexOf(afterId) : -1;
  d.plan.splice(i >= 0 ? i + 1 : d.plan.length, 0, id);
}
export function removeFromPlan(d, id) {
  d.plan = d.plan.filter((x) => x !== id);
}
export function move(d, id, dir) {
  const i = d.plan.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= d.plan.length) return;
  [d.plan[i], d.plan[j]] = [d.plan[j], d.plan[i]];
}

// ---------------------------------------------------------------- exam prep
// Per exam, in d.prep[id]: skills { outlineKey: 1 shaky | 2 solid }, modules { slug: date ticked }, tests [{ id, date,
// score, parts: { domainKey: score } }] (practice assessment results, percent).
export const SKILL_LEVELS = [
  [0, 'Not yet'],
  [1, 'Shaky'],
  [2, 'Solid'],
];
export const READY_SCORE = 80;
export const outlineOf = (id) => OUTLINES[id] || null;
export function prepOf(d, id) {
  const p = d.prep && d.prep[id];
  return { skills: (p && p.skills) || {}, modules: (p && p.modules) || {}, tests: p && Array.isArray(p.tests) ? p.tests : [] };
}
function prepFor(d, id) {
  if (!d.prep || typeof d.prep !== 'object') d.prep = {};
  const p = prepOf(d, id);
  d.prep[id] = { skills: { ...p.skills }, modules: { ...p.modules }, tests: [...p.tests] };
  return d.prep[id];
}
const started = (d, id) => statusOf(d, id) === 'planned' && setStatus(d, id, 'studying');
export function rateSkill(d, id, key, level) {
  const p = prepFor(d, id);
  if (level === 1 || level === 2) p.skills[key] = level;
  else delete p.skills[key];
  started(d, id);
}
export function toggleModule(d, id, slug, date = todayISO()) {
  const p = prepFor(d, id);
  if (p.modules[slug]) delete p.modules[slug];
  else p.modules[slug] = date;
  started(d, id);
}
const pct100 = (v) => {
  if (v === '' || v == null) return null;
  const n = Math.round(Number(String(v).replace('%', '')));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};
export function addTest(d, id, { score, parts = {}, date = todayISO() } = {}) {
  const s = pct100(score);
  if (s == null) return null;
  const p = prepFor(d, id);
  const t = { id: uid(), date, score: s };
  const clean = {};
  for (const [k, v] of Object.entries(parts || {})) {
    const n = pct100(v);
    if (n != null) clean[k] = n;
  }
  if (Object.keys(clean).length) t.parts = clean;
  p.tests = [...p.tests, t].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(-100);
  started(d, id);
  return t;
}
export function removeTest(d, id, testId) {
  const p = prepFor(d, id);
  p.tests = p.tests.filter((t) => t.id !== testId);
}
// Booking sets the date and the status together; clearing the date goes back to studying.
export function bookExam(d, id, date) {
  if (date) {
    setStatus(d, id, 'booked');
    setField(d, id, 'examDate', date);
  } else {
    setField(d, id, 'examDate', '');
    if (statusOf(d, id) === 'booked') setStatus(d, id, 'studying');
  }
}

// How ready you are, by your own ratings: each area counts by its share of the exam (the middle of Microsoft's
// range); solid counts 1, shaky ½, not yet 0.
const mid = (w) => (w[0] + w[1]) / 2;
export function readiness(o, prep) {
  const total = o.domains.reduce((a, dm) => a + mid(dm.weight), 0);
  const val = (k) => (prep.skills[k] === 2 ? 1 : prep.skills[k] === 1 ? 0.5 : 0);
  let pct = 0;
  let rated = 0;
  let count = 0;
  const domains = o.domains.map((dm) => {
    const keys = dm.groups.flatMap((g) => g.items.map(([k]) => k));
    const score = keys.reduce((a, k) => a + val(k), 0) / keys.length;
    const solid = keys.filter((k) => prep.skills[k] === 2).length;
    const shaky = keys.filter((k) => prep.skills[k] === 1).length;
    pct += (mid(dm.weight) / total) * score;
    rated += solid + shaky;
    count += keys.length;
    return { key: dm.key, name: dm.name, short: dm.short, weight: dm.weight, pct: score, solid, shaky, total: keys.length };
  });
  // What to study next: not yet before shaky, the bigger part of the exam first, then outline order.
  const all = outlineItems(o);
  const next = all
    .filter((x) => (prep.skills[x.key] || 0) < 2)
    .sort((a, b) => (prep.skills[a.key] || 0) - (prep.skills[b.key] || 0) || mid(b.domain.weight) - mid(a.domain.weight) || all.indexOf(a) - all.indexOf(b))
    .slice(0, 3);
  return { pct, domains, next, rated, count };
}
// The course modules ticked off, and about how long the rest takes (each path's time, shared out by units).
export function moduleProgress(o, prep) {
  const paths = o.course.paths.map((p) => {
    const units = p.modules.reduce((a, m) => a + m[2], 0);
    const doneUnits = p.modules.filter((m) => prep.modules[m[0]]).reduce((a, m) => a + m[2], 0);
    return { ...p, done: p.modules.filter((m) => prep.modules[m[0]]).length, units, doneUnits, minutesLeft: Math.round(p.minutes * (1 - doneUnits / units)) };
  });
  const total = paths.reduce((a, p) => a + p.modules.length, 0);
  const done = paths.reduce((a, p) => a + p.done, 0);
  return { paths, total, done, minutesLeft: paths.reduce((a, p) => a + p.minutesLeft, 0) };
}
// Practice assessment results: the latest, the average of the last three, and whether the last two both reached 80%.
export function testSummary(prep) {
  const t = prep.tests;
  if (!t.length) return null;
  const last = t[t.length - 1];
  const recent = t.slice(-3);
  const avg = Math.round(recent.reduce((a, x) => a + x.score, 0) / recent.length);
  const ready = t.length >= 2 && t.slice(-2).every((x) => x.score >= READY_SCORE);
  const change = t.length >= 2 ? last.score - t[t.length - 2].score : null;
  const broken = [...t].reverse().find((x) => x.parts && Object.keys(x.parts).length);
  const weak = broken ? Object.entries(broken.parts).sort((a, b) => a[1] - b[1])[0] : null;
  return { last, avg, ready, change, count: t.length, weak: weak ? { key: weak[0], score: weak[1] } : null };
}
// With an exam date: days to go, study hours left on the estimate, and the weekly pace that finishes them in time.
export function examPlan(d, id, now = new Date()) {
  const st = certState(d, id);
  if (!st.examDate || st.status !== 'booked') return null;
  const days = daysUntil(st.examDate, now);
  const c = CERTS[id];
  const left = Math.max(0, (c ? c.estHours : 0) - loggedHours(d, id));
  const perWeek = days > 0 ? Math.ceil((left / Math.max(1, days / 7)) * 2) / 2 : 0;
  return { date: st.examDate, days, left, perWeek, pace: d.hoursPerWeek, onPace: perWeek <= d.hoursPerWeek };
}

// ---------------------------------------------------------------- phone alerts (run by the morning alerts job)
const isoDays = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
export function weekStartISO(today) {
  const dow = (new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(today, -dow);
}
const hrs = (h) => `${Math.round(h * 10) / 10}h`;
// A booked exam two weeks, one week and a day out, and on the day; on Sundays, a nudge when the week's study is
// short of what the exam date needs. `sent` holds keys already sent, so each goes out once.
export function learningAlerts(d, today, sent = {}) {
  const out = [];
  const push = (a) => !sent[a.key] && out.push(a);
  const now = new Date(`${today}T12:00:00`);
  for (const id of Object.keys(d.certs || {})) {
    const st = d.certs[id];
    const c = CERTS[id];
    if (!c || st.status !== 'booked' || !st.examDate || st.examDate < today) continue;
    const days = isoDays(today, st.examDate);
    const stage = days === 0 ? 0 : days === 1 ? 1 : days <= 7 ? 7 : days <= 14 ? 14 : null;
    const name = c.kind === 'cert' && !/applied/i.test(c.code) ? c.code : c.name;
    const o = OUTLINES[id];
    const prep = prepOf(d, id);
    const r = o && Object.keys(prep.skills).length ? readiness(o, prep) : null;
    const ts = testSummary(prep);
    const plan = examPlan(d, id, now);
    if (stage != null) {
      const facts = [r ? `Readiness ${Math.round(r.pct * 100)}%` : null, ts ? `practice tests averaging ${ts.avg}%` : null].filter(Boolean).join(', ');
      // the skills rated shaky, or failing that the ones not rated yet
      const shaky = o ? outlineItems(o).filter((x) => prep.skills[x.key] === 1) : [];
      const todo = r ? r.next.filter((x) => !prep.skills[x.key]) : [];
      const short = (list) => list.map((x) => x.text.split(':')[0]).slice(0, 2).join('; ');
      const weak = shaky.length ? `Shakiest: ${short(shaky)}.` : todo.length ? `Not rated yet: ${short(todo)}.` : '';
      const body =
        stage === 0
          ? `Good luck!${facts ? ` ${facts}.` : ''}`
          : stage === 1
            ? [facts ? `${facts}.` : '', weak || 'A light review tonight, then rest.'].filter(Boolean).join(' ')
            : [facts ? `${facts}.` : '', plan && plan.left > 0 ? (days <= 7 ? `About ${hrs(plan.left)} of study left before the exam.` : `About ${hrs(plan.left)} of study left, ${hrs(plan.perWeek)} a week to finish in time.`) : '', weak].filter(Boolean).join(' ');
      push({
        key: `exam:${id}:${st.examDate}:${stage}`,
        title: stage === 0 ? `${name} exam today` : stage === 1 ? `${name} exam tomorrow` : `${name} exam in ${days} days`,
        body: body || `Exam on ${dayLabel(st.examDate)}.`,
        tags: 'mortar_board',
        click: '#/learning?prep',
      });
    }
    // Sunday check-in, while an exam is within two months: the week's time on this cert against the pace it needs.
    // A week with ticked modules or a practice test counts as studying even without logged time.
    const sunday = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))).getUTCDay() === 0;
    if (sunday && days > 1 && days <= 60 && plan && plan.perWeek > 0) {
      const from = weekStartISO(today);
      const h = d.log.filter((e) => e.cert === id && e.date >= from && e.date <= today).reduce((a, e) => a + (Number(e.minutes) || 0), 0) / 60;
      const active = Object.values(prep.modules).some((x) => x >= from && x <= today) || prep.tests.some((t) => t.date >= from && t.date <= today);
      if (h < plan.perWeek && !active)
        push({
          key: `studyweek:${id}:${from}`,
          title: 'Study check-in',
          body: `${hrs(h)} of ${hrs(plan.perWeek)} this week toward ${name} (exam in ${days} days).`,
          tags: 'books',
          click: '#/learning?prep',
        });
    }
  }
  return out;
}
