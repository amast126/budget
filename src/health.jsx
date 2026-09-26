import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { useWidth, Tip } from './chart-kit.jsx';
import { hasHk, hkDay, stepsFor, workoutsOn, ringsOf, fmtMins, daysBetween as hkDaysBetween } from './hk-logic.js';
import { ImportCard, DayVitalsCard, RingBars, ActivityView, HeartView, SleepView, BodyView, HearingView, ViewTabs, EmptyHk, WorkoutSheet, workoutLine } from './health-hk.jsx';
import { dateLabel } from './budget-logic.js';
import {
  MEALS,
  ACTIVITY,
  GOALS,
  WORKOUTS,
  targets,
  latestWeight,
  getDay,
  totals,
  mealNow,
  week,
  portionsOf,
  defaultPortion,
  nutrientsFor,
  recentFoods,
  weightSeries,
  weightStats,
  workoutKcal,
  todayISO,
  addDays,
  ageOf,
} from './health-logic.js';
import { searchUsda, lookupBarcode, startScanner, decodePhoto } from './food-api.js';

const n0 = (n) => Math.round(Number(n) || 0).toLocaleString();
const g1 = (n) => {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
const mealLabel = (m) => (MEALS.find((x) => x[0] === m) || MEALS[3])[1];
const dayTitle = (iso) => {
  const t = todayISO();
  if (iso === t) return 'Today';
  if (iso === addDays(t, -1)) return 'Yesterday';
  return dateLabel(iso);
};

// ---------------------------------------------------------------- small pieces
function MacroBar({ label, value, target, unit = 'g' }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const over = target && value > target * 1.1;
  return (
    <div className="macro">
      <div className="macro-name small">{label}</div>
      <div className="num macro-val">
        <b>{n0(value)}</b>
        {target ? <span className="muted"> / {n0(target)}{unit}</span> : unit}
      </div>
      <div className="bar slim">
        <div className={`bar-fill ${over ? 'bar-ahead' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- weight chart
const RANGES = [
  [30, '30 days'],
  [90, '90 days'],
  [365, '1 year'],
  ['all', 'All'],
];
function niceStep(span) {
  const steps = [0.5, 1, 2, 5, 10, 20];
  return steps.find((s) => span / s <= 4) || 50;
}
function WeightChart({ series, days }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const today = todayISO();
  const start = days === 'all' ? (series[0] ? series[0].date : today) : addDays(today, -days + 1);
  const pts = series.filter((p) => p.date >= start);
  const H = 170;
  const pad = { l: 34, r: 42, t: 10, b: 22 };
  if (!pts.length) return <p className="empty">{series.length ? 'No weigh-ins in this range. Tap All to see older ones.' : 'No weigh-ins in this range yet.'}</p>;
  const toT = (iso) => new Date(`${iso}T12:00:00`).getTime();
  const t0 = toT(start);
  const t1 = toT(today);
  const vals = pts.flatMap((p) => [p.lb, p.avg]);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 2) {
    lo -= 1;
    hi += 1;
  }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const W = width;
  const x = (iso) => pad.l + ((toT(iso) - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  // Break the trend line across long gaps (e.g. years without a scale).
  const line = pts.map((p, i) => `${i && toT(p.date) - toT(pts[i - 1].date) < 21 * 86400000 ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    let best = pts[0];
    for (const p of pts) if (Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px)) best = p;
    setTip({
      x: Math.min(W - 150, Math.max(0, x(best.date) + 10)),
      y: 4,
      at: best.date,
      lines: [
        { text: dateLabel(best.date) },
        { key: 'k-dot', value: `${g1(best.lb)} lb`, text: 'weigh-in' },
        { key: 'k-line', value: `${g1(best.avg)} lb`, text: '7-day average' },
      ],
    });
  };
  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`Weight ${days === 'all' ? 'since the first weigh-in' : `over the last ${days} days`}: ${g1(last.avg)} lb 7-day average`}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
            <text className="axis" x={pad.l - 6} y={y(v) + 4} textAnchor="end">
              {g1(v)}
            </text>
          </g>
        ))}
        <text className="axis" x={pad.l} y={H - 5}>
          {days === 'all' || days === 365 ? new Date(`${start}T12:00:00`).toLocaleString('en-US', { month: 'short', year: 'numeric' }) : dateLabel(start)}
        </text>
        <text className="axis" x={W - pad.r} y={H - 5} textAnchor="end">
          Today
        </text>
        {tip ? <line className="crosshair" x1={x(tip.at)} x2={x(tip.at)} y1={pad.t} y2={H - pad.b} /> : null}
        {pts.map((p) => (
          <circle key={p.date} className="wdot" cx={x(p.date)} cy={y(p.lb)} r={pts.length > 120 ? 2.5 : 4} />
        ))}
        {pts.length > 1 ? <path className="wline" d={line} /> : null}
        <text className="end-label num" x={x(last.date) + 7} y={y(last.avg) + 4}>
          {g1(last.avg)}
        </text>
        <rect x={pad.l} y={0} width={W - pad.l - pad.r} height={H} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setTip(null)} />
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------- 7-day calories chart
function WeekChart({ wk, target }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const H = 130;
  const pad = { l: 6, r: 6, t: 14, b: 20 };
  const vals = wk.days.map((d) => totals(d.food).k);
  const max = Math.max(target || 0, ...vals, 500) * 1.08;
  const slot = (width - pad.l - pad.r) / 7;
  const bw = Math.min(24, slot * 0.55);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const base = H - pad.b;
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={H} role="img" aria-label="Calories eaten each of the last 7 days">
        <line className="grid" x1={pad.l} x2={width - pad.r} y1={base} y2={base} />
        {target ? (
          <g>
            <line className="target-line" x1={pad.l} x2={width - pad.r} y1={y(target)} y2={y(target)} />
            <text className="axis" x={width - pad.r} y={y(target) - 4} textAnchor="end">
              Target {n0(target)}
            </text>
          </g>
        ) : null}
        {wk.days.map((d, i) => {
          const v = vals[i];
          const cx = pad.l + slot * i + slot / 2;
          const h = Math.max(0, base - y(v));
          const r = Math.min(4, h / 2, bw / 2);
          const x0 = cx - bw / 2;
          const path = h > 0 ? `M${x0},${base} V${base - h + r} Q${x0},${base - h} ${x0 + r},${base - h} H${x0 + bw - r} Q${x0 + bw},${base - h} ${x0 + bw},${base - h + r} V${base} Z` : '';
          const show = () =>
            setTip({ x: Math.min(width - 140, Math.max(0, cx - 60)), y: 0, lines: [{ text: dateLabel(d.iso) }, { key: 'k-bar', value: v ? n0(v) : '—', text: v ? 'calories' : 'nothing logged' }] });
          return (
            <g key={d.iso} tabIndex={0} onPointerEnter={show} onFocus={show} onPointerLeave={() => setTip(null)} onBlur={() => setTip(null)} aria-label={`${dateLabel(d.iso)}: ${v ? `${n0(v)} calories` : 'nothing logged'}`}>
              <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" />
              {path ? <path className="wbar" d={path} /> : <line className="grid" x1={x0} x2={x0 + bw} y1={base - 1} y2={base - 1} />}
              <text className="axis" x={cx} y={H - 5} textAnchor="middle">
                {new Date(`${d.iso}T12:00:00`).toLocaleString('en-US', { weekday: 'narrow' })}
              </text>
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------- food detail (portion, amount, meal)
function FoodDetail({ food, initial, meal: meal0, onSave, onBack, saveLabel = 'Add' }) {
  const portions = portionsOf(food);
  const d = initial || defaultPortion(food);
  const [pi, setPi] = useState(Math.max(0, portions.findIndex((p) => p.label === d.portion.label)));
  const [qty, setQty] = useState(String(d.qty));
  const [meal, setMeal] = useState(meal0);
  const portion = portions[pi] || portions[0];
  const q = Number(qty);
  const n = nutrientsFor(food, portion, q || 0);
  return (
    <div className="food-detail">
      {onBack ? (
        <button className="link-btn small" onClick={onBack}>
          ‹ Back
        </button>
      ) : null}
      <h3 className="fd-name">{food.name}</h3>
      {food.brand ? <div className="muted small">{food.brand}</div> : null}
      <div className="qa fd-form">
        <label className="field">
          <span className="small muted">Amount</span>
          <input className="input num" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Amount" autoFocus />
        </label>
        <label className="field">
          <span className="small muted">Unit</span>
          <select className="input" value={pi} onChange={(e) => setPi(Number(e.target.value))} aria-label="Unit">
            {portions.map((p, i) => (
              <option key={i} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="seg meal-seg" role="group" aria-label="Meal">
        {MEALS.map(([k, l]) => (
          <button key={k} type="button" className={`seg-btn ${meal === k ? 'on' : ''}`} onClick={() => setMeal(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="fd-totals">
        <div>
          <b className="num">{n0(n.k)}</b>
          <span>cal</span>
        </div>
        <div>
          <b className="num">{g1(n.p)}g</b>
          <span>protein</span>
        </div>
        <div>
          <b className="num">{g1(n.c)}g</b>
          <span>carbs</span>
        </div>
        <div>
          <b className="num">{g1(n.f)}g</b>
          <span>fat</span>
        </div>
      </div>
      <button className="btn primary block" disabled={!(q > 0)} onClick={() => onSave(food, portion, q, meal)}>
        {saveLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- add food sheet
function FoodRow({ f, onPick, sub }) {
  const per = f.per100 ? `${n0(f.per100.k)} cal / 100 g` : f.perServing ? `${n0(f.perServing.k)} cal / serving` : '';
  return (
    <li>
      <button className="rc" onClick={() => onPick(f)}>
        <span className="grow">
          <span className="rc-title">{f.name}</span>
          <span className="muted small">{[f.brand, sub, per].filter(Boolean).join(' · ')}</span>
        </span>
        <Icon name="chev" size={18} />
      </button>
    </li>
  );
}

function Scanner({ onCode }) {
  const video = useRef(null);
  const [err, setErr] = useState('');
  const [on, setOn] = useState(false);
  const stopRef = useRef(() => {});
  useEffect(() => () => stopRef.current(), []);
  const start = async () => {
    setErr('');
    setOn(true);
    stopRef.current = await startScanner(
      video.current,
      (code) => {
        setOn(false);
        onCode(code);
      },
      () => {
        setOn(false);
        setErr('Couldn’t open the camera. Allow camera access for this site, or take a photo of the barcode instead.');
      }
    );
  };
  return (
    <div className="scanner">
      <video ref={video} className={`scan-video ${on ? '' : 'hidden'}`} muted playsInline />
      {on ? <div className="scan-hint small">Point at the barcode and hold steady…</div> : null}
      <div className="plan-actions">
        {!on ? (
          <button className="btn primary" onClick={start}>
            Scan with camera
          </button>
        ) : (
          <button
            className="btn quiet"
            onClick={() => {
              stopRef.current();
              setOn(false);
            }}
          >
            Stop
          </button>
        )}
        <label className="btn quiet">
          Take a photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr"
            onChange={async (e) => {
              const f = e.target.files && e.target.files[0];
              e.target.value = '';
              if (!f) return;
              setErr('');
              try {
                onCode(await decodePhoto(f));
              } catch (x) {
                setErr(x.message);
              }
            }}
          />
        </label>
      </div>
      {err ? <p className="muted small">{err}</p> : null}
    </div>
  );
}

function QuickAdd({ onSave }) {
  const [f, setF] = useState({ name: '', k: '', p: '', c: '', fat: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.name.trim() && Number(f.k) > 0;
  return (
    <form
      className="quick-food"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        onSave({ name: f.name.trim().replace(/^./, (c) => c.toUpperCase()), src: 'quick', perServing: { k: Math.round(Number(f.k)), p: Number(f.p) || 0, c: Number(f.c) || 0, f: Number(f.fat) || 0 }, portions: [{ label: '1 serving', mult: 1 }] });
      }}
    >
      <label className="field wide">
        <span className="small muted">What was it?</span>
        <input className="input" value={f.name} onChange={set('name')} placeholder="e.g. Chipotle bowl" aria-label="Food name" />
      </label>
      <div className="macro-inputs">
        <label className="field">
          <span className="small muted">Calories</span>
          <input className="input num" inputMode="numeric" value={f.k} onChange={set('k')} aria-label="Calories" />
        </label>
        <label className="field">
          <span className="small muted">Protein g</span>
          <input className="input num" inputMode="decimal" value={f.p} onChange={set('p')} aria-label="Protein" />
        </label>
        <label className="field">
          <span className="small muted">Carbs g</span>
          <input className="input num" inputMode="decimal" value={f.c} onChange={set('c')} aria-label="Carbs" />
        </label>
        <label className="field">
          <span className="small muted">Fat g</span>
          <input className="input num" inputMode="decimal" value={f.fat} onChange={set('fat')} aria-label="Fat" />
        </label>
      </div>
      <button className="btn primary block" type="submit" disabled={!ok}>
        Next
      </button>
    </form>
  );
}

const SEARCH_CACHE = 'dash.foodsearch';
function cachedSearch(q) {
  try {
    const c = JSON.parse(localStorage.getItem(SEARCH_CACHE) || '{}');
    const hit = c[q.toLowerCase()];
    return hit && Date.now() - hit.at < 30 * 86400000 ? hit.list : null;
  } catch {
    return null;
  }
}
function saveSearch(q, list) {
  try {
    const c = JSON.parse(localStorage.getItem(SEARCH_CACHE) || '{}');
    c[q.toLowerCase()] = { at: Date.now(), list };
    const keys = Object.keys(c);
    if (keys.length > 60) keys.sort((a, b) => c[a].at - c[b].at).slice(0, keys.length - 60).forEach((k) => delete c[k]);
    localStorage.setItem(SEARCH_CACHE, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

function AddFoodSheet({ health, meal, onAdd, onClose }) {
  const recents = recentFoods(health);
  const [tab, setTab] = useState(recents.length ? 'recent' : 'search');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState(null);
  const [code, setCode] = useState('');
  const search = async (e) => {
    e && e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setErr('');
    const hit = cachedSearch(query);
    if (hit) return setResults(hit);
    setBusy(true);
    try {
      const list = await searchUsda(query, health.usdaKey);
      setResults(list);
      saveSearch(query, list);
      if (!list.length) setErr('Nothing found. Try fewer words, or use Quick add.');
    } catch (x) {
      setErr(x.message || 'Search failed. Check your connection.');
    }
    setBusy(false);
  };
  const byCode = async (c) => {
    setErr('');
    setBusy(true);
    try {
      setPicked(await lookupBarcode(c, health.usdaKey));
    } catch (x) {
      setErr(x.message);
      setCode(String(c));
    }
    setBusy(false);
  };
  const tabs = [
    ['recent', 'Recent'],
    ['search', 'Search'],
    ['scan', 'Barcode'],
    ['quick', 'Quick add'],
  ];
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet tall add-food" role="dialog" aria-label="Add food" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 className="card-title">Add to {mealLabel(meal).toLowerCase()}</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {picked ? (
          <FoodDetail food={picked} meal={meal} onBack={() => setPicked(null)} onSave={onAdd} />
        ) : (
          <>
            <div className="seg food-tabs" role="tablist">
              {tabs.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={`seg-btn ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>
            {tab === 'recent' ? (
              recents.length ? (
                <ul className="list rc-list">
                  {recents.map((f) => (
                    <FoodRow key={f.key} f={f} onPick={setPicked} sub={f.last ? `last: ${f.last.label === 'g' || f.last.label === 'oz' ? `${f.last.qty} ${f.last.label}` : f.last.qty === 1 ? f.last.label : `${f.last.qty} × ${f.last.label}`}` : ''} />
                  ))}
                </ul>
              ) : (
                <p className="empty">Foods you log show up here for one-tap adding.</p>
              )
            ) : null}
            {tab === 'search' ? (
              <>
                <form className="add-row" onSubmit={search}>
                  <input className="input" placeholder="Search foods (e.g. banana, Chobani)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search foods" autoFocus />
                  <button className="btn" type="submit" disabled={busy || !q.trim()}>
                    {busy ? '…' : 'Search'}
                  </button>
                </form>
                {err ? <p className="muted small">{err}</p> : null}
                {results && results.length ? (
                  <ul className="list rc-list">
                    {results.map((f) => (
                      <FoodRow key={`${f.src}:${f.ref}`} f={f} onPick={setPicked} sub={f.kind === 'generic' ? 'generic' : ''} />
                    ))}
                  </ul>
                ) : null}
                <p className="muted small note">From USDA FoodData Central. Generic foods are listed first, then brands.</p>
              </>
            ) : null}
            {tab === 'scan' ? (
              <>
                <Scanner onCode={byCode} />
                <form
                  className="add-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code.trim()) byCode(code.trim());
                  }}
                >
                  <input className="input num" inputMode="numeric" placeholder="Or type the barcode number" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Barcode number" />
                  <button className="btn" type="submit" disabled={busy || !code.trim()}>
                    {busy ? '…' : 'Look up'}
                  </button>
                </form>
                {err ? <p className="muted small">{err}</p> : null}
                <p className="muted small note">Packaged foods from Open Food Facts, with USDA’s grocery list as a backup.</p>
              </>
            ) : null}
            {tab === 'quick' ? <QuickAdd onSave={setPicked} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function EditEntrySheet({ entry, health, onSave, onMove, onDelete, onClose }) {
  const food = health.foods[entry.key];
  const portions = food ? portionsOf(food) : [];
  const portion = portions.find((p) => p.label === entry.portion);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label={`Edit ${entry.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 className="card-title">Edit</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {food && portion ? (
          <FoodDetail food={food} initial={{ portion, qty: entry.qty }} meal={entry.meal} onSave={onSave} saveLabel="Save" />
        ) : (
          <>
            <h3 className="fd-name">{entry.name}</h3>
            <p className="muted small">
              {entry.amount} · {n0(entry.k)} cal
            </p>
            <div className="seg meal-seg" role="group" aria-label="Meal">
              {MEALS.map(([k, l]) => (
                <button key={k} className={`seg-btn ${entry.meal === k ? 'on' : ''}`} onClick={() => onMove(k)}>
                  {l}
                </button>
              ))}
            </div>
          </>
        )}
        <button className="btn quiet block danger-text" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- cards
function TodayCard({ t, tot, iso }) {
  if (t.source === 'missing') {
    return (
      <section className="card">
        <div className="card-head">
          <h2 className="card-title">{dayTitle(iso)}</h2>
          <span className="muted small num">{n0(tot.k)} cal</span>
        </div>
        <p className="empty">Add your {t.need.join(', ')} in Targets & settings to get a daily calorie and macro target.</p>
        <div className="macros">
          <MacroBar label="Protein" value={tot.p} />
          <MacroBar label="Carbs" value={tot.c} />
          <MacroBar label="Fat" value={tot.f} />
        </div>
      </section>
    );
  }
  const left = t.cal - tot.k;
  const pct = Math.min(100, (tot.k / t.cal) * 100);
  return (
    <section className="card today-health">
      <div className="card-head">
        <h2 className="card-title">{dayTitle(iso)}</h2>
        <span className="muted small">Target {n0(t.cal)} cal</span>
      </div>
      <div className="cal-row">
        <div>
          <div className="big num">{n0(Math.abs(left))}</div>
          <div className="muted small">{left >= 0 ? 'calories left' : 'calories over'}</div>
        </div>
        <div className="cal-side">
          <div className="num">
            <b>{n0(tot.k)}</b> eaten
          </div>
        </div>
      </div>
      <div className="bar">
        <div className={`bar-fill ${tot.k > t.cal * 1.05 ? 'bar-ahead' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="macros">
        <MacroBar label="Protein" value={tot.p} target={t.p} />
        <MacroBar label="Carbs" value={tot.c} target={t.c} />
        <MacroBar label="Fat" value={tot.f} target={t.f} />
      </div>
    </section>
  );
}

function FoodLogCard({ day, yesterday, onAdd, onEdit, onCopy }) {
  return (
    <section className="card food-log">
      <div className="card-head">
        <h2 className="card-title">Food</h2>
        <button className="btn primary small" onClick={() => onAdd(mealNow())}>
          + Log food
        </button>
      </div>
      {MEALS.map(([m, l]) => {
        const items = day.food.filter((e) => e.meal === m);
        const prev = yesterday.food.filter((e) => e.meal === m);
        const t = totals(items);
        return (
          <div key={m} className="meal">
            <div className="meal-head">
              <h3 className="k-head">
                {l}
                {items.length ? <span className="muted"> · {n0(t.k)} cal</span> : null}
              </h3>
              <button className="link-btn small" onClick={() => onAdd(m)} aria-label={`Add to ${l}`}>
                + Add
              </button>
            </div>
            {items.length ? (
              <ul className="list">
                {items.map((e) => (
                  <li key={e.id}>
                    <button className="entry" onClick={() => onEdit(e)}>
                      <span className="grow">
                        <span className="entry-name">{e.name}</span>
                        <span className="muted small">
                          {e.amount}
                          {e.brand ? ` · ${e.brand}` : ''} · P {g1(e.p)} · C {g1(e.c)} · F {g1(e.f)}
                        </span>
                      </span>
                      <span className="num entry-cal">{n0(e.k)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : prev.length ? (
              <button className="link-btn small muted-link copy-meal" onClick={() => onCopy(m)}>
                Copy yesterday’s {l.toLowerCase()} ({n0(totals(prev).k)} cal)
              </button>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function WeightCard({ health, onLog, onRemove }) {
  const [v, setV] = useState('');
  const series = useMemo(() => weightSeries(health), [health.weights]);
  const st = weightStats(health);
  const recentAny = series.some((p) => p.date >= addDays(todayISO(), -89));
  const [range, setRange] = useState(recentAny || !series.length ? 90 : 'all');
  const staleDays = st ? Math.round((new Date(`${todayISO()}T12:00:00`) - new Date(`${st.latest.date}T12:00:00`)) / 86400000) : 0;
  const recent = [...health.weights].reverse().slice(0, 5);
  const today = todayISO();
  const todays = health.weights.find((w) => w.date === today);
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Weight</h2>
        {st ? <span className="muted small">7-day average</span> : null}
      </div>
      {st ? (
        <div className="w-stats">
          <div>
            <div className="big num">{g1(st.trend)}</div>
            <div className="muted small">{staleDays > 30 ? `lb · last weighed ${new Date(`${st.latest.date}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'lb trend'}</div>
          </div>
          <div className="w-delta">
            {staleDays > 30 ? (
              <span className="muted small">Log today’s weight to restart your trend</span>
            ) : st.change30 != null ? (
              <div className="num">
                <b>{st.change30 > 0 ? '+' : ''}{g1(st.change30)} lb</b> <span className="muted small">in 30 days</span>
              </div>
            ) : st.since ? (
              <div className="num">
                <b>{st.since.change > 0 ? '+' : ''}{g1(st.since.change)} lb</b> <span className="muted small">since {dateLabel(st.since.date)}</span>
              </div>
            ) : (
              <span className="muted small">Weigh in a few times a week for a trend</span>
            )}
          </div>
        </div>
      ) : null}
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (onLog(v)) setV('');
        }}
      >
        <input className="input num" inputMode="decimal" placeholder={todays ? `Today: ${g1(todays.lb)} lb` : 'Today’s weight (lb)'} value={v} onChange={(e) => setV(e.target.value)} aria-label="Weight in pounds" />
        <button className="btn" type="submit" disabled={!Number(v)}>
          {todays ? 'Update' : 'Log'}
        </button>
      </form>
      {series.length ? (
        <>
          <div className="chart-head">
            <div className="legend small">
              <span className="lg">
                <span className="lg-dot" /> Weigh-ins
              </span>
              <span className="lg">
                <span className="lg-line" /> 7-day average
              </span>
            </div>
            <div className="seg mini-seg" role="group" aria-label="Range">
              {RANGES.map(([d, l]) => (
                <button key={d} className={`seg-btn ${range === d ? 'on' : ''}`} onClick={() => setRange(d)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <WeightChart series={series} days={range} />
          <ul className="log-list small">
            {recent.map((w) => (
              <li key={w.date}>
                <span className="muted">{dateLabel(w.date)}</span> · <span className="num">{g1(w.lb)} lb</span>
                <button className="x" aria-label={`Delete weigh-in on ${w.date}`} onClick={() => onRemove(w.date)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="empty">Log your weight to start a trend. Daily numbers bounce around with water and salt; the 7-day average is the one to watch.</p>
      )}
    </section>
  );
}

function ActivityCard({ day, iso, health, hd, apple, onSteps, onAddWorkout, onRemoveWorkout, onOpenWorkout }) {
  const [steps, setSteps] = useState('');
  const [w, setW] = useState({ type: 'weights', minutes: '' });
  const lb = latestWeight(health);
  const goal = health.stepGoal || 8000;
  const st = stepsFor(day, hd);
  const pct = st.steps ? Math.min(100, (st.steps / goal) * 100) : 0;
  const rings = ringsOf(hd);
  const extra = hd ? [hd.di ? `${g1(hd.di)} mi` : null, hd.fl ? `${hd.fl} flight${hd.fl === 1 ? '' : 's'} climbed` : null].filter(Boolean).join(' · ') : '';
  const count = day.workouts.length + apple.length;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Activity</h2>
        <span className="muted small">{dayTitle(iso)}</span>
      </div>
      <div className="row-between">
        <span className="bill-name">
          Steps {st.src === 'apple' ? <span className="tag tag-apple">Apple Health</span> : null}
        </span>
        <span className="num small">
          <b>{st.steps ? n0(st.steps) : '—'}</b> <span className="muted">/ {n0(goal)}</span>
        </span>
      </div>
      <div className="bar slim">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {extra ? <p className="muted small tight">{extra}</p> : null}
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!steps.trim()) return;
          onSteps(steps);
          setSteps('');
        }}
      >
        <input className="input num" inputMode="numeric" placeholder={st.steps ? 'Update steps' : 'Steps (from your phone’s Health app)'} value={steps} onChange={(e) => setSteps(e.target.value)} aria-label="Steps" />
        <button className="btn" type="submit" disabled={!steps.trim()}>
          Save
        </button>
      </form>
      {rings ? (
        <>
          <h3 className="k-head">Activity rings</h3>
          <RingBars r={rings} />
        </>
      ) : null}
      <h3 className="k-head">Workouts</h3>
      {count ? (
        <ul className="list">
          {apple.map((x) => (
            <li key={x.id}>
              <button className="rc" onClick={() => onOpenWorkout(x)}>
                <span className="grow">
                  <span className="rc-title">
                    {x.label} <span className="tag tag-apple">{/watch/i.test(x.src || '') ? 'Apple Watch' : 'Apple Health'}</span>
                  </span>
                  <span className="muted small">{workoutLine(x)}</span>
                </span>
                <Icon name="chev" size={18} />
              </button>
            </li>
          ))}
          {day.workouts.map((x) => {
            const kcal = workoutKcal(x, lb && lb.lb);
            return (
              <li key={x.id} className="bill">
                <div className="grow">
                  <div className="bill-name">{(WORKOUTS.find((t) => t[0] === x.type) || WORKOUTS[7])[1]}</div>
                  <div className="muted small">
                    {x.minutes} min{kcal ? ` · about ${n0(kcal)} cal burned` : ''}
                    {x.note ? ` · ${x.note}` : ''}
                  </div>
                </div>
                <button className="x" aria-label="Delete workout" onClick={() => onRemoveWorkout(x.id)}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">No workouts logged.</p>
      )}
      <form
        className="add-row workout-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!(Number(w.minutes) > 0)) return;
          onAddWorkout(w);
          setW({ ...w, minutes: '' });
        }}
      >
        <select className="input" value={w.type} onChange={(e) => setW({ ...w, type: e.target.value })} aria-label="Workout type">
          {WORKOUTS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <input className="input num min-input" inputMode="numeric" placeholder="Min" value={w.minutes} onChange={(e) => setW({ ...w, minutes: e.target.value })} aria-label="Minutes" />
        <button className="btn" type="submit" disabled={!(Number(w.minutes) > 0)}>
          Add
        </button>
      </form>
      <p className="muted small note">Calories burned are rough estimates and aren’t added to your food target, since your activity level already counts typical exercise.</p>
    </section>
  );
}

function WeekCard({ years, t, apple }) {
  const wk = week(years, todayISO(), apple);
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Last 7 days</h2>
        <span className="muted small">{wk.loggedDays ? `${wk.loggedDays} day${wk.loggedDays === 1 ? '' : 's'} logged` : ''}</span>
      </div>
      {wk.loggedDays ? <WeekChart wk={wk} target={t.cal} /> : <p className="empty">Log food for a few days to see your week here.</p>}
      <div className="week-stats">
        <div>
          <b className="num">{wk.avgCal != null ? n0(wk.avgCal) : '—'}</b>
          <span>avg calories</span>
        </div>
        <div>
          <b className="num">{wk.avgSteps != null ? n0(wk.avgSteps) : '—'}</b>
          <span>avg steps</span>
        </div>
        <div>
          <b className="num">{wk.workouts}</b>
          <span>workouts · {wk.minutes} min</span>
        </div>
      </div>
    </section>
  );
}

// What the Watch says you burn: average resting + active calories on days it was worn most of the day.
function watchBurn(hkYears) {
  const t = todayISO();
  const days = hkDaysBetween(hkYears, addDays(t, -364), t).filter(({ d }) => d && d.ab && d.ae != null && (d.sh || 0) >= 10);
  if (days.length < 7) return null;
  const rest = days.reduce((s, x) => s + x.d.ab, 0) / days.length;
  const active = days.reduce((s, x) => s + x.d.ae, 0) / days.length;
  return { rest: Math.round(rest), active: Math.round(active), n: days.length };
}

function TargetsCard({ health, t, mutate, open, setOpen, hkYears }) {
  const p = health.profile;
  const burn = hkYears ? watchBurn(hkYears) : null;
  const lw = latestWeight(health);
  const weightAge = lw ? Math.round((new Date(`${todayISO()}T12:00:00`) - new Date(`${lw.date}T12:00:00`)) / 86400000) : 0;
  const setP = (k, v) => mutate((h) => (h.profile[k] = v));
  const ft = p.heightIn ? Math.floor(p.heightIn / 12) : '';
  const inch = p.heightIn ? Math.round(p.heightIn % 12) : '';
  const setHeight = (f, i) => {
    const total = (Number(f) || 0) * 12 + (Number(i) || 0);
    setP('heightIn', total || null);
  };
  const [custom, setCustom] = useState(health.custom ? { ...health.custom } : null);
  const auto = t.auto;
  return (
    <section className="card">
      <button className="step-head card-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="grow">
          <span className="card-title">Targets &amp; settings</span>
          <span className="muted small block">
            {t.source === 'missing' ? 'Set up your daily target' : `${n0(t.cal)} cal · P ${n0(t.p)}g · C ${n0(t.c)}g · F ${n0(t.f)}g${t.source === 'custom' ? ' (custom)' : ''}`}
          </span>
        </span>
        <Icon name={open ? 'down' : 'chev'} size={18} />
      </button>
      {open ? (
        <div className="targets">
          <div className="seg" role="group" aria-label="Goal">
            {GOALS.map(([k, l]) => (
              <button key={k} className={`seg-btn ${p.goal === k ? 'on' : ''}`} onClick={() => setP('goal', k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="qa target-form">
            <label className="field">
              <span className="small muted">Sex (for the calorie formula)</span>
              <select className="input" value={p.sex} onChange={(e) => setP('sex', e.target.value)} aria-label="Sex">
                <option value="">Choose</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label className="field">
              <span className="small muted">Age{p.dob ? ' (from Apple Health)' : ''}</span>
              <input
                key={ageOf(p) || ''}
                className="input num"
                inputMode="numeric"
                defaultValue={ageOf(p) || ''}
                onBlur={(e) => {
                  const a = Number(e.target.value) || null;
                  if (a === ageOf(p)) return;
                  mutate((h) => {
                    h.profile.age = a;
                    delete h.profile.dob; // typed over the birthday-based age
                  });
                }}
                aria-label="Age"
              />
            </label>
            <label className="field">
              <span className="small muted">Height</span>
              <span className="height">
                <input className="input num" inputMode="numeric" defaultValue={ft} onBlur={(e) => setHeight(e.target.value, inch)} aria-label="Height feet" />
                <span className="muted">ft</span>
                <input className="input num" inputMode="numeric" defaultValue={inch} onBlur={(e) => setHeight(ft, e.target.value)} aria-label="Height inches" />
                <span className="muted">in</span>
              </span>
            </label>
            <label className="field">
              <span className="small muted">Activity</span>
              <select className="input" value={p.activity} onChange={(e) => setP('activity', e.target.value)} aria-label="Activity level">
                {ACTIVITY.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!latestWeight(health) ? <p className="muted small">Log your weight in the Weight card to finish the calculation.</p> : null}
          {lw && weightAge > 60 ? (
            <p className="alert small">
              This uses your last weigh-in, {g1(lw.lb)} lb from {new Date(`${lw.date}T12:00:00`).toLocaleString('en-US', { month: 'short', year: 'numeric' })}. Log today’s weight for an up-to-date target.
            </p>
          ) : null}
          {auto ? (
            <p className="small calc">
              Your body burns about <b>{n0(auto.bmr)}</b> calories a day at rest and <b>{n0(auto.tdee)}</b> with your activity level (Mifflin–St Jeor formula). Suggested target: <b>{n0(auto.cal)} cal</b>, protein{' '}
              <b>{n0(auto.p)}g</b> (0.8 g per lb), fat <b>{n0(auto.f)}g</b> (30% of calories), carbs <b>{n0(auto.c)}g</b> (the rest).
            </p>
          ) : null}
          {burn && auto ? (
            <p className="small calc">
              Apple Watch check: on the {burn.n} days in the past year you wore it most of the day, you burned about <b>{n0(burn.rest + burn.active)}</b> calories a day ({n0(burn.rest)} resting + {n0(burn.active)} active). If that’s far from the{' '}
              {n0(auto ? auto.tdee : 0)} above, try a different activity level.
            </p>
          ) : null}
          <label className="check-line small">
            <input
              type="checkbox"
              checked={!!custom}
              onChange={(e) => {
                const on = e.target.checked;
                const next = on ? { cal: (auto && auto.cal) || 2200, p: (auto && auto.p) || 150, c: (auto && auto.c) || 220, f: (auto && auto.f) || 75 } : null;
                setCustom(next);
                mutate((h) => (h.custom = next));
              }}
            />
            Use my own numbers
          </label>
          {custom ? (
            <div className="macro-inputs">
              {[
                ['cal', 'Calories'],
                ['p', 'Protein g'],
                ['c', 'Carbs g'],
                ['f', 'Fat g'],
              ].map(([k, l]) => (
                <label key={k} className="field">
                  <span className="small muted">{l}</span>
                  <input
                    className="input num"
                    inputMode="numeric"
                    value={custom[k]}
                    onChange={(e) => setCustom({ ...custom, [k]: e.target.value })}
                    onBlur={() => mutate((h) => (h.custom = { cal: Number(custom.cal) || 0, p: Number(custom.p) || 0, c: Number(custom.c) || 0, f: Number(custom.f) || 0 }))}
                    aria-label={`Custom ${l}`}
                  />
                </label>
              ))}
            </div>
          ) : null}
          <div className="qa target-form">
            <label className="field">
              <span className="small muted">Daily step goal</span>
              <input className="input num" inputMode="numeric" defaultValue={health.stepGoal} onBlur={(e) => mutate((h) => (h.stepGoal = Number(e.target.value.replace(/\D/g, '')) || 8000))} aria-label="Daily step goal" />
            </label>
            <label className="field">
              <span className="small muted">USDA key (optional)</span>
              <input className="input" defaultValue={health.usdaKey} placeholder="Uses the free demo key" onBlur={(e) => mutate((h) => (h.usdaKey = e.target.value.trim()))} aria-label="USDA API key" />
            </label>
          </div>
          <p className="muted small note">
            Food search uses USDA’s free demo key (about 50 searches a day). For more, get a free personal key at{' '}
            <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noopener">
              fdc.nal.usda.gov
            </a>{' '}
            and paste it above. These targets are general estimates, not medical advice.
          </p>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- page
const VIEW_KEY = 'dash.healthView';
function savedView() {
  try {
    return localStorage.getItem(VIEW_KEY) || 'today';
  } catch {
    return 'today';
  }
}

export function HealthPage({ health, years, hk, hkYears, act, error }) {
  const [iso, setIso] = useState(todayISO());
  const [view, setView0] = useState(savedView);
  const [adding, setAdding] = useState(null); // meal
  const [editing, setEditing] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [openTargets, setOpenTargets] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const setView = (v) => {
    setView0(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    if (/add=1/.test(location.hash)) {
      setView('today');
      setAdding(mealNow());
      history.replaceState(null, '', '#/health');
    }
  }, []);
  useEffect(() => {
    if (health && targets(health).source === 'missing') setOpenTargets(true);
  }, [!!health]);
  if (!health || !years) {
    return (
      <div className="home">
        <header className="page-head">
          <h1 className="page-title">Health</h1>
        </header>
        <section className="card">
          <p className="empty">{error || 'Loading…'}</p>
        </section>
      </div>
    );
  }
  const t = targets(health);
  const day = getDay(years, iso);
  const yesterday = getDay(years, addDays(iso, -1));
  const tot = totals(day.food);
  const isToday = iso === todayISO();
  const today = todayISO();
  const hkv = hk || { workouts: [], months: {}, body: [], vo2: [], ecg: [], hrr: [], steady: [], walk6: [] };
  const imported = hasHk(hk);
  const hd = hkDay(hkYears, iso);
  const weightCard = (
    <WeightCard
      health={health}
      onLog={(v) => {
        const n = Number(String(v).replace(/[^\d.]/g, ''));
        if (!(n > 50 && n < 700)) return false;
        act.logWeight(n);
        return true;
      }}
      onRemove={(date) => act.removeWeight(date)}
    />
  );
  const goImport = () => {
    setView('today');
    setImportOpen(true);
    setTimeout(() => {
      const el = document.querySelector('.hk-import');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };
  const needHk = view !== 'today' && view !== 'body' && hk && !imported;
  const hkLoading = view !== 'today' && (!hk || !hkYears);
  const titles = { activity: 'Activity', heart: 'Heart', sleep: 'Sleep', hearing: 'Hearing' };
  return (
    <div className="home health">
      <header className="page-head row-between">
        <h1 className="page-title">Health</h1>
        {view === 'today' ? (
          <div className="day-nav">
            <button className="btn quiet small" onClick={() => setIso(addDays(iso, -1))} aria-label="Previous day">
              ‹
            </button>
            <button className="btn quiet small day-label" onClick={() => setIso(todayISO())} disabled={isToday}>
              {dayTitle(iso)}
            </button>
            <button className="btn quiet small" onClick={() => setIso(addDays(iso, 1))} disabled={isToday} aria-label="Next day">
              ›
            </button>
          </div>
        ) : null}
      </header>
      <ViewTabs view={view} onChange={setView} />
      {error ? <div className="alert">{error}</div> : null}
      {hkLoading ? (
        <section className="card">
          <p className="empty">Loading…</p>
        </section>
      ) : needHk ? (
        <EmptyHk what={titles[view]} onGo={goImport} />
      ) : view === 'activity' ? (
        <ActivityView hk={hkv} hkYears={hkYears} health={health} years={years} today={today} onOpenWorkout={setWorkout} />
      ) : view === 'heart' ? (
        <HeartView hk={hkv} hkYears={hkYears} today={today} loadDoc={act.loadDoc} />
      ) : view === 'sleep' ? (
        <SleepView hk={hkv} hkYears={hkYears} today={today} />
      ) : view === 'hearing' ? (
        <HearingView hk={hkv} hkYears={hkYears} today={today} />
      ) : view === 'body' ? (
        <BodyView hk={hkv} hkYears={hkYears} health={health} weightCard={weightCard} />
      ) : (
        <div className="grid">
          <div className="col">
            <TodayCard t={t} tot={tot} iso={iso} />
            <FoodLogCard day={day} yesterday={yesterday} onAdd={setAdding} onEdit={setEditing} onCopy={(m) => act.copyMeal(iso, yesterday, m)} />
            <ActivityCard
              day={day}
              iso={iso}
              health={health}
              hd={hd}
              apple={workoutsOn(hk, iso)}
              onSteps={(s) => act.setSteps(iso, s)}
              onAddWorkout={(w) => act.addWorkout(iso, w)}
              onRemoveWorkout={(id) => act.removeWorkout(iso, id)}
              onOpenWorkout={setWorkout}
            />
          </div>
          <div className="col">
            <DayVitalsCard hk={hk} hkYears={hkYears} iso={iso} />
            {weightCard}
            <WeekCard years={years} t={t} apple={{ hk, hkYears }} />
            <TargetsCard health={health} t={t} mutate={act.mutateHealth} open={openTargets} setOpen={setOpenTargets} hkYears={hkYears} />
            <ImportCard key={importOpen ? 'open' : 'auto'} hk={hk} onImport={act.importAppleHealth} open={importOpen} />
          </div>
        </div>
      )}
      {adding ? (
        <AddFoodSheet
          health={health}
          meal={adding}
          onClose={() => setAdding(null)}
          onAdd={(food, portion, qty, meal) => {
            act.logFood(iso, food, portion, qty, meal);
            setAdding(null);
          }}
        />
      ) : null}
      {editing ? (
        <EditEntrySheet
          entry={editing}
          health={health}
          onClose={() => setEditing(null)}
          onSave={(food, portion, qty, meal) => {
            act.updateEntry(iso, editing.id, { food, portion, qty, meal });
            setEditing(null);
          }}
          onMove={(meal) => {
            act.updateEntry(iso, editing.id, { meal });
            setEditing(null);
          }}
          onDelete={() => {
            act.deleteEntry(iso, editing);
            setEditing(null);
          }}
        />
      ) : null}
      {workout ? <WorkoutSheet w={workout} loadDoc={act.loadDoc} onClose={() => setWorkout(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Home card
export function HealthHomeCard({ health, years, hk, hkYears }) {
  if (!health || !years) return null;
  const t = targets(health);
  const iso = todayISO();
  const day = getDay(years, iso);
  const tot = totals(day.food);
  const st = weightStats(health);
  const stale = st && st.latest.date < addDays(iso, -30);
  const steps = stepsFor(day, hkDay(hkYears, iso)).steps;
  const nw = day.workouts.length + workoutsOn(hk, iso).length;
  const night = hkDay(hkYears, iso) || hkDay(hkYears, addDays(iso, -1));
  const sl = night && night.sl && night.sl.a ? night.sl : null;
  return (
    <section className="card health-home">
      <div className="card-head">
        <h2 className="card-title">Health</h2>
        <a className="link small" href="#/health?add=1">
          + Log food
        </a>
      </div>
      {t.source === 'missing' ? (
        <p className="muted small">
          {n0(tot.k)} cal today. <a href="#/health">Set up your target →</a>
        </p>
      ) : (
        <>
          <div className="row-between">
            <span>
              <b className="num mid">{n0(Math.abs(t.cal - tot.k))}</b> <span className="muted small">{t.cal - tot.k >= 0 ? 'calories left' : 'calories over'}</span>
            </span>
            <span className="muted small num">
              {n0(tot.k)} / {n0(t.cal)}
            </span>
          </div>
          <div className="bar slim">
            <div className={`bar-fill ${tot.k > t.cal * 1.05 ? 'bar-ahead' : ''}`} style={{ width: `${Math.min(100, (tot.k / t.cal) * 100)}%` }} />
          </div>
          <div className="mini-macros small num">
            <span>
              P <b>{n0(tot.p)}</b>/{n0(t.p)}g
            </span>
            <span>
              C <b>{n0(tot.c)}</b>/{n0(t.c)}g
            </span>
            <span>
              F <b>{n0(tot.f)}</b>/{n0(t.f)}g
            </span>
          </div>
        </>
      )}
      <a className="home-row" href="#/health">
        <span className="grow small">
          {st && !stale ? (
            <>
              Weight <b className="num">{g1(st.trend)} lb</b>
              {st.change30 != null ? <span className="muted"> · {st.change30 > 0 ? '+' : ''}{g1(st.change30)} in 30 days</span> : null}
              <span className="muted"> · </span>
            </>
          ) : null}
          Steps <b className="num">{steps ? n0(steps) : '—'}</b>
          {nw ? <span className="muted"> · {nw} workout{nw === 1 ? '' : 's'}</span> : null}
          {sl ? (
            <>
              <span className="muted"> · </span>Slept <b className="num">{fmtMins(sl.a)}</b>
            </>
          ) : null}
        </span>
      </a>
    </section>
  );
}
