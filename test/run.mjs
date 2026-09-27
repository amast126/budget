// Headless test of the dashboard at phone and desktop width with a stand-in backend.
// Budget data: a real export (path in BUDGET_EXPORT). The budget module runs in local mode from the same data,
// so a quick-add made on the home screen can be checked inside the real budget module.
// Run: ./build.sh && BUDGET_EXPORT=/path/export.json node test/run.mjs shots/
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { makeHealthExport } from './make-health-export.mjs';
import * as FUN from '../src/fun-logic.js';
import * as GTR from '../src/guitar-logic.js';
import * as SD from '../src/sourdough-logic.js';
import * as BD from '../src/birthdays-logic.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.resolve(process.argv[2] || 'shots');
const EXPORT = fs.readFileSync(process.env.BUDGET_EXPORT, 'utf8');
fs.mkdirSync(OUT, { recursive: true });
const HEALTH_ZIP = makeHealthExport(path.join(OUT, 'test-health-export.zip')); // made-up data

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/budget\/?/, '/');
  if (p === '/') p = '/index.html';
  if (p === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end('window.BUDGET_CONFIG = { firebase: { apiKey: "" }, finnhubKey: "test-key", allowedEmails: [], ownerEmail: "", sharedDocId: "" };');
  }
  if (p === '/news.json') p = '/test/news.fixture.json';
  if (p === '/gta6/news.json') p = '/test/gta6-news.fixture.json'; // the GTA 6 site's feed, next to /budget/ on the live site
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
      wind_speed_10m: times.map(() => 8),
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
  // Finnhub: made-up quotes and headlines for whatever tickers the budget holds
  await context.route('https://finnhub.io/**', (route) => {
    const u = new URL(route.request().url());
    const sym = u.searchParams.get('symbol') || 'X';
    const seed = [...sym].reduce((a, c) => a + c.charCodeAt(0), 0);
    const headers = { 'access-control-allow-origin': '*' };
    if (u.pathname.endsWith('/quote')) {
      const c = 20 + (seed % 180);
      const dp = ((seed % 9) - 4) * 0.7;
      return route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify({ c, d: (c * dp) / 100, dp, t: Math.floor(Date.now() / 1000) }) });
    }
    if (u.pathname.endsWith('/company-news')) {
      const now = Math.floor(Date.now() / 1000);
      const list = [0, 1, 2].map((i) => ({ id: seed * 10 + i, headline: `${sym} test headline ${i + 1}`, source: 'Test Wire', url: `https://example.com/${sym}/${i}`, datetime: now - (i + 1) * 3600 * (seed % 5 + 1) }));
      list.unshift({ id: seed * 10 + 9, headline: 'Market wrap: stocks drift as yields climb', summary: 'Indexes were mixed.', source: 'Test Wire', url: `https://example.com/${sym}/wrap`, datetime: now - 60 });
      return route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify(list) });
    }
    if (u.pathname.endsWith('/stock/profile2')) return route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify(sym === 'VTI' ? {} : { name: `${sym} Test Corp`, ticker: sym }) });
    route.fulfill({ status: 404, headers, body: '[]' });
  });
  await context.route('https://api.nhtsa.gov/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        Count: 2,
        results: [
          { NHTSACampaignNumber: '21V138000', ReportReceivedDate: '04/03/2021', Component: 'STEERING:LINKAGES:TIE ROD ASSEMBLY', Summary: 'Nissan is recalling certain 2020-2021 Altima vehicles.', Remedy: 'Dealers will replace the tie rods, free of charge.' },
          { NHTSACampaignNumber: '23V628000', ReportReceivedDate: '08/09/2023', Component: 'BACK OVER PREVENTION: SENSING SYSTEM: CAMERA', Summary: 'The rearview camera image may not display.', Remedy: 'Dealers will update the software, free of charge.' },
        ],
      }),
    })
  );
  await context.route('https://api.nal.usda.gov/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const q = String(body.query || '').toLowerCase();
    let foods;
    if (q.includes('banana'))
      foods = [
        { fdcId: 2709224, description: 'Banana, raw', dataType: 'Survey (FNDDS)', foodMeasures: [{ disseminationText: '1 banana', gramWeight: 126 }, { disseminationText: '1 cup', gramWeight: 150 }], foodNutrients: [{ nutrientId: 1008, value: 97 }, { nutrientId: 1003, value: 0.74 }, { nutrientId: 1005, value: 22.71 }, { nutrientId: 1004, value: 0.28 }] },
        { fdcId: 999, description: 'BANANA CHIPS', dataType: 'Branded', brandOwner: 'SNACK CO', servingSize: 30, servingSizeUnit: 'g', householdServingFullText: '1 oz', foodNutrients: [{ nutrientId: 1008, value: 520 }, { nutrientId: 1003, value: 2 }, { nutrientId: 1005, value: 58 }, { nutrientId: 1004, value: 33 }] },
      ];
    else foods = [];
    route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ foods }) });
  });
  await context.route('https://world.openfoodfacts.org/**', (route) => {
    const url = route.request().url();
    if (url.includes('0818290019592'))
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: '0818290019592', product: { product_name: 'Greek yogurt, coffee', brands: 'Chobani', serving_size: '150 g', serving_quantity: 150, nutriments: { 'energy-kcal_100g': 93, proteins_100g: 7.3, carbohydrates_100g: 10.7, fat_100g: 1.3 } } }) });
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 0 }) });
  });
  await context.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ name: 'Brooklyn', admin1: 'New York', admin2: 'Kings', country: 'United States', country_code: 'US', latitude: 40.6501, longitude: -73.94958 }] }) })
  );
}

const errors = [];
const browser = await chromium.launch();
// Phone checks run with "reduce motion" on so numbers don't count up mid-check; desktop runs with motion.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
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
// Phone nav shows Home, News, Budget, Health; the rest are under More.
async function go(label) {
  const direct = page.locator(`.nav a.nav-item:has-text("${label}")`);
  if (await direct.isVisible()) return direct.click();
  await page.click('.nav-more');
  await page.click(`.more-sheet .more-item:has-text("${label}")`);
}

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForSelector('.money .big');
await page.screenshot({ path: path.join(OUT, 'home.png'), fullPage: true });
const txt = await page.innerText('.main');
check(/Left to spend|Over budget by/.test(txt), 'money card renders');
check(/Next payday/.test(txt), 'payday shown');
check(/Bills this week/.test(txt), 'bills card renders');
check(!/Supreme Court lets Trump/.test(txt) && !/Mark all read/.test(txt), 'news is off the home screen');
// phone order: rings (and the weekly recap on Sun/Mon), weather, to-do, then money
const order = (await page.$$eval('.home-grid .card .card-title', (els) => els.map((e) => [e.textContent, Math.round(e.getBoundingClientRect().top)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]))).filter((t) => !/^(Your week|Last week)$/.test(t));
check(order[0] === 'Today’s rings' && order[1] === 'Weather' && order[2] === 'To-do', `phone order starts ${order.slice(0, 4).join(', ')}`);
// the sky header
const hero = (await page.innerText('.hero')).replace(/\n/g, ' ');
check(/Good (morning|afternoon|evening), Alec/.test(hero) && /68°/.test(hero), `header greets and shows the weather: ${hero.slice(0, 80)}…`);
check((await page.$$('.hero .hero-line')).length === 1 && (await page.innerText('.hero-line')).length > 10, `header line: ${await page.innerText('.hero-line')}`);
check(/to GTA VI/.test(hero) && /to payday|Payday today/.test(hero), 'countdown chips: payday and GTA VI');
check(/sky-(dawn|day|golden|dusk|night)/.test(await page.getAttribute('.hero', 'class')), `sky phase: ${await page.getAttribute('.hero', 'class')}`);
// with "reduce motion" the sky is painted once, still, but complete: opaque, with an overcast deck's texture
{
  const px = await page.evaluate(() => {
    const c = document.querySelector('.hero canvas.sky-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let opaque = 0;
    let n = 0;
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      n++;
      if (d[i + 3] === 255) opaque++;
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    return { opaque: opaque / n, spread: hi - lo };
  });
  check(px.opaque > 0.99 && px.spread > 12, `still sky painted (opaque ${px.opaque.toFixed(2)}, tonal range ${Math.round(px.spread)})`);
}
check(/Good tennis weather/.test(await page.innerText('.weather')), `tennis line: ${((await page.innerText('.weather')).match(/Good tennis weather[^\n]*/) || ['none'])[0]}`);
check((await page.$$('.lring')).length === 4 && /Money/.test(await page.innerText('.rings-card')) && /Mind/.test(await page.innerText('.rings-card')), 'four life rings');
check((await page.$$('.money .spark .spark-line')).length === 1, 'money card sparkline');
await page.screenshot({ path: path.join(OUT, 'home-hero.png') });
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
check(H.doneLog && Object.values(H.doneLog).reduce((a, b) => a + b, 0) === 1, 'finished to-dos are counted even after Clear done');
let rtxt = (await page.innerText('.rings-card')).replace(/\n/g, ' ');
check(/1 of 3 to-dos/.test(rtxt) && /1 To-dos/.test(rtxt), `Home ring and to-do streak: ${rtxt}`);
// swipe right to finish a to-do
const row = await page.$('.todo-row:has-text("Book AI-901 exam") .todo-text');
const rb = await row.boundingBox();
await page.mouse.move(rb.x + 20, rb.y + rb.height / 2);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(rb.x + 20 + i * 18, rb.y + rb.height / 2);
await page.mouse.up();
await page.waitForTimeout(200);
H = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:home')));
check(H.todos.find((t) => t.text === 'Book AI-901 exam').done, 'swipe right finishes a to-do');
rtxt = (await page.innerText('.rings-card')).replace(/\n/g, ' ');
check(/2 of 3 to-dos/.test(rtxt), 'Home ring moves to 2 of 3');
// swipe left deletes (with undo)
const row2 = await page.$('.todo-row:has-text("Renew car registration") .todo-text');
const rb2 = await row2.boundingBox();
await page.mouse.move(rb2.x + 200, rb2.y + rb2.height / 2);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(rb2.x + 200 - i * 18, rb2.y + rb2.height / 2);
await page.mouse.up();
await page.waitForSelector('.toast');
check(/To-do deleted/.test(await page.innerText('.toast')), 'swipe left deletes, with undo');
await page.click('.toast-btn');
await page.waitForTimeout(200);
// week in review
await page.click('.rings-card button:has-text("Week in review")');
await page.waitForSelector('.week-sheet');
const wtxt = (await page.innerText('.week-sheet')).replace(/\n/g, ' ');
check(/This week/.test(wtxt) && /Spent|No card spending/.test(wtxt) && /To-dos done/.test(wtxt) && (await page.$$('.week-sheet .tile')).length >= 4, `week in review: ${wtxt.slice(0, 120)}…`);
await page.click('.week-sheet button[aria-label="Previous week"]');
check(/Last week/.test(await page.innerText('.week-sheet')), 'week in review steps back a week');
await page.screenshot({ path: path.join(OUT, 'home-week.png') });
await page.click('.week-sheet .x');
// heatmap
const cells = (await page.$$('.heat-card .hc[role=gridcell]')).length;
check(cells >= 70 && cells % 7 === 0, `heatmap grid: ${cells} days`);
check(/Spent on \d+ of \d+ days/.test(await page.innerText('.heat-card')), `heatmap summary: ${await page.innerText('.heat-card .heat-read')}`);
await page.click('.heat-card .seg-btn:has-text("Study")');
check(/No study logged|Studied on/.test(await page.innerText('.heat-card')), 'heatmap switches measure');
await page.click('.heat-card .seg-btn:has-text("Spending")');
const insightsN = (await page.$$('.insights .insight')).length;
console.log('  insights:', await page.$$eval('.insights .insight', (e) => e.map((x) => x.innerText)));
check(insightsN >= 1, `insights card: ${insightsN}`);
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
check(newsTabs.length === 7 && /US politics/.test(newsTabs[0]) && /NYC/.test(newsTabs[1]) && /Markets/.test(newsTabs[6]), `seven sections: ${newsTabs.join(' | ')}`);
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
await go('Learning');
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
const exam = (() => {
  // local date 20 days out (toISOString would give tomorrow's UTC date late in the evening)
  const d = new Date();
  d.setDate(d.getDate() + 20);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
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
await go('Cooking');
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


// ---------------- auto
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.auto-home');
let autoHome = await page.innerText('.auto-home');
check(/2021 Nissan Altima SL/.test(autoHome) && /NYS inspection (due|expired)/.test(autoHome), `Home auto card: ${autoHome.replace(/\n/g, ' | ')}`);
check(/\d+ payments? left · \$[\d,.]+ · paid off Jun 2027/.test(autoHome), 'Home auto card shows the car loan countdown');
check(/2 recalls to check/.test(autoHome), 'Home auto card flags recalls');
await go('Auto');
await page.waitForSelector('.auto .mt-row');
let atext = await page.innerText('.auto');
check(/2021 Nissan Altima SL/.test(atext) && /52,000/.test(atext), 'Auto tab shows the car and mileage');
check(await page.$eval('.auto-hero .hero-car', (i) => i.complete && i.naturalWidth > 0), 'car photo loads in the Auto banner');
const heroText = (await page.innerText('.auto-hero')).replace(/\n/g, ' ');
check(/payments left/.test(heroText) && /to inspection/.test(heroText), `banner stats: ${heroText}`);
check((await page.$$('.auto .mt-row')).length === 7, 'seven maintenance items on Nissan’s schedule');
check(/Car payment/.test(atext) && /\$400\.58\/mo/.test(atext) && /Geico Car Insurance/.test(atext) && /\$190\.28\/mo from Nov 2026/.test(atext), 'costs come from the budget (payment, Geico and its November change)');
check(/Powertrain/.test(atext) && /Add your purchase month/.test(atext), 'warranty asks for the purchase month');
await page.screenshot({ path: path.join(OUT, 'auto.png'), fullPage: true });
// log a service with a cost that goes to the budget
const bA = await stored();
const kA = bA.months[key] ? bA.months[key].transactions.length : 0;
await page.click('.auto button:has-text("Log service")');
await page.click('.sheet .chip:has-text("Oil & filter")');
await page.click('.sheet .chip:has-text("Tire rotation")');
await page.fill('.sheet input[aria-label="Mileage at service"]', '52100');
await page.fill('.sheet input[aria-label="Cost"]', '89.99');
await page.fill('.sheet input[placeholder^="Dealer"]', 'Nissan dealer');
await page.screenshot({ path: path.join(OUT, 'auto-log.png') });
await page.click('.sheet button:has-text("Save")');
await page.waitForTimeout(300);
let A = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:auto')));
check(A.service.length === 1 && A.service[0].items.join() === 'oil,rotate' && A.service[0].miles === 52100, 'service logged');
check(A.odo[A.odo.length - 1].miles === 52100, 'mileage moves up with the service');
const bB = await stored();
const svc = bB.months[key].transactions.slice(-1)[0];
check(bB.months[key].transactions.length === kA + 1 && svc.category === 'Gas & Auto' && svc.amount === 89.99 && /^Car: Oil & filter, Tire rotation/.test(svc.desc), `service cost in the budget (${svc.desc})`);
atext = await page.innerText('.auto');
check(/next 62,100 mi/.test(atext) && /next 57,100 mi/.test(atext), 'oil and rotation now count from this service');
// inspection done
await page.click('.dl-row:has-text("NYS inspection") button:has-text("Inspected")');
await page.waitForTimeout(200);
A = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:auto')));
const now = new Date();
const expect = new Date(now.getFullYear(), now.getMonth() + 13, 0);
check(A.inspection === `${expect.getFullYear()}-${String(expect.getMonth() + 1).padStart(2, '0')}-${String(expect.getDate()).padStart(2, '0')}`, `inspection moves to ${A.inspection}`);
// recalls
await page.selectOption('select[aria-label="Status of recall 21V138000"]', 'na');
await page.waitForTimeout(150);
A = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:auto')));
check(A.recalls['21V138000'] === 'na', 'recall status saved');
// mileage update
await page.fill('input[aria-label="Current mileage"]', '52,500');
await page.click('.auto form.add-row button[type=submit]');
await page.waitForTimeout(150);
A = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:auto')));
check(A.odo[A.odo.length - 1].miles === 52500, 'mileage update saved');
await page.screenshot({ path: path.join(OUT, 'auto-after.png'), fullPage: true });
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.auto-home');
autoHome = await page.innerText('.auto-home');
check(/1 recall to check/.test(autoHome) && !/NYS inspection/.test(autoHome), 'Home card updates (inspection done, one recall left)');


// ---------------------------------------------------------------- health
const Y = String(new Date().getFullYear());
const T = () => new Date().toISOString().slice(0, 10);
const hDoc = () => page.evaluate(() => JSON.parse(localStorage.getItem('mod:health') || 'null'));
const yDoc = () => page.evaluate((y) => JSON.parse(localStorage.getItem('mod:health-' + y) || 'null'), Y);
const localToday = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const dayFood = async () => ((await yDoc()).days[localToday] || { food: [] }).food;
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.health-home');
check(/Set up your target/.test(await page.innerText('.health-home')), 'Home health card asks for setup');
const navLabels = await page.$$eval('.nav .nav-item', (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()));
check(navLabels.join(',') === 'Home,News,Budget,Health,More', `phone nav: ${navLabels.join(', ')}`);
await page.click('a.nav-item:has-text("Health")');
await page.waitForSelector('.health .targets');
await page.selectOption('select[aria-label="Sex"]', 'male');
await page.fill('input[aria-label="Age"]', '29');
await page.press('input[aria-label="Age"]', 'Tab');
await page.fill('input[aria-label="Height feet"]', '5');
await page.press('input[aria-label="Height feet"]', 'Tab');
await page.fill('input[aria-label="Height inches"]', '11');
await page.press('input[aria-label="Height inches"]', 'Tab');
await page.waitForTimeout(150);
await page.fill('input[aria-label="Weight in pounds"]', '180');
await page.press('input[aria-label="Weight in pounds"]', 'Enter');
await page.waitForTimeout(250);
let HD = await hDoc();
check(HD.profile.sex === 'male' && HD.profile.age === 29 && HD.profile.heightIn === 71 && HD.weights.length === 1, `profile saved (${JSON.stringify(HD.profile)})`);
let htext = await page.innerText('.health');
check(/2,480 cal/.test(htext) && /P 144g/.test(htext) && /C 289g/.test(htext) && /F 83g/.test(htext), `targets: ${(htext.match(/[\d,]+ cal · P \d+g · C \d+g · F \d+g/) || [''])[0]}`);
check(/2,480\s*calories left/.test(htext.replace(/\n/g, ' ')), 'today card shows calories left');
// swipe the day: right = yesterday, left = back to today
const swipeDay = (dx) =>
  page.evaluate((dx) => {
    const el = document.querySelector('.today-health .card-title');
    const r = el.getBoundingClientRect();
    const x = r.left + 60;
    const y = r.top + r.height / 2;
    const mk = (type, cx) => {
      const t = new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
      return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] });
    };
    el.dispatchEvent(mk('touchstart', x));
    el.dispatchEvent(mk('touchend', x + dx));
  }, dx);
await swipeDay(150);
await page.waitForTimeout(150);
check((await page.innerText('.day-nav .day-label')) === 'Yesterday', 'swipe right shows yesterday');
await swipeDay(-150);
await page.waitForTimeout(150);
check((await page.innerText('.day-nav .day-label')) === 'Today', 'swipe left comes back to today');
// search → banana
await page.click('.food-log button:has-text("+ Log food")');
await page.waitForSelector('.add-food');
await page.click('.add-food .seg-btn:has-text("Search")');
await page.fill('input[aria-label="Search foods"]', 'banana');
await page.press('input[aria-label="Search foods"]', 'Enter');
await page.waitForSelector('.add-food .rc');
const resText = await page.$$eval('.add-food .rc', (e) => e.map((x) => x.innerText.replace(/\n/g, ' ')));
check(/Banana, Raw|Banana, raw/.test(resText[0]) && /generic/.test(resText[0]) && /Banana Chips/.test(resText[1]), `search results: ${resText.join(' | ')}`);
await page.click('.add-food .rc >> nth=0');
await page.selectOption('select[aria-label="Unit"]', { label: '1 banana' });
await page.click('.meal-seg .seg-btn:has-text("Breakfast")');
check(/122\s*cal/.test((await page.innerText('.fd-totals')).replace(/\n/g, ' ')), 'banana preview: 122 cal');
await page.screenshot({ path: path.join(OUT, 'health-add.png') });
await page.click('.food-detail button.primary');
await page.waitForTimeout(250);
let F = await dayFood();
check(F.length === 1 && F[0].name.toLowerCase() === 'banana, raw' && F[0].k === 122 && F[0].meal === 'breakfast' && F[0].amount === '1 banana', `logged: ${JSON.stringify(F[0])}`);
// recent → lunch
await page.click('.meal:has-text("Lunch") button:has-text("+ Add")');
await page.waitForSelector('.add-food');
check(/last: 1 banana/.test(await page.innerText('.add-food')), 'recent shows banana with last portion');
await page.click('.add-food .rc >> nth=0');
await page.click('.food-detail button.primary');
await page.waitForTimeout(200);
F = await dayFood();
check(F.length === 2 && F[1].meal === 'lunch', 'one-tap add from recent');
// quick add
await page.click('.food-log button:has-text("+ Log food")');
await page.click('.add-food .seg-btn:has-text("Quick add")');
await page.fill('input[aria-label="Food name"]', 'protein shake');
await page.fill('input[aria-label="Calories"]', '160');
await page.fill('input[aria-label="Protein"]', '30');
await page.fill('input[aria-label="Carbs"]', '5');
await page.fill('input[aria-label="Fat"]', '2');
await page.click('.quick-food button[type=submit]');
await page.click('.meal-seg .seg-btn:has-text("Snacks")');
await page.click('.food-detail button.primary');
await page.waitForTimeout(200);
F = await dayFood();
check(F.length === 3 && F[2].name === 'Protein shake' && F[2].k === 160 && F[2].p === 30, 'quick add saved with macros');
// barcode by number
await page.click('.food-log button:has-text("+ Log food")');
await page.click('.add-food .seg-btn:has-text("Barcode")');
await page.fill('input[aria-label="Barcode number"]', '0818290019592');
await page.click('.add-food button:has-text("Look up")');
await page.waitForSelector('.food-detail');
check(/Greek Yogurt, Coffee|Greek yogurt, coffee/.test(await page.innerText('.food-detail')) && /140\s*cal/.test((await page.innerText('.fd-totals')).replace(/\n/g, ' ')), 'barcode lookup: Chobani, 1 serving = 140 cal');
await page.click('.food-detail button:has-text("Back")');
// barcode from a photo (decoded by the vendored ZXing)
await page.setInputFiles('.scanner input[type=file]', process.env.EAN_IMAGE);
await page.waitForSelector('.food-detail', { timeout: 8000 });
check(/Chobani/.test(await page.innerText('.food-detail')), 'barcode photo decoded and looked up');
await page.click('.food-detail button.primary');
await page.waitForTimeout(200);
F = await dayFood();
check(F.length === 4 && F[3].brand === 'Chobani', 'yogurt logged');
// edit banana to 2
await page.click('.meal:has-text("Breakfast") .entry');
await page.fill('.food-detail input[aria-label="Amount"]', '2');
await page.click('.food-detail button:has-text("Save")');
await page.waitForTimeout(200);
F = await dayFood();
check(F[0].k === 244 && F[0].amount === '2 × 1 banana', `edit updates the entry (${F[0].amount}, ${F[0].k} cal)`);
// delete + undo
await page.click('.meal:has-text("Snacks") .entry >> nth=0');
await page.click('.sheet button:has-text("Delete")');
await page.waitForSelector('.toast');
check((await dayFood()).length === 3, 'delete removes the entry');
await page.click('.toast-btn');
await page.waitForTimeout(200);
check((await dayFood()).length === 4, 'undo restores it');
// totals
htext = (await page.innerText('.today-health')).replace(/\n/g, ' ');
const eaten = 244 + 122 + 160 + 140;
check(new RegExp(`${eaten.toLocaleString()} eaten`).test(htext), `today total ${eaten}: ${htext}`);
// steps + workout
await page.fill('input[aria-label="Steps"]', '9,500');
await page.press('input[aria-label="Steps"]', 'Enter');
await page.selectOption('select[aria-label="Workout type"]', 'tennis');
await page.fill('input[aria-label="Minutes"]', '60');
await page.press('input[aria-label="Minutes"]', 'Enter');
await page.waitForTimeout(250);
const D = (await yDoc()).days[localToday];
check(D.steps === 9500 && D.workouts.length === 1 && D.workouts[0].type === 'tennis', 'steps and workout saved');
check(/about 596 cal burned/.test(await page.innerText('.health')), 'tennis estimate: about 596 cal');
// weight history for the chart
await page.evaluate(() => {
  const h = JSON.parse(localStorage.getItem('mod:health'));
  const d0 = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 1; i <= 40; i += 2) h.weights.push({ date: iso(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - i)), lb: 181.5 - i * 0.03 + (i % 4 ? 0.6 : -0.4) });
  h.weights.sort((a, b) => (a.date < b.date ? -1 : 1));
  localStorage.setItem('mod:health', JSON.stringify(h));
  window.__modSubs.health.forEach((f) => f());
});
await page.waitForTimeout(250);
check((await page.$$('.chart .wdot')).length >= 15 && (await page.$$('.chart .wline')).length === 1, 'weight chart draws weigh-ins and the 7-day line');
await page.$eval('.chart rect[fill=transparent]', (r) => r.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(100);
const wbox = await page.$eval('.chart rect[fill=transparent]', (r) => { const b = r.getBoundingClientRect(); return { x: b.x + b.width * 0.6, y: b.y + 40 }; });
await page.mouse.move(wbox.x, wbox.y);
await page.waitForTimeout(100);
check(/weigh-in/.test(await page.innerText('.chart-tip')) && (await page.$$('.chart .crosshair')).length === 1, 'weight chart hover shows crosshair and tooltip');
check((await page.$$('.chart .wbar')).length >= 1, 'week chart draws today’s calories');
await page.screenshot({ path: path.join(OUT, 'health.png'), fullPage: true });
// copy yesterday's meal
await page.evaluate(([y]) => {
  const d = JSON.parse(localStorage.getItem('mod:health-' + y));
  const t = new Date(); t.setDate(t.getDate() - 1);
  const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  if (iso.slice(0, 4) !== y) return;
  d.days[iso] = { food: [{ id: 'y1', meal: 'dinner', name: 'Chipotle-style steak', amount: '1 serving', qty: 1, portion: '1 serving', key: 'q:steak', k: 650, p: 55, c: 10, f: 40 }], steps: null, workouts: [] };
  localStorage.setItem('mod:health-' + y, JSON.stringify(d));
  window.__modSubs['health-' + y].forEach((f) => f());
}, [Y]);
await page.waitForTimeout(200);
const copyBtn = await page.$('.copy-meal');
if (copyBtn) {
  await copyBtn.click();
  await page.waitForTimeout(200);
  check((await dayFood()).some((e) => e.name === 'Chipotle-style steak'), 'copy yesterday’s dinner');
}
// Home card
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.health-home');
const hh = (await page.innerText('.health-home')).replace(/\n/g, ' ');
check(/calories left|calories over/.test(hh) && /Steps 9,500/.test(hh) && /Weight/.test(hh), `Home health card: ${hh}`);
check((await page.$$('.health-home .mb-bar')).length === 7, 'Home health card: 7 days of calories');
{
  // An old weigh-in from years ago (e.g. an Apple Health import) must not count as "30 days ago".
  const { weightStats, normalizeHealth } = await import('../src/health-logic.js');
  const iso = (d) => d.toISOString().slice(0, 10);
  const t = new Date();
  const h = normalizeHealth({ weights: [{ date: '2020-12-06', lb: 154.8 }, { date: iso(new Date(t.getTime() - 2 * 864e5)), lb: 158 }, { date: iso(t), lb: 158.4 }] });
  const st = weightStats(h, iso(t));
  check(st.change30 == null && st.since && st.since.date !== '2020-12-06', `weight trend ignores years-old weigh-ins (${JSON.stringify(st.since)})`);
}
const rt2 = (await page.innerText('.rings-card')).replace(/\n/g, ' ');
check(/Body/.test(rt2) && /(workout|steps)/.test(rt2) && /Food logged/.test(rt2), `rings after logging: ${rt2}`);
await page.screenshot({ path: path.join(OUT, 'home-health.png'), fullPage: true });
// Cooking → log a serving
await go('Cooking');
await page.waitForSelector('.picks .pick');
await page.click('.picks .pick >> nth=1');
await page.waitForSelector('.sheet .nutri');
await page.click('.sheet button:has-text("Log a serving to Health")');
await page.waitForTimeout(250);
check((await dayFood()).some((e) => e.key.startsWith('bb:') && e.k === 420), 'Cooking recipe logged to Health (420 cal)');
await page.click('.sheet button:has-text("Close")');

// ---------------------------------------------------------------- Apple Health import
await go('Health');
await page.waitForSelector('.health-tabs');
check((await page.$$eval('.health-tabs .seg-btn', (b) => b.map((x) => x.innerText))).join(',') === 'Today,Activity,Heart,Sleep,Body,Hearing', 'Health has Today, Activity, Heart, Sleep, Body, Hearing');
await page.click('.health-tabs .seg-btn:has-text("Sleep")');
check(/Import your Apple Health export/.test(await page.innerText('.health')), 'Sleep asks for an import before there is data');
await page.click('.health button:has-text("Go to the importer")');
await page.waitForSelector('.hk-import input[type=file]', { state: 'attached' });
check(/Export All Health Data/.test(await page.innerText('.hk-import')), 'importer explains how to export from the iPhone');
await page.setInputFiles('.hk-import input[type=file]', HEALTH_ZIP);
await page.waitForSelector('.hk-import .ok-note', { timeout: 20000 });
const okNote = (await page.innerText('.hk-import .ok-note')).replace(/\n/g, ' ');
check(/401 days/.test(okNote) && /60 nights/.test(okNote) && /2 workouts/.test(okNote) && /1 ECG/.test(okNote) && /3 weigh-ins added/.test(okNote), `import summary: ${okNote}`);
const HK = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:health-hk')));
const HKY = await page.evaluate((y) => JSON.parse(localStorage.getItem('mod:health-hk-' + y)), Y);
const yIso = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const HKYy = yIso.slice(0, 4) === Y ? HKY : await page.evaluate((y) => JSON.parse(localStorage.getItem('mod:health-hk-' + y)), yIso.slice(0, 4));
check(HK.importedAt && HK.workouts.length === 2 && HK.ecg.length === 1 && HK.vo2.length === 4 && Object.keys(HK.months).length >= 13, 'summary document saved (workouts, ECG, VO2 max, months)');
check(HKYy.days[yIso].st === 5700 && HKYy.days[yIso].sl.a === 435 && HKYy.days[yIso].sh === 11, `yesterday: 5,700 steps (no double count), 7h 15m asleep (${JSON.stringify(HKYy.days[yIso]).slice(0, 80)}…)`);
check((await page.evaluate(() => JSON.parse(localStorage.getItem('mod:health-hk-ecg')))).traces[HK.ecg[0].id].length === 3840, 'ECG trace saved at 128 samples a second');
check(Object.keys((await page.evaluate(() => JSON.parse(localStorage.getItem('mod:health-hk-routes')))).routes).length === 1, 'workout route saved');
HD = await hDoc();
check(HD.weights.filter((w) => w.src === 'apple').length === 3 && HD.profile.dob === '1990-01-15' && HD.profile.heightIn === 71, 'old weigh-ins added, birthday stored; typed profile kept');
const foodAfter = await dayFood();
check(foodAfter.length >= 4, 'food log untouched by the import');
// Today: yesterday's Apple data
await page.click('.day-nav button[aria-label="Previous day"]');
await page.waitForTimeout(150);
let act = (await page.innerText('.health')).replace(/\n/g, ' ');
check(/Apple Health/.test(act) && /5,700/.test(act) && /Move/.test(act) && /Exercise/.test(act), 'yesterday shows Apple steps and rings');
check(/Walking/.test(act) && /Apple Watch/.test(act) && /0\.9 mi/.test(act), 'yesterday lists the Watch walk');
check(/7h 15m/.test(act) && (await page.$$('.stage-bar span')).length >= 3, 'vitals card: sleep with stages');
await page.screenshot({ path: path.join(OUT, 'health-today-apple.png'), fullPage: true });
await page.click('.day-nav .day-label');
// Activity
await page.click('.health-tabs .seg-btn:has-text("Activity")');
await page.waitForTimeout(200);
act = (await page.innerText('.health')).replace(/\n/g, ' ');
check(/5,700\s*steps a day/.test(act), 'steps card: 5,700 a day');
check((await page.$$('.chart .cbar')).length >= 25, 'steps bars drawn');
check(/Move closed/.test(act) && /100%\s*Exercise closed/.test(act) && /0%\s*Stand closed/.test(act), 'rings: exercise always, stand never');
check(/Running/.test(act) && /route/.test(act) && /Tennis/.test(act), 'workouts list mixes Apple and logged workouts');
await page.screenshot({ path: path.join(OUT, 'health-activity.png'), fullPage: true });
await page.click('.wk-list .rc:has-text("Running")');
await page.waitForSelector('.route-map', { timeout: 5000 });
const ws = (await page.innerText('.sheet')).replace(/\n/g, ' ');
check(/3\.1 mi/.test(ws) && /9:41 \/mi|9:4\d \/mi/.test(ws) && /151 bpm/.test(ws), `workout sheet: ${ws.slice(0, 120)}`);
await page.screenshot({ path: path.join(OUT, 'health-workout.png') });
await page.click('.sheet .x');
// range switch + monthly bars
await page.click('.card:has(.card-title:text-is("Steps")) .seg-btn:has-text("All time")');
await page.waitForTimeout(100);
check((await page.$$('.card:has(.card-title:text-is("Steps")) .chart .cbar')).length >= 13, 'steps all-time: monthly bars');
// Heart
await page.click('.health-tabs .seg-btn:has-text("Heart")');
await page.waitForTimeout(200);
act = (await page.innerText('.health')).replace(/\n/g, ' ');
check(/Resting heart rate|Heart rate/.test(act) && (await page.$$('.chart .sline')).length >= 2, 'heart charts drawn');
check(/42\.5/.test(act) && /4 estimates/.test(act), 'cardio fitness: latest 42.5, 4 estimates');
check(/Sinus Rhythm/.test(act) && /60 bpm/.test(act), 'ECG listed with its rhythm and rate');
const hbox = await page.$eval('.card:has(.card-title:text-is("Heart rate")) .chart rect[fill=transparent]', (r) => { r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.x + b.width * 0.5, y: b.y + 40 }; });
await page.mouse.move(hbox.x, hbox.y);
await page.waitForTimeout(100);
check(/bpm/.test(await page.innerText('.chart-tip')), 'heart chart tooltip');
await page.screenshot({ path: path.join(OUT, 'health-heart.png'), fullPage: true });
await page.click('.card:has(.card-title:text-is("ECG recordings")) .rc');
await page.waitForSelector('.ecg-row');
check((await page.$$('.ecg-row')).length === 3, 'ECG drawn as three 10-second strips');
await page.screenshot({ path: path.join(OUT, 'health-ecg.png') });
await page.click('.sheet .x');
// Sleep
await page.click('.health-tabs .seg-btn:has-text("Sleep")');
await page.waitForTimeout(200);
act = (await page.innerText('.health')).replace(/\n/g, ' ');
check(/7h 15m/.test(act) && /11:15 pm → 6:30 am/.test(act) && /Deep/.test(act) && /REM/.test(act), 'last night: 7h 15m, 11:15 pm → 6:30 am, stages');
check(/60 of 60|59 of 59|60 of 61/.test(act) || /nights with 7h\+/.test(act), 'sleep trend counts nights with 7h+');
check((await page.$$('.chart .cbar.st-d')).length >= 25, 'sleep stage bars drawn');
await page.screenshot({ path: path.join(OUT, 'health-sleep.png'), fullPage: true });
// Body
await page.click('.health-tabs .seg-btn:has-text("Body")');
await page.waitForTimeout(200);
act = (await page.innerText('.health')).replace(/\n/g, ' ');
check(/Body composition/.test(act) && /18\.2%/.test(act) && /Weight/.test(act), 'body: composition from the scale and the weight card');
await page.screenshot({ path: path.join(OUT, 'health-body.png'), fullPage: true });
// Hearing
await page.click('.health-tabs .seg-btn:has-text("Hearing")');
await page.waitForTimeout(200);
act = (await page.innerText('.health')).replace(/\n/g, ' ');
check(/Headphone audio/.test(act) && /72 dB/.test(act) && /Hearing test/.test(act) && /normal range/.test(act), 'hearing: headphone level and the audiogram');
check((await page.$$('.audiogram .ag-o')).length === 6, 'audiogram points drawn');
await page.screenshot({ path: path.join(OUT, 'health-hearing.png'), fullPage: true });
// the view is remembered
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.health-home');
const hh2 = (await page.innerText('.health-home')).replace(/\n/g, ' ');
check(/Slept 7h 15m/.test(hh2), `Home health card shows last night: ${hh2}`);
await page.click('a.nav-item:has-text("Health")');
await page.waitForSelector('.health-tabs');
check(/on/.test(await page.getAttribute('.health-tabs .seg-btn:has-text("Hearing")', 'class')), 'Health reopens on the last view');
await page.click('.health-tabs .seg-btn:has-text("Today")');

// ---------------------------------------------------------------- logic (no browser)
{
  const f = FUN.defaultFun();
  check(FUN.MCU.length === 91 && new Set(FUN.MCU.map((t) => t.id)).size === 91 && FUN.MCU.filter((t) => t.key).length === 17, `Doomsday watch list: ${FUN.MCU.length} titles, ${FUN.MCU.filter((t) => t.key).length} marked key`);
  FUN.setMcu(f, 'iron-man', 'w');
  FUN.setMcu(f, 'venom', 's');
  const p = FUN.mcuProgress(f, '2026-09-27');
  check(p.watched === 1 && p.skipped === 1 && p.needed === 90 && p.left === 89 && p.days === 82 && p.perWeek === 7.6, `watch progress: ${p.watched} of ${p.needed}, ${p.perWeek} a week for ${p.days} days`);
  check(FUN.featured(f, '2026-09-27').id === 'gta6' && FUN.upcoming(f, '2026-09-27')[0].id === 'visionquest' && FUN.upcoming(f, '2026-12-27').length === 0, 'releases: GTA VI featured, soonest first, gone a week after');
  const t = FUN.timeLeft('2026-11-19', new Date(2026, 10, 17, 18, 30, 15));
  check(t.d === 1 && t.h === 5 && t.m === 29 && t.s === 45, `countdown clock: ${t.d}d ${t.h}h ${t.m}m ${t.s}s`);
  const g = GTR.defaultGuitar();
  ['2026-09-20', '2026-09-24', '2026-09-25', '2026-09-26'].forEach((d) => GTR.logPractice(g, 15, { date: d }));
  const st = GTR.streak(g, '2026-09-27');
  check(st.current === 3 && !st.today && st.best === 3 && GTR.weekSummary(g, '2026-09-27').minutes === 45, `guitar streak ${st.current} (ends yesterday), best ${st.best}, 45 min this week`);
  const sr = 48000;
  const errs = [82.41, 110, 196, 329.63].map((hz) => {
    const buf = new Float32Array(4096).map((_, i) => 0.6 * Math.sin((2 * Math.PI * hz * i) / sr) + 0.25 * Math.sin((4 * Math.PI * hz * i) / sr) + 0.1 * Math.sin((6 * Math.PI * hz * i) / sr));
    return Math.abs(GTR.detectPitch(buf, sr) / hz - 1);
  });
  const quiet = GTR.detectPitch(new Float32Array(4096), sr);
  check(errs.every((e) => e < 0.004) && quiet === null, `tuner finds low E to high E within ${(Math.max(...errs) * 1200 / 0.693).toFixed(1)} cents, silence reads nothing`);
  const n = GTR.noteOf(440);
  const s = GTR.nearestString(111);
  check(n.name === 'A' && n.octave === 4 && n.cents === 0 && s.name === 'A' && s.octave === 2 && s.cents > 10 && s.cents < 20, `note names: 440 Hz = ${n.name}${n.octave}, 111 Hz = ${s.name}${s.octave} +${s.cents}¢`);
  const d1 = SD.doughFor({ loaves: 1, flour: 500, hydration: 75, levain: 20, salt: 2 });
  const d2 = SD.doughFor({ loaves: 2, flour: 500, hydration: 75, levain: 20, salt: 2, adjust: true });
  check(d1.flour === 500 && d1.water === 375 && d1.levain === 100 && d1.salt === 10 && d1.total === 985 && d2.flour === 900 && d2.water === 650 && d2.trueHydration === 75, `dough: 500/375/100/10 g; counting the starter, 2 loaves = ${d2.flour} g flour, ${d2.water} g water, ${d2.trueHydration}%`);
  const plan = SD.bakePlan({ ready: '2026-10-03T10:00', temp: 75, retard: true });
  const hrs = (a, b) => (plan.steps.find((x) => x.id === b).at - plan.steps.find((x) => x.id === a).at) / 3600000;
  const awake = (pl) => pl.steps.filter((x) => !['preheat', 'bake', 'done'].includes(x.id)).every((x) => x.at.getHours() >= 7 && x.at.getHours() * 60 + x.at.getMinutes() <= 23 * 60);
  check(plan.steps.length === 9 && plan.end.getHours() === 10 && hrs('fridge', 'bake') === 12 && hrs('mix', 'shape') === 5 && awake(plan) && !plan.note && plan.steps.every((x) => x.at.getMinutes() % 5 === 0), `bake plan for 10 AM: ${Math.round(plan.hours)} h, 12 h cold proof, 5 h bulk at 75°F, no step before 7 AM`);
  const noon = SD.bakePlan({ ready: '2026-10-03T13:00', temp: 72, retard: true });
  const late = SD.bakePlan({ ready: '2026-10-03T17:00', temp: 72, retard: true });
  check(awake(noon) && noon.proofH !== 12 && noon.proofH >= 8 && noon.proofH <= 16 && !awake(late) && !!late.note, `a 1 PM bake stretches the cold proof to ${noon.proofH} h to keep you out of bed; a 5 PM bake says it runs overnight`);
  const cold = SD.bakePlan({ ready: '2026-10-03T17:00', temp: 68, retard: false });
  check((cold.steps.find((x) => x.id === 'shape').at - cold.steps.find((x) => x.id === 'mix').at) / 3600000 > 6, 'a colder kitchen gets a longer bulk');
  const sd = SD.defaultSourdough();
  SD.feed(sd, new Date('2026-09-27T08:00:00'));
  const s1 = SD.starterState(sd, new Date('2026-09-27T10:00:00'));
  const s2 = SD.starterState(sd, new Date('2026-09-27T13:30:00'));
  const s3 = SD.starterState(sd, new Date('2026-09-28T09:00:00'));
  check(s1.state === 'rising' && s2.state === 'peak' && s3.state === 'hungry', `starter: ${s1.state} at 2 h, ${s2.state} at 5.5 h, ${s3.state} next day`);
  const vcf = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Entine;Val;;;', 'FN:Val Entine', 'BDAY:1985-02-14', 'END:VCARD', 'BEGIN:VCARD', 'FN:Sam Fourth', 'BDAY;X-APPLE-OMIT-YEAR=1604:1604-07-04', 'END:VCARD', 'BEGIN:VCARD', 'FN:No Birthday', 'END:VCARD', 'BEGIN:VCARD', 'FN:Noel Chr', ' istmas', 'BDAY:--1225', 'END:VCARD'].join('\r\n');
  const vp = BD.parseVcf(vcf);
  check(vp.length === 3 && vp[0].y === 1985 && vp[1].m === 7 && vp[1].d === 4 && vp[1].y === null && vp[2].name === 'Noel Christmas' && vp[2].m === 12, `vCard import: ${vp.map((x) => `${x.name} ${x.m}/${x.d}${x.y ? '/' + x.y : ''}`).join(', ')}`);
  const cp = BD.parseCsv('First Name,Last Name,Birthday\r\nCasey,Csv,3/3\r\n"Quote, Person",,"July 4, 1990"\r\nBad,Row,notadate\r\n');
  check(cp.length === 2 && cp[0].name === 'Casey Csv' && cp[0].m === 3 && cp[1].name === 'Quote, Person' && cp[1].m === 7 && cp[1].y === 1990, `CSV import: ${cp.map((x) => `${x.name} ${x.m}/${x.d}`).join('; ')}`);
  const bd = BD.defaultBirthdays();
  BD.importPeople(bd, [{ name: 'Leap Day', m: 2, d: 29, y: 2000 }, ...vp]);
  const leap = BD.nextDate(bd.people[0], '2027-01-10');
  check(leap.iso === '2027-02-28' && leap.turning === 27 && BD.upcoming(bd, '2026-12-20', 10).map((x) => x.p.name).join() === 'Noel Christmas', `birthdays: Feb 29 falls on ${leap.iso} in 2027 (turns ${leap.turning}); next 10 days from Dec 20: Noel`);
  const ics = BD.toIcs(bd);
  check((ics.match(/BEGIN:VEVENT/g) || []).length === 4 && /BYMONTHDAY=-1/.test(ics) && /TRIGGER:-PT15H/.test(ics), 'calendar file: a yearly event per person with a reminder the day before');
}

// ---------------------------------------------------------------- Entertainment
const localDay = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mod = (name) => page.evaluate((n) => JSON.parse(localStorage.getItem('mod:' + n) || 'null'), name);
await go('Entertainment');
await page.waitForSelector('.fun-hero');
await page.waitForSelector('.vice-list li');
{
  const heroT = await page.innerText('.fun-hero');
  check(/Grand Theft Auto VI/.test(heroT) && (await page.$$('.cd-tile')).length === 4 && /Latest from Rockstar/i.test(heroT), 'Entertainment opens on the GTA VI countdown');
  check((await page.$$('.vice-list li')).length === 3 && /Test newswire post one/.test(heroT) && !/Older test post four/.test(heroT), 'the three newest posts from the GTA 6 site’s feed');
  const rel = await page.$$eval('.coming-up .release .bill-name', (els) => els.map((e) => e.textContent));
  check(rel.join('|') === 'VisionQuest|Call of Duty: Modern Warfare 4|Grand Theft Auto VI|Avengers: Doomsday', `coming up, soonest first: ${rel.join(', ')}`);
  await page.screenshot({ path: path.join(OUT, 'fun.png'), fullPage: true });
}
await page.click('.coming-up .card-head .link-btn');
await page.fill('.fun-form input[aria-label="Title"]', 'Test Game');
await page.fill('.fun-form input[aria-label="Release date"]', localDay(10));
await page.click('.fun-form button[type=submit]');
await page.waitForTimeout(200);
let FD = await mod('fun');
check(FD.releases.some((r) => r.title === 'Test Game' && r.home && r.date === localDay(10)), 'add a release (counted down on Home)');
await page.click('button[aria-label="Feature Test Game at the top"]');
await page.waitForTimeout(200);
check(/Test Game/.test(await page.innerText('.fun-hero-title')) && !(await page.$('.vice-feed')), 'featuring a release moves it to the big countdown');
await page.click('button[aria-label="Feature Grand Theft Auto VI at the top"]');
await page.waitForTimeout(200);
check(/Grand Theft Auto VI/.test(await page.innerText('.fun-hero-title')), 'and back to GTA VI');
await page.click('button[aria-label="Add 10 to Totenreich Cursed: 500 kills in Cursed Mode"]');
await page.waitForTimeout(150);
await page.click('.chal:has-text("500 kills") .link-btn.num');
await page.fill('input[aria-label="Progress on Totenreich Cursed: 500 kills in Cursed Mode"]', '500');
await page.press('input[aria-label="Progress on Totenreich Cursed: 500 kills in Cursed Mode"]', 'Enter');
await page.click('input[aria-label="Rex Infernus main Easter egg"]');
await page.waitForTimeout(200);
FD = await mod('fun');
{
  const bo7 = FD.playing.find((g) => g.id === 'bo7');
  const c500 = bo7.challenges.find((c) => c.id === 'cursed-500');
  check(c500.n === 500 && c500.doneOn && bo7.challenges.find((c) => c.id === 'rex-ee').n === 1 && /Done/.test(await page.innerText('.chal:has-text("500 kills")')), 'challenge counters: +10, set to 500 (done), Easter egg ticked');
}
await page.click('.game:has-text("Teamfight Tactics") .link-btn:has-text("+ Challenge")');
await page.fill('.game:has-text("Teamfight Tactics") input[aria-label="Challenge"]', 'Reach Diamond');
await page.click('.game:has-text("Teamfight Tactics") .chal-form button[type=submit]');
await page.fill('input[aria-label="Add a game"]', 'Astro Bot');
await page.click('.now-playing .add-row button');
await page.waitForTimeout(200);
FD = await mod('fun');
check(FD.playing.find((g) => g.id === 'tft').challenges[0].text === 'Reach Diamond' && FD.playing.find((g) => g.id === 'tft').challenges[0].goal === 1 && FD.playing.some((g) => g.title === 'Astro Bot'), 'add a challenge and a game');
check(/0 of 91 watched/.test(await page.innerText('.watchlist .dd-progress')), 'watch list starts at 0 of 91');
await page.click('.wgroup-head:has-text("Phase One")');
await page.click('button[aria-label="Iron Man: watched"]');
await page.click('button[aria-label="The Incredible Hulk: skip"]');
await page.waitForTimeout(200);
FD = await mod('fun');
check(FD.mcu['iron-man'] === 'w' && FD.mcu['incredible-hulk'] === 's' && (await page.$$('.wgroup.open .watch-row')).length === 4 && /1 of 90 watched/.test(await page.innerText('.watchlist .dd-progress')), 'watched and skipped titles leave the To-watch list; skipped ones stop counting');
await page.click('.wgroup-head:has-text("Phase Two")');
await page.click('.wgroup:has-text("Phase Two") button:has-text("Mark all watched")');
await page.check('.watch-tools input[type=checkbox]');
await page.waitForTimeout(200);
{
  const rows = await page.$$eval('.wgroup.open .watch-row', (els) => els.map((e) => !!e.querySelector('.tag-key')));
  check(/7 of 90 watched/.test(await page.innerText('.watchlist .dd-progress')) && rows.length === 2 && rows.every(Boolean), `mark a whole phase watched; key titles only leaves ${rows.length} in Phase One`);
}
await page.uncheck('.watch-tools input[type=checkbox]');
await page.fill('input[aria-label="Add a title to the watch list"]', 'Agents of S.H.I.E.L.D.');
await page.fill('.watchlist input[aria-label="Year"]', '2013');
await page.click('.watchlist .add-row button');
await page.waitForTimeout(200);
FD = await mod('fun');
check(FD.mcuMine.length === 1 && /Added by you/.test(await page.innerText('.watchlist')) && /7 of 91 watched/.test(await page.innerText('.watchlist .dd-progress')), 'add your own title to the list');
{
  const nt = await page.innerText('.fun-news');
  await page.click('.fun-news .seg-btn:has-text("Marvel")');
  const mt = await page.innerText('.fun-news');
  check(/biggest games still to come/.test(nt) && /Your games/.test(nt) && /Doomsday trailer/.test(mt), 'gaming and Marvel news on the Entertainment tab');
}
await page.screenshot({ path: path.join(OUT, 'fun-after.png'), fullPage: true });

// ---------------------------------------------------------------- Guitar
await go('Learning');
await page.click('.page-tabs .seg-btn:has-text("Guitar")');
await page.waitForSelector('.practice');
await page.click('.practice .log-btns button:has-text("+20m")');
await page.waitForTimeout(150);
await page.evaluate(() => localStorage.setItem('dash.guitarTimer', String(Date.now() - 5 * 60000 - 2000)));
await page.click('.page-tabs .seg-btn:has-text("Certifications")');
await page.click('.page-tabs .seg-btn:has-text("Guitar")');
await page.waitForSelector('.practice');
check(/Stop · 5:0\d/.test(await page.innerText('.practice-acts')), `the practice timer keeps running across pages: ${(await page.innerText('.practice-acts')).split('\n')[0]}`);
await page.click('.practice-acts button:has-text("Stop")');
await page.waitForTimeout(200);
let GD = await mod('guitar');
check(GD.sessions.length === 2 && GD.sessions.reduce((a, s) => a + s.minutes, 0) === 25 && /1\s*day streak/.test(await page.innerText('.streak-badge')), 'log practice with a button and the timer; the streak starts');
await page.click('.course .seg-btn:has-text("Grade 2")');
await page.click('button[aria-label="Next module"]');
await page.fill('input[aria-label="Current lesson"]', 'Stuck in the middle');
await page.press('input[aria-label="Current lesson"]', 'Enter');
await page.waitForTimeout(150);
await page.click('.course button:has-text("Finished module 2")');
await page.waitForTimeout(200);
GD = await mod('guitar');
check(GD.course.grade === 2 && GD.course.module === 3 && GD.course.done[0].lesson === 'Stuck in the middle' && GD.course.lesson === '', 'JustinGuitar course: grade, module, lesson, finish a module');
await page.fill('input[aria-label="Changes between A and D"]', '31');
await page.click('.changes-log button');
await page.fill('input[aria-label="Changes between A and D"]', '35');
await page.click('.changes-log button');
await page.waitForTimeout(200);
GD = await mod('guitar');
check(GD.changes.length === 2 && /best 35/.test(await page.innerText('.pairs')), 'one-minute changes: two A–D scores, best 35');
await page.fill('input[aria-label="Song title"]', 'Wish You Were Here');
await page.fill('input[aria-label="Artist"]', 'Pink Floyd');
await page.click('.songs .add-row button');
await page.waitForTimeout(150);
await page.selectOption('select[aria-label="Wish You Were Here status"]', 'can');
await page.waitForTimeout(150);
GD = await mod('guitar');
check(GD.songs.length === 1 && GD.songs[0].status === 'can' && GD.songs[0].learned, 'songs: add one, then mark it Can play');
await page.click('.tools .seg-btn:has-text("Metronome")');
await page.click('button[aria-label="5 faster"]');
await page.click('.metronome .btn.block');
await page.waitForTimeout(700);
const beatOn = (await page.$$('.met-dot.on')).length;
await page.click('.metronome .btn.block');
check(/85/.test(await page.innerText('.met-n')) && beatOn === 1 && /Start metronome/.test(await page.innerText('.metronome')), 'metronome: tempo up to 85, beats light up, stops');
await page.screenshot({ path: path.join(OUT, 'guitar.png'), fullPage: true });

// ---------------------------------------------------------------- Sourdough
await go('Cooking');
await page.click('.page-tabs .seg-btn:has-text("Sourdough")');
await page.waitForSelector('.starter');
check(/No feedings logged yet/.test(await page.innerText('.starter')), 'a new starter has no feedings');
await page.click('.starter button:has-text("Fed it now")');
await page.waitForTimeout(200);
check(/Rising/.test(await page.innerText('.starter-state')) && /peak around/.test(await page.innerText('.starter-state')) && !!(await page.$('.rise-bar')), `feeding starts the rise: ${(await page.innerText('.starter-state')).replace(/\n/g, ' · ')}`);
await page.selectOption('select[aria-label="Feeding ratio (starter:flour:water)"]', '1:5:5');
await page.fill('input[aria-label="When you want the bread done"]', `${localDay(3)}T17:00`);
await page.waitForTimeout(250);
let SDD = await mod('sourdough');
{
  const when = await page.$$eval('.timeline .tl-when', (els) => els.map((e) => e.textContent));
  check(SDD.starter.ratio === '1:5:5' && SDD.plan.ready === `${localDay(3)}T17:00` && when.length === 9 && /5:00 PM$/.test(when[8]) && when.every((w) => /:\d[05] (AM|PM)$/.test(w)), `bake planner: ${when[0]} → ${when[8]}`);
}
{
  const out = () => page.$$eval('.calc-out tr', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
  const a = await out();
  await page.check('.dough-calc .check-line input');
  await page.selectOption('select[aria-label="Loaves"]', '2');
  await page.waitForTimeout(200);
  const b = await out();
  check(/Flour 500 g/.test(a[0]) && /Dough 985 g/.test(a[4]) && /Flour 900 g/.test(b[0]) && /Water 650 g/.test(b[1]) && /Dough 1770 g · 885 g a loaf/.test(b[4]), `dough calculator: ${a[4]} → ${b[4]}`);
}
await page.click('.bakes .link-btn');
await page.click('.bake-form button[aria-label="4 stars"]');
await page.fill('.bake-form textarea', 'Good oven spring');
await page.click('.bake-form button[type=submit]');
await page.waitForTimeout(200);
SDD = await mod('sourdough');
check(SDD.bakes.length === 1 && SDD.bakes[0].rating === 4 && SDD.bakes[0].hydration === 75 && SDD.calc.loaves === 2 && SDD.calc.adjust === true, 'bake log saved; calculator settings kept');
await page.screenshot({ path: path.join(OUT, 'sourdough.png'), fullPage: true });

// ---------------------------------------------------------------- Home: guitar, starter, birthdays, portfolio
await page.click('a.nav-item:has-text("Home")');
await page.waitForSelector('.money .big');
await page.waitForSelector('.portfolio .tk');
{
  const lc = await page.innerText(learnCard);
  check(/Guitar/.test(lc) && /🔥 1/.test(lc) && /25m today/.test(lc) && /Grade 2, module 3/.test(lc), `Home learning card has guitar: ${lc.split('\n').slice(-2).join(' ')}`);
  check(/Sourdough starter/.test(await page.innerText('.home .card:has(h2:text-is("Cooking"))')), 'Home cooking card shows the starter');
  const chipsT = await page.innerText('.chips-row');
  check(/to MW4/.test(chipsT) && /to GTA VI/.test(chipsT) && /to Doomsday/.test(chipsT) && /to Test Game/.test(chipsT), `release countdowns on Home: ${chipsT.replace(/\n/g, ' ')}`);
}
{
  await page.waitForTimeout(400);
  const tks = await page.$$eval('.portfolio .tk', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
  const pf = await page.innerText('.portfolio');
  check(tks.length === 7 && tks.every((t) => /\$\d/.test(t) && /[+-]?\d+\.\d\d%/.test(t)), `portfolio prices: ${tks.slice(0, 3).join(' | ')} …`);
  await page.click('.portfolio .seg-btn:has-text("Energy")');
  const en = await page.innerText('.portfolio .pf-news');
  check(/GOOG test headline/.test(pf) && !/Market wrap/.test(pf) && /on average today/.test(pf) && /nuclear deals/.test(en), 'portfolio headlines: news naming your companies (market wraps skipped) plus the energy/quantum/robotics themes');
  await page.click('.portfolio .seg-btn:has-text("Quantum")');
  const qs = await page.$$eval('.portfolio .pf-news .story-title', (els) => els.map((e) => e.textContent));
  check(qs.length === 1 && /quantum computer/.test(qs[0]), 'quantum headlines on their own');
  await page.screenshot({ path: path.join(OUT, 'home-portfolio.png'), fullPage: true });
  await page.click('.portfolio a:has-text("Markets news")');
  await page.waitForSelector('.news-page');
  const tabOn = await page.innerText('.news-tabs .seg-btn.on');
  const mk = await page.innerText('.news');
  check(/Markets/.test(tabOn) && /Warehouse robots/.test(mk) && /Robotics/.test(mk), 'Markets news opens from the portfolio card, tagged by theme');
  await page.click('.news-tabs .seg-btn:has-text("NYC")');
  check(/deputy mayor for housing/.test(await page.innerText('.news')), 'NYC politics in the News tab');
  await page.click('a.nav-item:has-text("Home")');
  await page.waitForSelector('.money .big');
}
await page.click('.birthdays button:has-text("Add or import birthdays")');
await page.waitForSelector('.bday-sheet');
{
  const d = new Date();
  d.setDate(d.getDate() + 3);
  await page.fill('.bday-form input[aria-label="Name"]', 'Test Person');
  await page.selectOption('.bday-form select[aria-label="Month"]', String(d.getMonth() + 1));
  await page.selectOption('.bday-form select[aria-label="Day"]', String(d.getDate()));
  await page.fill('.bday-form input[aria-label="Birth year"]', '1990');
  await page.click('.bday-form button[type=submit]');
  await page.waitForTimeout(150);
  const vcf = ['BEGIN:VCARD', 'FN:Val Entine', 'BDAY:1985-02-14', 'END:VCARD', 'BEGIN:VCARD', 'FN:Sam Fourth', 'BDAY;X-APPLE-OMIT-YEAR=1604:1604-07-04', 'END:VCARD', 'BEGIN:VCARD', 'FN:No Birthday', 'END:VCARD'].join('\n');
  await page.setInputFiles('input[aria-label="Import birthdays file"]', { name: 'contacts.vcf', mimeType: 'text/vcard', buffer: Buffer.from(vcf) });
  await page.waitForSelector('.bday-sheet .ok-note');
  const m1 = await page.innerText('.bday-sheet .ok-note');
  await page.setInputFiles('input[aria-label="Import birthdays file"]', { name: 'friends.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Birthday\nVal Entine,2/14/1985\nCasey Csv,March 3\n') });
  await page.waitForFunction(() => /friends\.csv/.test(document.querySelector('.bday-sheet .ok-note').textContent));
  const m2 = await page.innerText('.bday-sheet .ok-note');
  const BDD = await mod('birthdays');
  check(BDD.people.length === 4 && /2 added/.test(m1) && /1 added/.test(m2) && /1 already here/.test(m2), `birthdays: added one, imported a .vcf (${m1.replace(/.*: /, '')}) and a .csv (${m2.replace(/.*: /, '')})`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.bday-io button:has-text("Add to Calendar")')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  check(dl.suggestedFilename() === 'birthdays.ics' && (ics.match(/BEGIN:VEVENT/g) || []).length === 4 && /Test Person’s birthday/.test(ics), 'calendar file with every birthday');
  await page.click('.bday-sheet button[aria-label="Remove Casey Csv"]');
  await page.waitForSelector('.toast-btn');
  await page.click('.toast-btn');
  await page.waitForTimeout(200);
  check((await mod('birthdays')).people.length === 4, 'removing a birthday can be undone');
  await page.screenshot({ path: path.join(OUT, 'birthdays.png') });
  await page.click('.bday-sheet .btn.primary.block');
}
await page.waitForTimeout(200);
{
  const chipsT = await page.innerText('.chips-row');
  check(/3\s*days to Test’s birthday/.test(chipsT), 'a birthday this week shows in the header');
  check(!!(await page.$('.slot.o4 .birthdays')) && /Test Person turns \d+/.test(await page.innerText('.birthdays')), 'and the Birthdays card moves up next to the to-do list');
}

// settings sheet
await go('Settings');
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
await dp.waitForTimeout(1400);
const bigAria = await dp.getAttribute('.money .big > span', 'aria-label');
check(bigAria && (await dp.innerText('.money .big')).trim() === bigAria, `money counts up to ${bigAria}`);
await dp.screenshot({ path: path.join(OUT, 'desktop.png') });
await dp.fill('input[aria-label="New to-do"]', 'Water the plants');
await dp.press('input[aria-label="New to-do"]', 'Enter');
await dp.waitForTimeout(150);
await dp.click('.todo-row:has-text("Water the plants") input[type=checkbox]');
check((await dp.$$('canvas.confetti')).length === 1, 'finishing a to-do sets off confetti');
await dp.waitForTimeout(1600);
check((await dp.$$('canvas.confetti')).length === 0, 'confetti cleans itself up');
// every tab opened directly from a fresh load (data arrives after the first render)
for (const [route, sel] of [['health', '.health-tabs'], ['learning', '.page-title'], ['cooking', '.page-title'], ['auto', '.auto-hero'], ['news', '.news']]) {
  const tp = await desk.newPage();
  const errs = [];
  tp.on('pageerror', (e) => errs.push(e.message));
  await tp.goto(`${base}#/${route}`, { waitUntil: 'networkidle' });
  await tp.waitForTimeout(400);
  const ok = !!(await tp.$(sel));
  check(ok && !errs.length, `#/${route} loads directly${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await tp.close();
}
// rain: drops on a canvas that animates, no moon or stars behind the cloud
{
  const tp = await desk.newPage();
  await tp.route('https://api.open-meteo.com/**', (route) => {
    const f = forecastFixture(40.8);
    f.current.weather_code = 63;
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(f) });
  });
  const t = new Date();
  t.setHours(22, 0, 0, 0);
  await tp.clock.install({ time: t });
  await tp.clock.resume();
  await tp.goto(base, { waitUntil: 'networkidle' });
  await tp.waitForSelector('.hero canvas.precip');
  await tp.waitForTimeout(600);
  const sample = () =>
    tp.evaluate(() => {
      const c = document.querySelector('.hero canvas.precip');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      let hash = 0;
      for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 20) (lit++, (hash = (hash * 31 + i) % 1e9));
      return { lit, hash };
    });
  const a = await sample();
  await tp.waitForTimeout(250);
  const b = await sample();
  check(a.lit > 200 && a.hash !== b.hash, `rain draws and moves (${a.lit} lit samples)`);
  check(!!(await tp.$('.hero canvas.sky-canvas')) && (await tp.$$('.hero .sky-art canvas')).length === 2, 'rain falls in front of the sky canvas');
  await tp.locator('.hero').screenshot({ path: path.join(OUT, 'hero-rain.png') });
  await tp.close();
}
// the sky engine: astronomy, weather mapping, and clouds that fit their sprites and tile seamlessly
{
  const { buildSync } = await import(path.join(ROOT, 'node_modules/esbuild/lib/main.js'));
  const file = path.join(OUT, 'sky-test.mjs');
  buildSync({ entryPoints: [path.join(ROOT, 'src/sky.jsx')], bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: file, logLevel: 'error', absWorkingDir: ROOT });
  const { sunState, moonPhase, moonArc, weatherOf, skyInternals } = await import(file);
  const at = (h, m = 0) => new Date(2026, 8, 27, h, m);
  const sun = (h, m) => sunState(at(h, m), '2026-09-27T06:43', '2026-09-27T18:43');
  const noon = sun(12, 43);
  check(noon.alt > 0.99 && Math.abs(noon.dayFrac - 0.5) < 0.01, `sun highest midway between sunrise and sunset (${noon.alt.toFixed(3)})`);
  check(sun(0, 43).alt < -0.99, 'sun lowest at solar midnight');
  const dusk = sun(19, 10);
  check(dusk.alt < 0 && dusk.alt > -0.2 && dusk.evening, `dusk just after sunset (${dusk.alt.toFixed(2)})`);
  const pFull = moonPhase(new Date(Date.UTC(2024, 8, 18, 2, 34)));
  const pNew = moonPhase(new Date(Date.UTC(2024, 9, 2, 18, 49)));
  check(Math.abs(pFull - 0.5) < 0.03 && Math.min(pNew, 1 - pNew) < 0.03, `moon phases: full Sep 18 2024 → ${pFull.toFixed(3)}, new Oct 2 2024 → ${pNew.toFixed(3)}`);
  const fm = moonArc(sun(0, 43), 0.5);
  check(fm != null && Math.abs(fm - 0.5) < 0.1 && moonArc(noon, 0.5) == null, 'full moon: high at midnight, down at noon');
  check(moonArc(sun(20, 0), 0.25) != null && moonArc(sun(4, 0), 0.25) == null, 'first quarter: up in the evening, set before dawn');
  const kinds = [0, 1, 2, 3, 45, 53, 63, 81, 95, 73, 86].map((c) => weatherOf(c).kind).join();
  check(kinds === 'clear,mostly,partly,cloudy,fog,rain,rain,rain,storm,snow,snow', `weather codes → skies: ${kinds}`);
  const fbm = skyInternals.makeNoise(7);
  let clipped = 0;
  let body = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const cu = skyInternals.cloudField(fbm, 'cumulus', 160 + seed * 14, (160 + seed * 14) * 0.5, seed, 0);
    let cov = 0;
    for (const d of cu.dens) if (d > 0) cov++;
    if (cov / cu.dens.length > 0.15 && cu.lt && cu.lbl && cu.lbr) body++;
    for (let x = 0; x < cu.cw; x++) if (cu.dens[x] > 0.05) clipped++;
    for (let y = 0; y < cu.ch; y++) if (cu.dens[y * cu.cw] > 0.05 || cu.dens[y * cu.cw + cu.cw - 1] > 0.05) clipped++;
  }
  check(body === 12 && clipped === 0, `cumulus: 12 of 12 have a lit body (${body}), none cut off at the sprite edge (${clipped} edge pixels)`);
  let seam = 0;
  for (const type of ['strat', 'cells', 'fog']) {
    const dk = skyInternals.cloudField(fbm, type, 600, 200, 5, 600);
    for (let y = 0; y < dk.ch; y++) seam += Math.abs(dk.dens[y * dk.cw] - dk.dens[y * dk.cw + dk.cw - 2]) + Math.abs(dk.dens[y * dk.cw + dk.cw - 1] - dk.dens[y * dk.cw + 1]);
  }
  check(seam < 0.01, `decks tile seamlessly (edge mismatch ${seam.toFixed(4)})`);
}
// the sky, live: fair-weather clouds drift; a clear night has stars; snow settles on the chips
{
  const open = async (code, hh, mm = 0) => {
    const tp = await desk.newPage();
    const errs = [];
    tp.on('pageerror', (e) => errs.push(e.message));
    await tp.route('https://api.open-meteo.com/**', (route) => {
      const f = forecastFixture(40.8);
      f.current.weather_code = code;
      f.current.wind_speed_10m = 10;
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(f) });
    });
    const t = new Date();
    t.setHours(hh, mm, 0, 0);
    await tp.clock.install({ time: t });
    await tp.clock.resume();
    await tp.goto(base, { waitUntil: 'networkidle' });
    await tp.waitForSelector('.hero canvas.sky-canvas');
    return { tp, errs };
  };
  const skyPx = (tp, sel = '.hero canvas.sky-canvas') =>
    tp.evaluate((sel) => {
      const c = document.querySelector(sel);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let white = 0;
      let bright = 0;
      let hash = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4 * 5) {
        n++;
        const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (l > 200) white++;
        if (l > 150 && d[i + 3] > 0) bright++;
        hash = (hash * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1e9;
      }
      return { white: white / n, bright, hash, w: c.width, h: c.height };
    }, sel);
  {
    const { tp, errs } = await open(2, 13);
    await tp.waitForTimeout(2000);
    const a = await skyPx(tp);
    await tp.waitForTimeout(1200);
    const b = await skyPx(tp);
    check(a.white > 0.01 && a.hash !== b.hash && !errs.length, `partly cloudy: clouds drawn (${(a.white * 100).toFixed(1)}% white) and drifting${errs.length ? ' · ' + errs.join(' | ') : ''}`);
    await tp.locator('.hero').screenshot({ path: path.join(OUT, 'hero-partly.png') });
    await tp.close();
  }
  {
    const { tp } = await open(0, 23, 30);
    await tp.waitForTimeout(600);
    const stars = await tp.evaluate(() => {
      const c = document.querySelector('.hero canvas.sky-canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, Math.floor(c.height * 0.6)).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if ((d[i] + d[i + 1] + d[i + 2]) / 3 > 140) n++;
      return n;
    });
    check(stars > 30, `clear night: stars and moon (${stars} bright pixels)`);
    await tp.locator('.hero').screenshot({ path: path.join(OUT, 'hero-clear-night.png') });
    await tp.close();
  }
  {
    const { tp, errs } = await open(73, 13);
    await tp.waitForSelector('.hero canvas.precip');
    await tp.waitForTimeout(3500);
    const ledge = await tp.evaluate(() => {
      const c = document.querySelector('.hero canvas.precip');
      const cb = c.getBoundingClientRect();
      const r = document.querySelector('.hero .cd').getBoundingClientRect();
      const k = c.width / cb.width;
      const y = Math.round((r.top - cb.top - 1.5) * k);
      const x0 = Math.round((r.left - cb.left + 12) * k);
      const x1 = Math.round((r.right - cb.left - 12) * k);
      const d = c.getContext('2d').getImageData(x0, y, x1 - x0, 1).data;
      let snow = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 150 && d[i] > 180) snow++;
      return snow / (x1 - x0);
    });
    const f = await skyPx(tp, '.hero canvas.precip');
    check(ledge > 0.6 && f.bright > 50 && !errs.length, `snow falls (${f.bright} bright samples) and lies on the chips (${Math.round(ledge * 100)}% of a chip's top)`);
    await tp.locator('.hero').screenshot({ path: path.join(OUT, 'hero-snow.png') });
    await tp.close();
  }
}
// demo mode: anyone with …/?demo gets the whole app on sample data, with Firebase never started, the real
// budget key in this browser left alone, the budget frame on the same sample, and reset / exit that work
{
  const { demoDocs } = await import('../src/demo-data.js');
  const docs = demoDocs(new Date());
  const b = docs['budget-tracker-v1'];
  const names = Object.keys(docs).sort().join(',');
  const y = String(new Date().getFullYear());
  check(b.historyVersion === 2 && b.configVersion === 28 && b.config.categories.length === 11 && Object.keys(b.months).length >= 8, `demo budget: ${Object.keys(b.months).length} months, current versions (so the budget module adds nothing of its own)`);
  check(['home', 'auto', 'learning', 'cooking', 'health', `health-${y}`, 'health-hk', `health-hk-${y}`, 'health-hk-ecg', 'health-hk-routes', 'fun', 'guitar', 'sourdough', 'birthdays'].every((n) => docs[n]), `demo documents: ${names}`);
  check(docs.fun.releases.every((r) => !/GTA|Grand Theft|Modern Warfare/i.test(r.title)) && !docs.fun.playing.some((g) => /Black Ops|Teamfight|Pokémon/i.test(g.title)) && docs.guitar.sessions.length > 20 && docs.sourdough.starter.feeds.length && docs.birthdays.people.length >= 5, 'demo person has their own games, guitar practice, starter and birthdays');
  check(docs.home.place.name === 'Seattle, WA' && docs.auto.car.make === 'Tesla' && docs.auto.state === 'WA' && docs.health.profile.sex === 'female' && docs['health-hk'].workouts.length > 100, 'demo person: Seattle, a Tesla, a year of Apple Health');
  const takeHome = b.config.incomes.reduce((a, i) => a + i.biweekly, 0) * 26;
  const fixed = b.config.bills.reduce((a, x) => a + x.amount, 0);
  check(takeHome > 180000 && takeHome < 220000 && fixed > 7000 && b.savings.balance > 20000, `demo finances fit a ~$300k salary: $${Math.round(takeHome).toLocaleString()} take-home a year, $${Math.round(fixed).toLocaleString()} a month in bills`);
  const json = JSON.stringify(docs);
  check(!/Dix Hills|amast126|Alec\b|Alliant|Altima|Nissan|Chipotle|tennis|Geico|Verizon/i.test(json), 'demo data has nothing from the real account or life');

  const dc = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockWeather(dc);
  // a config with a (fake) Firebase key: demo mode must not start Firebase even when it could
  await dc.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.BUDGET_CONFIG = { firebase: { apiKey: "AIzaFakeDemoCheck", authDomain: "x.firebaseapp.com", projectId: "x", appId: "1:1:web:1" }, allowedEmails: ["someone@example.com"], ownerEmail: "someone@example.com", sharedDocId: "t" };' }));
  // the link to share: a preview card for Messages and friends, then straight into the demo
  {
    const html = await (await fetch(`${base}demo.html`)).text();
    const og = (p) => (html.match(new RegExp(`property="og:${p}" content="([^"]+)"`)) || [])[1];
    const img = og('image') || '';
    const local = await fetch(`${base}${img.split('/').pop()}`);
    check(/live demo/.test(og('title') || '') && /^https:\/\/amast126\.github\.io\/budget\/demo-preview\.jpg$/.test(img) && local.ok && Number(local.headers.get('content-length') || (await local.arrayBuffer()).byteLength) < 600000, `demo.html has a preview card: “${og('title')}”, ${img.split('/').pop()}`);
    const rp = await dc.newPage();
    await rp.goto(`${base}demo.html`);
    await rp.waitForSelector('.demo-bar', { timeout: 8000 });
    check(/\?demo/.test(rp.url()), `demo.html opens the demo (${rp.url().replace(base, '/')})`);
    await rp.close();
  }
  const google = [];
  dc.on('request', (r) => /googleapis|firebase|gstatic|google\.com/.test(new URL(r.url()).host) && google.push(r.url()));
  const tp = await dc.newPage();
  const errs = [];
  tp.on('pageerror', (e) => errs.push(e.message));
  await tp.goto(base, { waitUntil: 'networkidle' });
  await tp.evaluate(() => {
    localStorage.setItem('budget-tracker-v1', 'REAL-DATA-SENTINEL');
    // an older sample left over from a previous visit gets replaced by the current one
    localStorage.setItem('demo:meta', JSON.stringify({ version: 1 }));
    localStorage.setItem('demo:home', JSON.stringify({ version: 1, place: { name: 'Oldtown, NY', lat: 1, lon: 1 }, todos: [] }));
  });
  await tp.waitForSelector('.gate');
  check(/Try the demo/.test(await tp.innerText('.gate')), 'the sign-in screen offers the demo');
  await tp.click('.gate button:has-text("Try the demo")');
  await tp.waitForSelector('.demo-bar');
  await tp.waitForSelector('.hero');
  await tp.waitForTimeout(600);
  check(/[?&]demo/.test(tp.url()) && /Good (morning|afternoon|evening), Jordan/.test(await tp.innerText('.hero')), `demo opens without signing in: ${(await tp.innerText('.hero-title')).trim()}`);
  check((await tp.$$('.lring')).length === 4 && /Seattle, WA/.test(await tp.innerText('.weather')) && /2024 Tesla Model Y/.test(await tp.innerText('.main')), 'demo home: rings, Seattle weather, the sample car');
  const chips = await tp.innerText('.chips-row');
  check(!/GTA/.test(chips) && !/inspection/.test(chips) && /AIF-C01 exam/.test(chips) && /to Dune/.test(chips) && /Maya’s birthday/.test(chips), `demo countdowns are the demo person's: ${chips.replace(/\n/g, ' ')}`);
  const spentBefore = await tp.innerText('.money .muted.small.num');
  await tp.fill('.qa input[aria-label="Amount"]', '12.34');
  await tp.fill('.qa input[aria-label="Description"]', 'Demo test lunch');
  await tp.click('.qa button[type=submit]');
  await tp.waitForTimeout(300);
  const spentAfter = await tp.innerText('.money .muted.small.num');
  check(spentBefore !== spentAfter, `quick add works in the demo (${spentBefore} → ${spentAfter})`);
  for (const [route, sel] of [['health', '.health-tabs'], ['learning', '.page-title'], ['cooking', '.kitchen'], ['auto', '.auto-hero'], ['news', '.news'], ['fun', '.fun-hero'], ['learning?guitar', '.practice'], ['cooking?sourdough', '.starter']]) {
    await tp.goto(`${base}?demo#/${route}`);
    await tp.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
    check(!!(await tp.$(sel)) && !!(await tp.$('.demo-bar')), `demo #/${route} renders`);
  }
  await tp.goto(`${base}?demo#/fun`);
  await tp.waitForSelector('.fun-hero');
  {
    const ft = await tp.innerText('.fun');
    const np = await tp.innerText('.now-playing');
    check(/Dune: Part Three/.test(await tp.innerText('.fun-hero')) && !/My GTA 6 site/.test(ft) && /Mario Kart World/.test(np) && !/Black Ops/.test(np) && /\d+ of \d+ watched/.test(ft), 'demo Entertainment is the demo person’s own');
    await tp.screenshot({ path: path.join(OUT, 'demo-fun.png'), fullPage: true });
  }
  await tp.click('a.nav-item:has-text("Budget")');
  const frame = await (await tp.waitForSelector('iframe.frame')).contentFrame();
  await frame.waitForSelector('text=Restaurants & Bars', { timeout: 10000 });
  const ftext = await frame.innerText('body');
  check(/budget-demo\.html/.test(frame.url()) && /Saved in this browser/.test(ftext) && !/Sign in with Google/.test(ftext), 'budget frame runs locally on the sample budget');
  await frame.click('text=Sep').catch(() => {});
  check(await frame.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('budget-tracker-v1'))).includes('Demo test lunch')), 'the budget frame sees the expense added on Home');
  // a change made in the budget frame reaches the rest of the app
  await frame.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('budget-tracker-v1'));
    const k = Object.keys(d.months).sort().filter((m) => d.months[m].transactions.length).pop();
    d.months[k].transactions.push({ id: 'frame-test', date: `${k}-01`, desc: 'From the frame', category: 'Shopping', amount: 100, method: 'Cash' });
    localStorage.setItem('budget-tracker-v1', JSON.stringify(d));
  });
  await tp.click('a.nav-item:has-text("Home")');
  await tp.waitForSelector('.money');
  await tp.waitForTimeout(300);
  check((await tp.innerText('.money .muted.small.num')) !== spentAfter, 'a change in the budget frame shows on Home');
  const keys = await tp.evaluate(() => ({ real: localStorage.getItem('budget-tracker-v1'), demo: Object.keys(localStorage).filter((k) => k.startsWith('demo:')).length }));
  check(keys.real === 'REAL-DATA-SENTINEL' && keys.demo >= 12, `the real budget key is untouched (${keys.demo} demo documents beside it)`);
  const idb = await tp.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : []));
  check(!google.length && !idb.some((n) => /firebase|firestore/i.test(n)), `Firebase never started (${google.length} Google requests, databases: ${idb.join(', ') || 'none'})`);
  // reset: fresh sample data, the test expense gone
  await tp.click('.demo-bar button:has-text("Reset")');
  await tp.click('.demo-bar button:has-text("Reset")');
  await tp.waitForSelector('.hero');
  await tp.waitForTimeout(500);
  const afterReset = await tp.evaluate(() => localStorage.getItem('demo:budget-tracker-v1'));
  check(!afterReset.includes('Demo test lunch') && !afterReset.includes('From the frame'), 'Reset brings back fresh sample data');
  await tp.locator('.app').screenshot({ path: path.join(OUT, 'demo-home.png') });
  // exit: back to the sign-in screen, the demo a click away
  await tp.click('.demo-bar button:has-text("Exit demo")');
  await tp.waitForSelector('.gate');
  check(!/[?&]demo/.test(tp.url()) && !(await tp.$('.demo-bar')), 'Exit demo goes back to the sign-in screen');
  check(!errs.length, `no errors in the demo${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await dc.close();
}
// the owner can switch into demo mode from Settings and back again
{
  const tp = await desk.newPage();
  const errs = [];
  tp.on('pageerror', (e) => errs.push(e.message));
  await tp.goto(base, { waitUntil: 'networkidle' });
  await tp.waitForSelector('.hero');
  await tp.click('.nav-settings');
  await tp.waitForSelector('.settings-demo');
  check(/Demo mode/.test(await tp.innerText('.sheet')) && !!(await tp.$('.sheet button:has-text("Sign out")')), 'Settings on the account offers demo mode');
  await tp.click('.sheet button:has-text("Copy the demo link")');
  await tp.waitForSelector('.toast');
  check(/Demo link( copied|: http.*\/budget\/demo\.html)/.test(await tp.innerText('.toast')), `copy the demo link: ${await tp.innerText('.toast')}`);
  await tp.click('.sheet button:has-text("Switch to demo mode")'); // Settings stays open after copying
  await tp.waitForSelector('.demo-bar');
  await tp.waitForSelector('.hero');
  await tp.waitForTimeout(300);
  check(/[?&]demo/.test(tp.url()) && /Jordan/.test(await tp.innerText('.hero-title')) && /Back to my dashboard/.test(await tp.innerText('.demo-bar')), 'switched to demo: sample data, with a way back');
  await tp.click('.nav-settings');
  check(/You’re in demo mode/.test(await tp.innerText('.sheet')) && !(await tp.$('.sheet button:has-text("Sign out")')), 'Settings in demo mode offers the way back, not sign out');
  await tp.click('.sheet button:has-text("Back to my dashboard")');
  await tp.waitForSelector('.hero');
  await tp.waitForTimeout(300);
  check(!/[?&]demo/.test(tp.url()) && !(await tp.$('.demo-bar')) && /Alec/.test(await tp.innerText('.hero-title')), 'back on the real dashboard');
  check(!errs.length, `no errors switching in and out${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await tp.close();
}
// the sky at different times of day
for (const [label, hh, want] of [['night', 22, 'sky-night'], ['golden', 18, 'sky-golden'], ['morning', 9, 'sky-day']]) {
  const tp = await desk.newPage();
  const t = new Date();
  t.setHours(hh, hh === 18 ? 25 : 30, 0, 0);
  await tp.clock.setFixedTime(t);
  await tp.goto(base, { waitUntil: 'networkidle' });
  await tp.waitForSelector('.hero');
  await tp.waitForTimeout(300);
  const cls = await tp.getAttribute('.hero', 'class');
  const line = await tp.innerText('.hero-line').catch(() => '');
  check(cls.includes(want), `${label}: ${cls} · ${line}`);
  await tp.locator('.hero').screenshot({ path: path.join(OUT, `hero-${label}.png`) });
  await tp.close();
}
await dp.click('a.nav-item:has-text("Cooking")');
await dp.waitForSelector('.cooking .kitchen');
await dp.evaluate(() => {});
await dp.waitForTimeout(300);
await dp.screenshot({ path: path.join(OUT, 'desktop-cooking.png'), fullPage: true });
await dp.click('a.nav-item:has-text("Auto")');
await dp.waitForSelector('.auto-hero');
await dp.waitForTimeout(300);
await dp.screenshot({ path: path.join(OUT, 'desktop-auto.png') });
await dp.click('a.nav-item:has-text("Health")');
await dp.waitForSelector('.health');
await dp.waitForTimeout(300);
await dp.screenshot({ path: path.join(OUT, 'desktop-health.png'), fullPage: true });
await dp.setInputFiles('.hk-import input[type=file]', HEALTH_ZIP);
await dp.waitForSelector('.hk-import .ok-note', { timeout: 20000 });
for (const v of ['Activity', 'Heart', 'Sleep', 'Body', 'Hearing']) {
  await dp.click(`.health-tabs .seg-btn:has-text("${v}")`);
  await dp.waitForTimeout(250);
  await dp.screenshot({ path: path.join(OUT, `desktop-health-${v.toLowerCase()}.png`), fullPage: true });
}

await browser.close();
server.close();
const real = errors.filter((e) => !/Failed to load resource|favicon|firestore|ERR_/.test(e));
check(real.length === 0, `no console errors${real.length ? ': ' + real.join(' | ') : ''}`);
