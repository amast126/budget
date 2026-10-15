// The Planning tab: a house on Long Island (with renovations) and a wedding, costed out and laid over the budget's own
// savings projection. Everything here is estimates; the starting numbers come from public sources (listed in SOURCES)
// and every one of them can be changed. Your share of both plans (half, unless you change it) is what comes out of
// your savings. Pure functions, no React.
import * as C from './budget-core.js';

const { sum, keyOf, todayISO, round2 } = C;
const isKey = (k) => /^\d{4}-\d{2}$/.test(k || '');
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const num = (v, d = 0) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
const dateOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const uid = () => C.uid();

// ---------------------------------------------------------------- starting numbers
// Median single-family sale prices (OneKey MLS, January 2026) and effective property tax rates (taxes paid as a share
// of home value, Census ACS 2024 5-year). Bills swing a lot by school district, so a listing's actual bill beats these.
export const COUNTIES = {
  suffolk: { name: 'Suffolk', price: 700000, tax: 1.73 },
  nassau: { name: 'Nassau', price: 835000, tax: 1.72 },
  other: { name: 'Somewhere else', price: 600000, tax: 1.5 },
};
export const RATE = 7.4; // Freddie Mac 30-year fixed average, week of Oct 8, 2026 (15-year: 6.73%)
export const INSURANCE = 2900; // Long Island average, about $2,840 a year for $300k of dwelling coverage (Insurify)
// Buyer closing costs on Long Island (Douglas Elliman's closing cost guide)
export const CLOSING = {
  recording: 0.008, // mortgage recording tax, 1-3 family homes in Nassau and Suffolk, on the loan amount
  mansion: 0.01, // on the price, at $1M or more
  peconic: 0.024, // Peconic Bay tax in the five East End towns; 3.4% at $1M or more (exemptions vary by town)
  peconicHigh: 0.034,
  ownerTitle: 450, // per $100k of price, plus 15% at $1M or more
  lenderTitle: 130, // per $100k of loan
  bankAttorney: 700,
  bankFees: 2045, // bank fee, application, processing, a mid appraisal, credit report
  recordingFees: 925, // recording fees and municipal search
};
export const RENO_PRESETS = [
  ['Kitchen refresh (cabinet faces, counters, appliances)', 28500],
  ['Kitchen remodel (new cabinets, counters, appliances)', 82800],
  ['Bathroom remodel', 26100],
  ['Living areas: paint, flooring, lighting', 7500],
  ['Bedroom refresh', 3500],
];
// A Long Island wedding averages about $67,000 (Brides of Long Island), roughly double the $34,200 national average
// (The Knot 2026 Real Weddings Study). Catering here runs $150–350 a person and a band $8,000–20,000 (News 12).
// These defaults land near the Long Island average at 150 guests.
export const WEDDING_CATS = [
  { id: 'venue', name: 'Venue, food & drinks', perGuest: true, amount: 230 },
  { id: 'photo', name: 'Photo & video', amount: 6500 },
  { id: 'music', name: 'Music (DJ or band)', amount: 5000 },
  { id: 'flowers', name: 'Flowers & decor', amount: 6000 },
  { id: 'attire', name: 'Attire & beauty', amount: 4000 },
  { id: 'rings', name: 'Wedding bands', amount: 2500 },
  { id: 'planner', name: 'Planner or day-of coordinator', amount: 3000 },
  { id: 'paper', name: 'Invitations & stationery', amount: 800 },
  { id: 'officiant', name: 'Officiant', amount: 500 },
  { id: 'travel', name: 'Transportation', amount: 1200 },
  { id: 'extras', name: 'Cake, favors & extras', amount: 1500 },
];
export const SOURCES = [
  ['Home prices: OneKey MLS via News 12 (Jan 2026)', 'https://longisland.news12.com/home-prices-on-long-island-continue-to-climb'],
  ['Mortgage rate: Freddie Mac weekly survey (Oct 8, 2026)', 'https://www.mortgagenewsdaily.com/mortgage-rates/freddie-mac'],
  ['Closing costs: Douglas Elliman, Long Island', 'https://www.elliman.com/sellers-buyers-renters-guides/long-island/closing-costs'],
  ['Property tax rates: Census ACS 2024 (Suffolk)', 'https://propertytaxbystate.com/new-york/suffolk-county'],
  ['Property tax rates: Census ACS 2024 (Nassau)', 'https://ustax.tools/nassau-county-property-tax-calculator/'],
  ['Home insurance: Insurify, Long Island', 'https://insurify.com/homeowners-insurance/new-york/long-island'],
  ['Renovation costs: NerdWallet (national averages, 2026)', 'https://nerdwallet.com/article/mortgages/cost-renovate-house'],
  ['Wedding costs: Long Island budget guide (2026)', 'https://jsvisionsphotoandvideo.com/long-island-wedding-budget-2026/'],
  ['Wedding costs: News 12 Long Island', 'https://longisland.news12.com/tips-to-make-a-long-island-wedding-less-taxing-on-your-wallet'],
  ['Budget shares: The Knot 2026 Real Weddings Study', 'https://www.theknot.com/wedding-on-a-budget'],
];

// ---------------------------------------------------------------- the document
export function defaultPlanning() {
  return {
    version: 1,
    share: 50, // your share (%) of the house and the wedding
    reserveMonths: 3, // keep this many months of bills in savings, whatever happens
    house: {
      county: 'suffolk',
      price: COUNTIES.suffolk.price,
      downPct: 20,
      rate: RATE,
      term: 30,
      taxRate: COUNTIES.suffolk.tax,
      taxBill: '', // a listing's actual yearly bill, when you have one
      insurance: INSURANCE,
      hoa: 0,
      pmi: 0.6, // % of the loan a year, only under 20% down
      maint: 1, // % of the price a year
      eastEnd: false,
      attorney: 2500,
      escrowMonths: 4,
      buyMonth: '',
      maxPct: 35, // of your take-home, for your share of the housing cost
      renos: [],
    },
    wedding: {
      date: '',
      guests: 150,
      cats: Object.fromEntries(WEDDING_CATS.map((c) => [c.id, c.amount])),
      cushion: 5, // % on top of anything not booked yet
      family: 0, // what family is putting in
      vendors: [],
    },
  };
}
export function normalizePlanning(d) {
  const base = defaultPlanning();
  if (!d || typeof d !== 'object') return base;
  const h = { ...base.house, ...(d.house || {}) };
  h.renos = (h.renos || []).filter((r) => r && r.id).map((r) => ({ name: '', cost: 0, month: '', ...r }));
  const w = { ...base.wedding, ...(d.wedding || {}) };
  w.cats = { ...base.wedding.cats, ...(w.cats || {}) };
  w.vendors = (w.vendors || [])
    .filter((v) => v && v.id)
    .map((v) => ({ name: '', cat: 'venue', total: 0, note: '', ...v, payments: (v.payments || []).filter((p) => p && p.id).map((p) => ({ due: '', amount: 0, paid: false, ...p })) }));
  return { ...base, ...d, house: h, wedding: w };
}
export const shareOf = (plan) => Math.max(0, Math.min(100, num(plan.share, 50))) / 100;

// ---------------------------------------------------------------- the house
// Monthly principal and interest on a fixed-rate loan.
export function payment(principal, ratePct, years) {
  const n = Math.max(1, num(years, 30)) * 12;
  const r = num(ratePct) / 100 / 12;
  if (!(principal > 0)) return 0;
  if (r <= 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}
// Property tax a year: the listing's bill when there is one (for its own price), else the rate.
const taxYear = (h, price, useBill = true) => (useBill && num(h.taxBill) > 0 ? num(h.taxBill) : (price * num(h.taxRate)) / 100);
// Everything a month at a given price: mortgage, taxes, insurance, PMI under 20% down, upkeep, HOA.
export function houseMonthly(h, price = num(h.price), useBill = true) {
  const down = (price * num(h.downPct, 20)) / 100;
  const loan = Math.max(0, price - down);
  const pi = payment(loan, h.rate, h.term);
  const tax = taxYear(h, price, useBill) / 12;
  const ins = num(h.insurance) / 12;
  const pmi = num(h.downPct, 20) < 20 ? (loan * num(h.pmi)) / 100 / 12 : 0;
  const maint = (price * num(h.maint)) / 100 / 12;
  const hoa = num(h.hoa);
  return { price, down, loan, pi, tax, ins, pmi, maint, hoa, total: pi + tax + ins + pmi + maint + hoa };
}
// What it takes to close, line by line (the buyer's side on Long Island).
export function closingCosts(h, price = num(h.price), useBill = true) {
  const m = houseMonthly(h, price, useBill);
  const big = price >= 1e6;
  const ny = h.county === 'nassau' || h.county === 'suffolk'; // the New York taxes only apply on Long Island
  const items = [
    ['Mortgage recording tax (0.8% of the loan)', ny ? m.loan * CLOSING.recording : 0],
    ['Mansion tax (1% at $1M or more)', ny && big ? price * CLOSING.mansion : 0],
    ['Peconic Bay tax (East End towns, before exemptions)', ny && h.eastEnd ? price * (big ? CLOSING.peconicHigh : CLOSING.peconic) : 0],
    ['Owner’s title insurance', (price / 1e5) * CLOSING.ownerTitle * (big ? 1.15 : 1)],
    ['Lender’s title insurance', (m.loan / 1e5) * CLOSING.lenderTitle],
    ['Your attorney', num(h.attorney)],
    ['The bank’s attorney', m.loan > 0 ? CLOSING.bankAttorney : 0],
    ['Bank fees and appraisal', m.loan > 0 ? CLOSING.bankFees : 0],
    ['Recording fees and searches', CLOSING.recordingFees],
    [`Property tax escrow (${num(h.escrowMonths, 4)} months)`, m.tax * num(h.escrowMonths, 4)],
    ['First year of home insurance', num(h.insurance)],
  ].filter(([, v]) => v > 0);
  return { items, total: sum(items, ([, v]) => v) };
}
// Renovations paid when you buy (no month, or the buy month or earlier) versus later on.
export const renosAtBuy = (h) => h.renos.filter((r) => !isKey(r.month) || !isKey(h.buyMonth) || r.month <= h.buyMonth);
export const renosLater = (h) => h.renos.filter((r) => isKey(r.month) && isKey(h.buyMonth) && r.month > h.buyMonth);
// Cash to buy at a price: down payment, closing, and the renovations done right away.
export function cashToBuy(h, price = num(h.price), useBill = true) {
  const m = houseMonthly(h, price, useBill);
  const cc = closingCosts(h, price, useBill);
  const renos = sum(renosAtBuy(h), (r) => r.cost);
  return { down: m.down, closing: cc.total, renos, total: m.down + cc.total + renos };
}

// ---------------------------------------------------------------- the wedding
// Each category at its estimate, or at what you've booked once a vendor is in it; the cushion covers what isn't
// booked yet. Paid is what's been marked paid; family money comes off the top.
export function weddingCosts(w) {
  const rows = WEDDING_CATS.map((c) => {
    const amount = num(w.cats[c.id], c.amount);
    const est = c.perGuest ? amount * num(w.guests) : amount;
    const vs = w.vendors.filter((v) => v.cat === c.id);
    const booked = vs.length ? sum(vs, (v) => v.total) : null;
    const paid = sum(
      vs.flatMap((v) => v.payments.filter((p) => p.paid)),
      (p) => p.amount,
    );
    return { ...c, amount, est, booked, use: booked == null ? est : booked, paid, vendors: vs };
  });
  const sub = sum(rows, (r) => r.use);
  const cushion = (sum(rows.filter((r) => r.booked == null), (r) => r.est) * num(w.cushion)) / 100;
  const total = sub + cushion;
  const paid = sum(rows, (r) => r.paid);
  const family = Math.min(Math.max(0, num(w.family)), total);
  return { rows, sub, cushion, total, paid, family, left: Math.max(0, total - family - paid), booked: sum(rows.filter((r) => r.booked != null), (r) => r.booked) };
}
export const weddingMonth = (w) => (isDay(w.date) ? keyOf(w.date) : isKey(w.date) ? w.date : '');
// Payments not marked paid, soonest first.
export function unpaidPayments(w) {
  return w.vendors
    .flatMap((v) => v.payments.filter((p) => !p.paid).map((p) => ({ ...p, vendor: v })))
    .sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0);
}

// ---------------------------------------------------------------- the budget, as the plan sees it
// Your monthly take-home, the savings projection (scheduled deposits, planned deposits like January's, interest),
// your bills by month and the rent in them.
export function budgetView(budget, today = todayISO(), months = 72) {
  if (!budget) return null;
  const d = C.normalizeBudget(JSON.parse(JSON.stringify(budget)));
  const cfg = d.config;
  const income = (sum(cfg.incomes || [], (i) => i.biweekly) * 26) / 12;
  const proj = d.savings ? C.projectSavings(d, months, dateOf(today)) : [];
  const isRent = (b) => /\brent\b/i.test(b.name || '');
  return {
    income,
    proj,
    balance: d.savings ? C.savingsBalance(d) : 0,
    apy: d.savings ? num(d.savings.apy) : 0,
    fixedAt: (k) => sum(C.activeBills(cfg, k), (b) => C.billCost(null, b)),
    rentAt: (k) => sum(C.activeBills(cfg, k).filter(isRent), (b) => C.billCost(null, b)),
  };
}

// ---------------------------------------------------------------- the two together
// Money leaving savings for the plans, your share, by month: wedding payments by due date (anything unscheduled
// lands in the wedding month), the house at the buy month, later renovations in theirs. Past-due items count now.
export function outflows(plan, today = todayISO(), opts = {}) {
  const cur = keyOf(today);
  const s = shareOf(plan);
  const h = plan.house;
  const w = plan.wedding;
  const out = [];
  const at = (k) => (k < cur ? cur : k);
  const wk = weddingMonth(w);
  if (!opts.noWedding) {
    const wc = weddingCosts(w);
    const unpaid = unpaidPayments(w).filter((p) => p.amount > 0);
    const scheduled = sum(unpaid, (p) => p.amount);
    const scale = scheduled > 0 ? Math.min(1, wc.left / scheduled) : 0;
    unpaid.forEach((p) => {
      const k = isDay(p.due) ? keyOf(p.due) : wk;
      if (!k) return;
      out.push({ key: at(k), amount: p.amount * scale * s, kind: 'wedding', label: `${p.vendor.name || 'Wedding vendor'}${p.note ? `: ${p.note}` : ''}`, due: p.due });
    });
    const rest = Math.max(0, wc.left - scheduled);
    if (wk && rest > 0.5) out.push({ key: at(wk), amount: rest * s, kind: 'wedding', label: 'Rest of the wedding (not scheduled yet)' });
  }
  const buyAt = opts.buyMonth || h.buyMonth;
  if (!opts.noHouse && isKey(buyAt)) {
    const c = cashToBuy({ ...h, buyMonth: buyAt });
    out.push({ key: at(buyAt), amount: c.total * s, kind: 'house', label: 'Buying the house: down payment, closing, first renovations' });
    renosLater({ ...h, buyMonth: buyAt }).forEach((r) => out.push({ key: at(r.month), amount: num(r.cost) * s, kind: 'reno', label: r.name || 'Renovation' }));
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
// Your housing cost a month once you own (your share), and the cushion to keep: some months of your bills, with the
// house in place of rent after you buy.
export function reserveAt(plan, view, k) {
  const h = plan.house;
  const owning = isKey(h.buyMonth) && k >= h.buyMonth;
  const bills = view.fixedAt(k) - (owning ? view.rentAt(k) : 0) + (owning ? houseMonthly(h).total * shareOf(plan) : 0);
  return Math.max(0, bills) * num(plan.reserveMonths, 3);
}
// Month by month: the savings projection, the same minus what the plans take out (and the interest that money would
// have earned), and the cushion to stay above.
export function timeline(plan, view, today = todayISO(), opts = {}) {
  if (!view || !view.proj.length) return null;
  const cur = keyOf(today);
  const outs = outflows(plan, today, opts);
  const rate = C.monthlyRate(view.apy);
  const last = [cur, weddingMonth(plan.wedding), opts.buyMonth || plan.house.buyMonth, ...outs.map((o) => o.key)].filter(isKey).sort().pop();
  const end = C.addMonths(last, 12);
  const h = opts.buyMonth ? { ...plan, house: { ...plan.house, buyMonth: opts.buyMonth } } : plan;
  let gone = 0;
  const rows = [];
  for (const p of view.proj) {
    if (p.key > end) break;
    const out = sum(
      outs.filter((o) => o.key === p.key),
      (o) => o.amount,
    );
    gone = gone * (p.key === cur ? 1 : 1 + rate) + out;
    const reserve = reserveAt(h, view, p.key);
    const after = p.balance - gone;
    // only the part of a shortfall the plans cause counts (savings already under the cushion isn't their doing)
    rows.push({ key: p.key, saved: p.balance, out, after, reserve, short: Math.max(0, Math.min(reserve - after, p.balance - after)) });
  }
  const worst = rows.reduce((m, r) => (r.short > 0.5 && (!m || r.short > m.short) ? r : m), null);
  const first = outs.length ? outs[0].key : null;
  const low = first ? rows.filter((r) => r.key >= first).reduce((m, r) => (!m || r.after < m.after ? r : m), null) : null;
  return { rows, outs, low, worst, short: worst ? worst.short : 0, ok: !worst };
}
// The first month you could buy at this price and stay above the cushion from then on (with the wedding too).
export function earliestBuy(plan, view, today = todayISO()) {
  if (!view || !view.proj.length) return null;
  const cur = keyOf(today);
  for (const p of view.proj) {
    const k = p.key < cur ? cur : p.key;
    const t = timeline(plan, view, today, { buyMonth: k });
    if (t && t.rows.filter((r) => r.key >= k).every((r) => r.short <= 0.5)) return k;
  }
  return null;
}
// The most house you could take on, two ways: your share of the monthly cost within your limit of take-home, and your
// share of the cash to buy within what's left at the buy month after the wedding and the cushion.
export function affordability(plan, view, today = todayISO()) {
  if (!view) return null;
  const h = plan.house;
  const s = shareOf(plan) || 1;
  const cap = (view.income * num(h.maxPct, 35)) / 100;
  const find = (ok) => {
    let lo = 0;
    let hi = 5e6;
    if (!ok(lo)) return 0;
    if (ok(hi)) return hi;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    return Math.floor(lo / 1000) * 1000;
  };
  const byMonthly = find((p) => houseMonthly(h, p, false).total * s <= cap);
  let cash = null;
  let byCash = null;
  if (isKey(h.buyMonth)) {
    // the house money leaves at the buy month and stays gone, so it has to fit under the lowest point from then on
    const t = timeline(plan, view, today, { noHouse: true });
    const from = h.buyMonth < keyOf(today) ? keyOf(today) : h.buyMonth;
    const rows = t ? t.rows.filter((r) => r.key >= from) : [];
    if (rows.length) {
      cash = Math.max(0, Math.min(...rows.map((r) => r.after - r.reserve)));
      byCash = find((p) => cashToBuy(h, p, false).total * s <= cash);
    }
  }
  const price = byCash == null ? byMonthly : Math.min(byMonthly, byCash);
  return { price, byMonthly, byCash, cash, cap, limit: byCash != null && byCash < byMonthly ? 'cash' : 'monthly' };
}

// ---------------------------------------------------------------- changes (each takes ids made outside, since a
// change can run twice: once on screen, once when it's saved)
export function setHouse(plan, patch) {
  Object.assign(plan.house, patch);
}
export function setCounty(plan, county) {
  const c = COUNTIES[county];
  if (!c) return;
  plan.house.county = county;
  plan.house.taxRate = c.tax;
  if (county !== 'suffolk') plan.house.eastEnd = false;
}
export function addReno(plan, r) {
  plan.house.renos.push({ id: r.id || uid(), name: String(r.name || '').trim(), cost: round2(num(r.cost)), month: isKey(r.month) ? r.month : '' });
}
export function removeReno(plan, id) {
  plan.house.renos = plan.house.renos.filter((r) => r.id !== id);
}
export function setWedding(plan, patch) {
  Object.assign(plan.wedding, patch);
}
export function setCat(plan, id, amount) {
  plan.wedding.cats[id] = Math.max(0, num(amount));
}
export function addVendor(plan, v) {
  plan.wedding.vendors.push({ id: v.id || uid(), name: String(v.name || '').trim(), cat: WEDDING_CATS.some((c) => c.id === v.cat) ? v.cat : 'venue', total: round2(num(v.total)), note: '', payments: [] });
}
export function updateVendor(plan, id, patch) {
  const v = plan.wedding.vendors.find((x) => x.id === id);
  if (v) Object.assign(v, patch);
}
export function removeVendor(plan, id) {
  plan.wedding.vendors = plan.wedding.vendors.filter((v) => v.id !== id);
}
export function addPayment(plan, vendorId, p) {
  const v = plan.wedding.vendors.find((x) => x.id === vendorId);
  if (!v) return;
  v.payments.push({ id: p.id || uid(), due: isDay(p.due) ? p.due : '', amount: round2(num(p.amount)), paid: !!p.paid, note: String(p.note || '').trim() });
  v.payments.sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
}
export function togglePaid(plan, vendorId, payId) {
  const v = plan.wedding.vendors.find((x) => x.id === vendorId);
  const p = v && v.payments.find((x) => x.id === payId);
  if (p) p.paid = !p.paid;
}
export function removePayment(plan, vendorId, payId) {
  const v = plan.wedding.vendors.find((x) => x.id === vendorId);
  if (v) v.payments = v.payments.filter((x) => x.id !== payId);
}

// ---------------------------------------------------------------- words
export const monthsUntil = (k, today = todayISO()) => (isKey(k) ? C.monthsBetween(keyOf(today), k) : null);
export const whenText = (k, today = todayISO()) => {
  const n = monthsUntil(k, today);
  if (n == null) return '';
  if (n < 0) return `${-n} ${-n === 1 ? 'month' : 'months'} ago`;
  if (n === 0) return 'this month';
  if (n < 24) return `in ${n} ${n === 1 ? 'month' : 'months'}`;
  const y = Math.floor(n / 12);
  const m = n % 12;
  return `in ${y} years${m ? ` ${m} ${m === 1 ? 'month' : 'months'}` : ''}`;
};
export { isKey, isDay };
