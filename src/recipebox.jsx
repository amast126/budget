// Cooking → the recipe box: search, the box itself, a full page for each recipe (amounts for any number of
// servings, the steps, cook mode with timers), adding and editing recipes, and importing recipe cards.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { PlateArt } from './plate-art.jsx';
import * as RB from './recipebox-logic.js';
import { photoFromFile, decodes } from './recipe-photos.js';
import { kitchenKeys, match, addGrocery, missingNames, inPlan, togglePlan, imageUrl, findRecipes, label } from './cooking-logic.js';
import { covers, normalize, STAPLES } from './ingredients.mjs';
import { dateLabel } from './budget-logic.js';

// What recipe views need from the app: the photo store and the weekly Budget Bytes file (for its image paths).
export const BoxCtx = createContext({ photos: null, recipes: null });

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export function mins(m) {
  if (!m) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}
const money = (n) => (n == null ? null : `$${Number(n).toFixed(2)}`);
const ls = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  },
};
function useStored(key, initial) {
  const [v, setV] = useState(() => ls.get(key, initial));
  return [
    v,
    (x) => {
      setV(x);
      ls.set(key, x);
    },
  ];
}

// ---------------------------------------------------------------- opening a recipe (#/cooking?r=<id>)
// The recipe is part of the address, so Back closes it and Home can link straight to one. A recipe opened from
// inside the app marks its history entry, and the page's own Back button steps back only from a marked entry;
// one opened from a link from outside (or reached with the browser's Back) goes to the Cooking tab instead.
let backScroll = 0;
export const recipeHref = (id) => `#/cooking?r=${encodeURIComponent(id)}`;
export const rememberScroll = () => {
  backScroll = window.scrollY;
};
export const takeScroll = () => backScroll;
export function openRecipe(id) {
  rememberScroll();
  location.hash = recipeHref(id);
  try {
    history.replaceState({ ...(history.state || {}), rb: 1 }, '');
  } catch {
    /* no history API: Back just goes to the Cooking tab */
  }
}
// For links to a recipe: plain clicks open it the app's way; clicks for a new tab are left alone.
export const openLink = (id, before) => (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  if (before) before();
  noteRecent(id);
  openRecipe(id);
};
export function closeRecipe() {
  if (history.state && history.state.rb) history.back();
  else location.replace('#/cooking');
}
const readParam = () => {
  const q = location.hash.split('?')[1] || '';
  const m = q.match(/(?:^|&)r=([^&]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
};
export function useRecipeParam() {
  const [v, setV] = useState(readParam);
  useEffect(() => {
    const on = () => setV(readParam());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return v;
}
export function noteRecent(id) {
  const list = ls.get('dash.rb.recent', []).filter((x) => x !== id);
  ls.set('dash.rb.recent', [id, ...list].slice(0, 8));
}

// ---------------------------------------------------------------- photos
const bigFromThumb = (p) => (p ? p.replace(/-160x160(\.\w+)$/, '-400x300$1') : null);
export function RecipeImg({ r, kind = 'card', className = '', eager = false }) {
  const { photos, recipes } = useContext(BoxCtx);
  const ref = useRef(null);
  const stamp = r && r.photo;
  const peek = () => (stamp && photos ? photos.peek(kind, r.id, stamp) || (kind === 'full' ? photos.peek('card', r.id, stamp) : undefined) : undefined);
  const [src, setSrc] = useState(peek);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (!stamp || !photos) return setSrc(undefined);
    const now = photos.peek(kind, r.id, stamp);
    if (now) return setSrc(now);
    setSrc(peek());
    let live = true;
    const load = () =>
      photos.get(kind, r.id, stamp).then((u) => {
        if (!live) return;
        if (u) setSrc(u);
        else if (kind === 'full') photos.get('card', r.id, stamp).then((c) => live && (c ? setSrc(c) : setFailed(true)));
        else setFailed(true);
      });
    if (eager || typeof IntersectionObserver === 'undefined' || !ref.current) {
      load();
      return () => (live = false);
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: '400px' }
    );
    io.observe(ref.current);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [r && r.id, stamp, kind, photos]);
  if (!r) return null;
  if (stamp && !failed)
    return (
      <span ref={ref} className={`rimg ${className} ${src ? 'on' : 'loading'}`}>
        {src ? <img src={src} alt="" decoding="async" onError={() => setFailed(true)} /> : null}
      </span>
    );
  const ext = !stamp ? r.imgUrl || (r.image || r.thumb ? imageUrl(recipes, r.image || bigFromThumb(r.thumb)) : null) : null;
  if (ext && !failed)
    return (
      <span className={`rimg ${className} on`}>
        <img src={ext} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      </span>
    );
  return (
    <span className={`rimg art ${className}`}>
      <PlateArt r={r} />
    </span>
  );
}

// ---------------------------------------------------------------- the hero: title, search, and a few of your dishes
const SAMPLE_PLATES = [
  { id: 'sample-1', title: 'Rice bowl', subtitle: 'with salmon and broccoli' },
  { id: 'sample-2', title: 'Pasta', subtitle: 'with chicken and spinach' },
  { id: 'sample-3', title: 'Tacos', subtitle: 'with shrimp and lime' },
  { id: 'sample-4', title: 'Steak', subtitle: 'with potatoes and green beans' },
];
function dayPart(d = new Date()) {
  const h = d.getHours();
  const part = h < 5 ? 'night' : h < 11 ? 'morning' : h < 16 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  return `${d.toLocaleDateString(undefined, { weekday: 'long' })} ${part}`;
}
function collageOf(box) {
  const rs = box ? box.recipes : [];
  const withPhoto = rs.filter((r) => r.photo);
  const pool = withPhoto.length >= 3 ? withPhoto : rs;
  const score = (r) => (r.fav ? 100 : 0) + (r.made || 0) * 3 + (r.photo ? 20 : 0);
  const top = [...pool].sort((a, b) => score(b) - score(a) || String(b.added || '').localeCompare(String(a.added || '')));
  // a different lead dish each day
  const day = Math.floor(Date.now() / 864e5);
  const rot = top.length ? day % Math.min(top.length, 6) : 0;
  const picked = [...top.slice(rot), ...top.slice(0, rot)].slice(0, 4);
  return picked.length >= 3 ? picked : [...picked, ...SAMPLE_PLATES].slice(0, 4);
}
export function CookHero({ box, q, setQ, onEnter, chips, compact }) {
  const tiles = useMemo(() => collageOf(box), [box]);
  const inputRef = useRef(null);
  // "/" jumps to the search on a keyboard
  useEffect(() => {
    const on = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || /input|textarea|select/i.test((document.activeElement || {}).tagName || '')) return;
      if (!inputRef.current || inputRef.current.offsetParent === null) return; // hidden under an open recipe
      e.preventDefault();
      inputRef.current && inputRef.current.focus();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  return (
    <section className={`card cook-hero ${compact ? 'compact' : ''}`}>
      <div className="ch-collage" aria-hidden="true">
        {tiles.map((r, i) => (
          <RecipeImg key={r.id} r={r} className={`ch-tile t${i}`} />
        ))}
      </div>
      <div className="ch-body">
        <div className="ch-kicker">
          <Icon name="pot" size={15} /> {dayPart()}
        </div>
        <h1 className="page-title ch-title">What’s cooking?</h1>
        <form
          className="ch-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onEnter();
          }}
        >
          <Icon name="search" size={19} />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
            placeholder="Search your recipes or ingredients"
            aria-label="Search your recipes"
          />
          {q ? (
            <button type="button" className="ch-clear" aria-label="Clear search" onClick={() => (setQ(''), inputRef.current && inputRef.current.focus())}>
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </form>
        {chips && chips.length ? (
          <div className="ch-chips">
            {chips.map((c) =>
              c.on ? (
                <button key={c.k} type="button" className={`ch-chip ${c.hot ? 'hot' : ''}`} onClick={c.on}>
                  {c.b != null ? <b>{c.b}</b> : null} {c.t}
                </button>
              ) : c.href ? (
                <a key={c.k} className={`ch-chip ${c.hot ? 'hot' : ''}`} href={c.href} onClick={c.rid ? openLink(c.rid) : undefined}>
                  {c.b != null ? <b>{c.b}</b> : null} {c.t}
                </a>
              ) : (
                <span key={c.k} className="ch-chip">
                  {c.b != null ? <b>{c.b}</b> : null} {c.t}
                </span>
              )
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- search results
function Hl({ text, q }) {
  return RB.highlight(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.t}</mark> : <React.Fragment key={i}>{p.t}</React.Fragment>));
}
function metaBits(r) {
  return [mins(r.minutes), RB.calOf(r) != null ? `${Math.round(RB.calOf(r))} cal` : null, r.source].filter(Boolean);
}
const fold = RB.fold;
export function searchAll(box, recipes, q) {
  const mine = RB.searchRecipes(box ? box.recipes : [], q);
  if (fold(q).trim().length < 3 || !recipes) return { mine, web: [] };
  const saved = new Set((box ? box.recipes : []).filter((r) => r.webId != null).map((r) => String(r.webId)));
  const pool = [...(recipes.picks || []), ...(recipes.pool || [])].filter((r, i, a) => !saved.has(String(r.id)) && a.findIndex((x) => x.id === r.id) === i);
  const web = findRecipes(pool, { q, sort: 'popular' })
    .slice(0, 4)
    .map((x) => x.r);
  return { mine, web };
}
export function SearchResults({ q, box, recipes, onAdd }) {
  const { mine, web } = useMemo(() => searchAll(box, recipes, q), [box, recipes, q]);
  const open = (id) => openLink(id, () => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  return (
    <section className="card cook-results" aria-live="polite">
      <div className="card-head">
        <h2 className="card-title">{mine.length ? `${plural(mine.length, 'recipe')} in your box` : 'Nothing in your recipe box'}</h2>
      </div>
      {mine.length ? (
        <ul className="rs-list">
          {mine.map(({ r, via }) => (
            <li key={r.id}>
              <a className="rs" href={recipeHref(r.id)} onClick={open(r.id)}>
                <RecipeImg r={r} className="rs-img" />
                <span className="grow">
                  <span className="rs-title">
                    <Hl text={r.title} q={q} />
                  </span>
                  {r.subtitle ? (
                    <span className="rs-sub">
                      <Hl text={r.subtitle} q={q} />
                    </span>
                  ) : null}
                  <span className="rs-meta">
                    {via ? (
                      <>
                        Uses <Hl text={via.toLowerCase()} q={q} />
                        {metaBits(r).length ? ' · ' : ''}
                      </>
                    ) : null}
                    {metaBits(r).join(' · ')}
                  </span>
                </span>
                <Icon name="chev" size={18} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">
          No saved recipe matches “{q.trim()}”.{' '}
          <button className="linkish" onClick={onAdd}>
            Add a recipe
          </button>
        </p>
      )}
      {web.length ? (
        <>
          <h3 className="k-head rs-web-head">Ideas from Budget Bytes</h3>
          <ul className="rs-list">
            {web.map((r) => (
              <li key={r.id}>
                <a className="rs" href={recipeHref(`bb-${r.id}`)} onClick={open(`bb-${r.id}`)}>
                  <RecipeImg r={r} className="rs-img" />
                  <span className="grow">
                    <span className="rs-title">
                      <Hl text={r.title} q={q} />
                    </span>
                    <span className="rs-meta">{[r.perServing != null ? `${money(r.perServing)}/serving` : null, mins(r.minutes)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Icon name="chev" size={18} />
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

// Recently opened recipes, under the search when it's empty.
export function RecentStrip({ box }) {
  const ids = ls.get('dash.rb.recent', []);
  const list = ids.map((id) => RB.findRecipe(box, id)).filter(Boolean).slice(0, 6);
  if (list.length < 2) return null;
  return (
    <div className="recent-strip" aria-label="Recently opened">
      <span className="rst-l">Jump back in</span>
      {list.map((r) => (
        <a key={r.id} className="rst" href={recipeHref(r.id)} onClick={openLink(r.id)}>
          <RecipeImg r={r} className="rst-img" />
          <span>{r.title}</span>
        </a>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the box
function Tile({ r, m }) {
  const bits = [RB.calOf(r) != null ? `${Math.round(RB.calOf(r))} cal` : null, r.source].filter(Boolean);
  return (
    <li className="rb-tile">
      <a href={recipeHref(r.id)} onClick={openLink(r.id)}>
        <span className="rb-photo">
          <RecipeImg r={r} />
          {r.minutes ? (
            <span className="rb-time">
              <Icon name="clock" size={13} /> {mins(r.minutes)}
            </span>
          ) : null}
          {r.fav ? (
            <span className="rb-fav" aria-label="Favorite">
              <Icon name="fav" size={15} fill />
            </span>
          ) : null}
        </span>
        <span className="rb-body">
          <span className="rb-title">{r.title}</span>
          {r.subtitle ? <span className="rb-sub">{r.subtitle}</span> : null}
          <span className="rb-meta">
            {bits.join(' · ')}
            {m && m.total && !m.missing.length ? <span className="rb-ok"> · have it all</span> : null}
          </span>
        </span>
      </a>
    </li>
  );
}
const PAGE = 24;
export function RecipeBoxSection({ box, data, onAdd, onImport }) {
  const [filter, setFilter] = useStored('dash.rb.filter', 'all');
  const [sort, setSort] = useStored('dash.rb.sort', 'recent');
  const [limit, setLimit] = useState(PAGE);
  const filters = useMemo(() => RB.boxFilters(box.recipes), [box.recipes]);
  const f = filters.some(([k]) => k === filter) ? filter : 'all';
  const shown = useMemo(() => RB.sortRecipes(RB.applyFilter(box.recipes, f), sort), [box.recipes, f, sort]);
  const kKeys = useMemo(() => (data ? kitchenKeys(data) : []), [data && data.kitchen]);
  useEffect(() => setLimit(PAGE), [f, sort]);
  return (
    <section className="card rb">
      <div className="card-head wrap">
        <h2 className="card-title">Recipe box</h2>
        <div className="rb-actions">
          <button className="btn small" onClick={onImport}>
            <Icon name="upload" size={16} /> Import
          </button>
          <button className="btn primary small" onClick={onAdd}>
            <Icon name="plus" size={16} /> Add recipe
          </button>
        </div>
      </div>
      {box.recipes.length === 0 ? (
        <div className="rb-empty">
          <div className="rb-empty-art" aria-hidden="true">
            {SAMPLE_PLATES.slice(0, 3).map((r, i) => (
              <RecipeImg key={r.id} r={r} className={`rbe t${i}`} />
            ))}
          </div>
          <p>
            <b>Your recipe box is empty.</b> Import your recipe cards, or add a recipe of your own. Everything you save here is searchable from the bar above, with the full ingredients and steps.
          </p>
        </div>
      ) : (
        <>
          {filters.length > 1 ? (
            <div className="chips rb-filters" role="group" aria-label="Show">
              {filters.map(([k, l, n]) => (
                <button key={k} className={`chip ${f === k ? 'on' : ''}`} aria-pressed={f === k} onClick={() => setFilter(k)}>
                  {k === 'fav' ? <Icon name="fav" size={13} fill /> : null} {l} <span className="chip-n">{n}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="row-between rb-count">
            <span className="muted small">{plural(shown.length, 'recipe')}</span>
            <select className="inline-select small" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort recipes">
              {RB.BOX_SORT.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <ul className="rb-grid">
            {shown.slice(0, limit).map((r) => (
              <Tile key={r.id} r={r} m={kKeys.length ? match(RB.asCookable(r), kKeys) : null} />
            ))}
          </ul>
          {shown.length > limit ? (
            <button className="btn quiet block" onClick={() => setLimit(limit + PAGE * 2)}>
              Show more ({shown.length - limit} left)
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- a recipe's page
function Servings({ r, value, onChange }) {
  const base = r.servings;
  const step = base ? 1 : 0.5;
  const show = (n) => String(Math.round(n * 100) / 100);
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const clamp = (n) => Math.min(RB.MAX_SERVINGS, Math.max(base ? 1 : 0.25, n));
  const bump = (d) => onChange(clamp(Math.round((value + d) / step) * step));
  return (
    <div className="serv">
      <div className="serv-l">
        <Icon name="users" size={20} />
        <span>
          <b>{base ? 'Servings' : 'Batch'}</b>
          <span className="serv-sub">
            {base && value !== base ? (
              <button type="button" className="linkish" onClick={() => onChange(base)}>
                Back to {base}
              </button>
            ) : !base && value !== 1 ? (
              <button type="button" className="linkish" onClick={() => onChange(1)}>
                Back to as written
              </button>
            ) : base ? (
              'as written'
            ) : (
              'times the recipe'
            )}
          </span>
        </span>
      </div>
      <div className="serv-ctl">
        <button type="button" aria-label={base ? 'Fewer servings' : 'Smaller batch'} onClick={() => bump(-step)} disabled={value <= (base ? 1 : 0.5)}>
          <Icon name="minus" size={18} />
        </button>
        <input
          inputMode="decimal"
          value={text}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(String(e.target.value).replace(',', '.'));
            if (Number.isFinite(n) && n > 0 && n <= RB.MAX_SERVINGS) onChange(n);
          }}
          onBlur={() => setText(show(value))}
          aria-label={base ? 'Number of servings' : 'Times the recipe'}
        />
        {base ? null : <span className="serv-x">×</span>}
        <button type="button" aria-label={base ? 'More servings' : 'Bigger batch'} onClick={() => bump(step)} disabled={value >= RB.MAX_SERVINGS}>
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
}

function StepText({ text, factor }) {
  return RB.stepParts(text, factor).map((p, i) =>
    p.t != null ? (
      <React.Fragment key={i}>{p.t}</React.Fragment>
    ) : (
      <b key={i} className={`amt ${p.scaled ? 'scaled' : ''}`}>
        {p.q}
      </b>
    )
  );
}
const servKey = 'dash.rb.serv';
function useServings(r) {
  const [v, setV] = useState(() => {
    const saved = ls.get(servKey, {})[r.id];
    return saved > 0 ? saved : r.servings || 1;
  });
  useEffect(() => {
    const saved = ls.get(servKey, {})[r.id];
    setV(saved > 0 ? saved : r.servings || 1);
  }, [r.id, r.servings]);
  return [
    v,
    (n) => {
      setV(n);
      const all = ls.get(servKey, {});
      if (n === (r.servings || 1)) delete all[r.id];
      else all[r.id] = n;
      ls.set(servKey, all);
    },
  ];
}
// The ingredient lines at the chosen servings: [{ i, amount, have }]
function linesAt(r, servings, kKeys) {
  const have = (item) => {
    const k = normalize(item);
    return !!k && (STAPLES.has(k) || kKeys.some((a) => covers(a, k)));
  };
  return (r.ingredients || []).map((i, n) =>
    i.h
      ? { i, n }
      : {
          i,
          n,
          amount: r.servings ? RB.fmtAmount(RB.amountFor(i, servings, r.servings)) : RB.fmtAmount(RB.amountFor({ ...i, by: undefined }, servings, 1)),
          have: kKeys.length && !i.pantry ? have(i.item) : false,
        }
  );
}

export function RecipePage({ r, inBox, web, data, mutate, mutateBox, onLogRecipe, onEdit, onDelete, onSave, onClose }) {
  const [servings, setServings] = useServings(r);
  const [checked, setChecked] = useState(() => new Set());
  const [cook, setCook] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setChecked(new Set());
    setConfirm(false);
    noteRecent(r.id);
  }, [r.id]);
  const factor = RB.factorOf(r, servings);
  const kKeys = useMemo(() => (data ? kitchenKeys(data) : []), [data && data.kitchen]);
  const cookable = useMemo(() => (web ? { ...web, box: false } : RB.asCookable(r)), [r, web]);
  const m = useMemo(() => match(cookable, kKeys), [cookable, kKeys]);
  const lines = useMemo(() => linesAt(r, servings, kKeys), [r, servings, kKeys]);
  const main = lines.filter((l) => !l.i.pantry);
  const pantry = lines.filter((l) => l.i.pantry);
  const miss = kKeys.length || m.total ? missingNames(cookable, m) : [];
  const steps = r.steps || [];
  const planned = data ? inPlan(data, cookable.id) : false;
  const cal = RB.calOf(r);
  const toggle = (n) => {
    const s = new Set(checked);
    s.has(n) ? s.delete(n) : s.add(n);
    setChecked(s);
  };
  const facts = [
    r.minutes ? ['clock', mins(r.minutes)] : null,
    cal != null ? ['flame', `${Math.round(cal)} cal`] : null,
    r.perServing != null ? ['budget', `${money(r.perServing)} a serving`] : null,
    r.difficulty ? ['pot', r.difficulty] : null,
  ].filter(Boolean);
  const row = (l) => (
    <li key={l.n} className={`${checked.has(l.n) ? 'done' : ''} ${l.have ? 'have' : ''} ${l.i.o ? 'opt' : ''}`}>
      <button type="button" onClick={() => toggle(l.n)} aria-pressed={checked.has(l.n)}>
        <span className="ri-amt">{l.amount}</span>
        <span className="ri-item">
          {l.i.item}
          {l.i.note ? <span className="ri-note"> {l.i.note}</span> : null}
          {l.i.o ? <span className="ri-note"> (optional)</span> : null}
        </span>
        <span className="ri-mark" aria-hidden="true">
          {checked.has(l.n) ? <Icon name="check" size={15} /> : l.have ? <Icon name="check" size={13} /> : null}
        </span>
      </button>
    </li>
  );
  return (
    <article className="rp">
      <div className="rp-bar">
        <button className="rp-back" onClick={onClose}>
          <Icon name="back" size={20} /> Back
        </button>
        <span className="grow" />
        {inBox ? (
          <>
            <button className={`rp-icon ${r.fav ? 'on' : ''}`} aria-pressed={!!r.fav} aria-label={r.fav ? 'Remove from favorites' : 'Add to favorites'} onClick={() => mutateBox((b) => RB.toggleFav(b, r.id))}>
              <Icon name="fav" size={20} fill={!!r.fav} />
            </button>
            <button className="rp-icon" aria-label="Edit recipe" onClick={onEdit}>
              <Icon name="edit" size={19} />
            </button>
          </>
        ) : null}
      </div>
      <header className="card rp-head">
        <div className="rp-photo">
          <RecipeImg r={r} kind="full" eager />
        </div>
        <div className="rp-intro">
          <div className="rp-kicker">
            {[r.source, ...(r.tags || []).slice(0, 3)].filter(Boolean).map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
          <h1 className="rp-title">{r.title}</h1>
          {r.subtitle ? <p className="rp-sub">{r.subtitle}</p> : null}
          {facts.length || r.made ? (
            <div className="rp-facts">
              {facts.map(([ic, t]) => (
                <span key={t} className="rp-fact">
                  <Icon name={ic} size={15} /> {t}
                </span>
              ))}
              {r.spice ? <span className="rp-fact">{'🌶'.repeat(r.spice)}</span> : null}
              {inBox && r.made ? (
                <span className="rp-fact">
                  <Icon name="check" size={15} /> Made {r.made}×{r.lastMade ? ` · ${dateLabel(r.lastMade)}` : ''}
                </span>
              ) : null}
            </div>
          ) : null}
          <Servings r={r} value={servings} onChange={setServings} />
          <div className="rp-cta">
            {steps.length ? (
              <button className="btn primary cook-btn" onClick={() => setCook(true)}>
                <Icon name="play" size={17} fill /> Start cooking
              </button>
            ) : null}
            {!inBox && onSave ? (
              <button className="btn" onClick={onSave}>
                <Icon name="bookmark" size={17} /> Save to recipe box
              </button>
            ) : null}
            {r.url ? (
              <a className="btn quiet" href={r.url} target="_blank" rel="noopener">
                {r.source === 'Budget Bytes' ? 'On Budget Bytes' : 'Original'} <Icon name="ext" size={15} />
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <div className="rp-cols">
        <section className="card rp-ing">
          <div className="card-head">
            <h2 className="card-title">Ingredients</h2>
            <span className="muted small">
              {factor !== 1 && r.servings ? `for ${plural(Math.round(servings * 100) / 100, 'serving')}` : factor !== 1 ? `× ${Math.round(factor * 100) / 100}` : m.total && kKeys.length ? `you have ${m.have.length} of ${m.total}` : ''}
            </span>
          </div>
          {main.length ? (
            <ul className="ri-list">
              {main.map((l) =>
                l.i.h ? (
                  <li key={l.n} className="ri-h">
                    {l.i.h}
                  </li>
                ) : (
                  row(l)
                )
              )}
            </ul>
          ) : (
            <p className="empty">No ingredients listed.</p>
          )}
          {pantry.length ? (
            <>
              <h3 className="k-head">From your pantry</h3>
              <ul className="ri-list pantry">
                {pantry.map(row)}
              </ul>
            </>
          ) : null}
          {r.tools && r.tools.length ? (
            <p className="small ri-tools">
              <b>You’ll need:</b> {r.tools.join(', ')}
            </p>
          ) : null}
          {r.allergens && r.allergens.length ? <p className="small muted">Contains {r.allergens.join(', ').toLowerCase()}.</p> : null}
          {checked.size ? (
            <button className="linkish small" onClick={() => setChecked(new Set())}>
              Uncheck all
            </button>
          ) : (
            <p className="muted small ri-hint">Tap an ingredient to check it off.</p>
          )}
          {miss.length && data ? (
            <button className="btn block" onClick={() => mutate((d) => addGrocery(d, miss, r.title), `Added ${plural(miss.length, 'item')} to the grocery list`)}>
              <Icon name="cart" size={17} /> Add {miss.length} missing to groceries
            </button>
          ) : kKeys.length && m.total ? (
            <p className="ok-note">You have everything for this.</p>
          ) : null}
        </section>

        <section className="card rp-steps">
          <div className="card-head">
            <h2 className="card-title">Instructions</h2>
            {steps.length ? <span className="muted small">{plural(steps.length, 'step')}</span> : null}
          </div>
          {steps.length ? (
            <ol className="st-list">
              {steps.map((s, i) => (
                <li key={i}>
                  <span className="st-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="st-body">
                    {s.title ? <h3 className="st-title">{s.title}</h3> : null}
                    <p>
                      <StepText text={s.text} factor={factor} />
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty">{r.source === 'Budget Bytes' ? 'The steps are on Budget Bytes (link above).' : inBox ? 'No steps yet. Tap the pencil to add them.' : 'No steps here.'}</p>
          )}
          {r.notes ? (
            <div className="rp-notes">
              <h3 className="k-head">Notes</h3>
              <p>{r.notes}</p>
            </div>
          ) : null}
          {r.nutrition ? (
            <div className="rp-nutri">
              <h3 className="k-head">Per serving</h3>
              <dl>
                {RB.NUTRIENTS.map(([k, l, u], i) =>
                  r.nutrition[i] != null ? (
                    <div key={k}>
                      <dt>{l}</dt>
                      <dd>
                        {Math.round(r.nutrition[i])}
                        {u}
                      </dd>
                    </div>
                  ) : null
                )}
              </dl>
            </div>
          ) : null}
        </section>
      </div>

      <section className="card rp-more">
        {data ? (
          <button className={`btn block ${planned ? 'quiet' : ''}`} onClick={() => mutate((d) => togglePlan(d, cookable), planned ? `Removed ${r.title} from this week’s prep` : `Added ${r.title} to this week’s prep`)}>
            {planned ? 'In this week’s prep · remove' : 'Add to this week’s prep'}
          </button>
        ) : null}
        {cal != null && onLogRecipe ? (
          <button className="btn quiet block" onClick={() => onLogRecipe(cookable)}>
            Log a serving to Health · {Math.round(cal)} cal
          </button>
        ) : null}
        {inBox ? (
          <>
            <button className="btn quiet block" onClick={() => mutateBox((b) => RB.markMade(b, r.id), `Nice. ${r.title} marked as made`)}>
              I made this
            </button>
            <button
              className="btn quiet block danger-text"
              onClick={() => {
                if (!confirm) return setConfirm(true);
                onDelete();
              }}
            >
              <Icon name="trash" size={16} /> {confirm ? 'Tap again to delete it' : 'Delete recipe'}
            </button>
          </>
        ) : null}
      </section>
      {cook ? (
        <CookMode
          r={r}
          lines={lines}
          factor={factor}
          checked={checked}
          onToggle={toggle}
          onClose={() => setCook(false)}
          onMade={
            inBox
              ? () => {
                  mutateBox((b) => RB.markMade(b, r.id), `Nice. ${r.title} marked as made`);
                  setCook(false);
                }
              : null
          }
        />
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------- cook mode: one step at a time, big, with timers
// One sound context, started from a tap (starting a timer), so iPhones let it play when the timer ends.
let audio = null;
function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audio) audio = new Ctx();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch {
    /* no sound */
  }
}
function beep() {
  try {
    if (!audio) unlockAudio();
    const ctx = audio;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.28);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {
    /* no sound */
  }
  try {
    navigator.vibrate && navigator.vibrate([200, 100, 200]);
  } catch {
    /* no vibration */
  }
}
const clock = (s) => {
  const v = Math.max(0, Math.ceil(s));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const sec = v % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
function CookMode({ r, lines, factor, checked, onToggle, onClose, onMade }) {
  const steps = r.steps || [];
  const [i, setI] = useState(0);
  const [showIng, setShowIng] = useState(false);
  const [timers, setTimers] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [warn, setWarn] = useState(false);
  const rang = useRef(new Set());
  const touch = useRef(null);
  const leaving = useRef(false);
  const last = steps.length; // the "done" screen
  const go = (n) => setI(Math.max(0, Math.min(last, n)));
  const running = timers.some((t) => t.end > now);
  const runningRef = useRef(false);
  runningRef.current = running;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Leaving: a running timer asks first. Cook mode has its own history entry, so the phone's Back leaves it too.
  const leave = (force) => {
    if (runningRef.current && !force) return setWarn(true);
    leaving.current = true;
    if (history.state && history.state.cook) history.back();
    else closeRef.current();
  };
  useEffect(() => {
    try {
      history.pushState({ ...(history.state || {}), cook: 1 }, '');
    } catch {
      /* no history API */
    }
    const pop = () => {
      if (history.state && history.state.cook) return;
      if (runningRef.current && !leaving.current) {
        // Back while a timer runs: stay, and ask
        try {
          history.pushState({ ...(history.state || {}), cook: 1 }, '');
        } catch {
          /* no history API */
        }
        setWarn(true);
        return;
      }
      closeRef.current();
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      // closed some other way (marked made): drop cook mode's history entry
      if (history.state && history.state.cook) history.back();
    };
  }, []);
  // keep the screen on and lock the page behind
  useEffect(() => {
    let lock = null;
    let alive = true;
    const want = async () => {
      try {
        if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
        const l = await navigator.wakeLock.request('screen');
        if (alive) lock = l;
        else l.release().catch(() => {});
      } catch {
        /* not allowed here */
      }
    };
    want();
    const vis = () => document.visibilityState === 'visible' && want();
    document.addEventListener('visibilitychange', vis);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', vis);
      document.body.style.overflow = prev;
      if (lock) lock.release().catch(() => {});
    };
  }, []);
  useEffect(() => {
    const on = (e) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(last, x + 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      else if (e.key === 'Escape') (showIng ? setShowIng(false) : leave());
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [last, showIng]);
  useEffect(() => {
    if (!timers.length) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [timers.length]);
  useEffect(() => {
    for (const t of timers) {
      if (t.end <= now && !rang.current.has(t.id)) {
        rang.current.add(t.id);
        beep();
      }
    }
  }, [now, timers]);
  const start = (t) => {
    unlockAudio();
    setNow(Date.now());
    setTimers((xs) => [...xs, { id: `${Date.now()}${Math.random()}`, label: t.label, step: i + 1, end: Date.now() + t.secs * 1000 }]);
  };
  const s = steps[i];
  const found = s ? RB.timersIn(s.text) : [];
  return (
    <div
      className="cook"
      role="dialog"
      aria-modal="true"
      aria-label={`Cooking ${r.title}`}
      onTouchStart={(e) => (touch.current = e.touches[0] ? [e.touches[0].clientX, e.touches[0].clientY] : null)}
      onTouchEnd={(e) => {
        const t0 = touch.current;
        const t1 = e.changedTouches[0];
        touch.current = null;
        if (!t0 || !t1 || showIng) return;
        const dx = t1.clientX - t0[0];
        const dy = t1.clientY - t0[1];
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(i + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="cook-top">
        <button className="cook-x" aria-label="Leave cook mode" onClick={() => leave()}>
          <Icon name="close" size={22} />
        </button>
        <span className="cook-name">{r.title}</span>
        <button className={`cook-ingbtn ${showIng ? 'on' : ''}`} aria-expanded={showIng} onClick={() => setShowIng(!showIng)}>
          <Icon name="list" size={18} /> Ingredients
        </button>
      </div>
      <div className="cook-prog" aria-hidden="true">
        {steps.map((_, n) => (
          <span key={n} className={n < i ? 'past' : n === i ? 'now' : ''} />
        ))}
      </div>
      <div className="cook-main" key={i}>
        {s ? (
          <>
            <div className="cook-kick">
              Step {i + 1} of {steps.length}
            </div>
            {s.title ? <h2 className="cook-title">{s.title}</h2> : null}
            <p className="cook-text">
              <StepText text={s.text} factor={factor} />
            </p>
            {found.length ? (
              <div className="cook-tbtns">
                {found.map((t) => (
                  <button key={t.label} className="cook-tbtn" onClick={() => start(t)}>
                    <Icon name="timer" size={18} /> {t.label} timer
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="cook-done">
            <div className="cook-kick">All done</div>
            <h2 className="cook-title">Enjoy your {r.title.toLowerCase().startsWith('the ') ? r.title.slice(4) : r.title}.</h2>
            {onMade ? (
              <button className="btn primary cook-made" onClick={onMade}>
                <Icon name="check" size={18} /> I made this
              </button>
            ) : null}
          </div>
        )}
      </div>
      {timers.length ? (
        <div className="cook-timers">
          {timers.map((t) => {
            const left = (t.end - now) / 1000;
            return (
              <div key={t.id} className={`ct ${left <= 0 ? 'ring' : ''}`}>
                <Icon name="timer" size={16} />
                <span className="ct-l">
                  Step {t.step} · {t.label}
                </span>
                <b className="num">{left <= 0 ? 'Done' : clock(left)}</b>
                <button aria-label="Stop timer" onClick={() => setTimers((xs) => xs.filter((x) => x.id !== t.id))}>
                  <Icon name="close" size={15} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      {warn ? (
        <div className="cook-warn" role="alertdialog" aria-label="A timer is still running">
          <span>A timer is still running. Leave cook mode anyway?</span>
          <button onClick={() => setWarn(false)}>Keep cooking</button>
          <button className="go" onClick={() => leave(true)}>
            Leave
          </button>
        </div>
      ) : null}
      <div className="cook-nav">
        <button className="cook-prev" onClick={() => go(i - 1)} disabled={i === 0}>
          <Icon name="back" size={20} /> Back
        </button>
        {i < last ? (
          <button className="cook-next" onClick={() => go(i + 1)}>
            {i === last - 1 ? 'Finish' : 'Next'} <Icon name="chev" size={20} />
          </button>
        ) : (
          <button className="cook-next" onClick={() => leave()}>
            Close
          </button>
        )}
      </div>
      {showIng ? (
        <div className="cook-ing" role="region" aria-label="Ingredients">
          <div className="cook-ing-head">
            <b>Ingredients</b>
            <button className="cook-x" aria-label="Hide ingredients" onClick={() => setShowIng(false)}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <ul className="ri-list">
            {lines.map((l) =>
              l.i.h ? (
                <li key={l.n} className="ri-h">
                  {l.i.h}
                </li>
              ) : (
                <li key={l.n} className={checked.has(l.n) ? 'done' : ''}>
                  <button type="button" onClick={() => onToggle(l.n)} aria-pressed={checked.has(l.n)}>
                    <span className="ri-amt">{l.amount}</span>
                    <span className="ri-item">
                      {l.i.item}
                      {l.i.note ? <span className="ri-note"> {l.i.note}</span> : null}
                    </span>
                  </button>
                </li>
              )
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- add / edit
const SOURCES = ['Mine', 'HelloFresh', 'Budget Bytes', 'Family'];
export function RecipeForm({ r, onSave, onClose }) {
  const [f, setF] = useState(() => ({ ...RB.toForm(r), source: r ? r.source || '' : 'Mine' }));
  const [photo, setPhoto] = useState(null);
  const [drop, setDrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    try {
      setPhoto(await photoFromFile(file));
      setDrop(false);
    } catch (x) {
      setErr(x.message || String(x));
    }
  };
  const save = async (e) => {
    e.preventDefault();
    if (!f.title.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      const next = RB.fromForm(f, r);
      const ok = await onSave(next, { photo, drop: drop && !photo });
      if (ok !== false) onClose();
    } catch (x) {
      setErr(x.message || String(x));
    }
    setBusy(false);
  };
  const hasPhoto = photo || (r && r.photo && !drop);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet tall wide-sheet rf" role="dialog" aria-label={r ? `Edit ${r.title}` : 'Add a recipe'} onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2 className="card-title">{r ? 'Edit recipe' : 'Add a recipe'}</h2>
        <div className="rf-photo">
          {photo ? (
            <span className="rimg on rf-img">
              <img src={photo.card} alt="" />
            </span>
          ) : r && !drop ? (
            <RecipeImg r={r} className="rf-img" eager />
          ) : (
            <span className="rimg art rf-img">
              <PlateArt r={{ id: 'new', title: f.title || 'Recipe', ingredients: [] }} />
            </span>
          )}
          <div className="rf-photo-btns">
            <label className="btn small">
              <Icon name="camera" size={16} /> {hasPhoto ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/*" onChange={pick} hidden />
            </label>
            {hasPhoto ? (
              <button type="button" className="btn quiet small" onClick={() => (setPhoto(null), setDrop(true))}>
                Remove photo
              </button>
            ) : null}
            <span className="muted small">Cropped to 4:3 from the middle.</span>
          </div>
        </div>
        <div className="rf-grid">
          <label className="field wide">
            <span className="small muted">Name</span>
            <input className="input" value={f.title} onChange={set('title')} autoFocus={!r} required />
          </label>
          <label className="field wide">
            <span className="small muted">Subtitle (optional)</span>
            <input className="input" value={f.subtitle} onChange={set('subtitle')} placeholder="with roasted potatoes and lemon butter" />
          </label>
          <label className="field">
            <span className="small muted">Servings</span>
            <input className="input" inputMode="numeric" value={f.servings} onChange={set('servings')} placeholder="2" />
          </label>
          <label className="field">
            <span className="small muted">Total time (min)</span>
            <input className="input" inputMode="numeric" value={f.minutes} onChange={set('minutes')} placeholder="35" />
          </label>
          <label className="field">
            <span className="small muted">Calories a serving</span>
            <input className="input" inputMode="numeric" value={f.calories} onChange={set('calories')} placeholder="650" />
          </label>
          <label className="field">
            <span className="small muted">Source</span>
            <input className="input" list="rf-sources" value={f.source} onChange={set('source')} />
            <datalist id="rf-sources">
              {SOURCES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>
        <label className="field wide">
          <span className="small muted">Ingredients, one per line, amounts first (“10 oz ground beef”). “## Sauce” starts a group.</span>
          <textarea className="input mono-ish" rows={8} value={f.ingredients} onChange={set('ingredients')} placeholder={'10 oz ground beef\n¾ cup jasmine rice\n2 cloves garlic (minced)'} />
        </label>
        <label className="field wide">
          <span className="small muted">From your pantry (optional): salt, oil, butter…</span>
          <textarea className="input mono-ish" rows={3} value={f.pantry} onChange={set('pantry')} placeholder={'1 tbsp butter\nsalt and pepper'} />
        </label>
        <label className="field wide">
          <span className="small muted">Steps, a blank line between each. “Title: …” names a step; write amounts as [[1 tbsp]] and they change with the servings.</span>
          <textarea className="input" rows={9} value={f.steps} onChange={set('steps')} placeholder={'Prep: Wash and dry the produce. Mince the garlic.\n\nCook the rice: Bring [[1¼ cups]] water to a boil, add the rice, cover and simmer 15 minutes.'} />
        </label>
        <label className="field wide">
          <span className="small muted">Notes (optional)</span>
          <textarea className="input" rows={3} value={f.notes} onChange={set('notes')} />
        </label>
        <div className="rf-grid">
          <label className="field wide">
            <span className="small muted">Tags (commas between)</span>
            <input className="input" value={f.tags} onChange={set('tags')} placeholder="Spicy, Weeknight" />
          </label>
          <label className="field wide">
            <span className="small muted">Link (optional)</span>
            <input className="input" type="url" value={f.url} onChange={set('url')} placeholder="https://" />
          </label>
        </div>
        {err ? <div className="alert">{err}</div> : null}
        <button className="btn primary block" type="submit" disabled={!f.title.trim() || busy}>
          {busy ? 'Saving…' : r ? 'Save changes' : 'Save recipe'}
        </button>
        <button className="btn quiet block" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- import recipe cards
export function ImportSheet({ box, onImport, onClose }) {
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    setPlan(null);
    if (file.size > 80 * 1024 * 1024) return setErr('That file is too big (over 80 MB). Split it into a few smaller files.');
    let json;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return setErr('That file isn’t a recipe file. It should be the .json file with your recipes.');
    }
    const p = RB.planImport(box, json);
    if (p.error) return setErr(p.error);
    // every photo has to open as a picture before anything is saved
    setProgress('Checking photos…');
    let bad = 0;
    for (const it of p.items) {
      if (it.photo && !((await decodes(it.photo.card)) && (it.photo.full === it.photo.card || (await decodes(it.photo.full))))) {
        it.photo = null;
        bad++;
      }
    }
    setProgress('');
    setPlan({ ...p, photos: p.items.filter((it) => it.photo).length, bad });
  };
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await onImport(plan, setProgress);
      onClose();
    } catch (x) {
      let msg = x.message || String(x);
      // what was saved stays saved; the sheet keeps just the rest, ready to try again
      if (x.saved && x.saved.length) {
        const done = new Set(x.saved);
        const items = plan.items.filter((it) => !done.has(it.r.id));
        setPlan({ ...plan, items, add: items.filter((it) => !it.existing).length, update: items.filter((it) => it.existing).length, photos: items.filter((it) => it.photo).length });
        if (items.length) msg += ` Tap Import to send the other ${plural(items.length, 'recipe')}.`;
      }
      setErr(msg);
      setProgress('');
      setBusy(false);
    }
  };
  return (
    <div className="sheet-bg" onClick={busy ? undefined : onClose}>
      <div className="sheet tall rim" role="dialog" aria-label="Import recipes" onClick={(e) => e.stopPropagation()}>
        <h2 className="card-title">Import recipes</h2>
        <p className="small muted">
          Pick a recipe file (.json). To make one, send Claude photos of your recipe cards, front and back; it writes out the ingredients and steps and crops each dish’s photo. Recipes already in your box are updated, not doubled, and keep their photos.
        </p>
        {err ? (
          <div className="alert" role="alert">
            {err}
          </div>
        ) : null}
        {progress && !busy ? <p className="small muted">{progress}</p> : null}
        {!busy ? (
          <label className={`btn block ${plan ? '' : 'primary'}`}>
            <Icon name="upload" size={17} /> {plan ? 'Choose a different file' : 'Choose file'}
            <input type="file" accept=".json,application/json" onChange={pick} hidden />
          </label>
        ) : null}
        {plan ? (
          <>
            <p className="rim-sum">
              <b>{plural(plan.items.length, 'recipe')}</b>
              {plan.add ? ` · ${plan.add} new` : ''}
              {plan.update ? ` · ${plan.update} already in your box (updated)` : ''}
              {plan.photos ? ` · ${plural(plan.photos, 'photo')}` : ''}
              {plan.skipped.length ? ` · ${plural(plan.skipped.length, 'entry', 'entries')} skipped (no name)` : ''}
              {plan.dupes && plan.dupes.length ? ` · ${plural(plan.dupes.length, 'repeat')} in the file skipped` : ''}
              {plan.bad ? ` · ${plural(plan.bad, 'photo')} couldn’t be read (the recipe comes in without it)` : ''}
            </p>
            <ul className="rim-list">
              {plan.items.map(({ r, existing, photo }) => (
                <li key={r.id}>
                  {photo ? (
                    <span className="rimg on rim-img">
                      <img src={photo.card} alt="" />
                    </span>
                  ) : (
                    <RecipeImg r={r} className="rim-img" />
                  )}
                  <span className="grow">
                    <span className="rs-title">{r.title}</span>
                    <span className="rs-meta">
                      {[existing ? 'Update' : 'New', plural(RB.itemsOf(r).length, 'ingredient'), plural((r.steps || []).length, 'step'), r.servings ? plural(r.servings, 'serving') : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <button className="btn primary block" disabled={busy} onClick={go}>
              {busy ? progress || 'Importing…' : `Import ${plural(plan.items.length, 'recipe')}`}
            </button>
          </>
        ) : null}
        <button className="btn quiet block" disabled={busy} onClick={onClose}>
          {busy ? 'Importing…' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}

// The web recipe for an id like bb-123 (this week's picks carry full ingredient lines; the pool only names).
export function webRecipe(recipes, id) {
  if (!recipes || !/^bb-/.test(id)) return null;
  const wid = id.slice(3);
  const all = [...(recipes.picks || []), ...(recipes.pool || [])];
  return all.find((r) => String(r.id) === wid) || null;
}
export { label };
