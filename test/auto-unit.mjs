// Auto: fill-ups and mileage, gas charges from the budget, tires/brakes/battery, the next service visit, cost of
// ownership, keep vs replace, the next-car fund and the CarPlay Ultra list. Made-up data only.
import * as A from '../src/auto-logic.js';
import * as F from '../src/auto-fuel.js';
import * as C from '../src/auto-costs.js';

export async function autoUnit(check) {
  const today = '2026-09-28';
  const base = () => {
    const a = A.normalizeAuto({ car: { boughtMonth: '2021-06' }, odo: [{ date: '2026-03-01', miles: 40000 }, { date: '2026-09-01', miles: 46000 }] });
    return a;
  };
  let a = base();
  check(A.milesPerYear(a).rate > 11000 && A.milesPerYear(a).rate < 13000, `made-up car drives about 12k a year (${A.milesPerYear(a).rate})`);
  check(Array.isArray(a.fills) && a.next.term === 60 && a.tires.readings.length === 0 && A.normalizeAuto({ fills: [{ id: 'x', qty: 0 }], next: { fund: { target: 5 } } }).fills.length === 0, 'normalize: new parts get defaults, bad fills drop');
  check(A.normalizeAuto({ next: { fund: { target: 5 } } }).next.fund.saved === null && A.normalizeAuto({ next: { fund: { target: 5 } } }).next.term === 60, 'normalize: a partial next-car block keeps its defaults');

  // ---- fill-ups: full-tank mileage, partial fills count, a full fill without a reading starts over
  F.addFill(a, { date: '2026-08-01', miles: 45000, qty: 12, cost: 42, full: true });
  F.addFill(a, { date: '2026-08-08', miles: '45,150', qty: 3, cost: 10.5, full: false });
  F.addFill(a, { date: '2026-08-15', miles: 45300, qty: 7, cost: 24.5, full: true });
  let st = F.fuelStats(a, today);
  check(st.segs.length === 1 && Math.abs(st.eff - 30) < 0.01, `mileage: 300 mi on 3 + 7 gal is 30 MPG (${st.eff})`);
  F.addFill(a, { date: '2026-08-22', qty: 9, cost: 33, full: true }); // no reading: can't close a stretch
  F.addFill(a, { date: '2026-08-29', miles: 45900, qty: 10, cost: 36, full: true }); // starts a new stretch only
  check(F.fuelStats(a, today).segs.length === 1, 'a full fill without an odometer reading starts over');
  F.addFill(a, { date: '2026-09-05', miles: 46180, qty: 10, cost: 35, full: true });
  st = F.fuelStats(a, today);
  check(st.segs.length === 2 && Math.abs(st.eff - 580 / 20) < 0.01 && Math.abs(st.price - 3.5) < 0.001, `mileage over both stretches, latest price $3.50 (${st.eff.toFixed(2)})`);
  check(st.perMile > 0.11 && st.perMile < 0.13 && st.perMonth > 100 && st.perMonth < 140, `cost per mile and month (${st.perMile.toFixed(3)}, ${st.perMonth.toFixed(0)})`);
  check(A.latestOdo(a).miles === 46180, 'a fill-up with a reading moves the odometer');
  check(F.addFill(a, { qty: 0, cost: 3 }) === null && F.addFill(a, { qty: 'x', cost: 3 }) === null && F.addFill(a, { qty: 5, cost: -1 }) === null, 'bad fill-ups are refused');
  const silly = A.normalizeAuto({});
  F.addFill(silly, { date: '2026-09-01', miles: 60000, qty: 10, cost: 30, full: true });
  F.addFill(silly, { date: '2026-09-02', miles: 70000, qty: 1, cost: 3, full: true });
  check(F.fuelStats(silly, today).segs.length === 0, 'an impossible stretch (10,000 mi on 1 gal) is left out');

  // ---- gas charges in the budget: gas stations only, not rides or transit, not ones already used or skipped
  const data = {
    config: { categories: [{ name: 'Groceries', budget: 400 }, { name: 'Gas & Auto', budget: 250 }], bills: [{ name: 'Car Payment', amount: 300, day: 20, ends: '2027-03' }, { name: 'Car insurance', amount: 150, day: 10 }] },
    months: {
      '2026-07': { transactions: [{ id: 't1', date: '2026-07-20', desc: 'Shell', category: 'Gas & Auto', amount: 40 }, { id: 't2', date: '2026-07-21', desc: 'Parking', category: 'Gas & Auto', amount: 20 }, { id: 't3', date: '2026-07-22', desc: 'Uber', category: 'Gas & Auto', amount: 30 }] },
      '2026-08': { transactions: [{ id: 't4', date: '2026-08-10', desc: 'Sunoco', category: 'Gas & Auto', amount: 45 }, { id: 't5', date: '2026-08-11', desc: 'E-ZPass tolls', category: 'Gas & Auto', amount: 25 }, { id: 't6', date: '2026-08-12', desc: 'Subway (OMNY)', category: 'Gas & Auto', amount: 34 }, { id: 't7', date: '2026-08-13', desc: 'Trader Joe’s', category: 'Groceries', amount: 60 }] },
      '2026-09': { transactions: [{ id: 't8', date: '2026-09-20', desc: '7-Eleven', category: 'Gas & Auto', amount: 38 }, { id: 't9', date: '2026-09-21', desc: 'USA Gas', category: 'Gas & Auto', amount: 41 }, { id: 't10', date: '2026-09-22', desc: 'Car wash', category: 'Gas & Auto', amount: 15 }] },
    },
  };
  check(F.kindOf('Shell') === 'fuel' && F.kindOf('USA Gas') === 'fuel' && F.kindOf('Uber') === 'transit' && F.kindOf('LIRR eTix') === 'transit' && F.kindOf('Car wash') === 'car' && F.kindOf('Tesla Supercharger') === 'fuel' && F.kindOf('Subway (OMNY)') === 'transit', 'charges sort into fuel, transit and other car costs');
  let pend = F.pendingCharges(a, data, today).map((t) => t.id);
  check(pend.join() === 't9,t8,t4', `gas charges waiting for gallons, newest first, last 60 days (${pend.join()})`);
  F.addFill(a, { date: '2026-09-21', qty: 11.5, cost: 41, txId: 't9', full: true });
  F.skipCharge(a, 't8');
  pend = F.pendingCharges(a, data, today).map((t) => t.id);
  check(pend.join() === 't4', 'a charge turned into a fill-up, or skipped, leaves the list');

  // ---- tires: straight-line wear from new (original tires) through the readings
  a = base();
  check(A.tireState(a, today).status === 'none', 'tires: no reading yet');
  A.addTread(a, { date: '2026-09-01', miles: 46000, tread: 5 });
  let t = A.tireState(a, today);
  // 10/32 at 0 mi to 5/32 at 46,000: 1/32 per 9,200 mi, so 4/32 at 55,200
  check(t.status === 'ok' && Math.abs(t.milesLeft - (55200 - A.milesOn(a, today))) <= 1, `tires: 5/32" wears to 4/32" in ~${t.milesLeft} mi`);
  A.addTread(a, { date: '2026-09-20', miles: 46500, tread: 4 });
  check(A.tireState(a, today).status === 'soon' && /time for new tires/.test(A.tireState(a, today).text), 'tires: 4/32" means time for new ones');
  A.addTread(a, { date: '2026-09-25', miles: 46600, tread: 2 });
  check(A.tireState(a, today).status === 'over' && /legal minimum/.test(A.tireState(a, today).text), 'tires: 2/32" is replace-now');
  // new tires logged at a service reset the history
  A.logService(a, { date: '2026-09-26', miles: 46650, items: ['tires'], cost: 700 });
  t = A.tireState(a, today);
  check(a.tires.installed === '2026-09' && a.tires.installedMiles === 46650 && t.status === 'none' && t.readings.length === 0, 'tires: new tires start fresh');
  const sid = a.service[a.service.length - 1].id;
  A.removeService(a, sid);
  check(a.tires.installed === '' && a.tires.installedMiles === null && A.tireState(a, today).status === 'over', 'tires: removing that service puts the old tires back');
  const old = A.normalizeAuto({ car: { boughtMonth: '2019-06' }, odo: [{ date: '2026-09-01', miles: 30000 }] });
  A.addTread(old, { date: '2026-09-01', miles: 30000, tread: 7 });
  check(A.tireState(old, today).status === 'soon' && /6 years/.test(A.tireState(old, today).text), 'tires: 7 years old gets a look even with tread left');

  // ---- brakes: per axle, replacements reset, measurements from a service
  a = base();
  A.logService(a, { date: '2026-06-01', miles: 43000, items: ['padsF'], padR: 6 });
  let b = A.brakeState(a, today);
  check(b.axles[0].last.front === 10 && b.axles[0].last.repl === 'front' && b.axles[1].v === 6 && b.status === 'ok', 'brakes: new front pads and a rear reading from one visit');
  A.addPads(a, { date: '2026-09-01', miles: 46000, front: 8, rear: 3 });
  b = A.brakeState(a, today);
  // front: 10 mm at 43,000 to 8 mm at 46,000 is 2 mm per 3,000 mi, so 3 mm at 53,500
  check(b.axles[1].status === 'soon' && b.status === 'soon' && Math.abs(b.axles[0].milesLeft - (53500 - A.milesOn(a, today))) <= 1, `brakes: rear at 3 mm is due; front wears 2 mm per 3,000 mi (${b.axles[0].milesLeft} mi to 3 mm)`);
  check(!A.addPads(a, { front: 'x' }) && !A.addPads(a, { rear: 40 }), 'brakes: bad readings refused');

  // ---- battery: age, tests
  a = base();
  let bt = A.batteryState(a, today);
  check(bt.status === 'soon' && /5 years old/.test(bt.text), `battery: 5 years old, test it (${bt.text})`);
  A.addBatteryTest(a, { date: '2026-09-10', result: 'good' });
  check(A.batteryState(a, today).status === 'ok' && /tested good/.test(A.batteryState(a, today).text), 'battery: a good test this year settles it');
  A.addBatteryTest(a, { date: '2026-09-20', result: 'weak' });
  check(A.batteryState(a, today).status === 'soon', 'battery: weak means replace soon');
  A.logService(a, { date: '2026-09-25', miles: 46400, items: ['battery'] });
  check(A.batteryState(a, today).status === 'ok' && A.batteryState(a, today).month === '2026-09', 'battery: a new one resets age and old tests');
  check(A.batteryState(A.normalizeAuto({ car: { make: 'Tesla', model: 'Model Y' } }), today) === null, 'battery: not tracked for the Tesla');

  // ---- the next visit
  a = base();
  A.addTread(a, { date: '2026-09-01', miles: 46000, tread: 4 });
  const plan = A.visitPlan(a, [{ id: '26V001000' }], today);
  const ids = plan.items.map((x) => x.id);
  check(ids.includes('tires') && ids.includes('battery') && ids.includes('recalls') && plan.log.every((x) => ids.includes(x)), `visit: tires, battery test, recall check (${ids.join()})`);
  check(plan.items.findIndex((x) => x.status === 'over') <= 0 && plan.items.every((x, i, l) => !i || ['over', 'soon', 'near'].indexOf(l[i - 1].status) <= ['over', 'soon', 'near'].indexOf(x.status)), 'visit: most urgent first');
  const txt = A.visitText(a, plan, today);
  check(/^2021 Nissan Altima SL AWD, about/.test(txt) && /Engine oil: 0W-20/.test(txt) && /- Tires/.test(txt), 'visit: text to show the shop, with specs');
  // specs: your own values win, blank goes back to the car's
  A.setSpec(a, 'psi', '35 psi');
  check(A.specsOf(a).find((s) => s.id === 'psi').value === '35 psi' && A.specsOf(a).find((s) => s.id === 'psi').changed, 'specs: your value');
  A.setSpec(a, 'psi', '');
  check(!a.specs.psi && /33 psi/.test(A.specsOf(a).find((s) => s.id === 'psi').value), 'specs: blank goes back');

  // ---- alerts on Home
  const al = A.autoAlerts(a, null, [], today);
  check(al.some((x) => /Time for new tires/.test(x.text)) && al.some((x) => /Battery is 5 years old/.test(x.text)) && al.every((x, i) => !i || !(x.tone === 'over' && al[i - 1].tone === 'soon')), `alerts: tires and battery, overdue first (${al.map((x) => x.text).join(' | ')})`);

  // ---- cost of ownership
  a = base();
  const sp = C.carSpend(a, data, today);
  check(sp.months === 2 && sp.fuel === (40 + 45) / 2 && sp.car === (20 + 25) / 2 && sp.transit === (30 + 34) / 2, `spend: two complete months, fuel/car/transit split (${JSON.stringify(sp)})`);
  A.logService(a, { date: '2026-08-11', miles: 45500, items: ['oil'], cost: 25 }); // same day and amount as the E-ZPass charge: treated as already in the budget
  A.logService(a, { date: '2026-07-05', miles: 44000, items: ['rotate'], cost: 30, budgeted: false });
  check(C.carSpend(a, data, today).car === (20 + 25 + 30) / 2, 'spend: a service kept out of the budget counts once; one already there isn’t doubled');
  const own = C.ownership(a, data, today);
  const names = own.lines.map((l) => l.id).join();
  check(names === 'loan,insurance,fuel,upkeep' && Math.abs(own.total - (300 + 150 + 42.5 + 37.5)) < 0.01, `ownership: ${names} = ${own.total}`);
  check(own.afterPayoff && own.afterPayoff.from === '2027-04' && Math.abs(own.afterPayoff.total - (own.total - 300)) < 0.01 && own.perMile > 0.4, 'ownership: after the last payment, and per mile');

  // ---- keep vs replace
  check(Math.abs(C.payment(30000, 6, 60) - 579.98) < 0.01 && C.payment(12000, 0, 48) === 250, 'loan payment math');
  a = base();
  A.addTread(a, { date: '2026-09-01', miles: 46000, tread: 4 });
  let kr = C.keepVsReplace(a, data, today);
  check(kr.replace === null && kr.jobs.some((j) => j.id === 'tires' && j.price === null) && kr.jobs.some((j) => j.id === 'battery' && j.price === 245) && kr.unpriced.length === 1, 'keep: big jobs coming, the tires need a quote');
  C.setPrice(a, 'tires', '720');
  C.setNext(a, 'price', '32,000');
  C.setNext(a, 'down', 2000);
  C.setNext(a, 'tradeIn', 10000);
  C.setNext(a, 'apr', 5.9);
  C.setNext(a, 'term', 60);
  C.setNext(a, 'mpg', 60);
  kr = C.keepVsReplace(a, data, today);
  check(kr.unpriced.length === 0 && Math.abs(kr.keep.jobs - (720 + 245) / 12) < 0.01, 'keep: with a tire quote');
  // $32,000 less $2,000 down, and the $10,000 trade-in after it pays off the $1,800 (6 × $300) left on this car
  check(kr.owed === 1800 && kr.replace.financed === 21800 && Math.abs(kr.replace.payment - C.payment(21800, 5.9, 60)) < 0.01 && Math.abs(kr.replace.fuel - kr.keep.fuel / 2) < 0.01, `replace: financed after down and the trade-in's equity; twice the mileage, half the gas (${kr.owed}, ${kr.replace.financed})`);
  a.loan.balance = 1500;
  check(C.keepVsReplace(a, data, today).replace.financed === 21500, 'replace: a loan balance you entered is what the trade-in pays off');
  a.loan.balance = null;
  check(Math.abs(kr.keep.payment - (6 * 300) / 12) < 0.01 && Math.abs(kr.diff - (kr.replace.total - kr.keep.total)) < 0.001, 'keep: six payments left in the next year, spread over it');

  // ---- next-car fund
  a = base();
  check(C.fundPlan(a, data, today) === null, 'fund: nothing without a target');
  C.setFund(a, 'target', 10000);
  C.setFund(a, 'saved', 4000);
  C.setFund(a, 'monthly', 500);
  let fp = C.fundPlan(a, data, today);
  check(fp.need === 6000 && fp.by === '2027-09-01' && fp.payoff.from === '2027-04' && fp.payoff.by < fp.by, `fund: 12 months at $500, sooner with the payment added (${fp.by}, ${fp.payoff.by})`);
  C.setFund(a, 'saved', 10000);
  check(C.fundPlan(a, data, today).done, 'fund: reached');

  // ---- watch list and CarPlay Ultra
  const w = C.addWatch(a, { name: '2027 Kia EV4', price: '$41,000', mpg: '' });
  check(w && w.price === 41000 && w.mpg === null && C.ultraFor(w.name).status === 'soon' && C.ultraFor('2026 Nissan Rogue').status === 'later' && C.ultraFor('Honda Civic').brand === 'Honda' && C.ultraFor('Toyota Camry') === null, 'watch list: CarPlay Ultra status by brand');
  C.compareWith(a, w.id);
  check(a.next.price === 41000 && a.next.comparing === w.id, 'compare puts the price in the comparison');
  C.setNext(a, 'price', 30000);
  check(a.next.comparing === null, 'changing the price by hand stops pointing at the watched car');
  C.removeWatch(a, w.id);
  check(a.next.watch.length === 0 && C.addWatch(a, { name: '  ' }) === null, 'watch list: remove, and a blank name is refused');
  check(C.ULTRA.filter((u) => u.status === 'now').length === 1 && C.ULTRA.length === 13, 'CarPlay Ultra: one brand shipping, 13 in all');

  // ---- edge cases
  check(F.kindOf('Gas') === 'fuel' && F.kindOf('Costco') === 'fuel' && F.kindOf('Mobil 1 Lube Express') === 'car' && F.kindOf('Getty Auto Repair') === 'car' && F.kindOf('E-ZPass tolls') === 'car', 'a bare “Gas” is gas; a shop at a station brand is upkeep');
  a = base();
  F.addFill(a, { date: '2026-08-11', qty: 7, cost: 25, txId: 't5' }); // the “E-ZPass” charge, logged as a fill-up
  const sp2 = C.carSpend(a, data, today);
  check(sp2.fuel === (40 + 45 + 25) / 2 && sp2.car === 20 / 2, 'a charge logged as a fill-up counts as gas, whatever it’s called');
  a = base();
  A.setInstalled(a, 'tires', '2024-06', '20,000');
  A.addTread(a, { date: '2025-06-01', miles: 30000, tread: 7 }); // new at 20,000, 7/32 at 30,000: 4/32 at 40,000, and no reading since
  const tp = A.tireState(a, today);
  check(tp.milesLeft === 0 && tp.status === 'soon' && /probably near 4\/32" by now/.test(tp.text) && A.autoAlerts(a, null, [], today).some((x) => /measure them/.test(x.text)) && C.bigJobs(a, today).some((j) => j.id === 'tires' && j.why === 'probably due now'), 'tires: past the estimate with no new reading says to measure, never negative miles');
  A.addPads(a, { date: '2026-09-01', miles: 46000, front: 25, rear: 5 });
  const pr = a.brakes.readings[a.brakes.readings.length - 1];
  check(pr.front === undefined && pr.rear === 5, 'brakes: an impossible front reading is dropped, the rear kept');
  A.addBatteryTest(a, { date: '2025-03-01', result: 'good' });
  check(A.batteryState(a, today).test === null && A.batteryState(a, today).status === 'soon', 'battery: a test over a year old doesn’t count');
  A.logService(a, { date: '2026-06-01', items: ['rotate'] }); // no mileage given
  const rot = A.maintenance(a, today).find((m) => m.id === 'rotate');
  check(rot.dueMiles === A.milesOn(a, '2026-06-01') + 5000, 'a service with no mileage counts from the estimate for that day');
  const w2 = C.addWatch(a, { name: 'Car A', price: 30000, mpg: 40 });
  const w3 = C.addWatch(a, { name: 'Car B', price: 32000 });
  C.compareWith(a, w2.id);
  C.compareWith(a, w3.id);
  check(a.next.price === 32000 && a.next.mpg === null, 'comparing a car without a mileage clears the last one’s');
  const open = { ...data, config: { ...data.config, bills: [{ name: 'Car Payment', amount: 300, day: 20, ends: '' }, { name: 'Car insurance', amount: 150, day: 10 }] } };
  const o2 = C.ownership(base(), open, today);
  check(o2.lines[0].id === 'loan' && /Charges on the 20th/.test(o2.lines[0].note) && o2.afterPayoff === null && C.keepVsReplace(base(), open, today).keep.payment === 300, 'a car payment with no end date still counts');

  // ---- electric: charging sessions and mi/kWh
  const ev = A.normalizeAuto({ car: { year: 2024, make: 'Tesla', model: 'Model Y', boughtMonth: '2024-03' }, odo: [{ date: '2026-09-01', miles: 28000 }] });
  F.addFill(ev, { date: '2026-09-02', miles: 28000, qty: 40, cost: 16 });
  F.addFill(ev, { date: '2026-09-09', miles: 28140, qty: 40, cost: 16 });
  F.addFill(ev, { date: '2026-09-16', miles: 28300, qty: 45, cost: 18, full: false });
  const es = F.fuelStats(ev, today);
  check(es.electric && es.segs.length === 2 && Math.abs(es.eff - 300 / 85) < 0.001 && A.unitsOf(ev.car).eff === 'mi/kWh', `electric: every charge counts, ${es.eff.toFixed(2)} mi/kWh`);
}
