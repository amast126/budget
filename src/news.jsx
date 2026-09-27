// The News tab: a front page per section (a lead story, four more with photos, then the rest), outlet logos and a
// color per section, For you (matched on this device), "since you last looked", top stories with the other outlets
// covering them, Reddit with scores, saved-for-later that syncs, hidden stories, mutes, followed topics and search.
// Swipe sideways on the page to change section; swipe a story right to save it, left to hide it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { Skeleton } from './fx.jsx';
import * as NL from './news-logic.js';

const lsGet = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};
const SEEN_KEY = 'dash.newsSeen';
const ORDER = NL.SECTIONS.map((s) => s.key);
const colorOf = (key, dark) => ((NL.SECTION[key] || NL.SECTION.top).color || [])[dark ? 1 : 0];
const secStyle = (key, dark) => ({ '--sc': colorOf(key, dark) });
const readProfiles = () => lsGet('dash.profiles.v1', {}) || {};

// ---------------------------------------------------------------- small pieces
function Favicon({ item, size = 16 }) {
  const d = NL.domainOf(item);
  const [ok, setOk] = useState(true);
  if (!d || !ok)
    return (
      <span className="fav fav-letter" style={{ width: size, height: size, fontSize: size * 0.62 }} aria-hidden="true">
        {String((item && item.source) || '?').replace(/^r\//, '').charAt(0).toUpperCase()}
      </span>
    );
  return <img className="fav" src={NL.faviconUrl(d)} width={size} height={size} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => setOk(false)} />;
}

// The other outlets covering a top story: a button with their logos, and the list it opens.
function CovButton({ item, open, onToggle, long }) {
  const r = item.related || [];
  if (!r.length) return null;
  return (
    <button className={`cov-btn ${long ? 'long' : ''}`} aria-expanded={open} aria-label={`${r.length} more outlets covering this`} onClick={onToggle}>
      <span className="cov-favs" aria-hidden="true">
        {r.slice(0, 3).map((x, n) => (
          <Favicon key={n} item={x} size={15} />
        ))}
      </span>
      <span>{long ? `${r.length} more outlets` : `+${r.length}`}</span>
      <Icon name={open ? 'up' : 'down'} size={14} />
    </button>
  );
}
function CovList({ item }) {
  return (
    <ul className="cov-list">
      {(item.related || []).map((x, n) => (
        <li key={n}>
          <a href={x.url} target="_blank" rel="noopener" draggable={false}>
            <Favicon item={x} size={14} />
            <b>{x.source}</b>
            <span>{x.title}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// One story. `variant`: lead (the big one), tile (the four under it) or row (the list).
function Story({ item, variant, kicker, isNew, read, saved, dark, onOpen, onSave, onMore, cov, onCov }) {
  const [imgOk, setImgOk] = useState(true);
  const has = !!item.image && imgOk;
  const reddit = item.score != null || !!item.from;
  const hasCov = variant !== 'tile' && item.related && item.related.length > 0;
  return (
    <article className={`st st-${variant} ${variant === 'row' ? '' : 'card'} ${has ? 'has-img' : 'no-img'} ${read ? 'read' : ''}`} style={secStyle(item.sec, dark)}>
      {has ? (
        <div className="st-img">
          <img src={item.image} alt="" loading={variant === 'lead' ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setImgOk(false)} />
        </div>
      ) : null}
      <div className="st-body">
        {kicker || item.tag ? (
          <div className="st-kick">
            {kicker ? <span>{kicker}</span> : null}
            {item.tag && !kicker ? <span className={`tag tag-theme th-${String(item.tag).toLowerCase().replace(/[^a-z]/g, '')}`}>{item.tag}</span> : null}
          </div>
        ) : null}
        <h3 className="st-title">
          {isNew ? <i className="st-new" title="New since you last looked" /> : null}
          <a className="st-link" href={item.url} target="_blank" rel="noopener" draggable={false} onClick={() => onOpen(item)}>
            {item.title}
          </a>
        </h3>
        {item.summary && variant !== 'tile' ? <p className="st-sum">{item.summary}</p> : null}
        {hasCov ? <CovButton item={item} open={cov} onToggle={onCov} long /> : null}
        <div className="st-meta">
          <Favicon item={item} size={variant === 'lead' ? 18 : 16} />
          <span className="st-src">{item.source}</span>
          {reddit && item.score != null ? (
            <span className="st-score" aria-label={`${item.score} upvotes`}>
              <Icon name="upvote" size={13} />
              {NL.fmtCount(item.score)}
            </span>
          ) : null}
          {reddit && item.comments ? (
            <span className="st-score" aria-label={`${item.comments} comments`}>
              <Icon name="comment" size={13} />
              {NL.fmtCount(item.comments)}
            </span>
          ) : null}
          {item.date && !(reddit && item.score != null) ? <span className="st-time">{NL.timeAgo(item.date)}</span> : null}
          <span className="grow" />
          <button className={`st-btn ${saved ? 'on' : ''}`} aria-label={saved ? 'Remove from saved' : 'Save for later'} aria-pressed={saved} onClick={() => onSave(item)}>
            <Icon name="bookmark" size={17} />
          </button>
          <button className="st-btn st-more" aria-label={`More options for “${item.title.slice(0, 60)}”`} onClick={() => onMore(item)}>
            <Icon name="more" size={17} />
          </button>
        </div>
        {hasCov && cov ? <CovList item={item} /> : null}
      </div>
    </article>
  );
}

// A list row you can swipe: right → onRight, left → onLeft. Unlike the to-do rows, a swipe can start on the link
// (the whole row is one); a swipe never opens it.
function SwipeStory({ onRight, onLeft, rightLabel = 'Save', leftLabel = 'Hide', children }) {
  const [dx, setDx] = useState(0);
  const st = useRef(null);
  const swiped = useRef(false);
  const TH = 80;
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, input, .cov-list')) return;
    st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: false };
    swiped.current = false;
  };
  const move = (e) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.drag) {
      if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) {
        st.current = null;
        return;
      }
      if (Math.abs(mx) > 10) {
        s.drag = true;
        swiped.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* fine */
        }
      }
    }
    if (s.drag) setDx(Math.max(onLeft ? -140 : 0, Math.min(onRight ? 140 : 0, mx)));
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    if (!s || !s.drag) return setDx(0);
    const v = dx;
    setDx(0);
    if (v >= TH && onRight) onRight();
    else if (v <= -TH && onLeft) onLeft();
  };
  return (
    <li
      className="swipe nsw"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => ((st.current = null), setDx(0))}
      onClickCapture={(e) => {
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      <div className={`swipe-bg ${dx > 0 ? 'go-right save' : dx < 0 ? 'go-left' : ''} ${Math.abs(dx) >= TH ? 'armed' : ''}`} aria-hidden="true">
        <span>{rightLabel}</span>
        <span>{leftLabel}</span>
      </div>
      <div className={`swipe-fg ${dx ? 'dragging' : ''}`} style={{ transform: dx ? `translateX(${dx}px)` : undefined }}>
        {children}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- sheets
function StorySheet({ item, saved, dark, onClose, onSave, onHide, onMute, onOpen, onToast }) {
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: item.title, url: item.url });
      else {
        await navigator.clipboard.writeText(item.url);
        onToast({ text: 'Link copied' });
      }
    } catch {
      /* cancelled */
    }
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet story-sheet" role="dialog" aria-label="Story options" onClick={(e) => e.stopPropagation()} style={secStyle(item.sec, dark)}>
        <div className="row-between">
          <div className="st-meta">
            <Favicon item={item} size={18} />
            <span className="st-src">{item.source}</span>
            {item.date ? <span className="st-time">{NL.timeAgo(item.date)}</span> : null}
          </div>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <h2 className="ss-title">{item.title}</h2>
        {item.summary ? <p className="ss-sum">{item.summary}</p> : null}
        <div className="ss-acts">
          <a className="btn primary" href={item.url} target="_blank" rel="noopener" onClick={() => (onOpen(item), onClose())}>
            <Icon name="ext" size={16} /> Open story
          </a>
          <button className="btn" onClick={() => (onSave(item), onClose())}>
            <Icon name="bookmark" size={16} /> {saved ? 'Remove from saved' : 'Save for later'}
          </button>
          <button className="btn" onClick={() => (onHide(item), onClose())}>
            Hide this story
          </button>
          {item.source ? (
            <button className="btn" onClick={() => (onMute(item), onClose())}>
              Mute {item.source}
            </button>
          ) : null}
          <button className="btn" onClick={share}>
            {typeof navigator !== 'undefined' && navigator.share ? 'Share…' : 'Copy link'}
          </button>
        </div>
        {item.related && item.related.length ? (
          <div className="ss-cov">
            <h3 className="ss-h">Also covering this</h3>
            <ul className="cov-list">
              {item.related.map((x, n) => (
                <li key={n}>
                  <a href={x.url} target="_blank" rel="noopener">
                    <Favicon item={x} size={14} />
                    <b>{x.source}</b>
                    <span>{x.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TermList({ title, hint, list, placeholder, prefs, mutatePrefs }) {
  const [v, setV] = useState('');
  const items = (prefs && prefs[list]) || [];
  const add = async (e) => {
    e.preventDefault();
    if (!v.trim()) return;
    await mutatePrefs((d) => NL.addTerm(d, list, v));
    setV('');
  };
  return (
    <div className="tune-group">
      <h3 className="ss-h">{title}</h3>
      <p className="muted small">{hint}</p>
      {items.length ? (
        <div className="term-chips">
          {items.map((t) => (
            <span key={t} className="term">
              {t}
              <button aria-label={`Remove ${t}`} onClick={() => mutatePrefs((d) => NL.removeTerm(d, list, t))}>
                <Icon name="close" size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <form className="term-add" onSubmit={add}>
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        <button className="btn" type="submit" disabled={!v.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

const KIND_LABEL = { stock: 'Your stocks', game: 'Games you’re playing', release: 'Your countdowns', mcu: 'Doomsday watch list', car: 'Your car', place: 'Near you', follow: 'Topics you follow' };
function TuneSheet({ prefs, mutatePrefs, topics, onClose }) {
  const groups = {};
  topics
    .filter((t) => t.kind !== 'follow')
    .forEach((t) => (groups[t.kind] = groups[t.kind] || []).push(t.label));
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet tune-sheet" role="dialog" aria-label="Tune your news" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 className="card-title">Tune your news</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <TermList title="Topics you follow" hint="Stories that mention these show up in For you." list="follow" placeholder="Add a topic, like Knicks or Nintendo" prefs={prefs} mutatePrefs={mutatePrefs} />
        <TermList title="Muted words" hint="Stories with these in the headline or summary are hidden everywhere, search included." list="muteWords" placeholder="Add a word or phrase" prefs={prefs} mutatePrefs={mutatePrefs} />
        <TermList title="Muted outlets" hint="By name (Newsday) or web address (nypost.com). You can also mute one from a story’s ⋯ menu." list="muteSources" placeholder="Add an outlet" prefs={prefs} mutatePrefs={mutatePrefs} />
        {prefs && prefs.hidden.length ? (
          <div className="tune-group row-between">
            <span className="muted small">
              {prefs.hidden.length} hidden stor{prefs.hidden.length === 1 ? 'y' : 'ies'}
            </span>
            <button className="btn quiet small" onClick={() => mutatePrefs((d) => (d.hidden = []))}>
              Unhide all
            </button>
          </div>
        ) : null}
        <details className="tune-group fy-explain">
          <summary className="ss-h">What For you looks for</summary>
          <ul className="fy-list">
            {Object.entries(groups).map(([k, v]) => (
              <li key={k}>
                <b>{KIND_LABEL[k]}</b> {v.join(' · ')}
              </li>
            ))}
          </ul>
          <p className="muted small">Built on this device from your budget’s holdings, the Entertainment tab, your car and your home town, and matched against the news here. None of it is sent anywhere.</p>
        </details>
        <button className="btn primary block" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the page
export function NewsPage({ news, read, markRead, prefs, mutatePrefs, data, fun, auto, home, onToast, dark }) {
  const [sec, setSec] = useState(() => {
    const t = lsGet('dash.newsTab', 'foryou');
    return NL.SECTION[t] ? t : 'foryou';
  });
  const [dir, setDir] = useState(0);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [tune, setTune] = useState(false);
  const [menuItem, setMenuItem] = useState(null);
  const [sub, setSub] = useState('all');
  const [limit, setLimit] = useState(24);
  const [cov, setCov] = useState(() => new Set());
  const [stuck, setStuck] = useState(false);
  const chipsRef = useRef(null);
  const sentinel = useRef(null);
  // When you last looked at each section. Before the first visit: the last six hours count as new.
  const [seenMap, setSeenMap] = useState(() => {
    const m = lsGet(SEEN_KEY, null);
    if (m && typeof m === 'object') return m;
    const t = new Date(Date.now() - 6 * 3600e3).toISOString();
    return Object.fromEntries(ORDER.map((k) => [k, t]));
  });
  const [since, setSince] = useState(null);
  useEffect(() => {
    setSince(seenMap[sec] || null);
    const n = { ...seenMap, [sec]: new Date().toISOString() };
    lsSet(SEEN_KEY, n);
    setSeenMap(n);
  }, [sec]);

  const topics = useMemo(() => NL.buildTopics({ data, profiles: readProfiles(), fun, auto, home, follow: prefs ? prefs.follow : [] }), [data, fun, auto, home, prefs && prefs.follow.join('\n')]);
  const lists = useMemo(() => {
    const o = {};
    NL.SECTIONS.forEach((s) => s.keys && (o[s.key] = NL.visible(NL.sectionItems(news, s.key), prefs)));
    o.foryou = NL.forYou(news, topics, prefs);
    o.saved = prefs ? prefs.saved.map((x) => ({ ...x, sec: x.sec || 'saved' })) : [];
    return o;
  }, [news, prefs, topics]);
  const counts = useMemo(() => Object.fromEntries(ORDER.map((k) => [k, k === 'saved' ? 0 : NL.newSince(lists[k] || [], seenMap[k])])), [lists, seenMap]);

  const go = (k, d) => {
    if (k === sec) return;
    setDir(d != null ? d : ORDER.indexOf(k) > ORDER.indexOf(sec) ? 1 : -1);
    setSec(k);
    setLimit(24);
    setSub('all');
    lsSet('dash.newsTab', k);
    const bar = chipsRef.current;
    if (bar) {
      const chip = bar.querySelector(`[data-sec="${k}"]`);
      if (chip && chip.scrollIntoView) chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      const top = sentinel.current ? sentinel.current.getBoundingClientRect().top + window.scrollY - 8 : 0;
      if (window.scrollY > top) window.scrollTo(0, top);
    }
  };
  const step = (d) => {
    const i = ORDER.indexOf(sec) + d;
    if (i >= 0 && i < ORDER.length) go(ORDER[i], d);
  };
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const on = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) || document.querySelector('.sheet-bg')) return;
      if (e.key === 'ArrowRight') stepRef.current(1);
      else if (e.key === 'ArrowLeft') stepRef.current(-1);
      else if (e.key === '/') {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  // the section chips stick to the top while you scroll; they get a pane of glass once they do
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // swipe sideways on the page (not on a story row) to change section
  const sw = useRef(null);
  const swipe = {
    onTouchStart: (e) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || e.target.closest('.nsw, .news-chips, .reddit-subs, input, textarea, select, button, .cov-list, .sheet')) return (sw.current = null);
      sw.current = { x: t.clientX, y: t.clientY, at: Date.now() };
    },
    onTouchEnd: (e) => {
      const s = sw.current;
      sw.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - s.at < 800) stepRef.current(dx < 0 ? 1 : -1);
    },
  };

  // ---- actions (saves and hides go to your account, so they follow you to other devices)
  const saved = (i) => NL.isSaved(prefs, i.id);
  const save = async (i) => {
    if (saved(i)) {
      let r = null;
      await mutatePrefs((d) => (r = NL.unsaveStory(d, i.id)));
      onToast({ text: 'Removed from saved', undo: async () => (r && (await mutatePrefs((d) => NL.restoreSaved(d, r.item, r.index))), onToast({ text: 'Back in saved' })) });
    } else {
      await mutatePrefs((d) => NL.saveStory(d, i, i.sec === 'saved' ? null : i.sec));
      onToast({ text: 'Saved for later', undo: async () => (await mutatePrefs((d) => NL.unsaveStory(d, i.id)), onToast({ text: 'Not saved' })) });
    }
  };
  const hide = async (i) => {
    await mutatePrefs((d) => NL.hideStory(d, i.id));
    onToast({ text: 'Story hidden', undo: async () => (await mutatePrefs((d) => NL.unhideStory(d, i.id)), onToast({ text: 'Unhidden' })) });
  };
  const mute = async (i) => {
    const name = i.source;
    await mutatePrefs((d) => NL.addTerm(d, 'muteSources', name));
    onToast({ text: `Muted ${name}`, undo: async () => (await mutatePrefs((d) => NL.removeTerm(d, 'muteSources', name)), onToast({ text: `Unmuted ${name}` })) });
  };
  const open = (i) => markRead(i.id);
  const toggleCov = (id) =>
    setCov((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const searchOn = searching && q.trim().length >= 2;
  const results = useMemo(() => (searchOn ? NL.searchNews(news, prefs, q) : []), [searchOn, news, prefs, q]);
  const S = NL.SECTION[sec];
  let items = searchOn ? results : lists[sec] || [];
  if (!searchOn && sec === 'reddit' && sub !== 'all') items = items.filter((i) => (i.from || 'popular') === sub);
  const isNew = (i) => !!since && NL.stampOf(i) > since && sec !== 'saved';
  const newN = searchOn || sec === 'saved' ? 0 : items.filter(isNew).length;
  const failed = news && news.sources ? Object.values(news.sources).filter((s) => s && !s.ok && s.section && (NL.SECTION_OF[s.section] || s.section) === sec && s.name) : [];

  const card = (i, variant, extra = {}) => (
    <Story
      key={i.id}
      item={i}
      variant={variant}
      kicker={searchOn ? NL.SECTION[i.sec] ? NL.SECTION[i.sec].label : '' : sec === 'foryou' ? i.why : sec === 'saved' && i.sec && NL.SECTION[i.sec] ? NL.SECTION[i.sec].label : ''}
      isNew={isNew(i)}
      read={read.has(i.id)}
      saved={saved(i)}
      dark={dark}
      onOpen={open}
      onSave={save}
      onMore={setMenuItem}
      cov={cov.has(i.id)}
      onCov={() => toggleCov(i.id)}
      {...extra}
    />
  );
  const row = (i) =>
    sec === 'saved' && !searchOn ? (
      <SwipeStory key={i.id} onLeft={() => save(i)} leftLabel="Remove">
        {card(i, 'row')}
      </SwipeStory>
    ) : (
      <SwipeStory key={i.id} onRight={() => !saved(i) && save(i)} onLeft={() => hide(i)} rightLabel={saved(i) ? 'Saved' : 'Save'}>
        {card(i, 'row')}
      </SwipeStory>
    );

  // front page: lead, four tiles, then the list (with a line where the stories you've seen begin)
  let body = null;
  if (!news) body = <Skeleton lines={6} />;
  else if (news.error && !searchOn && sec !== 'saved')
    body = (
      <div className="card news-empty">
        <p className="empty">The news feed hasn’t been generated yet.</p>
      </div>
    );
  else if (!items.length)
    body = (
      <div className="card news-empty">
        {searchOn ? (
          <p className="empty">No stories match “{q.trim()}”.</p>
        ) : sec === 'saved' ? (
          <p className="empty">Nothing saved yet. Swipe a story right, or tap its bookmark, to keep it here. Saved stories show up on all your devices.</p>
        ) : sec === 'foryou' ? (
          <>
            <p className="empty">Nothing about your stocks, games, watch list, car or town right now.</p>
            <button className="btn small" onClick={() => setTune(true)}>
              Follow a topic
            </button>
          </>
        ) : (
          <p className="empty">Nothing here yet. This section fills in on the next update, within about 30 minutes.</p>
        )}
      </div>
    );
  else if (searchOn || sec === 'saved' || sec === 'reddit') {
    body = (
      <div className="card news-card">
        <ul className="list news-list">{items.slice(0, limit).map(row)}</ul>
      </div>
    );
  } else {
    const li = NL.pickLead(items, S.ranked);
    const lead = items[li];
    const rest = items.filter((_, n) => n !== li);
    const tiles = rest.slice(0, 4);
    const list = rest.slice(4, 4 + limit);
    const cut = since && !S.ranked ? list.findIndex((i) => !isNew(i)) : -1;
    const showCut = cut > 0 || (cut === 0 && newN > 0);
    body = (
      <>
        <div className="news-front">
          {card(lead, 'lead')}
          {tiles.map((i) => card(i, 'tile'))}
        </div>
        {list.length ? (
          <div className="card news-card">
          <ul className="list news-list">
            {list.map((i, n) => (
              <React.Fragment key={i.id}>
                {showCut && n === cut ? (
                  <li className="since-line" role="separator">
                    <span>You’re caught up</span>
                  </li>
                ) : null}
                {row(i)}
              </React.Fragment>
            ))}
          </ul>
          </div>
        ) : null}
      </>
    );
  }
  const total = searchOn || sec === 'saved' || sec === 'reddit' ? items.length : Math.max(0, items.length - 5);

  return (
    <div className="home news-page news2">
      <header className="page-head news-head">
        <div className="grow">
          <h1 className="page-title">News</h1>
          <div className="muted">{news && news.generated ? `Updated ${NL.timeAgo(news.generated)}` : news && news.error ? 'Not generated yet' : 'Loading…'}</div>
        </div>
        <div className="news-tools">
          <button
            className={`icon-btn ${searching ? 'on' : ''}`}
            aria-label="Search news"
            aria-expanded={searching}
            onClick={() => {
              setSearching((s) => !s);
              setQ('');
            }}
          >
            <Icon name="search" size={18} />
          </button>
          <button className="icon-btn" aria-label="Tune your news" onClick={() => setTune(true)}>
            <Icon name="sliders" size={18} />
          </button>
        </div>
      </header>
      {searching ? (
        <form className="news-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <Icon name="search" size={18} />
          <input
            className="input"
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQ(''), setSearching(false))}
            placeholder="Search every section"
            aria-label="Search every section"
            enterKeyHint="search"
          />
          {searchOn ? <span className="muted small num">{results.length}</span> : null}
        </form>
      ) : null}
      <div ref={sentinel} className="chips-sentinel" aria-hidden="true" />
      <div ref={chipsRef} className={`news-chips ${stuck ? 'stuck' : ''} ${searchOn ? 'dim' : ''}`} role="tablist" aria-label="News sections">
        {NL.SECTIONS.map((s) => {
          const n = s.key === 'saved' ? (prefs ? prefs.saved.length : 0) : counts[s.key];
          return (
            <button
              key={s.key}
              data-sec={s.key}
              role="tab"
              aria-selected={sec === s.key && !searchOn}
              className={`nchip ${sec === s.key ? 'on' : ''}`}
              style={secStyle(s.key, dark)}
              onClick={() => {
                if (searchOn) {
                  setQ('');
                  setSearching(false);
                }
                go(s.key);
              }}
            >
              <i className="nchip-dot" aria-hidden="true" />
              {s.label}
              {n ? (
                <span className="nchip-n" aria-label={s.key === 'saved' ? `${n} saved` : `${n} new`}>
                  {n > 99 ? '99+' : n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <section className={`news-body ${dir > 0 ? 'from-right' : dir < 0 ? 'from-left' : ''}`} key={searchOn ? 'search' : sec} style={secStyle(searchOn ? 'top' : sec, dark)} {...swipe} aria-live="polite">
        <div className="sec-head">
          <h2 className="sec-title">
            <i aria-hidden="true" />
            {searchOn ? `Results for “${q.trim()}”` : S.label}
          </h2>
          <span className="muted small">
            {searchOn
              ? `${results.length} ${results.length === 1 ? 'story' : 'stories'} across every section`
              : sec === 'saved'
                ? `${items.length} saved`
                : newN
                  ? `${newN} new since ${NL.clockLabel(since)}`
                  : since && items.length
                    ? `Nothing new since ${NL.clockLabel(since)}`
                    : ''}
          </span>
        </div>
        {sec === 'reddit' && !searchOn ? (
          <div className="reddit-subs chips-row" role="tablist" aria-label="Subreddits">
            {NL.REDDIT_SUBS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={sub === k} className={`chip ${sub === k ? 'on' : ''}`} onClick={() => (setSub(k), setLimit(24))}>
                {l}
              </button>
            ))}
          </div>
        ) : null}
        {body}
        {total > limit ? (
          <button className="btn quiet block" onClick={() => setLimit(limit + 24)}>
            Show more
          </button>
        ) : null}
        {!searchOn ? (
          <p className="muted small note news-note">
            {S.note}
            {failed.length ? ` · ${failed.map((s) => s.name).join(', ')} didn’t answer on the last update, so ${failed.length === 1 ? 'its' : 'their'} last good stories are shown` : ''}
          </p>
        ) : null}
        {sec !== 'saved' && !searchOn ? <p className="muted small swipe-tip">Swipe the page to change section · swipe a story right to save it, left to hide it</p> : null}
      </section>
      {tune ? <TuneSheet prefs={prefs} mutatePrefs={mutatePrefs} topics={topics} onClose={() => setTune(false)} /> : null}
      {menuItem ? <StorySheet item={menuItem} saved={saved(menuItem)} dark={dark} onClose={() => setMenuItem(null)} onSave={save} onHide={hide} onMute={mute} onOpen={open} onToast={onToast} /> : null}
    </div>
  );
}
