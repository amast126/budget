import React, { useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { fmt, todayISO, dateLabel } from './budget-logic.js';
import { normalize, covers, STAPLES } from './ingredients.mjs';
import {
  PLACES,
  COURSES,
  splitItems,
  kitchenKeys,
  addKitchen,
  removeKitchen,
  setWhere,
  toggleLow,
  addGrocery,
  toggleGrocery,
  removeGrocery,
  rankRecipes,
  match,
  recipeUrl,
  imageUrl,
  saveWeb,
  removeMine,
  madeIt,
  addMine,
  missingNames,
  label,
} from './cooking-logic.js';

const money = (n) => (n == null ? null : `$${Number(n).toFixed(2)}`);
function mins(m) {
  if (!m) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
// My recipes join the matching as dinners.
const asMine = (r) => ({ ...r, course: 'main', mine: true });
const listFor = (data, recipes) => {
  const saved = new Set(data.mine.map((r) => r.webId).filter(Boolean));
  // Skip one- or two-ingredient technique posts ("how to boil an egg") and anything already saved as yours.
  return [...data.mine.map(asMine), ...((recipes && recipes.pool) || []).filter((r) => !saved.has(r.id) && (r.keys || []).length >= 3)];
};
// Card-size photo for pool recipes, which only carry a thumbnail (hidden if that size doesn't exist).
const bigFromThumb = (p) => (p ? p.replace(/-160x160(\.\w+)$/, '-400x300$1') : null);

function Thumb({ recipes, r }) {
  const src = r.thumb ? imageUrl(recipes, r.thumb) : null;
  if (!src)
    return (
      <span className="thumb ph" aria-hidden="true">
        <Icon name="pot" size={20} />
      </span>
    );
  return <img className="thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />;
}

function Meta({ r, m }) {
  const bits = [];
  if (m) bits.push(m.missing.length === 0 ? 'You have everything' : `Have ${m.have.length} of ${m.total}`);
  if (r.perServing != null) bits.push(`${money(r.perServing)}/serving`);
  if (r.minutes) bits.push(mins(r.minutes));
  if (r.mine) bits.push(r.made ? `Made ${r.made}×` : 'Yours');
  return <span className="muted small">{bits.join(' · ')}</span>;
}

function RecipeRow({ r, m, recipes, onOpen }) {
  return (
    <li>
      <button className="rc" onClick={() => onOpen(r)}>
        <Thumb recipes={recipes} r={r} />
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
      </button>
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

// ---------------------------------------------------------------- recipes
function CookNowCard({ data, recipes, onOpen }) {
  const [course, setCourse] = useState('main');
  const kKeys = useMemo(() => kitchenKeys(data), [data.kitchen]);
  const ranked = useMemo(() => rankRecipes(listFor(data, recipes), kKeys, { course, limit: 8 }), [data, recipes, kKeys, course]);
  return (
    <section className="card">
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
        <p className="empty">Add a few things to your kitchen and the best matches from your recipes and Budget Bytes’ most popular ones show up here.</p>
      ) : ranked.length === 0 ? (
        <p className="empty">No close matches yet. Add a few more kitchen staples.</p>
      ) : (
        <ul className="list rc-list">
          {ranked.map(({ r, m }) => (
            <RecipeRow key={r.id} r={r} m={m} recipes={recipes} onOpen={onOpen} />
          ))}
        </ul>
      )}
      <p className="muted small note">Fewest missing ingredients first{recipes && recipes.pool ? `, from your recipes and ${recipes.pool.length} popular Budget Bytes recipes` : ''}.</p>
    </section>
  );
}

function PicksCard({ data, recipes, onOpen }) {
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
          {picks.map((r) => {
            const m = data.kitchen.length ? match(r, kKeys) : null;
            return (
              <button key={r.id} className="pick" onClick={() => onOpen(r)}>
                {r.image ? <img className="pick-img" src={imageUrl(recipes, r.image)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="pick-img ph" />}
                <span className="pick-body">
                  <span className="pick-title">{r.title}</span>
                  <span className="muted small">
                    {[r.perServing != null ? `${money(r.perServing)}/serving` : null, mins(r.minutes)].filter(Boolean).join(' · ')}
                  </span>
                  {m ? <span className={`small ${m.missing.length ? 'rc-miss' : 'rc-ok'}`}>{m.missing.length ? `Need ${m.missing.length} of ${m.total}` : 'You have everything'}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="muted small note">
        Popular budget recipes, 12 new ones every Saturday with no repeats for 12 weeks. Costs are Budget Bytes’ estimates.
        {src && !src.ok ? ' The last update couldn’t reach the site, so these are from the week before.' : ''}
      </p>
    </section>
  );
}

function MineCard({ data, recipes, onOpen, onAdd }) {
  const kKeys = useMemo(() => kitchenKeys(data), [data.kitchen]);
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">My recipes</h2>
        <button className="btn quiet small" onClick={onAdd}>
          + Add
        </button>
      </div>
      {data.mine.length === 0 ? (
        <p className="empty">Save picks you like, or add your own.</p>
      ) : (
        <ul className="list rc-list">
          {data.mine.map((r) => (
            <RecipeRow key={r.id} r={asMine(r)} m={data.kitchen.length ? match(r, kKeys) : null} recipes={recipes} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecipeSheet({ r, data, recipes, mutate, onLogRecipe, onClose }) {
  const [confirm, setConfirm] = useState(false);
  const kKeys = kitchenKeys(data);
  const isMine = data.mine.some((x) => x.id === r.id);
  const savedId = !isMine && data.mine.some((x) => x.id === 'bb-' + r.id);
  const m = match(r, kKeys);
  const url = recipeUrl(recipes, r);
  const img = imageUrl(recipes, r.image || bigFromThumb(r.thumb));
  const have = (k) => k && kKeys.some((a) => covers(a, k));
  // Lines to show: the recipe's own lines, your typed lines, or just ingredient names.
  const lines = r.lines
    ? r.lines
    : r.ingredients
      ? r.ingredients.map((t) => ({ t, k: normalize(t), o: /optional/i.test(t) }))
      : (r.keys || []).map((k) => ({ t: label(k), k }));
  const miss = missingNames(r, m);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label={r.title} onClick={(e) => e.stopPropagation()}>
        {img ? <img className="sheet-img" src={img} alt="" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
        <h2 className="card-title">{r.title}</h2>
        <p className="muted small">
          {[
            r.perServing != null ? `${money(r.perServing)} a serving` : null,
            r.total != null ? `${money(r.total)} total` : null,
            mins(r.minutes),
            r.servings ? plural(r.servings, 'serving') : null,
            r.ratings ? `★ ${r.stars} (${r.ratings.toLocaleString()} ratings)` : null,
            isMine && r.made ? `Made ${r.made}× · last ${dateLabel(r.lastMade)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {r.nutrition ? (
          <p className="small nutri">
            Per serving: <b>{r.nutrition[0]} cal</b> · protein {r.nutrition[1]}g · carbs {r.nutrition[2]}g · fat {r.nutrition[3]}g
          </p>
        ) : null}
        <h3 className="k-head">
          Ingredients {m.total ? <span className="muted">· you have {m.have.length} of {m.total}</span> : null}
        </h3>
        <ul className="ing">
          {lines.map((l, i) =>
            l.h ? (
              <li key={i} className="ing-h">
                {l.h}
              </li>
            ) : (
              <li key={i} className={STAPLES.has(l.k) ? 'staple' : have(l.k) ? 'have' : l.o ? 'opt' : 'miss'}>
                <span className="mark" aria-hidden="true">
                  {STAPLES.has(l.k) || have(l.k) ? <Icon name="check" size={14} /> : '○'}
                </span>
                <span>
                  {l.t}
                  {l.o && !/optional/i.test(l.t) ? <span className="muted"> (optional)</span> : null}
                </span>
              </li>
            )
          )}
        </ul>
        {!r.lines && !r.ingredients ? <p className="muted small">Amounts and steps are on Budget Bytes.</p> : null}
        {r.notes ? <p className="small notes">{r.notes}</p> : null}
        {miss.length ? (
          <button className="btn primary block" onClick={() => mutate((d) => addGrocery(d, miss, r.title), `Added ${plural(miss.length, 'item')} to the grocery list`)}>
            Add {plural(miss.length, 'missing item')} to the grocery list
          </button>
        ) : (
          <p className="ok-note">You have everything for this.</p>
        )}
        {r.nutrition && onLogRecipe ? (
          <button className="btn quiet block" onClick={() => onLogRecipe(r)}>
            Log a serving to Health · {r.nutrition[0]} cal
          </button>
        ) : null}
        {url ? (
          <a className="btn quiet block" href={url} target="_blank" rel="noopener">
            {r.slug || r.webId ? 'Full recipe on Budget Bytes' : 'Open recipe'} <Icon name="ext" size={15} />
          </a>
        ) : null}
        {isMine ? (
          <>
            <button className="btn quiet block" onClick={() => mutate((d) => madeIt(d, r.id), `Nice. ${r.title} marked as made`)}>
              I made this
            </button>
            <button
              className="btn quiet block danger-text"
              onClick={() => {
                if (!confirm) return setConfirm(true);
                mutate((d) => removeMine(d, r.id), `Removed ${r.title}`);
                onClose();
              }}
            >
              {confirm ? 'Tap again to remove it' : 'Remove from My recipes'}
            </button>
          </>
        ) : savedId ? (
          <p className="muted small">Saved in My recipes.</p>
        ) : (
          <button className="btn quiet block" onClick={() => mutate((d) => saveWeb(d, r, recipes), 'Saved to My recipes')}>
            Save to My recipes
          </button>
        )}
        <button className="btn quiet block" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function AddRecipeSheet({ mutate, onClose }) {
  const [f, setF] = useState({ title: '', url: '', ingredients: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    mutate((d) => addMine(d, f), `Added ${f.title.trim()}`);
    onClose();
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet tall" role="dialog" aria-label="Add a recipe" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2 className="card-title">Add a recipe</h2>
        <label className="field wide">
          <span className="small muted">Name</span>
          <input className="input" value={f.title} onChange={set('title')} autoFocus />
        </label>
        <label className="field wide">
          <span className="small muted">Link (optional)</span>
          <input className="input" type="url" value={f.url} onChange={set('url')} placeholder="https://" />
        </label>
        <label className="field wide">
          <span className="small muted">Ingredients, one per line</span>
          <textarea className="input" rows={7} value={f.ingredients} onChange={set('ingredients')} placeholder={'1 lb chicken thighs\n2 cloves garlic\n1 cup rice'} />
        </label>
        <label className="field wide">
          <span className="small muted">Notes (optional)</span>
          <textarea className="input" rows={3} value={f.notes} onChange={set('notes')} />
        </label>
        <button className="btn primary block" type="submit" disabled={!f.title.trim()}>
          Save recipe
        </button>
        <button className="btn quiet block" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- page + home card
export function CookingPage({ data, recipes, mutate, error, onFinishShop, onLogRecipe }) {
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  if (!data) {
    return (
      <div className="home">
        <header className="page-head">
          <h1 className="page-title">Cooking</h1>
        </header>
        <section className="card">
          <p className="empty">{error || 'Loading…'}</p>
        </section>
      </div>
    );
  }
  // Keep the open recipe in sync with saved changes (My recipes edits).
  const current = open && open.mine ? data.mine.find((x) => x.id === open.id) || open : open;
  return (
    <div className="home cooking">
      <header className="page-head">
        <h1 className="page-title">Cooking</h1>
        <div className="muted">
          {plural(data.kitchen.length, 'thing')} in the kitchen · {plural(data.grocery.filter((g) => !g.done).length, 'item')} on the list
        </div>
      </header>
      {error ? <div className="alert">{error}</div> : null}
      <div className="grid">
        <div className="col">
          <GroceryCard data={data} mutate={mutate} onFinish={onFinishShop} />
          <KitchenCard data={data} recipes={recipes} mutate={mutate} />
        </div>
        <div className="col">
          <CookNowCard data={data} recipes={recipes} onOpen={setOpen} />
          <PicksCard data={data} recipes={recipes} onOpen={setOpen} />
          <MineCard data={data} recipes={recipes} onOpen={(r) => setOpen(r)} onAdd={() => setAdding(true)} />
        </div>
      </div>
      {current ? <RecipeSheet r={current} data={data} recipes={recipes} mutate={mutate} onLogRecipe={onLogRecipe} onClose={() => setOpen(null)} /> : null}
      {adding ? <AddRecipeSheet mutate={mutate} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

// Tonight's best dinner from what's in the kitchen (used by the Home header too).
export function tonightPick(data, recipes) {
  if (!data || !data.kitchen.length) return null;
  return rankRecipes(listFor(data, recipes), kitchenKeys(data), { course: 'main', limit: 1 })[0] || null;
}

export function CookingHomeCard({ data, recipes }) {
  const kKeys = useMemo(() => (data ? kitchenKeys(data) : []), [data]);
  const best = useMemo(() => (data && data.kitchen.length ? rankRecipes(listFor(data, recipes), kKeys, { course: 'main', limit: 1 })[0] : null), [data, recipes, kKeys]);
  if (!data) return null;
  const todo = data.grocery.filter((g) => !g.done);
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Cooking</h2>
        <a className="link small" href="#/cooking">
          Kitchen →
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
        <a className="home-row" href="#/cooking">
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
    </section>
  );
}
