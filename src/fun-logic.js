// Entertainment tab data: release countdowns, what you're playing (with challenge counters), and the Avengers:
// Doomsday watch list. Saved in trackers/<doc>-fun. All changes go through small functions so they're easy to test.
import { uid, todayISO } from './budget-logic.js';
import { IS_DEMO } from './demo-flag.js';

export const DOOMSDAY = '2026-12-18'; // Marvel Studios, in theaters
export const KINDS = [
  ['game', 'Game', '🎮'],
  ['movie', 'Movie', '🎬'],
  ['show', 'Show', '📺'],
  ['other', 'Other', '📅'],
];
export const KIND_ICON = Object.fromEntries(KINDS.map(([k, , i]) => [k, i]));

const DAY = 86400000;
export const daysFrom = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / DAY);

// ---------------------------------------------------------------- the Doomsday watch list
// Everything Marvel on screen that could matter going in, in release order within each group. You decide what counts:
// each title is Watched, Skipped (not needed for Doomsday), or still to watch. `key` marks the titles most
// pre-Doomsday guides call essential (NME's list, Sept 2026), shown as a hint only.
export const MCU_GROUPS = [
  ['p1', 'Phase One', '2008–2012'],
  ['p2', 'Phase Two', '2013–2015'],
  ['p3', 'Phase Three', '2016–2019'],
  ['p4', 'Phase Four', '2021–2022'],
  ['p5', 'Phase Five', '2023–2025'],
  ['p6', 'Phase Six', '2025–2026'],
  ['xmen', 'Fox’s X-Men and Deadpool', '2000–2020'],
  ['sony', 'Spider-Man before the MCU', '2002–2024'],
  ['netflix', 'Marvel on Netflix', '2015–2019'],
  ['mine', 'Added by you', ''],
];
const F = 'film';
const S = 'series';
const X = 'special';
// [id, title, year, type, group, key, out (release date, for anything not out yet)]
const RAW = [
  ['iron-man', 'Iron Man', 2008, F, 'p1'],
  ['incredible-hulk', 'The Incredible Hulk', 2008, F, 'p1'],
  ['iron-man-2', 'Iron Man 2', 2010, F, 'p1'],
  ['thor', 'Thor', 2011, F, 'p1'],
  ['cap-1', 'Captain America: The First Avenger', 2011, F, 'p1', 1],
  ['avengers', 'The Avengers', 2012, F, 'p1', 1],
  ['iron-man-3', 'Iron Man 3', 2013, F, 'p2'],
  ['thor-2', 'Thor: The Dark World', 2013, F, 'p2'],
  ['cap-2', 'Captain America: The Winter Soldier', 2014, F, 'p2'],
  ['gotg', 'Guardians of the Galaxy', 2014, F, 'p2'],
  ['aou', 'Avengers: Age of Ultron', 2015, F, 'p2'],
  ['ant-man', 'Ant-Man', 2015, F, 'p2'],
  ['civil-war', 'Captain America: Civil War', 2016, F, 'p3'],
  ['doctor-strange', 'Doctor Strange', 2016, F, 'p3'],
  ['gotg-2', 'Guardians of the Galaxy Vol. 2', 2017, F, 'p3'],
  ['homecoming', 'Spider-Man: Homecoming', 2017, F, 'p3'],
  ['ragnarok', 'Thor: Ragnarok', 2017, F, 'p3'],
  ['black-panther', 'Black Panther', 2018, F, 'p3'],
  ['infinity-war', 'Avengers: Infinity War', 2018, F, 'p3', 1],
  ['ant-man-2', 'Ant-Man and the Wasp', 2018, F, 'p3'],
  ['captain-marvel', 'Captain Marvel', 2019, F, 'p3'],
  ['endgame', 'Avengers: Endgame', 2019, F, 'p3', 1],
  ['ffh', 'Spider-Man: Far From Home', 2019, F, 'p3'],
  ['wandavision', 'WandaVision', 2021, S, 'p4'],
  ['fatws', 'The Falcon and the Winter Soldier', 2021, S, 'p4'],
  ['loki-1', 'Loki, season 1', 2021, S, 'p4', 1],
  ['black-widow', 'Black Widow', 2021, F, 'p4'],
  ['what-if-1', 'What If…?, season 1', 2021, S, 'p4'],
  ['shang-chi', 'Shang-Chi and the Legend of the Ten Rings', 2021, F, 'p4', 1],
  ['eternals', 'Eternals', 2021, F, 'p4'],
  ['hawkeye', 'Hawkeye', 2021, S, 'p4'],
  ['nwh', 'Spider-Man: No Way Home', 2021, F, 'p4', 1],
  ['moon-knight', 'Moon Knight', 2022, S, 'p4'],
  ['mom', 'Doctor Strange in the Multiverse of Madness', 2022, F, 'p4', 1],
  ['ms-marvel', 'Ms. Marvel', 2022, S, 'p4'],
  ['love-thunder', 'Thor: Love and Thunder', 2022, F, 'p4'],
  ['i-am-groot', 'I Am Groot (shorts)', 2022, X, 'p4'],
  ['she-hulk', 'She-Hulk: Attorney at Law', 2022, S, 'p4'],
  ['werewolf', 'Werewolf by Night', 2022, X, 'p4'],
  ['wakanda-forever', 'Black Panther: Wakanda Forever', 2022, F, 'p4', 1],
  ['gotg-holiday', 'The Guardians of the Galaxy Holiday Special', 2022, X, 'p4'],
  ['quantumania', 'Ant-Man and the Wasp: Quantumania', 2023, F, 'p5'],
  ['gotg-3', 'Guardians of the Galaxy Vol. 3', 2023, F, 'p5'],
  ['secret-invasion', 'Secret Invasion', 2023, S, 'p5'],
  ['loki-2', 'Loki, season 2', 2023, S, 'p5', 1],
  ['the-marvels', 'The Marvels', 2023, F, 'p5'],
  ['what-if-2', 'What If…?, season 2', 2023, S, 'p5'],
  ['echo', 'Echo', 2024, S, 'p5'],
  ['deadpool-wolverine', 'Deadpool & Wolverine', 2024, F, 'p5', 1],
  ['agatha', 'Agatha All Along', 2024, S, 'p5'],
  ['what-if-3', 'What If…?, season 3', 2024, S, 'p5'],
  ['fnsm', 'Your Friendly Neighborhood Spider-Man', 2025, S, 'p5'],
  ['bnw', 'Captain America: Brave New World', 2025, F, 'p5', 1],
  ['dd-ba-1', 'Daredevil: Born Again, season 1', 2025, S, 'p5'],
  ['thunderbolts', 'Thunderbolts*', 2025, F, 'p5', 1],
  ['ironheart', 'Ironheart', 2025, S, 'p5'],
  ['first-steps', 'The Fantastic Four: First Steps', 2025, F, 'p6', 1],
  ['eyes-of-wakanda', 'Eyes of Wakanda', 2025, S, 'p6'],
  ['marvel-zombies', 'Marvel Zombies', 2025, S, 'p6'],
  ['wonder-man', 'Wonder Man', 2026, S, 'p6'],
  ['dd-ba-2', 'Daredevil: Born Again, season 2', 2026, S, 'p6'],
  ['punisher-special', 'The Punisher: One Last Kill', 2026, X, 'p6'],
  ['bnd', 'Spider-Man: Brand New Day', 2026, F, 'p6', 1],
  ['visionquest', 'VisionQuest', 2026, S, 'p6', 0, '2026-10-14'],
  ['x-men', 'X-Men', 2000, F, 'xmen', 1],
  ['x2', 'X2', 2003, F, 'xmen', 1],
  ['last-stand', 'X-Men: The Last Stand', 2006, F, 'xmen'],
  ['origins', 'X-Men Origins: Wolverine', 2009, F, 'xmen'],
  ['first-class', 'X-Men: First Class', 2011, F, 'xmen'],
  ['the-wolverine', 'The Wolverine', 2013, F, 'xmen'],
  ['dofp', 'X-Men: Days of Future Past', 2014, F, 'xmen'],
  ['deadpool', 'Deadpool', 2016, F, 'xmen'],
  ['apocalypse', 'X-Men: Apocalypse', 2016, F, 'xmen'],
  ['logan', 'Logan', 2017, F, 'xmen'],
  ['deadpool-2', 'Deadpool 2', 2018, F, 'xmen'],
  ['dark-phoenix', 'Dark Phoenix', 2019, F, 'xmen'],
  ['new-mutants', 'The New Mutants', 2020, F, 'xmen'],
  ['raimi-1', 'Spider-Man', 2002, F, 'sony'],
  ['raimi-2', 'Spider-Man 2', 2004, F, 'sony'],
  ['raimi-3', 'Spider-Man 3', 2007, F, 'sony'],
  ['tasm', 'The Amazing Spider-Man', 2012, F, 'sony'],
  ['tasm-2', 'The Amazing Spider-Man 2', 2014, F, 'sony'],
  ['venom', 'Venom', 2018, F, 'sony'],
  ['venom-2', 'Venom: Let There Be Carnage', 2021, F, 'sony'],
  ['venom-3', 'Venom: The Last Dance', 2024, F, 'sony'],
  ['daredevil', 'Daredevil (3 seasons)', 2015, S, 'netflix'],
  ['jessica-jones', 'Jessica Jones (3 seasons)', 2015, S, 'netflix'],
  ['luke-cage', 'Luke Cage (2 seasons)', 2016, S, 'netflix'],
  ['iron-fist', 'Iron Fist (2 seasons)', 2017, S, 'netflix'],
  ['defenders', 'The Defenders', 2017, S, 'netflix'],
  ['punisher', 'The Punisher (2 seasons)', 2017, S, 'netflix'],
];
export const MCU = RAW.map(([id, title, year, type, group, key, out]) => ({ id, title, year, type, group, key: !!key, out: out || null }));
export const MCU_SOURCE = { label: 'NME: every Marvel film and show to watch before Avengers: Doomsday', url: 'https://www.nme.com/news/film/every-marvel-film-and-disney-tv-show-to-watch-before-avengers-doomsday-3964787' };

// ---------------------------------------------------------------- defaults
const SEED_RELEASES = [
  { id: 'gta6', title: 'Grand Theft Auto VI', short: 'GTA VI', date: '2026-11-19', kind: 'game', note: 'PS5', home: true, pin: true },
  { id: 'mw4', title: 'Call of Duty: Modern Warfare 4', short: 'MW4', date: '2026-10-23', kind: 'game', note: 'PS5', home: true },
  { id: 'visionquest', title: 'VisionQuest', short: '', date: '2026-10-14', kind: 'show', note: 'Disney+' },
  { id: 'doomsday', title: 'Avengers: Doomsday', short: 'Doomsday', date: DOOMSDAY, kind: 'movie', note: 'In theaters', home: true },
];
const ch = (id, text, goal) => ({ id, text, goal, n: 0 });
const SEED_PLAYING = [
  {
    id: 'bo7',
    title: 'Black Ops 7 Zombies',
    note: 'PS5',
    challenges: [
      ch('rex-ee', 'Rex Infernus main Easter egg', 1),
      ch('cursed-500', 'Totenreich Cursed: 500 kills in Cursed Mode', 500),
      ch('cursed-streak', 'Totenreich Cursed: 25 kills with a single scorestreak', 50),
      ch('cursed-shroud', 'Totenreich Cursed: 15 kills with a single Aether Shroud use', 10),
      ch('cursed-r25', 'Totenreich Cursed: reach round 25 in Survival and exfil', 1),
      ch('cursed-rapid', 'Totenreich Cursed: rapidly kill 10 zombies with scorestreaks', 15),
    ],
  },
  { id: 'tft', title: 'Teamfight Tactics', note: '', challenges: [] },
  { id: 'pogo', title: 'Pokémon GO', note: '', challenges: [] },
];

// (The demo seeds its own document; this default is the owner's starting point.)
export function defaultFun() {
  if (IS_DEMO) return { version: 1, releases: [], playing: [], mcu: {}, mcuMine: [] };
  return { version: 1, releases: JSON.parse(JSON.stringify(SEED_RELEASES)), playing: JSON.parse(JSON.stringify(SEED_PLAYING)), mcu: {}, mcuMine: [] };
}

export function normalizeFun(d) {
  const base = defaultFun();
  if (!d || typeof d !== 'object') return base;
  const okDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  return {
    version: 1,
    releases: Array.isArray(d.releases) ? d.releases.filter((r) => r && r.title && okDate(r.date)) : base.releases,
    playing: Array.isArray(d.playing)
      ? d.playing.filter((g) => g && g.title).map((g) => ({ ...g, challenges: Array.isArray(g.challenges) ? g.challenges.filter((c) => c && c.text) : [] }))
      : base.playing,
    mcu: d.mcu && typeof d.mcu === 'object' ? d.mcu : {},
    mcuMine: Array.isArray(d.mcuMine) ? d.mcuMine.filter((t) => t && t.id && t.title) : [],
    updatedAt: d.updatedAt,
  };
}

// ---------------------------------------------------------------- countdowns
// Upcoming releases, soonest first, with days to go (released ones drop off a week after).
export function upcoming(d, today = todayISO()) {
  return d.releases
    .map((r) => ({ ...r, days: daysFrom(today, r.date) }))
    .filter((r) => r.days >= -7)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
// The one shown big at the top: the pinned one if it's still ahead, otherwise the next one.
export function featured(d, today = todayISO()) {
  const list = upcoming(d, today).filter((r) => r.days >= 0);
  return list.find((r) => r.pin) || list[0] || null;
}
// Days, hours, minutes and seconds to local midnight of the release day.
export function timeLeft(date, now = new Date()) {
  const [y, m, dd] = date.split('-').map(Number);
  const ms = Math.max(0, new Date(y, m - 1, dd) - now);
  return { ms, d: Math.floor(ms / DAY), h: Math.floor((ms % DAY) / 3600000), m: Math.floor((ms % 3600000) / 60000), s: Math.floor((ms % 60000) / 1000) };
}
export const isGta = (r) => !!r && /\b(gta|grand theft auto)\b/i.test(`${r.title} ${r.short || ''}`);

export function addRelease(d, { title, date, kind = 'other', note = '', home = false }) {
  const t = String(title || '').trim();
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const r = { id: uid(), title: t, short: '', date, kind, note: String(note || '').trim(), home: !!home };
  d.releases.push(r);
  return r;
}
export function removeRelease(d, id) {
  d.releases = d.releases.filter((r) => r.id !== id);
}
export function toggleReleaseHome(d, id) {
  const r = d.releases.find((x) => x.id === id);
  if (r) r.home = !r.home;
}
export function pinRelease(d, id) {
  d.releases.forEach((r) => (r.pin = r.id === id ? !r.pin : false));
}

// ---------------------------------------------------------------- now playing
export function addGame(d, { title, note = '' }) {
  const t = String(title || '').trim();
  if (!t) return null;
  const g = { id: uid(), title: t, note: String(note || '').trim(), challenges: [] };
  d.playing.push(g);
  return g;
}
export function removeGame(d, id) {
  d.playing = d.playing.filter((g) => g.id !== id);
}
export function setGameNote(d, id, note) {
  const g = d.playing.find((x) => x.id === id);
  if (g) g.note = String(note || '').trim();
}
export function addChallenge(d, gameId, { text, goal }) {
  const g = d.playing.find((x) => x.id === gameId);
  const t = String(text || '').trim();
  if (!g || !t) return null;
  const c = { id: uid(), text: t, goal: Math.max(1, Math.round(Number(goal) || 1)), n: 0 };
  g.challenges.push(c);
  return c;
}
export function bumpChallenge(d, gameId, id, by) {
  const g = d.playing.find((x) => x.id === gameId);
  const c = g && g.challenges.find((x) => x.id === id);
  if (!c) return null;
  const was = c.n >= c.goal;
  c.n = Math.max(0, Math.min(c.goal, (Number(c.n) || 0) + by));
  if (c.n >= c.goal && !was) c.doneOn = todayISO();
  if (c.n < c.goal) delete c.doneOn;
  return { done: c.n >= c.goal && !was };
}
export function setChallenge(d, gameId, id, n) {
  const g = d.playing.find((x) => x.id === gameId);
  const c = g && g.challenges.find((x) => x.id === id);
  if (!c) return;
  c.n = Math.max(0, Math.min(c.goal, Math.round(Number(n) || 0)));
  if (c.n >= c.goal) c.doneOn = c.doneOn || todayISO();
  else delete c.doneOn;
}
export function removeChallenge(d, gameId, id) {
  const g = d.playing.find((x) => x.id === gameId);
  if (g) g.challenges = g.challenges.filter((c) => c.id !== id);
}
export function clearDoneChallenges(d, gameId) {
  const g = d.playing.find((x) => x.id === gameId);
  if (g) g.challenges = g.challenges.filter((c) => c.n < c.goal);
}

// ---------------------------------------------------------------- watch list
export const mcuList = (d) => [...MCU, ...d.mcuMine.map((t) => ({ ...t, group: 'mine', type: t.type || F, key: false, out: null }))];
export const mcuState = (d, id) => d.mcu[id] || null; // 'w' watched, 's' skipped, null still to watch
export function setMcu(d, id, state) {
  if (state === 'w' || state === 's') d.mcu[id] = state;
  else delete d.mcu[id];
}
export function addMcuTitle(d, { title, year }) {
  const t = String(title || '').trim();
  if (!t) return null;
  const x = { id: `mine-${uid()}`, title: t, year: Number(year) || null };
  d.mcuMine.push(x);
  return x;
}
export function removeMcuTitle(d, id) {
  d.mcuMine = d.mcuMine.filter((t) => t.id !== id);
  delete d.mcu[id];
}
// How far along you are: skipped titles don't count; the pace is what's left over the weeks until Doomsday.
export function mcuProgress(d, today = todayISO()) {
  const list = mcuList(d);
  const watched = list.filter((t) => d.mcu[t.id] === 'w').length;
  const skipped = list.filter((t) => d.mcu[t.id] === 's').length;
  const needed = list.length - skipped;
  const left = needed - watched;
  const days = daysFrom(today, DOOMSDAY);
  const weeks = Math.max(1, days / 7);
  return { total: list.length, watched, skipped, needed, left, days, pct: needed ? watched / needed : 1, perWeek: days > 0 ? Math.ceil((left / weeks) * 10) / 10 : null };
}
export function groupProgress(d, group) {
  const list = mcuList(d).filter((t) => t.group === group);
  const watched = list.filter((t) => d.mcu[t.id] === 'w').length;
  const skipped = list.filter((t) => d.mcu[t.id] === 's').length;
  return { total: list.length, watched, skipped, left: list.length - watched - skipped };
}
// Mark a whole group at once (e.g. "watched all of Phase One").
export function setGroup(d, group, state) {
  mcuList(d)
    .filter((t) => t.group === group)
    .forEach((t) => setMcu(d, t.id, state));
}
