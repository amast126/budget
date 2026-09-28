// Steam for the Entertainment tab, run every 15 minutes by .github/workflows/steam.yml.
// Reads your Steam profile link from trackers/<doc>-fun (Entertainment → Steam → Connect), then asks the Steam Web
// API (your key, the STEAM_API_KEY secret) for your library, playtime, what you're playing and achievements, and the
// store for each game's cover art. Saves trackers/<doc>-steam (only when something changed) and
// trackers/<doc>-steam-live (every run: online, in a game, or what went wrong). Firestore access uses the same
// FIREBASE_SERVICE_ACCOUNT secret as the budget alerts. The Actions log is public, so it only ever prints counts:
// never game names, hours, your name or your ID. Problems are saved for the page to show and the run still ends
// green, so a Steam outage doesn't send you a failed-run email every 15 minutes.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessToken, readConfig, localDay } from './budget-alerts.mjs';
import { parseProfile, matchGame, addHistory, summarizeAchievements, normTitle, isExtra } from '../src/steam-logic.js';

const API = 'https://api.steampowered.com';
const STORE = 'https://store.steampowered.com';
const ART_DAYS = 30; // refresh a game's art links this often (new covers get new file names)
const ACH_DAYS = 7; // look again at a game's achievements even when your count hasn't changed
const LOOKUPS_PER_RUN = 5;
const ACH_GAMES = 12;
const CALL_TIMEOUT = 15000; // one slow answer can't hold the run past the job's 4 minutes
const EXTRAS_BUDGET = 150000; // after this long, skip the extras (covers, lookups, achievements) and save what's in hand
const MAX_DOC = 900000; // a Firestore document holds 1 MiB; leave room

const docUrl = (project, id) => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/trackers/${encodeURIComponent(id)}`;
async function readDoc(f, token, project, id) {
  const r = await f(docUrl(project, id), { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`reading a document returned ${r.status}`);
  const j = await r.json();
  const s = j.fields && j.fields.json && j.fields.json.stringValue;
  return s ? JSON.parse(s) : null;
}
async function writeDoc(f, token, project, id, data, now) {
  const r = await f(docUrl(project, id), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify({ ...data, updatedAt: now }) }, updatedAt: { integerValue: String(now) }, client: { stringValue: 'steam-job' } } }),
  });
  if (!r.ok) throw new Error(`saving a document returned ${r.status}`);
}

class SteamError extends Error {
  constructor(code, msg) {
    super(msg || code);
    this.code = code;
  }
}
// One Web API call. A 401/403 means the key; anything else unexpected is Steam having a moment.
async function steam(f, pathAndQuery, key) {
  const url = `${API}${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}&format=json`;
  let r;
  try {
    r = await f(url);
  } catch {
    throw new SteamError('steam-down');
  }
  if (r.status === 401 || r.status === 403) throw new SteamError('bad-key');
  if (!r.ok) {
    const e = new SteamError('steam-down', `status ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}
async function publicJson(f, url) {
  try {
    const r = await f(url);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function resolveId(f, key, profile, prev) {
  const p = parseProfile(profile);
  if (!p) throw new SteamError('bad-profile');
  if (p.id) return p.id;
  if (prev && prev.steamid && prev.profile === profile) return prev.steamid;
  const j = await steam(f, `/ISteamUser/ResolveVanityURL/v1/?vanityurl=${encodeURIComponent(p.vanity)}`, key);
  const id = j && j.response && j.response.success === 1 ? j.response.steamid : null;
  if (!id) throw new SteamError('bad-profile');
  return id;
}

// A game's art as the page needs it, kept small (a big library has thousands): the cache-buster, and the file names
// only where they aren't the usual ones. nc: no tall cover.
function compactArt(a, nowS) {
  const o = { t: String((String(a.asset_url_format).match(/[?&]t=(\d+)/) || [])[1] || ''), at: nowS };
  const cover = a.library_capsule_2x || a.library_capsule || '';
  if (!cover) o.nc = 1;
  else if (cover !== 'library_600x900_2x.jpg') o.c = cover;
  if (a.header && a.header !== 'header.jpg') o.h = a.header;
  if (!/^steam\/apps\/\d+\/\$\{FILENAME\}(\?t=\d+)?$/.test(a.asset_url_format)) o.f = a.asset_url_format; // an unusual path: keep it whole
  return o;
}

// Cover art file names from the store, for the games that don't have them yet (or haven't been checked lately).
async function fetchArt(f, ids, prevArt, nowS, late) {
  const art = { ...(prevArt || {}) };
  const need = ids.filter((id) => !art[id] || nowS - (art[id].at || 0) > ART_DAYS * 86400).slice(0, 1000);
  for (let i = 0; i < need.length && !late(); i += 100) {
    const batch = need.slice(i, i + 100);
    const input = { ids: batch.map((appid) => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true } };
    const j = await publicJson(f, `${API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
    const items = (j && j.response && j.response.store_items) || null;
    if (!items) continue; // try again next run
    const byId = new Map(items.map((it) => [it.appid || it.id, it]));
    for (const id of batch) {
      const it = byId.get(id);
      const a = it && it.success === 1 && it.assets;
      art[id] = a && a.asset_url_format ? compactArt(a, nowS) : { x: 1, at: nowS }; // x: not on the store (the page tries the plain file names)
    }
  }
  return art;
}

// Now Playing games that aren't in your library (a PS5 game, say) get looked up on the store for their cover.
async function lookUp(f, titles, library, prevLookups, nowS, late) {
  const lookups = { ...(prevLookups || {}) };
  let n = 0;
  for (const t of titles) {
    if (late()) break;
    const k = normTitle(t);
    if (!k || matchGame(t, library)) continue;
    if (lookups[k] && nowS - (lookups[k].at || 0) < ART_DAYS * 86400) continue;
    if (n++ >= LOOKUPS_PER_RUN) break;
    const j = await publicJson(f, `${STORE}/api/storesearch/?term=${encodeURIComponent(t)}&cc=US&l=english`);
    if (!j) continue;
    const hit = matchGame(
      t,
      (j.items || []).filter((it) => it.type === 'app').map((it) => ({ id: it.id, n: it.name }))
    );
    lookups[k] = hit ? { id: hit.id, n: hit.n, at: nowS } : { id: 0, at: nowS };
  }
  return lookups;
}

async function achievementsFor(f, key, steamid, id, prev, nowS) {
  if (prev && prev.t === 0 && nowS - (prev.at || 0) < ACH_DAYS * 86400) return prev; // a game without any: look again next week
  let mine;
  try {
    const j = await steam(f, `/ISteamUserStats/GetPlayerAchievements/v1/?steamid=${steamid}&appid=${id}&l=english`, key);
    mine = j && j.playerstats;
  } catch (e) {
    // a game without achievements answers 400 ("Requested app has no stats"); one you don't own (borrowed through
    // Family Sharing) answers 403. The key itself was fine a moment ago, so neither is about the key.
    if (e.status === 400 || e.code === 'bad-key') return { t: 0, at: nowS };
    return prev || null;
  }
  if (!mine || mine.success === false || !Array.isArray(mine.achievements)) return { t: 0, at: nowS };
  const got = mine.achievements.filter((a) => a.achieved);
  const last = got.reduce((m, a) => Math.max(m, a.unlocktime || 0), 0);
  // nothing new since last time: keep what's saved (names, icons and rarity don't need fetching again)
  if (prev && prev.t === mine.achievements.length && prev.u === got.length && prev.last === last && nowS - (prev.at || 0) < ACH_DAYS * 86400) return prev;
  const schema = await steam(f, `/ISteamUserStats/GetSchemaForGame/v2/?appid=${id}&l=english`, key).catch(() => null);
  const rates = await publicJson(f, `${API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${id}`);
  return summarizeAchievements(mine, schema && schema.game, rates && rates.achievementpercentages, nowS * 1000);
}

// Keep the document under Firestore's size limit for a very big library: first drop cover links for games never
// played (the page falls back to Steam's usual file names), then the oldest history.
export function fit(doc) {
  const size = () => Buffer.byteLength(JSON.stringify(doc));
  if (size() <= MAX_DOC) return doc;
  const never = new Set(doc.games.filter((g) => !(g.m > 0)).map((g) => g.id));
  doc.art = Object.fromEntries(Object.entries(doc.art).filter(([id]) => !never.has(Number(id))));
  while (size() > MAX_DOC && doc.hist.length > 30) doc.hist = doc.hist.slice(Math.ceil(doc.hist.length / 4));
  while (size() > MAX_DOC && Object.keys(doc.art).length) doc.art = Object.fromEntries(Object.entries(doc.art).slice(0, Math.floor(Object.keys(doc.art).length / 2)));
  return doc;
}

// The library: owned games (with free ones you've played) plus anything recent you don't own (Family Sharing).
function libraryFrom(owned, recent) {
  const games = (owned || []).map((g) => ({
    id: g.appid,
    n: g.name || `App ${g.appid}`,
    m: g.playtime_forever || 0,
    w: g.playtime_2weeks || 0,
    l: g.rtime_last_played || 0,
    ic: g.img_icon_url || '',
  }));
  const have = new Map(games.map((g) => [g.id, g]));
  for (const r of recent || []) {
    const g = have.get(r.appid);
    if (g) g.w = Math.max(g.w, r.playtime_2weeks || 0);
    else games.push({ id: r.appid, n: r.name || `App ${r.appid}`, m: r.playtime_forever || 0, w: r.playtime_2weeks || 0, l: 0, ic: r.img_icon_url || '', shared: 1 });
  }
  return games.sort((a, b) => a.id - b.id);
}

export async function run({ env = process.env, fetchImpl = globalThis.fetch, now = new Date(), log = console.log, root } = {}) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) {
    log('No FIREBASE_SERVICE_ACCOUNT secret yet, so there is nowhere to save. See Entertainment → Steam.');
    return { status: 'no-secret' };
  }
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    log('FIREBASE_SERVICE_ACCOUNT isn’t valid JSON. Paste the whole key file as the secret.');
    return { status: 'bad-secret' };
  }
  const cfg = readConfig(root);
  const project = env.FIREBASE_PROJECT || sa.project_id || (cfg.firebase && cfg.firebase.projectId);
  const docId = env.BUDGET_DOC || cfg.sharedDocId;
  if (!project || !docId || !sa.private_key) {
    log('Couldn’t tell which project or document to use (set BUDGET_DOC).');
    return { status: 'no-doc' };
  }
  const t = now.getTime();
  const nowS = Math.floor(t / 1000);
  // every call gives up after 15 seconds, and the extras stop after about 2½ minutes, so the run ends in time
  const f = (url, o = {}) => fetchImpl(url, { ...o, signal: o.signal || AbortSignal.timeout(CALL_TIMEOUT) });
  const started = Date.now();
  const late = () => Date.now() - started > EXTRAS_BUDGET;
  const token = await accessToken(sa, f, t);
  const fun = await readDoc(f, token, project, `${docId}-fun`);
  const profile = fun && fun.steam && fun.steam.profile;
  if (!profile) {
    log('No Steam profile linked yet (Entertainment → Steam → Connect).');
    return { status: 'no-profile' };
  }
  const liveId = `${docId}-steam-live`;
  const prevLive = await readDoc(f, token, project, liveId);
  const saveLive = (live) => writeDoc(f, token, project, liveId, { version: 1, profile, seenAt: now.toISOString(), ...live }, t);
  const key = String(env.STEAM_API_KEY || '').trim();
  if (!key) {
    await saveLive({ error: 'no-key' });
    log('No STEAM_API_KEY secret yet.');
    return { status: 'no-key' };
  }

  let prev = await readDoc(f, token, project, `${docId}-steam`);
  let steamid;
  let player;
  let owned;
  let recent;
  try {
    steamid = await resolveId(f, key, profile, prev);
    const s = await steam(f, `/ISteamUser/GetPlayerSummaries/v2/?steamids=${steamid}`, key);
    player = s && s.response && s.response.players && s.response.players[0];
    if (!player) throw new SteamError('bad-profile');
    const o = await steam(f, `/IPlayerService/GetOwnedGames/v1/?steamid=${steamid}&include_appinfo=1&include_played_free_games=1`, key);
    // private game details come back as an empty response; an empty library says game_count: 0
    owned = o && o.response && (o.response.games || (o.response.game_count === 0 ? [] : undefined));
    const r = await steam(f, `/IPlayerService/GetRecentlyPlayedGames/v1/?steamid=${steamid}`, key);
    recent = (r && r.response && r.response.games) || [];
  } catch (e) {
    const code = e.code || 'steam-down';
    // keep what was known (who, what's running and since when) so one bad answer doesn't read as "offline"
    const keep = {};
    for (const k of ['persona', 'avatar', 'url', 'state', 'game', 'since', 'lastOff', 'syncedAt']) if (prevLive && prevLive[k] !== undefined) keep[k] = prevLive[k];
    await saveLive({ ...keep, error: code, steamid: steamid || (prevLive && prevLive.steamid) || null });
    log(`Steam sync stopped: ${code}.`);
    return { status: code };
  }

  // a different account than last time: its library, history and achievements start fresh (covers stay)
  if (prev && prev.steamid && prev.steamid !== steamid) prev = { art: prev.art, lookups: prev.lookups };
  // who you are and whether you're in a game (the "since" carries over while it's the same game). A non-Steam game
  // added to Steam has a made-up 64-bit id with no store page, so it gets no id.
  const gameId = player.gameid && Number(player.gameid) < 2 ** 32 ? Number(player.gameid) : null;
  const game = player.gameid ? { id: gameId, n: player.gameextrainfo || '' } : null;
  const same = game && prevLive && prevLive.game && prevLive.game.id === game.id && prevLive.game.n === game.n && prevLive.since;
  const live = {
    steamid,
    persona: player.personaname || '',
    avatar: player.avatarfull || player.avatarmedium || '',
    url: player.profileurl || '',
    state: Number(player.personastate) || 0,
    game,
    since: game ? (same ? prevLive.since : now.toISOString()) : null,
    lastOff: player.lastlogoff ? player.lastlogoff : null,
  };
  if (!Array.isArray(owned)) {
    // private game details: Steam answers with an empty response
    await saveLive({ ...live, error: 'private' });
    log('Steam sync: the profile’s game details aren’t visible.');
    return { status: 'private' };
  }

  const games = libraryFrom(owned, recent);
  const playingTitles = ((fun && fun.playing) || []).map((g) => g.title).filter(Boolean);
  const linked = ((fun && fun.playing) || []).map((g) => g.appid).filter(Boolean);
  const lookups = await lookUp(f, playingTitles, games, prev && prev.lookups, nowS, late);
  const lookedUp = Object.values(lookups)
    .map((l) => l.id)
    .filter(Boolean);
  // (a non-Steam game added to Steam has a huge made-up id, with no store page)
  const artIds = [...new Set([...games.map((g) => g.id), ...lookedUp, ...(game && game.id ? [game.id] : [])])];
  const art = await fetchArt(f, artIds, prev && prev.art, nowS, late);

  // achievements: games played in the last two weeks, what's in Now Playing, and what's running now
  // (not games borrowed through Family Sharing: Steam won't show achievements for a game you don't own)
  const owns = new Set(games.filter((g) => !g.shared).map((g) => g.id));
  const matched = playingTitles.map((ti) => matchGame(ti, games)).filter(Boolean).map((g) => g.id);
  const achIds = [...new Set([...(game ? [game.id] : []), ...games.filter((g) => g.w > 0).sort((a, b) => b.l - a.l).map((g) => g.id), ...linked, ...matched])]
    .filter((id) => owns.has(id) && !isExtra((games.find((g) => g.id === id) || {}).n))
    .slice(0, ACH_GAMES);
  const ach = {};
  let checked = 0;
  try {
    for (const id of achIds) {
      const was = prev && prev.ach && prev.ach[id];
      const a = late() ? was : await achievementsFor(f, key, steamid, id, was, nowS);
      if (a) ach[id] = a;
      if (!late()) checked++;
    }
  } catch (e) {
    await saveLive({ ...live, error: e.code || 'steam-down' });
    log(`Steam sync stopped: ${e.code || 'steam-down'}.`);
    return { status: e.code || 'steam-down' };
  }
  // keep achievements of games that dropped out of the list, so the page can still show them for a while
  for (const [id, a] of Object.entries((prev && prev.ach) || {})) if (!ach[id] && owns.has(Number(id)) && nowS - (a.at || 0) < 60 * 86400) ach[id] = a;

  const hist = addHistory(prev && prev.hist, prev && prev.games, games, localDay(now));
  const doc = fit({ version: 1, profile, steamid, games, art, lookups, ach, hist });
  const { updatedAt, syncedAt, ...before } = prev || {};
  const changed = JSON.stringify(before) !== JSON.stringify(doc);
  if (changed) {
    try {
      await writeDoc(f, token, project, `${docId}-steam`, { ...doc, syncedAt: now.toISOString() }, t);
    } catch {
      await saveLive({ ...live, error: 'save-failed', syncedAt: (prev && prev.syncedAt) || null });
      log('Steam sync: the library couldn’t be saved.');
      return { status: 'save-failed' };
    }
  }
  await saveLive({ ...live, error: null, syncedAt: changed ? now.toISOString() : (prev && prev.syncedAt) || now.toISOString() });

  const played = games.filter((g) => g.w > 0).length;
  log(`Steam sync: ${games.length} games, ${played} played in the last two weeks, ${checked} checked for achievements, library ${changed ? 'updated' : 'unchanged'}.`);
  return { status: 'ok', games: games.length, played, checked, changed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then(
    () => process.exit(0),
    (e) => {
      // a problem with Google or Firestore; the next run tries again. Only this job's own messages are printed
      // (they're just status codes); anything else could quote a document, and the log is public.
      const own = e && /^(reading a document|saving a document|token endpoint) returned \d+$|^no access token/.test(e.message || '');
      console.error(`Steam sync stopped: ${own ? e.message : (e && e.name) || 'error'}.`);
      process.exit(0);
    }
  );
}
