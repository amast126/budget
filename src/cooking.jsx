import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { SourdoughSection, SourdoughHomeRow } from './sourdough.jsx';
import { SectionTabs } from './learning.jsx';
import { MealPrepSection, planLine } from './mealprep.jsx';
import { fmt, todayISO, dateLabel } from './budget-logic.js';
import { covers, STAPLES } from './ingredients.mjs';
import { PLACES, COURSES, splitItems, kitchenKeys, addKitchen, removeKitchen, setWhere, toggleLow, addGrocery, toggleGrocery, removeGrocery, rankRecipes, match, recipeUrl, imageUrl, label } from './cooking-logic.js';
import * as RB from './recipebox-logic.js';
import {
  BoxCtx,
  CookHero,
  SearchResults,
  searchAll,
  RecentStrip,
  RecipeBoxSection,
  RecipePage,
  RecipeForm,
  ImportSheet,
  RecipeImg,
  webRecipe,
  useRecipeParam,
  openRecipe,
  closeRecipe,
  takeScroll,
  openLink,
  recipeHref,
  noteRecent,
  mins,
} from './recipebox.jsx';

const money = (n) => (n == null ? null : `$${Number(n).toFixed(2)}`);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
// Budget Bytes recipes open as bb-<id>; recipes in your box (and plan entries made from them) by their own id.
export const openId = (r) => (r.box || /^(mine|bb|hf|r|demo)-/.test(String(r.id)) ? r.id : `bb-${r.id}`);
const open = (r) => {
  noteRecent(openId(r));
  openRecipe(openId(r));
};
// Your recipes and Budget Bytes' popular ones, for matching against the kitchen.
const listFor = (box, recipes) => {
  const mine = box ? box.recipes.map(RB.asCookable) : [];
  const saved = new Set(mine.filter((r) => r.webId != null).map((r) => String(r.webId)));
  // Skip one- or two-ingredient technique posts ("how to boil an egg") and anything already in your box.
  return [...mine, ...((recipes && recipes.pool) || []).filter((r) => !saved.has(String(r.id)) && (r.keys || []).length >= 3)];
};
const bigFromThumb = (p) => (p ? p.replace(/-160x160(\.\w+)$/, '-400x300$1') : null);

function Meta({ r, m }) {
  const bits = [];
  if (m) bits.push(m.missing.length === 0 ? 'You have everything' : `Have ${m.have.length} of ${m.total}`);
  if (r.perServing != null) bits.push(`${money(r.perServing)}/serving`);
  if (r.minutes) bits.push(mins(r.minutes));
  if (r.box) bits.push(r.made ? `Made ${r.made}×` : r.source && r.source !== 'Mine' ? r.source : 'Yours');
  return <span className="muted small">{bits.join(' · ')}</span>;
}

function RecipeRow({ r, m }) {
  return (
    <li>
      <a className="rc" href={recipeHref(openId(r))} onClick={openLink(openId(r))}>
        <RecipeImg r={r} className="thumb" />
        <span className="grow">
          <span className="rc-title">{r.title}</span>
          <Meta r={r} m={m} />
          {m && m.missing.length ? (
            <span className="rc-miss small">
              Need: {m.missing.slice(0, 3).map(label).join(', ')}
              {m.missing.length > 3 ? ` +${m.missing.length - 3}` : ''}
            </span>
          ) : null}
        </span>
        <Icon name="chev" size={18} />
      </a>
    </li>
  );
}

// ---------------------------------------------------------------- grocery list
function GroceryCard({ data, mutate, onFinish }) {
  const [text, setText] = useState('');
  const todo = data.grocery.filter((g) => !g.done);
  const done = data.grocery.filter((g) => g.done);
  const add = (e) => {
    e.preventDefault();
    const names = splitItems(text);
    if (!names.length) return;
    mutate((d) => addGrocery(d, names));
    setText('');
  };
  const row = (g) => (
    <li key={g.id} className={`bill g-row ${g.done ? 'done' : ''}`}>
      <label className="bill-check">
        <input type="checkbox" checked={!!g.done} onChange={() => mutate((d) => toggleGrocery(d, g.id))} aria-label={`${g.name} bought`} />
        <span className="box">{g.done ? <Icon name="check" size={14} /> : null}</span>
      </label>
      <div className="grow">
        <div className="bill-name">{g.name}</div>
        {g.for && g.for.length ? <div className="muted small">For {g.for.join(', ')}</div> : null}
      </div>
      <button className="x" aria-label={`Remove ${g.name}`} onClick={() => mutate((d) => removeGrocery(d, g.id))}>
        ×
      </button>
    </li>
  );
  return (
    <section className="card grocery">
      <div className="card-head">
        <h2 className="card-title">Grocery list</h2>
        <span className="muted small">{todo.length ? plural(todo.length, 'item') : 'All set'}</span>
      </div>
      <form className="add-row" onSubmit={add}>
        <input className="input" placeholder="Add items (commas for several)" value={text} onChange={(e) => setText(e.target.value)} aria-label="Add to grocery list" />
        <button className="btn" type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>
      {data.grocery.length === 0 ? (
        <p className="empty">Nothing on the list. Add items here, tap Low on something in your kitchen, or add a recipe’s missing ingredients.</p>
      ) : (
        <ul className="list">
          {todo.map(row)}
          {done.map(row)}
        </ul>
      )}
      {done.length ? (
        <button className="btn primary block" onClick={onFinish}>
          Finish shop · {plural(done.length, 'item')} bought
        </button>
      ) : null}
    </section>
  );
}

export function FinishShopSheet({ count, budget, onSubmit, onClose }) {
  const methods = (budget && budget.methods) || [];
  const [d, setD] = useState({ amount: '', desc: 'Groceries', method: methods[0] || '', date: todayISO() });
  const [busy, setBusy] = useState(false);
  const amount = Number(d.amount);
  const ok = d.amount !== '' && !isNaN(amount) && amount > 0;
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const go = async (log) => {
    setBusy(true);
    await onSubmit(log ? { ...d, amount } : null);
    setBusy(false);
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Finish shop" onClick={(e) => e.stopPropagation()}>
        <h2 className="card-title">Finish shop</h2>
        <p className="muted small">
          {plural(count, 'item')} go into your kitchen list. {budget ? `Enter what you spent to log it under ${budget.category} in the budget.` : 'The budget hasn’t loaded, so this only puts things away.'}
        </p>
        {budget ? (
          <div className="qa shop-form">
            <label className="qa-amt">
              <span className="sr">Total spent</span>
              <span className="qa-dollar">$</span>
              <input className="input num" inputMode="decimal" placeholder="0.00" value={d.amount} onChange={set('amount')} aria-label="Total spent" autoFocus />
            </label>
            <input className="input qa-desc" value={d.desc} onChange={set('desc')} aria-label="Store or note" placeholder="Store" />
            <select className="input" value={d.method} onChange={set('method')} aria-label="Paid with">
              {methods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input className="input" type="date" value={d.date} onChange={set('date')} aria-label="Date" />
          </div>
        ) : null}
        {budget ? (
          <button className="btn primary block" disabled={!ok || busy} onClick={() => go(true)}>
            {ok ? `Log ${fmt(amount)} and put away` : 'Enter the total to log it'}
          </button>
        ) : null}
        <button className="btn quiet block" disabled={busy} onClick={() => go(false)}>
          Put away without logging
        </button>
        <button className="btn quiet block" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- kitchen
const FALLBACK_COMMON = ['garlic', 'olive oil', 'onion', 'cooking oil', 'butter', 'garlic powder', 'green onion', 'oregano', 'smoked paprika', 'brown sugar', 'flour', 'chicken broth', 'cumin', 'soy sauce', 'egg', 'carrot', 'chicken breast', 'rice', 'milk', 'lemon'];

function KitchenCard({ data, recipes, mutate }) {
  const [text, setText] = useState('');
  const [where, setWhereSel] = useState('');
  const [filter, setFilter] = useState('all');
  const [showCommon, setShowCommon] = useState(data.kitchen.length < 15);
  const kKeys = useMemo(() => kitchenKeys(data), [data.kitchen]);
  const common = ((recipes && recipes.common && recipes.common.map((c) => c[0])) || FALLBACK_COMMON)
    .filter((k) => !STAPLES.has(k) && !kKeys.some((a) => covers(a, k)))
    .slice(0, 40);
  const add = (e) => {
    e.preventDefault();
    const names = splitItems(text);
    if (!names.length) return;
    mutate((d) => addKitchen(d, names, where || undefined), names.length > 1 ? `Added ${names.length} to your kitchen` : null);
    setText('');
  };
  const counts = Object.fromEntries(PLACES.map(([k]) => [k, data.kitchen.filter((i) => i.where === k).length]));
  const groups = PLACES.filter(([k]) => filter === 'all' || filter === k)
    .map(([k, l]) => [k, l, data.kitchen.filter((i) => i.where === k).sort((a, b) => a.name.localeCompare(b.name))])
    .filter(([, , items]) => items.length);
  const low = data.kitchen.filter((i) => i.low).length;
  return (
    <section className="card kitchen">
      <div className="card-head">
        <h2 className="card-title">Kitchen</h2>
        <span className="muted small">
          {plural(data.kitchen.length, 'item')}
          {low ? ` · ${low} running low` : ''}
        </span>
      </div>
      <form className="add-row" onSubmit={add}>
        <input className="input" placeholder="What do you have? (commas for several)" value={text} onChange={(e) => setText(e.target.value)} aria-label="Add to kitchen" />
        <select className="input place-sel" value={where} onChange={(e) => setWhereSel(e.target.value)} aria-label="Where it goes">
          <option value="">Auto</option>
          {PLACES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <button className="btn" type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>

      {common.length ? (
        <div className="common">
          <button className="link-btn small" onClick={() => setShowCommon(!showCommon)} aria-expanded={showCommon}>
            <Icon name={showCommon ? 'down' : 'chev'} size={14} /> Common in popular recipes — tap what you have
          </button>
          {showCommon ? (
            <div className="chips">
              {common.map((k) => (
                <button key={k} className="chip" onClick={() => mutate((d) => addKitchen(d, [label(k)]))}>
                  + {label(k)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {data.kitchen.length ? (
        <div className="seg k-filter" role="group" aria-label="Show">
          <button className={`seg-btn ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
            All
          </button>
          {PLACES.map(([k, l]) =>
            counts[k] ? (
              <button key={k} className={`seg-btn ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
                {l} {counts[k]}
              </button>
            ) : null
          )}
        </div>
      ) : (
        <p className="empty">Add what’s in your fridge, freezer, pantry and spice rack, and recipes will show what you can make with it.</p>
      )}
      {groups.map(([k, l, items]) => (
        <div key={k} className="k-group">
          <h3 className="k-head">{l}</h3>
          <ul className="list">
            {items.map((i) => (
              <li key={i.id} className={`k-row ${i.low ? 'is-low' : ''}`}>
                <span className="grow k-name">{i.name}</span>
                <select className="inline-select small" value={i.where} onChange={(e) => mutate((d) => setWhere(d, i.id, e.target.value))} aria-label={`Where ${i.name} is kept`}>
                  {PLACES.map(([pk, pl]) => (
                    <option key={pk} value={pk}>
                      {pl}
                    </option>
                  ))}
                </select>
                <button
                  className={`low-btn ${i.low ? 'on' : ''}`}
                  aria-pressed={!!i.low}
                  title={i.low ? 'Running low (on the grocery list)' : 'Mark as running low and add it to the grocery list'}
                  onClick={() => mutate((d) => toggleLow(d, i.id), i.low ? null : `${i.name} added to the grocery list`)}
                >
                  Low
                </button>
                <button className="x" aria-label={`Remove ${i.name}`} onClick={() => mutate((d) => removeKitchen(d, i.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {data.kitchen.length ? <p className="muted small note">Tap Low when something’s running out and it goes on the grocery list. Salt, pepper and water are always assumed.</p> : null}
    </section>
  );
}

// ---------------------------------------------------------------- recipes from what you have
function CookNowCard({ data, recipes, box }) {
  const [course, setCourse] = useState('main');
  const kKeys = useMemo(() => kitchenKeys(data), [data.kitchen]);
  const ranked = useMemo(() => rankRecipes(listFor(box, recipes), kKeys, { course, limit: 8 }), [box, recipes, kKeys, course]);
  return (
    <section className="card cook-now">
      <div className="card-head">
        <h2 className="card-title">Cook with what you have</h2>
      </div>
      <div className="seg" role="group" aria-label="Meal">
        {COURSES.map(([k, l]) => (
          <button key={k} className={`seg-btn ${course === k ? 'on' : ''}`} onClick={() => setCourse(k)}>
            {l}
          </button>
        ))}
      </div>
      {!data.kitchen.length ? (
        <p className="empty">Add a few things to your kitchen and the best matches from your recipe box and Budget Bytes’ most popular recipes show up here.</p>
      ) : ranked.length === 0 ? (
        <p className="empty">No close matches yet. Add a few more kitchen staples.</p>
      ) : (
        <ul className="list rc-list">
          {ranked.map(({ r, m }) => (
            <RecipeRow key={r.id} r={r} m={m} />
          ))}
        </ul>
      )}
      <p className="muted small note">Fewest missing ingredients first{recipes && recipes.pool ? `, from your recipe box and ${recipes.pool.length} popular Budget Bytes recipes` : ''}.</p>
    </section>
  );
}

const PREVIEW = 8;
function PicksCard({ data, recipes, onMore }) {
  const kKeys = useMemo(() => kitchenKeys(data), [data.kitchen]);
  const picks = (recipes && recipes.picks) || [];
  const src = recipes && recipes.source;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">This week’s picks</h2>
        <span className="muted small">{recipes && recipes.generated ? `Budget Bytes · ${dateLabel(recipes.generated.slice(0, 10))}` : ''}</span>
      </div>
      {!recipes ? (
        <p className="empty">Loading…</p>
      ) : picks.length === 0 ? (
        <p className="empty">The weekly recipe list hasn’t been made yet. It fills in after the Saturday update.</p>
      ) : (
        <div className="picks">
          {picks.slice(0, PREVIEW).map((r) => {
            const m = data.kitchen.length ? match(r, kKeys) : null;
            return (
              <a key={r.id} className="pick" href={recipeHref(openId(r))} onClick={openLink(openId(r))}>
                <RecipeImg r={r} className="pick-img" />
                <span className="pick-body">
                  <span className="pick-title">{r.title}</span>
                  <span className="muted small">{[r.perServing != null ? `${money(r.perServing)}/serving` : null, mins(r.minutes)].filter(Boolean).join(' · ')}</span>
                  {m ? <span className={`small ${m.missing.length ? 'rc-miss' : 'rc-ok'}`}>{m.missing.length ? `Need ${m.missing.length} of ${m.total}` : 'You have everything'}</span> : null}
                </span>
              </a>
            );
          })}
        </div>
      )}
      {picks.length ? (
        <button className="btn block mp-more" onClick={onMore}>
          {picks.length > PREVIEW ? `All ${picks.length} picks` : 'Meal prep'} and {Math.max(0, ((recipes && recipes.pool) || []).length - picks.length)} more recipes to plan the week <Icon name="chev" size={16} />
        </button>
      ) : null}
      <p className="muted small note">
        Popular budget recipes, {picks.length || 30} new ones every Saturday. Costs are Budget Bytes’ estimates.
        {src && !src.ok ? ' The last update couldn’t reach the site, so these are from the week before.' : ''}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- page + home card
const COOK_SECTIONS = [
  ['recipes', 'Recipes'],
  ['kitchen', 'Kitchen'],
  ['prep', 'Meal prep'],
  ['sourdough', 'Sourdough'],
];
function initialSection() {
  const q = (location.hash.split('?')[1] || '').split('&')[0];
  if (COOK_SECTIONS.some(([k]) => k === q)) return q;
  try {
    const v = localStorage.getItem('dash.cookSection');
    return COOK_SECTIONS.some(([k]) => k === v) ? v : 'recipes';
  } catch {
    return 'recipes';
  }
}

export function CookingPage({ data, recipes, mutate, error, onFinishShop, onLogRecipe, sourdough, mutateSourdough, box, boxError, mutateBox, photos }) {
  const rid = useRecipeParam();
  const [section, setSec] = useState(initialSection);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null); // 'new' or the recipe being edited
  const [importing, setImporting] = useState(false);
  const ctx = useMemo(() => ({ photos, recipes }), [photos, recipes]);
  const setSection = (k) => {
    setSec(k);
    try {
      localStorage.setItem('dash.cookSection', k);
    } catch {
      /* private mode */
    }
  };
  // a recipe opens at the top; closing it goes back to where you were
  const wasOpen = useRef(!!rid);
  useEffect(() => {
    if (rid) window.scrollTo(0, 0);
    else if (wasOpen.current) {
      const y = takeScroll();
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
    wasOpen.current = !!rid;
  }, [rid]);

  const imgFor = (w) => (w.image || w.thumb ? imageUrl(recipes, w.image || bigFromThumb(w.thumb)) : null);
  const saveWeb = (w) => mutateBox((b) => RB.saveWebRecipe(b, { ...w, url: recipeUrl(recipes, w) }, imgFor(w)), 'Saved to your recipe box');
  // Photos are saved first under a new stamp, then the box switches to them in one save; the old photo is removed
  // only after that, and a new one is removed again if the box save didn't go through.
  const saveRecipe = async (next, { photo, drop }) => {
    const existing = form && form !== 'new' ? form : null;
    let r = next;
    if (!existing && RB.findRecipe(box, r.id)) r = { ...r, id: `${r.id}-${Date.now().toString(36)}` };
    let stamp = null;
    if (photo) {
      stamp = RB.newStamp();
      await photos.put(r.id, stamp, photo);
    }
    let old = null;
    const ok = await mutateBox(
      (b) => {
        if (!existing && RB.findRecipe(b, r.id)) throw new Error('A recipe with this name was just added. Try again.');
        const cur = existing ? RB.findRecipe(b, r.id) : null;
        old = (cur && cur.photo) || null;
        const saved = existing ? RB.updateRecipe(b, r) : RB.addRecipe(b, r);
        if (stamp) RB.setPhoto(b, saved.id, stamp);
        else if (drop) RB.setPhoto(b, saved.id, null);
      },
      existing ? 'Recipe saved' : `Added “${r.title}” to your recipe box`
    );
    if (!ok) {
      if (stamp) photos.drop(r.id, stamp);
      return false;
    }
    if (old && (stamp || drop) && old !== stamp) photos.drop(r.id, old);
    if (!existing) {
      setQ('');
      noteRecent(r.id);
      openRecipe(r.id);
    }
    return true;
  };
  const deleteRecipe = async (r) => {
    let removed = null;
    let timer = null;
    const ok = await mutateBox((b) => (removed = RB.removeRecipe(b, r.id)), {
      text: `Deleted “${r.title}”`,
      undo: async () => {
        clearTimeout(timer);
        if (removed) await mutateBox((b) => RB.restoreRecipe(b, removed.item, removed.index), 'Recipe restored');
      },
    });
    if (!ok) return;
    // its photo goes once Undo has had its chance (only that photo: a new one under the same id is left alone)
    const gone = removed && removed.item;
    if (gone && gone.photo) timer = setTimeout(() => photos.drop(gone.id, gone.photo), 10000);
    closeRecipe();
  };
  const importRecipes = async (plan, progress) => {
    const stamps = {};
    const undoPhotos = () => Object.entries(stamps).forEach(([id, st]) => photos.drop(id, st));
    let n = 0;
    try {
      for (const it of plan.items) {
        if (!it.photo) continue;
        n++;
        progress(`Saving photos · ${n} of ${plan.photos}`);
        const st = RB.newStamp();
        await photos.put(it.r.id, st, it.photo);
        stamps[it.r.id] = st;
      }
    } catch (e) {
      undoPhotos();
      throw e;
    }
    progress('Saving recipes…');
    let replaced = [];
    const ok = await mutateBox((b) => (replaced = RB.applyImport(b, plan.items, stamps)), `Imported ${plural(plan.items.length, 'recipe')}`);
    if (!ok) {
      undoPhotos();
      throw new Error('Couldn’t save the recipes, so nothing changed. Try again.');
    }
    replaced.forEach(([id, st]) => photos.drop(id, st));
    setSection('recipes');
  };
  const sheets = (
    <>
      {form ? <RecipeForm key={form === 'new' ? 'new' : form.id} r={form === 'new' ? null : form} onSave={saveRecipe} onClose={() => setForm(null)} /> : null}
      {importing && box ? <ImportSheet box={box} onImport={importRecipes} onClose={() => setImporting(false)} /> : null}
    </>
  );

  // ---- one recipe, over the tab (which stays as it was underneath: search, filters, meal prep choices)
  let view = null;
  if (rid) {
    const inBox = box ? RB.findRecipe(box, rid) : null;
    const w = !inBox ? webRecipe(recipes, rid) : null;
    const r = inBox || (w ? RB.webToBox({ ...w, url: recipeUrl(recipes, w) }, imgFor(w)) : null);
    view = (
      <div className="cook-view">
        {r ? (
          <RecipePage
            r={r}
            inBox={!!inBox}
            web={w}
            data={data}
            mutate={mutate}
            mutateBox={mutateBox}
            onLogRecipe={onLogRecipe}
            onEdit={() => setForm(inBox)}
            onDelete={() => deleteRecipe(inBox)}
            onSave={w ? () => saveWeb(w) : null}
            onClose={closeRecipe}
          />
        ) : (
          <section className="card rp-missing">
            <button className="rp-back" onClick={closeRecipe}>
              <Icon name="back" size={20} /> Back
            </button>
            <p className="empty">{!box || (/^bb-/.test(rid) && !recipes) ? boxError || 'Loading…' : 'That recipe isn’t in your recipe box anymore.'}</p>
          </section>
        )}
      </div>
    );
  }

  // ---- the tab
  const todo = data ? data.grocery.filter((g) => !g.done).length : 0;
  const pick = data && data.kitchen.length ? tonightPick(data, recipes, box) : null;
  const chips = [
    box ? { k: 'n', b: box.recipes.length, t: box.recipes.length === 1 ? 'recipe' : 'recipes', on: () => (setQ(''), setSection('recipes')) } : null,
    data ? { k: 'g', b: todo, t: 'on the grocery list', on: () => (setQ(''), setSection('kitchen')) } : null,
    pick ? { k: 't', t: `Tonight: ${pick.r.title}`, href: recipeHref(openId(pick.r)), rid: openId(pick.r), hot: true } : null,
  ].filter(Boolean);
  const compact = section === 'prep' || section === 'sourdough';
  const searching = q.trim().length > 0;
  const firstHit = () => {
    const { mine, web } = searchAll(box, recipes, q);
    const top = mine[0] ? mine[0].r.id : web[0] ? `bb-${web[0].id}` : null;
    if (top) {
      noteRecent(top);
      openRecipe(top);
    }
  };
  let body;
  if (searching) body = <SearchResults q={q} box={box || RB.defaultBox()} recipes={recipes} onAdd={() => setForm('new')} />;
  else if (section === 'sourdough') body = <SourdoughSection data={sourdough} mutate={mutateSourdough} />;
  else if (section === 'recipes')
    body = box ? (
      <>
        <RecentStrip box={box} />
        <RecipeBoxSection box={box} data={data} onAdd={() => setForm('new')} onImport={() => setImporting(true)} />
      </>
    ) : (
      <section className="card">
        <p className="empty">{boxError || 'Loading…'}</p>
      </section>
    );
  else if (!data)
    body = (
      <section className="card">
        <p className="empty">{error || 'Loading…'}</p>
      </section>
    );
  else if (section === 'prep') body = <MealPrepSection data={data} recipes={recipes} mutate={mutate} onOpen={open} box={box} />;
  else
    body = (
      <div className="grid">
        <div className="col">
          <GroceryCard data={data} mutate={mutate} onFinish={onFinishShop} />
          <KitchenCard data={data} recipes={recipes} mutate={mutate} />
        </div>
        <div className="col">
          <CookNowCard data={data} recipes={recipes} box={box} />
          <PicksCard data={data} recipes={recipes} onMore={() => (setSection('prep'), window.scrollTo(0, 0))} />
        </div>
      </div>
    );
  return (
    <BoxCtx.Provider value={ctx}>
      <div className={`home cooking sec-${section} ${rid ? 'has-recipe' : ''}`}>
        <div className="cook-tab" hidden={!!rid}>
          <CookHero box={box} q={q} setQ={setQ} onEnter={firstHit} compact={compact} chips={chips} />
          <SectionTabs list={COOK_SECTIONS} value={section} onChange={(k) => (setSection(k), setQ(''))} label="Cooking sections" />
          {error && section !== 'recipes' && section !== 'sourdough' ? <div className="alert">{error}</div> : null}
          {boxError && section === 'recipes' ? <div className="alert">{boxError}</div> : null}
          {body}
        </div>
        {view}
        {sheets}
      </div>
    </BoxCtx.Provider>
  );
}

// Tonight's best dinner from what's in the kitchen (used by the Home header too).
export function tonightPick(data, recipes, box) {
  if (!data || !data.kitchen.length) return null;
  return rankRecipes(listFor(box, recipes), kitchenKeys(data), { course: 'main', limit: 1 })[0] || null;
}

export function CookingHomeCard({ data, recipes, sourdough, box }) {
  const best = useMemo(() => tonightPick(data, recipes, box), [data, recipes, box]);
  if (!data) return null;
  const todo = data.grocery.filter((g) => !g.done);
  return (
    <section className="card home-cooking">
      <div className="card-head">
        <h2 className="card-title">Cooking</h2>
        <a className="link small" href="#/cooking">
          {box && box.recipes.length ? `${plural(box.recipes.length, 'recipe')} →` : 'Kitchen →'}
        </a>
      </div>
      <a className="home-row" href="#/cooking">
        <span className="grow">
          <span className="bill-name">Grocery list</span>
          <span className="muted small block">
            {todo.length ? todo.slice(0, 5).map((g) => g.name).join(', ') + (todo.length > 5 ? `, +${todo.length - 5} more` : '') : 'Nothing on it'}
          </span>
        </span>
        <span className="num badge">{todo.length}</span>
      </a>
      {best ? (
        <a className="home-row" href={recipeHref(openId(best.r))} onClick={openLink(openId(best.r))}>
          <span className="grow">
            <span className="bill-name">Tonight: {best.r.title}</span>
            <span className="muted small block">
              {best.m.missing.length ? `Need ${best.m.missing.slice(0, 3).map(label).join(', ')}` : 'You have everything'}
              {best.r.perServing != null ? ` · ${money(best.r.perServing)}/serving` : ''}
            </span>
          </span>
        </a>
      ) : (
        <p className="muted small note">{data.kitchen.length ? 'Add a few more kitchen items for dinner ideas.' : 'Add what’s in your kitchen to get dinner ideas.'}</p>
      )}
      {planLine(data) ? (
        <a className="home-row" href="#/cooking?prep">
          <span className="grow">
            <span className="bill-name">This week’s prep</span>
            <span className="muted small block">
              {planLine(data)}: {data.plan.slice(0, 3).map((r) => r.title).join(', ')}
              {data.plan.length > 3 ? `, +${data.plan.length - 3} more` : ''}
            </span>
          </span>
        </a>
      ) : null}
      <SourdoughHomeRow data={sourdough} />
    </section>
  );
}
