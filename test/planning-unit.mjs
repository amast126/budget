// Planning: the house (mortgage, taxes, closing costs on Long Island, renovations, affordability), the wedding
// (estimate, vendors, payments) and the two laid over a budget's savings projection. Made-up data only.
import * as P from '../src/planning-logic.js';
import * as C from '../src/budget-core.js';

export async function planningUnit(check) {
  const today = '2026-10-15';
  const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

  // a small made-up budget: $2,000 a paycheck, $300 of it saved, $900 rent, and a planned $150,000 deposit
  const budget = C.seedBudget();
  budget.config.incomes = [{ id: 'i', name: 'Pay', biweekly: 2000 }];
  budget.config.payAnchor = '2026-10-09';
  budget.config.savings = [{ id: 's', name: 'Savings', biweekly: 300, starts: '', ends: '' }];
  budget.config.bills = [
    { id: 'r1', name: 'Rent', category: 'Housing', amount: 900, share: 1, card: false, day: 1, starts: '', ends: '2026-12' },
    { id: 'r2', name: 'Rent', category: 'Housing', amount: 950, share: 1, card: false, day: 1, starts: '2027-01', ends: '' },
    { id: 'ph', name: 'Test Phone', category: 'Utilities', amount: 60, share: 1, card: false, day: 5, starts: '', ends: '' },
  ];
  budget.savings = { balance: 5000, asOf: today, apy: 3.5, entries: [], planned: [{ id: 'x', month: '2027-01', amount: 150000, note: 'Test windfall' }] };
  const view = P.budgetView(budget, today);
  check(near(view.income, (2000 * 26) / 12) && view.rentAt('2026-12') === 900 && view.rentAt('2027-01') === 950 && view.fixedAt('2027-01') === 1010, 'the plan reads take-home, rent by month and bills from the budget');
  check(view.proj.find((p) => p.key === '2027-01').balance - view.proj.find((p) => p.key === '2026-12').balance > 150000, 'and the savings projection, planned deposit included');

  // the house
  const plan = P.normalizePlanning(null);
  check(plan.share === 50 && plan.house.county === 'suffolk' && plan.house.price === 700000 && plan.house.rate === P.RATE && plan.wedding.guests === 150, 'starts from Suffolk’s median price, today’s rate, half of each, 150 guests');
  check(near(P.payment(560000, 7.4, 30), 3877.33, 0.01) && near(P.payment(120000, 0, 10), 1000, 0.001) && P.payment(0, 7, 30) === 0, 'mortgage payment (and a zero rate, and no loan)');
  const m = P.houseMonthly(plan.house);
  check(m.loan === 560000 && near(m.tax, (700000 * 0.0173) / 12, 0.01) && m.pmi === 0 && near(m.maint, 7000 / 12, 0.01) && near(m.total, m.pi + m.tax + m.ins + m.maint, 0.01), `monthly: ${Math.round(m.total)} (no PMI at 20% down)`);
  const pmiPlan = P.normalizePlanning({ house: { downPct: 10 } });
  check(P.houseMonthly(pmiPlan.house).pmi > 0, 'PMI under 20% down');
  check(near(P.houseMonthly(P.normalizePlanning({ house: { taxBill: 15000 } }).house).tax, 1250, 0.01) && near(P.houseMonthly(P.normalizePlanning({ house: { taxBill: 15000 } }).house, 700000, false).tax, (700000 * 0.0173) / 12, 0.01), 'a listing’s tax bill beats the rate (except when pricing other houses)');
  const cc = P.closingCosts(plan.house);
  const item = (re) => (cc.items.find(([l]) => re.test(l)) || [, 0])[1];
  check(near(item(/recording tax/), 4480) && item(/Mansion/) === 0 && near(item(/Owner/), 3150) && near(item(/Lender/), 728) && near(item(/escrow/), m.tax * 4, 0.01), `closing costs on Long Island: ${Math.round(cc.total)}`);
  const big = P.closingCosts({ ...plan.house, price: 1200000, eastEnd: true });
  check(big.items.some(([l, v]) => /Mansion/.test(l) && near(v, 12000)) && big.items.some(([l, v]) => /Peconic/.test(l) && near(v, 1200000 * 0.034)), 'the mansion tax at $1M and the Peconic Bay tax in East End towns');
  const away = P.closingCosts({ ...plan.house, county: 'other', price: 1200000, eastEnd: true });
  check(!away.items.some(([l]) => /recording tax|Mansion|Peconic/.test(l)), 'New York’s taxes don’t apply somewhere else');
  P.setCounty(plan, 'nassau');
  check(plan.house.county === 'nassau' && plan.house.taxRate === P.COUNTIES.nassau.tax, 'switching county switches the tax rate');
  P.setCounty(plan, 'suffolk');

  // renovations: now or later
  P.setHouse(plan, { buyMonth: '2028-03' });
  P.addReno(plan, { id: 'k', name: 'Test kitchen', cost: 30000, month: '' });
  P.addReno(plan, { id: 'b', name: 'Test bath', cost: 20000, month: '2028-09' });
  const cash = P.cashToBuy(plan.house);
  check(cash.renos === 30000 && near(cash.total, 140000 + cc.total + 30000, 0.01) && P.renosLater(plan.house).map((r) => r.id).join() === 'b', 'cash to buy: down payment, closing, and the renovation done right away (the later one waits)');

  // the wedding
  const w0 = P.weddingCosts(plan.wedding);
  check(near(w0.sub, 230 * 150 + 31000) && near(w0.cushion, w0.sub * 0.05) && w0.paid === 0, `wedding estimate at 150 guests: ${Math.round(w0.total)} (near the Long Island average)`);
  P.setWedding(plan, { date: '2027-10-16', guests: 100 });
  P.addVendor(plan, { id: 'v', name: 'Test Venue', cat: 'venue', total: 30000 });
  P.addPayment(plan, 'v', { id: 'p1', due: '2026-11-01', amount: 5000, note: 'Deposit' });
  P.addPayment(plan, 'v', { id: 'p2', due: '2027-09-15', amount: 25000, note: 'Final' });
  const w1 = P.weddingCosts(plan.wedding);
  const venue = w1.rows.find((r) => r.id === 'venue');
  check(venue.booked === 30000 && venue.use === 30000 && near(w1.cushion, 31000 * 0.05), 'a booked vendor replaces the estimate, and the cushion only covers what isn’t booked');
  P.togglePaid(plan, 'v', 'p1');
  const w2 = P.weddingCosts(plan.wedding);
  check(w2.paid === 5000 && near(w2.left, w2.total - 5000) && P.unpaidPayments(plan.wedding).map((p) => p.id).join() === 'p2', 'marking a payment paid');
  P.setWedding(plan, { family: 10000 });
  check(near(P.weddingCosts(plan.wedding).left, w2.total - 15000), 'family money comes off the top');

  // the two together
  const outs = P.outflows(plan, today);
  const wed = outs.filter((o) => o.kind === 'wedding');
  const house = outs.find((o) => o.kind === 'house');
  const left = P.weddingCosts(plan.wedding).left;
  check(wed.find((o) => o.key === '2027-09').amount === 12500 && near(wed.find((o) => o.key === '2027-10').amount, (left - 25000) / 2) && near(house.amount, cash.total / 2) && outs.find((o) => o.kind === 'reno').key === '2028-09', 'what comes out: your half of each payment by its month, the rest in the wedding month, the house, then the later renovation');
  const t = P.timeline(plan, view, today);
  const jan = t.rows.find((r) => r.key === '2027-01');
  const oct = t.rows.find((r) => r.key === '2027-10');
  check(jan.after === jan.saved && oct.saved - oct.after > 12500 && t.rows[t.rows.length - 1].key === '2029-09', 'the timeline subtracts the plans as they happen and runs a year past the last one');
  const buy = t.rows.find((r) => r.key === '2028-03');
  check(near(buy.reserve, 3 * (1010 - 950 + P.houseMonthly(plan.house).total / 2), 0.01) && near(t.rows.find((r) => r.key === '2027-06').reserve, 3 * 1010, 0.01), 'the cushion: three months of bills, with the house in place of rent after you buy');
  check(t.ok && t.low && t.low.key >= '2027-09', `both fit with the windfall (lowest ${Math.round(t.low.after)} in ${t.low.key})`);
  P.setHouse(plan, { price: 2400000 });
  const t2 = P.timeline(plan, view, today);
  check(!t2.ok && t2.worst.key >= '2028-03' && t2.short > 0, `a $2.4M house doesn’t: short ${Math.round(t2.short)} in ${t2.worst && t2.worst.key}`);
  P.setHouse(plan, { price: 700000 });
  const eb = P.earliestBuy(plan, view, today);
  check(eb === '2027-01', `earliest buy month at $700k: ${eb} (when the windfall lands)`);
  const noWindfall = P.budgetView({ ...budget, savings: { ...budget.savings, planned: [] } }, today);
  const eb2 = P.earliestBuy(plan, noWindfall, today);
  check(eb2 === null || eb2 > '2028-03', `without it: ${eb2 || 'not within six years'}`);
  const a = P.affordability(plan, view, today);
  check(a.byMonthly > 0 && near(P.houseMonthly(plan.house, a.byMonthly, false).total * 0.5, a.cap, 20) && a.byCash > a.byMonthly && a.limit === 'monthly' && a.price === a.byMonthly, `affordability: ${a.byMonthly} by the monthly cost, ${a.byCash} by cash`);
  const tight = P.affordability({ ...plan, house: { ...plan.house, buyMonth: '2026-12' } }, view, today);
  check(tight.limit === 'cash' && tight.byCash < tight.byMonthly, `before the windfall, cash is the limit (${tight.byCash})`);
  check(P.whenText('2027-10', today) === 'in 12 months' && P.whenText('2029-01', today) === 'in 2 years 3 months' && P.whenText('2026-10', today) === 'this month', 'when, in words');

  // the document
  const n = P.normalizePlanning({ share: 40, house: { renos: [{ id: 'z', name: 'Test', cost: 5 }, null] }, wedding: { cats: { photo: 9000 }, vendors: [{ id: 'q', name: 'Test DJ', cat: 'music', total: 2000, payments: [null, { id: 'pp', amount: 500 }] }] } });
  check(n.share === 40 && P.shareOf(n) === 0.4 && n.house.renos.length === 1 && n.house.price === 700000 && n.wedding.cats.photo === 9000 && n.wedding.cats.venue === 230 && n.wedding.vendors[0].payments.length === 1 && n.wedding.vendors[0].payments[0].paid === false, 'normalize fills in defaults and drops junk');
  P.removePayment(plan, 'v', 'p2');
  P.removeVendor(plan, 'v');
  P.removeReno(plan, 'k');
  check(!plan.wedding.vendors.length && plan.house.renos.map((r) => r.id).join() === 'b', 'remove a payment, a vendor and a renovation');
}
