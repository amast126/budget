// Headless test of the dashboard at phone and desktop width with a stand-in backend.
// Budget data: a real export (path in BUDGET_EXPORT). The budget module runs in local mode from the same data,
// so a quick-add made on the home screen can be checked inside the real budget module.
// Run: ./build.sh && BUDGET_EXPORT=/path/export.json node test/run.mjs shots/
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { makeHealthExport } from './make-health-export.mjs';

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
