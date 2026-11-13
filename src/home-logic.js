// Home screen extras: weather location and the to-do list. Saved in trackers/<doc>-home.
import { uid, todayISO } from './budget-logic.js';

export const DEFAULT_PLACE = { name: 'Dix Hills, NY', zip: '11746', lat: 40.80482, lon: -73.33623 };

// Tabs you can switch on in Settings. Home and Budget are always there; the rest start hidden.
export const OPTIONAL_TABS = ['news', 'planning', 'health', 'fun', 'learning', 'cooking', 'auto'];

export function defaultHome() {
  return { version: 1, place: { ...DEFAULT_PLACE }, todos: [], doneLog: {}, tabs: [], small: { on: true, area: '', log: {} } };
}
export function normalizeHome(d) {
  const base = defaultHome();
  if (!d || typeof d !== 'object') return base;
  const p = d.place;
  return {
    version: 1,
    place: p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.name ? p : base.place,
    todos: Array.isArray(d.todos) ? d.todos.filter((t) => t && t.text) : [],
    doneLog: d.doneLog && typeof d.doneLog === 'object' ? d.doneLog : {}, // to-dos finished per day, kept after "Clear done"
    tabs: Array.isArray(d.tabs) ? d.tabs.filter((t) => OPTIONAL_TABS.includes(t)) : [],
    small: normalizeSmall(d.small),
    updatedAt: d.updatedAt,
  };
}

// ---------------------------------------------------------------- tabs
export function setTab(d, tab, on) {
  if (!OPTIONAL_TABS.includes(tab)) return;
  const rest = (d.tabs || []).filter((t) => t !== tab);
  d.tabs = on ? OPTIONAL_TABS.filter((t) => t === tab || rest.includes(t)) : rest;
}

// ---------------------------------------------------------------- one small thing
// For the areas you'd like to get into: one tiny thing a day from one area, done or skipped, no streaks.
export const SMALL_AREAS = {
  learning: {
    name: 'Learning',
    actions: [
      { id: 'study', text: 'Study for 10 minutes', kind: 'study', minutes: 10 },
      { id: 'unit', text: 'Read one lesson or unit', kind: 'study', minutes: 10 },
      { id: 'cards', text: 'Flip through 5 flashcards', kind: 'done', href: '#/learning' },
    ],
  },
  cooking: {
    name: 'Cooking',
    actions: [
      { id: 'grocery', text: 'Add one thing to the grocery list', kind: 'grocery' },
      { id: 'cook', text: 'Cook one meal at home', kind: 'done' },
      { id: 'fridge', text: 'Check the fridge for anything going bad', kind: 'done' },
    ],
  },
  health: {
    name: 'Health',
    actions: [
      { id: 'walk', text: 'Take a 20-minute walk', kind: 'done' },
      { id: 'stretch', text: 'Stretch for 5 minutes', kind: 'done' },
      { id: 'outside', text: 'Get outside for 10 minutes', kind: 'done' },
    ],
  },
  auto: {
    name: 'Car',
    actions: [
      { id: 'next', text: 'See what the car needs next', kind: 'service' },
      { id: 'tires', text: 'Check the tire pressure', kind: 'done' },
      { id: 'miles', text: 'Note the odometer', kind: 'miles' },
    ],
  },
};
function normalizeSmall(x) {
  const o = x && typeof x === 'object' ? x : {};
  const log = o.log && typeof o.log === 'object' ? o.log : {};
  return { on: o.on !== false, area: SMALL_AREAS[o.area] ? o.area : '', log };
}
const dayNo = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
// Today's one thing: which action, and whether it's done, or skipped past everything.
export function smallToday(home, today = todayISO()) {
  const sm = normalizeSmall(home && home.small);
  const area = SMALL_AREAS[sm.area];
  if (!sm.on || !area) return { on: sm.on, area: '' };
  const day = sm.log[today] && sm.log[today].area === sm.area ? sm.log[today] : { skips: 0 };
  const n = area.actions.length;
  const skips = day.skips || 0;
  const doneAction = day.done ? area.actions.find((a) => a.id === day.done) : null;
  const action = doneAction || (skips < n ? area.actions[(dayNo(today) + skips) % n] : null);
  const total = Object.values(sm.log).filter((e) => e && e.area === sm.area && e.done).length;
  const week = Object.entries(sm.log).filter(([k, e]) => e && e.area === sm.area && e.done && dayNo(today) - dayNo(k) < 7).length;
  return { on: true, area: sm.area, name: area.name, action, done: !!doneAction, ref: doneAction ? day.ref || null : null, out: !action, total, week };
}
const trim = (log, today) => Object.fromEntries(Object.entries(log).filter(([k]) => dayNo(today) - dayNo(k) < 120));
export function setSmallArea(d, area) {
  d.small = normalizeSmall(d.small);
  d.small.area = SMALL_AREAS[area] ? area : '';
  d.small.on = true;
}
export function setSmallOn(d, on) {
  d.small = normalizeSmall(d.small);
  d.small.on = !!on;
}
// `ref` remembers what the action wrote elsewhere (a study log entry, grocery items, a mileage reading) so Undo can take it back.
export function smallDone(d, actionId, today = todayISO(), ref = null) {
  d.small = normalizeSmall(d.small);
  const prev = d.small.log[today] && d.small.log[today].area === d.small.area ? d.small.log[today] : { skips: 0 };
  d.small.log = trim({ ...d.small.log, [today]: { ...prev, area: d.small.area, done: actionId, ref } }, today);
}
export function smallUndo(d, today = todayISO()) {
  d.small = normalizeSmall(d.small);
  const e = d.small.log[today];
  if (e) d.small.log = { ...d.small.log, [today]: { ...e, done: null, ref: null } };
}
export function smallSkip(d, today = todayISO()) {
  d.small = normalizeSmall(d.small);
  const prev = d.small.log[today] && d.small.log[today].area === d.small.area ? d.small.log[today] : { skips: 0 };
  d.small.log = trim({ ...d.small.log, [today]: { ...prev, area: d.small.area, skips: (prev.skips || 0) + 1, done: null } }, today);
}

// ---------------------------------------------------------------- to-dos
export function addTodo(d, text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const item = { id: uid(), text: t, added: todayISO() };
  d.todos.unshift(item);
  return item;
}
export function toggleTodo(d, id) {
  const t = d.todos.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  d.doneLog = d.doneLog || {};
  if (t.done) {
    t.doneAt = todayISO();
    d.doneLog[t.doneAt] = (d.doneLog[t.doneAt] || 0) + 1;
  } else {
    if (t.doneAt && d.doneLog[t.doneAt]) d.doneLog[t.doneAt] -= 1;
    delete t.doneAt;
  }
  return t.done;
}
export function removeTodo(d, id) {
  const i = d.todos.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [item] = d.todos.splice(i, 1);
  return { item, index: i };
}
export function restoreTodo(d, item, index) {
  if (d.todos.some((x) => x.id === item.id)) return;
  d.todos.splice(Math.min(index, d.todos.length), 0, item);
}
export function clearDone(d) {
  const n = d.todos.filter((t) => t.done).length;
  d.todos = d.todos.filter((t) => !t.done);
  return n;
}

// ---------------------------------------------------------------- weather (Open-Meteo, no key needed)
export function forecastUrl(p) {
  const q = new URLSearchParams({
    latitude: p.lat,
    longitude: p.lon,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_gusts_10m,relative_humidity_2m',
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
    forecast_days: '2',
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}
export const geocodeUrl = (text) =>
  `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: text.trim(), count: '6', language: 'en', format: 'json' })}`;

const STATES = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY',
  Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
};
// Search results → places to pick from ("Dix Hills, NY" / "Paris, France").
export function placesFrom(json, query) {
  const zip = /^\d{5}$/.test(String(query).trim()) ? String(query).trim() : null;
  return ((json && json.results) || []).map((r) => {
    const region = r.country_code === 'US' ? STATES[r.admin1] || r.admin1 : r.country;
    return { name: [r.name, region].filter(Boolean).join(', '), zip: zip || undefined, lat: r.latitude, lon: r.longitude, detail: [r.admin2, r.admin1, r.country].filter(Boolean).join(', ') };
  });
}

// WMO weather codes → words and an icon.
const CODES = [
  [[0], 'Clear', '☀️', '🌙'],
  [[1], 'Mostly clear', '🌤️', '🌙'],
  [[2], 'Partly cloudy', '⛅', '☁️'],
  [[3], 'Cloudy', '☁️', '☁️'],
  [[45, 48], 'Fog', '🌫️', '🌫️'],
  [[51, 53, 55], 'Drizzle', '🌦️', '🌧️'],
  [[56, 57, 66, 67], 'Freezing rain', '🌧️', '🌧️'],
  [[61], 'Light rain', '🌦️', '🌧️'],
  [[63], 'Rain', '🌧️', '🌧️'],
  [[65], 'Heavy rain', '🌧️', '🌧️'],
  [[71, 77], 'Light snow', '🌨️', '🌨️'],
  [[73], 'Snow', '🌨️', '🌨️'],
  [[75], 'Heavy snow', '❄️', '❄️'],
  [[80, 81], 'Showers', '🌦️', '🌧️'],
  [[82], 'Heavy showers', '🌧️', '🌧️'],
  [[85, 86], 'Snow showers', '🌨️', '🌨️'],
  [[95], 'Thunderstorms', '⛈️', '⛈️'],
  [[96, 99], 'Thunderstorms with hail', '⛈️', '⛈️'],
];
export function describe(code, isDay = 1) {
  const c = CODES.find(([codes]) => codes.includes(Number(code)));
  return c ? { text: c[1], icon: isDay ? c[2] : c[3] } : { text: '—', icon: '🌡️' };
}
const hourLabel = (iso) => {
  const h = Number(iso.slice(11, 13));
  return h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
};
const clock = (iso) => {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

// Everything the weather card shows, from one forecast response.
export function summarize(w) {
  if (!w || !w.current || !w.daily || !w.hourly) return null;
  const now = w.current.time; // local time at the place, "2026-09-25T14:00"
  const today = now.slice(0, 10);
  const cur = describe(w.current.weather_code, w.current.is_day);
  const d = (k) => w.daily[k][0];
  const high = Math.round(d('temperature_2m_max'));
  const low = Math.round(d('temperature_2m_min'));
  // Next 12 hours, every 2 hours, starting with the coming hour.
  const start = w.hourly.time.findIndex((t) => t >= now.slice(0, 13) + ':00');
  const hours = [];
  for (let i = Math.max(0, start + 1); i < w.hourly.time.length && hours.length < 7; i += 2) {
    const c = describe(w.hourly.weather_code[i], w.hourly.is_day[i]);
    hours.push({ time: w.hourly.time[i], label: hourLabel(w.hourly.time[i]), temp: Math.round(w.hourly.temperature_2m[i]), rain: w.hourly.precipitation_probability[i], icon: c.icon, text: c.text });
  }
  // Rain for the rest of today: first hour at 40%+.
  let rainLine = 'No rain expected today.';
  const rest = [];
  for (let i = Math.max(0, start); i < w.hourly.time.length && w.hourly.time[i].slice(0, 10) === today; i++) rest.push(i);
  const wet = rest.find((i) => w.hourly.precipitation_probability[i] >= 40);
  const maxRest = rest.reduce((m, i) => Math.max(m, w.hourly.precipitation_probability[i] || 0), 0);
  if (wet != null) rainLine = `${w.hourly.time[wet] <= now.slice(0, 13) + ':00' ? 'Rain likely now' : `Rain likely from about ${hourLabel(w.hourly.time[wet])}`} (${w.hourly.precipitation_probability[wet]}%).`;
  else if (maxRest >= 20) rainLine = `Small chance of rain later (${maxRest}%).`;
  const gusts = Math.round(w.current.wind_gusts_10m || 0);
  const wind = Math.round(w.current.wind_speed_10m || 0);
  const windLine = gusts >= 30 || wind >= 18 ? ` Windy, gusts to ${gusts} mph.` : '';
  const tomorrow = w.daily.time && w.daily.time[1] ? { text: describe(w.daily.weather_code[1], 1).text, high: Math.round(w.daily.temperature_2m_max[1]), low: Math.round(w.daily.temperature_2m_min[1]), rain: w.daily.precipitation_probability_max[1] } : null;
  return {
    code: w.current.weather_code,
    isDay: w.current.is_day,
    nowISO: now,
    sunriseISO: d('sunrise'),
    sunsetISO: d('sunset'),
    dayText: describe(d('weather_code'), 1).text,
    rainFrom: wet != null ? hourLabel(w.hourly.time[wet]) : null,
    rainNow: wet != null && w.hourly.time[wet] <= now.slice(0, 13) + ':00',
    tomorrow,
    tennis: tennisWindow(w),
    temp: Math.round(w.current.temperature_2m),
    feels: Math.round(w.current.apparent_temperature),
    now: cur,
    high,
    low,
    humidity: Math.round(w.current.relative_humidity_2m),
    wind,
    gusts,
    uv: Math.round(d('uv_index_max') || 0),
    rainChance: d('precipitation_probability_max'),
    sunrise: clock(d('sunrise')),
    sunset: clock(d('sunset')),
    sentence: `${describe(d('weather_code'), 1).text} today, high ${high}°, low ${low}°. ${rainLine}${windLine}`,
    hours,
  };
}

// Good hours for tennis: dry (no rain codes, rain chance 20% or less), 52–88°F, wind under 14 mph, daylight between
// 8 am and 8 pm. Returns the longest run of 2+ such hours later today, else tomorrow: { when, from, to, label }.
const WET = (code) => Number(code) >= 51;
export function tennisWindow(w) {
  if (!w || !w.hourly || !w.current) return null;
  const now = w.current.time;
  const today = now.slice(0, 10);
  const H = w.hourly;
  const good = (i) => {
    const h = Number(H.time[i].slice(11, 13));
    const t = H.temperature_2m[i];
    const wind = H.wind_speed_10m ? H.wind_speed_10m[i] : 0;
    return h >= 8 && h <= 19 && t >= 52 && t <= 88 && (H.precipitation_probability[i] || 0) <= 20 && !WET(H.weather_code[i]) && (wind == null || wind < 14);
  };
  const runs = (day, fromHour) => {
    let best = null;
    let start = null;
    for (let i = 0; i < H.time.length; i++) {
      const t = H.time[i];
      const ok = t.slice(0, 10) === day && t.slice(0, 13) >= fromHour && good(i);
      if (ok && start == null) start = i;
      if ((!ok || i === H.time.length - 1) && start != null) {
        const end = ok ? i : i - 1;
        if (end - start + 1 >= 2 && (!best || end - start > best[1] - best[0])) best = [start, end];
        start = null;
      }
    }
    return best;
  };
  const nextHour = `${today}T${String(Math.min(23, Number(now.slice(11, 13)) + 1)).padStart(2, '0')}`;
  let when = 'today';
  let r = runs(today, nextHour);
  if (!r && H.time.some((t) => t.slice(0, 10) > today)) {
    const tmr = H.time.find((t) => t.slice(0, 10) > today).slice(0, 10);
    r = runs(tmr, `${tmr}T00`);
    when = 'tomorrow';
  }
  if (!r) return null;
  const h0 = Number(H.time[r[0]].slice(11, 13));
  const h1 = Number(H.time[r[1]].slice(11, 13)) + 1;
  const ap = (h) => (h < 12 ? 'AM' : 'PM');
  const hh = (h) => h % 12 || 12;
  const range = ap(h0) === ap(h1) ? `${hh(h0)}–${hh(h1)} ${ap(h1)}` : `${hh(h0)} ${ap(h0)}–${hh(h1)} ${ap(h1)}`;
  return { when, from: h0, to: h1, label: `${when === 'tomorrow' ? 'tomorrow ' : ''}${range}` };
}
