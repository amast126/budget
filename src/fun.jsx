// Entertainment tab: two themed zones (GTA VI and Avengers: Doomsday, in fun-zones.jsx), a big countdown for any
// other release you feature, everything else coming up, what you're playing with challenge counters, and gaming and
// Marvel news from news.json.
import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { celebrate, centerOf } from './fx.jsx';
import { IS_DEMO } from './demo-flag.js';
import { dateLabel } from './budget-logic.js';
import * as F from './fun-logic.js';
import { ViceZone, DoomZone, Countdown, ART } from './fun-zones.jsx';
import { SteamZone, GameArt, hueOf, initialsOf } from './steam.jsx';
import * as S from './steam-logic.js';

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

// ---------------------------------------------------------------- the big countdown (for a release with no zone of its own)
function ReleaseHero({ r }) {
  return (
    <section className={`card fun-hero k-${r.kind || 'other'}`} aria-label={`Countdown to ${r.title}`}>
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
      <Countdown date={r.date} />
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
            <li key={r.id} className={`release k-${r.kind || 'other'} ${r.days < 0 ? 'out' : ''} ${F.zoneOf(r) ? `z-${F.zoneOf(r)}` : ''}`}>
              {F.zoneOf(r) ? (
                <img className="release-art" src={F.zoneOf(r) === 'gta' ? ART.gta : ART.doom} alt="" />
              ) : (
                <span className="release-icon" aria-hidden="true">
                  {F.KIND_ICON[r.kind] || '📅'}
                </span>
              )}
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
function Game({ g, mutate, steam, status }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ text: '', goal: '' });
  const [note, setNote] = useState(null);
  const open = g.challenges.filter((c) => c.n < c.goal).length;
  const doneN = g.challenges.length - open;
  const hue = hueOf(g.title);
  const initials = initialsOf(g.title);
  // its Steam side: cover art for anything Steam sells, hours and achievements for games in your library
  const sg = S.steamGameFor(g, steam);
  const owned = sg && !sg.notOwned ? sg : null;
  const ach = owned && steam.ach && steam.ach[owned.id];
  const live = !!(status && status.playing && sg && status.id === sg.id);
  return (
    <li className="game" style={{ '--gh': hue }}>
      <div className="game-head">
        {sg ? (
          <span className={`game-badge has-art ${live ? 'live' : ''}`}>
            <GameArt id={sg.id} name={g.title} steam={steam} shape="badge" />
            {g.challenges.length ? (
              <span className="game-prog" aria-hidden="true">
                <i style={{ width: `${(doneN / g.challenges.length) * 100}%` }} />
              </span>
            ) : null}
          </span>
        ) : (
          <span className="game-badge" aria-hidden="true">
            {initials}
            {g.challenges.length ? (
              <svg className="game-ring" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" pathLength="100" strokeDasharray={`${(doneN / g.challenges.length) * 100} 100`} />
              </svg>
            ) : null}
          </span>
        )}
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
          {owned ? (
            <div className="game-steam">
              {live ? (
                <span className="live-pill">
                  <span className="dot-live" /> Playing now
                </span>
              ) : null}
              <span>{[`${S.hoursText(owned.m)} on Steam`, owned.w ? `${S.hoursText(owned.w)} past 2 weeks` : '', ach && ach.t ? `${ach.u}/${ach.t} achievements` : ''].filter(Boolean).join(' · ')}</span>
            </div>
          ) : null}
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
function NowPlaying({ data, mutate, steam, status }) {
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
            <Game key={g.id} g={g} mutate={mutate} steam={steam} status={status} />
          ))}
        </ul>
      ) : (
        <p className="empty">Add what you’re playing, and track challenges, Easter eggs and trophies as you go.{data.steam && data.steam.profile ? ' Steam games you play show up here on their own.' : ''}</p>
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
export function FunPage({ data, mutate, error, news, read, markRead, steam, steamLive }) {
  const list = data ? F.upcoming(data) : [];
  const gta = list.find((r) => F.zoneOf(r) === 'gta') || null;
  const hero = data ? F.featured(data) : null;
  const other = hero && !F.zoneOf(hero) ? hero : null; // a featured release with no zone gets the big countdown
  const feed = useGtaFeed(!!gta && !IS_DEMO);
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
  const next = list.filter((r) => r.days >= 0 && r.home).slice(0, 4);
  return (
    <div className="home fun">
      <header className="page-head fun-head">
        <h1 className="page-title">Entertainment</h1>
        {next.length ? (
          <div className="fun-chips">
            {next.map((r) => (
              <span key={r.id} className={`fun-chip k-${r.kind || 'other'} ${F.zoneOf(r) ? `z-${F.zoneOf(r)}` : ''}`}>
                <b className="num">{r.days}</b>
                <span>{r.days === 1 ? 'day' : 'days'} to {r.short || r.title}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="muted">Games, movies and shows</div>
        )}
      </header>
      {error ? <div className="alert">{error}</div> : null}
      <div className="grid">
        <div className="col">
          {other ? <ReleaseHero r={other} /> : null}
          {gta && !IS_DEMO ? <ViceZone r={gta} feed={feed} /> : null}
          <ComingUp data={data} mutate={mutate} />
          <NowPlaying data={data} mutate={mutate} steam={steam} status={S.liveStatus(steamLive)} />
        </div>
        <div className="col">
          <DoomZone data={data} mutate={mutate} />
          <FunNews news={news} read={read} markRead={markRead} />
        </div>
        <SteamZone fun={data} mutate={mutate} steam={steam} live={steamLive} />
      </div>
    </div>
  );
}
