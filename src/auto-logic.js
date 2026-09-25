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

export function defaultAuto() {
  return {
    version: 1,
    car: { year: 2021, make: 'Nissan', model: 'Altima', trim: 'SL', engine: '2.5L', drive: 'AWD', body: '4-door sedan', bought: '2021', boughtMonth: '', isNew: true },
    odo: [{ date: '2026-09-25', miles: 52000 }],
    milesPerYear: null,
    inspection: '2026-09-30', // NYS Safety/Emissions sticker 9/26: valid through the last day of that month
    registration: '2027-05-31', // registration sticker 5/27
    insuranceRenews: '',
    loan: { lender: '', balance: null, apr: null },
    service: [],
    recalls: {},
  };
}
export function normalizeAuto(d) {
  const b = defaultAuto();
  if (!d || typeof d !== 'object') return b;
  return {
    ...b,
    ...d,
    car: { ...b.car, ...(d.car || {}) },
    loan: { ...b.loan, ...(d.loan || {}) },
    odo: Array.isArray(d.odo) && d.odo.length ? d.odo : b.odo,
    service: Array.isArray(d.service) ? d.service : [],
    recalls: d.recalls && typeof d.recalls === 'object' ? d.recalls : {},
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
export function maintenance(a, today = todayISO()) {
  const now = milesOn(a, today);
  return SCHEDULE.map((item) => {
    const last = [...a.service].filter((s) => (s.items || []).includes(item.id)).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
    let dueMiles;
    let dueDate = null;
    if (last) {
      dueMiles = (Number(last.miles) || now) + item.miles;
      dueDate = addMonthsIso(last.date, item.months);
    } else {
      dueMiles = Math.ceil((now + 1) / item.miles) * item.miles; // no record yet: the next mileage mark
    }
    const byMiles = dateAtMiles(a, dueMiles);
    const when = dueDate && dueDate < byMiles ? dueDate : byMiles;
    const milesLeft = dueMiles - now;
    const days = daysUntil(when, today);
    const status = milesLeft < 0 || days < 0 ? 'over' : milesLeft <= 1000 || days <= 30 ? 'soon' : 'ok';
    return { ...item, last, dueMiles, dueDate, when, milesLeft, days, status, unknown: !last };
  });
}
export function logService(a, { date, miles, items, cost, shop, note }) {
  const entry = { id: uid(), date: date || todayISO(), miles: Math.round(Number(miles)) || null, items: items || [], cost: Number(cost) || 0, shop: (shop || '').trim(), note: (note || '').trim() };
  a.service.push(entry);
  a.service.sort((x, y) => (x.date < y.date ? -1 : 1));
  if (entry.miles && entry.miles >= latestOdo(a).miles) addReading(a, entry.miles, entry.date);
  return entry;
}
export function removeService(a, id) {
  a.service = a.service.filter((s) => s.id !== id);
}

// ---------------------------------------------------------------- deadlines
export function deadlines(a, today = todayISO()) {
  const out = [
    { id: 'inspection', name: 'NYS inspection', date: a.inspection, label: a.inspection ? `Sticker good through ${dayLabel(a.inspection)}` : 'Add the date on your inspection sticker', renew: 'Inspected' },
    { id: 'registration', name: 'Registration', date: a.registration, label: a.registration ? `Expires ${monthLabel(a.registration)}` : 'Add the date on your registration', renew: 'Renewed' },
    { id: 'insurance', name: 'Insurance renewal', date: a.insuranceRenews, label: a.insuranceRenews ? `Renews ${dayLabel(a.insuranceRenews)}` : 'Add your policy renewal date', renew: 'Renewed' },
  ];
  return out.map((d) => {
    const days = d.date ? daysUntil(d.date, today) : null;
    return { ...d, days, status: days == null ? 'none' : days < 0 ? 'over' : days <= 30 ? 'soon' : days <= 60 ? 'near' : 'ok' };
  });
}
// A new NY inspection is good for 12 months (through the end of that month); registration is 2 years; policies 6 months.
export function renew(a, id, today = todayISO()) {
  if (id === 'inspection') a.inspection = addMonthsEnd(today, 12);
  else if (id === 'registration') a.registration = addMonthsEnd(a.registration && a.registration > today ? a.registration : today, 24);
  else if (id === 'insurance') a.insuranceRenews = addMonthsIso(a.insuranceRenews && a.insuranceRenews > today ? a.insuranceRenews : today, 6);
}

// ---------------------------------------------------------------- warranty (Nissan: basic 3 yr / 36k, powertrain 5 yr / 60k)
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
  return [one('Basic', 3, 36000), one('Powertrain (engine, CVT, AWD)', 5, 60000)];
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
    if (m.status === 'over') out.push({ tone: 'over', text: `${m.name} overdue${m.unknown ? '' : ` (was due at ${m.dueMiles.toLocaleString()} mi)`}` });
    else if (m.status === 'soon') out.push({ tone: 'soon', text: `${m.name} due ${m.milesLeft > 0 ? `in ~${m.milesLeft.toLocaleString()} mi` : 'now'}` });
  }
  const open = (recalls || []).filter((r) => !a.recalls[r.id]).length;
  if (open) out.push({ tone: 'soon', text: `${open} recall${open === 1 ? '' : 's'} to check for your VIN` });
  return out;
}
