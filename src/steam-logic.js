// Steam on the Entertainment tab: your library, playtime, what you're playing, achievements and covers.
// The Steam Web API can't be called from a web page, so a GitHub job (scripts/steam-sync.mjs, every 15 minutes)
// fetches it with your key and saves two documents: trackers/<doc>-steam (library, covers, history, achievements;
// rewritten only when something changes) and trackers/<doc>-steam-live (who you are, online or in a game; every run).
// Everything here is plain functions shared by the page and the job, so it needs no browser and no imports.

export const ART_BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/';
const ICON_BASE = 'https://media.steampowered.com/steamcommunity/public/images/apps/';
export const HISTORY_DAYS = 400;

// ---------------------------------------------------------------- your profile link
// A profile link, a 17-digit SteamID, or a custom URL name → { id } or { vanity } (null if it can't be one).
export function parseProfile(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  let m = s.match(/steamcommunity\.com\/profiles\/(7656\d{13})/i) || s.match(/^(7656\d{13})$/);
  if (m) return { id: m[1] };
  m = s.match(/steamcommunity\.com\/id\/([A-Za-z0-9_-]{2,32})/i);
  if (m) return { vanity: m[1] };
  if (/^[A-Za-z0-9_-]{2,32}$/.test(s) && !/^\d+$/.test(s)) return { vanity: s };
  return null;
}

// ---------------------------------------------------------------- matching names
// "Call of Duty®: Black Ops 7" and "black ops 7 zombies" share black, ops, 7.
export const normTitle = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'edition', 'game', 'goty', 'deluxe', 'definitive', 'remastered', 'ultimate', 'complete']);
const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
const SHORT = { gta: ['grand', 'theft', 'auto'], cod: ['call', 'duty'], rdr: ['red', 'dead', 'redemption'], bo: ['black', 'ops'] };
export const tokens = (s) =>
  normTitle(s)
    .split(' ')
    .filter(Boolean)
    .flatMap((w) => SHORT[w] || [ROMAN[w] || w])
    .filter((w) => !STOP.has(w));
// Soundtracks and tools sit in a Steam library as their own apps, but they aren't games.
const NOT_GAME = /\b(soundtrack|ost|artbook|art book|dedicated server|sdk|playtest|test server)\b/i;
export const isExtra = (name) => NOT_GAME.test(String(name || ''));
// On the store, add-ons and currency packs come up next to the game itself ("Game - Starter Pack").
const ADDON = /\b(dlc|season pass|pack|points|bundle|demo|beta|expansion|upgrade)\b|\s[-–]\s/i;

// The game in `list` ([{ id, n }]) that `title` means, or null. Every number in the title has to be in the name
// (Black Ops 7 isn't Black Ops 6), and most of the title's words have to be there too.
export function matchGame(title, list) {
  const tt = tokens(title);
  if (!tt.length || !Array.isArray(list)) return null;
  const want = normTitle(title);
  const digits = tt.filter((w) => /^\d+$/.test(w));
  let best = null;
  let bestScore = 0;
  for (const g of list) {
    if (!g || !g.n) continue;
    if (normTitle(g.n) === want) return g;
    if (isExtra(g.n)) continue;
    const addon = ADDON.test(g.n) && !ADDON.test(title);
    const nt = tokens(g.n);
    if (!nt.length) continue;
    const set = new Set(nt);
    const shared = tt.filter((w) => set.has(w)).length;
    // numbers have to agree both ways: Black Ops 7 isn't Black Ops 6, and Hades isn't Hades II
    if (!digits.every((d) => set.has(d))) continue;
    if (nt.some((w) => /^\d+$/.test(w) && !tt.includes(w))) continue;
    const need = Math.min(2, tt.length);
    if (shared < need || shared / tt.length < 0.6) continue;
    const score = (shared / new Set([...tt, ...nt]).size) * (addon ? 0.5 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return bestScore >= 0.34 ? best : null;
}

// The Steam game a Now Playing entry is: the one it was added as, else one in your library by name, else what the
// sync found on the store for that name (a game you play elsewhere). Games not in your library say notOwned.
export function steamGameFor(item, steam) {
  if (!steam || !item) return null;
  const games = steam.games || [];
  if (item.appid) return games.find((g) => g.id === item.appid) || { id: item.appid, n: item.title, notOwned: 1 };
  const own = matchGame(item.title, games);
  if (own) return own;
  const l = steam.lookups && steam.lookups[normTitle(item.title)];
  return l && l.id ? { id: l.id, n: l.n, notOwned: 1 } : null;
}

// The documents as the page reads them (anything missing or odd → empty).
export function normalizeSteam(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.games)) return null;
  return {
    ...d,
    games: d.games.filter((g) => g && Number.isFinite(g.id) && g.n),
    art: d.art && typeof d.art === 'object' ? d.art : {},
    lookups: d.lookups && typeof d.lookups === 'object' ? d.lookups : {},
    ach: d.ach && typeof d.ach === 'object' ? d.ach : {},
    hist: Array.isArray(d.hist) ? d.hist.filter((h) => h && /^\d{4}-\d{2}-\d{2}$/.test(h.d)) : [],
  };
}
export const normalizeLive = (d) => (d && typeof d === 'object' ? d : null);

// ---------------------------------------------------------------- covers
// A game's pictures: the tall library cover (not every game has one), the wide header, and the small icon.
// Art as the sync saves it: { t: cache-buster, c: tall cover file if unusual, nc: 1 if there's no tall cover,
// h: header file if unusual, x: 1 if the game isn't on the store } (the demo spells out f, the whole path format).
export function artFor(id, steam) {
  const a = steam && steam.art && steam.art[id];
  const fmt = a && a.f ? a.f : a && a.t ? `steam/apps/${id}/\${FILENAME}?t=${a.t}` : null;
  const file = (f) => (fmt ? ART_BASE + fmt.replace('${FILENAME}', f) : `${ART_BASE}steam/apps/${id}/${f}`);
  let cover;
  if (!a || a.x) cover = file('library_600x900_2x.jpg'); // not looked up yet (or no store page): try the usual name
  else if (a.f) cover = a.c ? file(a.c) : null;
  else cover = a.nc ? null : file(a.c || 'library_600x900_2x.jpg');
  const g = steam && steam.games ? steam.games.find((x) => x.id === id) : null;
  return {
    cover,
    header: file((a && a.h) || 'header.jpg'),
    icon: g && g.ic ? `${ICON_BASE}${id}/${g.ic}.jpg` : null,
  };
}

// ---------------------------------------------------------------- numbers
export function hoursText(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  if (m === 0) return 'Never played';
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h).toLocaleString('en-US')} h`;
}
export const hoursNum = (mins) => Math.round(((Number(mins) || 0) / 60) * 10) / 10;

export function libraryStats(steam) {
  const games = (steam && steam.games) || [];
  const own = games.filter((g) => !g.shared);
  const total = own.reduce((s, g) => s + (g.m || 0), 0);
  const two = games.reduce((s, g) => s + (g.w || 0), 0);
  const real = own.filter((g) => !isExtra(g.n)); // soundtracks and tools aren't games
  const played = real.filter((g) => g.m > 0).length;
  const top = own.slice().sort((a, b) => b.m - a.m)[0] || null;
  return { owned: real.length, played, backlog: backlog({ games }).length, total, twoWeeks: two, top };
}

// ---------------------------------------------------------------- the library
export const SORTS = [
  ['played', 'Most played'],
  ['recent', 'Recently played'],
  ['name', 'A–Z'],
];
export function sortGames(games, by = 'played') {
  const list = (games || []).slice();
  if (by === 'recent') return list.sort((a, b) => (b.l || 0) - (a.l || 0) || b.m - a.m);
  if (by === 'name') return list.sort((a, b) => normTitle(a.n).localeCompare(normTitle(b.n)));
  return list.sort((a, b) => b.m - a.m || normTitle(a.n).localeCompare(normTitle(b.n)));
}
export function filterGames(games, { q = '', show = 'all' } = {}) {
  const words = normTitle(q).split(' ').filter(Boolean);
  return (games || []).filter((g) => {
    if (show === 'played' && !(g.m > 0)) return false;
    if (show === 'backlog' && (g.m > 0 || g.shared)) return false;
    const n = normTitle(g.n);
    return words.every((w) => n.includes(w));
  });
}
export const recentGames = (steam) =>
  ((steam && steam.games) || [])
    .filter((g) => g.w > 0)
    .sort((a, b) => (b.l || 0) - (a.l || 0) || b.w - a.w);
// Never played, owned outright (not borrowed through Family Sharing), and not a soundtrack or tool.
export const backlog = (steam) => ((steam && steam.games) || []).filter((g) => !(g.m > 0) && !g.shared && !isExtra(g.n));
export function pickBacklog(steam, rnd = Math.random, not = null) {
  const list = backlog(steam).filter((g) => g.id !== not);
  return list.length ? list[Math.floor(rnd() * list.length) % list.length] : null;
}

// ---------------------------------------------------------------- playtime history
// Each sync compares every game's total with the last sync's; what grew is added to today (New York time).
// history: [{ d: 'YYYY-MM-DD', m: minutes, g: { appid: minutes } }], oldest first.
export function addHistory(history, prevGames, games, day) {
  const hist = Array.isArray(history) ? history.map((h) => ({ d: h.d, m: h.m, g: { ...h.g } })) : [];
  if (!Array.isArray(prevGames) || !prevGames.length) return hist; // the first sync has nothing to compare with
  const before = new Map(prevGames.map((g) => [g.id, g.m || 0]));
  const grew = {};
  for (const g of games || []) {
    const was = before.get(g.id);
    // a game that wasn't there last time (just bought, or borrowed and back in the list) counts at most what Steam
    // says was played in the last two weeks, never its whole lifetime
    const delta = was == null ? Math.min(g.m || 0, g.w || 0) : (g.m || 0) - was;
    if (delta > 0) grew[g.id] = Math.min(delta, 24 * 60);
  }
  const ids = Object.keys(grew);
  if (ids.length) {
    let row = hist.find((h) => h.d === day);
    if (!row) {
      row = { d: day, m: 0, g: {} };
      hist.push(row);
      hist.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    }
    for (const id of ids) row.g[id] = (row.g[id] || 0) + grew[id];
    // a day holds at most 24 hours (after a gap in syncs everything lands on one day): scale the games down to fit
    const sum = Object.values(row.g).reduce((s, v) => s + v, 0);
    if (sum > 24 * 60) for (const id of Object.keys(row.g)) row.g[id] = Math.round((row.g[id] * 24 * 60) / sum);
    row.m = Object.values(row.g).reduce((s, v) => s + v, 0);
  }
  const cutoff = addDaysISO(day, -HISTORY_DAYS);
  return hist.filter((h) => h.d > cutoff);
}
export function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
const mondayOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDaysISO(iso, -wd);
};
// Bars for the last `days` days, or by week for the last `weeks` weeks, each split into its top games.
export function historySeries(steam, today, mode = 'days', span = mode === 'days' ? 30 : 12, topN = 4) {
  const hist = (steam && steam.hist) || [];
  const slots = [];
  if (mode === 'days') for (let i = span - 1; i >= 0; i--) slots.push(addDaysISO(today, -i));
  else {
    const w0 = mondayOf(today);
    for (let i = span - 1; i >= 0; i--) slots.push(addDaysISO(w0, -7 * i));
  }
  const bucket = (d) => (mode === 'days' ? d : mondayOf(d));
  const sums = new Map(slots.map((s) => [s, {}]));
  for (const h of hist) {
    const b = sums.get(bucket(h.d));
    if (!b) continue;
    for (const [id, v] of Object.entries(h.g || {})) b[id] = (b[id] || 0) + v;
  }
  // the games with the most time in the window get their own color; the rest are "Other"
  const totals = {};
  for (const b of sums.values()) for (const [id, v] of Object.entries(b)) totals[id] = (totals[id] || 0) + v;
  const top = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => Number(id));
  const name = (id) => {
    const g = steam && steam.games && steam.games.find((x) => x.id === id);
    return g ? g.n : 'Other';
  };
  const points = [];
  let total = 0;
  for (const s of slots) {
    const b = sums.get(s);
    const mins = Object.values(b).reduce((x, v) => x + v, 0);
    total += mins;
    if (!mins) continue;
    const parts = top.map((id, i) => ({ v: hoursNum(b[id] || 0), k: i, label: name(id) }));
    const rest = mins - top.reduce((x, id) => x + (b[id] || 0), 0);
    if (rest > 0) parts.push({ v: hoursNum(rest), k: 'other', label: 'Other' });
    points.push({ t: s, week: mode !== 'days', parts });
  }
  return { slots, points, top: top.map((id) => ({ id, n: name(id) })), total, since: hist.length ? hist[0].d : null };
}

// ---------------------------------------------------------------- achievements
// From Steam's three answers (yours, the game's list with names and icons, and everyone's unlock rates) to what the
// page shows: how many, the latest few you unlocked, and your rarest.
export function summarizeAchievements(mine, schema, rates, now = Date.now()) {
  const list = (mine && mine.achievements) || [];
  const byName = new Map(((schema && schema.availableGameStats && schema.availableGameStats.achievements) || []).map((a) => [a.name, a]));
  const pct = new Map((((rates && rates.achievements) || [])).map((a) => [a.name, Number(a.percent)]));
  const got = list.filter((a) => a.achieved);
  const info = (a) => {
    const s = byName.get(a.apiname) || {};
    const p = pct.get(a.apiname);
    return { n: a.name || s.displayName || a.apiname, i: s.icon || '', at: a.unlocktime || 0, p: Number.isFinite(p) ? Math.round(p * 10) / 10 : null };
  };
  const recent = got
    .slice()
    .sort((a, b) => (b.unlocktime || 0) - (a.unlocktime || 0))
    .slice(0, 3)
    .map(info);
  const rare = got
    .filter((a) => Number.isFinite(pct.get(a.apiname)))
    .sort((a, b) => pct.get(a.apiname) - pct.get(b.apiname))
    .slice(0, 3)
    .map(info);
  return { t: list.length, u: got.length, last: got.reduce((m, a) => Math.max(m, a.unlocktime || 0), 0), recent, rare, at: Math.floor(now / 1000) };
}

// ---------------------------------------------------------------- live status
export const STATE = ['Offline', 'Online', 'Busy', 'Away', 'Snooze', 'Looking to trade', 'Looking to play'];
// What to say: { playing: name, id, mins } while in a game, else { online } or { offline }. Stale (over 40 minutes
// since the job last looked) counts as not knowing.
export function liveStatus(live, now = Date.now()) {
  if (!live || !live.seenAt) return null;
  const age = now - new Date(live.seenAt).getTime();
  if (!(age < 40 * 60000)) return { stale: true, seenAt: live.seenAt };
  if (live.game && live.game.n) {
    const mins = live.since ? Math.max(0, Math.round((now - new Date(live.since).getTime()) / 60000)) : null;
    return { playing: live.game.n, id: live.game.id || null, mins };
  }
  return live.state > 0 ? { online: STATE[live.state] || 'Online' } : { offline: true, lastOff: live.lastOff || null };
}
// The job looks every 15 minutes, so this is rough on purpose.
export function sinceText(mins) {
  if (mins == null) return '';
  if (mins < 15) return 'just started';
  if (mins < 60) return `about ${Math.round(mins / 5) * 5} min so far`;
  let h = Math.floor(mins / 60);
  let m = Math.round((mins % 60) / 15) * 15;
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return `about ${h} h${m ? ` ${m} min` : ''} so far`;
}

// ---------------------------------------------------------------- setup messages
export const ERRORS = {
  'no-key': 'The sync hasn’t found your Steam API key yet. Add it as the STEAM_API_KEY secret (step 3).',
  'bad-key': 'Steam turned down the API key. Check the STEAM_API_KEY secret matches the key on steamcommunity.com/dev/apikey.',
  'bad-profile': 'Steam couldn’t find that profile. Paste the link from your Steam profile page.',
  private: 'Steam isn’t sharing your games. In Steam: Edit Profile → Privacy Settings → Game details → Public.',
  'steam-down': 'Steam didn’t answer at the last sync. It tries again every 15 minutes.',
  'save-failed': 'The last sync couldn’t save your library. It tries again every 15 minutes.',
};
