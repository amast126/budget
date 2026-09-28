// The demo person's Steam: a made-up library of well-known games (their store art is real, the playtime, history
// and achievements are invented), in the same shape the Steam sync job saves.
const LIB = [
  // [appid, name, total minutes, minutes in the last two weeks, days since last played, art: format timestamp, cover file, header file]
  [1086940, "Baldur's Gate 3", 9360, 540, 0, 1777363040, 'library_600x900_2x.jpg', '48a2fcbda8565bb45025e98fd8ebde8a7203f6a0/header.jpg'],
  [1145350, 'Hades II', 2400, 310, 1, 1779901265, '2ba105370a00877459144db0dd68af5f2d338429/library_capsule_2x.jpg', '91ac334a2c137d08968ccc0bc474a02579602100/header.jpg'],
  [413150, 'Stardew Valley', 5200, 120, 3, 1786554168, 'library_600x900_2x.jpg', 'header.jpg'],
  [2379780, 'Balatro', 3900, 90, 5, 1788961800, 'library_600x900_2x.jpg', '7a85430784e4d613cdb0547414d8cf16ffa45747/header.jpg'],
  [1091500, 'Cyberpunk 2077', 5400, 0, 40, 1784714077, '6399de67cce3cecadce7900e03f6e09ff910a235/library_capsule_2x.jpg', 'e9047d8ec47ae3d94bb8b464fb0fc9e9972b4ac7/header.jpg'],
  [646570, 'Slay the Spire', 4300, 0, 22, 1774015376, 'library_600x900_2x.jpg', 'header.jpg'],
  [105600, 'Terraria', 3200, 0, 95, 1769844435, 'library_600x900_2x.jpg', 'header.jpg'],
  [367520, 'Hollow Knight', 2100, 0, 60, 1776125684, '1eebc7e077ee345f126df35cd99c124273c4e4e3/library_capsule_2x.jpg', '3c3489495136b26b34f8a9543c7f5645b99d388c/header.jpg'],
  [632470, 'Disco Elysium - The Final Cut', 1900, 0, 130, 1780913406, 'library_600x900_2x.jpg', '816ea59d6d8ac525f79a07c3a7afa94eddb3437c/header.jpg'],
  [1868140, 'DAVE THE DIVER', 1700, 0, 33, 1789456375, 'library_600x900_2x.jpg', '81bdb3bce15d27ca1b4554a642d91096e89be229/header.jpg'],
  [1794680, 'Vampire Survivors', 1500, 0, 18, 1787911678, '96947acc36ca29e24084ffb5858062d478c2ce6b/library_capsule_2x.jpg', '2ca07b690dde645771125ed9d9206c4c5fde4dd4/header.jpg'],
  [753640, 'Outer Wilds', 1320, 0, 210, 1785424341, 'library_600x900_2x.jpg', '079ae4a7ff4b5875adc5c63c4c0b84e5a3e6966b/header.jpg'],
  [620, 'Portal 2', 1260, 0, 400, 1790187113, 'library_600x900_2x.jpg', 'faffc0f560786e2f05104a8d2fac837c6969bf13/header.jpg'],
  [1244090, 'Sea of Stars: Sunset Edition', 1200, 0, 75, 1780931183, '2306cf262e41bcd626e119da04e59c86925c5b47/library_capsule_2x.jpg', '2e96ccd2714fafb5a8df7ddd97ff01fef2096b29/header.jpg'],
  [504230, 'Celeste', 840, 0, 300, 1714089525, 'library_600x900_2x.jpg', 'header.jpg'],
  [1135690, 'Unpacking', 280, 0, 160, 1789426289, 'library_600x900_2x.jpg', 'header.jpg'],
  [1092790, 'Inscryption', 0, 0, 0, 1777572925, 'library_600x900_2x.jpg', 'header.jpg'],
  [1562430, 'DREDGE', 0, 0, 0, 1780479732, 'library_600x900_2x.jpg', 'header.jpg'],
  [1332010, 'Stray', 0, 0, 0, 1785424330, '9c1bae81b2603c25ccf2a8f4944b3b58227005d7/library_capsule_2x.jpg', '71daca1910d664d31240b9623a495e0c0828807f/header.jpg'],
  [1055540, 'A Short Hike', 0, 0, 0, 1777758958, 'library_600x900_2x.jpg', 'header.jpg'],
  [1313140, 'Cult of the Lamb', 0, 0, 0, 1786554901, 'e2e2cf16f2bffc9f4cb22d952442d328f48e908d/library_capsule_2x.jpg', '19f32bb477a6e9d058e05193b4e282149bd70644/header.jpg'],
  [548430, 'Deep Rock Galactic', 0, 0, 0, 1790248272, 'library_600x900_2x.jpg', 'd3edf99a4ae52d305ec6ddd2a8f2703499b8aae5/header_alt_assets_28.jpg'],
  [553420, 'TUNIC', 0, 0, 0, 1783359656, 'library_600x900_2x.jpg', 'header.jpg'],
];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function demoSteam(now = new Date()) {
  let seed = 7;
  const R = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const nowS = Math.floor(now.getTime() / 1000);
  const games = LIB.map(([id, n, m, w, days]) => ({ id, n, m, w, l: m ? nowS - days * 86400 - 3600 * (2 + (id % 5)) : 0, ic: '' }));
  const art = Object.fromEntries(LIB.map(([id, , , , , t, c, h]) => [id, { f: `steam/apps/${id}/\${FILENAME}?t=${t}`, c, h, at: nowS }]));
  // about two months of evenings: the last two weeks in step with the totals above, earlier weeks more varied
  const hist = [];
  const recentMix = [
    [1086940, 0.45],
    [1145350, 0.26],
    [413150, 0.16],
    [2379780, 0.13],
  ];
  const olderMix = [
    [1086940, 0.3],
    [646570, 0.18],
    [1794680, 0.14],
    [1091500, 0.2],
    [1868140, 0.1],
    [2379780, 0.08],
  ];
  for (let back = 62; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (R() < (weekend ? 0.12 : 0.35)) continue;
    const total = Math.round((weekend ? 110 : 55) + R() * (weekend ? 140 : 70));
    const mix = back < 14 ? recentMix : olderMix;
    const g = {};
    let left = total;
    const picks = mix.filter(() => R() < 0.6);
    (picks.length ? picks : [mix[0]]).forEach(([id, share], i, arr) => {
      const v = i === arr.length - 1 ? left : Math.min(left, Math.round(total * share * (0.7 + R() * 0.8)));
      if (v > 0) g[id] = v;
      left -= v;
    });
    hist.push({ d: iso(d), m: Object.values(g).reduce((s, v) => s + v, 0), g });
  }
  const ach = (t, u, recent, rare) => ({
    t,
    u,
    last: nowS - 86400,
    recent: recent.map(([n, days]) => ({ n, i: '', at: nowS - days * 86400 - 5000 })),
    rare: rare.map(([n, p]) => ({ n, i: '', at: nowS - 30 * 86400, p })),
    at: nowS,
  });
  return {
    steam: {
      version: 1,
      profile: 'https://steamcommunity.com/id/sample-demo-player',
      steamid: '76561190000000042',
      games,
      art,
      lookups: {},
      ach: {
        1086940: ach(54, 31, [['Party Leader', 0], ['Honest Broker', 2], ['Long Rest', 4]], [['Iron Will', 3.1], ['Speak Softly', 7.8], ['Night Watch', 12.4]]),
        1145350: ach(49, 22, [['Moonlit Path', 1], ['Second Wind', 3], ['Old Friends', 6]], [['No Retreat', 5.2], ['Moonlit Path', 11.9], ['Deep Roots', 18.3]]),
        413150: ach(49, 36, [['Full House', 3], ['Green Thumb', 9], ['Local Legend', 20]], [['Master Angler', 4.4], ['Full House', 9.6], ['Collector', 14.1]]),
        2379780: ach(30, 24, [['High Roller', 5], ['Stacked Deck', 12], ['Clean Sweep', 19]], [['Stacked Deck', 2.7], ['Clean Sweep', 6.5], ['High Roller', 10.2]]),
      },
      hist,
      syncedAt: now.toISOString(),
    },
    live: {
      version: 1,
      profile: 'https://steamcommunity.com/id/sample-demo-player',
      steamid: '76561190000000042',
      persona: 'jrivera_plays',
      avatar: '',
      state: 1,
      game: { id: 1086940, n: "Baldur's Gate 3" },
      demoMins: 52, // the demo keeps "playing for about 50 minutes" true whenever it's opened
      seenAt: now.toISOString(),
      since: new Date(now.getTime() - 52 * 60000).toISOString(),
    },
  };
}
