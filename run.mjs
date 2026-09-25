// Headless test of the dashboard at phone and desktop width with a stand-in backend.
// Budget data: a real export (path in BUDGET_EXPORT). The budget module runs in local mode from the same data,
// so a quick-add made on the home screen can be checked inside the real budget module.
// Run: ./build.sh && BUDGET_EXPORT=/path/export.json node test/run.mjs shots/
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.resolve(process.argv[2] || 'shots');
const EXPORT = fs.readFileSync(process.env.BUDGET_EXPORT, 'utf8');
fs.mkdirSync(OUT, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/budget\/?/, '/');
  if (p === '/') p = '/index.html';
  if (p === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end('window.BUDGET_CONFIG = { firebase: { apiKey: "" }, finnhubKey: "", allowedEmails: [], ownerEmail: "", sharedDocId: "" };');
  }
  if (p === '/news.json') p = '/test/news.fixture.json';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('nf');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/budget/`;

const init = (exportJson) => {
  if (!localStorage.getItem('budget-tracker-v1')) localStorage.setItem('budget-tracker-v1', exportJson);
  if (window.top !== window) return;
  const KEY = 'budget-tracker-v1';
  const subs = new Set();
  const read = () => JSON.parse(localStorage.getItem(KEY));
  window.__DASH_BACKEND__ = {
    configured: true,
    isAllowed: () => true,
    onAuth(cb) {
      setTimeout(() => cb({ uid: 'u1', email: 'amast126@gmail.com', displayName: 'Alec Test' }), 10);
      return () => {};
    },
    signIn: async () => {},
    signOut: async () => {},
    subscribeBudget(user, cb) {
      subs.add(cb);
      setTimeout(() => cb(read()), 10);
      return () => subs.delete(cb);
    },
    subscribeModule(user, name, cb) {
      const k = 'mod:' + name;
      const fire = () => cb(localStorage.getItem(k) ? JSON.parse(localStorage.getItem(k)) : null);
      window.__modSubs = window.__modSubs || {};
      (window.__modSubs[name] = window.__modSubs[name] || new Set()).add(fire);
      setTimeout(fire, 10);
      return () => window.__modSubs[name].delete(fire);
    },
    async mutateModule(user, name, fn, init) {
      const k = 'mod:' + name;
      const d = localStorage.getItem(k) ? JSON.parse(localStorage.getItem(k)) : init();
      fn(d);
      d.updatedAt = Date.now();
      localStorage.setItem(k, JSON.stringify(d));
      (window.__modSubs[name] || []).forEach((f) => f());
    },
    async mutateBudget(user, fn) {
      const d = read();
      fn(d);
      d.updatedAt = Date.now();
      localStorage.setItem(KEY, JSON.stringify(d));
      subs.forEach((cb) => cb(JSON.parse(JSON.stringify(d))));
    },
  };
};

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(init, EXPORT);
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('budget-tracker-v1')));
const check = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) process.exitCode = 1;
};

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForSelector('.money .big');
await page.screenshot({ path: path.join(OUT, 'home.png'), fullPage: true });
const txt = await page.innerText('.main');
check(/Left to spend|Over budget by/.test(txt), 'money card renders');
check(/Next payday/.test(txt), 'payday shown');
check(/Bills this week/.test(txt), 'bills card renders');
check(/Supreme Court lets Trump/.test(txt), 'politics news renders');
const billsShown = await page.$$eval('.bill', (els) => els.map((e) => e.innerText.replace(/\n/g, ' | ')));
console.log('  bills:', billsShown);

// quick add
const before = (await stored()).months;
const key = new Date().toISOString().slice(0, 7);
const n0 = (before[key] ? before[key].transactions.length : 0);
await page.fill('input[aria-label="Amount"]', '12.50');
await page.fill('input[aria-label="Description"]', 'Test coffee');
const cats = await page.$$eval('select[aria-label="Category"] option', (o) => o.map((x) => x.textContent));
const dining = cats.find((c) => /Dining/.test(c)) || cats[0];
await page.selectOption('select[aria-label="Category"]', dining);
await page.click('button:has-text("Add expense")');
await page.waitForSelector('.toast');
const toastText = await page.innerText('.toast');
check(/Added \$12\.50/.test(toastText), `toast: ${toastText.replace(/\n/g, ' ')}`);
let after = await stored();
const added = after.months[key].transactions.slice(-1)[0];
check(after.months[key].transactions.length === n0 + 1 && added.desc === 'Test coffee' && added.amount === 12.5, 'transaction written to budget data');
check(added.method === 'Apple Pay' && added.dc === 'pending' && added.card === 'pending', `transaction flags: method=${added.method} dc=${added.dc} card=${added.card}`);
check(!!after.updatedAt && after.updatedAt > (JSON.parse(EXPORT).updatedAt || 0), 'updatedAt bumped');
await page.screenshot({ path: path.join(OUT, 'home-added.png') });

// undo
await page.click('.toast-btn');
await page.waitForTimeout(150);
after = await stored();
check(after.months[key].transactions.length === n0, 'undo removes it');

// add again for the budget-module check
await page.fill('input[aria-label="Amount"]', '7.25');
await page.fill('input[aria-label="Description"]', 'Dashboard test bagel');
await page.click('button:has-text("Add expense")');
await page.waitForSelector('.toast');

// toggle a bill
const firstBill = await page.$('.bill input[type=checkbox]');
if (firstBill) {
  const wasPaid = await firstBill.isChecked();
  await page.click('.bill input[type=checkbox]');
  await page.waitForTimeout(150);
  const nowPaid = await page.$eval('.bill input[type=checkbox]', (e) => e.checked);
  check(nowPaid === !wasPaid, `bill tick toggles (${wasPaid} → ${nowPaid})`);
  await page.click('.bill input[type=checkbox]');
  await page.waitForTimeout(150);
  const back = await page.$eval('.bill input[type=checkbox]', (e) => e.checked);
  check(back === wasPaid, 'bill tick toggles back');
} else {
  console.log('  (no bills in the next 7 days to toggle)');
}

// news: tab switch + read marks
await page.click('button.tab:has-text("Reddit")');
check(/r\/pics/.test(await page.innerText('.news')), 'reddit tab renders');
await page.click('button.tab:has-text("US politics")');
const unreadBefore = await page.$$eval('.story .dot', (d) => d.length);
await page.evaluate(() => { document.querySelector('.story').removeAttribute('target'); document.querySelector('.story').addEventListener('click', (e) => e.preventDefault()); });
await page.click('.story');
const unreadAfter = await page.$$eval('.story .dot', (d) => d.length);
check(unreadAfter === unreadBefore - 1, `read mark (${unreadBefore} → ${unreadAfter} unread)`);

// budget module
await page.click('a.nav-item:has-text("Budget")');
const frame = page.frameLocator('iframe.frame');
await frame.locator('body').waitFor();
await page.waitForTimeout(1500);
const btext = await page.frames().find((f) => /budget\.html/.test(f.url())).innerText('body');
check(/Budget Tracker|Month|Settings/.test(btext), 'budget module loads inside the app');
check(/Dashboard test bagel/.test(btext), 'quick-add shows up inside the budget module');
await page.screenshot({ path: path.join(OUT, 'budget.png') });
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.money .big');


// ---------------- learning
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.money .big');
const homeLearn = await page.innerText('.col:nth-child(2) .card');
check(/Learning/.test(homeLearn) && /AI-901/.test(homeLearn), 'Home shows the Learning card with AI-901');
await page.click('a.nav-item:has-text("Learning")');
await page.waitForSelector('.steps .step');
const stepsText = await page.$$eval('.learning .col:first-child .step .step-head', (els) => els.map((e) => e.innerText.replace(/\n/g, ' | ')));
console.log('  roadmap:', stepsText);
check(stepsText.length === 5 && /AI-901/.test(stepsText[0]) && /Studying/.test(stepsText[0]), 'roadmap has 5 steps, AI-901 studying first');
check(stepsText.every((t) => /Target \w{3} 20\d\d/.test(t)), 'every step has a target month');
await page.screenshot({ path: path.join(OUT, 'learning.png'), fullPage: true });
// log time on the current cert from the week card
await page.click('.learning .card:first-child .log-btns button:has-text("+1h")');
await page.waitForTimeout(150);
check(/1h of 4h/.test(await page.innerText('.learning .card:first-child')), 'logging +1h updates this week');
let L = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:learning')));
check(L.log.length === 1 && L.log[0].cert === 'ai-901' && L.log[0].minutes === 60, 'time log saved');
// book AI-901 for a date and check the roadmap label
await page.click('.learning .seg-btn:has-text("Exam booked")');
await page.waitForSelector('.learning input[type=date]');
const exam = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
await page.fill('.learning .cert-detail input[type=date]', exam);
await page.waitForTimeout(200);
L = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:learning')));
check(L.certs['ai-901'].status === 'booked' && L.certs['ai-901'].examDate === exam, 'exam booked with date');
check(/Exam /.test(await page.innerText('.learning .steps .step:first-child .step-head')), 'roadmap shows the exam date');
// pass AZ-104 to create a renewal
await page.click('.learning .steps .step:nth-child(2) .step-head');
await page.click('.learning .step.open .seg-btn:has-text("Passed")');
await page.waitForTimeout(200);
L = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:learning')));
check(L.certs['az-104'].status === 'passed' && !!L.certs['az-104'].expires, `AZ-104 passed, renew by ${L.certs['az-104'].expires}`);
check(/Renewals/.test(await page.innerText('.learning')), 'renewals card appears');
// add an optional cert
await page.click('.learning .col:nth-child(2) .step-head:has-text("Identity and Access")');
await page.click('button:has-text("Add to roadmap")');
await page.waitForTimeout(200);
L = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:learning')));
check(L.plan.includes('sc-300'), `SC-300 added to roadmap at position ${L.plan.indexOf('sc-300') + 1}`);
await page.screenshot({ path: path.join(OUT, 'learning-after.png'), fullPage: true });
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.money .big');
check(/exam in 20 days/.test(await page.innerText('.col:nth-child(2) .card')), 'Home learning card shows exam countdown');
await page.screenshot({ path: path.join(OUT, 'home-learning.png'), fullPage: true });

// settings sheet
await page.click('.nav-settings');
check(/Only this account/.test(await page.innerText('.sheet')), 'settings sheet');
await page.screenshot({ path: path.join(OUT, 'settings.png') });
await page.click('.sheet .btn.primary');

// desktop
const desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await desk.addInitScript(init, EXPORT);
const dp = await desk.newPage();
dp.on('pageerror', (e) => errors.push('pageerror(desktop): ' + e.message));
await dp.goto(base, { waitUntil: 'networkidle' });
await dp.waitForSelector('.money .big');
await dp.screenshot({ path: path.join(OUT, 'desktop.png') });

await browser.close();
server.close();
const real = errors.filter((e) => !/Failed to load resource|favicon|firestore|ERR_/.test(e));
check(real.length === 0, `no console errors${real.length ? ': ' + real.join(' | ') : ''}`);
