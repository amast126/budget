// Sample data for demo mode: a made-up person with a life and finances nothing like the owner's. Jordan Rivera is
// a product lead in Seattle earning about $300k a year: a condo with a mortgage, a Tesla on a loan, a dog, a
// brokerage account and a travel habit. About eight months of budget history, a food log, a year of Apple Health
// data (runs around Green Lake, summer rides), a study plan and a well-stocked kitchen. Everything is generated
// relative to today, so the demo always looks current, and built with the app's own functions, so every document
// has exactly the shape the real ones do. Nothing here comes from a real account.
import { isoOf, addDays, daysIn, uid } from './budget-logic.js';
import * as H from './health-logic.js';
import * as HK from './hk-logic.js';
import * as HM from './health-more.js';
import * as T from './health-training.js';
import { defaultLearning, logTime } from './learning-logic.js';
import { DEMO_PLAN } from './learning-catalog.js';
import { defaultCooking, addKitchen, addGrocery } from './cooking-logic.js';
import { demoBox } from './demo-recipes.js';
import { defaultAuto, logService } from './auto-logic.js';
import { MCU } from './fun-logic.js';
import { demoSteam } from './demo-steam.js';

export const DEMO_PERSON = { uid: 'demo', email: 'demo@example.com', displayName: 'Jordan Rivera' };
export const DEMO_PLACE = { name: 'Seattle, WA', zip: '98103', lat: 47.66198, lon: -122.34181 };

// A small seeded random source, so the sample looks the same for everyone on a given day.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- budget
// About $300k a year: after 401(k), benefits and taxes (no state income tax in Washington) that's roughly $7,600 every
// two weeks. Fixed costs about $8,200 a month, spending budgets about $4,800, and $1,500 a paycheck into savings.
const PAYCHECK = 7620;
const CATEGORIES = [
  ['Groceries', 950],
  ['Restaurants & Bars', 900],
  ['Shopping', 600],
  ['Travel', 900],
  ['Home & Garden', 300],
  ['Health & Wellness', 250],
  ['Pets', 180],
  ['Entertainment', 220],
  ['Auto & Charging', 140],
  ['Gifts & Giving', 200],
  ['Personal Care', 150],
];
// merchant, low, high, how often per month
const MERCHANTS = {
  Groceries: [['PCC Community Markets', 38, 150, 3], ['Whole Foods Market', 32, 170, 2], ['Metropolitan Market', 28, 130, 1.5], ['Trader Joe’s', 34, 92, 1.5], ['Costco', 140, 320, 0.6], ['Pike Place Market', 18, 64, 0.6]],
  'Restaurants & Bars': [['Victrola Coffee', 5.5, 9.5, 4], ['Starbucks Reserve Roastery', 9, 18, 1], ['Din Tai Fung', 48, 92, 0.7], ['Tacos Chukis', 18, 34, 1], ['The Walrus and the Carpenter', 96, 168, 0.4], ['Portage Bay Cafe', 38, 72, 0.7], ['Happy hour', 45, 115, 1.2], ['Uber Eats', 32, 68, 1.3], ['Canlis', 320, 480, 0.08]],
  Shopping: [['Amazon', 18, 140, 3], ['REI', 40, 260, 0.5], ['Nordstrom', 60, 380, 0.35], ['Apple Store', 29, 199, 0.25], ['Target', 25, 110, 0.8], ['Arc’teryx', 120, 450, 0.12]],
  Travel: [['Uber', 18, 62, 1.4], ['Parking', 12, 34, 1], ['Washington State Ferries', 18, 46, 0.4], ['Alaska Airlines', 240, 680, 0.3], ['Marriott', 220, 640, 0.25], ['Airbnb', 380, 1100, 0.1]],
  'Home & Garden': [['Swansons Nursery', 20, 120, 0.6], ['Home Depot', 25, 180, 0.6], ['Crate & Barrel', 40, 260, 0.3], ['IKEA', 40, 240, 0.2]],
  'Health & Wellness': [['Massage', 110, 160, 0.5], ['Physical therapy copay', 35, 55, 0.6], ['Walgreens', 10, 45, 0.8], ['Yoga class pack', 120, 180, 0.15]],
  Pets: [['Mud Bay', 45, 95, 1], ['Chewy', 35, 80, 0.5], ['Vet visit', 90, 280, 0.15]],
  Entertainment: [['SIFF Cinema', 16, 34, 0.7], ['Elliott Bay Book Company', 22, 60, 0.6], ['Seattle Kraken tickets', 140, 320, 0.2], ['Climate Pledge Arena concert', 120, 260, 0.12]],
  'Auto & Charging': [['Tesla Supercharger', 14, 38, 2], ['Parking garage', 18, 40, 1], ['Car wash', 20, 35, 0.5]],
  'Gifts & Giving': [['Gift', 40, 150, 0.6], ['Donation', 50, 200, 0.2], ['Wedding gift', 150, 300, 0.08]],
  'Personal Care': [['Haircut', 70, 110, 0.8], ['Sephora', 30, 120, 0.4], ['Dry cleaning', 18, 40, 0.5]],
};
const METHODS = ['Amex Gold', 'Chase Sapphire Reserve', 'Apple Card', 'Checking', 'Venmo'];
function methodFor(cat, desc, R) {
  if (desc === 'Apple Store') return 'Apple Card';
  if (cat === 'Travel' || cat === 'Auto & Charging') return 'Chase Sapphire Reserve';
  if (cat === 'Gifts & Giving') return R() < 0.5 ? 'Venmo' : 'Checking';
  if (cat === 'Groceries' || cat === 'Restaurants & Bars') return R() < 0.08 ? 'Venmo' : R() < 0.8 ? 'Amex Gold' : 'Chase Sapphire Reserve';
  return R() < 0.7 ? 'Chase Sapphire Reserve' : 'Apple Card';
}
// name, category, amount, charge day, charged to the Apple Card
const BILLS = [
  ['Mortgage (Chase)', 'Housing', 4780, 1, false],
  ['HOA dues', 'Housing', 640, 1, false],
  ['Monthly giving', 'Giving', 250, 1, false],
  ['Equinox', 'Subscriptions', 285, 2, false],
  ['Auto loan (Tesla)', 'Transportation', 912, 5, false],
  ['Spotify Family', 'Subscriptions', 19.99, 7, false],
  ['Car insurance (PEMCO)', 'Transportation', 182, 9, false],
  ['Netflix', 'Subscriptions', 24.99, 11, false],
  ['Ziply Fiber', 'Utilities', 80, 12, false],
  ['Peloton App', 'Subscriptions', 24, 14, false],
  ['House cleaning', 'Home', 260, 15, false],
  ['Seattle City Light', 'Utilities', 118, 16, false],
  ['Google Fi', 'Utilities', 70, 18, false],
  ['The Economist', 'Subscriptions', 25, 20, false],
  ['Puget Sound Energy', 'Utilities', 74, 21, false],
  ['iCloud+ 2 TB', 'Subscriptions', 9.99, 22, true],
  ['Seattle Public Utilities', 'Utilities', 136, 26, false],
  ['Rover dog walking', 'Pets', 320, 28, false],
];

function budgetDoc(today, R) {
  const [ty, tm] = today.split('-').map(Number);
  const loanEnds = isoOf(new Date(ty, tm - 1 + 33, 1)).slice(0, 7); // about three years of car payments left
  const bills = BILLS.map(([name, category, amount, day, card], i) => ({ id: `demo-bill-${i}`, name, category, amount, starts: '', ends: /auto loan/i.test(name) ? loanEnds : '', day, card, share: 1 }));
  // Paid every other Friday; the anchor is the most recent one.
  const t = new Date(ty, tm - 1, Number(today.slice(8, 10)));
  const back = (t.getDay() + 2) % 7; // days since the last Friday
  const payAnchor = isoOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() - back - (R() < 0.5 ? 7 : 0)));

  const months = {};
  const first = new Date(ty, tm - 1 - 7, 1);
  for (let k = 0; k <= 7; k++) {
    const md = new Date(first.getFullYear(), first.getMonth() + k, 1);
    const key = isoOf(md).slice(0, 7);
    const days = daysIn(key);
    const current = key === today.slice(0, 7);
    const upto = current ? Number(today.slice(8, 10)) : days;
    const tx = [];
    for (const [cat, budget] of CATEGORIES) {
      // Most months land a little under budget; now and then a trip blows the travel budget. This month,
      // restaurants run ahead of pace.
      let target = budget * (0.72 + R() * 0.38);
      if (cat === 'Travel' && R() < 0.35) target = budget * (1.7 + R() * 0.8);
      if (current) target = Math.min(budget * 0.96, budget * (upto / days) * (cat === 'Restaurants & Bars' ? 1.22 : cat === 'Groceries' ? 0.95 : 0.6 + R() * 0.3));
      let spent = 0;
      let guard = 0;
      // spread the purchases through the month (stratified), so every week has some of each kind
      const all = MERCHANTS[cat];
      const avg = all.reduce((a, m) => a + (m[3] * (m[1] + m[2])) / 2, 0) / all.reduce((a, m) => a + m[3], 0);
      const est = Math.max(1, Math.round(target / avg));
      let i = 0;
      while (spent < target && guard++ < 80) {
        // pick a merchant by how often it shows up, among those that fit what's left of the month's amount
        const left = target - spent;
        const shops = all.filter((s) => s[1] <= left * 1.05);
        if (!shops.length) break;
        const w = shops.reduce((a, s) => a + s[3], 0);
        let r = R() * w;
        const m = shops.find((s) => (r -= s[3]) < 0) || shops[0];
        const amount = round(m[1] + R() * (Math.min(m[2], Math.max(m[1], left * 1.05)) - m[1]), 2);
        const day = i < est ? Math.min(upto, 1 + Math.floor(((i + R()) / est) * upto)) : 1 + Math.floor(R() * upto);
        i++;
        tx.push({ id: uid(), date: `${key}-${pad(day)}`, desc: m[0], category: cat, amount, method: methodFor(cat, m[0], R) });
        spent += amount;
      }
    }
    tx.sort((a, b) => (a.date < b.date ? -1 : 1));
    months[key] = { transactions: tx, paid: {}, amounts: {}, collected: {} };
  }
  // next month exists empty, the way the budget module keeps it
  const next = isoOf(new Date(ty, tm, 1)).slice(0, 7);
  months[next] = { transactions: [], paid: {}, amounts: {}, collected: {} };

  const entries = [];
  for (let i = 1; i <= 6; i++) entries.push({ id: uid(), date: addDays(payAnchor, -14 * (i - 1)), type: 'deposit', amount: 500, note: 'Paycheck savings', absorbed: true });
  return {
    version: 1,
    historyVersion: 2,
    configVersion: 28,
    config: {
      incomes: [{ id: 'demo-income', name: 'Paycheck', biweekly: PAYCHECK }],
      savings: [
        { id: 'demo-save', name: 'High-yield savings', biweekly: 500, starts: '', ends: '' },
        { id: 'demo-invest', name: 'Brokerage auto-invest', biweekly: 1000, starts: '', ends: '' },
      ],
      bills,
      categories: CATEGORIES.map(([name, budget], i) => ({ id: `demo-cat-${i}`, name, budget })),
      paymentMethods: [...METHODS],
      payAnchor,
      roommates: [],
    },
    months,
    savings: { balance: 48260.12, asOf: today, apy: 4.2, entries },
    card: { balance: 1284.5, asOf: today, apr: 22.99, limit: 30000, lastInterest: 0 },
    portfolio: {
      holdings: [
        { id: 'demo-h1', ticker: 'VTI', shares: 610 },
        { id: 'demo-h2', ticker: 'VXUS', shares: 420 },
        { id: 'demo-h3', ticker: 'BND', shares: 180 },
        { id: 'demo-h4', ticker: 'NVDA', shares: 55 },
        { id: 'demo-h5', ticker: 'AMZN', shares: 35 },
        { id: 'demo-h6', ticker: 'AAPL', shares: 40 },
      ],
      cash: 4200,
      // made-up prices, so the demo's Stocks view and net worth have numbers (they don't refresh in the demo)
      quotes: {
        VTI: { price: 301.12, change: 1.84, change_pct: 0.61, as_of: 'sample' },
        VXUS: { price: 66.4, change: -0.21, change_pct: -0.32, as_of: 'sample' },
        BND: { price: 73.05, change: 0.06, change_pct: 0.08, as_of: 'sample' },
        NVDA: { price: 178.5, change: 3.9, change_pct: 2.23, as_of: 'sample' },
        AMZN: { price: 221.3, change: -1.45, change_pct: -0.65, as_of: 'sample' },
        AAPL: { price: 236.8, change: 0.92, change_pct: 0.39, as_of: 'sample' },
      },
      refreshedAt: `${today}T14:30:00.000Z`,
    },
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------- food
// [fiber g, sugar g, sodium mg] per serving
const q = (name, k, p, c, f, [fib, sug, na] = []) => ({ name, src: 'quick', perServing: { k, p, c, f, ...(fib != null ? { fib, sug, na } : {}) }, portions: [{ label: '1 serving', mult: 1 }] });
const FOODS = {
  breakfast: [q('Greek yogurt with berries', 210, 17, 26, 4, [3, 18, 70]), q('Oatmeal with banana', 310, 9, 58, 6, [7, 16, 10]), q('Scrambled eggs and toast', 380, 22, 30, 18, [2, 3, 540]), q('Everything bagel with cream cheese', 420, 13, 62, 13, [3, 7, 690]), q('Protein smoothie', 290, 28, 34, 5, [4, 22, 220])],
  lunch: [q('Turkey and swiss sandwich', 460, 32, 42, 17, [4, 6, 1350]), q('Chicken burrito bowl', 640, 42, 68, 20, [11, 5, 1480]), q('Chicken Caesar salad', 520, 38, 18, 32, [3, 4, 1100]), q('Leftover stir-fry', 540, 34, 56, 18, [4, 12, 1240]), q('Tomato soup and grilled cheese', 590, 20, 58, 30, [4, 16, 1650])],
  dinner: [q('Salmon, rice and broccoli', 610, 42, 55, 22, [5, 3, 520]), q('Spaghetti and meatballs', 720, 34, 86, 24, [7, 14, 1380]), q('Chicken stir-fry', 560, 40, 52, 18, [4, 11, 1150]), q('Sheet-pan chicken and vegetables', 530, 44, 32, 24, [6, 8, 780]), q('Beef tacos', 650, 36, 48, 34, [6, 5, 1210]), q('Pizza, 2 slices', 570, 24, 66, 22, [4, 8, 1280])],
  snack: [q('Apple', 95, 0.5, 25, 0.3, [4.4, 19, 2]), q('Almonds, 1 oz', 165, 6, 6, 14, [3.5, 1.2, 0]), q('Protein bar', 210, 20, 23, 7, [3, 6, 190]), q('Hummus and pretzels', 230, 7, 32, 9, [5, 2, 560]), q('Latte', 190, 10, 18, 7, [0, 17, 150])],
};
// A workout's heart-rate histogram the way the importer stores it: [first bpm, minutes per 5 bpm…].
function hrHist(R, avg, min, sd) {
  const bins = {};
  for (let i = 0; i < min * 4; i++) {
    const u = (R() + R() + R() - 1.5) * 2 * sd;
    const b = Math.floor((avg + u) / 5) * 5;
    bins[b] = (bins[b] || 0) + 0.25;
  }
  const ks = Object.keys(bins).map(Number).sort((a, b) => a - b);
  const out = [ks[0]];
  for (let b = ks[0]; b <= ks[ks.length - 1]; b += 5) out.push(Math.round((bins[b] || 0) * 10) / 10);
  return out;
}

// ---------------------------------------------------------------- Apple Health (a year of a Watch and iPhone)
const WATCH = 'Jordan’s Apple Watch';
// Laps of the path around Green Lake, Seattle (about 2.8 miles), as delta-encoded points (the format the importer
// stores).
function parkLoop(R, laps) {
  const pts = [];
  const n = 120;
  for (let l = 0; l < laps; l++) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + 0.06 * Math.sin(a * 3 + 0.7) + 0.03 * Math.sin(a * 7);
      pts.push([47.681 + Math.sin(a) * 0.006 * wob + (R() - 0.5) * 0.00004, -122.3315 + Math.cos(a) * 0.0095 * wob + (R() - 0.5) * 0.00004]);
    }
  }
  pts.push(pts[0]);
  const out = [];
  let pl = 0;
  let pn = 0;
  for (const [lat, lon] of pts) {
    const a = Math.round(lat * 1e5);
    const b = Math.round(lon * 1e5);
    out.push(a - pl, b - pn);
    pl = a;
    pn = b;
  }
  return out;
}
// Thirty seconds of a normal ECG at 128 samples a second, in microvolts.
function ecgTrace(R, bpm) {
  const rate = 128;
  const beat = 60 / bpm;
  const g = (t, mu, sd, amp) => amp * Math.exp(-(((t - mu) / sd) ** 2) / 2);
  const out = [];
  for (let i = 0; i < rate * 30; i++) {
    const t = i / rate;
    const ph = (t % beat) / beat;
    const v = g(ph, 0.16, 0.025, 110) + g(ph, 0.285, 0.008, -120) + g(ph, 0.3, 0.011, 1050) + g(ph, 0.318, 0.01, -260) + g(ph, 0.55, 0.045, 280);
    out.push(Math.round(v + 30 * Math.sin(t * 0.9) + (R() - 0.5) * 18));
  }
  return out;
}
function appleBundle(today, R, hourNow) {
  const days = {};
  const workouts = [];
  const routes = {};
  const N = 400;
  const [ty, tm, td] = today.split('-').map(Number);
  for (let n = N; n >= 0; n--) {
    const d = isoOf(new Date(ty, tm - 1, td - n));
    const dt = new Date(ty, tm - 1, td - n);
    const dow = dt.getDay();
    const doy = (dt - new Date(dt.getFullYear(), 0, 0)) / 864e5;
    const summer = Math.cos(((doy - 180) / 365) * Math.PI * 2); // 1 midsummer, -1 midwinter
    const partial = n === 0 ? clamp((hourNow - 6) / 16, 0.05, 1) : 1;
    const fit = 1 - n / N; // slowly getting fitter over the year

    // workouts: strength Mon/Thu, a run Wed and Sat, yoga Tue, a walk Sun, a ride some summer Saturdays
    const w = [];
    const add = (type, label, t, min, kcal, extra = {}) => w.push({ id: `${d}T${t}-${type}`, d, t, type, label, min: Math.round(min), kcal: Math.round(kcal), src: WATCH, ...extra });
    const skip = R() < 0.18;
    if (!skip && n > 0) {
      if (dow === 1 || dow === 4) add('weights', 'Traditional Strength Training', dow === 1 ? '18:10' : '07:05', 42 + R() * 12, 190 + R() * 60, { hr: Math.round(112 + R() * 10), hrMax: Math.round(148 + R() * 14) });
      if (dow === 2) add('yoga', 'Yoga', '19:30', 30 + R() * 15, 90 + R() * 30, { hr: Math.round(88 + R() * 8) });
      if (dow === 3 || (dow === 6 && !(summer > 0.3 && R() < 0.4))) {
        const mi = dow === 6 ? 4.4 + R() * 2.2 + fit * 0.8 : 2.8 + R() * 1.1;
        const pace = 10.4 - fit * 0.8 + (R() - 0.5) * 0.6; // min per mile
        const extra = { mi: round(mi, 2), hr: Math.round(150 + R() * 10 - fit * 4), hrMax: Math.round(171 + R() * 8), tempF: Math.round(52 + summer * 22 + (R() - 0.5) * 10), elev: Math.round(40 + R() * 60) };
        if (n <= 70) {
          extra.route = `route_${d}`;
          routes[extra.route] = parkLoop(R, Math.max(1, Math.round(mi / 2.8)));
        }
        add('run', 'Running', dow === 6 ? '08:40' : '06:45', mi * pace, mi * 102, extra);
      }
      if (dow === 6 && summer > 0.3 && !w.length) add('bike', 'Cycling', '09:30', 75 + R() * 45, 480 + R() * 260, { mi: round(18 + R() * 14, 2), hr: Math.round(132 + R() * 10), hrMax: Math.round(158 + R() * 10) });
      if (dow === 0) add('walk', 'Walking', '16:20', 35 + R() * 25, 130 + R() * 60, { mi: round(1.6 + R() * 1.2, 2), hr: Math.round(98 + R() * 8) });
    }
    for (const x of w) if (x.hr) x.hb = hrHist(R, x.hr, x.min, x.type === 'run' ? 8 : 11);
    workouts.push(...w);
    const wkcal = w.reduce((a, x) => a + x.kcal, 0);
    const wmin = w.reduce((a, x) => a + x.min, 0);

    const weekend = dow === 0 || dow === 6;
    const steps = Math.max(1800, (7600 + (weekend ? 1400 : 0) + summer * 900 + (R() - 0.5) * 4600 + w.filter((x) => x.type === 'run' || x.type === 'walk').reduce((a, x) => a + x.mi * 2050, 0)) * partial);
    const day = {
      st: Math.round(steps),
      di: round(steps * 0.000468, 2),
      fl: Math.round((6 + R() * 10) * partial),
      ae: Math.round((190 + steps * 0.026 + wkcal * 0.85) * (0.95 + R() * 0.1)),
      ab: Math.round((1385 + (R() - 0.5) * 30) * partial),
      dl: Math.round((45 + summer * 35 + R() * 50) * partial),
      ex: Math.round((8 + steps / 900 + wmin * 0.9) * (0.9 + R() * 0.2)),
      sh: Math.round(clamp((9 + R() * 4) * partial, 1, 14)),
      mg: 420,
      eg: 30,
      sg: 12,
    };
    if (n > 0 || hourNow >= 10) {
      Object.assign(day, {
        rhr: Math.round(62 - fit * 5 + (R() - 0.5) * 4 + (w.length ? 0 : 0.5)),
        hrv: Math.round(41 + fit * 8 + (R() - 0.5) * 14),
        whr: Math.round(103 - fit * 4 + (R() - 0.5) * 6),
        ws: round(3.0 + (R() - 0.5) * 0.3, 2),
        wl: round(26.8 + (R() - 0.5) * 1.2, 1),
        wd: round(27.4 + (R() - 0.5) * 2, 1),
        wa: round(R() * 3.5, 1),
        hl: Math.round(49 + R() * 6),
        hh: Math.round(w.length ? Math.max(...w.map((x) => x.hrMax || 130)) : 118 + R() * 22),
        ha: Math.round(74 + (R() - 0.5) * 8),
        en: Math.round(58 + R() * 12),
      });
      if (R() < 0.8) Object.assign(day, { hp: Math.round(64 + R() * 12), hpm: Math.round(25 + R() * 110) });
      if (R() < 0.55) Object.assign(day, { su: round(1.15 + R() * 0.3, 2), sd: round(1.4 + R() * 0.35, 2) });
      if (R() < 0.3) day.mm = Math.round(5 + R() * 10);
      if (R() < 0.6) day.hw = Math.round(3 + R() * 6);
      if (R() < 0.015) day.hre = 1;
    }
    const bike = w.find((x) => x.type === 'bike');
    if (bike) day.cy = bike.mi;
    // last night's sleep (the night that ended this morning)
    const late = dow === 6 || dow === 0; // Friday and Saturday nights run late
    const bed = -70 + (late ? 60 : 0) + (R() - 0.5) * 50; // minutes from midnight; negative = the evening before
    const inBed = 440 + (late ? 30 : 0) + (R() - 0.5) * 70;
    const awake = 8 + R() * 22;
    const asleep = inBed - awake - 8 - R() * 10;
    const deep = asleep * (0.12 + R() * 0.05);
    const rem = asleep * (0.2 + R() * 0.05);
    day.sl = { a: Math.round(asleep), src: WATCH, c: Math.round(asleep - deep - rem), d: Math.round(deep), r: Math.round(rem), w: Math.round(awake), b: Math.round(inBed), s: Math.round(bed), e: Math.round(bed + inBed) };
    day.o2 = Math.round(96 + R() * 2);
    day.o2l = Math.round(92 + R() * 3);
    day.rr = round(14.2 + (R() - 0.5) * 1.4, 1);
    days[d] = day;
  }

  // a smart scale most mornings for the last four months: slowly down, with day-to-day noise
  const weights = [];
  const body = [];
  for (let n = 120; n >= 0; n--) {
    if (R() < 0.45 && n !== 0) continue;
    const d = addDays(today, -n);
    const lb = round(152.4 - (120 - n) * 0.038 + (R() - 0.5) * 1.6, 1);
    weights.push({ date: d, lb });
    body.push({ date: d, lb, fat: round(27.6 - (120 - n) * 0.012 + (R() - 0.5) * 0.6, 1) });
  }
  const vo2 = [];
  for (let n = 360; n >= 0; n -= 42) vo2.push([addDays(today, -n - 3), round(36.4 + (1 - n / 360) * 2.6 + (R() - 0.5) * 0.6, 1)]);
  const steady = [addDays(today, -80), addDays(today, -40), addDays(today, -6)].map((d, i) => [d, 96 + i]);
  const walk6 = [];
  for (let n = 84; n >= 0; n -= 7) walk6.push([addDays(today, -n - 1), Math.round(535 + (84 - n) * 0.3 + (R() - 0.5) * 12)]);
  const hrr = workouts.filter((x) => x.type === 'run').slice(-6).map((x) => [x.d, Math.round(24 + R() * 8)]);
  const ecgDay = addDays(today, -23);
  const ecg = [{ id: `${ecgDay}T21:14`, date: ecgDay, time: '21:14', result: 'Sinus Rhythm', symptoms: '', bpm: 64, device: 'Watch7,3', rate: 128 }];
  const keys = Object.keys(days).sort();
  return {
    kind: 'apple-health',
    version: 1,
    exportDate: `${today} 07:30:00 -0400`,
    first: keys[0],
    last: keys[keys.length - 1],
    me: { dob: '1992-03-08', sex: 'female', heightIn: 66 },
    days,
    workouts: workouts.sort((a, b) => (a.id < b.id ? -1 : 1)),
    weights,
    body,
    vo2,
    steady,
    walk6,
    hrr,
    audiogram: { date: addDays(today, -52), points: [[250, 10, 5], [500, 5, 5], [1000, 5, 0], [2000, 10, 5], [4000, 10, 15], [8000, 15, 20]] },
    sleepGoal: { hours: 8, date: addDays(today, -200) },
    types: [],
    ecg,
    ecgTraces: { [ecg[0].id]: ecgTrace(R, 64) },
    routes,
  };
}

// ---------------------------------------------------------------- everything
// Returns every document by name, the same names the backend stores them under.
export function demoDocs(now = new Date()) {
  const R = rng(20260927);
  const today = isoOf(now);
  const hour = now.getHours() + now.getMinutes() / 60;
  const year = today.slice(0, 4);
  const lastYear = String(Number(year) - 1);
  const [ty, tm] = today.split('-').map(Number);
  const docs = {};
  docs['budget-tracker-v1'] = budgetDoc(today, R);

  // Home: Seattle weather and a few to-dos (some done, for the rings and streaks)
  const doneLog = {};
  for (let n = 1; n <= 40; n++) if (R() < 0.55) doneLog[addDays(today, -n)] = 1 + Math.floor(R() * 2);
  docs.home = {
    version: 1,
    place: { ...DEMO_PLACE },
    todos: [
      { id: uid(), text: 'Book Biscuit’s vet checkup', added: addDays(today, -3) },
      { id: uid(), text: 'Book flights for Maui in February', added: addDays(today, -2) },
      { id: uid(), text: 'Schedule gutter cleaning', added: addDays(today, -1) },
      { id: uid(), text: 'Return the REI jacket', added: addDays(today, -6) },
      { id: uid(), text: 'Pick up dry cleaning', added: addDays(today, -1), done: true, doneAt: today },
    ],
    doneLog: { ...doneLog, [today]: 1 },
  };

  // Auto: a 2024 Model Y in Washington (no inspection; registration renews yearly), on a loan
  const auto = defaultAuto();
  auto.state = 'WA';
  auto.car = { year: 2024, make: 'Tesla', model: 'Model Y', trim: 'Long Range', engine: 'Dual Motor', drive: 'AWD', body: 'SUV', bought: '2024', boughtMonth: '2024-03', isNew: true };
  auto.odo = [
    { date: addDays(today, -300), miles: 19850 },
    { date: addDays(today, -150), miles: 24300 },
    { date: addDays(today, -9), miles: 28410 },
  ];
  auto.inspection = '';
  auto.registration = isoOf(new Date(ty, tm + 1, 0)); // end of next month
  auto.insuranceRenews = isoOf(new Date(ty, tm + 3, 14));
  auto.loan = { lender: 'BECU', balance: 29400, apr: 4.49 };
  logService(auto, { date: addDays(today, -190), miles: 23100, items: ['cabin', 'wipers'], cost: 139, shop: 'Tesla Service, Seattle', note: '' });
  logService(auto, { date: addDays(today, -40), miles: 27500, items: ['rotate'], cost: 30, shop: 'Discount Tire', note: 'Tread even all around' });
  docs.auto = auto;

  // Learning: AI for product work, one fundamentals exam passed, the next one booked
  const learning = defaultLearning();
  learning.plan = [...DEMO_PLAN];
  learning.hoursPerWeek = 4;
  for (let n = 130; n >= 0; n--) {
    const dow = new Date(ty, tm - 1, Number(today.slice(8, 10)) - n).getDay();
    if ((dow === 1 || dow === 3 || dow === 6) && R() < 0.75) logTime(learning, n > 75 ? 'ai-901' : 'aws-aif', 30 + Math.round(R() * 4) * 15, addDays(today, -n));
  }
  learning.certs = {
    'ai-901': { status: 'passed', passedDate: addDays(today, -72) },
    'aws-aif': { status: 'booked', examDate: addDays(today, 16) },
    python: { status: 'planned' },
    'ai-103': { status: 'planned' },
  };
  docs.learning = learning;

  // Cooking: a well-stocked kitchen, a recipe box, a short grocery list
  const cooking = defaultCooking();
  cooking.mine = []; // the recipes are in the recipe box
  addKitchen(cooking, ['Salmon fillets', 'Eggs', 'Greek yogurt', 'Butter', 'Parmesan', 'Kale', 'Lemons', 'Kimchi', 'Miso paste'], 'fridge');
  addKitchen(cooking, ['Frozen dumplings', 'Frozen berries', 'Ground turkey'], 'freezer');
  addKitchen(cooking, ['Jasmine rice', 'Farro', 'Pasta', 'Chickpeas', 'Canned tomatoes', 'Olive oil', 'Soy sauce', 'Oats', 'Honey', 'Onions', 'Garlic', 'Sesame oil', 'Coconut milk'], 'pantry');
  addKitchen(cooking, ['Cumin', 'Smoked paprika', 'Za’atar', 'Red pepper flakes', 'Cinnamon', 'Black pepper', 'Kosher salt'], 'spices');
  const low = cooking.kitchen.find((i) => i.name === 'Olive oil');
  if (low) low.low = true;
  addGrocery(cooking, ['Olive oil', 'Avocados', 'Limes', 'Sourdough', 'Oat milk', 'Dog treats']);
  const oat = cooking.grocery.find((g) => g.name === 'Oat milk');
  if (oat) oat.done = true;
  docs.cooking = cooking;
  docs.recipebox = demoBox(today);

  // Health: profile, a food log (every day for the last 7 weeks, today so far), and remembered foods
  const health = H.defaultHealth();
  health.profile = { sex: '', age: null, heightIn: null, activity: 'active', goal: 'maintain' };
  health.stepGoal = 10000;
  const years = { [year]: H.defaultYear(), [lastYear]: H.defaultYear() };
  const pick = (list) => list[Math.floor(R() * list.length)];
  for (let n = 48; n >= 0; n--) {
    const iso = addDays(today, -n);
    const y = years[iso.slice(0, 4)];
    if (!y || (n > 0 && R() < 0.08)) continue; // the odd day off
    const meals = n === 0 ? [['breakfast', 8], ['lunch', 12.5], ['snack', 15.5], ['dinner', 19]].filter(([, h]) => hour >= h) : [['breakfast'], ['lunch'], ['dinner'], ['snack']];
    for (const [meal] of meals) {
      const count = meal === 'snack' ? (R() < 0.5 ? 1 : 2) : 1;
      for (let i = 0; i < count; i++) {
        const food = pick(FOODS[meal]);
        const portion = food.portions[0];
        const qty = meal === 'dinner' && R() < 0.15 ? 1.5 : 1;
        H.remember(health, food, portion, qty);
        H.addEntry(y, iso, H.entryFor(food, portion, qty, meal));
      }
    }
    if (n > 0 && n % 9 === 4) H.addWorkout(y, iso, { type: 'hiit', minutes: 50, note: 'Spin class' });
  }

  // Habits for the last six weeks: water, coffee, a drink or two most Friday and Saturday nights, vitamins
  for (let n = 41; n >= 0; n--) {
    const iso = addDays(today, -n);
    const y = years[iso.slice(0, 4)];
    if (!y || (n > 0 && R() < 0.06)) continue;
    const dow = new Date(`${iso}T12:00:00`).getDay();
    const d = H.dayOf(y, iso);
    const partial = n === 0 ? Math.min(1, (hour - 7) / 14) : 1;
    d.hb = { water: Math.max(0, Math.round((5 + R() * 4) * partial)), caffeine: Math.round((dow === 0 || dow === 6 ? 1 : 1 + R() * 2) * (n === 0 && hour < 9 ? 0 : 1)) };
    if ((dow === 5 || dow === 6) && R() < 0.65 && n > 0) d.hb.alcohol = 1 + Math.floor(R() * 3);
    else if (R() < 0.06 && n > 0) d.hb.alcohol = 1;
    if (R() < 0.82 && (n > 0 || hour >= 9)) d.hb.vitamins = 1;
    Object.keys(d.hb).forEach((k) => !d.hb[k] && delete d.hb[k]);
    d.hbAt = 1;
  }
  // Apple Health, imported the way the Health tab would do it
  const bundle = appleBundle(today, R, hour);
  // Nights after a drink run shorter, with lower HRV (so "What affects your sleep" has something to find).
  for (const y of Object.values(years)) {
    for (const [iso, d] of Object.entries(y.days)) {
      if (!(d.hb && d.hb.alcohol)) continue;
      const next = bundle.days[addDays(iso, 1)];
      if (!next) continue;
      if (next.sl) {
        next.sl.a = Math.max(200, next.sl.a - 30 - d.hb.alcohol * 8);
        next.sl.c = Math.max(0, next.sl.a - next.sl.d - next.sl.r);
      }
      if (next.hrv) next.hrv = Math.max(20, next.hrv - 5 - d.hb.alcohol * 2);
      if (next.rhr) next.rhr += 2;
    }
  }
  // Strength: an upper day on Mondays and a lower day on Thursdays (the Watch's strength workouts), slowly heavier.
  const UPPER = [['bench', 85, 8], ['row', 75, 10], ['ohp', 50, 8], ['pulldown', 90, 10], ['curl', 20, 12]];
  const LOWER = [['squat', 105, 8], ['rdl', 95, 10], ['legpress', 180, 12], ['calf', 90, 15], ['plank', 0, 45]];
  for (const w of bundle.workouts.filter((x) => x.type === 'weights' && x.d >= addDays(today, -84))) {
    const y = years[w.d.slice(0, 4)];
    if (!y) continue;
    const weeks = Math.floor((new Date(`${w.d}T12:00:00`) - new Date(`${addDays(today, -84)}T12:00:00`)) / (7 * 864e5));
    const list = new Date(`${w.d}T12:00:00`).getDay() === 1 ? UPPER : LOWER;
    for (const [ex, lb0, reps] of list) {
      const l = T.addLift(y, w.d, ex);
      const lb = lb0 ? Math.round((lb0 + weeks * (ex === 'squat' || ex === 'legpress' || ex === 'rdl' ? 2.5 : 1.25)) / 2.5) * 2.5 : 0;
      for (let k = 0; k < 3; k++) T.addSet(y, w.d, l.id, { r: Math.max(5, reps - (k === 2 && R() < 0.4 ? 1 : 0)), lb });
    }
  }
  T.saveRoutine(health, 'Upper', UPPER.map((x) => x[0]));
  T.saveRoutine(health, 'Lower', LOWER.map((x) => x[0]));
  const plan = HK.planImport(bundle);
  plan.health(health);
  const hk = HK.defaultHk();
  plan.main(hk);
  hk.syncedAt = Date.now() - 2 * 3600e3;
  // A saved breakfast, a weight goal, checkups, labs, and a daily sync that ran this morning
  const yb = FOODS.breakfast[0];
  const coffee = FOODS.snack[4];
  HM.saveMeal(health, 'Usual breakfast', 'breakfast', [H.entryFor(yb, yb.portions[0], 1, 'breakfast'), H.entryFor(coffee, coffee.portions[0], 1, 'breakfast')]);
  health.goalWeight = 145;
  health.checkups = [
    { id: 'physical', name: 'Physical', every: 12, last: addDays(today, -300) },
    { id: 'dentist', name: 'Dental cleaning', every: 6, last: addDays(today, -168) },
    { id: 'eye', name: 'Eye exam', every: 24, last: addDays(today, -500), booked: addDays(today, 12) },
  ];
  health.labs = [
    ['tc', 540, 212], ['ldl', 540, 128], ['hdl', 540, 58], ['tg', 540, 110], ['vitd', 540, 22], ['a1c', 540, 5.3],
    ['tc', 170, 196], ['ldl', 170, 112], ['hdl', 170, 61], ['tg', 170, 96], ['vitd', 170, 31], ['a1c', 170, 5.2], ['tsh', 170, 1.9],
  ].map(([test, ago, value], i) => ({ id: `lab${i}`, test, date: addDays(today, -ago), value }));
  health.sync = { key: 'demo0sample0key0000x', lastAt: Date.now() - 2 * 3600e3, lastDate: today, count: 23, v2At: Date.now() - 20 * 86400e3 };

  docs.health = health;
  docs[`health-${year}`] = years[year];
  docs[`health-${lastYear}`] = years[lastYear];
  docs['health-hk'] = hk;
  for (const y of [year, lastYear]) {
    const doc = HK.defaultHkYear();
    if (plan.years[y]) plan.years[y](doc);
    docs[`health-hk-${y}`] = doc;
  }
  const ecg = { version: 1, traces: {} };
  plan.ecg(ecg);
  docs['health-hk-ecg'] = ecg;
  const routes = { version: 1, routes: {} };
  plan.routes(routes);
  docs['health-hk-routes'] = routes;
  // Entertainment: a Switch 2 and PC player counting down to Dune, partway through the Marvel rewatch.
  // (Release dates as announced in Sept 2026.)
  const mcu = {};
  const skipGroups = ['netflix', 'sony'];
  MCU.forEach((t, i) => {
    if (skipGroups.includes(t.group)) mcu[t.id] = 's';
    else if (['p1', 'p2', 'p3'].includes(t.group)) mcu[t.id] = R() < 0.9 ? 'w' : undefined;
    else if (t.group === 'p4') mcu[t.id] = R() < 0.55 ? 'w' : R() < 0.3 ? 's' : undefined;
    else if (t.group === 'xmen') mcu[t.id] = ['x-men', 'x2', 'dofp', 'logan'].includes(t.id) ? 'w' : R() < 0.4 ? 's' : undefined;
    else if (t.group === 'p5') mcu[t.id] = R() < 0.25 ? 'w' : undefined;
  });
  Object.keys(mcu).forEach((k) => mcu[k] === undefined && delete mcu[k]);
  docs.fun = {
    version: 1,
    releases: [
      { id: 'demo-dune', title: 'Dune: Part Three', short: 'Dune', date: '2026-12-18', kind: 'movie', note: 'IMAX', home: true, pin: true },
      { id: 'demo-oot', title: 'The Legend of Zelda: Ocarina of Time', short: 'Zelda', date: '2026-11-05', kind: 'game', note: 'Switch 2', home: false },
      { id: 'demo-metroid', title: 'Metroid Ravenous', short: '', date: '2027-01-28', kind: 'game', note: 'Switch 2', home: false },
      { id: 'demo-doomsday', title: 'Avengers: Doomsday', short: 'Doomsday', date: '2026-12-18', kind: 'movie', note: 'In theaters', home: false },
    ],
    playing: [
      {
        id: 'demo-mkw',
        title: 'Mario Kart World',
        note: 'Switch 2 · online with the team on Fridays',
        challenges: [
          { id: 'demo-mkw-1', text: 'Gold on every 150cc cup', goal: 8, n: 5 },
          { id: 'demo-mkw-2', text: 'Win a Knockout Tour online', goal: 1, n: 1, doneOn: addDays(today, -4) },
        ],
      },
      { id: 'demo-bg3', title: 'Baldur’s Gate 3', note: 'PC · Honour Mode, Act 2', challenges: [{ id: 'demo-bg3-1', text: 'Finish an Honour Mode run', goal: 1, n: 0 }] },
      { id: 'demo-balatro', title: 'Balatro', note: 'Phone', challenges: [{ id: 'demo-bal-1', text: 'Win with every deck', goal: 15, n: 9 }] },
    ],
    mcu,
    mcuMine: [],
    steam: { profile: 'https://steamcommunity.com/id/sample-demo-player', dismissed: {} },
  };
  const st = demoSteam(now);
  docs.steam = st.steam;
  docs['steam-live'] = st.live;

  // Guitar: about two months in, most days, on grade 2 of the course
  const sessions = [];
  for (let n = 62; n >= 0; n--) {
    if (n === 0 && hour < 19) continue; // hasn't played yet today
    if (n > 1 && R() < 0.3) continue;
    sessions.push({ id: uid(), date: addDays(today, -n), minutes: 10 + Math.round(R() * 6) * 5, what: '' });
  }
  const changes = [];
  [
    ['A–D', 21, 39],
    ['G–C', 14, 29],
    ['Em–C', 28, 42],
  ].forEach(([pair, from, to], k) => {
    for (let i = 0; i < 6; i++) changes.push({ id: uid(), date: addDays(today, -40 + i * 7 + k), pair, count: Math.round(from + ((to - from) * i) / 5 + (R() - 0.5) * 3) });
  });
  docs.guitar = {
    version: 1,
    goalMin: 20,
    sessions,
    course: {
      grade: 2,
      module: 3,
      lesson: 'Fingerstyle patterns',
      done: [
        { grade: 1, module: 8, lesson: '', date: addDays(today, -33) },
        { grade: 2, module: 1, lesson: '', date: addDays(today, -19) },
        { grade: 2, module: 2, lesson: 'Barre chord prep', date: addDays(today, -6) },
      ],
    },
    changes,
    songs: [
      { id: uid(), title: 'Three Little Birds', artist: 'Bob Marley', status: 'can', added: addDays(today, -50), learned: addDays(today, -30) },
      { id: uid(), title: 'Riptide', artist: 'Vance Joy', status: 'can', added: addDays(today, -40), learned: addDays(today, -12) },
      { id: uid(), title: 'Blackbird', artist: 'The Beatles', status: 'learning', added: addDays(today, -10) },
      { id: uid(), title: 'Fast Car', artist: 'Tracy Chapman', status: 'learning', added: addDays(today, -8) },
      { id: uid(), title: 'Little Wing', artist: 'Jimi Hendrix', status: 'want', added: addDays(today, -20) },
    ],
  };

  // Sourdough: a starter on the counter, fed this morning, and a few bakes
  const at = (daysAgo, h, m = 0) => {
    const d = new Date(ty, tm - 1, Number(today.slice(8, 10)) - daysAgo, h, m);
    return d.toISOString();
  };
  const feeds = [];
  for (let n = 9; n >= 1; n--) feeds.push({ id: uid(), at: at(n, 8, 10 + Math.round(R() * 30)), ratio: '1:1:1', where: 'counter', note: '' });
  const fedToday = new Date(now.getTime() - 3.2 * 3600000);
  feeds.push({ id: uid(), at: fedToday.toISOString(), ratio: '1:1:1', where: 'counter', note: '' });
  docs.sourdough = {
    version: 1,
    starter: { name: 'Clint Yeastwood', where: 'counter', ratio: '1:1:1', temp: 70, feeds },
    calc: { loaves: 2, flour: 450, hydration: 72, levain: 20, salt: 2, adjust: false },
    plan: { ready: '', temp: 70, retard: true },
    bakes: [
      { id: uid(), date: addDays(today, -23), hydration: 70, rating: 3, notes: 'Tight crumb. Bulk went short; the kitchen was cold.' },
      { id: uid(), date: addDays(today, -13), hydration: 72, rating: 4, notes: 'Better oven spring. Longer bulk helped.' },
      { id: uid(), date: addDays(today, -4), hydration: 75, rating: 5, notes: 'Open crumb, blistered crust. Keep this schedule.' },
    ],
  };

  // Birthdays: family and friends, spread through the year from today
  const bday = (name, inDays, year, note = '') => {
    const d = new Date(ty, tm - 1, Number(today.slice(8, 10)) + inDays);
    return { id: uid(), name, m: d.getMonth() + 1, d: d.getDate(), y: year, note };
  };
  docs.birthdays = {
    version: 1,
    people: [
      bday('Maya Chen', 5, 1993, 'Loves that ramen place in Capitol Hill'),
      bday('Dad', 19, 1961),
      bday('Priya Nair', 41, null),
      bday('Luis Rivera', 88, 1995),
      bday('Grandma June', 150, 1940),
      bday('Tomás Ortega', 230, 1991),
      bday('Mom', 300, 1963),
    ],
  };

  // News: a few followed topics, so For you has something beyond the sample's stocks, games, car and town
  docs.news = { version: 1, saved: [], hidden: [], muteWords: [], muteSources: [], follow: ['Seahawks', 'Mariners', 'Nintendo'] };

  const stamp = Date.now();
  Object.values(docs).forEach((d) => (d.updatedAt = stamp));
  return docs;
}
