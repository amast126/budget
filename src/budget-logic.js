// Budget math used by the home screen. Ported from the budget module's own rules so both
// always agree: paydays, bill charge dates, "paid" ticks, your share of split bills, pacing.

export const pad2 = (n) => String(n).padStart(2, '0');
export const DAY_MS = 86400000;
export const isoOf = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
export const todayISO = () => isoOf(new Date());
export const keyOf = (iso) => iso.slice(0, 7);
export const todayKey = () => keyOf(todayISO());
export const daysIn = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d + n));
};
export const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f ? f(x) : x) || 0), 0);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const fmt = (n) => money.format(n || 0);
export const fmt0 = (n) => money0.format(n || 0);
export const dateLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Cashback rates decide which purchases feed Daily Cash; card methods feed the Apple Card balance.
export const CASHBACK = { 'Apple Pay': 0.02, 'Apple Card': 0.01, 'Apple Store/Services': 0.03 };
export const isCardMethod = (method) => !!CASHBACK[method];

export function nextPayday(anchor, from = new Date()) {
  if (!anchor) return null;
  const [ay, am, ad] = anchor.split('-').map(Number);
  const a = new Date(ay, am - 1, ad);
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  let d = a;
  while (d < today) d = new Date(d.getTime() + 14 * DAY_MS);
  while (d.getTime() - 14 * DAY_MS >= today.getTime()) d = new Date(d.getTime() - 14 * DAY_MS);
  return { iso: isoOf(d), days: Math.round((d - today) / DAY_MS) };
}

// Charge date of a bill in a month; day 31 means the last day of the month.
export function billDue(b, key) {
  if (!b.day) return null;
  return `${key}-${pad2(Math.min(Number(b.day), daysIn(key)))}`;
}
export const autoPaid = (b, key) => {
  const due = billDue(b, key);
  return !!due && due <= todayISO();
};
// A manual tick wins; otherwise a scheduled bill counts as paid once its charge date arrives.
export function isPaid(m, b, key) {
  const o = m && m.paid ? m.paid[b.id] : undefined;
  if (o === true || o === false) return o;
  return autoPaid(b, key);
}
export const billFull = (m, b) =>
  (m && m.amounts && m.amounts[b.id] !== undefined ? Number(m.amounts[b.id]) : Number(b.amount)) || 0;
export const billShare = (b) => {
  const v = b.share === undefined || b.share === '' ? 1 : Number(b.share);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
};
export const billCost = (m, b) => billFull(m, b) * billShare(b);
export const activeBills = (cfg, key) =>
  (cfg.bills || []).filter((b) => (!b.starts || b.starts <= key) && (!b.ends || b.ends >= key));

export function pacingFor(key) {
  const days = daysIn(key);
  const now = todayKey();
  if (key < now) return { frac: 1, day: days, days, state: 'past' };
  if (key > now) return { frac: 0, day: 0, days, state: 'future' };
  const day = new Date().getDate();
  return { frac: day / days, day, days, state: 'current' };
}
export function statusOf(spent, budget, p) {
  if (budget <= 0) return spent > 0.005 ? 'over' : 'none';
  if (spent > budget + 0.005) return 'over';
  if (p.state === 'past') return 'under';
  if (p.state === 'future') return 'future';
  if (spent > budget * p.frac + 0.005) return 'ahead';
  return 'on';
}
export const STATUS_LABEL = {
  over: 'Over budget',
  ahead: 'Ahead of pace',
  on: 'On pace',
  under: 'Under budget',
  none: 'No budget',
  future: 'Not started',
};

export function emptyMonth() {
  return { transactions: [], paid: {}, amounts: {}, collected: {} };
}

// Everything the home screen shows, computed from the budget document.
export function homeSummary(data, now = new Date()) {
  const cfg = data.config || {};
  const key = keyOf(isoOf(now));
  const m = (data.months || {})[key] || emptyMonth();
  const p = pacingFor(key);
  const categories = (cfg.categories || []).map((c) => {
    const spent = sum(m.transactions.filter((t) => t.category === c.name), (t) => t.amount);
    const budget = Number(c.budget) || 0;
    return { name: c.name, spent, budget, status: statusOf(spent, budget, p) };
  });
  const budget = sum(categories, (c) => c.budget);
  const known = new Set(categories.map((c) => c.name));
  const spent = sum(m.transactions, (t) => t.amount);
  const other = sum(m.transactions.filter((t) => !known.has(t.category)), (t) => t.amount);
  const status = statusOf(spent, budget, p);

  // Bills charging in the next 7 days (today included), across a month boundary if needed.
  const today = isoOf(now);
  const upcoming = [];
  for (let i = 0; i <= 7; i++) {
    const iso = addDays(today, i);
    const k = keyOf(iso);
    const mm = (data.months || {})[k];
    activeBills(cfg, k).forEach((b) => {
      if (billDue(b, k) !== iso) return;
      upcoming.push({
        id: b.id,
        key: k,
        name: b.name,
        due: iso,
        daysAway: i,
        cost: billCost(mm, b),
        full: billFull(mm, b),
        split: billShare(b) < 1,
        card: !!b.card,
        paid: isPaid(mm, b, k),
        manual: !!(mm && mm.paid && (mm.paid[b.id] === true || mm.paid[b.id] === false)),
      });
    });
  }

  return {
    key,
    pacing: p,
    spent,
    budget,
    left: budget - spent,
    other,
    status,
    categories,
    watch: categories.filter((c) => c.status === 'over' || c.status === 'ahead').sort((a, b) => b.spent / (b.budget || 1) - a.spent / (a.budget || 1)),
    payday: nextPayday(cfg.payAnchor, now),
    upcoming,
    upcomingTotal: sum(upcoming.filter((u) => !u.paid), (u) => u.cost),
    methods: cfg.paymentMethods && cfg.paymentMethods.length ? cfg.paymentMethods : ['Apple Card'],
    categoryNames: categories.map((c) => c.name),
    recent: [...m.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 4),
  };
}

// Same shape the budget module writes when you add an expense in its log.
export function newTransaction({ date, desc, category, amount, method }) {
  return {
    id: uid(),
    date,
    desc: desc.trim(),
    category,
    amount: Math.round(Number(amount) * 100) / 100,
    method,
    dc: CASHBACK[method] ? 'pending' : undefined,
    card: isCardMethod(method) ? 'pending' : undefined,
  };
}

export function addTransaction(data, t) {
  const k = keyOf(t.date);
  data.months = data.months || {};
  if (!data.months[k]) data.months[k] = emptyMonth();
  const m = data.months[k];
  m.transactions = m.transactions || [];
  m.transactions.push(JSON.parse(JSON.stringify(t)));
}

// Flip a bill's paid tick, clearing the override when it matches what the date would say anyway.
export function toggleBillPaid(data, key, billId) {
  const b = (data.config.bills || []).find((x) => x.id === billId);
  if (!b) return;
  data.months = data.months || {};
  if (!data.months[key]) data.months[key] = emptyMonth();
  const m = data.months[key];
  m.paid = m.paid || {};
  const next = !isPaid(m, b, key);
  if (next === autoPaid(b, key)) delete m.paid[b.id];
  else m.paid[b.id] = next;
}
