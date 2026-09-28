// Node checks for Steam on the Entertainment tab: the shared logic (src/steam-logic.js) and the sync job
// (scripts/steam-sync.mjs) against stand-ins for Google, Firestore, the Steam Web API and the store. Made-up data only.
import crypto from 'node:crypto';
import * as S from '../src/steam-logic.js';
import { run as runSteam, fit } from '../scripts/steam-sync.mjs';

export async function steamUnit(check) {
  // ---- profile links
  check(
    S.parseProfile('https://steamcommunity.com/profiles/76561190000000001/').id === '76561190000000001' &&
      S.parseProfile('76561190000000001').id === '76561190000000001' &&
      S.parseProfile('https://steamcommunity.com/id/sample_player/').vanity === 'sample_player' &&
      S.parseProfile('sample_player').vanity === 'sample_player' &&
      S.parseProfile('https://example.com/whatever') === null &&
      S.parseProfile('') === null,
    'steam: a profile link, an ID or a custom URL name is understood'
  );

  // ---- matching a Now Playing title to a Steam game
  const lib = [
    { id: 1, n: 'Call of Duty®: Black Ops 7' },
    { id: 2, n: 'Call of Duty®: Black Ops 6' },
    { id: 3, n: 'Call of Duty®: Black Ops 7 - Starter Pack' },
    { id: 4, n: "Baldur's Gate 3" },
    { id: 5, n: 'Hades II' },
    { id: 6, n: 'Grand Theft Auto V Legacy' },
    { id: 7, n: 'Pokémon Legends Sample' },
  ];
  const m = (t) => (S.matchGame(t, lib) || {}).id || 0;
  check(m('Black Ops 7 Zombies') === 1 && m('Black Ops 6') === 2 && m('baldurs gate 3') === 4 && m('Hades') === 0 && m('GTA V') === 6 && m('Teamfight Tactics') === 0 && m('Pokemon Legends Sample') === 7, 'steam: Now Playing names find their Steam game (numbers must agree; no DLC, no guesses)');

  // ---- covers
  const withArt = { games: [{ id: 10, n: 'X', ic: 'abc' }], art: { 10: { f: 'steam/apps/10/${FILENAME}?t=1', c: 'library_600x900_2x.jpg', h: 'hash/header.jpg' }, 11: { f: 'steam/apps/11/${FILENAME}?t=2', c: '', h: 'header.jpg' }, 12: { at: 1 } } };
  const a10 = S.artFor(10, withArt);
  const a11 = S.artFor(11, withArt);
  const a13 = S.artFor(13, withArt);
  check(
    a10.cover === `${S.ART_BASE}steam/apps/10/library_600x900_2x.jpg?t=1` && a10.header === `${S.ART_BASE}steam/apps/10/hash/header.jpg?t=1` && /apps\/10\/abc\.jpg$/.test(a10.icon) && a11.cover === null && /apps\/11\/header\.jpg\?t=2$/.test(a11.header) && /apps\/13\/library_600x900_2x\.jpg$/.test(a13.cover),
    'steam: cover links come from the store’s file names, with plain fallbacks'
  );
  const compact = { art: { 20: { t: '5', at: 1 }, 21: { t: '6', nc: 1, h: 'abc/header.jpg', at: 1 }, 22: { x: 1, at: 1 } } };
  const c20 = S.artFor(20, compact);
  const c21 = S.artFor(21, compact);
  const c22 = S.artFor(22, compact);
  check(c20.cover === `${S.ART_BASE}steam/apps/20/library_600x900_2x.jpg?t=5` && c20.header === `${S.ART_BASE}steam/apps/20/header.jpg?t=5` && c21.cover === null && c21.header === `${S.ART_BASE}steam/apps/21/abc/header.jpg?t=6` && /apps\/22\/library_600x900_2x\.jpg$/.test(c22.cover), 'steam: the compact art the sync saves (usual file names left out) builds the same links');

  // ---- numbers and the library
  check(S.hoursText(0) === 'Never played' && S.hoursText(45) === '45 min' && S.hoursText(95) === '1.6 h' && S.hoursText(60 * 412) === '412 h', 'steam: playtime reads as minutes or hours');
  const steam = {
    games: [
      { id: 1, n: 'Sample Racer', m: 600, w: 120, l: 300 },
      { id: 2, n: 'Sample Quest', m: 3000, w: 0, l: 200 },
      { id: 3, n: 'Sample Puzzle', m: 0, w: 0, l: 0 },
      { id: 4, n: 'Sample Farm', m: 0, w: 0, l: 0 },
      { id: 5, n: 'Sample Racer Soundtrack', m: 0, w: 0, l: 0 },
      { id: 6, n: 'Borrowed Sample', m: 30, w: 30, l: 400, shared: 1 },
    ],
  };
  const st = S.libraryStats(steam);
  check(st.owned === 4 && st.played === 2 && st.backlog === 2 && st.total === 3600 && st.twoWeeks === 150 && st.top.id === 2, `steam: library totals (${st.owned} owned, ${st.played} played, ${st.backlog} never played)`);
  check(S.sortGames(steam.games, 'played')[0].id === 2 && S.sortGames(steam.games, 'recent')[0].id === 6 && S.sortGames(steam.games, 'name')[0].id === 6 && S.filterGames(steam.games, { q: 'racer' }).length === 2 && S.filterGames(steam.games, { show: 'backlog' }).length === 3, 'steam: sort by playtime, recent or name; search and filter');
  check(S.backlog(steam).map((g) => g.id).join() === '3,4' && S.pickBacklog(steam, () => 0.99).id === 4 && S.pickBacklog(steam, () => 0, 3).id === 4 && S.recentGames(steam).map((g) => g.id).join() === '6,1', 'steam: the backlog skips soundtracks and borrowed games; a pick never repeats the last one');

  // ---- playtime history
  const g0 = [{ id: 1, m: 100 }, { id: 2, m: 50 }];
  const g1 = [{ id: 1, m: 160 }, { id: 2, m: 50 }, { id: 3, m: 0 }];
  const g2 = [{ id: 1, m: 190 }, { id: 2, m: 80 }, { id: 3, m: 0 }, { id: 4, m: 500, w: 0 }];
  let h = S.addHistory([], [], g0, '2026-09-27');
  check(h.length === 0, 'steam: the first sync starts the history empty (no guessing at the past)');
  h = S.addHistory(h, g0, g1, '2026-09-27');
  h = S.addHistory(h, g1, g2, '2026-09-28');
  check(h.length === 2 && h[0].m === 60 && h[1].m === 60 && h[1].g[1] === 30 && h[1].g[2] === 30 && !h[1].g[4], `steam: each sync adds what each game grew to that day (${h.map((x) => `${x.d} ${x.m}m`).join(', ')}); a newly bought game isn’t counted as played`);
  const old = S.addHistory([{ d: '2025-01-01', m: 5, g: { 1: 5 } }], g0, g1, '2026-09-27');
  check(old.length === 1 && old[0].d === '2026-09-27', 'steam: history older than about 13 months is dropped');
  const back = S.addHistory([], g0, [...g0, { id: 9, m: 3000, w: 20 }], '2026-09-28');
  check(back.length === 1 && back[0].g[9] === 20, 'steam: a game that wasn’t there last sync (bought, or borrowed again) adds only its last-two-weeks time, not its lifetime');
  const gap = S.addHistory([], [{ id: 1, m: 0 }, { id: 2, m: 0 }, { id: 3, m: 0 }], [{ id: 1, m: 1200 }, { id: 2, m: 1200 }, { id: 3, m: 1200 }], '2026-09-28');
  check(gap[0].m === 1440 && Object.values(gap[0].g).reduce((a, b) => a + b, 0) === 1440, 'steam: after a gap in syncs, a day still holds at most 24 hours (split across the games)');
  const series = S.historySeries({ games: [{ id: 1, n: 'Sample Racer' }, { id: 2, n: 'Sample Quest' }], hist: h }, '2026-09-28', 'days', 7);
  check(series.slots.length === 7 && series.slots[6] === '2026-09-28' && series.points.length === 2 && series.top[0].id === 1 && series.points[1].parts.length === 2 && series.total === 120, 'steam: a 7-day chart, each day split by game');
  const weeks = S.historySeries({ games: [], hist: h }, '2026-09-28', 'weeks', 4);
  check(weeks.slots.length === 4 && weeks.slots[3] === '2026-09-28' && weeks.points.length === 2 && weeks.points[0].t === '2026-09-21', 'steam: by week, Monday to Sunday');

  // ---- achievements
  const mine = { achievements: [{ apiname: 'A', achieved: 1, unlocktime: 100, name: 'First Steps' }, { apiname: 'B', achieved: 1, unlocktime: 300, name: 'Hard One' }, { apiname: 'C', achieved: 0, unlocktime: 0, name: 'Later' }] };
  const schema = { availableGameStats: { achievements: [{ name: 'A', displayName: 'First Steps', icon: 'https://example.com/a.jpg' }, { name: 'B', displayName: 'Hard One', icon: 'https://example.com/b.jpg' }] } };
  const rates = { achievements: [{ name: 'A', percent: '80.5' }, { name: 'B', percent: 2.34 }, { name: 'C', percent: '1.0' }] };
  const sum = S.summarizeAchievements(mine, schema, rates, 1000 * 500);
  check(sum.t === 3 && sum.u === 2 && sum.last === 300 && sum.recent[0].n === 'Hard One' && sum.rare[0].p === 2.3 && sum.rare[0].i === 'https://example.com/b.jpg' && sum.at === 500, 'steam: achievements: count, newest first, rarest first (percent as text or number)');

  // ---- live status
  const nowT = Date.parse('2026-09-28T20:00:00Z');
  const L = (x) => S.liveStatus({ seenAt: '2026-09-28T19:50:00Z', ...x }, nowT);
  check(
    L({ game: { id: 1, n: 'Sample Racer' }, since: '2026-09-28T18:40:00Z' }).playing === 'Sample Racer' &&
      L({ game: { id: 1, n: 'Sample Racer' }, since: '2026-09-28T18:40:00Z' }).mins === 80 &&
      L({ state: 1 }).online === 'Online' &&
      L({ state: 0 }).offline &&
      S.liveStatus({ seenAt: '2026-09-28T18:00:00Z', game: { id: 1, n: 'X' } }, nowT).stale &&
      S.sinceText(5) === 'just started' &&
      S.sinceText(80) === 'about 1 h 15 min so far' &&
      S.sinceText(118) === 'about 2 h so far',
    'steam: live status (in a game and for how long, online, offline, or too old to trust)'
  );

  // ---- the sync job, with stand-ins for Google, Firestore, Steam and the store
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { project_id: 'test-project', client_email: 'steam@test-project.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
  const docs = {
    'test-doc-fun': { version: 1, playing: [{ id: 'p1', title: 'Sample Racer', challenges: [] }, { id: 'p4', title: 'Sample Quest', appid: 102, challenges: [] }, { id: 'p2', title: 'Console Only Sample 2', challenges: [] }, { id: 'p3', title: 'Not On Steam Sample', challenges: [] }], steam: { profile: 'https://steamcommunity.com/id/sample_player/' } },
  };
  const world = {
    owned: [
      { appid: 101, name: 'Sample Racer', playtime_forever: 600, playtime_2weeks: 120, rtime_last_played: 1790000000, img_icon_url: 'ic101' },
      { appid: 102, name: 'Sample Quest', playtime_forever: 3000, rtime_last_played: 1780000000, img_icon_url: 'ic102' },
      { appid: 103, name: 'Sample Puzzle', playtime_forever: 0, rtime_last_played: 0, img_icon_url: '' },
    ],
    recent: [
      { appid: 101, name: 'Sample Racer', playtime_2weeks: 120, playtime_forever: 600 },
      { appid: 201, name: 'Borrowed Sample', playtime_2weeks: 30, playtime_forever: 30 },
    ],
    ingame: { gameid: '101', gameextrainfo: 'Sample Racer' },
    private: false,
    keyOk: true,
  };
  const calls = [];
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
  let unsignalled = 0;
  const fetchImpl = async (url, o = {}) => {
    calls.push(url);
    if (!(o.signal instanceof AbortSignal)) unsignalled++;
    if (url === sa.token_uri) return reply(200, { access_token: 'tok' });
    const fs = url.match(/^https:\/\/firestore\.googleapis\.com\/v1\/projects\/test-project\/databases\/\(default\)\/documents\/trackers\/(.+)$/);
    if (fs) {
      const id = decodeURIComponent(fs[1]);
      if (o.method === 'PATCH') {
        docs[id] = JSON.parse(JSON.parse(o.body).fields.json.stringValue);
        return reply(200, {});
      }
      return docs[id] ? reply(200, { fields: { json: { stringValue: JSON.stringify(docs[id]) } } }) : reply(404, {});
    }
    const u = new URL(url);
    if (u.host === 'api.steampowered.com' && u.pathname.includes('IStoreBrowseService')) {
      const ids = JSON.parse(u.searchParams.get('input_json')).ids.map((x) => x.appid);
      return reply(200, { response: { store_items: ids.map((id) => (id === 103 ? { id, appid: id, success: 1, assets: { asset_url_format: `steam/apps/${id}/\${FILENAME}?t=9`, header: 'h/header.jpg' } } : id >= 900 ? { id, success: 15 } : { id, appid: id, success: 1, assets: { asset_url_format: `steam/apps/${id}/\${FILENAME}?t=9`, library_capsule: 'library_600x900.jpg', library_capsule_2x: 'library_600x900_2x.jpg', header: 'header.jpg' } })) } });
    }
    if (u.host === 'store.steampowered.com') {
      const term = u.searchParams.get('term');
      if (/console only sample 2/i.test(term)) return reply(200, { total: 2, items: [{ type: 'app', name: 'Console Only Sample 2 - Deluxe Pack', id: 902 }, { type: 'app', name: 'Console Only Sample 2', id: 901 }] });
      return reply(200, { total: 0, items: [] });
    }
    if (u.host === 'api.steampowered.com' && u.pathname.includes('GetGlobalAchievementPercentagesForApp')) return reply(200, { achievementpercentages: { achievements: [{ name: 'A', percent: '50.0' }, { name: 'B', percent: '3.2' }] } });
    if (u.host === 'api.steampowered.com') {
      if (u.searchParams.get('key') !== 'test-steam-key' || !world.keyOk) return reply(403, {});
      if (u.pathname.includes('ResolveVanityURL')) return reply(200, { response: u.searchParams.get('vanityurl') === 'sample_player' ? { steamid: '76561190000000001', success: 1 } : { success: 42 } });
      if (u.pathname.includes('GetPlayerSummaries')) return reply(200, { response: { players: [{ steamid: '76561190000000001', personaname: 'SamplePlayer', avatarfull: 'https://example.com/av.jpg', personastate: 1, ...(world.ingame || {}) }] } });
      if (u.pathname.includes('GetOwnedGames')) return reply(200, { response: world.private ? {} : { game_count: world.owned.length, games: world.owned } });
      if (u.pathname.includes('GetRecentlyPlayedGames')) return reply(200, { response: world.private ? {} : { total_count: world.recent.length, games: world.recent } });
      if (u.pathname.includes('GetPlayerAchievements')) {
        const app = Number(u.searchParams.get('appid'));
        if (app === 102 || app === 201) return reply(403, { playerstats: { error: 'Profile is not public', success: false } });
        if (app !== 101) return reply(400, { playerstats: { error: 'Requested app has no stats', success: false } });
        return reply(200, { playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1, unlocktime: 1789990000, name: 'Sample Start' }, { apiname: 'B', achieved: world.bUnlocked ? 1 : 0, unlocktime: world.bUnlocked ? 1790000000 : 0, name: 'Sample Rare' }] } });
      }
      if (u.pathname.includes('GetSchemaForGame')) return reply(200, { game: { availableGameStats: { achievements: [{ name: 'A', displayName: 'Sample Start', icon: 'https://example.com/a.jpg' }, { name: 'B', displayName: 'Sample Rare', icon: 'https://example.com/b.jpg' }] } } });
    }
    return reply(404, {});
  };
  const logs = [];
  const env = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa), BUDGET_DOC: 'test-doc', STEAM_API_KEY: 'test-steam-key' };
  const at = (iso) => new Date(iso);
  const r1 = await runSteam({ env, fetchImpl, now: at('2026-09-28T18:00:00Z'), log: (s) => logs.push(s) });
  const sd = docs['test-doc-steam'];
  const lv = docs['test-doc-steam-live'];
  check(r1.status === 'ok' && r1.games === 4 && sd && sd.steamid === '76561190000000001' && sd.games.length === 4 && sd.games.find((g) => g.id === 201).shared === 1 && sd.hist.length === 0, `steam job: resolves the custom URL, saves ${r1.games} games (one borrowed through Family Sharing)`);
  check(sd.art[101].t === '9' && !sd.art[101].c && !sd.art[101].nc && !sd.art[101].h && sd.art[103].nc === 1 && sd.art[103].h === 'h/header.jpg' && sd.lookups[S.normTitle('Console Only Sample 2')].id === 901 && sd.lookups[S.normTitle('Not On Steam Sample')].id === 0 && sd.art[901] && !sd.lookups[S.normTitle('Sample Racer')], 'steam job: cover file names from the store; Now Playing games you don’t own on Steam are looked up (the game, not its DLC); owned ones aren’t');
  check(sd.ach[101].t === 2 && sd.ach[101].u === 1 && sd.ach[101].recent[0].i === 'https://example.com/a.jpg' && sd.ach[102] && sd.ach[102].t === 0 && !sd.ach[201] && !sd.ach[103], 'steam job: achievements for games played lately and in Now Playing; one Steam won’t show (403) is skipped, not blamed on the key; borrowed games aren’t asked about');
  check(unsignalled === 0, 'steam job: every call has a time limit');
  check(lv.persona === 'SamplePlayer' && lv.game.id === 101 && lv.since === '2026-09-28T18:00:00.000Z' && lv.state === 1 && !lv.error, 'steam job: live status: in a game since this sync');

  // a second run: 30 more minutes in the racer, a new achievement, still playing
  world.owned[0].playtime_forever = 630;
  world.bUnlocked = true;
  const before = calls.length;
  const r2 = await runSteam({ env, fetchImpl, now: at('2026-09-28T18:15:00Z'), log: (s) => logs.push(s) });
  const sd2 = docs['test-doc-steam'];
  const newCalls = calls.slice(before);
  check(r2.changed && sd2.hist.length === 1 && sd2.hist[0].m === 30 && sd2.hist[0].g[101] === 30 && sd2.ach[101].u === 2 && sd2.ach[101].rare[0].n === 'Sample Rare' && docs['test-doc-steam-live'].since === '2026-09-28T18:00:00.000Z', 'steam job: next sync adds 30 minutes to today, picks up the new achievement, keeps “playing since”');
  check(!newCalls.some((u) => /IStoreBrowseService|storesearch|ResolveVanityURL/.test(u)), 'steam job: covers, lookups and your ID aren’t fetched again');
  const r3 = await runSteam({ env, fetchImpl, now: at('2026-09-28T18:30:00Z'), log: (s) => logs.push(s) });
  check(r3.status === 'ok' && !r3.changed && docs['test-doc-steam'].syncedAt === '2026-09-28T18:15:00.000Z', 'steam job: nothing new → the library document isn’t rewritten');
  world.ingame = null;
  await runSteam({ env, fetchImpl, now: at('2026-09-28T18:45:00Z'), log: (s) => logs.push(s) });
  check(docs['test-doc-steam-live'].game === null && docs['test-doc-steam-live'].since === null, 'steam job: out of the game → live status clears');

  // problems are saved for the page, and the run still finishes
  world.private = true;
  const r4 = await runSteam({ env, fetchImpl, now: at('2026-09-28T19:00:00Z'), log: (s) => logs.push(s) });
  check(r4.status === 'private' && docs['test-doc-steam-live'].error === 'private' && docs['test-doc-steam'].games.length === 4, 'steam job: private game details → says so, keeps the library it had');
  world.private = false;
  world.keyOk = false;
  const r5 = await runSteam({ env, fetchImpl, now: at('2026-09-28T19:15:00Z'), log: (s) => logs.push(s) });
  check(r5.status === 'bad-key' && docs['test-doc-steam-live'].error === 'bad-key' && docs['test-doc-steam-live'].persona === 'SamplePlayer' && docs['test-doc-steam-live'].state === 1, 'steam job: a key Steam turns down → says so (and keeps who you are, rather than showing Offline)');
  world.keyOk = true;
  const r6 = await runSteam({ env: { ...env, STEAM_API_KEY: '' }, fetchImpl, now: at('2026-09-28T19:30:00Z'), log: (s) => logs.push(s) });
  check(r6.status === 'no-key' && docs['test-doc-steam-live'].error === 'no-key', 'steam job: no key yet → says so');
  const r7 = await runSteam({ env: {}, fetchImpl, now: at('2026-09-28T19:45:00Z'), log: () => {} });
  check(r7.status === 'no-secret', 'steam job: without the Firebase key it exits quietly');
  const noProfile = JSON.parse(JSON.stringify(docs['test-doc-fun']));
  delete docs['test-doc-fun'].steam;
  const r8 = await runSteam({ env, fetchImpl, now: at('2026-09-28T20:00:00Z'), log: () => {} });
  docs['test-doc-fun'] = noProfile;
  check(r8.status === 'no-profile', 'steam job: no profile linked → nothing to do');
  // a different account: its library starts fresh
  docs['test-doc-fun'].steam.profile = '76561190000000002';
  const r9 = await runSteam({ env, fetchImpl, now: at('2026-09-28T20:15:00Z'), log: (s) => logs.push(s) });
  check(r9.status === 'ok' && docs['test-doc-steam'].steamid === '76561190000000002' && docs['test-doc-steam'].hist.length === 0 && docs['test-doc-steam'].art[101], 'steam job: switching to another account starts its history fresh (covers kept)');
  // a very big library stays under Firestore's size limit
  const huge = { version: 1, games: [], art: {}, lookups: {}, ach: {}, hist: [] };
  for (let i = 0; i < 4000; i++) {
    huge.games.push({ id: 100000 + i, n: `Sample Game Number ${i} Deluxe`, m: i % 3 ? 0 : 600, w: 0, l: i % 3 ? 0 : 1780000000, ic: 'abcdef0123456789abcdef0123456789abcdef01' });
    huge.art[100000 + i] = { t: '1790000000', c: '0123456789abcdef0123456789abcdef01234567/library_capsule_2x.jpg', h: '0123456789abcdef0123456789abcdef01234567/header.jpg', at: 1790000000 };
  }
  for (let d = 0; d < 400; d++) huge.hist.push({ d: S.addDaysISO('2025-09-01', d), m: 60, g: { 100000: 30, 100003: 30 } });
  const fitted = fit(huge);
  const bytes = Buffer.byteLength(JSON.stringify(fitted));
  check(bytes <= 900000 && fitted.games.length === 4000 && Object.keys(fitted.art).length > 0, `steam job: a 4,000-game library fits in one document (${Math.round(bytes / 1000)} KB; covers of never-played games dropped first)`);
  check(logs.length >= 6 && logs.every((l) => !/Sample|76561|test-steam-key|SamplePlayer|example\.com|\d+ ?h\b|min\b/.test(l)), `steam job: the public log shows counts only: “${logs[0]}”`);
  check(calls.every((u) => !/test-steam-key/.test(u) || u.startsWith('https://api.steampowered.com/')), 'steam job: the key only ever goes to Steam’s API');
}
