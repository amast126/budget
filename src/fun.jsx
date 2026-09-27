// Entertainment tab: the big countdown (GTA VI, with Rockstar's latest from the GTA 6 site's feed), everything
// else coming up, what you're playing with challenge counters, the Avengers: Doomsday watch list, and gaming and
// Marvel news from news.json.
import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { celebrate, centerOf } from './fx.jsx';
import { useNow } from './pulse.jsx';
import { IS_DEMO } from './demo-flag.js';
import { dateLabel } from './budget-logic.js';
import * as F from './fun-logic.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dayText = (n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 0 ? 'Out now' : `${n} days`);
const longDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.round(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 60 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------- GTA 6 site feed
// The GTA 6 encyclopedia (same site, /gta6/) keeps Rockstar's newswire and trailers in news.json.
let feedCache = null;
export function useGtaFeed(on) {
  const [feed, setFeed] = useState(feedCache);
  useEffect(() => {
    if (!on || feedCache) return;
    let live = true;
    fetch(new URL('../gta6/news.json', location.href).href, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((j) => {
        feedCache = j;
        if (live) setFeed(j);
      })
      .catch(() => live && setFeed({ error: true }));
    return () => {
      live = false;
    };
  }, [on]);
  return feed;
}

// ---------------------------------------------------------------- the big countdown
function Tile({ n, l }) {
  return (
    <div className="cd-tile">
      <b className="num">{String(n).padStart(2, '0')}</b>
      <span>{l}</span>
    </div>
  );
}
function ReleaseHero({ r, feed }) {
  const now = useNow(1000);
  const t = F.timeLeft(r.date, now);
  const gta = F.isGta(r);
  const official = gta && feed && Array.isArray(feed.official) ? [...feed.official].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3) : [];
  return (
    <section className={`card fun-hero ${gta ? 'vice' : ''}`} aria-label={`Countdown to ${r.title}`}>
      <div className="fun-hero-top">
        <div className="grow">
          <div className="fun-kicker">{F.KIND_ICON[r.kind] || '📅'} Countdown</div>
          <h2 className="fun-hero-title">{r.title}</h2>
          <div className="fun-hero-sub">
            {longDate(r.date)}
            {r.note ? ` · ${r.note}` : ''}
          </div>
        </div>
      </div>
      {t.ms > 0 ? (
        <div className="cd-tiles" role="timer" aria-label={`${t.d} days, ${t.h} hours, ${t.m} minutes to go`}>
          <Tile n={t.d} l={t.d === 1 ? 'day' : 'days'} />
          <Tile n={t.h} l="hrs" />
          <Tile n={t.m} l="min" />
          <Tile n={t.s} l="sec" />
        </div>
      ) : (
        <div className="fun-out">It’s out. Go play.</div>
      )}
      {gta ? (
        <div className="vice-feed">
          <div className="vice-feed-head">
            <span>Latest from Rockstar</span>
            {IS_DEMO ? null : (
              <a href={new URL('../gta6/', location.href).href} target="_blank" rel="noopener">
                My GTA 6 site <Icon name="ext" size={13} />
              </a>
            )}
          </div>
          {official.length ? (
            <ul className="vice-list">
              {official.map((o) => (
                <li key={o.id || o.url}>
                  <a href={o.url} target="_blank" rel="noopener">
                    {o.image ? <img src={o.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
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
          ) : (
            <p className="vice-meta">{feed && feed.error ? 'Couldn’t reach the GTA 6 site’s feed.' : feed ? 'Nothing new from Rockstar yet.' : 'Loading…'}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- coming up
function ComingUp({ data, mutate }) {
  const list = F.upcoming(data);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', date: '', kind: 'game', note: '', home: true });
  const ok = f.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(f.date);
  const submit = (e) => {
    e.preventDefault();
    if (!ok) return;
    mutate((d) => F.addRelease(d, f), `Added ${f.title.trim()}`);
    setF({ title: '', date: '', kind: f.kind, note: '', home: true });
    setAdding(false);
  };
  return (
    <section className="card coming-up">
      <div className="card-head">
        <h2 className="card-title">Coming up</h2>
        <button className="link-btn small" onClick={() => setAdding(!adding)}>
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>
      {adding ? (
        <form className="fun-form" onSubmit={submit}>
          <input className="input" placeholder="Game, movie, show…" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Title" />
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Release date" />
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Kind">
            {F.KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <input className="input" placeholder="Where (PS5, theaters…)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} aria-label="Where" />
          <label className="check-line small">
            <input type="checkbox" checked={f.home} onChange={(e) => setF({ ...f, home: e.target.checked })} /> Count down on Home
          </label>
          <button className="btn primary" disabled={!ok} type="submit">
            Add
          </button>
        </form>
      ) : null}
      {list.length === 0 ? (
        <p className="empty">Nothing on the calendar. Add a release to count down to.</p>
      ) : (
        <ul className="list">
          {list.map((r) => (
            <li key={r.id} className={`release ${r.days < 0 ? 'out' : ''}`}>
              <span className="release-icon" aria-hidden="true">
                {F.KIND_ICON[r.kind] || '📅'}
              </span>
              <div className="grow">
                <div className="bill-name">{r.title}</div>
                <div className="muted small">
                  {dateLabel(r.date)}
                  {r.note ? ` · ${r.note}` : ''}
                  {r.home ? ' · on Home' : ''}
                </div>
              </div>
              <span className={`days-pill ${r.days <= 14 && r.days >= 0 ? 'soon' : ''}`}>{dayText(r.days)}</span>
              <div className="release-acts">
                <button className={`icon-btn ${r.pin ? 'on' : ''}`} title={r.pin ? 'Featured at the top' : 'Feature at the top'} aria-label={`Feature ${r.title} at the top`} aria-pressed={!!r.pin} onClick={() => mutate((d) => F.pinRelease(d, r.id))}>
                  ★
                </button>
                <button className={`icon-btn ${r.home ? 'on' : ''}`} title={r.home ? 'Shown on Home' : 'Show on Home'} aria-label={`Show ${r.title} on Home`} aria-pressed={!!r.home} onClick={() => mutate((d) => F.toggleReleaseHome(d, r.id))}>
                  <Icon name="home" size={15} />
                </button>
                <button className="x" aria-label={`Remove ${r.title}`} onClick={() => mutate((d) => F.removeRelease(d, r.id), `Removed ${r.title}`)}>
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- now playing
function Challenge({ g, c, mutate }) {
  const [edit, setEdit] = useState(null);
  const done = c.n >= c.goal;
  const step = c.goal >= 100 ? 10 : c.goal >= 20 ? 5 : 1;
  const bump = (by, e) => {
    const finishing = !done && c.n + by >= c.goal;
    if (finishing) celebrate(e ? centerOf(e.currentTarget) : {});
    mutate((d) => F.bumpChallenge(d, g.id, c.id, by), finishing ? `Done: ${c.text}` : undefined);
  };
  return (
    <li className={`chal ${done ? 'done' : ''}`}>
      {c.goal === 1 ? (
        <label className="bill-check">
          <input type="checkbox" checked={done} onChange={(e) => bump(done ? -1 : 1, e)} aria-label={c.text} />
          <span className="box">{done ? <Icon name="check" size={14} /> : null}</span>
        </label>
      ) : null}
      <div className="grow">
        <div className="chal-text">{c.text}</div>
        {c.goal > 1 ? (
          <>
            <div className="bar slim">
              <div className="bar-fill" style={{ width: `${Math.min(100, (c.n / c.goal) * 100)}%` }} />
            </div>
            <div className="chal-row">
              {edit != null ? (
                <form
                  className="chal-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutate((d) => F.setChallenge(d, g.id, c.id, edit));
                    setEdit(null);
                  }}
                >
                  <input className="input num" inputMode="numeric" value={edit} autoFocus onChange={(e) => setEdit(e.target.value)} aria-label={`Progress on ${c.text}`} />
                  <span className="muted small">/ {c.goal}</span>
                  <button className="btn small" type="submit">
                    Save
                  </button>
                </form>
              ) : (
                <>
                  <button className="link-btn small num" onClick={() => setEdit(String(c.n))} title="Set the number">
                    {c.n.toLocaleString()} / {c.goal.toLocaleString()}
                  </button>
                  {done ? (
                    <span className="tag tag-passed">Done</span>
                  ) : (
                    <span className="chal-btns">
                      <button className="btn quiet small" onClick={(e) => bump(1, e)} aria-label={`Add 1 to ${c.text}`}>
                        +1
                      </button>
                      {step > 1 ? (
                        <button className="btn quiet small" onClick={(e) => bump(step, e)} aria-label={`Add ${step} to ${c.text}`}>
                          +{step}
                        </button>
                      ) : null}
                    </span>
                  )}
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
      <button className="x" aria-label={`Remove ${c.text}`} onClick={() => mutate((d) => F.removeChallenge(d, g.id, c.id))}>
        ×
      </button>
    </li>
  );
}
function Game({ g, mutate }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ text: '', goal: '' });
  const [note, setNote] = useState(null);
  const open = g.challenges.filter((c) => c.n < c.goal).length;
  const doneN = g.challenges.length - open;
  return (
    <li className="game">
      <div className="game-head">
        <div className="grow">
          <div className="bill-name">{g.title}</div>
          {note != null ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutate((d) => F.setGameNote(d, g.id, note));
                setNote(null);
              }}
            >
              <input className="input small-input" value={note} autoFocus onChange={(e) => setNote(e.target.value)} onBlur={(e) => e.currentTarget.form.requestSubmit()} placeholder="Platform, rank, where you are…" aria-label={`Note for ${g.title}`} />
            </form>
          ) : (
            <button className="link-btn small muted-link" onClick={() => setNote(g.note || '')}>
              {g.note || 'Add a note (rank, platform…)'}
              {g.challenges.length ? ` · ${doneN} of ${g.challenges.length} done` : ''}
            </button>
          )}
        </div>
        <button className="x" aria-label={`Remove ${g.title}`} onClick={() => mutate((d) => F.removeGame(d, g.id), `Removed ${g.title}`)}>
          ×
        </button>
      </div>
      {g.challenges.length ? (
        <ul className="list chal-list">
          {g.challenges.map((c) => (
            <Challenge key={c.id} g={g} c={c} mutate={mutate} />
          ))}
        </ul>
      ) : null}
      {adding ? (
        <form
          className="chal-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!f.text.trim()) return;
            mutate((d) => F.addChallenge(d, g.id, { text: f.text, goal: f.goal || 1 }));
            setF({ text: '', goal: '' });
            setAdding(false);
          }}
        >
          <input className="input" placeholder="Challenge, Easter egg, trophy…" value={f.text} autoFocus onChange={(e) => setF({ ...f, text: e.target.value })} aria-label="Challenge" />
          <input className="input num" inputMode="numeric" placeholder="Goal (1)" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value.replace(/\D/g, '') })} aria-label="Goal count" />
          <button className="btn small primary" type="submit" disabled={!f.text.trim()}>
            Add
          </button>
          <button className="btn small quiet" type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="game-foot">
          <button className="link-btn small" onClick={() => setAdding(true)}>
            + Challenge
          </button>
          {doneN ? (
            <button className="link-btn small muted-link" onClick={() => mutate((d) => F.clearDoneChallenges(d, g.id))}>
              Clear {doneN} done
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}
function NowPlaying({ data, mutate }) {
  const [title, setTitle] = useState('');
  return (
    <section className="card now-playing">
      <div className="card-head">
        <h2 className="card-title">Now playing</h2>
        <span className="muted small">{plural(data.playing.length, 'game')}</span>
      </div>
      {data.playing.length ? (
        <ul className="list games">
          {data.playing.map((g) => (
            <Game key={g.id} g={g} mutate={mutate} />
          ))}
        </ul>
      ) : (
        <p className="empty">Add what you’re playing, and track challenges, Easter eggs and trophies as you go.</p>
      )}
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          mutate((d) => F.addGame(d, { title }), `Added ${title.trim()}`);
          setTitle('');
        }}
      >
        <input className="input" placeholder="Add a game" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Add a game" />
        <button className="btn" type="submit" disabled={!title.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- Doomsday watch list
const TYPE = { film: 'Film', series: 'Series', special: 'Special' };
const FILTERS = [
  ['todo', 'To watch'],
  ['all', 'All'],
  ['w', 'Watched'],
  ['s', 'Skipped'],
];
function WatchRow({ t, st, mutate }) {
  const set = (s, e) => {
    const next = st === s ? null : s;
    if (next === 'w' && e) celebrate({ ...centerOf(e.currentTarget), count: 14 });
    mutate((d) => F.setMcu(d, t.id, next));
  };
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
    </li>
  );
}
function WatchList({ data, mutate }) {
  const [filter, setFilter] = useState('todo');
  const [keyOnly, setKeyOnly] = useState(false);
  const [open, setOpen] = useState(() => new Set());
  const [add, setAdd] = useState({ title: '', year: '' });
  const p = F.mcuProgress(data);
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
    <section className="card watchlist">
      <div className="card-head">
        <h2 className="card-title">Road to Doomsday</h2>
        <span className="muted small">{p.days > 0 ? `${plural(p.days, 'day')} to go` : p.days === 0 ? 'Out today' : 'Out now'}</span>
      </div>
      <div className="dd-banner">
        <div className="grow">
          <div className="dd-title">Avengers: Doomsday</div>
          <div className="muted small">In theaters {longDate(F.DOOMSDAY)}</div>
        </div>
        <div className="dd-days">
          <b className="num">{Math.max(0, p.days)}</b>
          <span>days</span>
        </div>
      </div>
      <div className="dd-progress">
        <div className="row-between small">
          <span>
            <b className="num">{p.watched}</b> of <span className="num">{p.needed}</span> watched
          </span>
          <span className="muted num">{Math.round(p.pct * 100)}%</span>
        </div>
        <div className="bar slim">
          <div className="bar-fill" style={{ width: `${p.pct * 100}%` }} />
        </div>
        <div className="muted small">
          {p.left === 0
            ? 'All caught up. See you on opening night.'
            : p.perWeek
              ? `${plural(p.left, 'title')} to go: about ${p.perWeek} a week gets you there by ${dateLabel(F.DOOMSDAY)}.`
              : `${plural(p.left, 'title')} to go.`}
          {p.skipped ? ` ${p.skipped} skipped.` : ''}
        </div>
      </div>
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
          return (
            <li key={g.id} className={`wgroup ${isOpen ? 'open' : ''}`}>
              <button className="wgroup-head" onClick={() => toggle(g.id)} aria-expanded={isOpen}>
                <span className="grow">
                  <span className="wgroup-name">{g.name}</span>
                  <span className="muted small">
                    {g.years ? `${g.years} · ` : ''}
                    {g.g.total === g.g.skipped ? 'All skipped' : `${g.g.watched} of ${g.g.total - g.g.skipped} watched${g.g.skipped ? ` · ${g.g.skipped} skipped` : ''}`}
                  </span>
                </span>
                <span className="wgroup-mini" aria-hidden="true">
                  <span style={{ width: `${g.g.total - g.g.skipped ? (g.g.watched / (g.g.total - g.g.skipped)) * 100 : 0}%` }} />
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
    </section>
  );
}

// ---------------------------------------------------------------- news
const FUN_NEWS = [
  ['gaming', 'Gaming', 'Polygon, GameSpot, VGC, IGN, Kotaku, Eurogamer, plus stories on your games'],
  ['marvel', 'Marvel', 'Variety, THR, Deadline, IGN and more on Marvel Studios'],
];
function FunNews({ news, read, markRead }) {
  const [tab, setTab] = useState('gaming');
  const [limit, setLimit] = useState(8);
  const items = (news && news[tab]) || [];
  const cur = FUN_NEWS.find(([k]) => k === tab);
  return (
    <section className="card fun-news">
      <div className="card-head">
        <h2 className="card-title">News</h2>
        <div className="seg mini-seg" role="tablist">
          {FUN_NEWS.map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className={`seg-btn ${tab === k ? 'on' : ''}`}
              onClick={() => {
                setTab(k);
                setLimit(8);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {!news ? (
        <p className="empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">Nothing here yet. This fills in on the next news update, within about 30 minutes.</p>
      ) : (
        <ul className="list">
          {items.slice(0, limit).map((i) => (
            <li key={i.id}>
              <a className={`story ${read.has(i.id) ? 'read' : ''}`} href={i.url} target="_blank" rel="noopener" onClick={() => markRead(i.id)}>
                {i.image ? <img className="thumb" src={i.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
                <div className="grow">
                  <div className="story-title">
                    {!read.has(i.id) ? <span className="dot" /> : null}
                    {i.title}
                  </div>
                  <div className="muted small">
                    {i.tag ? <span className="tag tag-theme">{i.tag}</span> : null}
                    {i.source}
                    {i.date ? ` · ${timeAgo(i.date)}` : ''}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
      {items.length > limit ? (
        <button className="btn quiet block" onClick={() => setLimit(limit + 10)}>
          Show more
        </button>
      ) : null}
      <p className="muted small note">{cur[2]}</p>
    </section>
  );
}

// ---------------------------------------------------------------- page
export function FunPage({ data, mutate, error, news, read, markRead }) {
  const hero = data ? F.featured(data) : null;
  const feed = useGtaFeed(!!hero && F.isGta(hero));
  if (!data) {
    return (
      <div className="home">
        <header className="page-head">
          <h1 className="page-title">Entertainment</h1>
        </header>
        <section className="card">
          <p className="empty">{error || 'Loading…'}</p>
        </section>
      </div>
    );
  }
  const next = F.upcoming(data).filter((r) => r.days >= 0 && r.home).slice(0, 3);
  return (
    <div className="home fun">
      <header className="page-head">
        <h1 className="page-title">Entertainment</h1>
        <div className="muted">{next.length ? next.map((r) => `${r.short || r.title} in ${plural(r.days, 'day')}`).join(' · ') : 'Games, movies and shows'}</div>
      </header>
      {error ? <div className="alert">{error}</div> : null}
      <div className="grid">
        <div className="col">
          {hero ? <ReleaseHero r={hero} feed={feed} /> : null}
          <ComingUp data={data} mutate={mutate} />
          <NowPlaying data={data} mutate={mutate} />
        </div>
        <div className="col">
          <WatchList data={data} mutate={mutate} />
          <FunNews news={news} read={read} markRead={markRead} />
        </div>
      </div>
    </div>
  );
}
