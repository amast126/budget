// Cooking → Meal prep: every recipe in the weekly file (this week's 30 picks and the whole well-liked pool, with
// Budget Bytes' own meal prep collection tagged), searchable and filterable, and a plan for the week that turns
// into one grocery list.
import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { kitchenKeys, findRecipes, MP_SHOW, MP_PROTEIN, MP_EXTRAS, MP_SORT, inPlan, togglePlan, removePlan, clearPlan, planTotals, planShopping, addPlanToGrocery, imageUrl, label } from './cooking-logic.js';
import { asCookable } from './recipebox-logic.js';
import { RecipeImg } from './recipebox.jsx';
import { PlateArt } from './plate-art.jsx';

const money = (n) => (n == null ? null : `$${Number(n).toFixed(2)}`);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const mins = (m) => (!m ? null : m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`);
const PAGE = 30;

// A card-size photo: the recipe's own, else the thumbnail's bigger sibling, else the thumbnail.
function Photo({ recipes, r, className = 'mp-img' }) {
  if (r.box || r.photo || r.imgUrl) return <RecipeImg r={r} className={className} />;
  return <WebPhoto recipes={recipes} r={r} className={className} />;
}
function WebPhoto({ recipes, r, className }) {
  const big = r.image || (r.thumb ? r.thumb.replace(/-160x160(\.\w+)$/, '-400x300$1') : null);
  const [src, setSrc] = useState(big ? imageUrl(recipes, big) : null);
  useEffect(() => setSrc(big ? imageUrl(recipes, big) : null), [big]);
  if (!src)
    return (
      <span className={`rimg art ${className}`} aria-hidden="true">
        <PlateArt r={r} />
      </span>
    );
  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        const small = r.thumb ? imageUrl(recipes, r.thumb) : null;
        setSrc(small && small !== src ? small : null);
      }}
    />
  );
}

function RecipeCard({ r, m, recipes, planned, onOpen, onPlan, hasKitchen }) {
  const bits = [r.perServing != null ? `${money(r.perServing)}/serving` : null, mins(r.minutes), r.nutrition && r.nutrition[1] != null ? `${Math.round(r.nutrition[1])}g protein` : r.nutrition ? `${Math.round(r.nutrition[0])} cal` : null].filter(Boolean);
  const tags = [];
  if (r.box) tags.push(r.source && r.source !== 'Mine' ? r.source : 'Yours');
  if (r.mp) tags.push('Meal prep');
  if ((r.prep || []).includes('noreheat')) tags.push('No reheat');
  return (
    <li className={`mp-card ${planned ? 'planned' : ''}`}>
      <button className="mp-open" onClick={() => onOpen(r)}>
        <Photo recipes={recipes} r={r} />
        <span className="mp-body">
          <span className="mp-title">{r.title}</span>
          <span className="muted small">{bits.join(' · ')}</span>
          {tags.length ? (
            <span className="mp-tags">
              {tags.map((t) => (
                <span key={t} className="spill t-green">
                  {t}
                </span>
              ))}
            </span>
          ) : null}
          {hasKitchen && m ? <span className={`small ${m.missing.length ? 'rc-miss' : 'rc-ok'}`}>{m.missing.length ? `Need ${m.missing.length} of ${m.total}` : 'You have everything'}</span> : null}
        </span>
      </button>
      <button className={`mp-add ${planned ? 'on' : ''}`} aria-pressed={planned} aria-label={planned ? `Remove ${r.title} from this week’s prep` : `Add ${r.title} to this week’s prep`} onClick={() => onPlan(r, planned)}>
        {planned ? <Icon name="check" size={15} /> : '+'} {planned ? 'Planned' : 'Plan'}
      </button>
    </li>
  );
}

function PlanCard({ data, recipes, mutate, onOpen, kKeys, box }) {
  const plan = data.plan || [];
  const t = planTotals(plan);
  const shop = useMemo(() => planShopping(plan, kKeys), [plan, kKeys]);
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="card mp-plan">
      <div className="card-head">
        <h2 className="card-title">This week’s prep</h2>
        {plan.length ? (
          <span className="muted small num">
            {plural(t.recipes, 'recipe')} · {plural(t.servings, 'serving')}
            {t.priced ? ` · about ${money(t.cost)}` : ''}
          </span>
        ) : null}
      </div>
      {plan.length === 0 ? (
        <p className="empty">Tap Plan on any recipe below to line up the week. Everything you’re missing then goes on the grocery list in one tap.</p>
      ) : (
        <>
          <ul className="list mp-plan-list">
            {plan.map((r) => (
              <li key={r.id} className="mp-plan-row">
                <button className="rc" onClick={() => onOpen(r)}>
                  <Photo recipes={recipes} r={(r.box && box && box.recipes.find((x) => x.id === r.id)) || r} className="thumb" />
                  <span className="grow">
                    <span className="rc-title">{r.title}</span>
                    <span className="muted small">
                      {[r.servings ? plural(r.servings, 'serving') : null, r.perServing != null ? `${money(r.perServing)}/serving` : null, r.nutrition ? `${Math.round(r.nutrition[0])} cal${r.nutrition[1] != null ? ` · ${Math.round(r.nutrition[1])}g protein` : ''}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
                <button className="x" aria-label={`Remove ${r.title} from this week’s prep`} onClick={() => mutate((d) => removePlan(d, r.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          {t.calories != null ? (
            <p className="muted small note">
              Averages {Math.round(t.calories)} cal and {Math.round(t.protein)}g protein a serving.
            </p>
          ) : null}
          {shop.length ? (
            <>
              <p className="small mp-need">
                <b>{plural(shop.length, 'thing')} to buy:</b> {shop.slice(0, 12).map((s) => s.name).join(', ')}
                {shop.length > 12 ? `, +${shop.length - 12} more` : ''}
              </p>
              <button className="btn primary block" onClick={() => mutate((d) => addPlanToGrocery(d, kKeys), `Added the week’s missing ingredients to the grocery list`)}>
                Add {plural(shop.length, 'missing item')} to the grocery list
              </button>
            </>
          ) : (
            <p className="ok-note">You have everything for this week’s prep.</p>
          )}
          <button
            className="btn quiet block"
            onClick={() => {
              if (!confirm) return setConfirm(true);
              setConfirm(false);
              mutate((d) => clearPlan(d), 'Cleared this week’s prep');
            }}
          >
            {confirm ? 'Tap again to clear the plan' : 'Start a new week'}
          </button>
        </>
      )}
    </section>
  );
}

export function MealPrepSection({ data, recipes, mutate, onOpen, box }) {
  const [view, setView] = useState('week');
  const [q, setQ] = useState('');
  const [show, setShow] = useState('all');
  const [protein, setProtein] = useState('any');
  const [extras, setExtras] = useState([]);
  const [sort, setSort] = useState('best');
  const [limit, setLimit] = useState(PAGE);
  const kKeys = useMemo(() => kitchenKeys(data), [data.kitchen]);
  const picks = (recipes && recipes.picks) || [];
  const pool = (recipes && recipes.pool) || [];
  // The whole list, with this week's picks (which carry full ingredient lines) in place of their pool entries,
  // most popular first; your own recipes join too.
  const all = useMemo(() => {
    const byId = new Map(picks.map((r) => [r.id, r]));
    // your own recipes, then the file (recipes you saved from it stay here in their Budget Bytes form)
    const mine = (box ? box.recipes : []).filter((r) => r.webId == null).map(asCookable);
    return [...mine, ...pool.map((r) => byId.get(r.id) || r)];
  }, [recipes, box]);
  const list = view === 'week' ? picks : all;
  const results = useMemo(() => findRecipes(list, { q, show, protein, extras, kKeys, sort: view === 'all' && sort === 'best' ? 'popular' : sort }), [list, q, show, protein, extras, kKeys, sort, view]);
  useEffect(() => setLimit(PAGE), [view, q, show, protein, extras, sort]);
  const plan = new Set((data.plan || []).map((r) => String(r.id)));
  const toggleExtra = (k) => setExtras(extras.includes(k) ? extras.filter((x) => x !== k) : [...extras, k]);
  const onPlan = (r, planned) => mutate((d) => togglePlan(d, r), planned ? `Removed ${r.title} from this week’s prep` : `Added ${r.title} to this week’s prep`);
  const mpCount = pool.filter((r) => r.mp).length;
  const filtered = q || show !== 'all' || protein !== 'any' || extras.length;
  return (
    <div className="mealprep">
      <PlanCard data={data} recipes={recipes} mutate={mutate} onOpen={onOpen} kKeys={kKeys} box={box} />
      <section className="card mp-browse">
        <div className="card-head wrap">
          <h2 className="card-title">Recipes</h2>
          <div className="seg" role="group" aria-label="Which recipes">
            <button className={`seg-btn ${view === 'week' ? 'on' : ''}`} aria-pressed={view === 'week'} onClick={() => setView('week')}>
              This week’s {picks.length}
            </button>
            <button className={`seg-btn ${view === 'all' ? 'on' : ''}`} aria-pressed={view === 'all'} onClick={() => setView('all')}>
              All {all.length}
            </button>
          </div>
        </div>
        {!recipes ? (
          <p className="empty">Loading…</p>
        ) : (
          <>
            <label className="search-box mp-search">
              <Icon name="search" size={18} />
              <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes or ingredients: chicken, lentils, burrito…" aria-label="Search recipes" />
            </label>
            <div className="mp-filters">
              <div className="chips" role="group" aria-label="Kind of recipe">
                {MP_SHOW.map(([k, l]) => (
                  <button key={k} className={`chip ${show === k ? 'on' : ''}`} aria-pressed={show === k} onClick={() => setShow(k)}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="chips" role="group" aria-label="Protein">
                {MP_PROTEIN.map(([k, l]) => (
                  <button key={k} className={`chip ${protein === k ? 'on' : ''}`} aria-pressed={protein === k} onClick={() => setProtein(k)}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="chips" role="group" aria-label="More filters">
                {MP_EXTRAS.filter(([k]) => k !== 'have' || data.kitchen.length).map(([k, l]) => (
                  <button key={k} className={`chip ${extras.includes(k) ? 'on' : ''}`} aria-pressed={extras.includes(k)} onClick={() => toggleExtra(k)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="row-between mp-count">
              <span className="muted small">
                {plural(results.length, 'recipe')}
                {filtered ? ' match' : ''}
                {view === 'week' ? ' this week' : ''}
                {filtered ? (
                  <>
                    {' · '}
                    <button
                      className="linkish small"
                      onClick={() => {
                        setQ('');
                        setShow('all');
                        setProtein('any');
                        setExtras([]);
                      }}
                    >
                      Clear filters
                    </button>
                  </>
                ) : null}
              </span>
              <select className="inline-select small" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
                {MP_SORT.filter(([k]) => k !== 'missing' || data.kitchen.length).map(([k, l]) => (
                  <option key={k} value={k}>
                    {k === 'best' && view === 'all' ? 'Most popular' : l}
                  </option>
                ))}
              </select>
            </div>
            {results.length === 0 ? (
              <p className="empty">{view === 'week' && filtered ? 'None of this week’s picks match. Try All.' : 'Nothing matches. Try fewer filters.'}</p>
            ) : (
              <ul className="mp-grid">
                {results.slice(0, limit).map(({ r, m }) => (
                  <RecipeCard key={r.id} r={r} m={m} recipes={recipes} planned={plan.has(String(r.id))} onOpen={onOpen} onPlan={onPlan} hasKitchen={data.kitchen.length > 0} />
                ))}
              </ul>
            )}
            {results.length > limit ? (
              <button className="btn quiet block" onClick={() => setLimit(limit + PAGE * 2)}>
                Show more ({results.length - limit} left)
              </button>
            ) : null}
            <p className="muted small note">
              {picks.length} new picks every Saturday, from {pool.length} well-liked Budget Bytes recipes
              {mpCount ? `, ${mpCount} of them in its meal prep collection` : ''}. Costs are Budget Bytes’ estimates; steps are on their site.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

// "This week's prep" in a line, for Home's Cooking card.
export function planLine(data) {
  const plan = (data && data.plan) || [];
  if (!plan.length) return null;
  const t = planTotals(plan);
  return `${plural(t.recipes, 'recipe')} · ${plural(t.servings, 'serving')}`;
}

