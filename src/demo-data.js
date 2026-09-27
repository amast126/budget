// Sample data for demo mode: a made-up person ("Jordan", in Buffalo, NY) with about eight months of budget history,
// a food log, a year of Apple Health data, a car, a study plan and a stocked kitchen. Everything is generated
// relative to today, so the demo always looks current, and built with the app's own functions, so every document
// has exactly the shape the real ones do. Nothing here comes from a real account.
import { isoOf, addDays, daysIn, uid } from './budget-logic.js';
import * as H from './health-logic.js';
import * as HK from './hk-logic.js';
import { defaultLearning, logTime } from './learning-logic.js';
import { defaultCooking, addKitchen, addGrocery } from './cooking-logic.js';
import { defaultAuto, logService } from './auto-logic.js';

export const DEMO_PERSON = { uid: 'demo', email: 'demo@example.com', displayName: 'Jordan Rivera' };
export const DEMO_PLACE = { name: 'Buffalo, NY', zip: '14202', lat: 42.88645, lon: -78.87837 };

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
const hm = (mins) => `${pad(Math.floor(mins / 60))}:${pad(Math.round(mins % 60))}`;

// ---------------------------------------------------------------- budget
const CATEGORIES = [
  ['Groceries', 420],
  ['Dining & Drinks', 320],
  ['Shopping', 250],
  ['Gaming & Entertainment', 90],
  ['Health', 80],
  ['Gas & Auto', 170],
  ['Travel', 150],
  ['Misc Discretionary', 60],
];
// merchant, low, high, how often per month, how it's usually paid
const MERCHANTS = {
  Groceries: [['Wegmans', 38, 128, 4], ['Tops Markets', 16, 64, 2], ['Aldi', 24, 72, 1.5], ['Trader Joe’s', 28, 76, 1], ['Costco', 70, 165, 0.5]],
  'Dining & Drinks': [['Tim Hortons', 4.5, 9.8, 5], ['Starbucks', 5.4, 8.9, 2], ['Chipotle', 11.2, 15.9, 2], ['Panera Bread', 12, 18.5, 1], ['DoorDash', 24, 41, 1.2], ['Thai Orchid', 22, 38, 0.8], ['Brunch with friends', 26, 44, 0.8], ['Bar tab', 24, 58, 1]],
  Shopping: [['Amazon', 12, 68, 3], ['Target', 18, 84, 1.3], ['Home Depot', 14, 66, 0.6], ['Uniqlo', 30, 95, 0.4], ['Best Buy', 25, 140, 0.25]],
  'Gaming & Entertainment': [['Steam', 9.99, 39.99, 1], ['AMC Theatres', 14.5, 26, 0.8], ['Bowling night', 22, 36, 0.3], ['Concert tickets', 55, 110, 0.15]],
  Health: [['CVS Pharmacy', 8, 32, 1.2], ['Copay', 25, 40, 0.4], ['Vitamins', 14, 26, 0.4]],
  'Gas & Auto': [['Speedway', 36, 52, 2.5], ['Costco Gas', 38, 50, 1], ['Car wash', 12, 18, 0.6]],
  Travel: [['Uber', 13, 29, 1], ['Southwest Airlines', 168, 262, 0.15], ['Airbnb', 180, 320, 0.1], ['Amtrak', 58, 96, 0.15]],
  'Misc Discretionary': [['Haircut', 32, 45, 0.6], ['Birthday gift', 25, 60, 0.4], ['Dry cleaning', 14, 24, 0.4]],
};
const METHODS = ['Apple Pay', 'Apple Card', 'Apple Store/Services', 'Debit Card', 'Cash'];
const BILLS = [
  ['Rent', 'Housing', 1150, 1, false],
  ['National Grid (electric & gas)', 'Utilities', 96.4, 18, true],
  ['Spectrum Internet', 'Utilities', 59.99, 12, true],
  ['Visible (phone)', 'Utilities', 45, 22, true],
  ['Car Payment', 'Transportation', 386.12, 28, false],
  ['Car Insurance (Progressive)', 'Transportation', 142.5, 9, true],
  ['Lemonade renters', 'Housing', 14.25, 10, true],
  ['Planet Fitness', 'Subscriptions', 24.99, 3, true],
  ['Spotify', 'Subscriptions', 11.99, 5, true],
  ['Netflix', 'Subscriptions', 15.49, 14, true],
  ['iCloud+', 'Subscriptions', 2.99, 20, true],
];

function budgetDoc(today, R) {
  const [ty, tm] = today.split('-').map(Number);
  const loanEnds = isoOf(new Date(ty, tm - 1 + 19, 1)).slice(0, 7); // about a year and a half of car payments left
  const bills = BILLS.map(([name, category, amount, day, card], i) => ({ id: `demo-bill-${i}`, name, category, amount, starts: '', ends: name === 'Car Payment' ? loanEnds : '', day, card, share: 1 }));
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
      // Most months land a little under budget; now and then one runs over. This month, dining runs hot.
      let target = budget * (0.72 + R() * 0.38);
      if (cat === 'Travel' && R() < 0.3) target = budget * (1.6 + R() * 0.6); // the occasional trip blows the travel budget
      if (current) target = Math.min(budget * 0.96, budget * (upto / days) * (cat === 'Dining & Drinks' ? 1.22 : cat === 'Groceries' ? 0.95 : 0.6 + R() * 0.3));
      let spent = 0;
      let guard = 0;
      while (spent < target && guard++ < 60) {
        // pick a merchant by how often it shows up, among those that fit what's left of the month's amount
        const left = target - spent;
        const shops = MERCHANTS[cat].filter((s) => s[1] <= left * 1.05);
        if (!shops.length) break;
        const w = shops.reduce((a, s) => a + s[3], 0);
        let r = R() * w;
        const m = shops.find((s) => (r -= s[3]) < 0) || shops[0];
        const amount = round(m[1] + R() * (Math.min(m[2], Math.max(m[1], left * 1.05)) - m[1]), 2);
        const day = 1 + Math.floor(R() * upto);
        const method = /Costco|Aldi/.test(m[0]) ? 'Debit Card' : m[0] === 'Haircut' && R() < 0.5 ? 'Cash' : m[0] === 'Steam' ? 'Apple Card' : R() < 0.62 ? 'Apple Pay' : R() < 0.75 ? 'Apple Card' : 'Debit Card';
        tx.push({ id: uid(), date: `${key}-${pad(day)}`, desc: m[0], category: cat, amount, method });
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
  for (let i = 1; i <= 6; i++) entries.push({ id: uid(), date: addDays(payAnchor, -14 * (i - 1)), type: 'deposit', amount: 200, note: 'Paycheck savings', absorbed: true });
  return {
    version: 1,
    historyVersion: 2,
    configVersion: 28,
    config: {
      incomes: [{ id: 'demo-income', name: 'Paycheck', biweekly: 2180 }],
      savings: [{ id: 'demo-save', name: 'Paycheck Savings', biweekly: 200, starts: '', ends: '' }],
      bills,
      categories: CATEGORIES.map(([name, budget], i) => ({ id: `demo-cat-${i}`, name, budget })),
      paymentMethods: [...METHODS],
      payAnchor,
      roommates: [],
    },
    months,
    savings: { balance: 6240.18, asOf: today, apy: 4.1, entries },
    card: { balance: 684.37, asOf: today, apr: 24.49, limit: 9000, lastInterest: 0 },
    portfolio: {
      holdings: [
        { id: 'demo-h1', ticker: 'VTI', shares: 14 },
        { id: 'demo-h2', ticker: 'VXUS', shares: 22 },
        { id: 'demo-h3', ticker: 'AAPL', shares: 6 },
        { id: 'demo-h4', ticker: 'MSFT', shares: 3 },
      ],
      cash: 215,
      quotes: {},
      refreshedAt: '',
    },
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------- food
const q = (name, k, p, c, f) => ({ name, src: 'quick', perServing: { k, p, c, f }, portions: [{ label: '1 serving', mult: 1 }] });
const FOODS = {
  breakfast: [q('Greek yogurt with berries', 210, 17, 26, 4), q('Oatmeal with banana', 310, 9, 58, 6), q('Scrambled eggs and toast', 380, 22, 30, 18), q('Everything bagel with cream cheese', 420, 13, 62, 13), q('Protein smoothie', 290, 28, 34, 5)],
  lunch: [q('Turkey and swiss sandwich', 460, 32, 42, 17), q('Chicken burrito bowl', 640, 42, 68, 20), q('Chicken Caesar salad', 520, 38, 18, 32), q('Leftover stir-fry', 540, 34, 56, 18), q('Tomato soup and grilled cheese', 590, 20, 58, 30)],
  dinner: [q('Salmon, rice and broccoli', 610, 42, 55, 22), q('Spaghetti and meatballs', 720, 34, 86, 24), q('Chicken stir-fry', 560, 40, 52, 18), q('Sheet-pan chicken and vegetables', 530, 44, 32, 24), q('Beef tacos', 650, 36, 48, 34), q('Pizza, 2 slices', 570, 24, 66, 22)],
  snack: [q('Apple', 95, 0.5, 25, 0.3), q('Almonds, 1 oz', 165, 6, 6, 14), q('Protein bar', 210, 20, 23, 7), q('Hummus and pretzels', 230, 7, 32, 9), q('Latte', 190, 10, 18, 7)],
};

// ---------------------------------------------------------------- Apple Health (a year of a Watch and iPhone)
const WATCH = 'Jordan’s Apple Watch';
// A loop around Delaware Park, Buffalo, as delta-encoded points (the format the importer stores).
function parkLoop(R, laps) {
  const pts = [];
  const n = 120;
  for (let l = 0; l < laps; l++) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + 0.06 * Math.sin(a * 3 + 0.7) + 0.03 * Math.sin(a * 7);
      pts.push([42.9322 + Math.sin(a) * 0.0058 * wob + (R() - 0.5) * 0.00004, -78.8715 + Math.cos(a) * 0.0102 * wob + (R() - 0.5) * 0.00004]);
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
          routes[extra.route] = parkLoop(R, Math.max(1, Math.round(mi / 1.8)));
        }
        add('run', 'Running', dow === 6 ? '08:40' : '06:45', mi * pace, mi * 102, extra);
      }
      if (dow === 6 && summer > 0.3 && !w.length) add('bike', 'Cycling', '09:30', 55 + R() * 30, 380 + R() * 150, { mi: round(12 + R() * 8, 2), hr: Math.round(132 + R() * 10), hrMax: Math.round(158 + R() * 10) });
      if (dow === 0) add('walk', 'Walking', '16:20', 35 + R() * 25, 130 + R() * 60, { mi: round(1.6 + R() * 1.2, 2), hr: Math.round(98 + R() * 8) });
    }
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
    me: { dob: '1995-06-12', sex: 'female', heightIn: 66 },
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
  const docs = {};
  docs['budget-tracker-v1'] = budgetDoc(today, R);

  // Home: a sample city's weather and a few to-dos (some done, for the rings and streaks)
  const doneLog = {};
  for (let n = 1; n <= 40; n++) if (R() < 0.55) doneLog[addDays(today, -n)] = 1 + Math.floor(R() * 2);
  docs.home = {
    version: 1,
    place: { ...DEMO_PLACE },
    todos: [
      { id: uid(), text: 'Book a dentist cleaning', added: addDays(today, -3) },
      { id: uid(), text: 'Call the landlord about the radiator', added: addDays(today, -2) },
      { id: uid(), text: 'Return library books', added: addDays(today, -1) },
      { id: uid(), text: 'Renew passport', added: addDays(today, -6) },
      { id: uid(), text: 'Pick up dry cleaning', added: addDays(today, -1), done: true, doneAt: today },
    ],
    doneLog: { ...doneLog, [today]: 1 },
  };

  // Auto: a different car from anyone's real one, inspection due next month, a service record
  const auto = defaultAuto();
  const [ty, tm] = today.split('-').map(Number);
  auto.car = { year: 2022, make: 'Nissan', model: 'Altima', trim: 'SR', engine: '2.5L', drive: 'AWD', body: '4-door sedan', bought: '2022', boughtMonth: '2022-04', isNew: false };
  auto.odo = [
    { date: addDays(today, -330), miles: 18450 },
    { date: addDays(today, -160), miles: 24120 },
    { date: addDays(today, -12), miles: 28960 },
  ];
  auto.inspection = isoOf(new Date(ty, tm + 1, 0)); // end of next month
  auto.registration = isoOf(new Date(ty, tm + 6, 0));
  auto.insuranceRenews = isoOf(new Date(ty, tm + 3, 14));
  auto.loan = { lender: 'Capital One Auto', balance: 7240, apr: 5.9 };
  logService(auto, { date: addDays(today, -160), miles: 24120, items: ['oil', 'rotate', 'cabin', 'awd'], cost: 118.4, shop: 'West Herr Nissan', note: 'Synthetic oil change and tire rotation' });
  logService(auto, { date: addDays(today, -300), miles: 19300, items: ['air'], cost: 42, shop: 'West Herr Nissan', note: '' });
  docs.auto = auto;

  // Learning: a cloud and AI study plan, one exam booked, a steady few hours a week
  const learning = defaultLearning();
  learning.hoursPerWeek = 5;
  learning.certs = { 'ai-901': { status: 'booked', examDate: addDays(today, 16) }, 'az-104': { status: 'planned' } };
  for (let n = 60; n >= 0; n--) {
    const dow = new Date(ty, tm - 1, Number(today.slice(8, 10)) - n).getDay();
    if ((dow === 2 || dow === 4 || dow === 0) && R() < 0.8) logTime(learning, 'ai-901', 30 + Math.round(R() * 4) * 15, addDays(today, -n));
  }
  learning.certs['ai-901'] = { status: 'booked', examDate: addDays(today, 16) };
  docs.learning = learning;

  // Cooking: a stocked kitchen and a short grocery list
  const cooking = defaultCooking();
  addKitchen(cooking, ['Chicken thighs', 'Eggs', 'Greek yogurt', 'Butter', 'Cheddar', 'Spinach', 'Lemons', 'Salsa'], 'fridge');
  addKitchen(cooking, ['Frozen peas', 'Ground beef', 'Frozen berries'], 'freezer');
  addKitchen(cooking, ['Rice', 'Pasta', 'Black beans', 'Canned tomatoes', 'Olive oil', 'Soy sauce', 'Oats', 'Flour tortillas', 'Chicken broth', 'Onions', 'Garlic', 'Honey'], 'pantry');
  addKitchen(cooking, ['Cumin', 'Smoked paprika', 'Chili powder', 'Oregano', 'Cinnamon', 'Black pepper', 'Kosher salt'], 'spices');
  const low = cooking.kitchen.find((i) => i.name === 'Olive oil');
  if (low) low.low = true;
  addGrocery(cooking, ['Olive oil', 'Avocados', 'Limes', 'Cilantro', 'Bananas', 'Oat milk']);
  const bananas = cooking.grocery.find((g) => g.name === 'Bananas');
  if (bananas) bananas.done = true;
  docs.cooking = cooking;

  // Health: profile, a food log (every day for the last 7 weeks, today so far), and remembered foods
  const health = H.defaultHealth();
  health.profile = { sex: '', age: null, heightIn: null, activity: 'moderate', goal: 'lose_slow' };
  health.stepGoal = 9000;
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
    if (n > 0 && n % 9 === 4) H.addWorkout(y, iso, { type: 'tennis', minutes: 60, note: 'Doubles at the park' });
  }

  // Apple Health, imported the way the Health tab would do it
  const bundle = appleBundle(today, R, hour);
  const plan = HK.planImport(bundle);
  plan.health(health);
  const hk = HK.defaultHk();
  plan.main(hk);
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
  const stamp = Date.now();
  Object.values(docs).forEach((d) => (d.updatedAt = stamp));
  return docs;
}

