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
import * as NL from '../src/news-logic.js';
import * as NJ from '../scripts/fetch-news.mjs';
import { budgetUnit } from './budget-unit.mjs';
import { makeRecipes } from './make-recipes-fixture.mjs';
import { recipesUnit } from './recipes-unit.mjs';
import { recipeboxUnit } from './recipebox-unit.mjs';
import { healthUnit } from './health-unit.mjs';

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
  {
    // the GTA 6 site's content files, made up for the tests
    const m = /^\/gta6\/content\/([a-z]+)\.json$/.exec(p);
    if (m) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'test/gta6-content.fixture.json'), 'utf8'))[m[1]] || []));
    }
  }
  if (p === '/recipes.json') {
    // made-up recipes (test/make-recipes-fixture.mjs), or a real recipes.json in RECIPES_FIXTURE
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(process.env.RECIPES_FIXTURE ? fs.readFileSync(process.env.RECIPES_FIXTURE) : JSON.stringify(makeRecipes()));
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
    async readModule(user, name) {
      const v = localStorage.getItem('mod:' + name);
      return v ? JSON.parse(v) : null;
    },
    async setModule(user, name, data) {
      localStorage.setItem('mod:' + name, JSON.stringify({ ...data, updatedAt: Date.now() }));
    },
    async deleteModule(user, name) {
      localStorage.removeItem('mod:' + name);
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
        { fdcId: 2709224, description: 'Banana, raw', dataType: 'Survey (FNDDS)', foodMeasures: [{ disseminationText: '1 banana', gramWeight: 126 }, { disseminationText: '1 cup', gramWeight: 150 }], foodNutrients: [{ nutrientId: 1008, value: 97 }, { nutrientId: 1003, value: 0.74 }, { nutrientId: 1005, value: 22.71 }, { nutrientId: 1004, value: 0.28 }, { nutrientId: 1079, value: 2.6 }, { nutrientId: 2000, value: 12.23 }, { nutrientId: 1093, value: 1 }] },
        { fdcId: 999, description: 'BANANA CHIPS', dataType: 'Branded', brandOwner: 'SNACK CO', servingSize: 30, servingSizeUnit: 'g', householdServingFullText: '1 oz', foodNutrients: [{ nutrientId: 1008, value: 520 }, { nutrientId: 1003, value: 2 }, { nutrientId: 1005, value: 58 }, { nutrientId: 1004, value: 33 }] },
      ];
    else foods = [];
    route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ foods }) });
  });
  await context.route('https://world.openfoodfacts.org/**', (route) => {
    const url = route.request().url();
    if (url.includes('0818290019592'))
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: '0818290019592', product: { product_name: 'Greek yogurt, coffee', brands: 'Chobani', serving_size: '150 g', serving_quantity: 150, nutriments: { 'energy-kcal_100g': 93, proteins_100g: 7.3, carbohydrates_100g: 10.7, fat_100g: 1.3, fiber_100g: 0, sugars_100g: 8.7, sodium_100g: 0.033 } } }) });
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 0 }) });
  });
  // News photos and outlet logos (no network in tests)
  await context.route('https://img.test/**', (route) => route.fulfill({ contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, 'car.png')) }));
  await context.route('https://www.google.com/s2/favicons**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="#2c5b86"/></svg>' }));
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
// the Budget tab's rules and the alerts job, on made-up data
await budgetUnit(check);
await recipesUnit(check);
await recipeboxUnit(check);
await healthUnit(check);
// Phones: tabs are in the sidebar that slides out from the menu button.
async function go(label) {
  const direct = page.locator(`.nav .nav-item:has-text("${label}")`).first();
  if (await direct.isVisible()) return direct.click();
  await page.click('.menu-btn');
  await page.click(`.nav.open .nav-item:has-text("${label}")`);
  await page.waitForTimeout(80);
}

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForSelector('.money .big');
await page.screenshot({ path: path.join(OUT, 'home.png'), fullPage: true });
const txt = await page.innerText('.main');
check(/Left to spend|Over budget by/.test(txt), 'money card renders');
check(/Next payday/.test(txt), 'payday shown');
check(/Bills this week/.test(txt), 'bills card renders');
check(!/Supreme Court lets Trump/.test(txt) && !/Mark all read/.test(txt), 'news is off the home screen');
// phone navigation: a menu button (bottom left, naming the tab you're on) opens a sidebar with every tab
{
  const navShown = () => page.locator('.nav').isVisible();
  check((await page.isVisible('.menu-btn')) && /Home/.test(await page.innerText('.menu-btn')) && !(await navShown()), 'phones: a menu button instead of a tab bar, sidebar closed');
  await page.click('.menu-btn');
  await page.waitForSelector('.nav.open');
  const items = await page.$$eval('.nav.open .nav-item', (els) => els.map((e) => e.innerText.trim()));
  check(items.join('|') === 'Home|News|Budget|Health|Entertainment|Learning|Cooking|Auto|Settings' && (await page.getAttribute('.menu-btn', 'aria-expanded')) === 'true' && /Home/.test(await page.innerText('.nav .nav-item.active')), `the sidebar lists every tab: ${items.join(', ')}`);
  await page.screenshot({ path: path.join(OUT, 'phone-sidebar.png') });
  await page.click('.nav-scrim', { position: { x: 360, y: 400 } });
  await page.waitForTimeout(450);
  check(!(await navShown()), 'tapping outside closes it');
  await page.click('.menu-btn');
  await page.waitForSelector('.nav.open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  check(!(await navShown()), 'so does Escape');
  await page.click('.menu-btn');
  await page.waitForSelector('.nav.open');
  await page.evaluate(() => {
    const nav = document.querySelector('.nav');
    const t = (x) => new Touch({ identifier: 1, target: nav, clientX: x, clientY: 400 });
    nav.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(220)], changedTouches: [t(220)] }));
    nav.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [t(150)], changedTouches: [t(150)] }));
    nav.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [t(90)], changedTouches: [t(90)] }));
    nav.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t(90)] }));
  });
  await page.waitForTimeout(450);
  check(!(await navShown()), 'and swiping it to the left');
  await page.click('.menu-btn');
  await page.click('.nav.open .nav-item:has-text("Entertainment")');
  await page.waitForSelector('.vice-zone');
  await page.waitForTimeout(450);
  check(!(await navShown()) && /Entertainment/.test(await page.innerText('.menu-btn')), 'picking a tab opens it and closes the sidebar; the button shows where you are');
  await go('Home');
  await page.waitForSelector('.money .big');
}
{
  const edge = await page.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    // the sky's real pixels along the top edge and at the bottom of the screen
    const c = document.querySelector('.page-sky canvas');
    const k = c.width / c.getBoundingClientRect().width;
    const avg = (y) => {
      const d = c.getContext('2d').getImageData(0, Math.round(y * k), c.width, 1).data;
      const s = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) s[j] += d[i + j];
      return s.map((v) => v / (d.length / 4));
    };
    return {
      tone: document.documentElement.style.getPropertyValue('--sky-top'),
      bottom: document.documentElement.style.getPropertyValue('--sky-bottom'),
      bg: cs('html').backgroundColor,
      meta: document.querySelector('meta[name="theme-color"]').content,
      stripTop: cs('.sky-edge.top').backgroundColor,
      stripBottom: cs('.sky-edge.bottom').backgroundColor,
      scrim: cs('.nav-scrim').display,
      h: document.querySelector('.page-sky').getBoundingClientRect().height,
      vh: innerHeight,
      pxTop: avg(1),
      pxBottom: avg(innerHeight - 4),
    };
  });
  const nums = (c) => (c.match(/\d+/g) || []).slice(0, 3).map(Number);
  const near = (a, b) => a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= 12);
  check(/^rgb/.test(edge.tone) && nums(edge.bg).join() === nums(edge.tone).join() && edge.meta === edge.tone && edge.h > edge.vh + 100, `the sky reaches past the screen's edges and the page color matches its top (${edge.tone})`);
  check(near(nums(edge.stripTop), edge.pxTop) && near(nums(edge.stripBottom), edge.pxBottom) && edge.scrim === 'none', `Safari's bars get the sky's own edge colors (top ${edge.stripTop} vs sky ${edge.pxTop.map(Math.round)}, bottom ${edge.stripBottom} vs sky ${edge.pxBottom.map(Math.round)}, scrim ${edge.scrim}); nothing else full-width sits at the edges`);
}
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
    const c = document.querySelector('.page-sky canvas.sky-canvas') || document.querySelector('.hero canvas.sky-canvas'); // glass: the sky is behind the whole page
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
  const night = /sky-(night|dusk)/.test(await page.getAttribute('.hero', 'class')); // a dark overcast night has little texture to show
  check(px.opaque > 0.99 && px.spread > (night ? 3 : 12), `still sky painted (opaque ${px.opaque.toFixed(2)}, tonal range ${Math.round(px.spread)})`);
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

// news tab: For you, section front pages, since-you-last-looked, swipes, saves, hides, mutes, follows, search
await page.evaluate(() => {
  const t = '2026-09-25T15:30:00.000Z';
  localStorage.setItem('dash.newsSeen', JSON.stringify(Object.fromEntries(['foryou', 'top', 'politics', 'nyc', 'li', 'tech', 'markets', 'gaming', 'pop', 'music', 'reddit', 'saved'].map((k) => [k, t]))));
  localStorage.removeItem('dash.newsTab');
});
await go('News');
await page.waitForSelector('.news-page .news-body .st');
{
  const chips = await page.$$eval('.news-chips .nchip', (els) => els.map((e) => e.getAttribute('data-sec')));
  check(chips.join(',') === 'foryou,top,politics,nyc,li,tech,markets,gaming,pop,music,reddit,saved', `twelve sections, For you first: ${chips.join(', ')}`);
  check(/For you/.test(await page.innerText('.nchip.on')), 'opens on For you');
  const fy = await page.innerText('.news-body');
  check(/Nissan recalls some 2021 Altima/.test(fy) && /YOUR ALTIMA/i.test(fy), 'For you: an Altima recall story, marked “Your Altima”');
  check(/Dix Hills library/.test(fy) && /NEAR YOU · DIX HILLS/i.test(fy) && /LIRR adds weekend trains/.test(fy) && !/Suffolk County opens/.test(fy), 'For you: news from your town (the rest of the Long Island section stays there)');
  check(/Black Ops 7 Zombies gets a new map/.test(fy) && /YOU’RE PLAYING BLACK OPS 7/i.test(fy), 'For you: news on a game you’re playing');
  check(/IONQ shares jump/.test(fy) && /YOUR STOCKS/i.test(fy), 'For you: news naming one of your stocks (matched in the browser)');
  check(!/deputy mayor/.test(fy) && !/Supreme Court lets/.test(fy), 'For you leaves out stories about none of your things');
  const n = await page.$eval('.nchip[data-sec="politics"] .nchip-n', (e) => e.textContent).catch(() => '');
  check(n === '3', `section chips count what’s new since you last looked there (US politics: ${n})`);
  await page.screenshot({ path: path.join(OUT, 'news-foryou.png'), fullPage: true });
}
// top stories: Google's order, other outlets' coverage
await page.click('.nchip[data-sec="top"]');
await page.waitForTimeout(150);
{
  const lead = await page.innerText('.news-body .st-lead');
  check(/storm heads up the coast/.test(lead) && (await page.$('.news-body .st-lead .st-img img')) && /3 more outlets/.test(lead), 'top stories: the first story leads, with its photo and “3 more outlets”');
  await page.click('.news-body .st-lead .cov-btn');
  const cov = await page.$$eval('.news-body .st-lead .cov-list li', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
  check(cov.length === 3 && /The New York Times/.test(cov[0]) && /NPR/.test(cov[1]), `other outlets’ coverage opens under the story: ${cov[0]}`);
  check((await page.$$('.news-body .st-tile')).length === 4 && (await page.$$('.news-body .st-row')).length === 1, 'then four tiles, then the list');
  check(/1 more outlets|\+1|more outlets/.test(await page.innerText('.news-body .st-row')), 'list rows show their coverage too');
  await page.screenshot({ path: path.join(OUT, 'news-top.png'), fullPage: true });
}
// US politics: the lead is the newest story with a photo; a line marks where the stories you've seen begin
await page.click('.nchip[data-sec="politics"]');
await page.waitForTimeout(150);
{
  check(/Supreme Court lets Trump/.test(await page.innerText('.news-body .st-lead')), 'politics leads with its newest story that has a photo');
  const newDots = await page.$$eval('.news-body .st-new', (e) => e.length);
  const head = await page.innerText('.news-body .sec-head');
  check(newDots === 3 && /3 new since/.test(head), `new stories are marked (${newDots}) and counted: ${head.replace(/\n/g, ' ')}`);
  const firstLi = await page.$eval('.news-body .news-list > li', (e) => e.className);
  check(/since-line/.test(firstLi) && /You’re caught up/i.test(await page.innerText('.since-line')), 'a “You’re caught up” line where the stories you’d seen begin');
  check(!(await page.$('.nchip[data-sec="politics"] .nchip-n')), 'opening a section clears its new count');
}
const dragRow = async (title, dx) => {
  const el = await page.$(`.news-body .st-row:has-text("${title}") .st-title`);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  const b = await el.boundingBox();
  const x0 = dx > 0 ? b.x + 10 : b.x + b.width - 10;
  await page.mouse.move(x0, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + (dx * i) / 8, b.y + b.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(200);
};
const newsDoc = () => page.evaluate(() => JSON.parse(localStorage.getItem('mod:news') || 'null'));
await dragRow('Governors meet on disaster aid', 150);
{
  const d = await newsDoc();
  check(d && d.saved.length === 1 && d.saved[0].id === 'ap-x2' && d.saved[0].sec === 'politics' && /Saved for later/.test(await page.innerText('.toast')), 'swipe a story right to save it (to your account, so it syncs)');
  check((await page.$eval('.nchip[data-sec="saved"] .nchip-n', (e) => e.textContent)) === '1' && (await page.$$('.news-body .st-row .st-btn.on')).length === 1, 'the Saved chip counts it and its bookmark fills in');
  check(page.url().includes('#/news'), 'a swipe doesn’t open the story');
}
await dragRow('Supreme Court hears an election case', -150);
{
  const d = await newsDoc();
  check(d.hidden.includes('ap-x3') && !/Supreme Court hears/.test(await page.innerText('.news-body')) && /Story hidden/.test(await page.innerText('.toast')), 'swipe left hides a story');
  await page.click('.toast-btn');
  await page.waitForTimeout(200);
  check(/Supreme Court hears/.test(await page.innerText('.news-body')) && !(await newsDoc()).hidden.includes('ap-x3'), 'undo brings it back');
}
// swipe the page (or use the arrow keys) to change section
const swipeSection = (dx) =>
  page.evaluate((dx) => {
    const el = document.querySelector('.news-body .st-lead');
    const b = el.getBoundingClientRect();
    const y = b.top + 40;
    const x0 = b.left + b.width / 2;
    const mk = (type, x) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] });
    };
    el.dispatchEvent(mk('touchstart', x0));
    el.dispatchEvent(mk('touchmove', x0 + dx / 2));
    el.dispatchEvent(mk('touchend', x0 + dx));
  }, dx);
await swipeSection(-150);
await page.waitForTimeout(150);
check(/NYC/.test(await page.innerText('.nchip.on')) && /deputy mayor/.test(await page.innerText('.news-body')), 'swipe left on the page: the next section (NYC)');
await swipeSection(150);
await page.waitForTimeout(150);
check(/US politics/.test(await page.innerText('.nchip.on')), 'swipe right: back to US politics');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(100);
const afterKey = await page.innerText('.nchip.on');
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(100);
check(/NYC/.test(afterKey) && /US politics/.test(await page.innerText('.nchip.on')), 'arrow keys change section too');
// the ⋯ menu: mute an outlet (and unmute it in Tune your news)
await page.click('.news-body .st-row:has-text("Senate rejects resolution") .st-more');
await page.waitForSelector('.story-sheet');
await page.click('.story-sheet button:has-text("Mute Reuters")');
await page.waitForTimeout(200);
{
  const t = await page.innerText('.news-body');
  check(!/Senate rejects resolution/.test(t) && !/Trump told Xi/.test(t) && (await newsDoc()).muteSources.includes('Reuters'), 'muting an outlet hides all its stories');
  await page.click('button[aria-label="Tune your news"]');
  await page.waitForSelector('.tune-sheet');
  check(/Reuters/.test(await page.innerText('.tune-sheet')) && /Your car/.test(await page.textContent('.tune-sheet .fy-explain')), 'Tune your news lists the mute, and what For you looks for');
  await page.click('.tune-sheet button[aria-label="Remove Reuters"]');
  await page.fill('.tune-sheet input[aria-label="Add a word or phrase"]', 'Supreme Court');
  await page.press('.tune-sheet input[aria-label="Add a word or phrase"]', 'Enter');
  await page.fill('.tune-sheet input[aria-label="Add a topic, like Knicks or Nintendo"]', 'vinyl');
  await page.press('.tune-sheet input[aria-label="Add a topic, like Knicks or Nintendo"]', 'Enter');
  await page.waitForTimeout(150);
  await page.click('.tune-sheet .btn.primary');
  const d = await newsDoc();
  const t2 = await page.innerText('.news-body');
  check(/Trump told Xi/.test(t2) && !/Supreme Court/.test(t2) && d.muteWords.includes('Supreme Court') && d.follow.includes('vinyl'), 'unmuted Reuters; a muted word hides its stories');
}
await page.click('.nchip[data-sec="foryou"]');
await page.waitForTimeout(150);
check(/vinyl reissue/.test(await page.innerText('.news-body')) && /FOLLOWING · VINYL/i.test(await page.innerText('.news-body')), 'a followed topic shows up in For you');
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('mod:news'));
  d.muteWords = [];
  localStorage.setItem('mod:news', JSON.stringify(d));
  window.__modSubs.news.forEach((f) => f());
});
// search every section
await page.click('button[aria-label="Search news"]');
await page.fill('input[aria-label="Search every section"]', 'deputy mayor');
await page.waitForTimeout(150);
{
  const r = await page.innerText('.news-body');
  check(/Results for “deputy mayor”/i.test(r) && /Mamdani names a new deputy mayor/.test(r) && /NYC/.test(r) && (await page.$$('.news-body .st-row')).length === 1, 'search finds a story in another section, labeled with its section');
  await page.press('input[aria-label="Search every section"]', 'Escape');
  await page.waitForTimeout(100);
  check(!(await page.$('input[aria-label="Search every section"]')) && /For you/.test(await page.innerText('.nchip.on')), 'Escape closes search');
}
// Reddit: scores, comment counts and your subreddits
await page.click('.nchip[data-sec="reddit"]');
await page.waitForTimeout(150);
{
  const r = await page.innerText('.news-body');
  check(/r\/pics/.test(r) && /31\.2k/.test(r) && /2\.4k/.test(r) && /Trailer 3 breakdown/.test(r), 'Reddit shows r/popular and your subreddits with upvotes and comments');
  await page.click('.reddit-subs .chip:has-text("r/GTA6")');
  const g = await page.innerText('.news-body .news-list');
  check(/Trailer 3 breakdown/.test(g) && !/r\/pics/.test(g), 'a subreddit chip shows just that subreddit');
}
// Tech: a source that failed on the last update says so
await page.click('.nchip[data-sec="tech"]');
await page.waitForTimeout(150);
check(/The Verge didn’t answer on the last update/.test(await page.innerText('.news-body .news-note')), 'a feed that failed on the last update is named under its section');
// Saved, then removed with a swipe
await page.click('.nchip[data-sec="saved"]');
await page.waitForTimeout(150);
check(/Governors meet on disaster aid/.test(await page.innerText('.news-body')) && /US POLITICS/i.test(await page.innerText('.news-body .st-kick')), 'Saved lists what you saved, with its section');
await dragRow('Governors meet on disaster aid', -150);
check((await newsDoc()).saved.length === 0 && /Nothing saved yet/.test(await page.innerText('.news-body')), 'swipe left in Saved removes it');
// read marks
await page.click('.nchip[data-sec="politics"]');
await page.waitForTimeout(150);
{
  const readBefore = await page.$$eval('.news-body .st.read', (e) => e.length);
  await page.evaluate(() => {
    const a = document.querySelector('.news-body .st-lead .st-link');
    a.removeAttribute('target');
    a.addEventListener('click', (e) => e.preventDefault());
  });
  await page.click('.news-body .st-lead .st-title');
  const readAfter = await page.$$eval('.news-body .st.read', (e) => e.length);
  check(readAfter === readBefore + 1, `opening a story marks it read (${readBefore} → ${readAfter})`);
}
await page.screenshot({ path: path.join(OUT, 'news.png'), fullPage: true });

// ---------------- budget (native tab). Made-up merchants, a subscription, a roommate and a shared bill are added
// to the stored budget first, so the checks don't depend on (or print) anything from the real export.
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayL = ymd(new Date());
const curKey = todayL.slice(0, 7);
const monthsBack = (n) => {
  const d = new Date(`${curKey}-15T12:00:00`);
  d.setMonth(d.getMonth() - n);
  return ymd(d).slice(0, 7);
};
const dine = await page.evaluate(
  ({ prev, cur }) => {
    const d = JSON.parse(localStorage.getItem('budget-tracker-v1'));
    const cats = d.config.categories.map((c) => c.name);
    const dine = cats.find((c) => /dining|restaurant/i.test(c)) || cats[0];
    const misc = cats.find((c) => /misc/i.test(c)) || cats[cats.length - 1];
    const add = (k, t) => {
      d.months[k] = d.months[k] || { transactions: [], paid: {}, amounts: {}, collected: {} };
      d.months[k].transactions.push(t);
    };
    prev.forEach((k, i) => add(k, { id: `tv-${i}`, date: `${k}-12`, desc: 'Testville Pizza', category: dine, amount: 18.4, method: 'Apple Pay', dc: 'absorbed', card: 'absorbed' }));
    [...prev, cur].forEach((k, i) => add(k, { id: `sc-${i}`, date: `${k}-01`, desc: 'StreamCo Plus', category: misc, amount: k === cur ? 11.99 : 9.99, method: 'Apple Card', dc: 'absorbed', card: 'absorbed' }));
    d.config.roommates = [{ id: 'rm-test', name: 'Sam Test', venmo: 'sam-test' }];
    d.config.bills.push({ id: 'bill-test-net', name: 'Test Internet', category: 'Utilities', amount: 80, share: 0.5, card: true, day: 1, starts: '', ends: '' });
    localStorage.setItem('budget-tracker-v1', JSON.stringify(d));
    return dine;
  },
  { prev: [monthsBack(3), monthsBack(2), monthsBack(1)], cur: curKey }
);
await page.route('https://ntfy.sh/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
const ntfy = [];
page.on('request', (r) => r.url().startsWith('https://ntfy.sh/') && ntfy.push({ url: r.url(), method: r.method(), body: r.postData() }));
await page.reload({ waitUntil: 'networkidle' });
await go('Budget');
await page.waitForSelector('.budget .bud-summary');
const budTab = async (label) => {
  await page.click(`.bud-tabs .nchip:has-text("${label}")`);
  await page.waitForTimeout(250);
};
{
  const bt = await page.innerText('.budget');
  check(!(await page.$('iframe')) && /Left to spend|Over budget by/.test(bt) && /Spending budgets/.test(bt) && /Fixed costs/.test(bt) && /Expenses/.test(bt), 'Budget is part of the app now (no frame): summary, categories, bills, expenses');
  check(/Dashboard test bagel/.test(bt), 'the Home quick-add is in this month’s expenses');
  const views = await page.$$eval('.bud-tabs .nchip', (e) => e.map((x) => x.textContent));
  check(views.join('|') === 'Month|Paycheck|Spending|Savings & card|Outlook|Stocks|Year|Settings', `budget views: ${views.join(', ')}`);
  await page.waitForTimeout(300);
  const sb = await stored();
  check(sb.configVersion === 28 && sb.historyVersion === 2, 'an older budget gets the budget app’s one-time upgrade');
  await page.screenshot({ path: path.join(OUT, 'budget.png'), fullPage: true });
}
// add an expense: a merchant you've used fills in its category and usual amount
await page.fill('.ledger input[aria-label="Description"]', 'Testv');
await page.waitForSelector('.ledger .msuggest button:has-text("Testville Pizza")');
await page.click('.ledger .msuggest button:has-text("Testville Pizza")');
check((await page.inputValue('.ledger input[aria-label="Amount"]')) === '18.4' && (await page.inputValue('.ledger select[aria-label="Category"]')) === dine, 'picking a merchant fills its category and usual amount');
check((await page.$$('.ledger .rchip')).length >= 1, 'your usual merchants are one tap away');
await page.fill('.ledger input[aria-label="Amount"]', '21.60');
await page.click('.ledger button:has-text("Add expense")');
await page.waitForSelector('.toast');
await page.waitForTimeout(150);
let tv = (await stored()).months[curKey].transactions.find((t) => t.desc === 'Testville Pizza');
check(tv && tv.amount === 21.6 && tv.category === dine && tv.dc === 'pending' && /Testville Pizza/.test(await page.innerText('.ledger .txlist')), 'added from the Budget tab, shown at once');
// edit it in its sheet
await page.click('.ledger .txrow:has-text("Testville Pizza")');
await page.waitForSelector('.txn-sheet');
await page.fill('.txn-sheet input[aria-label="Amount"]', '22');
await page.click('.txn-sheet button:has-text("Save")');
await page.waitForTimeout(200);
tv = (await stored()).months[curKey].transactions.find((t) => t.desc === 'Testville Pizza');
check(tv && tv.amount === 22 && !(await page.$('.txn-sheet')), 'tap an expense to edit it');
// swipe it away, then undo
{
  const el = await page.$('.ledger .txswipe:has-text("Testville Pizza") .txrow');
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width - 20, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width - 20 - i * 20, b.y + b.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const gone = !(await stored()).months[curKey].transactions.some((t) => t.id === tv.id);
  check(gone && /Removed Testville Pizza/.test(await page.innerText('.toast')) && !(await page.$('.txn-sheet')), 'swipe left deletes an expense (without opening it)');
  await page.click('.toast-btn');
  await page.waitForTimeout(200);
  check((await stored()).months[curKey].transactions.some((t) => t.id === tv.id), 'undo brings it back');
}
// bills and what the roommate owes
{
  const box = '.budget .bill:has-text("Test Internet") input[type=checkbox]';
  check(await page.isChecked(box), 'a bill with a charge day ticks itself');
  await page.click(box);
  await page.waitForTimeout(150);
  check((await stored()).months[curKey].paid['bill-test-net'] === false && !(await page.isChecked(box)), 'untick a bill');
  await page.click(box);
  await page.waitForTimeout(150);
  check((await stored()).months[curKey].paid['bill-test-net'] === undefined, 'and tick it back');
  const rm = await page.innerText('.owed .rmate:has-text("Sam Test")');
  const href = await page.getAttribute('.owed .rmate:has-text("Sam Test") a:has-text("on Venmo")', 'href');
  check(/Test Internet/.test(rm) && /recipients=sam-test&amount=\d+\.\d\d&note=[^&]*Test%20Internet/.test(href), `Owed to you: a Venmo request, amount and note filled in (${href.split('?')[0]})`);
  const days = Number(todayL.slice(8, 10)) - 1;
  check(days < 7 || /Waiting \d+ days/.test(rm), `an unpaid share waiting a week or more says so (${days} days)`);
  await page.click('.owed input[aria-label="Sam Test paid Test Internet"]');
  await page.waitForTimeout(150);
  const col = (await stored()).months[curKey].collected['bill-test-net'];
  check(col && col['rm-test'] === true, 'tick when the roommate pays');
}
// paycheck
await budTab('Paycheck');
{
  const t = await page.innerText('.budget');
  check(/Left to spend until payday|Over this paycheck by|Add a recent payday/.test(t) && (/Coming paychecks/.test(t) || /Add a recent payday/.test(t)), 'paycheck view: what’s left until payday and the paychecks ahead');
  await page.screenshot({ path: path.join(OUT, 'budget-paycheck.png'), fullPage: true });
}
// spending: search, a merchant's history, trends, subscriptions
await budTab('Spending');
await page.fill('input[aria-label="Search expenses"]', 'testville');
await page.waitForTimeout(200);
{
  const n = await page.$$eval('.bud-search .txlist > li', (e) => e.length);
  check(n === 4, `search finds it in every month (${n})`);
  await page.click('.bud-search button:has-text("Everything at Testville Pizza")');
  await page.waitForSelector('.merchant-sheet');
  const mt = await page.innerText('.merchant-sheet');
  check(/4 visits/.test(mt) && !!(await page.$('.merchant-sheet .chart svg')), 'a merchant’s history: visits, totals and a chart');
  await page.click('.merchant-sheet .x');
  check(!!(await page.$('.trends .chart svg')) && (await page.$$('.trends .trend-rows > li')).length >= 2, 'trends by category');
  const st = await page.innerText('.subs');
  check(/StreamCo Plus/.test(st) && /Up from \$9\.99/.test(st), 'subscription radar finds a repeating charge and its price rise');
  await page.fill('input[aria-label="Search expenses"]', '');
  await page.screenshot({ path: path.join(OUT, 'budget-spending.png'), fullPage: true });
}
// outlook: net worth (a reading saved this month) and what's coming
await budTab('Outlook');
{
  const t = await page.innerText('.budget');
  const nw = (await stored()).netWorth;
  check(/Net worth/.test(t) && /What’s coming/.test(t) && nw && nw[curKey] && nw[curKey].at === todayL, 'outlook: net worth (saved once a day) and milestones');
}
// savings and the card
await budTab('Savings & card');
if (await page.$('.sv-form')) {
  await page.fill('.sv-form input[aria-label="Amount"]', '25');
  await page.fill('.sv-form input[aria-label="Note"]', 'Test deposit');
  await page.click('.sv-form button:has-text("Log it")');
  await page.waitForTimeout(200);
  const e = (await stored()).savings.entries.find((x) => x.note === 'Test deposit');
  check(e && e.amount === 25 && e.type === 'deposit', 'log a savings deposit');
  await page.click('.toast-btn');
  await page.waitForTimeout(150);
  check(!(await stored()).savings.entries.some((x) => x.note === 'Test deposit'), 'and undo it');
  check(/Card balance/.test(await page.innerText('.budget')) || !(await stored()).card, 'the Apple Card panel');
}
// stocks: prices refresh on open (made-up quotes)
await budTab('Stocks');
{
  const p = (await stored()).portfolio;
  if (p && p.holdings.length) {
    await page.waitForTimeout(800);
    const p2 = (await stored()).portfolio;
    check(p2.refreshedAt && Object.keys(p2.quotes).length >= 1, 'stock prices refresh when the view opens');
  } else check(!!(await page.$('.bud-stocks, .budget .card')), 'stocks view renders');
}
await budTab('Year');
check(!!(await page.$('.ytable')), 'the year: a table by category and month');
// settings: rename a category (expenses follow), alerts, a bill
await budTab('Settings');
{
  await page.fill(`input[aria-label="Rename ${dine}"]`, `${dine} X`);
  await page.press(`input[aria-label="Rename ${dine}"]`, 'Enter');
  await page.waitForTimeout(200);
  let sb = await stored();
  const moved = Object.values(sb.months).flatMap((m) => m.transactions).filter((t) => t.desc === 'Testville Pizza');
  check(sb.config.categories.some((c) => c.name === `${dine} X`) && moved.every((t) => t.category === `${dine} X`), 'renaming a category moves its expenses with it');
  await page.fill(`input[aria-label="Rename ${dine} X"]`, dine);
  await page.press(`input[aria-label="Rename ${dine} X"]`, 'Enter');
  await page.waitForTimeout(200);
  check((await stored()).config.categories.some((c) => c.name === dine), 'and back');
  await page.click('.alerts button:has-text("Set up alerts")');
  await page.waitForTimeout(200);
  sb = await stored();
  const topic = sb.config.alerts && sb.config.alerts.topic;
  check(/^dash-[a-z2-9]{26}$/.test(topic || ''), 'phone alerts get a long random ntfy topic');
  await page.click('.alerts button:has-text("Send a test")');
  await page.waitForTimeout(300);
  check(ntfy.length === 1 && ntfy[0].url === `https://ntfy.sh/${topic}` && ntfy[0].method === 'POST', 'Send a test posts to that topic');
  await page.click('.alerts input[type=checkbox] >> nth=0');
  await page.waitForTimeout(150);
  check((await stored()).config.alerts.bills === false, 'each kind of alert can be turned off');
  await page.click('.budget button[aria-label="Edit Test Internet"]');
  await page.waitForSelector('.bill-sheet');
  await page.fill('.bill-sheet input[aria-label="Amount charged"]', '90');
  await page.click('.bill-sheet button:has-text("Save")');
  await page.waitForTimeout(150);
  check((await stored()).config.bills.find((b) => b.id === 'bill-test-net').amount === 90, 'edit a bill in its sheet');
  await page.screenshot({ path: path.join(OUT, 'budget-settings.png'), fullPage: true });
}
// import an Apple Card statement (a made-up one)
{
  const mm = curKey.slice(5);
  const yy = curKey.slice(0, 4);
  const csv = [
    'Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD),Purchased By',
    `${mm}/02/${yy},${mm}/03/${yy},"TESTVILLE PIZZA 0042 NEW YORK, NY",Testville Pizza,Restaurants,Purchase,14.25,Test Person`,
    `${mm}/03/${yy},${mm}/04/${yy},ZZTOP GADGETS ONLINE,Zztop Gadgets,Shopping,Purchase,49.99,Test Person`,
    `${mm}/01/${yy},${mm}/02/${yy},STREAMCO PLUS,StreamCo Plus,Other,Purchase,11.99,Test Person`,
    `${mm}/01/${yy},${mm}/02/${yy},TEST INTERNET CO,Test Internet,Utilities,Purchase,86.50,Test Person`,
    `${mm}/04/${yy},${mm}/04/${yy},ACH DEPOSIT INTERNET TRANSFER,Payment,Payment,Payment,-500.00,Test Person`,
  ].join('\n');
  const file = path.join(OUT, 'test-statement.csv');
  fs.writeFileSync(file, csv);
  await page.click('.bud-import');
  await page.setInputFiles('.import-sheet input[type=file]', file);
  await page.waitForSelector('.imp-list');
  const it = await page.innerText('.import-sheet');
  check(/2 new expenses, 1 already logged, 1 bill, 1 skipped/.test(it) && /1 merchant you haven’t used before/.test(it), `import review: ${(it.match(/\d+ new expenses[^.]*/) || [''])[0]}`);
  await page.screenshot({ path: path.join(OUT, 'budget-import.png') });
  await page.click('.import-sheet button:has-text("Add 2 expenses")');
  await page.waitForTimeout(250);
  const sb = await stored();
  const imp = sb.months[curKey].transactions.filter((t) => t.src === 'csv');
  check(imp.length === 2 && imp.every((t) => t.ext) && imp.find((t) => /Testville/.test(t.desc)).category === dine && sb.months[curKey].amounts['bill-test-net'] === 86.5, 'import adds the new ones (known merchant, known category) and notes the bill’s real charge');
  await page.click('.bud-import');
  await page.setInputFiles('.import-sheet input[type=file]', file);
  await page.waitForTimeout(250);
  check(/0 new expenses/.test(await page.innerText('.import-sheet')) && /Nothing new to add/.test(await page.innerText('.import-sheet')), 'the same statement again adds nothing');
  await page.click('.import-sheet .x');
}
// the Apple Pay shortcut's link opens the add sheet, filled in
await page.goto(`${base}#/add?amount=%2412.34&merchant=TESTVILLE%20PIZZA%20%23123`);
await page.waitForSelector('.add-sheet');
{
  check((await page.inputValue('.add-sheet input[aria-label="Description"]')) === 'Testville Pizza' && (await page.inputValue('.add-sheet input[aria-label="Amount"]')) === '12.34' && (await page.inputValue('.add-sheet select[aria-label="Category"]')) === dine, 'the Apple Pay link opens “Log this purchase” with the merchant matched');
  await page.screenshot({ path: path.join(OUT, 'budget-addlink.png') });
  await page.click('.add-sheet button:has-text("Add to budget")');
  await page.waitForTimeout(250);
  check((await stored()).months[curKey].transactions.some((t) => t.desc === 'Testville Pizza' && t.amount === 12.34) && !(await page.$('.add-sheet')) && /#\/$/.test(page.url()), 'one tap adds it and lands on Home');
}
// Home's quick add knows your merchants too
await page.waitForSelector('.qa');
await page.fill('.qa input[aria-label="Description"]', 'Testv');
await page.waitForSelector('.qa .msuggest button:has-text("Testville Pizza")');
await page.click('.qa .msuggest button:has-text("Testville Pizza")');
check((await page.inputValue('.qa select[aria-label="Category"]')) === dine && (await page.inputValue('.qa input[aria-label="Amount"]')) !== '', 'Home quick add suggests merchants and fills them in');
await page.fill('.qa input[aria-label="Description"]', '');
await page.fill('.qa input[aria-label="Amount"]', '');
{
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `no sideways scrolling on a phone (${w}px)`);
}

// ---------------- learning
await go('Home');
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
await go('Home');
await page.waitForSelector('.money .big');
check(/exam in 20 days/.test(await page.innerText(learnCard)), 'Home learning card shows exam countdown');
await page.screenshot({ path: path.join(OUT, 'home-learning.png'), fullPage: true });


// ---------------- cooking: the recipe box (search, a recipe's page, servings, cook mode, import, add, edit, delete)
await go('Home');
await page.waitForSelector('.money .big');
check(/Cooking/.test(await page.innerText('.col:nth-child(2)')) && /Grocery list/.test(await page.innerText('.col:nth-child(2)')), 'Home shows the Cooking card');
await go('Cooking');
await page.waitForSelector('.cooking .cook-hero');
const rbox = () => page.evaluate(() => JSON.parse(localStorage.getItem('mod:recipebox') || 'null'));
const SEARCH = 'input[aria-label="Search your recipes"]';
await page
  .waitForFunction(() => {
    const b = JSON.parse(localStorage.getItem('mod:recipebox') || 'null');
    const c = JSON.parse(localStorage.getItem('mod:cooking') || 'null');
    return b && b.recipes.length === 2 && c && Array.isArray(c.mine) && c.mine.length === 0;
  }, null, { timeout: 5000 })
  .catch(() => {});
let RBX = await rbox();
let C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(RBX && RBX.recipes.map((r) => r.id).join() === 'mine-chipotle-steak,mine-chipotle-guac' && RBX.recipes[0].steps.length === 1 && C.mine.length === 0, 'the two starter recipes moved from My recipes into the recipe box');
await page.waitForSelector('.rb-grid .rb-tile');
check((await page.$$('.rb-grid .rb-tile')).length === 2 && /2\s*recipes/.test(await page.innerText('.cook-hero')), 'Recipes: the box shows them and the hero counts them');
await page.screenshot({ path: path.join(OUT, 'cooking-box.png'), fullPage: true });
// search
await page.fill(SEARCH, 'guac');
await page.waitForSelector('.cook-results .rs');
{
  const titles = await page.$$eval('.cook-results .rs-title', (e) => e.map((x) => x.textContent));
  const marks = await page.$$eval('.cook-results mark', (e) => e.map((x) => x.textContent.toLowerCase()));
  check(titles.join('|') === 'Chipotle-style guacamole' && marks.includes('guac'), `search by name, the match highlighted (${titles.join(', ')})`);
}
await page.fill(SEARCH, 'avocado');
await page.waitForTimeout(100);
check(/Uses hass avocados/i.test(await page.innerText('.cook-results')), 'search by ingredient says which ingredient matched');
await page.fill(SEARCH, 'zzzz');
await page.waitForTimeout(100);
check(/Nothing in your recipe box/.test(await page.innerText('.cook-results')), 'no match: says so');
await page.fill(SEARCH, 'steak');
await page.press(SEARCH, 'Enter');
await page.waitForSelector('.rp .rp-title');
{
  const ings = await page.$$eval('.rp-ing .ri-list:not(.pantry) > li:not(.ri-h)', (e) => e.length);
  check((await page.innerText('.rp-title')) === 'Chipotle-style steak' && (await page.evaluate(() => location.hash)).includes('?r=mine-chipotle-steak') && ings === 10 && /Grill at 425/.test(await page.innerText('.rp-steps')), `Enter opens the top result with its ${ings} ingredients and steps`);
  await page.fill('input[aria-label="Times the recipe"]', '2');
  await page.waitForTimeout(100);
  const first = await page.innerText('.rp-ing .ri-list > li:first-child .ri-amt');
  check(first === '4–5 lb', `a recipe without a serving count scales as a batch (2× → ${first})`);
  await page.fill('input[aria-label="Times the recipe"]', '1');
}
await page.screenshot({ path: path.join(OUT, 'cooking-recipe-mine.png'), fullPage: true });
await page.click('.rp-back');
await page.waitForSelector('.cook-hero');
check((await page.inputValue(SEARCH)) === 'steak' && !!(await page.$('.cook-results')), 'Back returns to the search as it was');
await page.fill(SEARCH, '');
// import a recipe file: one recipe with a photo and card amounts for 4, one without
const dish = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 600;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 800, 600);
  g.addColorStop(0, '#c2553a');
  g.addColorStop(1, '#f2c14e');
  x.fillStyle = g;
  x.fillRect(0, 0, 800, 600);
  x.fillStyle = '#fffaf2';
  x.beginPath();
  x.arc(400, 300, 200, 0, 7);
  x.fill();
  return c.toDataURL('image/jpeg', 0.8);
});
const gnocchi = {
  id: 'kit-sample-gnocchi',
  title: 'Sample Sheet-Pan Gnocchi',
  subtitle: 'with Zucchini & Melty Mozzarella',
  source: 'Meal kit',
  servings: 2,
  minutes: 30,
  calories: 610,
  tags: ['Vegetarian'],
  ingredients: [
    { item: 'Shelf-stable gnocchi', amount: '12 oz', per: { 4: '24 oz' } },
    { item: 'Cherry tomatoes', amount: '8 oz', per: { 4: '16 oz' } },
    { item: 'Zucchini', amount: '1', per: { 4: '2' } },
    { item: 'Mozzarella', amount: '½ cup', per: { 4: '1 cup' } },
    { item: 'Italian seasoning', amount: '1 tsp', per: { 4: '2 tsp' } },
    { item: 'Olive oil', amount: '1 tbsp', per: { 4: '2 tbsp' }, pantry: true },
    { item: 'Salt', pantry: true },
  ],
  tools: ['Sheet pan'],
  steps: [
    { title: 'Prep', text: 'Heat the oven to 450°F. Halve the tomatoes and cut the zucchini into half-moons.' },
    { title: 'Roast', text: 'Toss everything with [[1 tbsp]] olive oil and the seasoning on a sheet pan. Roast 18–20 minutes, until the gnocchi are golden.' },
    { title: 'Melt', text: 'Scatter the mozzarella over the top and roast 3 more minutes.' },
  ],
  photo: { card: dish, full: dish },
};
const importFile = path.join(OUT, 'recipes-import.json');
fs.writeFileSync(importFile, JSON.stringify({ kind: 'recipebox-import', version: 1, recipes: [gnocchi, { id: 'kit-sample-toast', title: 'Sample Plain Toast', steps: ['Toast the bread 2 minutes.'] }] }));
const dishFile = path.join(OUT, 'dish.jpg');
fs.writeFileSync(dishFile, Buffer.from(dish.split(',')[1], 'base64'));
await page.click('.rb button:has-text("Import")');
await page.setInputFiles('.rim input[type=file]', importFile);
await page.waitForSelector('.rim-list li');
check(/2 recipes · 2 new · 1 photo/.test(await page.innerText('.rim-sum')), `import preview: ${(await page.innerText('.rim-sum')).trim()}`);
await page.screenshot({ path: path.join(OUT, 'cooking-import.png') });
await page.click('.rim button:has-text("Import 2 recipes")');
await page.waitForSelector('.toast:has-text("Imported 2 recipes")');
RBX = await rbox();
{
  const gn = RBX.recipes.find((r) => r.id === 'kit-sample-gnocchi');
  const docs = await page.evaluate((st) => ['card', 'photo'].map((k) => JSON.parse(localStorage.getItem(`mod:recipebox-${k}-kit-sample-gnocchi-${st}`) || 'null')), gn && gn.photo);
  check(RBX.recipes.length === 4 && gn && gn.photo && docs.every((d) => d && /^data:image\/jpeg/.test(d.url)) && gn.ingredients[0].by[4].amt === 24, 'imported: the recipe in the box, its photo in two documents of its own');
}
await page.waitForSelector('.rb-tile:has-text("Sample Sheet-Pan Gnocchi") img[src^="data:image/jpeg"]');
check(true, 'its tile shows the photo');
// the recipe page: servings from the card, a custom amount, step amounts, cook mode
await page.click('.rb-tile:has-text("Sample Sheet-Pan Gnocchi") a');
await page.waitForSelector('.rp .rp-title');
const amts = () => page.$$eval('.rp-ing .ri-list:not(.pantry) .ri-amt', (e) => e.map((x) => x.textContent));
check((await amts()).join('|') === '12 oz|8 oz|1|½ cup|1 tsp' && !!(await page.$('.rp-photo img[src^="data:image/jpeg"]')), `as written for 2: ${(await amts()).join(', ')}`);
await page.click('button[aria-label="More servings"]');
await page.click('button[aria-label="More servings"]');
await page.waitForTimeout(100);
check((await amts()).join('|') === '24 oz|16 oz|2|1 cup|2 tsp', `4 servings uses the card’s own amounts: ${(await amts()).join(', ')}`);
await page.fill('input[aria-label="Number of servings"]', '3');
await page.waitForTimeout(100);
{
  const a3 = await amts();
  const stepAmt = await page.$$eval('.rp-steps .amt.scaled', (e) => e.map((x) => x.textContent));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dash.rb.serv') || '{}'));
  check(a3.join('|') === '18 oz|12 oz|1½|¾ cup|1½ tsp' && stepAmt.join() === '1½ tbsp' && saved['kit-sample-gnocchi'] === 3 && /Back to 2/.test(await page.innerText('.serv')), `typed 3 servings: ${a3.join(', ')}; the step says ${stepAmt.join()}`);
}
await page.click('.rp-ing .ri-list > li:first-child button');
check(!!(await page.$('.rp-ing .ri-list > li.done')), 'tapping an ingredient checks it off');
await page.screenshot({ path: path.join(OUT, 'cooking-recipe.png'), fullPage: true });
await page.click('.cook-btn');
await page.waitForSelector('.cook .cook-text');
check(/Step 1 of 3/i.test(await page.innerText('.cook-kick')) && /Heat the oven/.test(await page.innerText('.cook-text')), 'cook mode: one step at a time');
await page.click('.cook-next');
await page.click('.cook-tbtn:has-text("18–20 min")');
await page.waitForTimeout(1200);
{
  const ct = await page.innerText('.ct');
  check(/Step 2 · 18–20 min/.test(ct) && /17:5\d|18:00/.test(ct) && /1½ tbsp/.test(await page.innerText('.cook-text')), `cook mode: a timer from the step (${ct.replace(/\n/g, ' ')}), amounts scaled`);
}
await page.click('.cook-ingbtn');
check((await page.$$('.cook-ing .ri-list li.done')).length === 1, 'cook mode: ingredients on hand, with what’s checked off');
await page.click('.cook-ing .cook-x');
await page.screenshot({ path: path.join(OUT, 'cooking-cookmode.png') });
await page.click('.cook-next');
await page.click('.cook-next');
await page.waitForSelector('.cook-done');
await page.click('.cook-made');
await page.waitForTimeout(200);
RBX = await rbox();
check(!(await page.$('.cook')) && RBX.recipes.find((r) => r.id === 'kit-sample-gnocchi').made === 1, 'finishing cook mode marks it made');
await page.click('.rp-icon[aria-label="Add to favorites"]');
await page.waitForTimeout(150);
RBX = await rbox();
check(RBX.recipes.find((r) => r.id === 'kit-sample-gnocchi').fav === 1 && !!(await page.$('.rp-icon.on')), 'favorite');
// edit: a new name and a new photo; the card's amounts for 4 stay
const stamp0 = RBX.recipes.find((r) => r.id === 'kit-sample-gnocchi').photo;
await page.click('.rp-icon[aria-label="Edit recipe"]');
await page.waitForSelector('.rf');
await page.fill('.rf label:has-text("Name") input', 'Sample Gnocchi Bake');
await page.setInputFiles('.rf input[type=file]', dishFile);
await page.waitForSelector('.rf .rf-img img[src^="data:image/jpeg"]');
await page.click('.rf button:has-text("Save changes")');
await page.waitForSelector('.toast:has-text("Recipe saved")');
RBX = await rbox();
{
  const gn = RBX.recipes.find((r) => r.id === 'kit-sample-gnocchi');
  const [card, oldCard] = await page.evaluate(([a, b]) => [a, b].map((st) => localStorage.getItem(`mod:recipebox-card-kit-sample-gnocchi-${st}`)), [gn.photo, stamp0]);
  check(gn.title === 'Sample Gnocchi Bake' && gn.photo !== stamp0 && card && !oldCard && gn.ingredients[0].by[4].amt === 24 && gn.fav === 1 && gn.made === 1 && (await page.innerText('.rp-title')) === 'Sample Gnocchi Bake', 'edit: renamed with a new photo (the old one removed after saving); amounts for 4, favorite and times made kept');
}
await page.click('.rp-back');
// delete, undo, delete
await page.fill(SEARCH, 'toast');
await page.press(SEARCH, 'Enter');
await page.waitForSelector('.rp-title:text-is("Sample Plain Toast")');
await page.click('.rp-more button:has-text("Delete recipe")');
await page.click('.rp-more button:has-text("Tap again")');
await page.waitForSelector('.toast:has-text("Deleted")');
RBX = await rbox();
check(!RBX.recipes.some((r) => r.id === 'kit-sample-toast') && !!(await page.$('.cook-hero')), 'delete: gone, and back to the box');
await page.click('.toast-btn');
await page.waitForTimeout(200);
RBX = await rbox();
check(RBX.recipes.some((r) => r.id === 'kit-sample-toast'), 'Undo brings it back');
await page.fill(SEARCH, '');
// add your own
await page.click('.rb button:has-text("Add recipe")');
await page.waitForSelector('.rf');
await page.fill('.rf label:has-text("Name") input', 'Garlic butter rice');
await page.fill('.rf label:has-text("Servings") input', '4');
await page.fill('.rf label:has-text("Ingredients, one per line") textarea', '1 cup rice\n2 Tbsp butter\n3 cloves garlic, minced\nsalt');
await page.fill('.rf label:has-text("Steps") textarea', 'Rice: Simmer the rice in [[1½ cups]] water for 15 minutes.\n\nFinish: Stir in the butter and garlic.');
await page.click('.rf button:has-text("Save recipe")');
await page.waitForSelector('.rp-title:text-is("Garlic butter rice")');
RBX = await rbox();
{
  const own = RBX.recipes.find((r) => r.title === 'Garlic butter rice');
  check(own && /^mine-/.test(own.id) && own.servings === 4 && own.ingredients.length === 4 && own.ingredients[1].unit === 'tbsp' && own.steps.length === 2 && own.steps[0].title === 'Rice' && own.source === 'Mine', 'own recipe added, opened, with its steps');
}
await page.click('.rp-back');
await page.waitForSelector('.rb-grid');
check((await page.$$('.rb-grid .rb-tile')).length === 5, 'the box now holds 5 recipes');
// ---------------- cooking: the kitchen
await page.click('.cooking .page-tabs .seg-btn:has-text("Kitchen")');
await page.waitForSelector('.cooking .kitchen');
await page.screenshot({ path: path.join(OUT, 'cooking-empty.png'), fullPage: true });
check((await page.$$('.picks .pick')).length === 8 && /All 30 picks/.test(await page.innerText('.cooking .mp-more')), 'Kitchen shows 8 of this week’s 30 picks, with a way to all of them');
// kitchen: add several at once
await page.fill('input[aria-label="Add to kitchen"]', 'chicken breasts, garlic, olive oil, rice, yellow onion, soy sauce, eggs, butter, limes');
await page.click('.kitchen .add-row button[type=submit]');
await page.waitForTimeout(200);
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(C.kitchen.length === 9, `9 kitchen items saved (${C.kitchen.map((i) => i.name + '@' + i.where).join(', ')})`);
check(C.kitchen.find((i) => /Chicken/.test(i.name)).where === 'fridge' && C.kitchen.find((i) => /Rice/.test(i.name)).where === 'pantry', 'places guessed (chicken → fridge, rice → pantry)');
// a common chip
const chip = await page.$('.kitchen .chips .chip');
const chipText = chip ? (await chip.innerText()).replace('+ ', '') : '';
if (chip) await chip.click();
await page.waitForTimeout(150);
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(C.kitchen.length === 10 && C.kitchen.some((i) => i.name === chipText), `common chip adds "${chipText}"`);
// cook-now matches: your own recipe (you have everything) first
const rows = await page.$$eval('.cooking .cook-now .rc', (els) => els.map((e) => e.innerText.replace(/\n/g, ' | ')));
console.log('  cook now:', rows.slice(0, 4));
check(rows.length > 0 && /Garlic butter rice/.test(rows[0]) && /You have everything/.test(rows[0]), 'cook-with-what-you-have: your own recipe tops it (you have everything)');
// running low → grocery list
await page.click('.k-row:has-text("Butter") .low-btn');
await page.waitForTimeout(150);
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(C.kitchen.find((i) => i.name === 'Butter').low && C.grocery.some((g) => g.name === 'Butter'), 'Low adds butter to the grocery list');
// open a pick, add its missing items, save it to the box
await page.click('.picks .pick >> nth=1');
await page.waitForSelector('.rp .ri-list');
const nGroceryBefore = C.grocery.length;
await page.click('.rp-ing button:has-text("missing to groceries")');
await page.waitForTimeout(150);
C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
check(C.grocery.length > nGroceryBefore && C.grocery.some((g) => g.for && g.for.length), `recipe’s missing items added with a "for" note (${C.grocery.length - nGroceryBefore} added)`);
await page.click('.rp-cta button:has-text("Save to recipe box")');
await page.waitForTimeout(150);
RBX = await rbox();
check(RBX.recipes.some((r) => r.id.startsWith('bb-') && r.source === 'Budget Bytes' && r.ingredients.length > 3) && !(await page.$('.rp-cta button:has-text("Save to recipe box")')) && !!(await page.$('.rp-icon[aria-label="Edit recipe"]')), 'a pick saved to the recipe box with its ingredients');
await page.click('.rp-back');
await page.waitForSelector('.cooking .kitchen');
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
// ---------------- meal prep: every recipe, filters, and a plan for the week that becomes one grocery list
await page.click('.cooking .mp-more');
await page.waitForSelector('.mealprep .mp-grid');
{
  const n = () => page.$$eval('.mealprep .mp-card', (e) => e.length);
  const count = async () => Number(((await page.innerText('.mp-count')).match(/(\d+) recipe/) || [])[1]);
  check((await count()) === 30 && (await n()) === 30 && !/Show more/.test(await page.innerText('.mp-browse')), 'Meal prep: all of this week’s 30 picks');
  await page.click('.mp-browse .seg-btn:has-text("All")');
  const total = await count();
  check(total >= 44, `All: the whole pool and your own recipes (${total} recipes)`);
  await page.click('.mp-filters .chip:has-text("Meal prep")');
  const mp = await count();
  await page.click('.mp-filters .chip:has-text("Chicken & turkey")');
  const mpChicken = await count();
  check(mp > 5 && mp < total && mpChicken > 0 && mpChicken < mp, `filters: meal prep ${mp}, chicken meal prep ${mpChicken}`);
  await page.click('.mp-filters .chip:has-text("No-reheat lunches")');
  await page.click('.mp-filters .chip:has-text("Any protein")');
  const noReheat = await page.$$eval('.mealprep .mp-card', (e) => e.map((x) => x.innerText));
  check(noReheat.length >= 3 && noReheat.every((t) => /No reheat/.test(t)), `no-reheat lunches (${noReheat.length})`);
  await page.click('.mp-browse button:has-text("Clear filters")');
  await page.fill('input[aria-label="Search recipes"]', 'lentil');
  await page.waitForTimeout(150);
  check((await page.$$eval('.mealprep .mp-card', (e) => e.map((x) => x.innerText))).every((t) => /Lentil/i.test(t)) && (await n()) >= 1, 'search by name or ingredient');
  await page.fill('input[aria-label="Search recipes"]', 'gnocchi');
  await page.waitForTimeout(150);
  check((await page.$$eval('.mealprep .mp-card', (e) => e.map((x) => x.innerText))).some((t) => /Sample Gnocchi Bake/.test(t) && /Meal kit/.test(t)), 'your recipe box is in meal prep too');
  await page.fill('input[aria-label="Search recipes"]', '');
  await page.click('.mp-filters .chip:has-text("25g+ protein")');
  await page.selectOption('.mp-count select', 'protein');
  const prot = await page.$$eval('.mealprep .mp-card', (e) => e.map((x) => Number((x.innerText.match(/(\d+)g protein/) || [])[1])));
  check(prot.length > 0 && prot.every((g) => g >= 25) && prot.every((g, i) => i === 0 || g <= prot[i - 1]), `25g+ protein, most first (${prot.slice(0, 4).join(', ')}…)`);
  await page.click('.mp-browse button:has-text("Clear filters")');
  // plan three recipes, one from a recipe's own page
  const find = async (q) => {
    await page.fill('input[aria-label="Search recipes"]', q);
    await page.waitForTimeout(120);
  };
  await find('beef chili');
  await page.click('.mp-card:has-text("Sample Beef Chili") .mp-add');
  await find('lentil soup');
  await page.click('.mp-card:has-text("Sample Lentil Soup") .mp-add');
  await find('egg muffins');
  await page.click('.mp-card:has-text("Sample Egg Muffins") .mp-open');
  await page.waitForSelector('.rp .ri-list');
  await page.click('.rp-more button:has-text("Add to this week’s prep")');
  await page.click('.rp-back');
  await page.waitForSelector('.mealprep .mp-grid');
  check((await page.inputValue('input[aria-label="Search recipes"]')) === 'egg muffins', 'back from a recipe, meal prep is as you left it');
  await find('');
  await page.waitForTimeout(200);
  C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
  const pt = await page.innerText('.mp-plan');
  check(C.plan.length === 3 && C.plan.every((r) => r.keys && r.keys.length) && /3 recipes · 12 servings/.test(pt) && (await page.$$('.mp-card.planned')).length >= 2, `plan saved (${C.plan.map((r) => r.title).join(', ')})`);
  const foodBefore = C.grocery.length;
  await page.click('.mp-plan button:has-text("missing item")');
  await page.waitForTimeout(200);
  C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
  check(C.grocery.length > foodBefore && C.grocery.some((g) => (g.for || []).includes('Sample Lentil Soup')) && C.grocery.some((g) => (g.for || []).includes('Sample Beef Chili')), `the week’s missing ingredients go on the grocery list, each saying what it’s for (${C.grocery.length - foodBefore} added)`);
  await page.click('.mp-plan-row:has-text("Sample Egg Muffins") .x');
  await page.waitForTimeout(150);
  C = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:cooking')));
  check(C.plan.length === 2, 'remove one from the plan');
  await page.screenshot({ path: path.join(OUT, 'cooking-mealprep.png'), fullPage: true });
}
await go('Home');
await page.waitForSelector('.money .big');
const homeCook = await page.innerText('.col:nth-child(2)');
check(/Tonight: Garlic butter rice/.test(homeCook) && /6 recipes/.test(homeCook), `Home Cooking card suggests tonight’s dinner from your box: ${(homeCook.match(/Cooking[\s\S]{0,120}/) || [''])[0].replace(/\n/g, ' · ')}`);
check(/This week’s prep/.test(homeCook) && /2 recipes · 8 servings/.test(homeCook), 'and this week’s prep');
await page.click('.home-cooking a.home-row:has-text("Tonight")');
await page.waitForSelector('.rp-title:text-is("Garlic butter rice")');
check(true, 'Home’s tonight link opens the recipe');
await page.click('.rp-back');
await page.waitForSelector('.money .big');
check(/#\/?$/.test(await page.evaluate(() => location.hash)) || (await page.evaluate(() => location.hash)) === '', 'and Back goes back Home');
await page.screenshot({ path: path.join(OUT, 'home-cooking.png'), fullPage: true });


// ---------------- auto
await go('Home');
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
await go('Home');
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
await go('Home');
await page.waitForSelector('.health-home');
check(/Set up your target/.test(await page.innerText('.health-home')), 'Home health card asks for setup');
await go('Health');
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
// fiber, sugar and sodium from the foods that list them (the quick add doesn't)
const ntext = (await page.innerText('.nutrients')).replace(/\n/g, ' ');
check(/from 3 of 4 foods/.test(ntext) && /Fiber\s*10\s*\/\s*35g goal/.test(ntext) && /Sodium\s*54\s*\/\s*2,300mg limit/.test(ntext) && /Protein by meal/i.test(ntext), `nutrients card: ${ntext.slice(0, 160)}`);
F = await dayFood();
{
  const yog = F.find((e) => e.brand === 'Chobani');
  check(F[0].fib === 6.6 && F[0].na === 3 && yog.sug === 13.1 && yog.na === 50, `nutrients stored on entries (${F[0].fib} g fiber, ${yog.na} mg sodium)`);
}
// habits: two glasses of water, vitamins ticked
await page.click('button[aria-label="One more glass of Water"]');
await page.waitForTimeout(150);
await page.click('button[aria-label="One more glass of Water"]');
await page.click('.hb-check:has-text("Vitamins")');
await page.waitForTimeout(250);
{
  const hb = (await yDoc()).days[localToday].hb;
  check(hb && hb.water === 2 && hb.vitamins === 1, `habits saved (${JSON.stringify(hb)})`);
}
check(/2 of 8 glasses/.test(await page.innerText('.habits')), 'water shows 2 of 8 glasses');
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
// weight goal: a trend rate and when you'd get there
await page.fill('#goal-weight', '175');
await page.click('.w-goal button:has-text("Save")');
await page.waitForTimeout(250);
check((await hDoc()).goalWeight === 175 && /Trend\s*[\d.]+ lb/.test(await page.innerText('.w-goal')), `weight goal saved: ${(await page.innerText('.w-goal')).replace(/\n/g, ' ').slice(0, 140)}`);
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
 // save today's breakfast as a meal, then add it to snacks in one tap
await page.click('.meal:has-text("Breakfast") .save-meal-btn');
await page.fill('.save-meal input', 'Test breakfast combo');
await page.click('.save-meal button[type=submit]');
await page.waitForTimeout(250);
check(((await hDoc()).meals || []).length === 1 && (await hDoc()).meals[0].items.length === 1 && !('id' in (await hDoc()).meals[0].items[0]), 'breakfast saved as a meal');
const foodBefore = (await dayFood()).length;
await page.click('.meal:has-text("Snacks") button:has-text("+ Add")');
await page.waitForSelector('.add-food');
await page.click('.add-food .seg-btn:has-text("Meals")');
check(/Test breakfast combo/.test(await page.innerText('.meals-tab')) && /This week’s meal prep/i.test(await page.innerText('.meals-tab')), 'Meals tab lists saved meals and meal prep');
await page.click('.meals-tab .sm-row .rc');
await page.waitForTimeout(250);
F = await dayFood();
check(F.length === foodBefore + 1 && F[F.length - 1].meal === 'snack' && F[F.length - 1].k === 244, 'saved meal logged in one tap');
// Home card
await go('Home');
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
await page.click('.cooking .page-tabs .seg-btn:has-text("Kitchen")'); // the tab remembers Meal prep from before
await page.waitForSelector('.picks .pick');
await page.click('.picks .pick >> nth=1');
await page.waitForSelector('.rp .rp-nutri');
await page.click('.rp-more button:has-text("Log a serving to Health")');
await page.waitForTimeout(250);
check((await dayFood()).some((e) => e.key.startsWith('bb:') && e.k === 420), 'Cooking recipe logged to Health (420 cal)');
await page.click('.rp-back');

// ---------------------------------------------------------------- Apple Health import
await go('Health');
await page.waitForSelector('.health-tabs');
check((await page.$$eval('.health-tabs .seg-btn', (b) => b.map((x) => x.innerText))).join(',') === 'Today,Activity,Training,Heart,Sleep,Body,Hearing,Checkups,Report', 'Health has Today, Activity, Training, Heart, Sleep, Body, Hearing, Checkups, Report');
await page.click('.health-tabs .seg-btn:has-text("Sleep")');
check(/Import your Apple Health export/.test(await page.innerText('.health')), 'Sleep asks for an import before there is data');
await page.click('.health button:has-text("Go to the importer")');
await page.waitForSelector('.hk-import input[type=file]', { state: 'attached' });
check(/Export All Health Data/.test(await page.innerText('.hk-import')), 'importer explains how to export from the iPhone');
await page.setInputFiles('.hk-import input[type=file]', HEALTH_ZIP);
await page.waitForSelector('.hk-import .ok-note', { timeout: 20000 });
const okNote = (await page.innerText('.hk-import .ok-note')).replace(/\n/g, ' ');
check(/401 days/.test(okNote) && /60 nights/.test(okNote) && /3 workouts/.test(okNote) && /1 ECG/.test(okNote) && /3 weigh-ins added/.test(okNote), `import summary: ${okNote}`);
const HK = await page.evaluate(() => JSON.parse(localStorage.getItem('mod:health-hk')));
const HKY = await page.evaluate((y) => JSON.parse(localStorage.getItem('mod:health-hk-' + y)), Y);
const yIso = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const HKYy = yIso.slice(0, 4) === Y ? HKY : await page.evaluate((y) => JSON.parse(localStorage.getItem('mod:health-hk-' + y)), yIso.slice(0, 4));
check(HK.importedAt && HK.workouts.length === 3 && HK.ecg.length === 1 && HK.vo2.length === 4 && Object.keys(HK.months).length >= 13, 'summary document saved (workouts, ECG, VO2 max, months)');
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
{
  const zt = (await page.innerText('.wk-zones')).replace(/\n/g, ' ');
  check(/Z2 Aerobic.*10 min.*Z4 Threshold.*10 min.*Z5 Max.*10 min/.test(zt) && /max heart rate of 183/.test(zt) && /Training load 110/.test(zt), `run's heart-rate zones: ${zt.slice(0, 200)}`);
}
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
await go('Home');
await page.waitForSelector('.health-home');
const hh2 = (await page.innerText('.health-home')).replace(/\n/g, ' ');
check(/Slept 7h 15m/.test(hh2), `Home health card shows last night: ${hh2}`);
await go('Health');
await page.waitForSelector('.health-tabs');
check(/on/.test(await page.getAttribute('.health-tabs .seg-btn:has-text("Hearing")', 'class')), 'Health reopens on the last view');
await page.click('.health-tabs .seg-btn:has-text("Today")');
await page.waitForTimeout(200);
// readiness: last night's sleep and heart against the last 30 days, and yesterday's load
{
  const rt = (await page.innerText('.readiness')).replace(/\n/g, ' ');
  check(/Readiness/.test(rt) && /Normal|Ready|Take it easy/.test(rt) && /Slept 7h 15m, about your usual/.test(rt), `readiness card: ${rt.slice(0, 160)}`);
}
// sleep patterns: a perfectly regular made-up schedule, 45 minutes short of 8 hours a night
await page.click('.health-tabs .seg-btn:has-text("Sleep")');
await page.waitForTimeout(250);
{
  const ct = (await page.innerText('.consistency')).replace(/\n/g, ' ');
  check(/100/.test(ct) && /Very regular/.test(ct) && /5h 15m short/.test(ct) && /lights out by 9:15 pm/.test(ct), `sleep schedule: ${ct.slice(0, 220)}`);
  check(/What affects your sleep/.test(await page.innerText('.factors')), 'sleep factors card');
}
// training: tennis from the Watch plus the one logged by hand, notes, strength sets, a routine, load and zones
await page.click('.health-tabs .seg-btn:has-text("Training")');
await page.waitForSelector('.tennis-card');
check((await page.$$('.tn-list .rc')).length === 2, 'tennis: the Watch session and the logged one');
await page.click('.tn-list .rc >> nth=0');
await page.click('.sheet .seg-btn:has-text("Doubles")');
await page.fill('.sheet input[aria-label="Played with"]', 'Test partner');
await page.fill('.sheet input[aria-label="Score"]', '6-4 6-2');
await page.click('.sheet .seg-btn:has-text("Won")');
await page.click('.sheet button:has-text("Save")');
await page.waitForTimeout(250);
{
  const tn = Object.values((await hDoc()).tennis || {});
  check(tn.length === 1 && tn[0].kind === 'doubles' && tn[0].partner === 'Test partner' && tn[0].result === 'W', 'tennis note saved');
  check(/Won/.test(await page.innerText('.tn-list')) && /with Test partner/.test(await page.innerText('.tn-list')), 'tennis list shows the result and partner');
}
await page.selectOption('.strength select[aria-label="Exercise"]', 'bench');
await page.click('.strength .add-row button:has-text("Add")');
await page.waitForSelector('.lift');
await page.fill('input[aria-label="Bench press reps"]', '8');
await page.fill('input[aria-label="Bench press weight"]', '135');
await page.click('.lift button:has-text("Add set")');
await page.waitForTimeout(200);
await page.click('.lift button:has-text("Add set")');
await page.waitForTimeout(250);
{
  const lifts = (await yDoc()).days[localToday].lifts;
  check(lifts.length === 1 && lifts[0].ex === 'bench' && lifts[0].sets.length === 2 && lifts[0].sets[1].r === 8 && lifts[0].sets[1].lb === 135, `strength sets saved (${JSON.stringify(lifts)})`);
}
await page.click('.strength button:has-text("Save as a routine")');
await page.fill('.strength input[aria-label="Routine name"]', 'Test push');
await page.click('.strength .add-row button:has-text("Save")');
await page.waitForTimeout(250);
check(((await hDoc()).strength.routines || [])[0].name === 'Test push' && /Start Test push/.test(await page.innerText('.strength')), 'routine saved and ready to start');
{
  const lt = (await page.innerText('.load-card')).replace(/\n/g, ' ');
  check(/this week/.test(lt) && /4-week average/.test(lt) && (await page.$$('.load-card .zone-list li')).length === 5 && /Z3 Tempo.*45 min.*Z4 Threshold.*30 min/.test(lt), `training load and this week's zones: ${lt.slice(0, 260)}`);
}
await page.screenshot({ path: path.join(OUT, 'health-training.png'), fullPage: true });
// checkups: a dentist visit 7 months ago is overdue (and shows on Home); a lab result flagged high
await page.click('.health-tabs .seg-btn:has-text("Checkups")');
await page.waitForSelector('.checkups');
await page.click('.cu-row .rc:has-text("Dental cleaning")');
const sevenAgo = await page.evaluate(() => { const d = new Date(); d.setMonth(d.getMonth() - 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
await page.fill('input[aria-label="Dental cleaning last visit"]', sevenAgo);
await page.waitForTimeout(250);
check(((await hDoc()).checkups || []).find((c) => c.id === 'dentist').last === sevenAgo && /Overdue/.test(await page.innerText('.checkups')), 'dental cleaning overdue');
await page.selectOption('select[aria-label="Test"]', 'ldl');
await page.fill('input[aria-label="Result value"]', '130');
await page.click('.lab-form button:has-text("Add")');
await page.waitForTimeout(250);
check(((await hDoc()).labs || []).length === 1 && /LDL cholesterol/.test(await page.innerText('.labs')) && /High/.test(await page.innerText('.labs')), 'lab result saved and flagged high');
await page.screenshot({ path: path.join(OUT, 'health-checkups.png'), fullPage: true });
// the monthly report
await page.click('.health-tabs .seg-btn:has-text("Report")');
await page.waitForSelector('.report-card');
{
  const rp = (await page.innerText('.report-card')).replace(/\n/g, ' ');
  check(/\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/.test(rp) && /Steps a day/.test(rp) && /Sleep a night/.test(rp), `monthly report: ${rp.slice(0, 160)}`);
}
await page.screenshot({ path: path.join(OUT, 'health-report.png'), fullPage: true });
// Home: readiness on the Body ring and the Health card; the overdue checkup
await go('Home');
await page.waitForSelector('.health-home');
check(/Normal|Ready|Take it easy/.test(await page.innerText('.rings-card .lr-tag')), 'Body ring carries readiness');
check((await page.$('.health-home .home-ready')) && /Dental cleaning overdue/.test(await page.innerText('.health-home')), 'Home health card: readiness and the overdue checkup');
// the daily sync link from an iPhone Shortcut: without the key it asks first; with it, it saves right away
const agoIso = (n) => page.evaluate((n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }, n);
const d2 = await agoIso(2);
await page.evaluate((d) => (location.hash = `#/health-sync?date=${d}&steps=12,345&active=610&sleep=6:30&hrv=41&weight=181.2&weighed=${d}&water=48`), d2);
await page.waitForSelector('.sync-page h2');
check(/Save these numbers\?/.test(await page.innerText('.sync-page')) && /doesn’t carry your sync key/.test(await page.innerText('.sync-page')), 'a link without the key asks before saving');
await page.click('.sync-page button:has-text("Save")');
await page.waitForSelector('.sync-page h2:text("Saved to Health")');
{
  const doc = await page.evaluate((y) => JSON.parse(localStorage.getItem('mod:health-hk-' + y)), d2.slice(0, 4));
  const tdoc = await page.evaluate((y) => JSON.parse(localStorage.getItem('mod:health-hk-' + y)), localToday.slice(0, 4));
  check(doc.days[d2].st === 12345 && doc.days[d2].ae === 610 && doc.days[d2].wat === 48 && doc.days[d2].sy === 1, `synced day saved (${JSON.stringify(doc.days[d2]).slice(0, 120)})`);
  check(tdoc.days[localToday].hrv === 41 && tdoc.days[localToday].sl.a === 435, 'this morning’s HRV saved; the imported night with stages kept');
  const hd = await hDoc();
  check(hd.weights.some((w) => w.date === d2 && w.lb === 181.2 && w.src === 'sync') && hd.sync.count === 1, 'synced weigh-in added and the sync counted');
}
await go('Health');
await page.waitForSelector('.health-tabs');
await page.click('.health-tabs .seg-btn:has-text("Today")');
await page.click('.sync-card .card-toggle');
await page.click('.sync-card button:has-text("Make my link")');
await page.waitForSelector('.sync-link');
const syncKey = (await hDoc()).sync.key;
check(syncKey && syncKey.length === 20 && (await page.innerText('.sync-link')).includes(`#/health-sync?k=${syncKey}&date=`), 'sync link made with a private key');
const d3 = await agoIso(3);
await page.evaluate(([d, k]) => (location.hash = `#/health-sync?k=${k}&date=${d}&on=${d}&steps=7777`), [d3, syncKey]);
await page.waitForSelector('.sync-page h2:text("Saved to Health")');
{
  const doc = await page.evaluate((y) => JSON.parse(localStorage.getItem('mod:health-hk-' + y)), d3.slice(0, 4));
  check(doc.days[d3].st === 7777 && (await hDoc()).sync.count === 2, 'a link with the key saves right away');
}
await page.screenshot({ path: path.join(OUT, 'health-sync.png') });
// the same link again (a reload, or Back): nothing saved twice
await page.reload();
await page.waitForSelector('.sync-page h2:text("Already saved")');
check((await hDoc()).sync.count === 2, 'reopening a saved link doesn’t save it again');
// an old link (days later, no "on" date) asks first, since last night's numbers would land on today
const d5 = await agoIso(5);
await page.evaluate(([d, k]) => (location.hash = `#/health-sync?k=${k}&date=${d}&steps=4321&sleep=7:00`), [d5, syncKey]);
await page.waitForSelector('.sync-page h2:text("Save these numbers?")');
check(/This link is from/.test(await page.innerText('.sync-page')) && (await hDoc()).sync.count === 2, 'an old link asks before saving');
await go('Health');
await page.waitForSelector('.health-tabs');
await page.click('.health-tabs .seg-btn:has-text("Today")');

// ---------------------------------------------------------------- the news job and News logic (no browser)
{
  const wp = `<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item><title>Mamdani&#8217;s rent freeze heads to a vote</title><link>https://www.thecity.nyc/2026/09/27/rent-freeze/</link><guid isPermaLink="false">https://www.thecity.nyc/?p=1</guid><pubDate>Sun, 27 Sep 2026 14:00:00 +0000</pubDate>
<description><![CDATA[<p>The Rent Guidelines Board meets Tuesday, and tenants and landlords are lining up.</p><p>The post <a href="x">Mamdani’s rent freeze heads to a vote</a> appeared first on <a href="y">THE CITY</a>.</p>]]></description>
<content:encoded><![CDATA[<figure><img src="https://www.thecity.nyc/wp-content/uploads/small.jpg" /></figure>]]></content:encoded><media:content url="https://www.thecity.nyc/wp-content/uploads/rent-lg.jpg" medium="image" width="1200"/></item>
<item><title>Best dumplings in Queens</title><link>https://www.thecity.nyc/food/</link><pubDate>Sun, 27 Sep 2026 13:00:00 +0000</pubDate><description>Where to eat.</description></item></channel></rss>`;
  const a = NJ.parseFeed(wp, 'thecity', { name: 'THE CITY', match: /\b(Mamdani|rent)\b/i });
  check(a.length === 1 && a[0].title === 'Mamdani’s rent freeze heads to a vote' && a[0].image.endsWith('rent-lg.jpg') && a[0].summary === 'The Rent Guidelines Board meets Tuesday, and tenants and landlords are lining up.' && a[0].domain === 'thecity.nyc', 'news job: an outlet’s RSS gives the photo, a clean one-line summary and the site (off-topic stories filtered out)');
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><published>2026-09-27T12:00:00-04:00</published><title type="html"><![CDATA[Apple&#8217;s new thing]]></title><content type="html"><![CDATA[<figure><img alt="" src="https://platform.theverge.com/a.jpg?quality=90&#038;strip=all" /></figure><p>Apple announced a thing today that ships next month, and it costs more than the last one.</p>]]></content><link rel="replies" href="https://www.theverge.com/x#comments"/><link rel="alternate" type="text/html" href="https://www.theverge.com/news/1"/><id>https://www.theverge.com/news/1</id><summary type="html">Short.</summary></entry></feed>`;
  const v = NJ.parseFeed(atom, 'verge', { name: 'The Verge' })[0];
  check(v.url === 'https://www.theverge.com/news/1' && v.image === 'https://platform.theverge.com/a.jpg?quality=90&strip=all' && /^Apple announced a thing/.test(v.summary) && v.date === '2026-09-27T16:00:00.000Z', 'news job: Atom feeds too (the article link, not the comments; the photo from the content)');
  const top = `<item><title>Bomb squad searches vans - NBC News</title><link>https://news.google.com/rss/articles/A?oc=5</link><guid>A</guid><pubDate>Sun, 27 Sep 2026 16:47:53 GMT</pubDate><description>&lt;ol&gt;&lt;li&gt;&lt;a href="https://news.google.com/rss/articles/A"&gt;Bomb squad searches vans&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;NBC News&lt;/font&gt;&lt;/li&gt;&lt;li&gt;&lt;a href="https://news.google.com/rss/articles/B"&gt;5 arrested near base &amp;amp; more&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;The New York Times&lt;/font&gt;&lt;/li&gt;&lt;/ol&gt;</description><source url="https://www.nbcnews.com">NBC News</source></item>`;
  const g = NJ.parseGoogleNews(`<rss>${top}</rss>`, 'top', { name: 'Top', outlet: true, cluster: true })[0];
  check(g.title === 'Bomb squad searches vans' && g.source === 'NBC News' && g.domain === 'nbcnews.com' && g.related.length === 1 && g.related[0].source === 'The New York Times' && g.related[0].title === '5 arrested near base & more', 'news job: top stories keep the other outlets covering each one (not the story itself)');
  const rj = { data: { children: [{ data: { name: 't3_a', title: 'GTA 6 trailer 3', permalink: '/r/GTA6/comments/a/', created_utc: 1790500000, subreddit_name_prefixed: 'r/GTA6', score: 12345, num_comments: 678, preview: { images: [{ source: { url: 'https://i.redd.it/big.jpg' }, resolutions: [{ url: 'https://preview.redd.it/a.jpg?width=108', width: 108 }, { url: 'https://preview.redd.it/a.jpg?width=320&amp;s=1', width: 320 }] }] } } }, { data: { name: 't3_b', title: 'pinned', permalink: '/r/GTA6/b/', stickied: true } }, { data: { name: 't3_c', title: 'nsfw', permalink: '/r/x/c/', over_18: true } }] } };
  const r = NJ.parseRedditJSON(rj, 'GTA6');
  check(r.length === 1 && r[0].score === 12345 && r[0].comments === 678 && r[0].from === 'GTA6' && r[0].image === 'https://preview.redd.it/a.jpg?width=320&s=1', 'news job: Reddit JSON gives scores, comment counts and a phone-sized photo (pinned and NSFW posts skipped)');
  const og = NJ.ogFrom('<head><meta content="/img/a.jpg" property="og:image"><meta property="og:description" content="Officials said Sunday that five men were arrested near the base."></head>', 'https://example.com/story');
  check(og.image === 'https://example.com/img/a.jpg' && /^Officials said Sunday/.test(og.summary), 'news job: a photo and summary from an article page’s preview tags');
  const m = NJ.merge([{ id: 'tech-1', title: 'Apple’s new thing', url: 'https://news.google.com/rss/articles/X', date: '2026-09-27T16:30:00.000Z', seen: '2026-09-27T16:31:00.000Z' }], [{ id: 'verge-1', title: "Apple's new thing", url: 'https://www.theverge.com/news/1', date: '2026-09-27T16:00:00.000Z', image: 'https://x/y.jpg' }], { keep: 10, maxAgeDays: 3 }, '2026-09-27T17:00:00.000Z');
  check(m.length === 1 && m[0].id === 'verge-1' && m[0].seen === '2026-09-27T16:31:00.000Z', 'news job: the same story from a search and the outlet’s feed is kept once, the copy with the photo, first seen when it first showed up');
  const f2 = NJ.merge([{ id: 'x-1', title: 'Old copy', url: 'https://publisher/x', direct: 1, image: 'https://i/1.jpg', tried: 1, date: '2026-09-27T10:00:00.000Z', seen: '2026-09-27T10:05:00.000Z' }], [{ id: 'x-1', title: 'Old copy', url: 'https://news.google.com/rss/articles/Z', date: '2026-09-27T10:00:00.000Z' }], { keep: 10, maxAgeDays: 3 }, '2026-09-27T17:00:00.000Z')[0];
  check(f2.url === 'https://publisher/x' && f2.image && f2.tried === 1 && f2.seen === '2026-09-27T10:05:00.000Z', 'news job: a story seen again keeps its photo, real address and when it first showed up');
  check(NJ.parseGoogleNews('<rss><item><title>Login - The Verge</title><link>https://news.google.com/x</link><guid>L</guid><source url="https://www.theverge.com">The Verge</source></item></rss>', 'tech', { name: 'Tech', outlet: true }).length === 0, 'news job: sign-in pages are left out');

  const topics = NL.buildTopics({ data: { portfolio: { holdings: [{ ticker: 'NVDA' }, { ticker: 'ON' }] } }, profiles: { NVDA: { name: 'NVIDIA Corp' }, ON: { name: 'ON Semiconductor Corp' } }, fun: FUN.normalizeFun(null), auto: { car: { make: 'Nissan', model: 'Altima' } }, home: { place: { name: 'Dix Hills, NY', zip: '11746' } }, follow: ['Knicks'], today: '2026-09-27' });
  const why = (title, sec) => (NL.matchItem({ title }, sec, topics) || {}).why || '';
  check(/NVIDIA/.test(why('Nvidia unveils a new chip', 'tech')) && !why('Stocks turn on a dime', 'markets'), 'For you: company names in any case, short tickers only as the ticker (not the word “on”)');
  check(/playing Black Ops/.test(why('Black Ops 7 Zombies season 2 map revealed', 'gaming')) && /GTA VI/.test(why('GTA 6 preorders open', 'top')) && /Teamfight/.test(why('TFT patch notes', 'gaming')), 'For you: games you play and your countdowns, by the names headlines use');
  check(/Doomsday/.test(why('New Doomsday footage', 'pop')) && !why('The Doomsday Clock moves closer to midnight', 'politics'), 'For you: “Doomsday” counts in entertainment news, not in politics');
  check(/Altima/.test(why('Nissan recalls 2021 Altima sedans', 'top')) && /Altima/.test(why('Nissan issues a recall for some sedans', 'top')), 'For you: your car, and recalls from its maker');
  check(/Dix Hills/.test(why('Dix Hills pool reopens', 'li')) && !why('Long Island weather this weekend', 'li') && /Dix Hills/.test(why('Long Island weather this weekend', 'top')) && !why('Huntington Bancshares beats estimates', 'markets'), 'For you: your town; Long Island stories only from outside the Long Island section');
  check(/Knicks/.test(why('Knicks sign a guard', 'politics')), 'For you: topics you follow');
  check(/NVIDIA/.test(why('Nvidia stock slides after earnings', 'markets')) && !why('Early Prime Day deals: Nvidia graphics cards 20% off', 'tech'), 'For you: shopping deals that name a company aren’t stock news');
  check(NJ.parseGoogleNews('<rss><item><title>FS: Apple iPhone 13 Pro - Ars Technica</title><link>https://news.google.com/a</link><guid>F</guid><source url="https://arstechnica.com">Ars Technica</source></item><item><title>Google ads caught delivering scareware | Page 4 | Ars OpenForum - Ars Technica</title><link>https://news.google.com/b</link><guid>G</guid><source url="https://arstechnica.com">Ars Technica</source></item></rss>', 'tech', { name: 'Tech', outlet: true }).length === 0, 'news job: forum threads and for-sale posts are left out');
  const prefs = NL.defaultNewsPrefs();
  check(NL.addTerm(prefs, 'muteSources', 'nypost.com') && !NL.addTerm(prefs, 'muteSources', 'NYPost.com') && NL.isMuted({ title: 'x', source: 'New York Post', domain: 'nypost.com' }, prefs) && !NL.isMuted({ title: 'x', source: 'AP', domain: 'apnews.com' }, prefs), 'mutes: an outlet by web address (added once, whatever the case)');
  NL.addTerm(prefs, 'muteWords', 'Kardashian');
  check(NL.isMuted({ title: 'The Kardashians’ new show', source: 'Variety' }, prefs) === false && NL.isMuted({ title: 'Kardashian launches a brand', source: 'Variety' }, prefs), 'mutes: whole words (Kardashian, not Kardashians)');
  const nf = { tech: [{ id: 'a', title: 'Pokémon GO adds a new raid', date: '2026-09-27T10:00:00Z', source: 'Polygon' }], nyc: [{ id: 'b', title: 'Mayor on the budget', date: '2026-09-27T11:00:00Z', source: 'Gothamist' }] };
  check(NL.searchNews(nf, prefs, 'pokemon raid').length === 1 && NL.searchNews(nf, prefs, 'pokemon mayor').length === 0 && NL.searchNews(nf, prefs, 'gothamist')[0].sec === 'nyc', 'search: every word must match, accents ignored, outlets searchable');
  NL.saveStory(prefs, nf.tech[0], 'tech');
  const un = NL.unsaveStory(prefs, 'a');
  NL.restoreSaved(prefs, un.item, un.index);
  check(prefs.saved.length === 1 && prefs.saved[0].sec === 'tech' && !NL.saveStory(prefs, nf.tech[0], 'tech'), 'saved stories: saved once, removed and restored');
}

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
await page.waitForSelector('.vice-zone');
await page.waitForSelector('.vice-list li');
{
  const heroT = await page.innerText('.vice-zone');
  const doomT = await page.innerText('.doom-zone');
  check(/Grand Theft Auto VI/i.test(heroT) && (await page.$$('.vice-zone .cd-tile')).length === 4 && /Latest from Rockstar/i.test(heroT) && !(await page.$('.fun-hero')), 'Entertainment opens on the GTA VI zone, counting down');
  check((await page.$$('.vice-list li')).length === 4 && /Test newswire post one/.test(heroT) && /Older test post four/.test(heroT), 'the four newest posts from the GTA 6 site’s feed');
  check(/Avengers: Doomsday/i.test(doomT) && (await page.$$('.doom-zone .cd-tile')).length === 4 && /Road to Doomsday/.test(doomT), 'the Doomsday zone counts down beside it');
  const imgs = await page.$$eval('.zone-art', (els) => els.map((e) => [e.getAttribute('src'), e.naturalWidth]));
  check(imgs.length === 2 && imgs[0][0] === 'art/gta6-key-art.jpg' && imgs[1][0] === 'art/doomsday-poster.jpg' && imgs.every((x) => x[1] > 300), `both artworks load (${JSON.stringify(imgs)})`);
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return ['Anton', 'Cinzel'].map((f) => document.fonts.check(`12px "${f}"`)); });
  check(fonts.every(Boolean), `the zones' fonts load (${fonts})`);
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
check(/Test Game/i.test(await page.innerText('.fun-hero-title')) && (await page.$('.vice-zone')), 'featuring another release gives it the big countdown, above the zones');
await page.click('button[aria-label="Feature Grand Theft Auto VI at the top"]');
await page.waitForTimeout(200);
check(!(await page.$('.fun-hero')) && (await page.$('.vice-zone')), 'and back to GTA VI');
// the GTA VI hub, from the GTA 6 site's content files
await page.click('.vice-zone .hub-tab:has-text("Jason & Lucia")');
await page.waitForSelector('.gta-leads li');
{
  const t = await page.innerText('.vice-zone .zone-panel');
  const href = await page.getAttribute('.gta-leads a', 'href');
  check((await page.$$('.gta-leads li')).length === 2 && /Test Lead One/i.test(t) && /Test Friend/.test(t) && /\/gta6\/#\/e\/test-lead-one$/.test(href), `characters: the two leads, the rest, each linking to its entry (${href})`);
}
await page.click('.vice-zone .hub-tab:has-text("Leonida")');
await page.waitForSelector('.gta-regions li');
check((await page.$$('.gta-regions li')).length === 3 && /A made-up state/.test(await page.innerText('.vice-zone .zone-panel')), 'Leonida: the state, then its regions');
await page.click('.vice-zone .hub-tab:has-text("Trailers")');
await page.waitForSelector('.vice-zone .vid');
{
  const v = await page.$$eval('.vice-zone .vid', (els) => els.map((e) => e.getAttribute('href')));
  check(v.length === 2 && v[0].endsWith('testvid0002') && /Test Album/.test(await page.innerText('.vice-zone .zone-panel')), 'trailers newest first, plus the album');
}
await page.click('.vice-zone .hub-tab:has-text("Editions")');
await page.waitForSelector('.gta-tickets li');
check(/Test launch day/i.test(await page.innerText('.gta-when')) && (await page.$$('.gta-tickets li')).length === 2, 'editions: the launch line and each edition');
await page.screenshot({ path: path.join(OUT, 'fun-gta-hub.png'), fullPage: true });
await page.reload();
await page.waitForSelector('.vice-zone');
check(/on/.test(await page.getAttribute('.vice-zone .hub-tab:has-text("Editions")', 'class')), 'the GTA hub reopens where you left it');
await page.click('.vice-zone .hub-tab:has-text("Latest")');
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
// the Doomsday hub: crash course (ticks count on the watch list too), cast, trailers, facts
await page.click('.doom-zone .hub-tab:has-text("Crash course")');
await page.waitForSelector('.crash-row');
check((await page.$$('.crash-row')).length === 11 && /Avengers: Endgame/.test(await page.innerText('.crash')), 'crash course: 11 titles, Endgame first');
await page.click('.crash-row:has-text("Avengers: Endgame") button[aria-label="Avengers: Endgame: watched"]');
await page.waitForTimeout(200);
FD = await mod('fun');
check(FD.mcu.endgame === 'w' && /1 of 11 watched/.test(await page.innerText('.doom-zone .zone-lede')) && /1 of 91 watched/.test(await page.innerText('.watchlist .dd-progress')), 'a crash-course tick marks it watched everywhere');
await page.click('.doom-zone .hub-tab:has-text("Cast")');
await page.waitForSelector('.cast-card');
check((await page.$$('.cast-card')).length === 30 && /Robert Downey Jr\./.test(await page.innerText('.cast-doom')), 'cast: 30 names, Doom first');
await page.click('.doom-zone .hub-tab:has-text("Trailers")');
check((await page.$$('.doom-zone .vid')).length === 6 && (await page.getAttribute('.doom-zone .vid', 'href')).endsWith('X1aFkAkFASk'), 'trailers: six, newest first');
await page.click('.doom-zone .hub-tab:has-text("About")');
check(/Anthony and Joe Russo/.test(await page.innerText('.doom-facts')) && /Secret Wars/.test(await page.innerText('.doom-facts')), 'about: the facts, with sources');
await page.screenshot({ path: path.join(OUT, 'fun-doom-hub.png'), fullPage: true });
await page.click('.doom-zone .hub-tab:has-text("Watch list")');
// untick Endgame again so the watch-list counts below start from nothing
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('mod:fun'));
  delete d.mcu.endgame;
  localStorage.setItem('mod:fun', JSON.stringify(d));
  window.__modSubs.fun.forEach((f) => f());
});
await page.waitForTimeout(200);
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
await go('Home');
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
  await page.waitForSelector('.news-page .news-body');
  const tabOn = await page.innerText('.nchip.on');
  const mk = await page.innerText('.news-body');
  check(/Markets/.test(tabOn) && /Warehouse robots/.test(mk) && /Robotics/.test(mk), 'Markets news opens from the portfolio card, tagged by theme');
  await page.click('.nchip[data-sec="nyc"]');
  await page.waitForTimeout(100);
  check(/deputy mayor for housing/.test(await page.innerText('.news-body')), 'NYC politics in the News tab');
  await go('Home');
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
for (const [route, sel] of [['health', '.health-tabs'], ['learning', '.page-title'], ['cooking', '.page-title'], ['auto', '.auto-hero'], ['news', '.news-body']]) {
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
  check(!!(await tp.$('.page-sky canvas.sky-canvas')) && (await tp.$$('.hero .sky-art canvas')).length === 1, 'rain falls on the header pane, in front of the sky behind the page');
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
    await tp.waitForSelector('.page-sky canvas.sky-canvas');
    return { tp, errs };
  };
  const skyPx = (tp, sel = '.page-sky canvas.sky-canvas') =>
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
      const c = document.querySelector('.page-sky canvas.sky-canvas');
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
// budget key in this browser left alone, the Budget tab on the same sample, and reset / exit that work
{
  const { demoDocs } = await import('../src/demo-data.js');
  const docs = demoDocs(new Date());
  const b = docs['budget-tracker-v1'];
  const names = Object.keys(docs).sort().join(',');
  const y = String(new Date().getFullYear());
  check(b.historyVersion === 2 && b.configVersion === 28 && b.config.categories.length === 11 && Object.keys(b.months).length >= 8, `demo budget: ${Object.keys(b.months).length} months, current versions (so the budget module adds nothing of its own)`);
  check(['home', 'auto', 'learning', 'cooking', 'health', `health-${y}`, 'health-hk', `health-hk-${y}`, 'health-hk-ecg', 'health-hk-routes', 'fun', 'guitar', 'sourdough', 'birthdays', 'recipebox'].every((n) => docs[n]), `demo documents: ${names}`);
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
    check(/live demo/.test(og('title') || '') && /^https:\/\/amast126\.github\.io\/budget\/demo-preview\.jpg(\?v=\d+)?$/.test(img) && local.ok && Number(local.headers.get('content-length') || (await local.arrayBuffer()).byteLength) < 600000, `demo.html has a preview card: “${og('title')}”, ${img.split('/').pop()}`);
    const rp = await dc.newPage();
    await rp.goto(`${base}demo.html`);
    await rp.waitForSelector('.demo-bar', { timeout: 8000 });
    check(/\?demo/.test(rp.url()), `demo.html opens the demo (${rp.url().replace(base, '/')})`);
    await rp.close();
  }
  const google = [];
  dc.on('request', (r) => /googleapis|firebase|gstatic|google\.com/.test(new URL(r.url()).host) && !/\/s2\/favicons/.test(r.url()) && google.push(r.url())); // (outlet logos in News aren't Firebase)
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
  for (const [route, sel] of [['budget', '.bud-summary'], ['health', '.health-tabs'], ['learning', '.page-title'], ['cooking', '.rb-grid'], ['cooking?r=demo-miso-salmon', '.rp-title'], ['auto', '.auto-hero'], ['news', '.news-body'], ['fun', '.doom-zone'], ['learning?guitar', '.practice'], ['cooking?sourdough', '.starter']]) {
    await tp.goto(`${base}?demo#/${route}`);
    await tp.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
    check(!!(await tp.$(sel)) && !!(await tp.$('.demo-bar')), `demo #/${route} renders`);
  }
  await tp.goto(`${base}?demo#/fun`);
  await tp.waitForSelector('.fun-hero');
  {
    const ft = await tp.innerText('.fun');
    const np = await tp.innerText('.now-playing');
    check(/Dune: Part Three/i.test(await tp.innerText('.fun-hero')) && !/GTA 6 site/.test(ft) && !(await tp.$('.vice-zone')) && !(await tp.$('img[src*="gta6"]')) && (await tp.$('.doom-zone')) && /Mario Kart World/.test(np) && !/Black Ops/.test(np) && /\d+ of \d+ watched/.test(ft), 'demo Entertainment is the demo person’s own');
    await tp.screenshot({ path: path.join(OUT, 'demo-fun.png'), fullPage: true });
  }
  await tp.click('a.nav-item:has-text("Budget")');
  await tp.waitForSelector('.budget .bud-summary', { timeout: 10000 });
  {
    const bt = await tp.innerText('.budget');
    check(/Restaurants & Bars/.test(bt) && /Demo test lunch/.test(bt), 'the Budget tab runs on the sample budget and has the expense added on Home');
    await tp.fill('.ledger input[aria-label="Amount"]', '100');
    await tp.fill('.ledger input[aria-label="Description"]', 'From the budget tab');
    await tp.click('.ledger button:has-text("Add expense")');
    await tp.waitForTimeout(300);
    for (const v of ['Paycheck', 'Spending', 'Savings & card', 'Outlook', 'Stocks', 'Year', 'Settings']) {
      await tp.click(`.bud-tabs .nchip:has-text("${v}")`);
      await tp.waitForTimeout(200);
    }
    await tp.click('.bud-tabs .nchip:has-text("Stocks")');
    await tp.waitForTimeout(200);
    check(/VTI/.test(await tp.innerText('.budget')) && !/no price yet/.test(await tp.innerText('.budget .holds')), 'demo stocks have (made-up) prices');
    await tp.screenshot({ path: path.join(OUT, 'demo-budget-stocks.png'), fullPage: true });
    await tp.click('.bud-tabs .nchip:has-text("Month")');
  }
  await tp.click('a.nav-item:has-text("Home")');
  await tp.waitForSelector('.money');
  await tp.waitForTimeout(300);
  check((await tp.innerText('.money .muted.small.num')) !== spentAfter, 'a change in the Budget tab shows on Home');
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
  check(!afterReset.includes('Demo test lunch') && !afterReset.includes('From the budget tab'), 'Reset brings back fresh sample data');
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
// the look: Liquid Glass over the live sky by default (light or dark with the system), a Clear–Tinted slider,
// and the classic look one tap away
{
  const tp = await desk.newPage();
  const errs = [];
  tp.on('pageerror', (e) => errs.push(e.message));
  await tp.goto(base, { waitUntil: 'networkidle' });
  await tp.waitForSelector('.hero');
  await tp.waitForTimeout(500);
  const look = () =>
    tp.evaluate(() => {
      const card = document.querySelector('.home-grid .card');
      const cs = getComputedStyle(card);
      const alpha = (cs.backgroundColor.match(/rgba?\(([^)]+)\)/) || [, '0,0,0,1'])[1].split(',').map(Number)[3];
      return {
        html: document.documentElement.className,
        tint: getComputedStyle(document.documentElement).getPropertyValue('--tint').trim(),
        sky: !!document.querySelector('.page-sky canvas.sky-canvas'),
        heroSky: !!document.querySelector('.hero canvas.sky-canvas'),
        cardBlur: cs.backdropFilter || cs.webkitBackdropFilter || '',
        cardAlpha: alpha == null || isNaN(alpha) ? 1 : alpha,
        nav: document.querySelector('.nav').style.backdropFilter || '',
        lens: !!document.querySelector('svg.lens-defs filter#lens-nav feDisplacementMap'),
        body: getComputedStyle(document.body).backgroundColor,
      };
    });
  let L = await look();
  check(/theme-glass/.test(L.html) && !/dark/.test(L.html) && L.sky && !L.heroSky && /blur/.test(L.cardBlur) && L.cardAlpha < 0.95 && L.body === 'rgba(0, 0, 0, 0)', `Liquid Glass by default: the sky behind the page, frosted cards (alpha ${L.cardAlpha.toFixed(2)}), light`);
  check(L.lens && /url\("?#lens-nav"?\)/.test(L.nav), 'the tab bar bends light at its edges (Chrome)');
  await tp.click('a.nav-item:has-text("Budget")');
  await tp.waitForSelector('.budget .bud-summary', { timeout: 10000 });
  const bcard = await tp.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.budget .bud-summary'));
    return { blur: cs.backdropFilter || cs.webkitBackdropFilter || '', alpha: Number((cs.backgroundColor.match(/rgba?\(([^)]+)\)/) || [, '0,0,0,1'])[1].split(',')[3] ?? 1) };
  });
  check(/blur/.test(bcard.blur) && bcard.alpha < 0.95, `the budget is glass cards like every other tab (alpha ${bcard.alpha.toFixed(2)})`);
  await tp.screenshot({ path: path.join(OUT, 'glass-budget.png') });
  await tp.click('a.nav-item:has-text("Home")');
  await tp.click('.nav-settings');
  await tp.waitForSelector('.settings-look');
  check(/Liquid Glass/.test(await tp.innerText('.settings-look .seg-btn.on')), 'Settings shows the look');
  await tp.fill('.glass-slider input', '100');
  await tp.waitForTimeout(150);
  L = await look();
  const tinted = L.cardAlpha;
  await tp.fill('.glass-slider input', '0');
  await tp.waitForTimeout(150);
  L = await look();
  check(L.tint === '0' && tinted > L.cardAlpha + 0.2 && (await tp.evaluate(() => localStorage.getItem('dash.glassTint'))) === '0', `transparency slider: Tinted ${tinted.toFixed(2)} → Clear ${L.cardAlpha.toFixed(2)}, remembered`);
  await tp.screenshot({ path: path.join(OUT, 'glass-settings.png') });
  await tp.fill('.glass-slider input', '50');
  await tp.click('.settings-look .seg-btn:has-text("Classic")');
  await tp.waitForTimeout(300);
  L = await look();
  check(/theme-classic/.test(L.html) && !L.sky && L.heroSky && L.cardAlpha === 1 && !L.nav && !L.lens && L.body === 'rgb(245, 246, 242)', 'Classic brings back the original look (the sky back in the header, paper background)');
  await tp.reload({ waitUntil: 'networkidle' });
  await tp.waitForSelector('.hero');
  L = await look();
  check(/theme-classic/.test(L.html) && L.heroSky, 'and stays after a reload');
  await tp.click('.nav-settings');
  await tp.click('.settings-look .seg-btn:has-text("Liquid Glass")');
  await tp.waitForTimeout(300);
  check(/theme-glass/.test((await look()).html), 'switch back to Liquid Glass');
  check(!errs.length, `no errors changing the look${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await tp.close();
}
// dark mode follows the system
{
  const dk = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  await dk.addInitScript(init, EXPORT);
  await mockWeather(dk);
  const tp = await dk.newPage();
  const errs = [];
  tp.on('pageerror', (e) => errs.push(e.message));
  await tp.goto(base, { waitUntil: 'networkidle' });
  await tp.waitForSelector('.hero');
  await tp.waitForTimeout(500);
  const d = await tp.evaluate(() => {
    const card = document.querySelector('.home-grid .card');
    const bg = getComputedStyle(card).backgroundColor.match(/\d+(\.\d+)?/g).map(Number);
    const ink = getComputedStyle(card.querySelector('.card-title')).color.match(/\d+/g).map(Number);
    return { html: document.documentElement.className, bg, ink };
  });
  check(/theme-glass/.test(d.html) && /dark/.test(d.html) && d.bg[0] < 60 && d.ink[0] > 200, `dark mode with the system: dark glass (${d.bg.slice(0, 3).join(',')}), light text`);
  await tp.screenshot({ path: path.join(OUT, 'glass-dark-home.png') });
  await tp.click('a.nav-item:has-text("Budget")');
  await tp.waitForSelector('.budget .bud-summary', { timeout: 10000 });
  const bd = await tp.evaluate(() => {
    const card = document.querySelector('.budget .bud-summary');
    return { bg: getComputedStyle(card).backgroundColor.match(/\d+(\.\d+)?/g).map(Number), ink: getComputedStyle(card.querySelector('.big')).color.match(/\d+/g).map(Number) };
  });
  check(bd.bg[0] < 60 && bd.ink[0] > 200, `the budget goes dark too, for real (${bd.bg.slice(0, 3).join(',')})`);
  await tp.screenshot({ path: path.join(OUT, 'glass-dark-budget.png') });
  check(!errs.length, `no errors in dark mode${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await dk.close();
}
// wide and ultrawide screens: as many columns as fit (3 at 1920, 4 at 2560, 6 at 3440), cards never overlapping
for (const [W, want] of [[1366, 0], [1920, 3], [2560, 4], [3440, 6]]) {
  const wc = await browser.newContext({ viewport: { width: W, height: 1200 }, reducedMotion: 'reduce' });
  await wc.addInitScript(init, EXPORT);
  await mockWeather(wc);
  const tp = await wc.newPage();
  const errs = [];
  tp.on('pageerror', (e) => errs.push(e.message));
  const layout = () =>
    tp.evaluate(() => {
      const m = document.querySelector('.masonry');
      if (!m) return { cols: 0, overlaps: 0, scrollW: document.documentElement.scrollWidth };
      const rects = [...m.querySelectorAll(':scope > :not(.col), :scope > .col > *')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (rects[i].left < rects[j].right - 1 && rects[j].left < rects[i].right - 1 && rects[i].top < rects[j].bottom - 1 && rects[j].top < rects[i].bottom - 1) overlaps++;
      return { cols: Number(m.style.getPropertyValue('--cols')), columns: new Set(rects.map((r) => Math.round(r.left))).size, overlaps, scrollW: document.documentElement.scrollWidth };
    });
  await tp.goto(base, { waitUntil: 'networkidle' });
  await tp.waitForSelector('.hero');
  await tp.waitForTimeout(700);
  const h = await layout();
  check(h.cols === want && (want === 0 || h.columns === want) && h.overlaps === 0 && h.scrollW <= W, `${W}px wide: Home in ${want || 'the usual two'} columns${want ? ` (${h.columns} used, no overlaps)` : ''}`);
  if (want) {
    await tp.fill('.todo input[aria-label="New to-do"]', 'A taller card');
    await tp.press('.todo input[aria-label="New to-do"]', 'Enter');
    await tp.waitForTimeout(300);
    check((await layout()).overlaps === 0, `${W}px: a card that grows pushes the ones below it down`);
    await tp.click('a.nav-item:has-text("Budget")');
    await tp.waitForSelector('.budget .bud-summary');
    await tp.waitForTimeout(500);
    const b = await layout();
    check(b.cols >= 3 && b.overlaps === 0, `${W}px: the Budget tab spreads out too (${b.cols} columns)`);
    if (W === 3440) await tp.screenshot({ path: path.join(OUT, 'ultrawide-budget.png') });
  }
  check(!errs.length, `no errors at ${W}px${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await wc.close();
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
await dp.waitForSelector('.cooking .cook-hero');
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
