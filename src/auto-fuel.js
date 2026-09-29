// Fill-ups (or charging sessions, for an electric car) on the Auto tab: real mileage, what gas costs you, and the gas
// charges already in your budget turned into fill-ups with one number (the gallons). Saved in the auto document.
//
// Mileage uses the full-tank method: from one full fill with an odometer reading to the next, miles driven divided
// by the gallons put in since (partial fills in between count too). A full fill without an odometer reading starts
// over. For an electric car every session counts as "full", which over a few weeks comes out to miles per kWh.
import { uid, todayISO, keyOf } from './budget-logic.js';
import { profileOf, milesOn, milesPerYear, addReading, latestOdo } from './auto-logic.js';

// Gas stations and chargers by name, and rides that aren't your car (they share the budget category).
export const FUEL_RE =
  /\b(shell|mobil|exxon|exxonmobil|bp|sunoco|citgo|texaco|gulf|conoco|phillips ?66|valero|speedway|getty|hess|marathon|wawa|sheetz|quick ?chek|circle ?k|7-?eleven|usa gas|lukoil|sinclair|chevron|arco|delta sonic|costco|gas|fuel|gasoline|supercharger|chargepoint|electrify america|evgo|blink|charging|charge)\b/i;
export const TRANSIT_RE = /\b(uber|lyft|omny|subway|lirr|mta|metro-?north|nj ?transit|amtrak|taxi|cab|citi ?bike|bus|train|ferry|ferries|path train)\b/i;
// a shop at a station brand ("Mobil 1 Lube Express", "Getty Auto Repair") is upkeep, not gas
const SHOP_RE = /\b(lube|repair|service|tires?|oil change|wash|parts|body|collision|detail|inspection|dmv|toll|e-?zpass|parking)\b/i;
export const kindOf = (desc) => {
  const d = desc || '';
  if (TRANSIT_RE.test(d) && !FUEL_RE.test(d)) return 'transit';
  if (SHOP_RE.test(d)) return 'car';
  return FUEL_RE.test(d) ? 'fuel' : 'car';
};
// The budget category your car's spending goes in (Gas & Auto, or the demo's Auto & Charging).
export const carCategory = (data) => ((data && data.config && data.config.categories) || []).find((c) => /gas|auto|charging/i.test(c.name)) || null;

const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const byWhen = (x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.miles || 0) - (y.miles || 0));

export function addFill(a, { date = todayISO(), miles, qty, cost, full = true, txId, where }) {
  const q = num(qty);
  const c = num(cost);
  if (q == null || q <= 0 || q > 400 || c == null || c < 0) return null;
  const m = num(String(miles == null ? '' : miles).replace(/[^\d.]/g, ''));
  const f = { id: uid(), date, miles: m && m > 0 ? Math.round(m) : null, qty: Math.round(q * 1000) / 1000, cost: Math.round(c * 100) / 100, full: !!full };
  if (txId) f.txId = txId;
  if (where) f.where = String(where).trim().slice(0, 60);
  a.fills.push(f);
  a.fills.sort(byWhen);
  if (a.fills.length > 600) a.fills = a.fills.slice(-600);
  if (f.miles && f.miles >= latestOdo(a).miles) addReading(a, f.miles, f.date);
  return f;
}
export function removeFill(a, id) {
  a.fills = a.fills.filter((f) => f.id !== id);
}
export function skipCharge(a, txId) {
  if (!a.skipTx.includes(txId)) a.skipTx = [...a.skipTx, txId].slice(-200);
}

// Gas-station charges in the budget from the last 60 days that aren't fill-ups here yet.
export function pendingCharges(a, data, today = todayISO(), days = 60) {
  const cat = carCategory(data);
  if (!cat) return [];
  const from = isoMinus(today, days);
  const linked = new Set(a.fills.map((f) => f.txId).filter(Boolean));
  const skip = new Set(a.skipTx);
  const out = [];
  for (const k of Object.keys((data && data.months) || {})) {
    if (k < from.slice(0, 7)) continue;
    for (const t of data.months[k].transactions || []) {
      if (t.category !== cat.name || t.date < from || t.date > today || linked.has(t.id) || skip.has(t.id) || !(Number(t.amount) > 0)) continue;
      if (kindOf(t.desc) === 'fuel') out.push(t);
    }
  }
  return out.sort((x, y) => (x.date < y.date ? 1 : -1));
}
export function isoMinus(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d - n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// Mileage between full fills, price per unit, and what driving costs per mile and per month.
export function fuelStats(a, today = todayISO()) {
  const electric = profileOf(a.car).fuel === 'electric';
  const fills = [...a.fills].sort(byWhen);
  const segs = [];
  let from = null;
  let qty = 0;
  for (const f of fills) {
    const full = electric || f.full;
    if (!from) {
      if (full && f.miles) from = f;
      continue;
    }
    qty += f.qty;
    if (!full) continue;
    if (!f.miles || f.miles <= from.miles) {
      // a full fill with no reading (or a reading out of order) can't close the stretch; start over from here
      from = f.miles ? f : null;
      qty = 0;
      continue;
    }
    const miles = f.miles - from.miles;
    if (qty > 0 && miles / qty < (electric ? 12 : 120)) segs.push({ date: f.date, miles, qty, eff: miles / qty });
    from = f;
    qty = 0;
  }
  const tot = (list) => {
    const m = list.reduce((t, s) => t + s.miles, 0);
    const q = list.reduce((t, s) => t + s.qty, 0);
    return q > 0 ? m / q : null;
  };
  const eff = tot(segs);
  const recent = tot(segs.slice(-3));
  const priced = fills.filter((f) => f.cost > 0 && f.qty > 0).map((f) => ({ t: f.date, v: f.cost / f.qty }));
  const price = priced.length ? priced[priced.length - 1].v : null;
  const yearAgo = isoMinus(today, 365);
  const lastYear = priced.filter((p) => p.t >= yearAgo);
  const avgPrice = lastYear.length ? lastYear.reduce((t, p) => t + p.v, 0) / lastYear.length : price;
  const rate = milesPerYear(a).rate;
  const useEff = eff || (profileOf(a.car).epa && !electric ? profileOf(a.car).epa : null);
  const perMile = useEff && avgPrice ? avgPrice / useEff : null;
  const month = keyOf(today);
  return {
    electric,
    segs,
    eff,
    recent,
    epa: electric ? null : profileOf(a.car).epa,
    price,
    avgPrice,
    prices: priced,
    perMile,
    perMonth: perMile ? (perMile * rate) / 12 : null,
    fromEpa: !eff && !!perMile,
    thisMonth: fills.filter((f) => f.date.slice(0, 7) === month).reduce((t, f) => t + f.cost, 0),
    count: fills.length,
    milesNow: milesOn(a, today),
  };
}
