// Everything the Budget tab adds on top of the budget's own rules: merchant memory (for smarter adding and the Apple
// Card import), search, trends, subscriptions, the paycheck view, milestones, net worth, roommate requests and the
// phone alerts. Pure functions over the budget document; the alerts job (scripts/budget-alerts.mjs) uses them too.
import * as C from './budget-core.js';

const { sum, addDays, daysBetween, keyOf, todayISO, fmt, fmt0 } = C;
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

// ---------------------------------------------------------------- merchants
// Card processors and point-of-sale prefixes that come before the real name ("TST*Corner Cafe", "SQ *Harbor Studio").
const PREFIX = /^(tst|sq|sumup|abc|paypal|pp|sp|dd|dnh|in|py|clover|toast|ckr|lsp|pos|pmt|bt|fs)\s*\*+\s*/i;
const STOP_TAIL = new Set(['inc', 'llc', 'co', 'corp', 'ltd', 'the']);
// A stable key for a merchant: lower case, no punctuation, no store numbers, first three words.
export function merchantKey(name) {
  const words = String(name || '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(PREFIX, '')
    .replace(/'s\b/g, 's')
    .replace(/[^a-z0-9& ]+/g, ' ')
    .replace(/&/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w) && !STOP_TAIL.has(w));
  return words.slice(0, 3).join(' ');
}
const titleCase = (s) =>
  String(s)
    .toLowerCase()
    .replace(/(^|[\s\-/&(])([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Ii|Iii|Iv)\b/g, (m) => m.toUpperCase())
    .replace(/'S\b/g, "'s");
// A readable name from a card statement ("Joe's Pizza 5059" → "Joe's Pizza", "TST*CORNER CAFE" → "Corner Cafe").
export function cleanMerchant(raw) {
  let s = String(raw || '')
    .replace(PREFIX, '')
    .replace(/\*+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s
    .split(' ')
    .filter((w, i) => i === 0 || !/\d/.test(w))
    .join(' ');
  if (!/[a-z]/.test(s)) return titleCase(s); // ALL CAPS
  return s
    .split(' ')
    .map((w) => (/^[a-z]/.test(w) && w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
// Every merchant you've logged: how often, when last, and the category, method and amount you used last.
export function merchantIndex(data) {
  const map = new Map();
  const tx = Object.values(data.months || {})
    .flatMap((m) => m.transactions || [])
    .filter((t) => t.desc)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const t of tx) {
    const key = merchantKey(t.desc);
    if (!key) continue;
    const e = map.get(key) || { key, names: {}, count: 0, total: 0, first: t.date, last: t.date, category: t.category, method: t.method, amount: t.amount };
    e.names[t.desc] = (e.names[t.desc] || 0) + 1;
    e.count += 1;
    e.total += Number(t.amount) || 0;
    e.last = t.date;
    e.category = t.category;
    e.method = t.method;
    e.amount = Number(t.amount) || 0;
    map.set(key, e);
  }
  for (const e of map.values()) e.name = Object.entries(e.names).sort((a, b) => b[1] - a[1])[0][0];
  return map;
}
// Suggestions while typing: names that start with what you typed first, then ones containing it; frequent and recent first.
export function suggestMerchants(index, query, limit = 6, today = todayISO()) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return [];
  const score = (e) => e.count + (daysBetween(e.last, today) < 45 ? 8 : 0);
  const all = [...index.values()];
  const starts = all.filter((e) => e.name.toLowerCase().startsWith(q) || e.key.startsWith(q));
  const has = all.filter((e) => !starts.includes(e) && (e.name.toLowerCase().includes(q) || e.key.includes(q)));
  return [...starts.sort((a, b) => score(b) - score(a)), ...has.sort((a, b) => score(b) - score(a))].slice(0, limit);
}
// The merchants you use most lately, for one-tap buttons.
export function recentMerchants(index, n = 6, today = todayISO()) {
  const since = addDays(today, -60);
  return [...index.values()]
    .filter((e) => e.last >= since)
    .map((e) => ({ ...e, recent: e.count }))
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
    .slice(0, n);
}
// The merchant in your history a statement name refers to: same key, one key starting the other, or every word of
// a known name inside it ("Openai *chatgpt Subscr" → ChatGPT). The most used wins.
export function matchMerchant(index, name) {
  const k = merchantKey(name);
  if (!k) return null;
  if (index.has(k)) return index.get(k);
  const words = new Set(k.split(' '));
  const cands = [...index.values()].filter((e) => {
    if (e.key.length < 3) return false;
    if (k.startsWith(`${e.key} `) || e.key.startsWith(`${k} `)) return true;
    const ew = e.key.split(' ');
    return e.key.length >= 4 && ew.every((w) => words.has(w));
  });
  return cands.sort((a, b) => b.count - a.count)[0] || null;
}

// The Apple Pay shortcut's link: #/add?amount=12.34&merchant=Corner%20Cafe (amount may carry a $ sign).
export function parseAddLink(hash) {
  const q = new URLSearchParams(String(hash || '').split('?')[1] || '');
  const raw = String(q.get('amount') || '').replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
  const amount = Number(raw);
  return { amount: Number.isFinite(amount) && raw !== '' ? amount : '', merchant: (q.get('merchant') || q.get('name') || '').trim(), date: /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : '' };
}

// ---------------------------------------------------------------- the Apple Card CSV
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}
const usDate = (s) => {
  const m = String(s || '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${C.pad2(m[1])}-${C.pad2(m[2])}`;
  return /^\d{4}-\d{2}-\d{2}/.test(String(s)) ? String(s).slice(0, 10) : null;
};
// Apple Card's export (Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD)), or any CSV
// with Date, Description and Amount columns.
export function parseStatement(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { rows: [], format: null };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iDate = col('transaction date', 'date', 'posted date', 'posting date');
  const iDesc = col('description');
  const iMer = col('merchant');
  const iCat = col('category');
  const iType = col('type');
  const iAmt = col('amount');
  const iDebit = col('debit');
  const iCredit = col('credit');
  if (iDate < 0 || (iAmt < 0 && iDebit < 0) || (iDesc < 0 && iMer < 0)) return { rows: [], format: null };
  const apple = iMer >= 0 && iType >= 0 && head.some((h) => h.startsWith('clearing date'));
  const out = [];
  rows.slice(1).forEach((r, n) => {
    const date = usDate(r[iDate]);
    let amount = iAmt >= 0 ? Number(String(r[iAmt]).replace(/[$,\s]/g, '')) : Number(String(r[iDebit] || '0').replace(/[$,\s]/g, '')) - Number(String(r[iCredit] || '0').replace(/[$,\s]/g, ''));
    if (!date || !Number.isFinite(amount)) return;
    const desc = (iDesc >= 0 ? r[iDesc] : '').trim();
    const merchant = (iMer >= 0 ? r[iMer] : '').trim() || desc;
    out.push({ n, date, desc, merchant, appleCategory: iCat >= 0 ? r[iCat].trim() : '', type: iType >= 0 ? r[iType].trim() : 'Purchase', amount: C.round2(amount) });
  });
  return { rows: out, format: apple ? 'apple' : 'generic' };
}
export const APPLE_CATEGORY = {
  Restaurants: 'Dining & Drinks',
  Alcohol: 'Dining & Drinks',
  Grocery: 'Groceries',
  Gas: 'Gas & Auto',
  Automotive: 'Gas & Auto',
  Shopping: 'Shopping',
  Entertainment: 'Gaming & Entertainment',
  Health: 'Health',
  Medical: 'Health',
  Airlines: 'Travel',
  Hotels: 'Travel',
  Travel: 'Travel',
  Transportation: 'Travel',
  Other: 'Misc Discretionary',
  Utilities: 'Misc Discretionary',
  Insurance: 'Misc Discretionary',
};
const SKIP_TYPES = { payment: 'A card payment', interest: 'Interest (the Apple Card panel tracks it)', installment: 'An installment (it’s one of your bills)', 'daily cash adjustment': 'A Daily Cash adjustment', adjustment: 'An adjustment' };
const rowKey = (r, nth) => `${r.date}|${r.amount}|${merchantKey(r.merchant || r.desc)}|${nth}`;
// What an import would do with each row: add it, skip it as already logged or already imported, or treat it as
// one of your bills (and note what that bill actually charged).
export function planImport(data, rows) {
  const cfg = data.config;
  const index = merchantIndex(data);
  const cats = new Set(cfg.categories.map((c) => c.name));
  const fallbackCat = cats.has('Misc Discretionary') ? 'Misc Discretionary' : (cfg.categories[0] || {}).name || '';
  const all = Object.values(data.months || {}).flatMap((m) => m.transactions || []);
  const imported = new Set(all.map((t) => t.ext).filter(Boolean));
  const free = all.filter((t) => !t.ext);
  const used = new Set();
  const seen = {};
  const methods = cfg.paymentMethods || [];
  const items = rows.map((r) => {
    const base = rowKey(r, 0);
    seen[base] = (seen[base] || 0) + 1;
    const ext = rowKey(r, seen[base] - 1);
    const type = String(r.type || '').toLowerCase();
    if (SKIP_TYPES[type]) return { row: r, ext, action: 'skip', reason: SKIP_TYPES[type] };
    if (imported.has(ext)) return { row: r, ext, action: 'skip', reason: 'Imported before' };
    // one of your bills? (charged to the card within a few days of its charge day, at about its amount)
    const key = keyOf(r.date);
    const m = (data.months || {})[key];
    const words = new Set(merchantKey(`${r.merchant} ${r.desc}`).split(' ').concat(merchantKey(r.desc).split(' ')));
    const bill = C.activeBills(cfg, key).find((b) => {
      const due = C.billDue(b, key);
      if (!due || !b.card) return false;
      const full = C.billFull(m, b);
      if (!(full > 0)) return false;
      const off = Math.abs(r.amount - full) / full;
      const days = Math.abs(daysBetween(due, r.date));
      const named = merchantKey(b.name)
        .split(' ')
        .some((w) => w.length >= 4 && words.has(w));
      return (off <= 0.015 && days <= 3) || (named && off <= 0.08 && days <= 5);
    });
    if (bill && r.amount > 0) {
      const full = C.billFull(m, bill);
      return { row: r, ext, action: 'bill', bill, reason: `Your ${bill.name} bill`, override: Math.abs(full - r.amount) > 0.005 ? r.amount : null };
    }
    // already logged by hand? (same amount within two days; each logged expense matches one row)
    const dup = free.find((t) => !used.has(t.id) && Math.abs((Number(t.amount) || 0) - r.amount) < 0.011 && Math.abs(daysBetween(t.date, r.date)) <= 2);
    if (dup) {
      used.add(dup.id);
      return { row: r, ext, action: 'duplicate', match: dup, reason: `Already logged as ${dup.desc}` };
    }
    const known = matchMerchant(index, r.merchant || r.desc);
    const mapped = APPLE_CATEGORY[r.appleCategory];
    const category = known && cats.has(known.category) ? known.category : mapped && cats.has(mapped) ? mapped : fallbackCat;
    const method = known && methods.includes(known.method) ? known.method : methods.includes('Apple Pay') ? 'Apple Pay' : methods[0] || '';
    return { row: r, ext, action: 'add', known: !!known, txn: { date: r.date, desc: known ? known.name : cleanMerchant(r.merchant || r.desc), category, amount: r.amount, method } };
  });
  const adds = items.filter((i) => i.action === 'add');
  return {
    items,
    counts: { add: adds.length, duplicate: items.filter((i) => i.action === 'duplicate').length, bill: items.filter((i) => i.action === 'bill').length, skip: items.filter((i) => i.action === 'skip').length },
    total: sum(adds, (i) => i.txn.amount),
    unknown: adds.filter((i) => !i.known).length,
  };
}
// Add the chosen rows. Rows dated before the last Apple Card or savings update are already inside those balances.
export function applyImport(d, items, { overrides = true } = {}) {
  let added = 0;
  let billed = 0;
  for (const it of items) {
    if (it.action === 'add' && it.include !== false) {
      const t = C.newTxn({ ...it.txn, extra: { ext: it.ext, src: 'csv' } });
      if (t.card && d.card && t.date <= d.card.asOf) t.card = 'absorbed';
      if (t.dc && d.savings && t.date <= d.savings.asOf) t.dc = 'absorbed';
      C.addTxn(d, t);
      added++;
    } else if (it.action === 'bill' && overrides && it.override != null) {
      C.setBillAmount(d, keyOf(it.row.date), it.bill.id, it.override);
      billed++;
    }
  }
  return { added, billed };
}

// ---------------------------------------------------------------- search and merchants
export function allTransactions(data) {
  return Object.values(data.months || {})
    .flatMap((m) => m.transactions || [])
    .slice()
    .sort(byDateDesc);
}
// Every word must match (description, category or payment method); a number matches the amount.
export function searchTxns(data, query, { category = '', since = '' } = {}) {
  const words = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return allTransactions(data).filter((t) => {
    if (category && t.category !== category) return false;
    if (since && t.date < since) return false;
    if (!words.length) return !!category;
    const text = `${t.desc} ${t.category} ${t.method || ''}`.toLowerCase();
    return words.every((w) => {
      const n = Number(w.replace(/^\$/, ''));
      if (/^\$?\d+(\.\d+)?$/.test(w) && Number.isFinite(n)) return Math.abs((Number(t.amount) || 0) - n) < 0.005 || text.includes(w);
      return text.includes(w);
    });
  });
}
// All your spending at one merchant: totals, a monthly series and the list.
export function merchantHistory(data, name, today = todayISO()) {
  const key = merchantKey(name);
  const txns = allTransactions(data).filter((t) => merchantKey(t.desc) === key);
  const byMonth = {};
  txns.forEach((t) => (byMonth[keyOf(t.date)] = (byMonth[keyOf(t.date)] || 0) + (Number(t.amount) || 0)));
  const year = today.slice(0, 4);
  const cats = {};
  txns.forEach((t) => (cats[t.category] = (cats[t.category] || 0) + 1));
  const names = {};
  txns.forEach((t) => (names[t.desc] = (names[t.desc] || 0) + 1));
  return {
    key,
    name: Object.entries(names).sort((a, b) => b[1] - a[1])[0]?.[0] || name,
    txns,
    total: sum(txns, (t) => t.amount),
    count: txns.length,
    avg: txns.length ? sum(txns, (t) => t.amount) / txns.length : 0,
    thisYear: sum(txns.filter((t) => t.date.startsWith(year)), (t) => t.amount),
    byMonth,
    category: Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
    last: txns[0] ? txns[0].date : null,
  };
}
// The merchants you spent the most at since a date.
export function topMerchants(data, since, n = 8) {
  const map = new Map();
  allTransactions(data)
    .filter((t) => t.date >= since && t.desc)
    .forEach((t) => {
      const k = merchantKey(t.desc);
      const e = map.get(k) || { key: k, names: {}, total: 0, count: 0, category: t.category };
      e.names[t.desc] = (e.names[t.desc] || 0) + 1;
      e.total += Number(t.amount) || 0;
      e.count += 1;
      map.set(k, e);
    });
  return [...map.values()]
    .map((e) => ({ ...e, name: Object.entries(e.names).sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

// ---------------------------------------------------------------- trends
// The last n months up to this one that have anything logged.
export function recentMonths(data, n = 12, today = todayISO()) {
  const cur = keyOf(today);
  const keys = Object.keys(data.months || {})
    .filter((k) => k <= cur)
    .sort();
  return keys.slice(-n);
}
// Spending by category per month, and how this month compares with the six before it by the same day of the month.
export function categoryTrends(data, today = todayISO(), n = 12) {
  const keys = recentMonths(data, n, today);
  const cats = data.config.categories.map((c) => c.name);
  const byMonth = {};
  keys.forEach((k) => {
    const o = {};
    ((data.months[k] || {}).transactions || []).forEach((t) => (o[t.category] = (o[t.category] || 0) + (Number(t.amount) || 0)));
    byMonth[k] = o;
  });
  const cur = keyOf(today);
  const day = Number(today.slice(8, 10));
  const prev = keys.filter((k) => k < cur).slice(-6);
  const upTo = (k, cat) =>
    sum(
      ((data.months[k] || {}).transactions || []).filter((t) => t.category === cat && Number(t.date.slice(8, 10)) <= day),
      (t) => t.amount
    );
  const callouts = prev.length
    ? cats
        .map((name) => {
          const now = upTo(cur, name);
          const avg = sum(prev, (k) => upTo(k, name)) / prev.length;
          return { name, now, avg, diff: now - avg };
        })
        .filter((c) => Math.abs(c.diff) >= 25 && (c.avg > 0 || c.now > 0))
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    : [];
  const perCategory = cats.map((name) => {
    const values = keys.map((k) => byMonth[k][name] || 0);
    const done = keys.filter((k) => k < cur);
    return { name, values, avg: done.length ? sum(done, (k) => byMonth[k][name] || 0) / done.length : 0 };
  });
  return { keys, byMonth, callouts, perCategory, compared: prev.length, day };
}

// ---------------------------------------------------------------- subscriptions
// Charges that come back every month at about the same price, found in your expenses; plus your subscription bills.
export function findSubscriptions(data, today = todayISO()) {
  const since = keyOf(addDays(today, -400));
  const groups = new Map();
  allTransactions(data)
    .filter((t) => keyOf(t.date) >= since && (Number(t.amount) || 0) > 0)
    .forEach((t) => {
      const k = merchantKey(t.desc);
      if (!k) return;
      const g = groups.get(k) || { key: k, names: {}, tx: [] };
      g.names[t.desc] = (g.names[t.desc] || 0) + 1;
      g.tx.push(t);
      groups.set(k, g);
    });
  const out = [];
  for (const g of groups.values()) {
    const tx = g.tx.sort((a, b) => (a.date < b.date ? -1 : 1));
    const months = [...new Set(tx.map((t) => keyOf(t.date)))];
    if (months.length < 2 || tx.length / months.length > 1.4) continue; // not monthly, or bought many times a month
    const identical = tx.every((t) => Math.abs(Number(t.amount) - Number(tx[0].amount)) < 0.011);
    if (months.length < 3 && !identical) continue; // two similar lunches aren't a subscription
    if (/^(groceries|dining)/i.test(tx[tx.length - 1].category || '') && !identical) continue;
    const amounts = tx.map((t) => Number(t.amount));
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const steady = amounts.filter((a) => Math.abs(a - median) / median <= 0.15).length / amounts.length;
    if (steady < 0.75) continue;
    // mostly consecutive months
    const span = C.monthsBetween(months[0], months[months.length - 1]) + 1;
    if (months.length < Math.max(2, span * 0.6)) continue;
    if (months.length < 3 && C.monthsBetween(months[0], keyOf(today)) > 3) continue;
    const last = tx[tx.length - 1];
    const lastAmt = Number(last.amount);
    const prevAmts = amounts.slice(0, -1);
    const prevMedian = prevAmts.length ? [...prevAmts].sort((a, b) => a - b)[Math.floor(prevAmts.length / 2)] : lastAmt;
    const quiet = daysBetween(last.date, today);
    const status = quiet > 45 ? 'stopped' : C.monthsBetween(months[0], keyOf(today)) <= 1 ? 'new' : 'active';
    out.push({
      key: g.key,
      name: Object.entries(g.names).sort((a, b) => b[1] - a[1])[0][0],
      source: 'expenses',
      amount: lastAmt,
      monthly: lastAmt,
      yearly: lastAmt * 12,
      months: months.length,
      last: last.date,
      next: status === 'stopped' ? null : nextSameDay(last.date, today),
      status,
      priceUp: prevAmts.length && lastAmt > prevMedian * 1.03 ? prevMedian : null,
      category: last.category,
    });
  }
  const cur = keyOf(today);
  const root = (n) => String(n || '').replace(/\s*\(.*?\)\s*/g, ' ').trim().toLowerCase();
  C.activeBills(data.config, cur)
    .filter((b) => /subscri/i.test(b.category || ''))
    .forEach((b) => {
      const next = b.ends && data.config.bills.find((x) => x !== b && root(x.name) === root(b.name) && x.starts === C.nextMonth(b.ends));
      const m = (data.months || {})[cur];
      const amt = C.billCost(m, b);
      const due = C.billDue(b, cur);
      out.push({ key: `bill-${b.id}`, name: b.name, source: 'bill', amount: amt, monthly: amt, yearly: amt * 12, last: null, next: due && due >= today ? due : due ? C.billDue(b, C.nextMonth(cur)) : null, status: next ? 'active' : b.ends && b.ends <= cur ? 'ending' : 'active', ends: next ? '' : b.ends || '', changesTo: next ? { amount: C.billCost(null, next), from: next.starts } : null, category: b.category, name2: next ? next.name : null });
    });
  // subscription bills you ended in the last year (and didn't replace with a new rate) count as cancelled
  const yearAgo = C.addMonths(cur, -12);
  data.config.bills
    .filter((b) => /subscri/i.test(b.category || '') && b.ends && b.ends < cur && b.ends >= yearAgo)
    .filter((b) => !data.config.bills.some((x) => x !== b && root(x.name) === root(b.name) && x.starts && x.starts <= C.nextMonth(b.ends) && (!x.ends || x.ends >= cur)))
    .forEach((b) => {
      const amt = C.billCost(null, b);
      out.push({ key: `bill-${b.id}`, name: b.name, source: 'bill', amount: amt, monthly: amt, yearly: amt * 12, last: C.billDue(b, b.ends) || `${b.ends}-01`, next: null, status: 'stopped', category: b.category });
    });
  const active = out.filter((s) => s.status !== 'stopped');
  const stopped = out.filter((s) => s.status === 'stopped').sort((a, b) => b.yearly - a.yearly);
  return {
    active: active.sort((a, b) => b.monthly - a.monthly),
    stopped,
    monthly: sum(active, (s) => s.monthly),
    yearly: sum(active, (s) => s.yearly),
    savedYearly: sum(stopped, (s) => s.yearly),
  };
}
function nextSameDay(lastISO, today) {
  let [y, m, d] = lastISO.split('-').map(Number);
  let iso = lastISO;
  while (iso <= today) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const k = `${y}-${C.pad2(m)}`;
    iso = `${k}-${C.pad2(Math.min(d, C.daysIn(k)))}`;
  }
  return iso;
}

// ---------------------------------------------------------------- paychecks
// Bills charged between two dates (inclusive). Bills without a charge day count on the 1st.
export function billsBetween(data, from, to) {
  const out = [];
  let k = keyOf(from);
  while (k <= keyOf(to)) {
    const m = (data.months || {})[k];
    C.activeBills(data.config, k).forEach((b) => {
      const due = C.billDue(b, k) || `${k}-01`;
      if (due >= from && due <= to) out.push({ bill: b, key: k, due, cost: C.billCost(m, b), full: C.billFull(m, b), paid: C.isPaid(m, b, k) });
    });
    k = C.nextMonth(k);
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}
// One paycheck: what comes in, what savings and bills take before the next one, and what's left to spend.
export function paycheckPlan(data, start) {
  const cfg = data.config;
  const end = addDays(start, 13);
  const key = keyOf(start);
  const income = sum(cfg.incomes || [], (i) => i.biweekly);
  const savings = sum(C.activeSavings(cfg, key), (x) => x.biweekly);
  const bills = billsBetween(data, start, end);
  const billTotal = sum(bills, (b) => b.cost);
  const spendable = income - savings - billTotal;
  const extra = C.paydaysIn(key, cfg.payAnchor).length === 3 && C.paydaysIn(key, cfg.payAnchor)[2] === start;
  return { start, end, income, savings, bills, billTotal, spendable, extra };
}
export function paycheckView(data, today = todayISO()) {
  const cfg = data.config;
  if (!cfg.payAnchor) return null;
  const start = C.lastPayday(cfg.payAnchor, new Date(`${today}T12:00:00`));
  const cur = paycheckPlan(data, start);
  const spent = sum(
    allTransactions(data).filter((t) => t.date >= start && t.date <= today),
    (t) => t.amount
  );
  const daysLeft = daysBetween(today, cur.end) + 1;
  const left = cur.spendable - spent;
  const upcoming = [1, 2, 3, 4, 5, 6].map((i) => paycheckPlan(data, addDays(start, 14 * i)));
  const budgetPerCheck = (sum(cfg.categories, (c) => c.budget) * 12) / 26;
  return { ...cur, spent, left, daysLeft, perDay: daysLeft > 0 ? left / daysLeft : 0, upcoming, budgetPerCheck, next: addDays(start, 14) };
}

// ---------------------------------------------------------------- milestones
// Coming changes, from your own bills and savings schedule: bills that end (and what that frees each month),
// savings stepping up, and the emergency fund.
export function milestones(data, today = todayISO()) {
  const cfg = data.config;
  const cur = keyOf(today);
  const out = [];
  const ending = new Map();
  const root = (n) => String(n || '').replace(/\s*\(.*?\)\s*/g, ' ').trim().toLowerCase();
  cfg.bills.forEach((b) => {
    if (!b.ends || b.ends < cur) return;
    if (cfg.bills.some((x) => x !== b && root(x.name) === root(b.name) && x.starts === C.nextMonth(b.ends))) return; // a new rate, not an end
    const list = ending.get(b.ends) || [];
    list.push(b);
    ending.set(b.ends, list);
  });
  for (const [ends, bills] of ending) {
    const frees = sum(bills, (b) => C.billCost(null, b));
    const payments = C.monthsBetween(cur, ends) + 1;
    out.push({
      kind: 'bill',
      key: C.nextMonth(ends),
      last: ends,
      title: bills.length === 1 ? `${bills[0].name} ends` : `${bills.map((b) => b.name.replace(/ installment$/i, '')).join(' and ')} installments end`,
      detail: `Last payment ${C.monthShort(ends)}; ${payments} ${payments === 1 ? 'payment' : 'payments'} to go (${fmt0(frees * payments)})`,
      frees,
      bills: bills.map((b) => b.name),
    });
  }
  const steps = cfg.savings.filter((s) => s.starts && s.starts > cur).sort((a, b) => (a.starts < b.starts ? -1 : 1));
  steps.forEach((s) => {
    const per = sum(C.activeSavings(cfg, s.starts), (x) => x.biweekly);
    const before = sum(C.activeSavings(cfg, C.prevMonth(s.starts)), (x) => x.biweekly);
    if (per === before) return;
    out.push({ kind: 'savings', key: s.starts, title: `Savings ${per > before ? 'steps up' : 'changes'} to ${fmt0(per)} a paycheck`, detail: `From ${fmt0(before)}: about ${fmt0(((per - before) * 26) / 12)} more a month`, frees: 0 });
  });
  if (data.savings) {
    const stats = monthStats(data, cur);
    const goal = stats.fixed * 3;
    const proj = C.projectSavings(data, 36);
    const bal = C.savingsBalance(data);
    const hit = proj.find((p) => p.balance >= goal);
    if (goal > 0 && bal < goal && hit) out.push({ kind: 'fund', key: hit.key, title: `Emergency fund reaches three months of fixed costs`, detail: `${fmt0(goal)}, at the scheduled deposits plus interest`, frees: 0 });
  }
  const sorted = out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  let freed = 0;
  sorted.forEach((m) => {
    freed += m.frees || 0;
    m.freedSoFar = freed;
    m.months = C.monthsBetween(cur, m.key);
  });
  return sorted;
}
const monthStats = (data, key) => C.monthStats(data, key);

// ---------------------------------------------------------------- net worth
// What you have minus what you owe: savings, the brokerage account, the Apple Card, and the car loan (its balance from
// the Auto tab, or the car payments left if that's blank).
export function netWorth(data, { quotes = {}, auto = null, today = todayISO() } = {}) {
  const savings = data.savings ? C.savingsBalance(data) : 0;
  const withQuotes = data.portfolio ? { ...data, portfolio: { ...data.portfolio, quotes: { ...(data.portfolio.quotes || {}), ...quotes } } } : data;
  const stocks = data.portfolio ? C.portfolioRows(withQuotes).total : 0;
  const card = data.card ? C.cardBalance(data) : 0;
  let loan = 0;
  let loanNote = '';
  const lb = auto && auto.loan && Number(auto.loan.balance);
  if (lb > 0) {
    loan = lb;
    loanNote = 'balance from the Auto tab';
  } else {
    const cur = keyOf(today);
    const car = data.config.bills.find((b) => /car payment|auto loan/i.test(b.name) && b.ends && b.ends >= cur);
    if (car) {
      const due = C.billDue(car, cur);
      const left = C.monthsBetween(cur, car.ends) + (due && due < today ? 0 : 1);
      loan = C.billCost(null, car) * Math.max(0, left);
      loanNote = `${left} car payments left`;
    }
  }
  return { savings, stocks, card, loan, loanNote, total: savings + stocks - card - loan };
}
// Keep one reading per month (the latest), so the chart builds up over time.
export function recordNetWorth(d, nw, today = todayISO()) {
  d.netWorth = d.netWorth || {};
  const k = keyOf(today);
  d.netWorth[k] = { at: today, savings: C.round2(nw.savings), stocks: C.round2(nw.stocks), card: C.round2(nw.card), loan: C.round2(nw.loan), total: C.round2(nw.total) };
}

// ---------------------------------------------------------------- roommates
// Venmo request link, prefilled. The app scheme on phones, the website elsewhere.
export function venmoLink(handle, amount, note, app = true) {
  const h = String(handle || '')
    .trim()
    .replace(/^@/, '');
  const q = `txn=charge&recipients=${encodeURIComponent(h)}&amount=${Number(amount).toFixed(2)}&note=${encodeURIComponent(note)}`;
  return app ? `venmo://paycharge?${q}` : `https://venmo.com/?${q}&audience=private`;
}
// What each roommate still owes for charged bills in a month, which bills, and how long the oldest has waited.
export function roommateDues(data, key, today = todayISO()) {
  const cfg = data.config;
  const m = (data.months || {})[key];
  if (!m) return [];
  const rs = C.roommatesOf(cfg);
  if (!rs.length) return [];
  const shared = C.activeBills(cfg, key).filter((b) => C.billShare(b) < 1 && C.billOwed(m, b) > 0 && C.isPaid(m, b, key));
  return rs.map((r) => {
    const bills = shared
      .filter((b) => !C.collectedBy(m, b, r.id))
      .map((b) => {
        const due = C.billDue(b, key) || `${key}-01`;
        return { bill: b, amount: C.billOwed(m, b) / rs.length, due, days: Math.max(0, daysBetween(due, today)) };
      });
    const owed = sum(bills, (b) => b.amount);
    const note = bills.length ? `${bills.map((b) => b.bill.name).join(', ')} (${C.monthName(key)})` : '';
    return { roommate: r, bills, owed, oldest: bills.length ? Math.max(...bills.map((b) => b.days)) : 0, note };
  });
}

// ---------------------------------------------------------------- phone alerts
export const DEFAULT_ALERTS = { bills: true, budget: true, threshold: 0.9, payday: true, roommates: true, monthly: true };
// The alerts due today. `sent` holds keys already sent, so each goes out once.
export function computeAlerts(data, today = todayISO(), prefs = {}, sent = {}) {
  const p = { ...DEFAULT_ALERTS, ...prefs };
  const cfg = data.config;
  const out = [];
  const push = (a) => !sent[a.key] && out.push(a);
  const cur = keyOf(today);
  if (p.bills) {
    const tomorrow = addDays(today, 1);
    const due = billsBetween(data, tomorrow, tomorrow).filter((b) => b.bill.day);
    if (due.length)
      push({
        key: `bills:${tomorrow}`,
        title: due.length === 1 ? `${due[0].bill.name} charges tomorrow` : `${due.length} bills charge tomorrow`,
        body: due.map((b) => `${b.bill.name}: ${fmt(b.full)}${b.cost < b.full ? ` (yours ${fmt(b.cost)})` : ''}${b.bill.card ? ' on the Apple Card' : ''}`).join('\n'),
        tags: 'calendar',
      });
  }
  if (p.budget) {
    const s = C.monthStats(data, cur);
    cfg.categories.forEach((c) => {
      const spent = s.spentBy[c.name] || 0;
      if (!(c.budget > 0)) return;
      const f = spent / c.budget;
      const level = f > 1 ? 'over' : f >= p.threshold ? 'near' : null;
      if (!level) return;
      push({
        key: `budget:${cur}:${c.name}:${level}`,
        title: level === 'over' ? `${c.name} is over budget` : `${c.name} is at ${Math.round(f * 100)}% of its budget`,
        body: `${fmt(spent)} of ${fmt0(c.budget)} this month${level === 'over' ? `, ${fmt(spent - c.budget)} over` : `, ${fmt(c.budget - spent)} left`} with ${C.daysIn(cur) - Number(today.slice(8, 10))} days to go.`,
        tags: level === 'over' ? 'warning' : 'chart_with_upwards_trend',
        priority: level === 'over' ? 4 : 3,
      });
    });
  }
  if (p.payday && cfg.payAnchor) {
    const n = C.nextPayday(cfg.payAnchor, new Date(`${today}T12:00:00`));
    if (n && n.days === 0) {
      const plan = paycheckPlan(data, today);
      push({
        key: `payday:${today}`,
        title: `Payday: ${fmt0(plan.income)}`,
        body: `${fmt0(plan.savings)} to savings, ${fmt0(plan.billTotal)} in bills before the next one${plan.bills.length ? ` (${plan.bills.map((b) => b.bill.name).join(', ')})` : ''}. ${fmt0(plan.spendable)} to spend, about ${fmt0(plan.spendable / 14)} a day.${plan.extra ? ' Third paycheck this month: this one is extra.' : ''}`,
        tags: 'moneybag',
      });
    }
  }
  if (p.roommates) {
    [prevMonthKey(cur), cur].forEach((k) =>
      roommateDues(data, k, today).forEach((d) =>
        d.bills.forEach((b) => {
          const wk = b.days >= 14 ? 14 : b.days >= 7 ? 7 : 0;
          if (!wk) return;
          push({ key: `roommate:${k}:${b.bill.id}:${d.roommate.id}:${wk}`, title: `${d.roommate.name || 'A roommate'} hasn't paid for ${b.bill.name}`, body: `${fmt(b.amount)}, ${b.days} days since it was charged.`, tags: 'house' });
        })
      )
    );
  }
  if (p.monthly && today.slice(8, 10) === '01') {
    const last = prevMonthKey(cur);
    if ((data.months || {})[last]) {
      const s = C.monthStats(data, last);
      const left = s.budget - s.spent;
      push({ key: `monthly:${last}`, title: `${C.monthName(last)} wrap-up`, body: `${left >= 0 ? `${fmt0(left)} under` : `${fmt0(-left)} over`} your ${fmt0(s.budget)} spending budget. Net ${fmt0(s.net)} (${C.pct(s.rate)} of income).`, tags: 'spiral_calendar' });
    }
  }
  return out;
}
const prevMonthKey = (k) => C.prevMonth(k);
