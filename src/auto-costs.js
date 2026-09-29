// What the car costs, and whether to keep it: the Auto tab's Costs section. Payment and insurance come from the
// budget's bills, gas from your fill-ups (or the budget's gas charges), and everything else car-related from the
// budget's Gas & Auto category, less rides and transit that share it. Nothing here is saved except your inputs for a
// next car, which live in the auto document (a.next).
import { uid, todayISO, keyOf, pad2 } from './budget-logic.js';
import { carMoney, milesPerYear, maintenance, tireState, brakeState, batteryState, priceOf, JOBS, TREAD, monthLabel, addMonthsIso, dayLabel } from './auto-logic.js';
import { carCategory, kindOf, fuelStats } from './auto-fuel.js';

const nextMonth = (ym) => {
  let [y, m] = ym.split('-').map(Number);
  m++;
  if (m > 12) (m = 1), y++;
  return `${y}-${pad2(m)}`;
};

// The car loan while payments remain (or one with no end date in the budget).
const activeLoan = (money) => (money && money.loan && (money.loan.left == null || money.loan.left > 0) ? money.loan : null);

// Average monthly car spending in the budget over up to 12 complete months, split into fuel, other car costs and
// rides/transit. Service logged on the Auto tab but never added to the budget counts too (once).
export function carSpend(a, data, today = todayISO()) {
  const cat = carCategory(data);
  const cur = keyOf(today);
  const months = (data && data.months) || {};
  const keys = Object.keys(months)
    .filter((k) => k < cur && (months[k].transactions || []).length)
    .sort()
    .slice(-12);
  const out = { months: keys.length, fuel: 0, car: 0, transit: 0, from: keys[0] || null, to: keys[keys.length - 1] || null, category: cat ? cat.name : null };
  if (!cat || !keys.length) return out;
  const txs = keys.flatMap((k) => (months[k].transactions || []).filter((t) => t.category === cat.name));
  const fillTx = new Set(a.fills.map((f) => f.txId).filter(Boolean)); // logged as a fill-up: gas, whatever it's called
  for (const t of txs) out[fillTx.has(t.id) ? 'fuel' : kindOf(t.desc)] += Number(t.amount) || 0;
  const matched = (s) => txs.some((t) => t.date === s.date && Math.abs(Number(t.amount) - s.cost) < 0.01);
  for (const s of a.service) {
    const k = s.date.slice(0, 7);
    if (s.cost > 0 && k >= keys[0] && k <= keys[keys.length - 1] && (s.budgeted === false || (s.budgeted !== true && !matched(s)))) out.car += s.cost;
  }
  for (const k of ['fuel', 'car', 'transit']) out[k] = out[k] / keys.length;
  return out;
}

// A month of owning the car: payment, insurance, gas, and upkeep (service, parking, tolls, washes, fees).
export function ownership(a, data, today = todayISO()) {
  const money = carMoney(data, today);
  const spend = carSpend(a, data, today);
  const fuel = fuelStats(a, today);
  const rate = milesPerYear(a).rate;
  const lines = [];
  const loan = activeLoan(money);
  if (loan) lines.push({ id: 'loan', name: 'Car payment', monthly: loan.amount, note: loan.left != null ? `${loan.left} left · last one ${monthLabel(`${loan.ends}-01`)}` : `Charges on the ${loan.day}th` });
  if (money && money.insurance)
    lines.push({ id: 'insurance', name: money.insurance.name, monthly: money.insurance.amount, note: money.insurance.next ? `$${money.insurance.next.amount.toFixed(2)}/mo from ${monthLabel(`${money.insurance.next.from}-01`)}` : '' });
  // what you actually spent on gas, from the budget; else an estimate from your fill-ups (or the EPA rating)
  const fuelMonthly = spend.fuel || fuel.perMonth || 0;
  const u = fuel.electric ? ['mi/kWh', '/kWh', 2] : ['MPG', '/gal', 1];
  if (fuelMonthly)
    lines.push({
      id: 'fuel',
      name: fuel.electric ? 'Charging' : 'Gas',
      monthly: fuelMonthly,
      note: spend.fuel
        ? `Average of ${spend.months} month${spend.months === 1 ? '' : 's'} of ${fuel.electric ? 'charging' : 'gas'} charges`
        : `${fuel.fromEpa ? 'The EPA rating' : `${fuel.eff.toFixed(u[2])} ${u[0]}`} at $${fuel.avgPrice.toFixed(2)}${u[1]}, ~${rate.toLocaleString()} mi a year`,
    });
  if (spend.car) lines.push({ id: 'upkeep', name: 'Upkeep & driving costs', monthly: spend.car, note: `Service, parking, tolls, washes and fees: average of ${spend.months} month${spend.months === 1 ? '' : 's'}` });
  const total = lines.reduce((t, l) => t + l.monthly, 0);
  return {
    lines,
    total,
    perMile: rate ? (total * 12) / rate : null,
    rate,
    spend,
    fuel,
    money,
    afterPayoff: loan && loan.ends ? { total: total - loan.amount, from: nextMonth(loan.ends) } : null,
  };
}

// Big jobs likely in the next 12 months, with what they cost (your quote, else an estimate, else unknown).
export function bigJobs(a, today = todayISO()) {
  const rate = milesPerYear(a).rate;
  const out = [];
  const yearOut = addMonthsIso(today, 12);
  const cvt = maintenance(a, today).find((m) => m.id === 'cvt');
  if (cvt && cvt.when <= yearOut) out.push({ id: 'cvt', name: JOBS.cvt, why: cvt.status === 'over' ? 'overdue' : `due ${monthLabel(cvt.when)}`, price: priceOf(a, 'cvt') });
  const t = tireState(a, today);
  if (t.status === 'over' || (t.last && t.last.tread <= TREAD.plan) || (t.milesLeft != null && t.milesLeft <= rate))
    out.push({ id: 'tires', name: JOBS.tires, why: t.last && t.last.tread <= TREAD.plan ? `${t.last.tread}/32" left` : t.milesLeft > 0 ? `4/32" in ~${t.milesLeft.toLocaleString()} mi` : 'probably due now', price: priceOf(a, 'tires') });
  for (const x of brakeState(a, today).axles)
    if (x.status === 'over' || (x.v != null && x.v <= 3) || (x.milesLeft != null && x.milesLeft <= rate))
      out.push({ id: 'pads', key: `pads-${x.k}`, name: `${x.name} ${JOBS.pads.toLowerCase()}`, why: x.v <= 3 ? `${x.v} mm left` : x.milesLeft > 0 ? `3 mm in ~${x.milesLeft.toLocaleString()} mi` : 'probably due now', price: priceOf(a, 'pads') });
  const b = batteryState(a, today);
  if (b && (b.status === 'over' || b.status === 'soon')) out.push({ id: 'battery', name: JOBS.battery, why: b.test ? `tested ${b.test.result} ${dayLabel(b.test.date)}` : `${Math.floor(b.age)} years old`, price: priceOf(a, 'battery') });
  return out;
}

export const payment = (principal, apr, months) => {
  const P = Math.max(0, Number(principal) || 0);
  const n = Math.max(1, Math.round(Number(months) || 60));
  const r = (Number(apr) || 0) / 1200;
  return r ? (P * r) / (1 - (1 + r) ** -n) : P / n;
};

// Keep the car vs replace it, as a monthly cost over the next year. Keeping: the payments left in that year, spread
// over it, plus insurance, gas, routine upkeep and the big jobs coming. Replacing: a new loan from the price less
// the down payment and trade-in, insurance (your quote or the same), gas at the new car's mileage, and the same
// routine upkeep (big jobs on a new car are under warranty).
export function keepVsReplace(a, data, today = todayISO()) {
  const o = ownership(a, data, today);
  const get = (id) => (o.lines.find((l) => l.id === id) || {}).monthly || 0;
  const loan = activeLoan(o.money);
  const jobs = bigJobs(a, today);
  const jobsMonthly = jobs.reduce((t, j) => t + (j.price || 0), 0) / 12;
  const keep = {
    payment: loan ? (Math.min(12, loan.left == null ? 12 : loan.left) * loan.amount) / 12 : 0,
    insurance: get('insurance'),
    fuel: get('fuel'),
    upkeep: get('upkeep'),
    jobs: jobsMonthly,
  };
  keep.total = keep.payment + keep.insurance + keep.fuel + keep.upkeep + keep.jobs;
  const n = a.next;
  let replace = null;
  // a trade-in first pays off what's still owed on this car (the balance you entered, else the payments left)
  const owed = Number(a.loan && a.loan.balance) > 0 ? Number(a.loan.balance) : loan && loan.owed ? loan.owed : 0;
  const equity = Number(n.tradeIn) > 0 ? Number(n.tradeIn) - owed : 0;
  if (Number(n.price) > 0) {
    const financed = Math.max(0, Number(n.price) - (Number(n.down) || 0) - equity);
    const eff = o.fuel.eff || o.fuel.epa;
    const fuel = Number(n.mpg) > 0 && keep.fuel && eff ? (keep.fuel * eff) / Number(n.mpg) : keep.fuel;
    replace = {
      financed,
      payment: payment(financed, n.apr, n.term),
      insurance: Number(n.insurance) > 0 ? Number(n.insurance) : keep.insurance,
      fuel,
      upkeep: keep.upkeep,
      jobs: 0,
    };
    replace.total = replace.payment + replace.insurance + replace.fuel + replace.upkeep;
  }
  return { keep, replace, jobs, owed, equity, unpriced: jobs.filter((j) => !j.price), afterPayoff: loan && loan.ends ? keep.total - keep.payment : null, loan, diff: replace ? replace.total - keep.total : null };
}

// Saving for the next car: when you reach the target at your monthly amount, and when you would if the car payment
// kept going into the fund once the loan ends.
export function fundPlan(a, data, today = todayISO()) {
  const f = a.next.fund;
  const target = Number(f.target) || 0;
  if (!target) return null;
  const saved = Math.max(0, Number(f.saved) || 0);
  const need = Math.max(0, target - saved);
  const monthly = Number(f.monthly) || 0;
  const out = { target, saved, need, monthly, pct: Math.min(1, saved / target) };
  if (!need) return { ...out, done: true };
  const money = carMoney(data, today);
  const l = activeLoan(money);
  const loan = l && l.ends ? l : null;
  // month by month: what you put in, plus the payment once it's free
  const reach = (withPayment) => {
    let have = 0;
    let k = keyOf(today);
    for (let i = 1; i <= 360; i++) {
      k = nextMonth(k);
      have += monthly + (withPayment && loan && k > loan.ends ? loan.amount : 0);
      if (have >= need) return `${k}-01`;
    }
    return null;
  };
  if (monthly) out.by = reach(false);
  if (loan) out.payoff = { monthly: loan.amount, from: nextMonth(loan.ends), by: reach(true) };
  return out;
}

// ---------------------------------------------------------------- CarPlay Ultra and a watch list
// Where CarPlay Ultra stands, from Apple's announcements and reporting (MacRumors, 9to5Mac, Stuff), checked
// September 2026. It ships only in Aston Martin's newest cars so far; Hyundai, Kia and Genesis are next (Bloomberg
// reported a first Hyundai or Kia model for the second half of 2026), and the others have committed without dates.
export const ULTRA_CHECKED = 'September 2026';
export const ULTRA = [
  { brand: 'Aston Martin', status: 'now', note: 'DB12, Vanquish and DBX S (US, UK, Canada)' },
  { brand: 'Hyundai', status: 'soon', note: 'First Hyundai or Kia model reported for the second half of 2026' },
  { brand: 'Kia', status: 'soon', note: 'First Hyundai or Kia model reported for the second half of 2026' },
  { brand: 'Genesis', status: 'soon', note: 'Announced with Hyundai and Kia; no date yet' },
  { brand: 'Nissan', status: 'later', note: 'Committed; no date yet' },
  { brand: 'Infiniti', status: 'later', note: 'Committed; no date yet' },
  { brand: 'Honda', status: 'later', note: 'Committed; no date yet' },
  { brand: 'Acura', status: 'later', note: 'Committed; no date yet' },
  { brand: 'Ford', status: 'later', note: 'Committed; no date yet' },
  { brand: 'Lincoln', status: 'later', note: 'Committed; no date yet' },
  { brand: 'Porsche', status: 'later', note: 'Committed; no date yet' },
  { brand: 'Jaguar', status: 'later', note: 'Committed; no date yet' },
  { brand: 'Land Rover', status: 'later', note: 'Committed; no date yet' },
];
export const ULTRA_SOURCES = [
  ['MacRumors, August 2026', 'https://www.macrumors.com/2026/08/19/apple-says-carplay-ultra-coming-to-these-vehicles/'],
  ['9to5Mac, May 2026', 'https://9to5mac.com/2026/05/04/carplay-ultra-automakers/'],
  ['Stuff’s compatibility list', 'https://www.stuff.tv/features/apple-carplay-ultra-compatibility-list/'],
];
// The brand's CarPlay Ultra status for a car name ("2027 Kia EV4" → Kia's), or null.
export const ultraFor = (name) => ULTRA.find((u) => new RegExp(`\\b${u.brand}\\b`, 'i').test(name || '')) || null;

const clipNum = (v, max) => {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.round(n * 100) / 100) : null;
};
export function addWatch(a, { name, price, mpg, note }) {
  const nm = String(name || '').trim().slice(0, 60);
  if (!nm) return null;
  const w = { id: uid(), name: nm, price: clipNum(price, 500000), mpg: clipNum(mpg, 200), note: String(note || '').trim().slice(0, 120) };
  a.next.watch = [...a.next.watch, w].slice(-20);
  return w;
}
export function removeWatch(a, id) {
  a.next.watch = a.next.watch.filter((w) => w.id !== id);
}
// Put a watched car's price and mileage into the comparison.
export function compareWith(a, id) {
  const w = a.next.watch.find((x) => x.id === id);
  if (!w) return;
  if (w.price) a.next.price = w.price;
  a.next.mpg = w.mpg || null;
  a.next.comparing = w.id;
}
export function setNext(a, k, v) {
  const max = { price: 500000, down: 500000, tradeIn: 500000, apr: 30, term: 96, mpg: 200, insurance: 5000 }[k];
  if (!max) return;
  a.next[k] = k === 'term' ? Math.max(12, Math.min(96, Math.round(Number(v) || 60))) : clipNum(v, max);
  if (k === 'price' || k === 'mpg') a.next.comparing = null;
}
export function setFund(a, k, v) {
  if (!['target', 'saved', 'monthly'].includes(k)) return;
  a.next.fund = { ...a.next.fund, [k]: clipNum(v, 1000000) };
}
export function setPrice(a, id, v) {
  if (!JOBS[id]) return;
  const n = clipNum(v, 20000);
  a.prices = { ...a.prices };
  if (n) a.prices[id] = n;
  else delete a.prices[id];
}
