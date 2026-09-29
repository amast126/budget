// Node checks for the Budget tab's rules and the phone-alerts job, on a made-up budget (no real data here).
import crypto from 'node:crypto';
import * as C from '../src/budget-core.js';
import * as I from '../src/budget-insights.js';
import { parseAddLink } from '../src/budget-insights.js';
import { run as runAlerts, localDay } from '../scripts/budget-alerts.mjs';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// A small made-up budget around a given "today".
export function sampleBudget(today) {
  const d = C.seedBudget();
  const cur = today.slice(0, 7);
  d.config.incomes = [{ id: 'inc', name: 'Paycheck', biweekly: 2000 }];
  d.config.savings = [
    { id: 's1', name: 'Savings', biweekly: 200, starts: '', ends: C.addMonths(cur, 2) },
    { id: 's2', name: 'Savings', biweekly: 400, starts: C.addMonths(cur, 3), ends: '' },
  ];
  d.config.payAnchor = today; // payday today
  d.config.categories = [
    { id: 'c1', name: 'Groceries', budget: 400 },
    { id: 'c2', name: 'Dining & Drinks', budget: 200 },
    { id: 'c3', name: 'Misc Discretionary', budget: 100 },
  ];
  const tomorrow = C.addDays(today, 1);
  d.config.bills = [
    { id: 'rent', name: 'Rent', category: 'Housing', amount: 1000, share: 1, card: false, day: '', starts: '', ends: '' },
    { id: 'net', name: 'Test Internet', category: 'Utilities', amount: 80, share: 0.5, card: true, day: 1, starts: '', ends: '' },
    { id: 'tmr', name: 'Phone Plan', category: 'Utilities', amount: 45, share: 1, card: true, day: Number(tomorrow.slice(8, 10)), starts: '', ends: '' },
    { id: 'lap', name: 'Laptop installment', category: 'Installments', amount: 100, share: 1, card: true, day: 31, starts: '', ends: C.addMonths(cur, 4) },
    { id: 'tv1', name: 'TV Plus (previous plan)', category: 'Subscriptions', amount: 15, share: 1, card: true, day: 20, starts: '', ends: cur },
    { id: 'tv2', name: 'TV Plus', category: 'Subscriptions', amount: 8, share: 1, card: true, day: 20, starts: C.nextMonth(cur), ends: '' },
    { id: 'gone', name: 'Old Music', category: 'Subscriptions', amount: 11, share: 1, card: true, day: 3, starts: '', ends: C.addMonths(cur, -2) },
  ];
  d.config.roommates = [{ id: 'r1', name: 'Sam', venmo: '@sam-test' }];
  d.months = {};
  for (let i = -4; i <= 0; i++) {
    const k = C.addMonths(cur, i);
    d.months[k] = C.emptyMonth();
    const t = (day, desc, category, amount, method = 'Apple Pay') => d.months[k].transactions.push({ ...C.newTxn({ date: `${k}-${pad(day)}`, desc, category, amount, method }), id: `${k}-${desc}-${day}` });
    t(1, 'StreamCo Plus', 'Misc Discretionary', i === 0 ? 11.99 : 9.99, 'Apple Card');
    if (i < 0) {
      t(12, 'Testville Pizza', 'Dining & Drinks', 18.4);
      t(14, 'Green Grocer', 'Groceries', 90 + i);
      t(15, 'Green Grocer', 'Groceries', 60);
    }
  }
  // this month: groceries over budget, dining under
  d.months[cur].transactions.push({ ...C.newTxn({ date: `${cur}-01`, desc: 'Green Grocer', category: 'Groceries', amount: 410, method: 'Debit Card' }), id: 'big-shop' });
  d.savings = { balance: 5000, asOf: today, apy: 4, entries: [] };
  d.card = { balance: 300, asOf: today, apr: 24, limit: 5000, lastInterest: 0 };
  d.portfolio = { holdings: [{ id: 'h1', ticker: 'TEST', shares: 10, basis: 500 }], cash: 100, quotes: { TEST: { price: 60, change: 1, change_pct: 1.7 } }, refreshedAt: '' };
  return C.normalizeBudget(d);
}

export async function budgetUnit(check) {
  const now = new Date();
  // keep the made-up month clear of the edges so "day 1 has passed" and "tomorrow is this month" both hold
  if (now.getDate() >= 28 || now.getDate() < 10) now.setDate(15);
  const today = ymd(now);
  const cur = today.slice(0, 7);
  const d = sampleBudget(today);

  // merchants and adding
  const idx = I.merchantIndex(d);
  const sug = I.suggestMerchants(idx, 'testv', 5, today);
  check(sug[0] && sug[0].name === 'Testville Pizza' && sug[0].category === 'Dining & Drinks' && sug[0].amount === 18.4, `merchant memory: “testv” → ${sug[0] && `${sug[0].name}, ${sug[0].category}, ${sug[0].amount}`}`);
  check(I.cleanMerchant('TST* TESTVILLE PIZZA 0042') === 'Testville Pizza' && I.matchMerchant(idx, 'TESTVILLE PIZZA #123').name === 'Testville Pizza', 'statement names are cleaned and matched to what you’ve logged');
  const link = parseAddLink('#/add?amount=%2412.34&merchant=Testville%20Pizza');
  check(link.amount === 12.34 && link.merchant === 'Testville Pizza', 'the Apple Pay link is read (amount with a $ sign, merchant)');

  // the Apple Card CSV
  const csv = [
    'Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD),Purchased By',
    `${cur.slice(5)}/02/${cur.slice(0, 4)},${cur.slice(5)}/03/${cur.slice(0, 4)},"TESTVILLE PIZZA 0042 NEW YORK, NY",Testville Pizza,Restaurants,Purchase,14.25,Test Person`,
    `${cur.slice(5)}/03/${cur.slice(0, 4)},${cur.slice(5)}/04/${cur.slice(0, 4)},ZZTOP GADGETS ONLINE,Zztop Gadgets,Shopping,Purchase,49.99,Test Person`,
    `${cur.slice(5)}/01/${cur.slice(0, 4)},${cur.slice(5)}/02/${cur.slice(0, 4)},STREAMCO PLUS,StreamCo Plus,Other,Purchase,11.99,Test Person`,
    `${cur.slice(5)}/01/${cur.slice(0, 4)},${cur.slice(5)}/02/${cur.slice(0, 4)},TEST INTERNET CO,Test Internet,Utilities,Purchase,84.50,Test Person`,
    `${cur.slice(5)}/04/${cur.slice(0, 4)},${cur.slice(5)}/04/${cur.slice(0, 4)},ACH DEPOSIT INTERNET TRANSFER,Payment,Payment,Payment,-500.00,Test Person`,
  ].join('\n');
  const st = I.parseStatement(csv);
  check(st.format === 'apple' && st.rows.length === 5 && st.rows[0].desc === 'TESTVILLE PIZZA 0042 NEW YORK, NY', 'Apple Card CSV parsed (quoted commas too)');
  const plan = I.planImport(d, st.rows);
  const by = (a) => plan.items.filter((x) => x.action === a);
  check(plan.counts.add === 2 && plan.counts.duplicate === 1 && plan.counts.bill === 1 && plan.counts.skip === 1, `import plan: ${JSON.stringify(plan.counts)}`);
  const pizza = by('add').find((x) => /Testville/.test(x.txn.desc));
  const gadget = by('add').find((x) => /Zztop/.test(x.txn.desc));
  check(pizza.known && pizza.txn.category === 'Dining & Drinks' && !gadget.known && gadget.txn.category === 'Misc Discretionary' && plan.unknown === 1, 'a known merchant gets its usual category; a new one is flagged');
  check(by('bill')[0].bill.id === 'net' && by('bill')[0].override === 84.5, 'a bill charge is recognized and its real amount noted');
  const d2 = JSON.parse(JSON.stringify(d));
  const res = I.applyImport(d2, plan.items);
  const again = I.planImport(d2, st.rows);
  check(res.added === 2 && res.billed === 1 && d2.months[cur].amounts.net === 84.5 && again.counts.add === 0 && by('add').every((x) => again.items.find((y) => y.ext === x.ext).reason === 'Imported before'), 'import adds once; the same file again adds nothing');

  // search, merchants, trends, subscriptions
  check(I.searchTxns(d, 'testville').length === 4 && I.searchTxns(d, '18.40').length === 4 && I.searchTxns(d, 'grocer groceries').length >= 8, 'search: words and amounts, across months');
  const mh = I.merchantHistory(d, 'Testville Pizza', today);
  check(mh.count === 4 && Math.abs(mh.total - 73.6) < 0.01 && Object.keys(mh.byMonth).length === 4, 'merchant history');
  const subs = I.findSubscriptions(d, today);
  const sc = subs.active.find((s) => s.name === 'StreamCo Plus');
  const tv = subs.active.find((s) => /TV Plus/.test(s.name));
  check(sc && sc.priceUp === 9.99 && tv && tv.changesTo && tv.changesTo.amount === 8 && subs.stopped.some((s) => s.name === 'Old Music'), `subscriptions: price rise, a new rate, a cancelled one (saves ${Math.round(subs.savedYearly)}/yr)`);
  const tr = I.categoryTrends(d, today);
  check(tr.keys.length === 5 && tr.callouts.some((c) => c.name === 'Groceries' && c.diff > 0), 'trends: five months, and Groceries is running ahead of usual');

  // paycheck, milestones, net worth
  const pv = I.paycheckView(d, today);
  check(pv.start === today && pv.income === 2000 && pv.savings === 200 && pv.upcoming.length === 6 && pv.bills.some((b) => b.bill.id === 'tmr'), `paycheck view: from ${pv.start}, ${pv.bills.length} bills, ${Math.round(pv.spendable)} to spend`);
  const ms = I.milestones(d, today);
  check(ms.some((m) => m.kind === 'bill' && /Laptop/.test(m.title) && m.frees === 100) && ms.some((m) => m.kind === 'savings' && /400/.test(m.title)) && !ms.some((m) => /TV Plus/.test(m.title)), 'milestones: an installment ending, a savings step, and a new rate isn’t an ending');
  const nw = I.netWorth(d, { today });
  check(Math.abs(nw.stocks - 700) < 0.01 && nw.savings >= 5000 && nw.card >= 300, `net worth parts: savings ${Math.round(nw.savings)}, stocks ${nw.stocks}, card ${Math.round(nw.card)}`);
  const d3 = JSON.parse(JSON.stringify(d));
  I.recordNetWorth(d3, nw, today);
  check(d3.netWorth[cur].at === today && d3.netWorth[cur].total === C.round2(nw.total), 'a net worth reading is kept per month');

  // roommates and Venmo
  const dues = I.roommateDues(d, cur, today);
  check(dues[0].owed === 40 && dues[0].bills[0].bill.id === 'net' && dues[0].oldest === C.daysBetween(`${cur}-01`, today), 'roommate owes half the shared bill, counted from its charge day');
  const web = I.venmoLink('@sam-test', 40, 'Test Internet (May)', false);
  check(I.venmoLink('sam-test', 40, 'x', true).startsWith('venmo://paycharge?txn=charge&recipients=sam-test&amount=40.00') && /^https:\/\/venmo\.com\/\?txn=charge&recipients=sam-test&amount=40\.00&note=Test%20Internet%20\(May\)&audience=private$/.test(web), 'Venmo request links (app and web)');

  // alerts
  const al = I.computeAlerts(d, today, { ...I.DEFAULT_ALERTS }, {});
  const kinds = al.map((a) => a.key.split(':')[0]);
  check(kinds.includes('bills') && kinds.includes('budget') && kinds.includes('payday'), `alerts due: ${kinds.join(', ')}`);
  check(al.find((a) => a.key.startsWith('budget')).title === 'Groceries is over budget', 'budget alert names the category');
  const sent = Object.fromEntries(al.map((a) => [a.key, today]));
  check(I.computeAlerts(d, today, {}, sent).length === 0 && I.computeAlerts(d, today, { bills: false, budget: false, payday: false }, {}).every((a) => !/^(bills|budget|payday)/.test(a.key)), 'each alert goes out once; turned-off kinds stay quiet');
  const later = C.addDays(`${cur}-01`, 14);
  check(I.computeAlerts(d, later, { bills: false, budget: false, payday: false, monthly: false }, {}).some((a) => a.key.startsWith('roommate') && /\:14$/.test(a.key)), 'a roommate unpaid for two weeks gets a nudge');
  const first = `${C.nextMonth(cur)}-01`;
  check(I.computeAlerts(d, first, { bills: false, budget: false, payday: false, roommates: false }, {}).some((a) => a.key === `monthly:${cur}`), 'the month wrap-up on the 1st');

  // the alerts job, with stand-ins for Google, Firestore and ntfy
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { type: 'service_account', project_id: 'test-project', client_email: 'alerts@test-project.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
  const withTopic = JSON.parse(JSON.stringify(d));
  withTopic.config.alerts = { topic: 'dash-testtopic', bills: true, budget: true, payday: true, roommates: true, monthly: true, threshold: 0.9 };
  const calls = [];
  let record = null;
  let jwtOk = false;
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
  const fetchImpl = async (url, o = {}) => {
    calls.push({ url, method: o.method || 'GET', auth: (o.headers || {}).Authorization, body: o.body });
    if (url === sa.token_uri) {
      const [h, p, s] = new URLSearchParams(o.body).get('assertion').split('.');
      const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
      jwtOk = crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url')) && claims.iss === sa.client_email && /datastore/.test(claims.scope);
      return jwtOk ? reply(200, { access_token: 'tok' }) : reply(401, {});
    }
    if (url.startsWith('https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents/trackers/')) {
      if (o.headers.Authorization !== 'Bearer tok') return reply(403, {});
      if (url.endsWith('/test-doc-alerts')) {
        if (o.method === 'PATCH') {
          record = JSON.parse(JSON.parse(o.body).fields.json.stringValue);
          return reply(200, {});
        }
        return record ? reply(200, { fields: { json: { stringValue: JSON.stringify(record) } } }) : reply(404, {});
      }
      if (url.endsWith('/test-doc')) return reply(200, { fields: { json: { stringValue: JSON.stringify(withTopic) }, updatedAt: { integerValue: '1' } } });
      if (url.endsWith('/test-doc-learning')) return reply(200, { fields: { json: { stringValue: JSON.stringify(learningDoc) } } });
      return reply(404, {});
    }
    if (url === 'https://ntfy.sh') return reply(200, {});
    return reply(404, {});
  };
  // a booked exam a week out, so the Learning countdown goes out with the budget's alerts
  const learningDoc = { version: 1, hoursPerWeek: 4, plan: ['ai-901'], certs: { 'ai-901': { status: 'booked', examDate: C.addDays(today, 7) } }, log: [], prep: { 'ai-901': { skills: { 'rai-fair': 2 }, modules: {}, tests: [{ id: 't1', date: today, score: 78 }] } } };
  const logs = [];
  const at = new Date(`${today}T12:03:00`);
  const env = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa), BUDGET_DOC: 'test-doc' };
  const r1 = await runAlerts({ env, fetchImpl, now: at, log: (s) => logs.push(s) });
  const posts = calls.filter((c) => c.url === 'https://ntfy.sh');
  const exam = posts.map((p) => JSON.parse(p.body)).find((b) => /AI-901 exam in 7 days/.test(b.title));
  check(jwtOk && r1.status === 'ok' && r1.sent === al.length + 1 && posts.length === al.length + 1, `alerts job: signs in with the key, reads the budget, sends ${r1.sent} to ntfy`);
  check(exam && /#\/learning\?prep$/.test(exam.click) && /practice tests averaging 78%/.test(exam.message), `alerts job: the Learning exam countdown goes out too, opening Exam prep (${exam && exam.message})`);
  check(record && Object.keys(record.sent).length === al.length + 1 && record.lastSent === al.length + 1, 'alerts job remembers what it sent');
  const r2 = await runAlerts({ env, fetchImpl, now: at, log: (s) => logs.push(s) });
  check(r2.sent === 0 && r2.due === 0, 'a second run the same day sends nothing new');
  check(logs.every((l) => !/\$|Groceries|Sam|Test Internet|dash-testtopic/.test(l)), `the public log shows counts only: “${logs[0]}”`);
  const r3 = await runAlerts({ env: {}, fetchImpl, now: at, log: () => {} });
  check(r3.status === 'no-secret', 'without the secret it exits quietly');
  check(localDay(new Date('2026-03-01T03:00:00Z')) === '2026-02-28', 'alerts use New York’s date');
}
