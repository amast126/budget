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
  if (p === '/recipes.json' && process.env.RECIPES_FIXTURE) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(fs.readFileSync(process.env.RECIPES_FIXTURE));
  }
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

// Stand-in Open-Meteo responses: a forecast built around the current hour, and a place search.
const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
function forecastFixture(lat) {
  const now = new Date();
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const times = Array.from({ length: 48 }, (_, i) => localISO(new Date(day0.getTime() + i * 3600e3)));
  const base = lat > 40.7 ? 68 : 71; // a different place gives different numbers
  return {
    timezone: 'America/New_York',
    current: { time: localISO(now), temperature_2m: base - 0.1, apparent_temperature: base - 9, weather_code: 3, is_day: 1, wind_speed_10m: 20, wind_gusts_10m: 35, relative_humidity_2m: 45 },
    hourly: {
      time: times,
      temperature_2m: times.map((_, i) => base - Math.abs(14 - (i % 24)) / 2),
      precipitation_probability: times.map((_, i) => (i % 24 >= 17 && i % 24 <= 20 ? 55 : 10)),
      weather_code: times.map((_, i) => (i % 24 >= 17 && i % 24 <= 20 ? 63 : 2)),
      is_day: times.map((_, i) => (i % 24 >= 7 && i % 24 < 19 ? 1 : 0)),
    },
    daily: { time: [times[0].slice(0, 10), times[24].slice(0, 10)], weather_code: [63, 1], temperature_2m_max: [base + 0.5, 70], temperature_2m_min: [55.7, 54], precipitation_probability_max: [55, 5], sunrise: [`${times[0].slice(0, 10)}T06:43`, `${times[24].slice(0, 10)}T06:44`], sunset: [`${times[0].slice(0, 10)}T18:45`, `${times[24].slice(0, 10)}T18:43`], uv_index_max: [3.9, 5] },
  };
}
const weatherCalls = [];
async function mockWeather(context) {
  await context.route('https://api.open-meteo.com/**', (route) => {
    const lat = Number(new URL(route.request().url()).searchParams.get('latitude'));
    weatherCalls.push(lat);
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(forecastFixture(lat)) });
  });
  await context.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ name: 'Brooklyn', admin1: 'New York', admin2: 'Kings', country: 'United States', country_code: 'US', latitude: 40.6501, longitude: -73.94958 }] }) })
  );
}

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(init, EXPORT);
await mockWeather(ctx);
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
check(!/Supreme Court lets Trump/.test(txt) && !/Mark all read/.test(txt), 'news is off the home screen');
// weather + to-do on Home, in phone order: weather, to-do, then money
const order = await page.$$eval('.home-grid .card .card-title', (els) => els.map((e) => [e.textContent, Math.round(e.getBoundingClientRect().top)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]));
check(order[0] === 'Weather' && order[1] === 'To-do', `phone order starts ${order.slice(0, 4).join(', ')}`);
const wx = await page.innerText('.weather');
check(/Dix Hills, NY 11746/.test(wx) && /68°/.test(wx) && /H 69° \/ L 56°/.test(wx.replace(/\s+/g, ' ')), 'weather shows Dix Hills with temp and high/low');
check(/Rain today, high 69°, low 56°/.test(wx) && /Windy, gusts to 35 mph/.test(wx), `weather sentence: ${(wx.match(/Rain today[^\n]*/) || [''])[0]}`);
check((await page.$$('.wx-hour')).length >= 5, 'hourly strip for the next 12 hours');
await page.screenshot({ path: path.join(OUT, 'home-weather.png') });
await page.click('.weather .card-head .link-btn');
await page.fill('input[aria-label="Weather location"]', 'Brooklyn');
await page.click('.wx-search button[type=submit]');
await page.click('.wx-results .rc');
await page.waitForTimeout(250);
let H = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:home')));
check(H.place.name === 'Brooklyn, NY' && Math.abs(H.place.lat - 40.65) < 0.01, `location saved (${H.place.name})`);
check(/Brooklyn, NY/.test(await page.innerText('.weather')) && /71°/.test(await page.innerText('.weather')) && weatherCalls.some((l) => Math.abs(l - 40.65) < 0.01), 'weather reloads for the new place');
await page.click('.weather .card-head .link-btn');
await page.click('.wx-search button:has-text("Use Dix Hills")');
await page.waitForTimeout(250);
H = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:home')));
check(H.place.zip === '11746', 'back to the Dix Hills default');
// to-do
for (const t of ['Renew car registration', 'Call the dentist', 'Book AI-901 exam']) {
  await page.fill('input[aria-label="New to-do"]', t);
  await page.press('input[aria-label="New to-do"]', 'Enter');
  await page.waitForTimeout(100);
}
H = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:home')));
check(H.todos.length === 3 && H.todos[0].text === 'Book AI-901 exam', 'three to-dos added, newest first');
await page.click('.todo-row:has-text("Call the dentist") input[type=checkbox]');
await page.waitForTimeout(150);
check(/2 open/.test(await page.innerText('.todo')) && /Done \(1\)/.test(await page.innerText('.todo')), 'ticking one moves it to Done');
await page.click('.todo-row:has-text("Renew car registration") .x');
await page.waitForSelector('.toast');
H = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:home')));
check(H.todos.length === 2, 'delete removes it');
await page.click('.toast-btn');
await page.waitForTimeout(200);
H = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:home')));
check(H.todos.length === 3 && H.todos[2].text === 'Renew car registration', 'undo puts it back in place');
await page.click('.todo button:has-text("Clear done")');
await page.waitForTimeout(150);
H = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:home')));
check(H.todos.length === 2 && !H.todos.some((t) => t.done), 'clear done');
await page.screenshot({ path: path.join(OUT, 'home-todo.png') });

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

// news tab: sections + read marks
await page.click('a.nav-item:has-text("News")');
await page.waitForSelector('.news-page .story');
check(/Supreme Court lets Trump/.test(await page.innerText('.news')), 'politics renders on the News tab');
const newsTabs = await page.$$eval('.news-page .tab', (t) => t.map((x) => x.innerText.replace(/\n/g, ' ')));
check(newsTabs.length === 5 && /US politics/.test(newsTabs[0]) && /Music/.test(newsTabs[4]), `five sections: ${newsTabs.join(' | ')}`);
await page.click('button.tab:has-text("Tech & AI")');
check(/open-weight AI model/.test(await page.innerText('.news')) && /The Verge/.test(await page.innerText('.news')), 'Tech & AI section renders with the outlet name');
await page.click('button.tab:has-text("Pop culture")');
check(/sequel release date/.test(await page.innerText('.news')), 'Pop culture section renders');
await page.click('button.tab:has-text("Music")');
check(/vinyl reissue/.test(await page.innerText('.news')), 'Music section renders');
await page.screenshot({ path: path.join(OUT, 'news.png'), fullPage: true });
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
const learnCard = '.home .card:has(h2:text-is("Learning"))';
const homeLearn = await page.innerText(learnCard);
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
check(/exam in 20 days/.test(await page.innerText(learnCard)), 'Home learning card shows exam countdown');
await page.screenshot({ path: path.join(OUT, 'home-learning.png'), fullPage: true });


// ---------------- cooking
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.money .big');
check(/Cooking/.test(await page.innerText('.col:nth-child(2)')) && /Grocery list/.test(await page.innerText('.col:nth-child(2)')), 'Home shows the Cooking card');
await page.click('a.nav-item:has-text("Cooking")');
await page.waitForSelector('.cooking .kitchen');
await page.screenshot({ path: path.join(OUT, 'cooking-empty.png'), fullPage: true });
check((await page.$$('.picks .pick')).length === 12, 'this week’s 12 picks render');
check(/Chipotle-style steak/.test(await page.innerText('.cooking')), 'starter recipes in My recipes');
// kitchen: add several at once
await page.fill('input[aria-label="Add to kitchen"]', 'chicken breasts, garlic, olive oil, rice, yellow onion, soy sauce, eggs, butter, limes');
await page.click('.kitchen .add-row button[type=submit]');
await page.waitForTimeout(200);
let C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(C.kitchen.length === 9, `9 kitchen items saved (${C.kitchen.map((i) => i.name + '@' + i.where).join(', ')})`);
check(C.kitchen.find((i) => /Chicken/.test(i.name)).where === 'fridge' && C.kitchen.find((i) => /Rice/.test(i.name)).where === 'pantry', 'places guessed (chicken → fridge, rice → pantry)');
// a common chip
const chip = await page.$('.chips .chip');
const chipText = chip ? (await chip.innerText()).replace('+ ', '') : '';
if (chip) await chip.click();
await page.waitForTimeout(150);
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(C.kitchen.length === 10 && C.kitchen.some((i) => i.name === chipText), `common chip adds "${chipText}"`);
// cook-now matches
const rows = await page.$$eval('.cooking .col:nth-child(2) .card:first-child .rc', (els) => els.map((e) => e.innerText.replace(/\n/g, ' | ')));
console.log('  cook now:', rows.slice(0, 4));
check(rows.length > 0, 'cook-with-what-you-have shows matches');
// running low → grocery list
await page.click('.k-row:has-text("Butter") .low-btn');
await page.waitForTimeout(150);
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(C.kitchen.find((i) => i.name === 'Butter').low && C.grocery.some((g) => g.name === 'Butter'), 'Low adds butter to the grocery list');
// open a pick, add its missing items
await page.click('.picks .pick >> nth=1');
await page.waitForSelector('.sheet .ing');
const sheetText = await page.innerText('.sheet');
await page.screenshot({ path: path.join(OUT, 'cooking-recipe.png') });
const addBtn = await page.$('.sheet .btn.primary');
const nGroceryBefore = C.grocery.length;
if (addBtn) {
  await addBtn.click();
  await page.waitForTimeout(150);
}
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(C.grocery.length > nGroceryBefore && C.grocery.some((g) => g.for && g.for.length), `recipe’s missing items added with a "for" note (${C.grocery.length - nGroceryBefore} added)`);
// save it
await page.click('.sheet button:has-text("Save to My recipes")');
await page.waitForTimeout(150);
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(C.mine.some((r) => r.id.startsWith('bb-') && r.ingredients.length > 3), 'pick saved to My recipes with its ingredients');
await page.click('.sheet button:has-text("Close")');
// add own recipe
await page.click('.cooking button:has-text("+ Add")');
await page.fill('.sheet input >> nth=0', 'Garlic butter rice');
await page.fill('.sheet textarea >> nth=0', '1 cup rice\n2 Tbsp butter\n3 cloves garlic, minced\nsalt');
await page.click('.sheet button:has-text("Save recipe")');
await page.waitForTimeout(150);
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(C.mine.some((r) => r.title === 'Garlic butter rice' && r.ingredients.length === 4), 'own recipe added');
check(/Garlic butter rice/.test(await page.innerText('.cooking .col:nth-child(2) .card:first-child')), 'own recipe tops cook-now (have everything)');
// tick two grocery items and finish the shop, logging it to the budget
await page.fill('input[aria-label="Add to grocery list"]', 'cilantro, tortillas');
await page.click('.grocery .add-row button[type=submit]');
await page.waitForTimeout(150);
await page.click('.g-row:has-text("Cilantro") input[type=checkbox]');
await page.click('.g-row:has-text("Butter") input[type=checkbox]');
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(OUT, 'cooking-list.png'), fullPage: true });
await page.click('.grocery button:has-text("Finish shop")');
await page.waitForSelector('.sheet input[aria-label="Total spent"]');
await page.fill('.sheet input[aria-label="Total spent"]', '23.45');
await page.fill('.sheet input[aria-label="Store or note"]', 'Stop & Shop');
await page.screenshot({ path: path.join(OUT, 'cooking-finish.png') });
const b0 = await stored();
const k0 = b0.months[key] ? b0.months[key].transactions.length : 0;
await page.click('.sheet button:has-text("Log $23.45")');
await page.waitForSelector('.toast');
check(/Logged \$23\.45 to Groceries · 2 put away/.test(await page.innerText('.toast')), `toast: ${(await page.innerText('.toast')).replace(/\n/g, ' ')}`);
const b1 = await stored();
const shop = b1.months[key].transactions.slice(-1)[0];
check(b1.months[key].transactions.length === k0 + 1 && shop.category === 'Groceries' && shop.amount === 23.45 && shop.desc === 'Stop & Shop', `shop logged in budget (${shop.category}, ${shop.desc}, ${shop.amount}, ${shop.method})`);
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(!C.grocery.some((g) => g.done) && C.kitchen.some((i) => i.name === 'Cilantro') && !C.kitchen.find((i) => i.name === 'Butter').low, 'bought items put away, butter no longer low');
// undo both
await page.click('.toast-btn');
await page.waitForTimeout(250);
const b2 = await stored();
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(b2.months[key].transactions.length === k0 && C.grocery.filter((g) => g.done).length === 2 && !C.kitchen.some((i) => i.name === 'Cilantro'), 'undo removes the expense and restores the list');
await page.screenshot({ path: path.join(OUT, 'cooking.png'), fullPage: true });
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.money .big');
const homeCook = await page.innerText('.col:nth-child(2)');
check(/Tonight:/.test(homeCook), 'Home Cooking card suggests tonight’s dinner');
await page.screenshot({ path: path.join(OUT, 'home-cooking.png'), fullPage: true });

// settings sheet
await page.click('.nav-settings');
check(/Only this account/.test(await page.innerText('.sheet')), 'settings sheet');
await page.screenshot({ path: path.join(OUT, 'settings.png') });
await page.click('.sheet .btn.primary');

// desktop
const desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await desk.addInitScript(init, EXPORT);
await mockWeather(desk);
const dp = await desk.newPage();
dp.on('pageerror', (e) => errors.push('pageerror(desktop): ' + e.message));
await dp.goto(base, { waitUntil: 'networkidle' });
await dp.waitForSelector('.money .big');
await dp.screenshot({ path: path.join(OUT, 'desktop.png') });
await dp.click('a.nav-item:has-text("Cooking")');
await dp.waitForSelector('.cooking .kitchen');
await dp.evaluate(() => {});
await dp.waitForTimeout(300);
await dp.screenshot({ path: path.join(OUT, 'desktop-cooking.png'), fullPage: true });

await browser.close();
server.close();
const real = errors.filter((e) => !/Failed to load resource|favicon|firestore|ERR_/.test(e));
check(real.length === 0, `no console errors${real.length ? ': ' + real.join(' | ') : ''}`);
