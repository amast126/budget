// Learning tab data and math. Progress lives in its own Firestore document (trackers/<id>-learning),
// separate from the budget, as { json: JSON.stringify(learning), updatedAt }.
import { CERTS, PLAN } from './learning-catalog.js';
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
