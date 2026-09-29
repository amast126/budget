// Auto tab: the car, its deadlines, maintenance on Nissan's schedule, and money pulled from the budget.
// Saved in trackers/<doc>-auto. Payment and insurance amounts are read from the budget's bills, not copied.
import { uid, todayISO, isoOf, keyOf, activeBills, isPaid, sum, pad2 } from './budget-logic.js';

// Nissan's 2021 Altima 2.5L maintenance guide (maintenance-schedules.nissanusa.com), AWD.
export const SCHEDULE = [
  { id: 'oil', name: 'Oil & filter', miles: 10000, months: 12 },
  { id: 'rotate', name: 'Tire rotation', miles: 5000, months: 6 },
  { id: 'cabin', name: 'Cabin air filter', miles: 10000, months: 12 },
  { id: 'awd', name: 'AWD fluid check', miles: 10000, months: 12, note: 'Rear differential and transfer case; usually done with the oil change' },
  { id: 'brake', name: 'Brake fluid', miles: 20000, months: 24 },
  { id: 'air', name: 'Engine air filter', miles: 30000, months: 36 },
  { id: 'cvt', name: 'CVT fluid replacement', miles: 60000, months: 72 },
];
export const SCHEDULE_URL = 'https://maintenance-schedules.nissanusa.com/maintenance-schedules/2021/altima/components/?LocaleID=en_US&MakeID=67&RegionID=1';
// Tesla's Model Y owner's manual, "Maintenance Service Intervals" (checked September 2026). No oil; mostly by time.
const TESLA_SCHEDULE = [
  { id: 'rotate', name: 'Tire rotation', miles: 6250, months: null, note: 'Sooner if the tread depths differ by 2/32 in or more' },
  { id: 'wipers', name: 'Wiper blades', miles: null, months: 12 },
  { id: 'cabin', name: 'Cabin air filter', miles: null, months: 24 },
  { id: 'hepa', name: 'HEPA and carbon filters', miles: null, months: 36 },
  { id: 'brake', name: 'Brake fluid health check', miles: null, months: 48 },
];
const TESLA_URL = 'https://www.tesla.com/ownersmanual/modely/en_us/GUID-E95DAAD9-646E-4249-9930-B109ED7B1D91.html';

// Maintenance, guide, warranty, specs and fuel by car: the Altima is the default (the demo drives a Tesla).
// Specs for the Altima were checked in September 2026 against AMSOIL's lookup (oil), TirePressure.org (SL tires),
// Edmunds (EPA figures for the 2.5 SL AWD) and wiper and CVT service listings; the owner's manual and the sticker on
// the driver's door jamb win if they differ, and every one can be changed on the page. Big-job prices are RepairPal's
// estimate ranges for the Altima (midpoints), used only until you enter a quote of your own.
const ALTIMA_SPECS = [
  ['oil', 'Engine oil', '0W-20 full synthetic, about 5.4 qt with the filter'],
  ['cvt', 'CVT fluid', 'Nissan NS-3'],
  ['tires', 'Tire size', '215/55R17'],
  ['psi', 'Tire pressure', '33 psi front and rear, cold'],
  ['wipers', 'Wiper blades', '26 in driver, 17 in passenger'],
  ['fuel', 'Fuel', 'Regular unleaded, about a 16-gallon tank'],
  ['epa', 'EPA rating', '26 city, 36 highway, 30 combined MPG'],
];
const TESLA_SPECS = [
  ['psi', 'Tire pressure', '42 psi, cold'],
  ['fuel', 'Charging', 'Home charger and Superchargers'],
];
export const JOBS = {
  tires: 'New tires',
  pads: 'Brake pads',
  battery: 'Battery',
  cvt: 'CVT fluid replacement',
};
export function profileOf(car) {
  if (/tesla/i.test((car && car.make) || ''))
    return {
      schedule: TESLA_SCHEDULE,
      url: TESLA_URL,
      guide: 'Tesla’s Model Y maintenance intervals',
      guideFor: '',
      warranty: [['Basic vehicle', 4, 50000], ['Battery and drive unit', 8, 120000]],
      image: null,
      fuel: 'electric',
      epa: null,
      specs: TESLA_SPECS,
      battery: false, // its low-voltage battery isn't a parts-store swap
      prices: {},
    };
  return {
    schedule: SCHEDULE,
    url: SCHEDULE_URL,
    guide: 'Nissan’s 2021 Altima maintenance guide',
    guideFor: ' for the 2.5L AWD',
    warranty: [['Basic', 3, 36000], ['Powertrain (engine, CVT, AWD)', 5, 60000]],
    image: 'car.png',
    fuel: 'gas',
    epa: 30,
    specs: ALTIMA_SPECS,
    battery: true,
    prices: { pads: 420, battery: 245, cvt: 180 }, // RepairPal: pads $391–448 (2019–2025), battery $231–255, fluid change $164–193
  };
}
// Words for gas or electric: what you buy, how far it goes, and what a stop is called.
export const unitsOf = (car) =>
  profileOf(car).fuel === 'electric'
    ? { qty: 'kWh', eff: 'mi/kWh', per: '/kWh', stop: 'Charge', stops: 'Charging', add: 'Log a charge', effName: 'Efficiency', digits: 2, one: 'charge', many: 'charges', by: 'mi/kWh by charge' }
    : { qty: 'gal', eff: 'MPG', per: '/gal', stop: 'Fill-up', stops: 'Fill-ups', add: 'Log a fill-up', effName: 'Mileage', digits: 1, one: 'fill-up', many: 'fill-ups', by: 'MPG by tank' };
// The specs you see: the car's, with any you've changed.
export function specsOf(a) {
  const own = a.specs || {};
  const base = profileOf(a.car).specs.map(([id, label, value]) => ({ id, label, value: own[id] != null ? own[id] : value, changed: own[id] != null && own[id] !== value }));
  return base;
}
export function setSpec(a, id, value) {
  const base = profileOf(a.car).specs.find((s) => s[0] === id);
  const v = String(value || '').trim().slice(0, 120);
  if (!base) return;
  if (!v || v === base[2]) delete a.specs[id];
  else a.specs[id] = v;
}
// What a big job costs: your quote, else the estimate for the car, else unknown.
export const priceOf = (a, id) => (a.prices && Number(a.prices[id]) > 0 ? Number(a.prices[id]) : profileOf(a.car).prices[id] || null);

// Inspection and registration by state: New York is the default; Washington has no inspection and renews yearly.
const STATE_RULES = {
  NY: { inspection: 'NYS inspection', inspectionMonths: 12, registrationMonths: 24 },
  WA: { inspection: null, registrationMonths: 12 },
};
export const rulesOf = (a) => STATE_RULES[a.state] || STATE_RULES.NY;

export function defaultAuto() {
  return {
    version: 1,
    state: 'NY',
    car: { year: 2021, make: 'Nissan', model: 'Altima', trim: 'SL', engine: '2.5L', drive: 'AWD', body: '4-door sedan', bought: '2021', boughtMonth: '', isNew: true },
    odo: [{ date: '2026-09-25', miles: 52000 }],
    milesPerYear: null,
    inspection: '2026-09-30', // NYS Safety/Emissions sticker 9/26: valid through the last day of that month
    registration: '2027-05-31', // registration sticker 5/27
    insuranceRenews: '',
    loan: { lender: '', balance: null, apr: null },
    service: [],
    recalls: {},
    fills: [], // fill-ups, or charging sessions: { id, date, miles, qty, cost, full, txId }
    skipTx: [], // charges in the gas category you said weren't fill-ups
    tires: { installed: '', installedDate: '', installedMiles: null, readings: [] }, // readings: { date, miles, tread } in 32nds of an inch
    brakes: { readings: [] }, // { date, miles, front, rear } in mm
    battery: { installed: '', installedDate: '', tests: [] }, // tests: { date, result: good | weak | bad }
    specs: {}, // your own values over the car's
    prices: {}, // quotes for big jobs, by JOBS id
    next: { price: null, down: null, tradeIn: null, apr: null, term: 60, mpg: null, insurance: null, fund: { target: null, saved: null, monthly: null }, watch: [] },
  };
}
const arr = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
export function normalizeAuto(d) {
  const b = defaultAuto();
  if (!d || typeof d !== 'object') return b;
  const next = obj(d.next);
  return {
    ...b,
    ...d,
    car: { ...b.car, ...obj(d.car) },
    loan: { ...b.loan, ...obj(d.loan) },
    odo: Array.isArray(d.odo) && d.odo.length ? d.odo : b.odo,
    service: arr(d.service),
    recalls: obj(d.recalls),
    fills: arr(d.fills).filter((f) => f && f.id && Number(f.qty) > 0),
    skipTx: arr(d.skipTx).slice(-200),
    tires: { ...b.tires, ...obj(d.tires), readings: arr(obj(d.tires).readings) },
    brakes: { ...b.brakes, ...obj(d.brakes), readings: arr(obj(d.brakes).readings) },
    battery: { ...b.battery, ...obj(d.battery), tests: arr(obj(d.battery).tests) },
    specs: obj(d.specs),
    prices: obj(d.prices),
    next: { ...b.next, ...next, fund: { ...b.next.fund, ...obj(next.fund) }, watch: arr(next.watch).filter((w) => w && w.id && w.name) },
  };
}

// ---------------------------------------------------------------- dates
const DAY = 86400000;
const toDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};
export const daysUntil = (iso, from = todayISO()) => Math.round((toDate(iso) - toDate(from)) / DAY);
export const endOfMonth = (y, m) => isoOf(new Date(y, m, 0)); // m is 1-12
export function addMonthsEnd(iso, n) {
  const d = toDate(iso);
  return endOfMonth(d.getFullYear(), d.getMonth() + 1 + n);
}
export function addMonthsIso(iso, n) {
  const d = toDate(iso);
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return isoOf(new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last)));
}
export const monthLabel = (iso) => toDate(iso).toLocaleString('en-US', { month: 'short', year: 'numeric' });
export const dayLabel = (iso) => toDate(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ---------------------------------------------------------------- mileage
export const latestOdo = (a) => [...a.odo].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.miles - x.miles))[0];
const boughtDate = (a) => (a.car.boughtMonth ? `${a.car.boughtMonth}-15` : `${a.car.bought || 2021}-07-01`);
// Miles a year: what you set, else from two readings a month+ apart, else since purchase.
export function milesPerYear(a) {
  if (a.milesPerYear) return { rate: Number(a.milesPerYear), how: 'set' };
  const r = [...a.odo].sort((x, y) => (x.date < y.date ? -1 : 1));
  const first = r[0];
  const last = r[r.length - 1];
  const span = (toDate(last.date) - toDate(first.date)) / DAY;
  if (r.length > 1 && span >= 30 && last.miles > first.miles) return { rate: Math.round(((last.miles - first.miles) / span) * 365), how: 'readings' };
  const years = (toDate(last.date) - toDate(boughtDate(a))) / DAY / 365;
  return { rate: years > 0.2 ? Math.round(last.miles / years / 100) * 100 : 12000, how: 'purchase' };
}
export function milesOn(a, iso = todayISO()) {
  const l = latestOdo(a);
  const { rate } = milesPerYear(a);
  return Math.round(l.miles + (rate * Math.max(0, (toDate(iso) - toDate(l.date)) / DAY)) / 365);
}
export function dateAtMiles(a, miles) {
  const l = latestOdo(a);
  const { rate } = milesPerYear(a);
  if (miles <= l.miles) return l.date;
  return isoOf(new Date(toDate(l.date).getTime() + ((miles - l.miles) / rate) * 365 * DAY));
}
export function addReading(a, miles, date = todayISO()) {
  const m = Math.round(Number(miles));
  if (!m || m < 0) return false;
  a.odo = a.odo.filter((r) => r.date !== date);
  a.odo.push({ date, miles: m });
  a.odo.sort((x, y) => (x.date < y.date ? -1 : 1));
  a.odo = a.odo.slice(-60);
  return true;
}

// ---------------------------------------------------------------- maintenance
// Items can be due by miles, by time, or whichever comes first.
export function maintenance(a, today = todayISO()) {
  const now = milesOn(a, today);
  return profileOf(a.car).schedule.map((item) => {
    const last = [...a.service].filter((s) => (s.items || []).includes(item.id)).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
    let dueMiles = null;
    let dueDate = null;
    if (last) {
      if (item.miles) dueMiles = (Number(last.miles) || milesOn(a, last.date)) + item.miles; // no mileage logged: the estimate for that day
      if (item.months) dueDate = addMonthsIso(last.date, item.months);
    } else if (item.miles) {
      dueMiles = Math.ceil((now + 1) / item.miles) * item.miles; // no record yet: the next mileage mark
    } else {
      // no record of a time-only item: the next interval since purchase
      let d = boughtDate(a);
      for (let i = 0; i < 40 && d <= today; i++) d = addMonthsIso(d, item.months);
      dueDate = d;
    }
    const byMiles = dueMiles != null ? dateAtMiles(a, dueMiles) : null;
    const when = [dueDate, byMiles].filter(Boolean).sort()[0];
    const milesLeft = dueMiles != null ? dueMiles - now : null;
    const days = daysUntil(when, today);
    const status = (milesLeft != null && milesLeft < 0) || days < 0 ? 'over' : (milesLeft != null && milesLeft <= 1000) || days <= 30 ? 'soon' : 'ok';
    return { ...item, last, dueMiles, dueDate, when, milesLeft, days, status, unknown: !last };
  });
}
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
// A visit: schedule items, plus replacements (new tires, pads, battery) and what the shop measured (tread, pads, a
// battery test), which feed the tires, brakes and battery card. `budgeted` says whether its cost also went into
// the budget, so Costs doesn't count it twice.
export function logService(a, { date, miles, items, cost, shop, note, tread, padF, padR, batt, budgeted }) {
  const entry = { id: uid(), date: date || todayISO(), miles: Math.round(Number(miles)) || null, items: items || [], cost: Number(cost) || 0, shop: (shop || '').trim(), note: (note || '').trim() };
  if (budgeted != null) entry.budgeted = !!budgeted;
  a.service.push(entry);
  a.service.sort((x, y) => (x.date < y.date ? -1 : 1));
  if (entry.miles && entry.miles >= latestOdo(a).miles) addReading(a, entry.miles, entry.date);
  const at = { date: entry.date, miles: entry.miles, svc: entry.id };
  if (entry.items.includes('tires')) a.tires = { ...a.tires, prev: { installed: a.tires.installed, installedMiles: a.tires.installedMiles, installedDate: a.tires.installedDate }, installed: entry.date.slice(0, 7), installedDate: entry.date, installedMiles: entry.miles, svc: entry.id };
  const t = num(tread);
  if (t != null && t >= 0 && t <= 20) a.tires.readings.push({ id: uid(), ...at, tread: t });
  for (const [item, k, v] of [['padsF', 'front', padF], ['padsR', 'rear', padR]]) {
    if (entry.items.includes(item)) a.brakes.readings.push({ id: uid(), ...at, [k]: PAD.fresh, repl: k });
    else {
      const n = num(v);
      if (n != null && n >= 0 && n <= 20) a.brakes.readings.push({ id: uid(), ...at, [k]: n });
    }
  }
  if (entry.items.includes('battery')) a.battery = { ...a.battery, prev: { installed: a.battery.installed, installedDate: a.battery.installedDate }, installed: entry.date.slice(0, 7), installedDate: entry.date, svc: entry.id };
  if (['good', 'weak', 'bad'].includes(batt)) a.battery.tests.push({ id: uid(), date: entry.date, result: batt, svc: entry.id });
  return entry;
}
export function removeService(a, id) {
  a.service = a.service.filter((s) => s.id !== id);
  a.tires.readings = a.tires.readings.filter((r) => r.svc !== id);
  a.brakes.readings = a.brakes.readings.filter((r) => r.svc !== id);
  a.battery.tests = a.battery.tests.filter((r) => r.svc !== id);
  if (a.tires.svc === id) {
    const p = a.tires.prev || {};
    a.tires = { ...a.tires, installed: p.installed || '', installedDate: p.installedDate || '', installedMiles: p.installedMiles != null ? p.installedMiles : null, svc: null, prev: null };
  }
  if (a.battery.svc === id) {
    const p = a.battery.prev || {};
    a.battery = { ...a.battery, installed: p.installed || '', installedDate: p.installedDate || '', svc: null, prev: null };
  }
}

// ---------------------------------------------------------------- tires, brakes and battery
// Tread in 32nds of an inch: new tires have about 10; 4 is when grip in rain and snow falls off, the usual time to
// replace; 2 is the legal minimum in most states (and fails a New York inspection). Brake pads in mm: about 10 new,
// replace at 3. Wear is a straight line through your readings (and the day they were new, when known).
export const TREAD = { fresh: 10, plan: 4, legal: 2 };
export const PAD = { fresh: 10, plan: 3, worn: 2 };
export const WEAR_ITEMS = [
  ['tires', 'New tires'],
  ['padsF', 'Front brake pads'],
  ['padsR', 'Rear brake pads'],
  ['battery', 'New battery'],
];
const byWhen = (x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.miles || 0) - (y.miles || 0));
// Miles left past the last point until the reading reaches `limit`, or null without two points far enough apart.
function wearTo(points, limit) {
  const p = points.filter((x) => x.miles != null && x.v != null);
  if (p.length < 2) return null;
  const f = p[0];
  const l = p[p.length - 1];
  const dm = l.miles - f.miles;
  const dv = f.v - l.v;
  if (dm < 500 || dv <= 0) return null;
  return Math.max(0, ((l.v - limit) / dv) * dm);
}
const yearsSince = (month, today) => {
  if (!month) return null;
  const [y, m] = month.split('-').map(Number);
  const [ty, tm] = today.split('-').map(Number);
  return Math.max(0, (ty - y) * 12 + (tm - m)) / 12;
};
export const ageText = (yrs) => (yrs == null ? '' : yrs < 1 ? `${Math.max(1, Math.round(yrs * 12))} months old` : `${Math.floor(yrs)} year${Math.floor(yrs) === 1 ? '' : 's'} old`);
const roughMiles = (n) => (n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n)).toLocaleString();
const aroundText = (a, milesLeft, today) => (milesLeft > 0 ? `about ${roughMiles(milesLeft)} mi, around ${monthLabel(dateAtMiles(a, milesOn(a, today) + milesLeft))}` : 'now');

// Whether a reading or test is from after the part was put on: after the day it was logged (or from that visit),
// or, with only a month you entered, from that month on.
const sinceNew = (part, r) => !part.installed || (part.installedDate ? r.date > part.installedDate || (!!part.svc && r.svc === part.svc) : r.date.slice(0, 7) >= part.installed);
export function tireState(a, today = todayISO()) {
  const t = a.tires;
  const start = t.installedMiles != null ? t.installedMiles : !t.installed && a.car.isNew ? 0 : null;
  const readings = t.readings.filter((r) => sinceNew(t, r)).sort(byWhen);
  const last = readings[readings.length - 1] || null;
  const now = milesOn(a, today);
  const left = last ? wearTo([...(start != null ? [{ miles: start, v: TREAD.fresh }] : []), ...readings.map((r) => ({ miles: r.miles, v: r.tread }))], TREAD.plan) : null;
  const milesLeft = left != null ? Math.round(left - Math.max(0, now - (last.miles || now))) : null;
  const month = t.installed || a.car.boughtMonth || '';
  const age = yearsSince(month, today);
  let status = 'ok';
  let text;
  if (last && last.tread <= TREAD.legal) (status = 'over'), (text = `${last.tread}/32" left: replace them now (2/32" is the legal minimum)`);
  else if (last && last.tread <= TREAD.plan) (status = 'soon'), (text = `${last.tread}/32" left: time for new tires (grip in rain and snow falls off below 4/32")`);
  else if (milesLeft != null && milesLeft <= 0) (status = 'soon'), (text = `${last.tread}/32" on ${dayLabel(last.date)}; probably near 4/32" by now, so measure them`);
  else if (milesLeft != null && milesLeft <= 3000) (status = 'soon'), (text = `${last.tread}/32" on ${dayLabel(last.date)}; 4/32" in ${aroundText(a, milesLeft, today)}`);
  else if (age != null && age >= 6) (status = 'soon'), (text = `${ageText(age)}: have them checked for cracks (many carmakers say replace by 6 years)`);
  else if (!last) (status = 'none'), (text = 'No tread reading yet. Ask for one at your next service, or check with a tread gauge.');
  else text = `${last.tread}/32" on ${dayLabel(last.date)}${milesLeft != null ? `; 4/32" in ${aroundText(a, milesLeft, today)}` : ''}`;
  return { last, readings, milesLeft: milesLeft != null ? Math.max(0, milesLeft) : null, age, original: !t.installed, month, status, text };
}

export function brakeState(a, today = todayISO()) {
  const now = milesOn(a, today);
  const all = [...a.brakes.readings].sort(byWhen);
  const axle = (k, name) => {
    const list = all.filter((r) => r[k] != null);
    const i = list.map((r) => r.repl === k).lastIndexOf(true);
    const cur = i >= 0 ? list.slice(i) : list;
    const last = cur[cur.length - 1] || null;
    if (!last) return { k, name, last: null, status: 'none', text: 'No reading yet' };
    const left = wearTo(cur.map((r) => ({ miles: r.miles, v: r[k] })), PAD.plan);
    const milesLeft = left != null ? Math.round(left - Math.max(0, now - (last.miles || now))) : null;
    const v = last[k];
    const when = last.repl === k ? `new ${dayLabel(last.date)}` : `${v} mm on ${dayLabel(last.date)}`;
    if (v <= PAD.worn) return { k, name, last, v, milesLeft, status: 'over', text: `${v} mm: replace them now` };
    if (v <= PAD.plan) return { k, name, last, v, milesLeft, status: 'soon', text: `${v} mm: time for new pads` };
    if (milesLeft != null && milesLeft <= 0) return { k, name, last, v, milesLeft: 0, status: 'soon', text: `${when}; probably near 3 mm by now, so have them measured` };
    if (milesLeft != null && milesLeft <= 3000) return { k, name, last, v, milesLeft, status: 'soon', text: `${when}; 3 mm in ${aroundText(a, milesLeft, today)}` };
    return { k, name, last, v, milesLeft, status: 'ok', text: `${when}${milesLeft != null ? `; 3 mm in ${aroundText(a, milesLeft, today)}` : ''}` };
  };
  const axles = [axle('front', 'Front'), axle('rear', 'Rear')];
  const rank = { over: 3, soon: 2, ok: 1, none: 0 };
  const worst = axles.reduce((x, y) => (rank[y.status] > rank[x.status] ? y : x));
  return { axles, status: worst.status, milesLeft: axles.map((x) => x.milesLeft).filter((x) => x != null).sort((x, y) => x - y)[0] ?? null };
}

export function batteryState(a, today = todayISO()) {
  if (!profileOf(a.car).battery) return null;
  const month = a.battery.installed || a.car.boughtMonth || (a.car.bought ? `${a.car.bought}-07` : '');
  const age = yearsSince(month, today);
  const test = [...a.battery.tests].sort(byWhen).pop() || null;
  const fresh = test && daysUntil(test.date, today) >= -365 && sinceNew(a.battery, test);
  let status = 'ok';
  let text = `${ageText(age)}${a.battery.installed ? '' : ' (the original, unless it’s been replaced)'}`;
  if (fresh && test.result === 'bad') (status = 'over'), (text = `Failed its test on ${dayLabel(test.date)}: replace it`);
  else if (fresh && test.result === 'weak') (status = 'soon'), (text = `Tested weak on ${dayLabel(test.date)}: replace it before winter`);
  else if (fresh && test.result === 'good') text = `${ageText(age)}; tested good on ${dayLabel(test.date)}`;
  else if (age != null && age >= 5) (status = 'soon'), (text = `${ageText(age)}. Most car batteries last 3 to 5 years; have it tested (parts stores do it free)`);
  else if (age != null && age >= 3) (status = 'near'), (text = `${ageText(age)}: have it tested at your next service`);
  return { month, age, test: fresh ? test : null, status, text };
}
// Readings taken on their own (a tread gauge in the driveway, a free battery test).
export function addTread(a, { date = todayISO(), miles, tread }) {
  const t = num(tread);
  if (t == null || t < 0 || t > 20) return false;
  a.tires.readings.push({ id: uid(), date, miles: Math.round(Number(miles)) || milesOn(a, date), tread: t });
  return true;
}
export function addPads(a, { date = todayISO(), miles, front, rear }) {
  const ok = (v) => (v != null && v >= 0 && v <= 20 ? v : null);
  const f = ok(num(front));
  const r = ok(num(rear));
  if (f == null && r == null) return false;
  a.brakes.readings.push({ id: uid(), date, miles: Math.round(Number(miles)) || milesOn(a, date), ...(f != null ? { front: f } : {}), ...(r != null ? { rear: r } : {}) });
  return true;
}
export function addBatteryTest(a, { date = todayISO(), result }) {
  if (!['good', 'weak', 'bad'].includes(result)) return false;
  a.battery.tests.push({ id: uid(), date, result });
  return true;
}
// When the tires (or battery) went on, entered by hand: a month, and for tires the odometer then if you know it.
export function setInstalled(a, kind, month, miles) {
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : '';
  const odo = num(String(miles == null ? '' : miles).replace(/[^\d]/g, ''));
  const same = (part) => m && m === part.installed;
  if (kind === 'tires') a.tires = same(a.tires) ? { ...a.tires, installedMiles: odo != null ? Math.round(odo) : a.tires.installedMiles } : { ...a.tires, installed: m, installedDate: '', installedMiles: m && odo != null ? Math.round(odo) : null, svc: null, prev: null };
  if (kind === 'battery' && !same(a.battery)) a.battery = { ...a.battery, installed: m, installedDate: '', svc: null, prev: null };
}
export function removeWear(a, kind, id) {
  if (kind === 'tires') a.tires.readings = a.tires.readings.filter((r) => r.id !== id);
  if (kind === 'brakes') a.brakes.readings = a.brakes.readings.filter((r) => r.id !== id);
  if (kind === 'battery') a.battery.tests = a.battery.tests.filter((r) => r.id !== id);
}

// ---------------------------------------------------------------- the next service visit
// Everything worth doing at one stop: schedule items due within ~3,000 mi or 90 days, worn tires or pads, a battery
// to test or replace, measurements the shop can take while it's up on the lift, an inspection coming up, and recalls
// to check. `log` is the schedule items, to fill in the Log service sheet afterward.
export function visitPlan(a, recalls, today = todayISO(), { miles = 3000, days = 90 } = {}) {
  const out = [];
  for (const m of maintenance(a, today)) {
    if (m.status === 'over' || m.status === 'soon' || (m.milesLeft != null && m.milesLeft <= miles) || m.days <= days)
      out.push({ id: m.id, kind: 'service', name: m.name, status: m.status === 'ok' ? 'near' : m.status, why: m.status === 'over' ? 'overdue' : m.milesLeft != null && m.milesLeft <= miles ? `due at ${m.dueMiles.toLocaleString()} mi` : `due ${monthLabel(m.when)}` });
  }
  const tires = tireState(a, today);
  if (tires.status === 'over' || tires.status === 'soon') out.push({ id: 'tires', kind: 'wear', name: 'Tires', status: tires.status, why: tires.text });
  const brakes = brakeState(a, today);
  for (const x of brakes.axles) if (x.status === 'over' || x.status === 'soon') out.push({ id: `pads-${x.k}`, kind: 'wear', name: `${x.name} brake pads`, status: x.status, why: x.text });
  const bat = batteryState(a, today);
  if (bat && bat.status !== 'ok') out.push({ id: 'battery', kind: 'wear', name: bat.status === 'near' || (bat.status === 'soon' && !bat.test) ? 'Battery test' : 'Battery', status: bat.status, why: bat.text });
  const stale = (r) => !r || daysUntil(r.date, today) < -365;
  const pads = brakes.axles.map((x) => x.last).filter(Boolean).sort(byWhen).pop();
  if (tires.status !== 'over' && tires.status !== 'soon' && (stale(tires.last) || stale(pads)))
    out.push({ id: 'measure', kind: 'check', name: 'Measure tread depth and brake pads', status: 'near', why: 'Most shops do it free; it keeps the estimates here current' });
  for (const d of deadlines(a, today)) if (d.id === 'inspection' && d.days != null && d.days <= 60) out.push({ id: d.id, kind: 'deadline', name: d.name, status: d.status === 'over' ? 'over' : 'soon', why: d.label });
  const open = (recalls || []).filter((r) => !a.recalls[r.id]);
  if (open.length) out.push({ id: 'recalls', kind: 'check', name: `Check ${open.length === 1 ? 'the open recall' : `${open.length} open recalls`} for your VIN`, status: 'near', why: open.map((r) => r.id).join(', ') });
  const rank = { over: 0, soon: 1, near: 2 };
  out.sort((x, y) => rank[x.status] - rank[y.status]);
  return { items: out, log: out.filter((x) => x.kind === 'service').map((x) => x.id) };
}
// The visit as text, to paste into a note or show the service desk.
export function visitText(a, plan, today = todayISO()) {
  const c = a.car;
  const specs = specsOf(a).filter((s) => ['oil', 'cvt', 'tires', 'psi', 'wipers'].includes(s.id));
  return [
    `${c.year} ${c.make} ${c.model} ${c.trim} ${c.drive}, about ${milesOn(a, today).toLocaleString()} mi`,
    '',
    ...plan.items.map((x) => `- ${x.name}${x.why ? ` (${x.why})` : ''}`),
    ...(specs.length ? ['', ...specs.map((s) => `${s.label}: ${s.value}`)] : []),
  ].join('\n');
}

// ---------------------------------------------------------------- deadlines
export function deadlines(a, today = todayISO()) {
  const rules = rulesOf(a);
  const out = [
    rules.inspection ? { id: 'inspection', name: rules.inspection, date: a.inspection, label: a.inspection ? `Sticker good through ${dayLabel(a.inspection)}` : 'Add the date on your inspection sticker', renew: 'Inspected' } : null,
    { id: 'registration', name: 'Registration', date: a.registration, label: a.registration ? `Expires ${monthLabel(a.registration)}` : 'Add the date on your registration', renew: 'Renewed' },
    { id: 'insurance', name: 'Insurance renewal', date: a.insuranceRenews, label: a.insuranceRenews ? `Renews ${dayLabel(a.insuranceRenews)}` : 'Add your policy renewal date', renew: 'Renewed' },
  ].filter(Boolean);
  return out.map((d) => {
    const days = d.date ? daysUntil(d.date, today) : null;
    return { ...d, days, status: days == null ? 'none' : days < 0 ? 'over' : days <= 30 ? 'soon' : days <= 60 ? 'near' : 'ok' };
  });
}
// A new NY inspection is good for 12 months (through the end of that month); NY registration is 2 years (1 in
// Washington); policies 6 months.
export function renew(a, id, today = todayISO()) {
  const rules = rulesOf(a);
  if (id === 'inspection') a.inspection = addMonthsEnd(today, rules.inspectionMonths || 12);
  else if (id === 'registration') a.registration = addMonthsEnd(a.registration && a.registration > today ? a.registration : today, rules.registrationMonths);
  else if (id === 'insurance') a.insuranceRenews = addMonthsIso(a.insuranceRenews && a.insuranceRenews > today ? a.insuranceRenews : today, 6);
}

// ---------------------------------------------------------------- warranty (Nissan: basic 3 yr / 36k, powertrain 5 yr / 60k;
// Tesla Model Y Long Range: basic 4 yr / 50k, battery and drive unit 8 yr / 120k)
export function warranty(a, today = todayISO()) {
  const miles = milesOn(a, today);
  const start = a.car.boughtMonth ? `${a.car.boughtMonth}-01` : null;
  const one = (name, years, cap) => {
    if (miles >= cap) return { name, text: `Ended at ${cap.toLocaleString()} miles`, active: false };
    if (!start) return { name, text: `${years} years or ${cap.toLocaleString()} mi from purchase. Add your purchase month to see when it ends.`, active: null };
    const end = addMonthsIso(start, years * 12);
    if (end <= today) return { name, text: `Ended ${monthLabel(end)}`, active: false };
    return { name, text: `Until ${monthLabel(end)} or ${cap.toLocaleString()} mi (${(cap - miles).toLocaleString()} mi left), whichever comes first`, active: true, end };
  };
  return profileOf(a.car).warranty.map(([name, years, cap]) => one(name, years, cap));
}

// ---------------------------------------------------------------- money from the budget
const findBill = (bills, re) => bills.find((b) => re.test(b.name));
export function carMoney(data, today = todayISO()) {
  if (!data || !data.config) return null;
  const cfg = data.config;
  const key = keyOf(today);
  const bills = cfg.bills || [];
  const loan = findBill(bills, /car payment|auto loan|car loan/i);
  let payments = null;
  if (loan && loan.ends) {
    payments = [];
    let [y, m] = key.split('-').map(Number);
    for (let i = 0; i < 120; i++) {
      const k = `${y}-${pad2(m)}`;
      if (k > loan.ends) break;
      const mm = (data.months || {})[k];
      if (!(k === key && isPaid(mm, loan, k))) payments.push(k);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }
  const ins = findBill(activeBills(cfg, key), /geico|insurance/i);
  const insNext = bills.find((b) => /geico|insurance/i.test(b.name) && b.starts && b.starts > key);
  const cat = (cfg.categories || []).find((c) => /gas|auto/i.test(c.name));
  const month = (data.months || {})[key];
  const gas = cat
    ? {
        name: cat.name,
        budget: Number(cat.budget) || 0,
        spent: sum(((month && month.transactions) || []).filter((t) => t.category === cat.name), (t) => t.amount),
        recent: Object.keys(data.months || {})
          .sort()
          .reverse()
          .slice(0, 3)
          .flatMap((k) => (data.months[k].transactions || []).filter((t) => t.category === cat.name))
          .sort((x, y) => (x.date < y.date ? 1 : -1))
          .slice(0, 5),
      }
    : null;
  return {
    loan: loan ? { name: loan.name, amount: Number(loan.amount), day: loan.day, ends: loan.ends, left: payments ? payments.length : null, owed: payments ? payments.length * Number(loan.amount) : null } : null,
    insurance: ins ? { name: ins.name.replace(/\s*\(.*\)\s*$/, ''), amount: Number(ins.amount), next: insNext ? { amount: Number(insNext.amount), from: insNext.starts } : null } : null,
    gas,
  };
}

// ---------------------------------------------------------------- recalls (NHTSA, by model year)
export const recallsUrl = (car) => `https://api.nhtsa.gov/recalls/recallsByVehicle?${new URLSearchParams({ make: car.make, model: car.model, modelYear: String(car.year) })}`;
export const RECALL_STATES = [
  ['', 'Not checked'],
  ['na', 'Doesn’t apply to my car'],
  ['fixed', 'Repair done'],
];
export const setRecall = (a, id, v) => {
  if (v) a.recalls[id] = v;
  else delete a.recalls[id];
};

// ---------------------------------------------------------------- Home summary: the few things worth a glance
export function autoAlerts(a, money, recalls, today = todayISO()) {
  const out = [];
  for (const d of deadlines(a, today)) {
    if (d.status === 'over') out.push({ tone: 'over', text: `${d.name} expired ${dayLabel(d.date)}` });
    else if (d.status === 'soon' || (d.id === 'inspection' && d.status === 'near')) out.push({ tone: 'soon', text: `${d.name} due ${d.days === 0 ? 'today' : d.days === 1 ? 'tomorrow' : `in ${d.days} days`} (${dayLabel(d.date)})` });
  }
  for (const m of maintenance(a, today)) {
    const dueAt = m.milesLeft != null && m.milesLeft < 0 ? `at ${m.dueMiles.toLocaleString()} mi` : dayLabel(m.when);
    if (m.status === 'over') out.push({ tone: 'over', text: `${m.name} overdue${m.unknown && m.dueMiles != null ? '' : ` (was due ${dueAt})`}` });
    else if (m.status === 'soon') out.push({ tone: 'soon', text: `${m.name} due ${m.milesLeft != null && m.milesLeft > 0 && m.milesLeft <= 1000 ? `in ~${m.milesLeft.toLocaleString()} mi` : m.days > 0 ? `in ${m.days} day${m.days === 1 ? '' : 's'}` : 'now'}` });
  }
  const open = (recalls || []).filter((r) => !a.recalls[r.id]).length;
  if (open) out.push({ tone: 'soon', text: `${open} recall${open === 1 ? '' : 's'} to check for your VIN` });
  const tires = tireState(a, today);
  if (tires.status === 'over') out.push({ tone: 'over', text: 'Tires are at the legal minimum: replace them' });
  else if (tires.status === 'soon')
    out.push({
      tone: 'soon',
      text:
        tires.last && tires.last.tread <= TREAD.plan
          ? 'Time for new tires'
          : tires.milesLeft === 0
            ? 'Tires are probably near 4/32": measure them'
            : tires.milesLeft != null && tires.milesLeft <= 3000
              ? `New tires in ~${tires.milesLeft.toLocaleString()} mi`
              : 'Tires are 6+ years old: have them checked',
    });
  for (const x of brakeState(a, today).axles) {
    if (x.status === 'over') out.push({ tone: 'over', text: `${x.name} brake pads are worn: replace them` });
    else if (x.status === 'soon') out.push({ tone: 'soon', text: `${x.name} brake pads are getting thin` });
  }
  const bat = batteryState(a, today);
  if (bat && bat.status === 'over') out.push({ tone: 'over', text: 'Battery failed its test: replace it' });
  else if (bat && bat.status === 'soon') out.push({ tone: 'soon', text: bat.test && bat.test.result === 'weak' ? 'Battery tested weak' : `Battery is ${ageText(bat.age)}: have it tested` });
  return out.sort((x, y) => (x.tone === y.tone ? 0 : x.tone === 'over' ? -1 : 1));
}
