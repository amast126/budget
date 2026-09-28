// The budget's rules, ported from the budget app (app.js) so the native Budget tab computes exactly what it did:
// paydays, bill charge dates and "paid" ticks, your share of split bills and what roommates owe, pacing, Daily Cash,
// the Apple Card and savings balances, projections, and the document upgrades. Pure functions, no React.

export const CONFIG_VERSION = 28;
export const HISTORY_VERSION = 2;
export const DAY_MS = 86400000;
export const pad2 = (n) => String(n).padStart(2, '0');
export const isoOf = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
export const todayISO = () => isoOf(new Date());
export const keyOf = (iso) => String(iso).slice(0, 7);
export const todayKey = () => keyOf(todayISO());
export const daysIn = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const nextMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
};
export const prevMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
};
export const addMonths = (key, n) => {
  let k = key;
  for (let i = 0; i < Math.abs(n); i++) k = n > 0 ? nextMonth(k) : prevMonth(k);
  return k;
};
export const monthsBetween = (a, b) => {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
};
const dateOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d + n));
};
export const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / DAY_MS);
export const monthShort = (key) => dateOf(`${key}-01`).toLocaleString('en-US', { month: 'short', year: 'numeric' });
export const monthLong = (key) => dateOf(`${key}-01`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
export const monthName = (key) => dateOf(`${key}-01`).toLocaleString('en-US', { month: 'long' });
export const monthAbbr = (key) => dateOf(`${key}-01`).toLocaleString('en-US', { month: 'short' });
export const dateLabel = (iso) => dateOf(iso).toLocaleString('en-US', { month: 'short', day: 'numeric' });
export const weekdayLabel = (iso) => dateOf(iso).toLocaleString('en-US', { weekday: 'long' });
export const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f ? f(x) : x) || 0), 0);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
export const round2 = (v) => Math.round(Number(v) * 100) / 100;
export const ordinal = (n) => {
  const v = n % 100;
  return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
};
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const fmt = (n) => money.format(n || 0);
export const fmt0 = (n) => money0.format(n || 0);
export const pct = (v) => `${((v || 0) * 100).toFixed(1)}%`;

// ---------------------------------------------------------------- paydays
// Biweekly paydays inside a month, walked from a known payday.
export function paydaysIn(key, anchor) {
  if (!anchor) return [];
  const a = dateOf(anchor);
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  const steps = Math.floor((start - a) / (14 * DAY_MS)) - 1;
  const out = [];
  for (let i = steps; i < steps + 5; i++) {
    const d = new Date(a.getTime() + i * 14 * DAY_MS);
    if (d >= start && d <= end) out.push(isoOf(d));
  }
  return out;
}
// The next payday on or after `from` (today by default), and how many days away.
export function nextPayday(anchor, from = new Date()) {
  if (!anchor) return null;
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  let d = dateOf(anchor);
  while (d < today) d = new Date(d.getTime() + 14 * DAY_MS);
  while (d.getTime() - 14 * DAY_MS >= today.getTime()) d = new Date(d.getTime() - 14 * DAY_MS);
  return { iso: isoOf(d), days: Math.round((d - today) / DAY_MS) };
}
// The most recent payday on or before `from`.
export function lastPayday(anchor, from = new Date()) {
  const n = nextPayday(anchor, from);
  if (!n) return null;
  return n.days === 0 ? n.iso : addDays(n.iso, -14);
}

// ---------------------------------------------------------------- bills
// Charge date in a month; day 31 means the last day. Bills without a day are ticked by hand.
export function billDue(b, key) {
  return b.day ? `${key}-${pad2(Math.min(Number(b.day), daysIn(key)))}` : null;
}
export const autoPaid = (b, key) => {
  const due = billDue(b, key);
  return !!due && due <= todayISO();
};
// A manual tick wins; otherwise a scheduled bill counts as paid (charged) once its date arrives.
export function isPaid(m, b, key) {
  const o = m && m.paid ? m.paid[b.id] : undefined;
  return o === true || o === false ? o : autoPaid(b, key);
}
// What the biller charges this month (a month can override the usual amount).
export const billFull = (m, b) => (m && m.amounts && m.amounts[b.id] !== undefined ? Number(m.amounts[b.id]) : Number(b.amount)) || 0;
// Your fraction of it; the rest is fronted and paid back by roommates.
export const billShare = (b) => {
  const v = b.share === undefined || b.share === '' ? 1 : Number(b.share);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
};
export const billCost = (m, b) => billFull(m, b) * billShare(b);
export const billOwed = (m, b) => billFull(m, b) * (1 - billShare(b));
// Daily Cash on a bill charged to the card (1% unless set per bill).
export const billDc = (b) => (b.dc === undefined || b.dc === '' || !Number.isFinite(Number(b.dc)) ? 0.01 : Number(b.dc));
export const roommatesOf = (cfg) => ((cfg && cfg.roommates) || []).filter((r) => r && r.id);
export const billCollected = (m, b) => !!(m && m.collected && m.collected[b.id]);
export const collectedBy = (m, b, rid) => {
  const n = m && m.collected && m.collected[b.id];
  return n === true || !!(n && n[rid]);
};
// What's still to come back on a bill: split evenly between roommates, minus what each has paid.
export function owedLeft(cfg, m, b) {
  const rs = roommatesOf(cfg);
  if (rs.length === 0) return billCollected(m, b) ? 0 : billOwed(m, b);
  return (billOwed(m, b) * rs.filter((r) => !collectedBy(m, b, r.id)).length) / rs.length;
}
export const activeBills = (cfg, key) => (cfg.bills || []).filter((b) => (!b.starts || b.starts <= key) && (!b.ends || b.ends >= key));
export const activeSavings = (cfg, key) => (cfg.savings || []).filter((x) => (!x.starts || x.starts <= key) && (!x.ends || x.ends >= key));

// ---------------------------------------------------------------- pacing
export function pacingFor(key, now = new Date()) {
  const days = daysIn(key);
  const cur = keyOf(isoOf(now));
  if (key < cur) return { frac: 1, day: days, days, state: 'past' };
  if (key > cur) return { frac: 0, day: 0, days, state: 'future' };
  const day = now.getDate();
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
export const STATUS = {
  over: { label: 'Over budget', tone: 'red' },
  ahead: { label: 'Ahead of pace', tone: 'amber' },
  on: { label: 'On pace', tone: 'green' },
  under: { label: 'Under budget', tone: 'green' },
  none: { label: 'No budget', tone: 'grey' },
  future: { label: 'Not started', tone: 'grey' },
};

// ---------------------------------------------------------------- Daily Cash and the Apple Card
export const CASHBACK = { 'Apple Pay': 0.02, 'Apple Card': 0.01, 'Apple Store/Services': 0.03 };
export const PAYMENT_METHODS = ['Apple Pay', 'Apple Card', 'Apple Store/Services', 'Debit Card', 'Cash'];
const APPLE_PAY_3 = ['Uber', 'Walgreens', 'Nike', 'Panera'];
export const isCardMethod = (method) => !!CASHBACK[method];
export function cashbackRate(t) {
  if (t.method === 'Apple Pay' && APPLE_PAY_3.some((n) => String(t.desc || '').toLowerCase().startsWith(n.toLowerCase()))) return 0.03;
  return CASHBACK[t.method] || 0;
}
export const cashbackFor = (t) => cashbackRate(t) * Math.max(0, Number(t.amount) || 0);
const allTx = (data) => Object.values(data.months || {}).flatMap((m) => m.transactions || []);
// Card bills charged since a date (full amount, or its Daily Cash when withDc).
export function billCardCharges(data, sinceISO, withDc = false) {
  let total = 0;
  Object.keys(data.months || {}).forEach((key) => {
    const m = data.months[key];
    activeBills(data.config, key).forEach((b) => {
      if (!b.card) return;
      const due = billDue(b, key);
      if (due && due > sinceISO && isPaid(m, b, key)) total += billFull(m, b) * (withDc ? billDc(b) : 1);
    });
  });
  return total;
}
export const pendingCardCharges = (data) => sum(allTx(data).filter((t) => t.card === 'pending'), (t) => Number(t.amount) || 0);
export const cardBalance = (data) => (Number(data.card.balance) || 0) + pendingCardCharges(data) + billCardCharges(data, data.card.asOf);
export function absorbCard(d) {
  allTx(d).forEach((t) => {
    if (t.card === 'pending') t.card = 'absorbed';
  });
}
// Months and interest to clear a balance at a fixed monthly payment (null if the payment doesn't cover interest).
export function payoff(balance, apr, payment) {
  const r = (Number(apr) || 0) / 100 / 12;
  let b = balance;
  let months = 0;
  let interest = 0;
  if (payment <= b * r) return null;
  while (b > 0.005 && months < 600) {
    const i = b * r;
    interest += i;
    b = b + i - payment;
    months += 1;
  }
  return { months, interest };
}

// ---------------------------------------------------------------- savings
export const ENTRY_TYPES = ['deposit', 'adhoc', 'dailycash', 'interest', 'withdrawal', 'other'];
export const ENTRY_LABEL = { deposit: 'Paycheck deposit', adhoc: 'Deposit', dailycash: 'Daily Cash', interest: 'Interest', withdrawal: 'Withdrawal', other: 'Other' };
export const pendingDailyCash = (data) => sum(allTx(data).filter((t) => t.dc === 'pending'), cashbackFor) + billCardCharges(data, data.savings.asOf, true);
export function savingsBalance(data) {
  const sv = data.savings;
  return (Number(sv.balance) || 0) + sum(sv.entries.filter((e) => !e.absorbed), (e) => e.amount) + pendingDailyCash(data);
}
// After a balance snapshot, everything logged so far is inside it.
export function absorbAll(d) {
  d.savings.entries.forEach((e) => (e.absorbed = true));
  allTx(d).forEach((t) => {
    if (t.dc === 'pending') t.dc = 'absorbed';
  });
}
export const monthlyRate = (apy) => Math.pow(1 + (Number(apy) || 0) / 100, 1 / 12) - 1;
export function dailyCashEstimate(m, bills, key) {
  const fromBills = bills ? sum(bills.filter((b) => b.card && isPaid(m, b, key)), (b) => billFull(m, b) * billDc(b)) : 0;
  return sum(m ? m.transactions : [], cashbackFor) + fromBills;
}
// Month-by-month savings balance at the scheduled per-paycheck amounts plus interest.
export function projectSavings(data, monthsAhead, now = new Date()) {
  const sv = data.savings;
  const cfg = data.config;
  let bal = savingsBalance(data);
  let key = keyOf(isoOf(now));
  const out = [];
  const paid = sum(sv.entries.filter((e) => e.type === 'deposit' && e.date.startsWith(key)), (e) => e.amount);
  const perNow = sum(activeSavings(cfg, key), (x) => x.biweekly);
  const dueNow = paydaysIn(key, cfg.payAnchor).length * perNow;
  bal += Math.max(0, dueNow - paid);
  bal += bal * monthlyRate(sv.apy) * ((daysIn(key) - now.getDate()) / daysIn(key));
  out.push({ key, balance: bal });
  for (let i = 0; i < monthsAhead; i++) {
    key = nextMonth(key);
    const per = sum(activeSavings(cfg, key), (x) => x.biweekly);
    bal += paydaysIn(key, cfg.payAnchor).length * per;
    bal += bal * monthlyRate(sv.apy);
    out.push({ key, balance: bal });
  }
  return out;
}

// ---------------------------------------------------------------- a month's numbers
export function monthStats(data, key) {
  const cfg = data.config;
  const m = (data.months || {})[key] || emptyMonth();
  const incomeBiweekly = sum(cfg.incomes || [], (i) => i.biweekly);
  const income = (incomeBiweekly * 26) / 12;
  const bills = activeBills(cfg, key);
  const fixed = sum(bills, (b) => billCost(m, b));
  const budget = sum(cfg.categories || [], (c) => c.budget);
  const spentBy = {};
  m.transactions.forEach((t) => (spentBy[t.category] = (spentBy[t.category] || 0) + (Number(t.amount) || 0)));
  const spent = sum(m.transactions, (t) => t.amount);
  const savings = activeSavings(cfg, key);
  const savingsBiweekly = sum(savings, (x) => x.biweekly);
  const savingsMonthly = (savingsBiweekly * 26) / 12;
  const net = income - fixed - spent;
  const known = new Set((cfg.categories || []).map((c) => c.name));
  return {
    incomeBiweekly,
    income,
    fixed,
    budget,
    spent,
    spentBy,
    savingsBiweekly,
    savingsMonthly,
    net,
    surplus: income - fixed - budget,
    rate: income > 0 ? net / income : 0,
    paidTotal: sum(bills.filter((b) => isPaid(m, b, key)), (b) => billCost(m, b)),
    otherSpent: sum(m.transactions.filter((t) => !known.has(t.category)), (t) => t.amount),
    bills,
    savings,
    charged: sum(bills.filter((b) => b.card), (b) => billFull(m, b)),
    owed: sum(bills.filter((b) => isPaid(m, b, key)), (b) => owedLeft(cfg, m, b)),
  };
}

// ---------------------------------------------------------------- the document
export const emptyMonth = () => ({ transactions: [], paid: {}, amounts: {}, collected: {} });
export const defaultSavings = () => ({ balance: 0, asOf: todayISO(), apy: 0, entries: [] });
export const defaultCard = () => ({ balance: 0, asOf: todayISO(), apr: 0, limit: 0, lastInterest: 0 });
export const defaultPortfolio = () => ({ holdings: [], cash: 0, quotes: {}, refreshedAt: '' });
const SEED_CATEGORIES = ['Groceries', 'Dining & Drinks', 'Shopping', 'Gaming & Entertainment', 'Health', 'Gas & Auto', 'Travel', 'Misc Discretionary'];
// A fresh, empty budget (Settings → Reset).
export function seedBudget() {
  return {
    version: 1,
    historyVersion: HISTORY_VERSION,
    configVersion: CONFIG_VERSION,
    config: {
      incomes: [{ id: uid(), name: 'Primary Employment', biweekly: 0 }],
      savings: [{ id: uid(), name: 'Paycheck Savings', biweekly: 0, starts: '', ends: '' }],
      bills: [],
      categories: SEED_CATEGORIES.map((name) => ({ id: uid(), name, budget: 0 })),
      paymentMethods: [...PAYMENT_METHODS],
      payAnchor: '',
      roommates: [],
    },
    months: { [todayKey()]: emptyMonth() },
    savings: defaultSavings(),
    card: defaultCard(),
    portfolio: defaultPortfolio(),
  };
}
// Fill in anything missing so every screen can rely on the shape (mutates and returns d).
export function normalizeBudget(d) {
  if (!d || typeof d !== 'object') return null;
  d.config = d.config || {};
  const c = d.config;
  c.incomes = c.incomes || [];
  c.savings = (c.savings || []).map((x) => ({ starts: '', ends: '', ...x }));
  c.bills = (c.bills || []).map((b) => ({ starts: '', ends: '', day: '', card: false, share: 1, ...b }));
  c.categories = c.categories || [];
  c.paymentMethods = c.paymentMethods || ['Apple Card'];
  c.payAnchor = c.payAnchor || '';
  c.roommates = (c.roommates || []).filter((r) => r && r.id);
  d.months = d.months || {};
  if (d.savings) {
    d.savings.entries = d.savings.entries || [];
    d.savings.apy = Number(d.savings.apy) || 0;
  }
  if (d.portfolio) {
    d.portfolio = { cash: 0, quotes: {}, refreshedAt: '', ...d.portfolio };
    d.portfolio.holdings = (d.portfolio.holdings || []).map((h) => ({ basis: 0, ...h }));
  }
  Object.values(d.months).forEach((m) => {
    m.transactions = m.transactions || [];
    m.paid = m.paid || {};
    m.amounts = m.amounts || {};
    m.collected = m.collected || {};
  });
  return d;
}
// One-time upgrades for documents saved by older versions (the same steps the budget app ran). True if anything changed.
export function upgradeBudget(d) {
  let changed = false;
  if ((d.historyVersion || 0) < HISTORY_VERSION) {
    d.historyVersion = HISTORY_VERSION;
    changed = true;
  }
  const v = d.configVersion || 0;
  if (v >= CONFIG_VERSION) return changed;
  if (!d.savings) d.savings = defaultSavings();
  if (!d.card) d.card = defaultCard();
  if (!d.portfolio) d.portfolio = defaultPortfolio();
  d.config.payAnchor = d.config.payAnchor || '';
  if (v < 24) d.config.bills.forEach((b) => /^rent/i.test(b.name) || (b.card = true));
  if (v < 25) {
    allTx(d).forEach((t) => t.category === 'Subscriptions' && (t.category = 'Misc Discretionary'));
    d.config.categories = d.config.categories.filter((c) => c.name !== 'Subscriptions');
  }
  if (v < 26) {
    allTx(d).forEach((t) => (t.category === 'Personal & Health' || t.category === 'Medical') && (t.category = 'Health'));
    const ph = d.config.categories.find((c) => c.name === 'Personal & Health');
    const med = d.config.categories.find((c) => c.name === 'Medical');
    const total = ((ph && Number(ph.budget)) || 0) + ((med && Number(med.budget)) || 0);
    if (ph) {
      ph.name = 'Health';
      ph.budget = total;
    } else if (med) {
      med.name = 'Health';
      med.budget = total;
    }
    d.config.categories = d.config.categories.filter((c) => c.name !== 'Medical');
  }
  d.configVersion = CONFIG_VERSION;
  return true;
}

// The same shape the budget app writes when you add an expense.
export function newTxn({ date, desc, category, amount, method, extra }) {
  const t = { id: uid(), date, desc: String(desc || '').trim(), category, amount: round2(amount), method };
  if (CASHBACK[method]) t.dc = 'pending';
  if (isCardMethod(method)) t.card = 'pending';
  return extra ? { ...t, ...extra } : t;
}
export function addTxn(d, t) {
  const k = keyOf(t.date);
  if (!d.months[k]) d.months[k] = emptyMonth();
  d.months[k].transactions.push(JSON.parse(JSON.stringify(t)));
}
// Find a transaction anywhere; returns { key, index, t }.
export function findTxn(d, id) {
  for (const key of Object.keys(d.months || {})) {
    const i = (d.months[key].transactions || []).findIndex((t) => t.id === id);
    if (i >= 0) return { key, index: i, t: d.months[key].transactions[i] };
  }
  return null;
}
// Edit a transaction; a new date in another month moves it there.
export function updateTxn(d, id, patch) {
  const f = findTxn(d, id);
  if (!f) return false;
  const next = { ...f.t, ...patch };
  if (patch.amount !== undefined) next.amount = round2(patch.amount);
  if (patch.desc !== undefined) next.desc = String(patch.desc).trim();
  if (patch.method !== undefined && patch.method !== f.t.method) {
    if (CASHBACK[next.method]) next.dc = next.dc === 'absorbed' ? 'absorbed' : 'pending';
    else delete next.dc;
    if (isCardMethod(next.method)) next.card = next.card === 'absorbed' ? 'absorbed' : 'pending';
    else delete next.card;
  }
  const k = keyOf(next.date);
  if (k === f.key) d.months[f.key].transactions[f.index] = next;
  else {
    d.months[f.key].transactions.splice(f.index, 1);
    if (!d.months[k]) d.months[k] = emptyMonth();
    d.months[k].transactions.push(next);
  }
  return true;
}
export function removeTxn(d, id) {
  const f = findTxn(d, id);
  if (!f) return null;
  d.months[f.key].transactions.splice(f.index, 1);
  return { key: f.key, index: f.index, t: f.t };
}
export function restoreTxn(d, removed) {
  if (!removed) return;
  if (!d.months[removed.key]) d.months[removed.key] = emptyMonth();
  const list = d.months[removed.key].transactions;
  if (list.some((t) => t.id === removed.t.id)) return;
  list.splice(Math.min(removed.index, list.length), 0, removed.t);
}
// Flip a bill's tick; the override is dropped when it matches what the date would say anyway.
export function toggleBill(d, key, billId) {
  const b = d.config.bills.find((x) => x.id === billId);
  if (!b) return;
  if (!d.months[key]) d.months[key] = emptyMonth();
  const m = d.months[key];
  const next = !isPaid(m, b, key);
  if (next === autoPaid(b, key)) delete m.paid[b.id];
  else m.paid[b.id] = next;
}
// This month's actual charge for a bill (blank or the usual amount clears the override).
export function setBillAmount(d, key, billId, value) {
  const b = d.config.bills.find((x) => x.id === billId);
  if (!b) return;
  if (!d.months[key]) d.months[key] = emptyMonth();
  const m = d.months[key];
  const v = value === '' || value == null ? NaN : round2(value);
  if (isNaN(v) || v === Number(b.amount)) delete m.amounts[b.id];
  else m.amounts[b.id] = v;
}
// A roommate paid (or un-paid) their cut of a bill; with no roommates the whole bill is one tick.
export function setCollected(d, key, billId, rid, on) {
  const m = d.months[key];
  if (!m) return;
  const rs = roommatesOf(d.config);
  if (!rid) {
    if (m.collected[billId]) delete m.collected[billId];
    else m.collected[billId] = true;
    return;
  }
  let cur = m.collected[billId];
  if (cur === true) cur = Object.fromEntries(rs.map((r) => [r.id, true]));
  cur = { ...(cur || {}) };
  if (on) cur[rid] = true;
  else delete cur[rid];
  if (Object.keys(cur).length === 0) delete m.collected[billId];
  else m.collected[billId] = cur;
}
// Rename categories by id; logged expenses follow the new name.
export function setCategories(d, next) {
  const before = Object.fromEntries(d.config.categories.map((c) => [c.id, c.name]));
  next.forEach((c) => {
    const old = before[c.id];
    if (old && old !== c.name) allTx(d).forEach((t) => t.category === old && (t.category = c.name));
  });
  d.config.categories = next;
}
export const categoryUse = (d) => {
  const n = {};
  allTx(d).forEach((t) => (n[t.category] = (n[t.category] || 0) + 1));
  return n;
};

// ---------------------------------------------------------------- stocks
// "AAPL 12 1500" per line: ticker, shares, cost basis.
export function parseHoldings(text) {
  const out = [];
  String(text || '')
    .split(/[\n\r]+/)
    .forEach((line) => {
      const parts = line
        .trim()
        .replace(/(\d),(?=\d{3}(\D|$))/g, '$1')
        .split(/[\s,\t]+/)
        .filter(Boolean);
      if (parts.length < 2) return;
      const ticker = parts[0].toUpperCase().replace(/[^A-Z.]/g, '');
      if (!ticker || ticker.length > 6) return;
      const nums = parts
        .slice(1)
        .map((x) => Number(String(x).replace(/[$,]/g, '')))
        .filter((x) => Number.isFinite(x));
      if (nums.length) out.push({ ticker, shares: nums[0], basis: nums.length > 1 ? nums[1] : 0 });
    });
  return out;
}
const num0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// Holdings with prices, values and the day's move; plus the totals the Stocks view shows.
export function portfolioRows(data) {
  const p = data.portfolio || defaultPortfolio();
  const rows = p.holdings.map((h) => {
    const q = (p.quotes || {})[h.ticker] || null;
    const price = q && q.price != null ? Number(q.price) : null;
    const shares = num0(h.shares);
    const value = price != null ? price * shares : null;
    const basis = num0(h.basis);
    return { ...h, q, price, shares, basis, value, gain: value != null ? value - basis : null, dayValue: q && q.change != null ? Number(q.change) * shares : null };
  });
  const priced = rows.filter((r) => r.value != null);
  const positions = sum(priced, (r) => r.value);
  const cash = num0(p.cash);
  const invested = sum(priced, (r) => r.basis);
  const gain = positions - invested;
  return { rows, positions, cash, total: positions + cash, invested, gain, gainPct: invested > 0 ? gain / invested : 0, day: sum(rows.filter((r) => r.dayValue != null), (r) => r.dayValue), unpriced: rows.filter((r) => r.price == null) };
}
const finnhubKey = () => ((typeof window !== 'undefined' && window.BUDGET_CONFIG) || {}).finnhubKey || '';
export async function fetchQuotes(tickers) {
  const key = finnhubKey();
  if (!key) throw new Error('add your Finnhub API key to config.js');
  const out = {};
  for (const t of tickers) {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t)}&token=${encodeURIComponent(key)}`);
    if (r.status === 429) throw new Error('Finnhub rate limit hit, wait a minute');
    if (!r.ok) throw new Error(`Finnhub returned ${r.status}`);
    const j = await r.json();
    out[t] = j && j.c ? { price: j.c, change: j.d, change_pct: j.dp, as_of: j.t ? new Date(j.t * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '' } : { price: null, change_pct: null, as_of: 'not found' };
  }
  return out;
}
export async function fetchBrief(tickers) {
  const key = finnhubKey();
  if (!key) throw new Error('add your Finnhub API key to config.js');
  const to = todayISO();
  const from = isoOf(new Date(Date.now() - 4 * DAY_MS));
  const news = {};
  for (const t of tickers) {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(t)}&from=${from}&to=${to}&token=${encodeURIComponent(key)}`);
      if (r.status === 429) throw new Error('Finnhub rate limit hit, wait a minute');
      const list = r.ok ? await r.json() : [];
      news[t] = (Array.isArray(list) ? list : [])
        .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
        .slice(0, 3)
        .map((n) => ({ headline: n.headline, source: n.source, url: n.url, summary: n.summary }));
    } catch (e) {
      if (/rate limit/.test(String(e.message))) throw e;
      news[t] = [];
    }
  }
  const market = {};
  for (const s of ['SPY', 'QQQ']) {
    try {
      const j = await (await fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${encodeURIComponent(key)}`)).json();
      if (j && j.dp != null) market[s] = { change_pct: j.dp };
    } catch {
      /* skip */
    }
  }
  return { market, news };
}
