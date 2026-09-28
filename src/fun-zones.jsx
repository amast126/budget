// The Entertainment tab's two themed zones. GTA VI: Vice City neon around the key art, with a hub built from your
// GTA 6 site's own content files (characters, Leonida, trailers, editions) and Rockstar's latest from its feed.
// Avengers: Doomsday: emerald and gold around the poster, with the watch list, a crash course, the cast, the
// trailers and the facts. Both count down to the second.
import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { celebrate, centerOf } from './fx.jsx';
import { useNow } from './pulse.jsx';
import { dateLabel, todayISO } from './budget-logic.js';
import * as F from './fun-logic.js';

export const ART = {
  gta: 'art/gta6-key-art.jpg',
  gtaSoft: 'art/gta6-key-art-blur.jpg',
  doom: 'art/doomsday-poster.jpg',
  doomSoft: 'art/doomsday-poster-blur.jpg',
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const longDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const site = (path = '') => new URL(`../gta6/${path}`, location.href).href;
const yt = (id) => `https://www.youtube.com/watch?v=${id}`;
const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.round(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 60 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
// A tab choice remembered in this browser.
export function useStored(key, initial, allowed) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s && (!allowed || allowed.includes(s)) ? s : initial;
    } catch {
      return initial;
    }
  });
  const set = (x) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {
      /* ignore */
    }
  };
  return [v, set];
}

// ---------------------------------------------------------------- shared pieces
export function Countdown({ date, className = '' }) {
  const now = useNow(1000);
  const t = F.timeLeft(date, now);
  if (t.ms <= 0) return <div className={`zone-out ${className}`}>Out now</div>;
  const tile = (n, l) => (
    <div className="cd-tile">
      <b className="num">{String(n).padStart(2, '0')}</b>
      <span>{l}</span>
    </div>
  );
  return (
    <div className={`cd-tiles ${className}`} role="timer" aria-label={`${t.d} days, ${t.h} hours, ${t.m} minutes to go`}>
      {tile(t.d, t.d === 1 ? 'day' : 'days')}
      {tile(t.h, 'hrs')}
      {tile(t.m, 'min')}
      {tile(t.s, 'sec')}
    </div>
  );
}
export function HubTabs({ tabs, value, onChange, label }) {
  return (
    <div className="hub-tabs" role="tablist" aria-label={label}>
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={`hub-tab ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}
function VideoCard({ id, title, sub }) {
  return (
    <li>
      <a className="vid" href={yt(id)} target="_blank" rel="noopener">
        <span className="vid-thumb">
          <img src={ytThumb(id)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          <span className="vid-play" aria-hidden="true">
            ▶
          </span>
        </span>
        <span className="vid-text">
          <span className="vid-title">{title}</span>
          {sub ? <span className="vid-sub">{sub}</span> : null}
        </span>
      </a>
    </li>
  );
}

// ---------------------------------------------------------------- GTA VI
// The GTA 6 site (same host, /gta6/) keeps its entries in content/*.json; read once per visit.
let gtaContent = null;
const GTA_FILES = ['characters', 'locations', 'media', 'release'];
export function useGtaContent(on) {
  const [c, setC] = useState(gtaContent);
  useEffect(() => {
    if (!on || gtaContent) return;
    let live = true;
    Promise.all(GTA_FILES.map((f) => fetch(site(`content/${f}.json`), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))))
      .then((all) => {
        gtaContent = Object.fromEntries(GTA_FILES.map((f, i) => [f, Array.isArray(all[i]) ? all[i] : []]));
        if (live) setC(gtaContent);
      })
      .catch(() => live && setC({ error: true }));
    return () => {
      live = false;
    };
  }, [on]);
  return c;
}
const entry = (id) => site(`#/e/${id}`);
function Latest({ feed }) {
  const official = feed && Array.isArray(feed.official) ? [...feed.official].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4) : [];
  if (!official.length) return <p className="zone-note">{feed && feed.error ? 'Couldn’t reach the GTA 6 site’s feed.' : feed ? 'Nothing new from Rockstar yet.' : 'Loading…'}</p>;
  return (
    <>
      <div className="zone-h">Latest from Rockstar</div>
      <ul className="vice-list">
        {official.map((o) => (
          <li key={o.id || o.url}>
            <a href={o.url} target="_blank" rel="noopener">
              {o.image ? <img src={o.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} /> : <span className="vice-noimg" aria-hidden="true" />}
              <span className="grow">
                <span className="vice-title">{o.title}</span>
                <span className="vice-meta">
                  {o.type === 'youtube' ? 'Video' : 'Newswire'}
                  {o.date ? ` · ${timeAgo(o.date)}` : ''}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
function Characters({ list }) {
  const leads = list.filter((c) => (c.tags || []).includes('protagonist'));
  const rest = list.filter((c) => !(c.tags || []).includes('protagonist'));
  return (
    <>
      <ul className="gta-leads">
        {leads.map((c) => (
          <li key={c.id}>
            <a href={entry(c.id)} target="_blank" rel="noopener">
              <span className="gta-lead-name">{c.name}</span>
              <span className="gta-lead-sub">{c.subtitle}</span>
              <span className="gta-summary">{c.summary}</span>
            </a>
          </li>
        ))}
      </ul>
      {rest.length ? (
        <>
          <div className="zone-h">Also in the story</div>
          <ul className="gta-chips">
            {rest.map((c) => (
              <li key={c.id}>
                <a href={entry(c.id)} target="_blank" rel="noopener" title={c.summary}>
                  <b>{c.name}</b>
                  <span>{c.subtitle}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
function Leonida({ list }) {
  const state = list.find((l) => (l.tags || []).includes('state'));
  const regions = list.filter((l) => l !== state);
  return (
    <>
      {state ? <p className="zone-lede">{state.summary}</p> : null}
      <ul className="gta-regions">
        {regions.map((l, i) => (
          <li key={l.id} style={{ '--i': i }}>
            <a href={entry(l.id)} target="_blank" rel="noopener">
              <span className="gta-region-name">{l.name}</span>
              <span className="gta-region-sub">{l.subtitle}</span>
              <span className="gta-summary">{l.summary}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
function GtaMedia({ list }) {
  const vids = list.filter((m) => m.video).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
  const other = list.filter((m) => !m.video);
  return (
    <>
      <ul className="vid-grid">
        {vids.map((m) => (
          <VideoCard key={m.id} id={m.video} title={m.name} sub={m.subtitle} />
        ))}
      </ul>
      {other.length ? (
        <ul className="zone-rows">
          {other.map((m) => (
            <li key={m.id}>
              <a href={entry(m.id)} target="_blank" rel="noopener">
                <b>{m.name}</b>
                <span>{m.subtitle}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
function Editions({ list }) {
  const when = list.find((x) => x.id === 'platforms-and-date');
  const rest = list.filter((x) => x !== when);
  return (
    <>
      {when ? (
        <a className="gta-when" href={entry(when.id)} target="_blank" rel="noopener">
          <span className="gta-when-sub">{when.subtitle}</span>
          <span className="gta-summary">{when.summary}</span>
        </a>
      ) : null}
      <ul className="gta-tickets">
        {rest.map((x) => (
          <li key={x.id}>
            <a href={entry(x.id)} target="_blank" rel="noopener">
              <span className="gta-ticket-name">{x.name}</span>
              <span className="gta-ticket-price">{x.subtitle}</span>
              <span className="gta-summary">{x.summary}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
const GTA_TABS = [
  ['latest', 'Latest'],
  ['characters', 'Jason & Lucia'],
  ['leonida', 'Leonida'],
  ['trailers', 'Trailers'],
  ['editions', 'Editions'],
];
export function ViceZone({ r, feed }) {
  const [tab, setTab] = useStored('dash.gtaTab', 'latest', GTA_TABS.map((t) => t[0]));
  const content = useGtaContent(true);
  const need = { characters: 'characters', leonida: 'locations', trailers: 'media', editions: 'release' }[tab];
  let panel;
  if (tab === 'latest') panel = <Latest feed={feed} />;
  else if (!content) panel = <p className="zone-note">Loading from your GTA 6 site…</p>;
  else if (content.error) panel = <p className="zone-note">Couldn’t reach your GTA 6 site. It fills in when you’re back online.</p>;
  else {
    const list = content[need] || [];
    panel = tab === 'characters' ? <Characters list={list} /> : tab === 'leonida' ? <Leonida list={list} /> : tab === 'trailers' ? <GtaMedia list={list} /> : <Editions list={list} />;
  }
  return (
    <section className="card zone vice-zone" aria-label="Grand Theft Auto VI">
      <div className="zone-bg" style={{ backgroundImage: `url(${ART.gtaSoft})` }} aria-hidden="true" />
      <div className="zone-hero">
        <img className="zone-art" src={ART.gta} alt="Grand Theft Auto VI key art" />
        <div className="zone-hero-text">
          <div className="zone-kicker">
            <span className="zone-dot" /> Countdown{r.note ? ` · ${r.note}` : ''}
          </div>
          <h2 className="zone-name vice-name">Grand Theft Auto VI</h2>
          <div className="zone-sub">{longDate(r.date)}</div>
          <Countdown date={r.date} />
        </div>
      </div>
      <HubTabs tabs={GTA_TABS} value={tab} onChange={setTab} label="GTA VI" />
      <div className="zone-panel" role="tabpanel">
        {panel}
      </div>
      <a className="zone-foot" href={site()} target="_blank" rel="noopener">
        Everything else on my GTA 6 site <Icon name="ext" size={13} />
      </a>
    </section>
  );
}

// ---------------------------------------------------------------- Avengers: Doomsday
const TYPE = { film: 'Film', series: 'Series', special: 'Special' };
const FILTERS = [
  ['todo', 'To watch'],
  ['all', 'All'],
  ['w', 'Watched'],
  ['s', 'Skipped'],
];
function WatchButtons({ t, st, mutate }) {
  const set = (s, e) => {
    const next = st === s ? null : s;
    if (next === 'w' && e) celebrate({ ...centerOf(e.currentTarget), count: 14 });
    mutate((d) => F.setMcu(d, t.id, next));
  };
  return (
    <div className="watch-btns">
      <button className={`pill-btn w ${st === 'w' ? 'on' : ''}`} aria-pressed={st === 'w'} onClick={(e) => set('w', e)} aria-label={`${t.title}: watched`}>
        <Icon name="check" size={14} /> Watched
      </button>
      <button className={`pill-btn s ${st === 's' ? 'on' : ''}`} aria-pressed={st === 's'} onClick={() => set('s')} aria-label={`${t.title}: skip`}>
        Skip
      </button>
      {t.group === 'mine' ? (
        <button className="x" aria-label={`Remove ${t.title}`} onClick={() => mutate((d) => F.removeMcuTitle(d, t.id))}>
          ×
        </button>
      ) : null}
    </div>
  );
}
function WatchRow({ t, st, mutate }) {
  return (
    <li className={`watch-row ${st ? `st-${st}` : ''}`}>
      <div className="grow">
        <div className="watch-title">
          {t.title}
          {t.key ? <span className="tag tag-key" title="On most pre-Doomsday watch lists">Key</span> : null}
        </div>
        <div className="muted small">
          {t.year || ''}
          {t.year ? ' · ' : ''}
          {TYPE[t.type] || 'Film'}
          {t.out ? ` · out ${dateLabel(t.out)}` : ''}
        </div>
      </div>
      <WatchButtons t={t} st={st} mutate={mutate} />
    </li>
  );
}
function WatchPanel({ data, mutate }) {
  const [filter, setFilter] = useState('todo');
  const [keyOnly, setKeyOnly] = useState(false);
  const [open, setOpen] = useState(() => new Set());
  const [add, setAdd] = useState({ title: '', year: '' });
  const all = F.mcuList(data);
  const show = (t) => {
    const st = data.mcu[t.id] || null;
    if (keyOnly && !t.key) return false;
    return filter === 'all' ? true : filter === 'todo' ? !st : st === filter;
  };
  const groups = F.MCU_GROUPS.map(([id, name, years]) => ({ id, name, years, items: all.filter((t) => t.group === id), g: F.groupProgress(data, id) })).filter((g) => g.items.length);
  const toggle = (id) => {
    const n = new Set(open);
    n.has(id) ? n.delete(id) : n.add(id);
    setOpen(n);
  };
  const anyOpen = groups.some((g) => open.has(g.id));
  return (
    <>
      <div className="watch-tools">
        <div className="seg mini-seg" role="group" aria-label="Show">
          {FILTERS.map(([k, l]) => (
            <button key={k} className={`seg-btn ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <label className="check-line small">
          <input type="checkbox" checked={keyOnly} onChange={(e) => setKeyOnly(e.target.checked)} /> Key titles only
        </label>
      </div>
      <ul className="watch-groups">
        {groups.map((g) => {
          const items = g.items.filter(show);
          const isOpen = open.has(g.id);
          const count = g.g.total - g.g.skipped;
          return (
            <li key={g.id} className={`wgroup ${isOpen ? 'open' : ''}`}>
              <button className="wgroup-head" onClick={() => toggle(g.id)} aria-expanded={isOpen}>
                <span className="grow">
                  <span className="wgroup-name">{g.name}</span>
                  <span className="muted small">
                    {g.years ? `${g.years} · ` : ''}
                    {g.g.total === g.g.skipped ? 'All skipped' : `${g.g.watched} of ${count} watched${g.g.skipped ? ` · ${g.g.skipped} skipped` : ''}`}
                  </span>
                </span>
                <span className="wgroup-mini" aria-hidden="true">
                  <span style={{ width: `${count ? (g.g.watched / count) * 100 : 0}%` }} />
                </span>
                <Icon name={isOpen ? 'down' : 'chev'} size={18} />
              </button>
              {isOpen ? (
                <>
                  {items.length ? (
                    <ul className="list">
                      {items.map((t) => (
                        <WatchRow key={t.id} t={t} st={data.mcu[t.id] || null} mutate={mutate} />
                      ))}
                    </ul>
                  ) : (
                    <p className="empty small">Nothing here with this filter.</p>
                  )}
                  <div className="wgroup-acts">
                    <button className="link-btn small" onClick={() => mutate((d) => F.setGroup(d, g.id, 'w'), `Marked all of ${g.name} watched`)}>
                      Mark all watched
                    </button>
                    <button className="link-btn small muted-link" onClick={() => mutate((d) => F.setGroup(d, g.id, 's'), `Skipping ${g.name}`)}>
                      Skip all
                    </button>
                    {g.g.watched || g.g.skipped ? (
                      <button className="link-btn small muted-link" onClick={() => mutate((d) => F.setGroup(d, g.id, null))}>
                        Reset
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="row-between small watch-foot">
        <button className="link-btn small" onClick={() => setOpen(anyOpen ? new Set() : new Set(groups.map((g) => g.id)))}>
          {anyOpen ? 'Collapse all' : 'Expand all'}
        </button>
        <a className="muted small" href={F.MCU_SOURCE.url} target="_blank" rel="noopener">
          “Key” per NME’s list
        </a>
      </div>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!add.title.trim()) return;
          mutate((d) => F.addMcuTitle(d, add), `Added ${add.title.trim()}`);
          setAdd({ title: '', year: '' });
        }}
      >
        <input className="input" placeholder="Add a title" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} aria-label="Add a title to the watch list" />
        <input className="input num year-input" inputMode="numeric" placeholder="Year" value={add.year} onChange={(e) => setAdd({ ...add, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} aria-label="Year" />
        <button className="btn" type="submit" disabled={!add.title.trim()}>
          Add
        </button>
      </form>
    </>
  );
}
function CrashCourse({ data, mutate }) {
  const c = F.crashCourse(data);
  return (
    <>
      <p className="zone-lede">
        Short on time? These {c.list.length} set up who’s back and why. <b className="num">{c.done}</b> of {c.list.length} watched.
      </p>
      <ol className="crash">
        {c.list.map((t, i) => (
          <li key={t.id} className={`crash-row ${t.st ? `st-${t.st}` : ''}`}>
            <span className="crash-n num">{i + 1}</span>
            <div className="grow">
              <div className="watch-title">{t.title}</div>
              <div className="crash-why">{t.why}</div>
            </div>
            <WatchButtons t={t} st={t.st} mutate={mutate} />
          </li>
        ))}
      </ol>
    </>
  );
}
function Cast() {
  return (
    <div className="cast">
      {F.DOOM_CAST.map((g) => (
        <section key={g.id} className={`cast-group cast-${g.id}`}>
          <div className="zone-h">{g.name}</div>
          <ul className="cast-grid">
            {g.people.map((p) => (
              <li key={p.actor} className="cast-card">
                <b>{p.actor}</b>
                <span>{p.role}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="zone-note">
        All 30 names on Marvel’s cast list.{' '}
        <a href={F.DOOM_SOURCES[0][1]} target="_blank" rel="noopener">
          Marvel.com
        </a>
      </p>
    </div>
  );
}
function DoomTrailers() {
  return (
    <ul className="vid-grid">
      {F.DOOM_TRAILERS.map((t) => (
        <VideoCard key={t.id} id={t.id} title={t.title} sub={`${shortDate(t.date)} · ${t.note}`} />
      ))}
    </ul>
  );
}
function About({ today }) {
  return (
    <>
      {today <= F.DOOM_ENCORE.until ? <p className="doom-encore">{F.DOOM_ENCORE.text}</p> : null}
      <dl className="doom-facts">
        {F.DOOM_FACTS.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="zone-note">
        Sources:{' '}
        {F.DOOM_SOURCES.map(([l, u], i) => (
          <React.Fragment key={u}>
            {i ? ' · ' : ''}
            <a href={u} target="_blank" rel="noopener">
              {l}
            </a>
          </React.Fragment>
        ))}
      </p>
    </>
  );
}
const DOOM_TABS = [
  ['watch', 'Watch list'],
  ['crash', 'Crash course'],
  ['cast', 'Cast'],
  ['trailers', 'Trailers'],
  ['about', 'About'],
];
export function DoomZone({ data, mutate }) {
  const [tab, setTab] = useStored('dash.doomTab', 'watch', DOOM_TABS.map((t) => t[0]));
  const today = todayISO();
  const p = F.mcuProgress(data, today);
  const panel =
    tab === 'crash' ? <CrashCourse data={data} mutate={mutate} /> : tab === 'cast' ? <Cast /> : tab === 'trailers' ? <DoomTrailers /> : tab === 'about' ? <About today={today} /> : <WatchPanel data={data} mutate={mutate} />;
  return (
    <section className="card zone doom-zone watchlist" aria-label="Avengers: Doomsday">
      <div className="zone-bg" style={{ backgroundImage: `url(${ART.doomSoft})` }} aria-hidden="true" />
      <div className="zone-hero">
        <img className="zone-art" src={ART.doom} alt="Avengers: Doomsday poster" />
        <div className="zone-hero-text">
          <div className="zone-kicker">
            <span className="zone-dot" /> Marvel Studios · In theaters
          </div>
          <h2 className="zone-name doom-name">Avengers: Doomsday</h2>
          <div className="zone-sub">{longDate(F.DOOMSDAY)}</div>
          <Countdown date={F.DOOMSDAY} />
        </div>
      </div>
      <div className="dd-progress">
        <div className="row-between small">
          <span>
            Road to Doomsday: <b className="num">{p.watched}</b> of <span className="num">{p.needed}</span> watched
          </span>
          <span className="num">{Math.round(p.pct * 100)}%</span>
        </div>
        <div className="bar slim">
          <div className="bar-fill" style={{ width: `${p.pct * 100}%` }} />
        </div>
        <div className="small dd-pace">
          {p.left === 0
            ? 'All caught up. See you on opening night.'
            : p.perWeek
              ? `${plural(p.left, 'title')} to go: about ${p.perWeek} a week gets you there.`
              : `${plural(p.left, 'title')} to go.`}
          {p.skipped ? ` ${p.skipped} skipped.` : ''}
        </div>
      </div>
      <HubTabs tabs={DOOM_TABS} value={tab} onChange={setTab} label="Avengers: Doomsday" />
      <div className="zone-panel" role="tabpanel">
        {panel}
      </div>
    </section>
  );
}
