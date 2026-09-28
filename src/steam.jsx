// Steam on the Entertainment tab (a zone of its own, in Steam's navy and blue) and a "playing now" card for Home.
// The data comes from the Steam sync job (scripts/steam-sync.mjs) through two documents; this file only reads them,
// except for your profile link and Now Playing, which live in the Entertainment document.
import React, { useEffect, useState } from 'react';
import { Icon } from './ui.jsx';
import { BarChart } from './chart-kit.jsx';
import { celebrate, centerOf } from './fx.jsx';
import { HubTabs, useStored } from './fun-zones.jsx';
import { useNow } from './pulse.jsx';
import { todayISO } from './budget-logic.js';
import * as S from './steam-logic.js';
import * as F from './fun-logic.js';

const plural = (n, w, many = `${w}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? w : many}`;
// Categorical steps for the playtime bars, checked on the zone's navy (worst neighbouring pair ΔE 8.4 colorblind,
// 19.8 normal; all at least 3:1). Games past the fourth fold into Other.
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'];
const OTHER = '#6b7684';
const store = (id) => `https://store.steampowered.com/app/${id}`;

export const hueOf = (t) => [...String(t || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
export function initialsOf(title) {
  return String(title || '?')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase()))
    .join('')
    .slice(0, 3);
}
// 0 → "0 h", 45 → "45 min", 1234 → "20.6 h"
const hrs = (m) => (m > 0 && m < 60 ? `${Math.round(m)} min` : `${S.hoursNum(m) >= 100 ? Math.round(S.hoursNum(m)).toLocaleString('en-US') : S.hoursNum(m)} h`);
function playedWhen(unix) {
  if (!unix) return 'never';
  const d = new Date(unix * 1000);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(days > 300 ? { year: 'numeric' } : {}) });
}
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
// The repo the sync job lives in (for the setup links): this site's own on GitHub Pages.
function repo() {
  try {
    if (/\.github\.io$/.test(location.hostname)) return `${location.hostname.split('.')[0]}/${location.pathname.split('/')[1]}`;
  } catch {
    /* not in a browser */
  }
  return 'amast126/budget';
}

// ---------------------------------------------------------------- a game's picture
// shape: cover (tall library art; a game without one shows its wide header framed on a blur of itself),
// badge (small and tall, cropped), wide (the store header). Falls back to initials if Steam has nothing.
export function GameArt({ id, name, steam, shape = 'cover', className = '' }) {
  const a = id ? S.artFor(id, steam) : null;
  const order = !a ? [] : shape === 'wide' ? ['header'] : [a.cover ? 'cover' : null, 'header'].filter(Boolean);
  const [i, setI] = useState(0);
  const key = `${id}|${a && a.cover}|${a && a.header}`;
  useEffect(() => setI(0), [key]);
  const kind = order[i];
  const cls = `gart gart-${shape} ${className}`;
  if (!kind) {
    return (
      <span className={`${cls} gart-none`} style={{ '--gh': hueOf(name) }} aria-hidden="true">
        <span>{initialsOf(name)}</span>
      </span>
    );
  }
  const src = a[kind];
  const next = () => setI((x) => x + 1);
  if (shape === 'cover' && kind === 'header') {
    return (
      <span className={`${cls} gart-framed`} aria-hidden="true">
        <img className="gart-bg" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
        <img className="gart-fg" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={next} />
      </span>
    );
  }
  return (
    <span className={cls} aria-hidden="true">
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={next} />
    </span>
  );
}

// ---------------------------------------------------------------- setup
function SetupSteps({ saved }) {
  const r = repo();
  return (
    <ol className="small steam-steps">
      <li className={saved ? 'done' : ''}>{saved ? 'Your profile link is saved.' : 'Paste your Steam profile link above.'}</li>
      <li>
        Get a Steam Web API key at{' '}
        <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener">
          steamcommunity.com/dev/apikey
        </a>
        . For the domain, put <code>{r.split('/')[0]}.github.io</code>. Steam asks you to approve it in the Steam app, and only gives keys to accounts that have spent at least $5.
      </li>
      <li>
        In GitHub,{' '}
        <a href={`https://github.com/${r}/settings/secrets/actions/new`} target="_blank" rel="noopener">
          add a repository secret
        </a>{' '}
        named <code>STEAM_API_KEY</code> and paste the key.
      </li>
      <li>
        The same place needs <code>FIREBASE_SERVICE_ACCOUNT</code>. If you set up the budget’s phone alerts, it’s already there; if not, Budget → Settings → Phone alerts shows how to make it.
      </li>
      <li>
        <a href={`https://github.com/${r}/actions/workflows/steam.yml`} target="_blank" rel="noopener">
          Actions → Steam sync
        </a>{' '}
        → Run workflow, to sync now. After that it runs every 15 minutes.
      </li>
    </ol>
  );
}
function ProfileForm({ initial = '', mutate, label = 'Connect', onDone }) {
  const [v, setV] = useState(initial);
  const ok = S.parseProfile(v);
  return (
    <>
      <form
        className="add-row steam-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          mutate((d) => F.setSteamProfile(d, v), 'Steam profile saved');
          onDone && onDone();
        }}
      >
        <input className="input" placeholder="Your Steam profile link" value={v} onChange={(e) => setV(e.target.value)} aria-label="Steam profile link" autoComplete="off" spellCheck="false" />
        <button className="btn primary" type="submit" disabled={!ok || v.trim() === initial}>
          {label}
        </button>
      </form>
      <p className="small steam-hint">
        {v.trim() && !ok ? 'That doesn’t look like a Steam profile. It looks like steamcommunity.com/id/yourname or steamcommunity.com/profiles/7656…' : 'In Steam, open your profile, right-click the page and choose Copy Page URL.'}
      </p>
    </>
  );
}
function SteamConnect({ mutate }) {
  return (
    <section className="card zone steam-zone steam-connect" aria-label="Steam">
      <div className="steam-head">
        <span className="steam-avatar none">
          <Icon name="game" size={26} />
        </span>
        <div className="grow">
          <div className="zone-kicker">Steam</div>
          <h2 className="steam-name">Bring in your Steam library</h2>
          <div className="steam-status">Playtime, what you played lately, achievements and covers, synced every 15 minutes.</div>
        </div>
      </div>
      <div className="zone-panel">
        <ProfileForm mutate={mutate} />
        <SetupSteps />
      </div>
    </section>
  );
}
function SteamSettings({ fun, mutate, onClose }) {
  return (
    <div className="zone-panel steam-settings">
      <h3 className="zone-h">Steam settings</h3>
      <ProfileForm initial={fun.steam.profile} mutate={mutate} label="Save" onDone={onClose} />
      <details>
        <summary className="small">Setup steps</summary>
        <SetupSteps saved />
      </details>
      <button className="link-btn small muted-link" onClick={() => mutate((d) => F.setSteamProfile(d, ''), 'Steam disconnected')}>
        Disconnect Steam
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- panels
function Shelf({ list, steam, nowId }) {
  return (
    <ul className="steam-shelf">
      {list.map((g) => (
        <li key={g.id} className={g.id === nowId ? 'live' : ''}>
          <a className="shelf-item" href={store(g.id)} target="_blank" rel="noopener" aria-label={`${g.n} on the Steam store`}>
            <span className="shelf-art">
              <GameArt id={g.id} name={g.n} steam={steam} />
              {g.id === nowId ? <span className="live-tag">Playing</span> : null}
            </span>
            <span className="shelf-name">{g.n}</span>
            <span className="shelf-sub">{g.w ? `${hrs(g.w)} past 2 weeks` : `Played ${playedWhen(g.l)}`}</span>
            <span className="shelf-sub">{hrs(g.m)} total</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
function RecentPanel({ steam, status }) {
  const nowId = status && status.playing ? status.id : null;
  let list = S.recentGames(steam);
  if (nowId && !list.some((g) => g.id === nowId)) {
    const g = steam.games.find((x) => x.id === nowId);
    if (g) list = [g, ...list];
  }
  list = list.slice().sort((a, b) => (b.id === nowId) - (a.id === nowId));
  if (list.length) return <Shelf list={list} steam={steam} nowId={nowId} />;
  const last = S.sortGames(steam.games.filter((g) => g.l), 'recent').slice(0, 6);
  return (
    <>
      <p className="empty">Nothing played on Steam in the last two weeks.</p>
      {last.length ? (
        <>
          <h3 className="zone-h">Last played</h3>
          <Shelf list={last} steam={steam} />
        </>
      ) : null}
    </>
  );
}
function TimePanel({ steam }) {
  const [mode, setMode] = useStored('dash.steamTime', 'days', ['days', 'weeks']);
  const s = S.historySeries(steam, todayISO(), mode);
  const color = (k) => (k === 'other' ? OTHER : SERIES[k]);
  const points = s.points.map((p) => ({ t: p.t, week: p.week, parts: p.parts.map((x) => ({ v: x.v, color: color(x.k), label: x.label })) }));
  const hasOther = s.points.some((p) => p.parts.some((x) => x.k === 'other' && x.v));
  const top = S.sortGames(
    steam.games.filter((g) => !g.shared && g.m > 0),
    'played'
  ).slice(0, 5);
  const max = top.length ? top[0].m : 1;
  return (
    <>
      <div className="row-between steam-time-head">
        <span className="small">{s.total ? `${hrs(s.total)} in the last ${mode === 'days' ? '30 days' : '12 weeks'}` : 'Hours played'}</span>
        <div className="seg mini-seg" role="group" aria-label="Chart range">
          {[
            ['days', '30 days'],
            ['weeks', '12 weeks'],
          ].map(([k, l]) => (
            <button key={k} className={`seg-btn ${mode === k ? 'on' : ''}`} aria-pressed={mode === k} onClick={() => setMode(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {s.points.length ? (
        <>
          <BarChart points={points} slots={s.slots} fmt={(v) => `${v} h`} label="Hours played on Steam" height={170} yLabel={(v) => `${Math.round(v * 10) / 10}h`} />
          <ul className="chart-legend steam-legend">
            {s.top.map((g, i) => (
              <li key={g.id}>
                <span className="key" style={{ background: SERIES[i] }} />
                {g.n}
              </li>
            ))}
            {hasOther ? (
              <li>
                <span className="key" style={{ background: OTHER }} />
                Other
              </li>
            ) : null}
          </ul>
        </>
      ) : (
        <p className="empty">
          This fills in as you play. Steam only shares totals, so each sync notes how much each game grew that day{s.since ? '' : ', starting from the first sync'}.
        </p>
      )}
      {top.length ? (
        <>
          <h3 className="zone-h">Most played</h3>
          <ul className="steam-top">
            {top.map((g) => (
              <li key={g.id}>
                <GameArt id={g.id} name={g.n} steam={steam} shape="wide" />
                <div className="grow">
                  <div className="row-between">
                    <span className="top-name">{g.n}</span>
                    <b className="num">{hrs(g.m)}</b>
                  </div>
                  <div className="bar slim">
                    <div className="bar-fill" style={{ width: `${(g.m / max) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
function AchChip({ x, rare }) {
  const when = x.at ? new Date(x.at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const tail = rare && x.p != null ? `${x.p}% of players` : when;
  return (
    <span className="ach-chip" title={`${x.n}${tail ? ` · ${tail}` : ''}`}>
      {x.i ? (
        <img src={x.i} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      ) : (
        <span className="ach-ico">
          <Icon name="trophy" size={14} />
        </span>
      )}
      <span className="ach-t">{x.n}</span>
      {tail ? <span className="ach-p">{tail}</span> : null}
    </span>
  );
}
function AchPanel({ steam }) {
  const rows = Object.entries(steam.ach || {})
    .map(([id, a]) => ({ id: Number(id), a, g: steam.games.find((x) => x.id === Number(id)) }))
    .filter((r) => r.a && r.a.t > 0 && r.g)
    .sort((x, y) => (y.g.l || 0) - (x.g.l || 0));
  if (!rows.length) return <p className="empty">Achievements show up here for the games you’ve played in the last two weeks and the ones in Now playing.</p>;
  const got = rows.reduce((s, r) => s + r.a.u, 0);
  return (
    <>
      <p className="small steam-ach-sum">
        <Icon name="trophy" size={15} /> {plural(got, 'achievement')} across {plural(rows.length, 'game')}
      </p>
      <ul className="steam-ach">
        {rows.map(({ id, a, g }) => {
          const pct = Math.round((a.u / a.t) * 100);
          return (
            <li key={id}>
              <div className="ach-head">
                <GameArt id={id} name={g.n} steam={steam} shape="wide" />
                <div className="grow">
                  <div className="ach-name">{g.n}</div>
                  <div className="small ach-count">
                    <b className="num">{a.u}</b> of <span className="num">{a.t}</span> · {pct}%{a.u === a.t ? ' · every one' : ''}
                  </div>
                  <div className="bar slim">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
              {a.recent && a.recent.length ? (
                <div className="ach-line">
                  <span className="ach-label">Latest</span>
                  {a.recent.map((x, i) => (
                    <AchChip key={i} x={x} />
                  ))}
                </div>
              ) : null}
              {a.rare && a.rare.length ? (
                <div className="ach-line">
                  <span className="ach-label">Rarest</span>
                  {a.rare.map((x, i) => (
                    <AchChip key={i} x={x} rare />
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
function Tile({ g, steam }) {
  return (
    <li>
      <a className="lib-tile" href={store(g.id)} target="_blank" rel="noopener" aria-label={`${g.n}, ${S.hoursText(g.m)}`}>
        <GameArt id={g.id} name={g.n} steam={steam} />
        <span className="lib-name">{g.n}</span>
        <span className="lib-sub">{S.hoursText(g.m)}</span>
      </a>
    </li>
  );
}
const SHOW = [
  ['all', 'All'],
  ['played', 'Played'],
  ['backlog', 'Never played'],
];
function LibraryPanel({ steam }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useStored('dash.steamSort', 'played', S.SORTS.map((s) => s[0]));
  const [show, setShow] = useState('all');
  const [limit, setLimit] = useState(24);
  useEffect(() => setLimit(24), [q, sort, show]);
  const list = S.sortGames(S.filterGames(steam.games, { q, show }), sort);
  return (
    <>
      <input className="input steam-search" type="search" placeholder={`Search ${plural(steam.games.length, 'game')}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your Steam library" />
      <div className="steam-controls">
        <div className="seg mini-seg" role="group" aria-label="Sort">
          {S.SORTS.map(([k, l]) => (
            <button key={k} className={`seg-btn ${sort === k ? 'on' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="seg mini-seg" role="group" aria-label="Show">
          {SHOW.map(([k, l]) => (
            <button key={k} className={`seg-btn ${show === k ? 'on' : ''}`} aria-pressed={show === k} onClick={() => setShow(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        <ul className="steam-grid">
          {list.slice(0, limit).map((g) => (
            <Tile key={g.id} g={g} steam={steam} />
          ))}
        </ul>
      ) : (
        <p className="empty">No games match.</p>
      )}
      {list.length > limit ? (
        <button className="btn quiet block steam-more" onClick={() => setLimit(limit + 48)}>
          Show more ({(list.length - limit).toLocaleString('en-US')} left)
        </button>
      ) : null}
    </>
  );
}
function BacklogPanel({ steam, fun, mutate }) {
  const list = S.backlog(steam);
  const [pick, setPick] = useState(null);
  const [limit, setLimit] = useState(12);
  if (!list.length) return <p className="empty">You’ve played everything you own on Steam.</p>;
  const inNow = pick && fun.playing.some((p) => p.appid === pick.id);
  return (
    <>
      <p className="small">{plural(list.length, 'game')} you own and haven’t played yet.</p>
      {pick ? (
        <div className="steam-pick-card" role="status">
          <GameArt id={pick.id} name={pick.n} steam={steam} />
          <div className="grow">
            <div className="zone-h">Try this one</div>
            <div className="pick-name">{pick.n}</div>
            <div className="pick-actions">
              <button
                className="btn primary small"
                disabled={inNow}
                onClick={(e) => {
                  mutate((d) => F.addGameFromSteam(d, pick), `Added ${F.cleanName(pick.n)} to Now playing`);
                  celebrate(centerOf(e.currentTarget));
                }}
              >
                {inNow ? 'In Now playing' : 'Add to Now playing'}
              </button>
              <a className="btn small quiet" href={store(pick.id)} target="_blank" rel="noopener">
                Store page
              </a>
            </div>
          </div>
        </div>
      ) : null}
      <button className="btn block steam-pick" onClick={() => setPick(S.pickBacklog(steam, Math.random, pick && pick.id))}>
        <Icon name="shuffle" size={17} /> {pick ? 'Pick another' : 'Pick one for me'}
      </button>
      <ul className="steam-grid">
        {list.slice(0, limit).map((g) => (
          <Tile key={g.id} g={g} steam={steam} />
        ))}
      </ul>
      {list.length > limit ? (
        <button className="btn quiet block steam-more" onClick={() => setLimit(limit + 36)}>
          Show more ({list.length - limit} left)
        </button>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- the zone
const TABS = [
  ['recent', 'Recent'],
  ['time', 'Playtime'],
  ['ach', 'Achievements'],
  ['lib', 'Library'],
  ['backlog', 'Backlog'],
];
function StatusLine({ status, live }) {
  if (!status) return null;
  if (status.playing)
    return (
      <span className="steam-status-live">
        <span className="dot-live" /> Playing <b>{status.playing}</b>
        {status.mins != null ? ` · ${S.sinceText(status.mins)}` : ''}
      </span>
    );
  if (status.stale) return <span>Last seen {ago(status.seenAt)}</span>;
  if (status.online) return <span>{status.online}</span>;
  return <span>Offline{live && live.lastOff ? ` · last online ${ago(new Date(live.lastOff * 1000).toISOString())}` : ''}</span>;
}
export function SteamZone({ fun, mutate, steam, live }) {
  useNow(60000); // "about 1 h so far" moves along
  const [tab, setTab] = useStored('dash.steamTab', 'recent', TABS.map((t) => t[0]));
  const [settings, setSettings] = useState(false);
  if (!fun) return null;
  if (!fun.steam || !fun.steam.profile) return <SteamConnect mutate={mutate} />;
  const status = S.liveStatus(live);
  const err = live && live.error;
  const stats = steam ? S.libraryStats(steam) : null;
  const recent = steam ? S.recentGames(steam) : [];
  const bgId = (status && status.id) || (recent[0] && recent[0].id) || (stats && stats.top && stats.top.id);
  const panel = !steam
    ? null
    : tab === 'time'
      ? <TimePanel steam={steam} />
      : tab === 'ach'
        ? <AchPanel steam={steam} />
        : tab === 'lib'
          ? <LibraryPanel steam={steam} />
          : tab === 'backlog'
            ? <BacklogPanel steam={steam} fun={fun} mutate={mutate} />
            : <RecentPanel steam={steam} status={status} />;
  return (
    <section className={`card zone steam-zone ${status && status.playing ? 'is-live' : ''}`} aria-label="Steam">
      {bgId ? <div className="zone-bg steam-bg" style={{ backgroundImage: `url(${S.artFor(bgId, steam).header})` }} aria-hidden="true" /> : null}
      <div className="steam-head">
        {live && live.avatar ? (
          <img className="steam-avatar" src={live.avatar} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="steam-avatar none">
            <Icon name="game" size={26} />
          </span>
        )}
        <div className="grow">
          <div className="zone-kicker">Steam</div>
          <h2 className="steam-name">{(live && live.persona) || 'Your Steam'}</h2>
          <div className="steam-status">
            <StatusLine status={status} live={live} />
          </div>
        </div>
      </div>
      {err ? (
        <div className="steam-alert" role="status">
          {S.ERRORS[err] || 'The last sync ran into a problem. It tries again every 15 minutes.'}
        </div>
      ) : null}
      {steam ? (
        <>
          <div className="steam-stats">
            <div>
              <b className="num">{hrs(stats.total)}</b>
              <span>on Steam</span>
            </div>
            <div>
              <b className="num">{hrs(stats.twoWeeks)}</b>
              <span>past 2 weeks</span>
            </div>
            <div>
              <b className="num">{stats.owned.toLocaleString('en-US')}</b>
              <span>games</span>
            </div>
            <div>
              <b className="num">{stats.backlog.toLocaleString('en-US')}</b>
              <span>never played</span>
            </div>
          </div>
          <HubTabs tabs={TABS} value={tab} onChange={setTab} label="Steam" />
          <div className="zone-panel" role="tabpanel">
            {panel}
          </div>
        </>
      ) : !err ? (
        <div className="zone-panel">
          <p className="small">Waiting for the first sync. Once the steps below are done it runs every 15 minutes, or run it now from GitHub.</p>
          <SetupSteps saved />
        </div>
      ) : null}
      {settings ? <SteamSettings fun={fun} mutate={mutate} onClose={() => setSettings(false)} /> : null}
      <div className="zone-foot steam-foot small">
        <span>{live && live.seenAt ? `Checked ${ago(live.seenAt)}` : 'Not synced yet'}</span>
        <button className="link-btn small" onClick={() => setSettings(!settings)} aria-expanded={settings}>
          {settings ? 'Close settings' : 'Steam settings'}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Home: while you're in a game
export function SteamLiveCard({ steam, live }) {
  useNow(60000);
  const s = S.liveStatus(live);
  if (!s || !s.playing) return null;
  const g = steam && s.id ? steam.games.find((x) => x.id === s.id) : null;
  return (
    <a className="card steam-live" href="#/fun" aria-label={`Playing ${s.playing} on Steam. Open Entertainment`}>
      <GameArt id={s.id} name={s.playing} steam={steam} shape="wide" />
      <div className="grow">
        <div className="steam-live-kicker">
          <span className="dot-live" /> Playing now
        </div>
        <div className="steam-live-name">{s.playing}</div>
        <div className="small steam-live-sub">
          {[s.mins != null ? S.sinceText(s.mins) : '', g && g.m ? `${hrs(g.m)} total` : 'on Steam'].filter(Boolean).join(' · ')}
        </div>
      </div>
      <Icon name="chev" size={18} />
    </a>
  );
}
