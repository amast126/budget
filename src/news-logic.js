// News tab logic: the sections, "For you" (matched on this device against your own stocks, games, watch list, car
// and town — none of it leaves your account), saved and hidden stories, muted words and outlets, and search.
// Saves, hides, mutes and followed topics live in trackers/<doc>-news, so they follow you across devices.
import { mcuList, upcoming as upcomingReleases, DOOMSDAY } from './fun-logic.js';
import { holdingsOf, namesFor } from './portfolio-logic.js';

// [key, label, light color, dark color, what's in it, news.json keys]
export const SECTIONS = [
  { key: 'foryou', label: 'For you', color: ['#8a3fc4', '#cfa6ff'], note: 'Stories about your stocks, games, watch list, car and town, plus topics you follow. Matched on this device.' },
  { key: 'top', label: 'Top stories', color: ['#b3263e', '#ff8fa0'], keys: ['top'], ranked: true, note: 'Google News top stories, with the other outlets covering each one' },
  { key: 'politics', label: 'US politics', color: ['#2b62b8', '#93bbff'], keys: ['politics'], note: 'AP and Reuters, U.S. coverage' },
  { key: 'nyc', label: 'NYC', color: ['#d06a06', '#ffb46b'], keys: ['nyc'], note: 'NYC politics: THE CITY, Gothamist, City & State, Politico New York, amNY, Daily News, plus Mamdani coverage' },
  { key: 'li', label: 'Long Island', color: ['#0b7f82', '#6fdad7'], keys: ['li'], note: 'Newsday, News12 Long Island, Patch, LI Herald, TBR News Media, Long Island Press' },
  { key: 'tech', label: 'Tech & AI', color: ['#5646cf', '#b3abff'], keys: ['tech'], note: 'The Verge, Ars Technica, TechCrunch, Wired, Reuters tech' },
  { key: 'markets', label: 'Markets', color: ['#16784c', '#6fdca3'], keys: ['markets'], note: 'Energy, quantum computing and robotics from Reuters, CNBC, Bloomberg, Barron’s, TechCrunch and trade press' },
  { key: 'gaming', label: 'Gaming', color: ['#4f820c', '#b8e36c'], keys: ['gaming'], note: 'Polygon, GameSpot, VGC, IGN, Kotaku, Eurogamer, plus the games you play' },
  { key: 'pop', label: 'Pop culture', color: ['#a87a06', '#f2cd62'], keys: ['pop', 'marvel'], note: 'Variety, The Hollywood Reporter, Vulture, Entertainment Weekly, plus Marvel news' },
  { key: 'music', label: 'Music', color: ['#b8327f', '#ff97d2'], keys: ['music'], note: 'Pitchfork, Billboard, Stereogum, Rolling Stone, Guitar World' },
  { key: 'reddit', label: 'Reddit', color: ['#e0430c', '#ff9466'], keys: ['reddit'], note: 'Top of r/popular today, and what’s hot on your subreddits' },
  { key: 'saved', label: 'Saved', color: ['#4d5a66', '#c5ced8'], note: 'Stories you saved for later, on every device' },
];
export const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));
export const SECTION_OF = { marvel: 'pop' }; // news.json key → section, where they differ
export const REDDIT_SUBS = [
  ['all', 'All'],
  ['popular', 'Popular'],
  ['GTA6', 'r/GTA6'],
  ['CODZombies', 'r/CODZombies'],
  ['TeamfightTactics', 'r/TeamfightTactics'],
  ['nyc', 'r/nyc'],
  ['longisland', 'r/longisland'],
];
const NEWS_KEYS = ['top', 'politics', 'nyc', 'li', 'tech', 'markets', 'gaming', 'marvel', 'pop', 'music'];

// ---------------------------------------------------------------- the saved document
export function defaultNewsPrefs() {
  return { version: 1, saved: [], hidden: [], muteWords: [], muteSources: [], follow: [] };
}
const strList = (a, max = 100) => (Array.isArray(a) ? [...new Set(a.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, max) : []);
export function normalizeNewsPrefs(d) {
  const b = defaultNewsPrefs();
  if (!d || typeof d !== 'object') return b;
  return {
    version: 1,
    saved: Array.isArray(d.saved) ? d.saved.filter((s) => s && s.id && s.title && s.url).slice(0, 300) : [],
    hidden: strList(d.hidden, 600),
    muteWords: strList(d.muteWords),
    muteSources: strList(d.muteSources),
    follow: strList(d.follow),
    updatedAt: d.updatedAt,
  };
}
const FIELDS = ['id', 'title', 'url', 'source', 'domain', 'image', 'summary', 'date', 'score', 'comments', 'from', 'tag'];
export function snapshot(item, sec) {
  const o = {};
  FIELDS.forEach((k) => item[k] != null && (o[k] = item[k]));
  o.sec = sec || item.sec || null;
  o.savedAt = new Date().toISOString();
  return o;
}
export const isSaved = (d, id) => !!(d && d.saved.some((s) => s.id === id));
export function saveStory(d, item, sec) {
  if (d.saved.some((s) => s.id === item.id)) return false;
  d.saved.unshift(snapshot(item, sec));
  d.saved = d.saved.slice(0, 300);
  return true;
}
export function unsaveStory(d, id) {
  const i = d.saved.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const [item] = d.saved.splice(i, 1);
  return { item, index: i };
}
export function restoreSaved(d, item, index) {
  if (d.saved.some((s) => s.id === item.id)) return;
  d.saved.splice(Math.max(0, Math.min(index, d.saved.length)), 0, item);
}
export function hideStory(d, id) {
  if (!d.hidden.includes(id)) d.hidden.push(id);
  if (d.hidden.length > 600) d.hidden = d.hidden.slice(-600);
}
export function unhideStory(d, id) {
  d.hidden = d.hidden.filter((x) => x !== id);
}
// Followed topics, muted words and muted outlets: plain lists of text.
export function addTerm(d, list, value) {
  const v = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!v || d[list].some((x) => fold(x) === fold(v))) return false;
  d[list].push(v);
  return true;
}
export function removeTerm(d, list, value) {
  d[list] = d[list].filter((x) => x !== value);
}

// ---------------------------------------------------------------- text matching
export const deaccent = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'");
export const fold = (s) => deaccent(s).toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Short all-caps terms (tickers, TFT, MCU) match case-sensitively; everything else ignores case and accents.
function termRe(t, anyCase) {
  const cs = !anyCase && /^\$?[A-Z][A-Z0-9.]{1,5}$/.test(t);
  const s = cs ? deaccent(t).replace(/^\$/, '') : fold(t);
  return { cs, re: new RegExp(`(^|[^A-Za-z0-9])\\$?${esc(s)}($|[^A-Za-z0-9])`) };
}
const textOf = (i) => `${i.title || ''} ${i.summary || ''}`;
export function hasWord(text, word) {
  const { cs, re } = termRe(word);
  return re.test(cs ? deaccent(text) : fold(text));
}

// Muted: a muted word in the headline or summary, or a muted outlet (by name or web address).
export function isMuted(item, prefs) {
  if (!prefs) return false;
  const t = textOf(item);
  if (prefs.muteWords.some((w) => hasWord(t, w))) return true;
  const src = fold(item.source);
  const dom = String(item.domain || '').toLowerCase();
  return prefs.muteSources.some((m) => {
    const f = fold(m).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    return f === src || (dom && (dom === f || dom.endsWith(`.${f}`)));
  });
}
export function visible(items, prefs) {
  if (!prefs) return items;
  const hidden = new Set(prefs.hidden);
  return items.filter((i) => !hidden.has(i.id) && !isMuted(i, prefs));
}

// ---------------------------------------------------------------- sections
export const normTitle = (t) =>
  fold(t)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
function dedupe(items) {
  const ids = new Set();
  const titles = new Set();
  return items.filter((i) => {
    const k = normTitle(i.title);
    if (ids.has(i.id) || titles.has(k)) return false;
    ids.add(i.id);
    titles.add(k);
    return true;
  });
}
// One section's stories, newest first (top stories keep Google's ranking), each marked with its section.
export function sectionItems(news, key) {
  const s = SECTION[key];
  if (!news || !s || !s.keys) return [];
  const all = dedupe(s.keys.flatMap((k) => (Array.isArray(news[k]) ? news[k] : []).map((i) => ({ ...i, sec: key }))));
  return s.ranked || key === 'reddit' ? all : all.sort(byDate);
}
// Every news story once, marked with its section (Reddit left out: For you is news).
export function allItems(news, keys = NEWS_KEYS) {
  if (!news) return [];
  return dedupe(keys.flatMap((k) => (Array.isArray(news[k]) ? news[k] : []).map((i) => ({ ...i, sec: SECTION_OF[k] || k }))));
}
// The big story at the top: the first one with a photo among the first few (top stories: always the first).
export function pickLead(items, ranked) {
  if (!items.length) return -1;
  if (ranked) return 0;
  const i = items.slice(0, 4).findIndex((x) => x.image);
  return i < 0 ? 0 : i;
}

// "Since you last looked": a story is new when it showed up after your last visit to its section.
export const stampOf = (i) => i.seen || i.date || '';
export const newSince = (items, since) => (since ? items.filter((i) => stampOf(i) > since).length : 0);

// ---------------------------------------------------------------- For you
const ENT = ['pop', 'gaming', 'tech', 'top'];
const GAME_ALIASES = [
  [/black ops|call of duty|\bcod\b|modern warfare|warzone/i, ['Black Ops', 'Call of Duty', 'Warzone', 'Treyarch']],
  [/teamfight tactics|\btft\b/i, ['Teamfight Tactics', 'TFT']],
  [/pok[eé]mon go/i, ['Pokémon Go', 'Niantic']],
  [/\bgta\b|grand theft auto/i, ['GTA 6', 'GTA VI', 'GTA6', 'Grand Theft Auto', 'Rockstar Games']],
];
const STOP_TICKERS = new Set(['ALL', 'ARE', 'BIG', 'CAN', 'CAR', 'EAT', 'FUN', 'GO', 'HAS', 'KEY', 'LOW', 'NOW', 'ONE', 'OPEN', 'PLAY', 'SO', 'TRUE', 'WELL', 'IT', 'ON', 'AI', 'US', 'USA', 'CEO', 'NEW', 'GDP']);
const isOneWord = (t) => !/\s/.test(t.trim());
// A title and the names it goes by in headlines. Whole titles and multi-word names match anywhere; single words
// pulled out of a title ("Doomsday", "Rockstar") only in entertainment and tech news.
function titleTerms(title, short) {
  const out = [];
  const add = (t, where) => {
    t = String(t || '').trim();
    if (t.length < 3 || out.some((x) => fold(x.t) === fold(t))) return;
    out.push(where ? { t, where } : { t });
  };
  add(title);
  add(short);
  String(title || '')
    .split(/:\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 6)
    .forEach((p) => add(p, isOneWord(p) ? ENT : null));
  const whole = `${title} ${short || ''}`;
  GAME_ALIASES.forEach(([re, names]) => re.test(whole) && names.forEach((n) => add(n, isOneWord(n) && !/^[A-Z0-9]+$/.test(n) ? ENT : null)));
  return out;
}
const LI_ZIP = /^11[05789]/;
// What For you looks for, built from your own data on this device. First match wins, in this order.
export function buildTopics({ data, profiles = {}, fun, auto, home, follow = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  const topics = [];
  follow.forEach((f) => topics.push({ kind: 'follow', why: `Following · ${f}`, label: f, terms: [{ t: f }] }));
  holdingsOf(data).forEach((h) => {
    const names = namesFor(h.ticker, (profiles[h.ticker] || {}).name);
    const name = names[1] || h.ticker;
    const terms = names.filter((n) => n !== h.ticker || (n.length >= 3 && !STOP_TICKERS.has(n))).map((t) => ({ t, not: ['reddit'], anyCase: t !== h.ticker })); // "NVIDIA Corp" is "Nvidia" in headlines
    if (terms.length) topics.push({ kind: 'stock', why: `Your stocks · ${name}`, label: name, terms });
  });
  if (fun) {
    (fun.playing || []).forEach((g) => topics.push({ kind: 'game', why: `You’re playing ${g.title}`, label: g.title, terms: titleTerms(g.title) }));
    upcomingReleases(fun, today)
      .filter((r) => r.days >= -7 && r.id !== 'doomsday' && !/doomsday/i.test(r.title))
      .forEach((r) => topics.push({ kind: 'release', why: `On your countdown · ${r.short || r.title}`, label: r.short || r.title, terms: titleTerms(r.title, r.short) }));
    if (today <= DOOMSDAY) {
      const still = mcuList(fun)
        .filter((t) => t.out && t.out >= today && !(fun.mcu && fun.mcu[t.id]))
        .map((t) => ({ t: t.title.replace(/,\s*season \d+$/i, '') }));
      topics.push({ kind: 'mcu', why: 'Doomsday watch list', label: ['Avengers: Doomsday', 'Marvel Studios', 'MCU', ...still.map((x) => x.t)].join(', '), terms: [{ t: 'Avengers: Doomsday' }, { t: 'Avengers Doomsday' }, { t: 'Doomsday', where: ENT }, { t: 'Marvel Studios' }, { t: 'MCU' }, ...still] });
    }
  }
  const car = auto && auto.car;
  if (car && car.make && car.model) {
    const terms = [{ t: `${car.make} ${car.model}` }];
    if (String(car.model).length >= 5) terms.push({ t: car.model });
    topics.push({ kind: 'car', why: `Your ${car.model}`, label: `${car.make} ${car.model} (and ${car.make} recalls)`, terms, all: [[car.make, 'recall'], [car.make, 'recalls']] });
  }
  const place = home && home.place;
  if (place && place.name) {
    const town = place.name.split(',')[0].trim();
    const terms = [{ t: town }];
    if (LI_ZIP.test(String(place.zip || ''))) {
      terms.push({ t: 'Huntington', not: ['markets'] }, { t: 'LIRR' }, { t: 'Long Island', not: ['li'] }, { t: 'Suffolk County', not: ['li'] }, { t: 'Long Islanders', not: ['li'] });
    }
    topics.push({ kind: 'place', why: `Near you · ${town}`, label: terms.map((x) => x.t).join(', '), terms });
  }
  topics.forEach((tp) => tp.terms.forEach((tm) => Object.assign(tm, termRe(tm.t, tm.anyCase))));
  return topics;
}
export function matchItem(item, sec, topics) {
  const raw = textOf(item);
  const plain = deaccent(raw);
  const low = plain.toLowerCase();
  for (const tp of topics) {
    for (const tm of tp.terms) {
      if ((tm.where && !tm.where.includes(sec)) || (tm.not && tm.not.includes(sec))) continue;
      if (tm.re.test(tm.cs ? plain : low)) return tp;
    }
    if ((tp.all || []).some((words) => words.every((w) => hasWord(raw, w)))) return tp;
  }
  return null;
}
export function forYou(news, topics, prefs, limit = 50) {
  if (!topics || !topics.length) return [];
  const out = [];
  for (const i of visible(allItems(news), prefs)) {
    const tp = matchItem(i, i.sec, topics);
    if (tp) out.push({ ...i, why: tp.why, kind: tp.kind });
  }
  return out.sort(byDate).slice(0, limit);
}

// ---------------------------------------------------------------- search
// Every word has to appear (in the headline, summary, outlet or subreddit); accents and case don't matter.
export function searchNews(news, prefs, q, limit = 60) {
  const words = fold(q).split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return [];
  const pool = dedupe([...allItems(news, [...NEWS_KEYS, 'reddit']), ...((prefs && prefs.saved) || []).map((s) => ({ ...s, sec: s.sec || 'saved' }))]);
  return visible(pool, prefs)
    .filter((i) => {
      const t = fold(`${i.title} ${i.summary || ''} ${i.source || ''} ${i.domain || ''}`);
      return words.every((w) => t.includes(w));
    })
    .sort(byDate)
    .slice(0, limit);
}

// ---------------------------------------------------------------- small formatting
const KNOWN = {
  AP: 'apnews.com',
  'AP News': 'apnews.com',
  'Associated Press': 'apnews.com',
  Reuters: 'reuters.com',
  'The New York Times': 'nytimes.com',
  NPR: 'npr.org',
  CNN: 'cnn.com',
  'NBC News': 'nbcnews.com',
  'CBS News': 'cbsnews.com',
  'ABC News': 'abcnews.go.com',
  'Fox News': 'foxnews.com',
  'The Washington Post': 'washingtonpost.com',
  'The Wall Street Journal': 'wsj.com',
  Politico: 'politico.com',
  POLITICO: 'politico.com',
  'The Hill': 'thehill.com',
  Bloomberg: 'bloomberg.com',
  'The Guardian': 'theguardian.com',
  BBC: 'bbc.com',
  Axios: 'axios.com',
  'USA Today': 'usatoday.com',
  Yahoo: 'yahoo.com',
  CNBC: 'cnbc.com',
  Newsday: 'newsday.com',
  Gothamist: 'gothamist.com',
  'THE CITY': 'thecity.nyc',
  'The Verge': 'theverge.com',
  Variety: 'variety.com',
  Billboard: 'billboard.com',
  Pitchfork: 'pitchfork.com',
};
export const domainOf = (i) => (i && (i.domain || KNOWN[i.source] || (/^r\//.test(i.source || '') ? 'reddit.com' : ''))) || '';
export const faviconUrl = (domain) => (domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '');
export function fmtCount(n) {
  const v = Number(n) || 0;
  if (v >= 100000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(v);
}
export function timeAgo(iso, now = Date.now()) {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (!isFinite(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export function clockLabel(iso, now = new Date()) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now.getTime() - 86400000);
  if (sameDay) return t;
  if (d.toDateString() === y.toDateString()) return `yesterday ${t}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${t}`;
}
