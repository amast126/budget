// The Apple Health side of the Health tab: the importer, the day's vitals, and the Activity, Heart, Sleep, Body and
// Hearing views built from the imported data.
import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { dateLabel } from './budget-logic.js';
import { LineChart, BarChart, monthLabel, pointLabel } from './chart-kit.jsx';
import { readAppleHealth, decodeRoute } from './apple-health.js';
import {
  hasHk,
  hkDay,
  ringsOf,
  seriesOf,
  latestOf,
  stats,
  weekly,
  allMonths,
  fmtMins,
  clock,
  nightsWithSleep,
  daysBetween,
} from './hk-logic.js';
import { WORKOUTS, todayISO, addDays, weightStats, latestWeight } from './health-logic.js';

const n0 = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString());
const d1 = (n) => (n == null ? '—' : (Math.round(Number(n) * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 }));
const d2 = (n) => (n == null ? '—' : (Math.round(Number(n) * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const plural = (n, w) => `${n0(n)} ${w}${Math.round(n) === 1 ? '' : 's'}`;
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const monthYear = (iso) => new Date(`${iso.slice(0, 7)}-15T12:00:00`).toLocaleString('en-US', { month: 'short', year: 'numeric' });

export const RANGES = [
  [30, '30 days'],
  [90, '90 days'],
  [365, '1 year'],
  ['all', 'All time'],
];
function RangeSeg({ value, onChange, options = RANGES }) {
  return (
    <div className="seg mini-seg" role="group" aria-label="Range">
      {options.map(([k, l]) => (
        <button key={k} className={`seg-btn ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}
function MetricSeg({ value, onChange, options, label = 'Measure' }) {
  return (
    <div className="seg metric-seg" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} className={`seg-btn ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}
function Tiles({ items }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="tiles">
      {list.map((t, i) => (
        <div key={i} className={`tile ${t.tone || ''}`}>
          <b className="num">{t.value}</b>
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- slots for bar charts
const monday = (iso) => addDays(iso, -((new Date(`${iso}T12:00:00`).getDay() + 6) % 7));
function daySlots(range, today) {
  const out = [];
  for (let i = range - 1; i >= 0; i--) out.push(addDays(today, -i));
  return out;
}
function weekSlots(today) {
  const out = [];
  for (let m = monday(addDays(today, -364)); m <= today; m = addDays(m, 7)) out.push(m);
  return out;
}
function monthSlots(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
// Bars for a daily key: daily bars up to 90 days, weekly averages for a year, monthly averages for all time.
function barData(hk, hkYears, key, range, today) {
  if (range === 'all') {
    const pts = seriesOf(hk, hkYears, key, 'all', today);
    if (!pts.length) return { points: [], slots: [] };
    return { points: pts, slots: monthSlots(pts[0].t, pts[pts.length - 1].t), unit: 'month' };
  }
  const daily = seriesOf(hk, hkYears, key, range, today);
  if (range === 365) return { points: weekly(daily), slots: weekSlots(today), daily, unit: 'week' };
  return { points: daily, slots: daySlots(range, today), daily, unit: 'day' };
}
// Lines: daily up to 90 days, weekly averages for a year, monthly for all time.
function lineData(hk, hkYears, key, range, today) {
  const pts = seriesOf(hk, hkYears, key, range, today);
  return range === 365 ? weekly(pts) : pts;
}
// Start on the shortest range with enough readings to be worth a chart (the Watch isn't always worn).
function pickRange(count, options = [90, 365], min = 12) {
  for (const r of options) if (count(r) >= min) return r;
  return 'all';
}
const rangeFrom = (range, today) => (range === 'all' ? null : addDays(today, -range + 1));
const rangeText = (range) => (range === 'all' ? 'all time' : range === 365 ? 'the last year' : `the last ${range} days`);

function AsOf({ hk, extra }) {
  if (!hasHk(hk)) return null;
  return (
    <p className="muted small note">
      From Apple Health, through {shortDate(hk.last)}.{extra ? ` ${extra}` : ''}
    </p>
  );
}
function EmptyHk({ what, onGo }) {
  return (
    <section className="card">
      <h2 className="card-title">{what}</h2>
      <p className="empty">Import your Apple Health export to see this. It’s on the Today view, in the Apple Health card.</p>
      <button className="btn small" onClick={onGo}>
        Go to the importer
      </button>
    </section>
  );
}
function Latest({ hit, fmt, unit, stale = 21 }) {
  if (!hit) return <span className="muted">No readings yet</span>;
  const days = Math.round((new Date(`${todayISO()}T12:00:00`) - new Date(`${hit.iso}T12:00:00`)) / 86400000);
  return (
    <span>
      <b className="num mid">{fmt(hit.v)}</b> <span className="muted small">{unit}</span>
      <span className={`muted small block ${days > stale ? 'stale' : ''}`}>{hit.month ? `Average for ${monthYear(hit.iso)}` : days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `Last reading ${shortDate(hit.iso)}`}</span>
    </span>
  );
}

// ---------------------------------------------------------------- importer
export function ImportCard({ hk, onImport, open: open0 = false }) {
  const [busy, setBusy] = useState(null); // { f, label }
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [open, setOpen] = useState(open0 || !hasHk(hk));
  const run = async (file) => {
    setErr('');
    setDone(null);
    setBusy({ f: 0, label: 'Opening the file' });
    try {
      const bundle = await readAppleHealth(file, (f, label) => setBusy({ f, label }));
      setBusy({ f: 1, label: 'Saving to your dashboard' });
      const res = await onImport(bundle);
      setDone(res);
    } catch (e) {
      setErr(e.message || String(e));
    }
    setBusy(null);
  };
  const imported = hasHk(hk);
  return (
    <section className="card hk-import">
      <button className="step-head card-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="grow">
          <span className="card-title">Apple Health</span>
          <span className="muted small block">{imported ? `Data through ${shortDate(hk.last)} · imported ${shortDate(new Date(hk.importedAt).toISOString().slice(0, 10))}` : 'Import steps, workouts, heart, sleep and more'}</span>
        </span>
        <Icon name={open ? 'down' : 'chev'} size={18} />
      </button>
      {open ? (
        <div className="import-body">
          {!imported ? <p className="small">Bring in everything your iPhone and Apple Watch have recorded: steps, activity rings, workouts and routes, heart rate, ECGs, sleep, walking steadiness, headphone levels, hearing tests and old weigh-ins.</p> : null}
          <ol className="small steps-list">
            <li>
              On your iPhone, open <b>Health</b>, tap your picture (top right), then <b>Export All Health Data</b>.
            </li>
            <li>Save the export.zip to Files, or AirDrop it to your computer.</li>
            <li>Choose it below. It’s read right here on this device; only daily summaries are saved, to your private dashboard.</li>
          </ol>
          {busy ? (
            <div className="import-progress" role="status">
              <div className="row-between small">
                <span>{busy.label}…</span>
                <span className="num muted">{Math.round(busy.f * 100)}%</span>
              </div>
              <div className="bar slim">
                <div className="bar-fill" style={{ width: `${Math.round(busy.f * 100)}%` }} />
              </div>
            </div>
          ) : (
            <label className="btn primary file-btn">
              {imported ? 'Import a newer export' : 'Choose export.zip'}
              <input
                type="file"
                accept=".zip,.xml,application/zip,text/xml"
                className="sr"
                aria-label="Apple Health export file"
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  e.target.value = '';
                  if (f) run(f);
                }}
              />
            </label>
          )}
          {err ? <p className="alert small">{err}</p> : null}
          {done ? (
            <p className="ok-note small">
              Imported {n0(done.days)} days ({monthYear(done.first)} to {shortDate(done.last)}): {plural(done.nights, 'night')} of sleep, {plural(done.workouts, 'workout')}
              {done.ecg ? `, ${plural(done.ecg, 'ECG')}` : ''}
              {done.added ? `, ${plural(done.added, 'weigh-in')} added to your weight log` : ''}.{done.filled && done.filled.length ? ` Filled in your ${done.filled.join(', ')}.` : ''}
              {done.skipped && done.skipped.length ? ` Skipped ${done.skipped.map((w) => `${w.lb} lb on ${shortDate(w.date)}`).join(', ')}, which looked like a typo.` : ''}
            </p>
          ) : null}
          <p className="muted small note">Importing again later adds the new days and updates the rest; nothing you typed in here is changed. Picking export.xml works too, without ECGs and routes.</p>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- Today: rings and the day's vitals
export function RingBars({ r }) {
  const rows = [
    ['move', 'Move', r.move, r.moveGoal, r.moveUnit],
    ['ex', 'Exercise', r.ex, r.exGoal, 'min'],
    ['stand', 'Stand', r.stand, r.standGoal, 'hr'],
  ];
  return (
    <div className="rings">
      {rows.map(([k, l, v, g, u]) => (
        <div key={k} className={`ring-row ring-${k}`}>
          <div className="row-between small">
            <span className="ring-name">{l}</span>
            <span className="num">
              <b>{n0(v)}</b>
              <span className="muted">
                {' '}
                / {n0(g)} {u}
              </span>
            </span>
          </div>
          <div className="bar slim">
            <div className="bar-fill" style={{ width: `${g ? Math.min(100, (v / g) * 100) : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StageBar({ sl }) {
  if (!sl) return null;
  const parts = sl.c != null ? [['w', 'Awake', sl.w || 0], ['r', 'REM', sl.r || 0], ['c', 'Core', sl.c || 0], ['d', 'Deep', sl.d || 0]] : [['a', 'Asleep', sl.a || 0], ['w', 'Awake', sl.w || 0]];
  const total = parts.reduce((s, p) => s + p[2], 0) || 1;
  return (
    <div>
      <div className="stage-bar" role="img" aria-label={parts.map((p) => `${p[1]} ${fmtMins(p[2])}`).join(', ')}>
        {parts.map(([k, , v]) => (v ? <span key={k} className={`st-${k}`} style={{ width: `${(v / total) * 100}%` }} /> : null))}
      </div>
      <div className="legend small stage-legend">
        {parts.map(([k, l, v]) =>
          v ? (
            <span key={k} className="lg">
              <span className={`lg-sq st-${k}`} /> {l} <b className="num">{fmtMins(v)}</b>
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

export function DayVitalsCard({ hk, hkYears, iso }) {
  const d = hkDay(hkYears, iso);
  if (!hasHk(hk) || !d) return null;
  const items = [
    d.sl && d.sl.a ? { value: fmtMins(d.sl.a), label: 'asleep last night' } : null,
    d.rhr ? { value: `${d.rhr}`, label: 'resting heart rate' } : null,
    d.hrv ? { value: `${d.hrv} ms`, label: 'heart rate variability' } : null,
    d.whr ? { value: `${d.whr}`, label: 'walking heart rate' } : null,
    d.ha ? { value: `${d.hl}–${d.hh}`, label: `heart rate range (avg ${d.ha})` } : null,
    d.o2 ? { value: `${d1(d.o2)}%`, label: 'blood oxygen' } : null,
    d.rr ? { value: d1(d.rr), label: 'breaths/min asleep' } : null,
    d.dl ? { value: `${n0(d.dl)} min`, label: 'in daylight' } : null,
    d.hp ? { value: `${d.hp} dB`, label: `headphones (${fmtMins(d.hpm)})` } : null,
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Body &amp; vitals</h2>
        <span className="muted small">Apple Health</span>
      </div>
      {d.sl && d.sl.a ? <StageBar sl={d.sl} /> : null}
      <Tiles items={items} />
    </section>
  );
}

// ---------------------------------------------------------------- workouts (sheet with route)
const typeLabel = (w) => w.label || (WORKOUTS.find((t) => t[0] === w.type) || WORKOUTS[WORKOUTS.length - 1])[1];
function pace(w) {
  if (!w.mi || w.mi < 0.2 || !/walk|run|hike/.test(w.type)) return null;
  const m = w.min / w.mi;
  return `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')} /mi`;
}
export function workoutLine(w) {
  return [`${n0(w.min)} min`, w.mi ? `${d2(w.mi)} mi` : null, w.yd ? `${n0(w.yd)} yd` : null, w.kcal ? `${n0(w.kcal)} cal` : null, w.hr ? `avg ${w.hr} bpm` : null].filter(Boolean).join(' · ');
}
function RouteMap({ enc }) {
  const pts = decodeRoute(enc);
  if (pts.length < 2) return null;
  const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[1] * k);
  const ys = pts.map((p) => -p[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const W = 400;
  const H = 260;
  const pad = 18;
  const s = Math.min((W - pad * 2) / (maxX - minX || 1e-6), (H - pad * 2) / (maxY - minY || 1e-6));
  const ox = (W - (maxX - minX) * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;
  const X = (i) => ox + (xs[i] - minX) * s;
  const Y = (i) => oy + (ys[i] - minY) * s;
  const d = pts.map((_, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(i).toFixed(1)}`).join(' ');
  // Scale bar: x and y are in degrees of latitude (≈ 69 miles each).
  const unitPx = s / 69; // px per mile
  const widthMi = (maxX - minX) * 69;
  const bar = [0.1, 0.25, 0.5, 1, 2, 5].find((m) => m * unitPx > 50) || 5;
  return (
    <svg className="route-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Route, about ${d2(widthMi)} miles across`}>
      <rect x="0" y="0" width={W} height={H} rx="10" className="route-bg" />
      <path d={d} className="route-shadow" />
      <path d={d} className="route-line" />
      <circle cx={X(0)} cy={Y(0)} r="6" className="route-start" />
      <circle cx={X(pts.length - 1)} cy={Y(pts.length - 1)} r="6" className="route-end" />
      <g transform={`translate(${W - 16 - bar * unitPx}, ${H - 16})`}>
        <line x1="0" x2={bar * unitPx} y1="0" y2="0" className="route-scale" />
        <text x={(bar * unitPx) / 2} y="-6" textAnchor="middle" className="route-scale-text">
          {bar} mi
        </text>
      </g>
    </svg>
  );
}
export function WorkoutSheet({ w, loadDoc, onClose }) {
  const [route, setRoute] = useState(undefined);
  useEffect(() => {
    if (!w.route || !loadDoc) return setRoute(null);
    let live = true;
    loadDoc('health-hk-routes')
      .then((doc) => live && setRoute((doc && doc.routes && doc.routes[w.route]) || null))
      .catch(() => live && setRoute(null));
    return () => {
      live = false;
    };
  }, [w.id]);
  const facts = [
    ['Duration', `${n0(w.min)} min`],
    w.mi ? ['Distance', `${d2(w.mi)} mi`] : null,
    w.yd ? ['Distance', `${n0(w.yd)} yd`] : null,
    pace(w) ? ['Pace', pace(w)] : null,
    w.kcal ? ['Active calories', n0(w.kcal)] : null,
    w.hr ? ['Avg heart rate', `${w.hr} bpm`] : null,
    w.hrMax ? ['Max heart rate', `${w.hrMax} bpm`] : null,
    w.elev ? ['Elevation gain', `${n0(w.elev)} ft`] : null,
    w.tempF ? ['Weather', `${w.tempF}°F`] : null,
    w.indoor != null ? ['Where', w.indoor ? 'Indoor' : 'Outdoor'] : null,
    w.src ? ['Recorded by', w.src.replace(/ /g, ' ')] : null,
  ].filter(Boolean);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label={`${typeLabel(w)} on ${w.d}`} onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 className="card-title">{typeLabel(w)}</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted small">
          {dateLabel(w.d)}, {shortDate(w.d).slice(-4)}
          {w.t ? ` · ${clock(Number(w.t.slice(0, 2)) * 60 + Number(w.t.slice(3, 5)))}` : ''}
        </p>
        {w.route ? route === undefined ? <p className="muted small">Loading the route…</p> : route ? <RouteMap enc={route} /> : null : null}
        <dl className="facts-grid">
          {facts.map(([k, v]) => (
            <React.Fragment key={k}>
              <div>
                <dt>{k}</dt>
                <dd className="num">{v}</dd>
              </div>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ECG
function EcgTrace({ trace, rate }) {
  const secsPerRow = 10;
  const per = rate * secsPerRow;
  const rows = [];
  for (let i = 0; i < trace.length; i += per) rows.push(trace.slice(i, i + per));
  const sorted = [...trace].sort((a, b) => a - b);
  const lo = Math.min(-500, sorted[Math.floor(sorted.length * 0.002)]);
  const hi = Math.max(1000, sorted[Math.floor(sorted.length * 0.998)]);
  const W = 1000;
  const RH = 150;
  const y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (RH - 16);
  return (
    <div className="ecg">
      {rows.map((row, r) => {
        const d = row.map((v, i) => `${i ? 'L' : 'M'}${((i / per) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        const grid = [];
        for (let s = 0; s <= secsPerRow * 5; s++) grid.push(<line key={`v${s}`} x1={(s / (secsPerRow * 5)) * W} x2={(s / (secsPerRow * 5)) * W} y1="0" y2={RH} className={s % 5 ? 'ecg-minor' : 'ecg-major'} />);
        for (let mv = Math.ceil(lo / 500) * 500; mv <= hi; mv += 500) grid.push(<line key={`h${mv}`} x1="0" x2={W} y1={y(mv)} y2={y(mv)} className="ecg-major" />);
        return (
          <svg key={r} viewBox={`0 0 ${W} ${RH}`} preserveAspectRatio="none" className="ecg-row" role="img" aria-label={`Seconds ${r * secsPerRow} to ${(r + 1) * secsPerRow}`}>
            {grid}
            <path d={d} className="ecg-line" vectorEffect="non-scaling-stroke" />
          </svg>
        );
      })}
      <p className="muted small">Each row is 10 seconds; the dark gridlines are 1 second apart across and 0.5 mV up and down.</p>
    </div>
  );
}
function EcgSheet({ e, loadDoc, onClose }) {
  const [trace, setTrace] = useState(undefined);
  useEffect(() => {
    let live = true;
    loadDoc('health-hk-ecg')
      .then((doc) => live && setTrace((doc && doc.traces && doc.traces[e.id]) || null))
      .catch(() => live && setTrace(null));
    return () => {
      live = false;
    };
  }, [e.id]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet tall wide-sheet" role="dialog" aria-label={`ECG ${e.date}`} onClick={(x) => x.stopPropagation()}>
        <div className="row-between">
          <h2 className="card-title">{e.result}</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted small">
          {shortDate(e.date)} at {clock(Number(e.time.slice(0, 2)) * 60 + Number(e.time.slice(3, 5)))}
          {e.bpm ? ` · about ${e.bpm} bpm` : ''}
          {e.symptoms ? ` · ${e.symptoms}` : ''}
        </p>
        {trace === undefined ? <p className="muted small">Loading…</p> : trace ? <EcgTrace trace={trace} rate={e.rate || 128} /> : <p className="muted small">The recording isn’t available.</p>}
        <p className="muted small note">Recorded with the Apple Watch ECG app (a single-lead reading). It isn’t a diagnosis; talk to a doctor about any symptoms.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Activity view
function StepsCard({ hk, hkYears, health, today }) {
  const [range, setRange] = useState(30);
  const goal = health.stepGoal || 8000;
  const { points, slots, daily } = barData(hk, hkYears, 'st', range, today);
  const s = stats(daily || points);
  const dist = stats(range === 'all' ? [] : seriesOf(hk, hkYears, 'di', range, today));
  const fl = stats(seriesOf(hk, hkYears, 'fl', range, today));
  const dl = stats(seriesOf(hk, hkYears, 'dl', range, today));
  const best = (daily || points).reduce((m, p) => (!m || p.v > m.v ? p : m), null);
  const over = daily ? daily.filter((p) => p.v >= goal).length : null;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Steps</h2>
        <RangeSeg value={range} onChange={setRange} />
      </div>
      {points.length ? (
        <BarChart points={points} slots={slots} fmt={n0} label={range === 'all' ? 'steps a day (avg)' : range === 365 ? 'steps a day (week avg)' : 'steps'} goal={goal} goalLabel={`Goal ${n0(goal)}`} />
      ) : (
        <p className="empty">No steps in this range.</p>
      )}
      <Tiles
        items={[
          s ? { value: n0(s.avg), label: 'steps a day' } : null,
          best ? { value: n0(best.v), label: `best ${best.month ? 'month (avg)' : 'day'}: ${best.month ? monthLabel(best.t) : dateLabel(best.t)}` } : null,
          over != null && daily.length ? { value: `${over} of ${daily.length}`, label: `days at ${n0(goal)}+` } : null,
          dist ? { value: d1(dist.sum), label: 'miles walked' } : null,
          fl ? { value: d1(fl.avg), label: 'flights a day' } : null,
          dl ? { value: `${n0(dl.avg)} min`, label: 'in daylight a day' } : null,
        ]}
      />
      <AsOf hk={hk} extra="Steps from your iPhone and Apple Watch are combined hour by hour so nothing is counted twice; totals can differ slightly from the Health app." />
    </section>
  );
}

function RingsCard({ hk, hkYears, today }) {
  const [range, setRange] = useState(() => pickRange((r) => seriesOf(hk, hkYears, 'sh', r, today).length, [30, 90, 365], 10));
  const months = useMemo(() => allMonths(hk, hkYears), [hk, hkYears]);
  let closed = [0, 0, 0];
  let worn = 0;
  let span = 0;
  let pts;
  let slots;
  if (range === 'all') {
    const keys = Object.keys(months).filter((m) => months[m].rings).sort();
    keys.forEach((m) => {
      const r = months[m].rings;
      closed = closed.map((c, i) => c + r[i]);
      worn += r[3];
    });
    pts = keys.map((m) => ({ t: m, v: months[m].ae, month: true })).filter((p) => p.v != null);
    slots = pts.length ? monthSlots(pts[0].t, pts[pts.length - 1].t) : [];
  } else {
    const days = daysBetween(hkYears, addDays(today, -range + 1), today);
    span = days.length;
    const daily = [];
    days.forEach(({ iso, d }) => {
      const r = ringsOf(d);
      if (!r) return;
      worn++;
      closed = closed.map((c, i) => c + (r.closed[i] ? 1 : 0));
      daily.push({ t: iso, v: r.move, goal: r.moveGoal, r });
    });
    if (range === 365) {
      pts = weekly(daily);
      slots = weekSlots(today);
    } else {
      pts = daily.map((p) => ({ ...p, cls: p.r.closed[0] ? 'move' : 'move-soft' }));
      slots = daySlots(range, today);
    }
  }
  const ae = stats(range === 'all' ? pts : seriesOf(hk, hkYears, 'ae', range, today));
  const ex = stats(range === 'all' ? Object.values(months).filter((m) => m.ex != null).map((m) => ({ v: m.ex })) : seriesOf(hk, hkYears, 'ex', range, today));
  const sh = stats(range === 'all' ? Object.values(months).filter((m) => m.sh != null).map((m) => ({ v: m.sh })) : seriesOf(hk, hkYears, 'sh', range, today));
  const lastGoal = latestOf(hk, hkYears, 'mg', today);
  const pct = (n) => (worn ? `${Math.round((n / worn) * 100)}%` : '—');
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Activity rings</h2>
        <RangeSeg value={range} onChange={setRange} />
      </div>
      <p className="small muted">
        {worn ? `Apple Watch worn ${range === 'all' ? `on ${n0(worn)} days` : `${worn} of ${span} days`}${range === 'all' ? '' : ` in ${rangeText(range)}`}.` : `No Apple Watch activity in ${rangeText(range)}.`}
      </p>
      {pts && pts.length ? (
        <BarChart
          points={pts}
          slots={slots}
          fmt={n0}
          color="move"
          label={range === 'all' ? 'active cal a day (avg)' : range === 365 ? 'active cal a day (week avg)' : 'active calories'}
          goal={range !== 'all' && range !== 365 && lastGoal ? lastGoal.v : null}
          goalLabel={lastGoal ? `Move goal ${n0(lastGoal.v)}` : ''}
          tipExtra={(p) => (p.r ? [{ key: 'k-bar c-ex', value: `${p.r.ex} min`, text: 'exercise' }, { key: 'k-bar c-stand', value: `${p.r.stand} hr`, text: 'stand' }] : [])}
        />
      ) : null}
      {worn ? (
        <Tiles
          items={[
            { value: pct(closed[0]), label: 'Move closed', tone: 't-move' },
            { value: pct(closed[1]), label: 'Exercise closed', tone: 't-ex' },
            { value: pct(closed[2]), label: 'Stand closed', tone: 't-stand' },
            ae ? { value: n0(ae.avg), label: 'active cal a day' } : null,
            ex ? { value: `${n0(ex.avg)} min`, label: 'exercise a day' } : null,
            sh ? { value: `${d1(sh.avg)} hr`, label: 'stand hours a day' } : null,
          ]}
        />
      ) : null}
    </section>
  );
}

function WorkoutsCard({ hk, years, onOpen }) {
  const [all, setAll] = useState(false);
  const apple = hk.workouts.map((w) => ({ ...w, apple: true }));
  const manual = Object.values(years || {}).flatMap((y) => Object.entries(y.days || {}).flatMap(([iso, d]) => (d.workouts || []).map((w) => ({ id: w.id, d: iso, type: w.type, min: w.minutes, note: w.note }))));
  const list = [...apple, ...manual].sort((a, b) => (a.d + (a.t || '') < b.d + (b.t || '') ? 1 : -1));
  const byType = {};
  list.forEach((w) => (byType[typeLabel(w)] = (byType[typeLabel(w)] || 0) + 1));
  const miles = list.reduce((s, w) => s + (w.mi || 0), 0);
  const shown = all ? list : list.slice(0, 8);
  let lastYear = null;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Workouts</h2>
        <span className="muted small">{plural(list.length, 'workout')}</span>
      </div>
      {list.length ? (
        <>
          <div className="chips">
            {Object.entries(byType)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <span key={k} className="pill">
                  {k} · {n}
                </span>
              ))}
            {miles ? <span className="pill">{d1(miles)} mi total</span> : null}
          </div>
          <ul className="list wk-list">
            {shown.map((w) => {
              const y = w.d.slice(0, 4);
              const head = y !== lastYear ? y : null;
              lastYear = y;
              return (
                <React.Fragment key={`${w.id}-${w.apple ? 'a' : 'm'}`}>
                  {head ? <li className="k-head wk-year">{head}</li> : null}
                  <li>
                    <button className="rc" onClick={() => onOpen(w)}>
                      <span className={`wk-dot wk-${w.type}`} aria-hidden="true" />
                      <span className="grow">
                        <span className="rc-title">
                          {typeLabel(w)}
                          {w.route ? <span className="tag route-tag">route</span> : null}
                        </span>
                        <span className="muted small">
                          {dateLabel(w.d)} · {w.apple ? workoutLine(w) : `${w.min} min · logged here${w.note ? ` · ${w.note}` : ''}`}
                        </span>
                      </span>
                      <Icon name="chev" size={18} />
                    </button>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
          {list.length > 8 ? (
            <button className="link-btn small" onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${list.length}`}
            </button>
          ) : null}
        </>
      ) : (
        <p className="empty">No workouts yet.</p>
      )}
    </section>
  );
}

const MOBILITY = [
  ['ws', 'Speed', 'Walking speed', (v) => `${d2(v)} mph`, 'mph', 'How fast you walk on flat ground, measured by your iPhone while you carry it.'],
  ['wl', 'Step length', 'Step length', (v) => `${d1(v)} in`, 'in', 'The distance between your feet with each step.'],
  ['wd', 'Double support', 'Double support time', (v) => `${d1(v)}%`, '%', 'The share of each step with both feet on the ground. Lower usually means better balance.'],
  ['wa', 'Asymmetry', 'Walking asymmetry', (v) => `${d1(v)}%`, '%', 'How often one foot’s steps are faster or slower than the other’s. Lower is more even.'],
  ['steady', 'Steadiness', 'Walking steadiness', (v) => `${n0(v)}%`, '%', 'Apple’s estimate of your stability while walking, from your gait. Higher is steadier.'],
  ['su', 'Stairs up', 'Stair speed up', (v) => `${d2(v)} ft/s`, 'ft/s', 'How fast you climb stairs, measured by your iPhone.'],
  ['sd', 'Stairs down', 'Stair speed down', (v) => `${d2(v)} ft/s`, 'ft/s', 'How fast you go down stairs.'],
  ['walk6', '6-min walk', 'Six-minute walk', (v) => `${n0(v)} m`, 'm', 'Apple’s estimate of how far you could walk in six minutes, updated weekly from your everyday walking.'],
];
function readingsSeries(list, range, today) {
  const from = rangeFrom(range, today);
  return (list || []).filter((x) => !from || x[0] >= from).map((x) => ({ t: x[0], v: x[1] }));
}
function MobilityCard({ hk, hkYears, today }) {
  const [m, setM] = useState('ws');
  const [range, setRange] = useState(() => pickRange((r) => seriesOf(hk, hkYears, 'ws', r, today).length));
  const def = MOBILITY.find((x) => x[0] === m);
  const listKey = m === 'steady' || m === 'walk6';
  const pts = listKey ? readingsSeries(hk[m], range, today) : lineData(hk, hkYears, m, range, today);
  const s = stats(listKey ? pts : seriesOf(hk, hkYears, m, range, today));
  const last = listKey ? (hk[m].length ? { iso: hk[m][hk[m].length - 1][0], v: hk[m][hk[m].length - 1][1] } : null) : latestOf(hk, hkYears, m, today);
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Walking &amp; mobility</h2>
      </div>
      <MetricSeg value={m} onChange={setM} options={MOBILITY.map((x) => [x[0], x[1]])} />
      <div className="row-between metric-top">
        <Latest hit={last} fmt={def[3]} unit="" stale={60} />
        <RangeSeg value={range} onChange={setRange} />
      </div>
      <LineChart points={pts} from={range === 'all' ? null : rangeFrom(range, today)} to={range === 'all' ? null : today} fmt={def[3]} label={def[2]} color="blue" gap={range === 'all' ? 70 : listKey ? 21 : 10} />
      <Tiles items={[s ? { value: def[3](s.avg), label: `average, ${rangeText(range)}` } : null, s ? { value: `${def[3](s.min)} – ${def[3](s.max)}`, label: 'range' } : null]} />
      <p className="muted small note">{def[5]}</p>
    </section>
  );
}

export function ActivityView({ hk, hkYears, health, years, today, onOpenWorkout }) {
  return (
    <div className="grid">
      <div className="col">
        <StepsCard hk={hk} hkYears={hkYears} health={health} today={today} />
        <RingsCard hk={hk} hkYears={hkYears} today={today} />
      </div>
      <div className="col">
        <WorkoutsCard hk={hk} years={years} onOpen={onOpenWorkout} />
        <MobilityCard hk={hk} hkYears={hkYears} today={today} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Heart view
const HEART = [
  ['rhr', 'Resting', 'Resting heart rate', 'bpm', 'red', 'Your heart rate while you’re still and relaxed. Lower usually reflects better fitness; a change over weeks means more than any one day.'],
  ['hrv', 'Variability', 'Heart rate variability', 'ms', 'purple', 'The variation between heartbeats (SDNN). It differs a lot from person to person, so compare it with your own trend. Higher is generally better.'],
  ['whr', 'Walking', 'Walking heart rate', 'bpm', 'red', 'Your average heart rate while walking during the day.'],
  ['ha', 'Daily range', 'Heart rate', 'bpm', 'red', 'Average heart rate each day, with the shaded band showing that day’s lowest and highest readings.'],
];
function HeartCard({ hk, hkYears, today }) {
  const [m, setM] = useState('rhr');
  const [range, setRange] = useState(() => pickRange((r) => seriesOf(hk, hkYears, 'rhr', r, today).length));
  const def = HEART.find((x) => x[0] === m);
  let pts = lineData(hk, hkYears, m, range, today);
  if (m === 'ha' && range !== 'all' && range !== 365) {
    pts = pts.map((p) => {
      const d = hkDay(hkYears, p.t);
      return { ...p, lo: d && d.hl, hi: d && d.hh };
    });
  }
  const s = stats(range === 365 ? seriesOf(hk, hkYears, m, range, today) : pts);
  const last = latestOf(hk, hkYears, m, today);
  const fmt = (v) => `${n0(v)}`;
  const months = allMonths(hk, hkYears);
  const hre = Object.values(months).reduce((t, x) => t + (x.hre || 0), 0);
  const lastHre = Object.keys(months)
    .filter((k) => months[k].hre)
    .sort()
    .pop();
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Heart rate</h2>
      </div>
      <MetricSeg value={m} onChange={setM} options={HEART.map((x) => [x[0], x[1]])} />
      <div className="row-between metric-top">
        <Latest hit={last} fmt={fmt} unit={def[3]} />
        <RangeSeg value={range} onChange={setRange} />
      </div>
      <LineChart points={pts} from={range === 'all' ? null : rangeFrom(range, today)} to={range === 'all' ? null : today} fmt={(v) => `${n0(v)} ${def[3]}`} label={def[2]} color={def[4]} band={m === 'ha'} gap={range === 'all' ? 70 : 10} yLabel={(v) => String(Math.round(v))} />
      <Tiles
        items={[
          s ? { value: `${n0(s.avg)} ${def[3]}`, label: `average, ${rangeText(range)}` } : null,
          s ? { value: `${n0(s.min)}–${n0(s.max)}`, label: range === 'all' ? 'monthly averages ranged' : 'lowest–highest day' } : null,
          hre ? { value: n0(hre), label: `high heart rate alerts (last ${monthYear(lastHre)})` } : null,
        ]}
      />
      <p className="muted small note">{def[5]}</p>
    </section>
  );
}

function CardioCard({ hk }) {
  const pts = hk.vo2.map((x) => ({ t: x[0], v: x[1] }));
  const last = pts[pts.length - 1];
  const first = pts[0];
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Cardio fitness</h2>
        <span className="muted small">VO₂ max</span>
      </div>
      {last ? (
        <>
          <div className="row-between metric-top">
            <span>
              <b className="num mid">{d1(last.v)}</b> <span className="muted small">mL/kg/min</span>
              <span className="muted small block">Latest, {shortDate(last.t)}</span>
            </span>
            {pts.length > 1 ? (
              <span className="muted small num right">
                {d1(first.v)} in {first.t.slice(0, 4)}
                <br />
                {plural(pts.length, 'estimate')}
              </span>
            ) : null}
          </div>
          <LineChart points={pts} fmt={(v) => d1(v)} label="VO₂ max" color="green" gap={4000} dots />
        </>
      ) : (
        <p className="empty">No VO₂ max estimates yet. Apple Watch makes one after outdoor walks, runs or hikes with GPS.</p>
      )}
      {hk.hrr.length ? (
        <p className="small">
          Heart rate recovery (how far it drops 1 minute after a workout):{' '}
          {hk.hrr
            .slice(-4)
            .map((x) => `${x[1]} bpm (${monthYear(x[0])})`)
            .join(', ')}
          . A bigger drop is better.
        </p>
      ) : null}
      <p className="muted small note">VO₂ max is how much oxygen your body can use during hard exercise; higher is fitter. The Health app compares it with others your age and sex.</p>
    </section>
  );
}

function OxygenCard({ hk, hkYears, today }) {
  const [m, setM] = useState('o2');
  const [range, setRange] = useState(() => pickRange((r) => seriesOf(hk, hkYears, 'o2', r, today).length));
  const daily = seriesOf(hk, hkYears, m, range, today).map((p) => (m === 'o2' && range !== 'all' ? { ...p, lo: (hkDay(hkYears, p.t) || {}).o2l, hi: p.v } : p));
  const pts = range === 365 ? weekly(daily) : daily;
  const s = stats(daily);
  const last = latestOf(hk, hkYears, m, today);
  const fmt = m === 'o2' ? (v) => `${d1(v)}%` : (v) => `${d1(v)}`;
  if (!latestOf(hk, hkYears, 'o2', today) && !latestOf(hk, hkYears, 'rr', today)) return null;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Oxygen &amp; breathing</h2>
      </div>
      <MetricSeg
        value={m}
        onChange={setM}
        options={[
          ['o2', 'Blood oxygen'],
          ['rr', 'Respiratory rate'],
        ]}
      />
      <div className="row-between metric-top">
        <Latest hit={last} fmt={fmt} unit={m === 'rr' ? 'breaths/min' : ''} />
        <RangeSeg value={range} onChange={setRange} />
      </div>
      <LineChart points={pts} from={range === 'all' ? null : rangeFrom(range, today)} to={range === 'all' ? null : today} fmt={fmt} label={m === 'o2' ? 'blood oxygen (avg)' : 'breaths a minute'} color="blue" gap={range === 'all' ? 70 : 10} />
      <Tiles items={[s ? { value: fmt(s.avg), label: `average, ${rangeText(range)}` } : null, s && m === 'o2' ? { value: fmt(Math.min(...daily.map((p) => (p.lo != null ? p.lo : p.v)))), label: 'lowest reading' } : null]} />
      <p className="muted small note">{m === 'o2' ? 'Blood oxygen readings from Apple Watch, taken in the background (often while you sleep). Most healthy people read 95–100%.' : 'Breaths per minute, measured by Apple Watch while you sleep.'}</p>
    </section>
  );
}

function EcgCard({ hk, onOpen }) {
  if (!hk.ecg.length) return null;
  const list = [...hk.ecg].reverse();
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">ECG recordings</h2>
        <span className="muted small">{list.length}</span>
      </div>
      <ul className="list">
        {list.map((e) => (
          <li key={e.id}>
            <button className="rc" onClick={() => onOpen(e)}>
              <span className="grow">
                <span className="rc-title">
                  {e.result} <span className={`tag ${/sinus/i.test(e.result) ? 'tag-ok' : /inconclusive/i.test(e.result) ? 'tag-none' : 'tag-soon'}`}>{e.bpm ? `${e.bpm} bpm` : 'ECG'}</span>
                </span>
                <span className="muted small">{shortDate(e.date)}</span>
              </span>
              <Icon name="chev" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HeartView({ hk, hkYears, today, loadDoc }) {
  const [ecg, setEcg] = useState(null);
  return (
    <div className="grid">
      <div className="col">
        <HeartCard hk={hk} hkYears={hkYears} today={today} />
        <OxygenCard hk={hk} hkYears={hkYears} today={today} />
      </div>
      <div className="col">
        <CardioCard hk={hk} />
        <EcgCard hk={hk} onOpen={setEcg} />
      </div>
      {ecg ? <EcgSheet e={ecg} loadDoc={loadDoc} onClose={() => setEcg(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Sleep view
function NightCard({ hk, hkYears }) {
  const nights = useMemo(() => nightsWithSleep(hkYears), [hkYears]);
  const [i, setI] = useState(nights.length - 1);
  useEffect(() => setI(nights.length - 1), [nights.length]);
  if (!nights.length) {
    const last = latestOf(hk, hkYears, 'sl.a');
    return (
      <section className="card">
        <h2 className="card-title">Sleep</h2>
        <p className="empty">{last ? `No nights tracked in the last two years. Your last tracked sleep was around ${monthYear(last.iso)}.` : 'No sleep tracked yet. Wear your Apple Watch to bed, or set a sleep schedule in the Health app.'}</p>
      </section>
    );
  }
  const iso = nights[Math.max(0, Math.min(nights.length - 1, i))];
  const d = hkDay(hkYears, iso);
  const sl = d.sl;
  const goal = ((hk.sleepGoal && hk.sleepGoal.hours) || 8) * 60;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">{i === nights.length - 1 ? 'Last tracked night' : 'Night'}</h2>
        <div className="day-nav">
          <button className="btn quiet small" onClick={() => setI(i - 1)} disabled={i <= 0} aria-label="Previous night">
            ‹
          </button>
          <span className="small num">{dateLabel(iso)}</span>
          <button className="btn quiet small" onClick={() => setI(i + 1)} disabled={i >= nights.length - 1} aria-label="Next night">
            ›
          </button>
        </div>
      </div>
      <div className="row-between">
        <span>
          <b className="big num">{fmtMins(sl.a)}</b>
          <span className="muted small block">asleep · goal {fmtMins(goal)}</span>
        </span>
        <span className="right small">
          <span className="num">
            {clock(sl.s)} → {clock(sl.e)}
          </span>
          <span className="muted block">{sl.b ? `${fmtMins(sl.b)} in bed` : ''}</span>
        </span>
      </div>
      <div className="bar slim">
        <div className={`bar-fill ${sl.a < goal - 60 ? 'bar-ahead' : ''}`} style={{ width: `${Math.min(100, (sl.a / goal) * 100)}%` }} />
      </div>
      <StageBar sl={sl} />
      <Tiles items={[d.rr ? { value: d1(d.rr), label: 'breaths/min' } : null, d.o2 ? { value: `${d1(d.o2)}%`, label: 'blood oxygen' } : null, d.rhr ? { value: d.rhr, label: 'resting heart rate that day' } : null]} />
      <p className="muted small note">Tracked by {String(sl.src || 'Apple Health').replace(/ /g, ' ')}.</p>
    </section>
  );
}

function SleepTrendCard({ hk, hkYears, today }) {
  const [range, setRange] = useState(() => pickRange((r) => seriesOf(hk, hkYears, 'sl.a', r, today).length, [30, 90, 365], 10));
  const goal = ((hk.sleepGoal && hk.sleepGoal.hours) || 8) * 60;
  let points;
  let slots;
  let nights = [];
  if (range === 'all') {
    const months = allMonths(hk, hkYears);
    points = Object.keys(months)
      .sort()
      .filter((m) => months[m].sl)
      .map((m) => ({ t: m, v: months[m].sl.a, month: true, n: months[m].sl.n, sl: months[m].sl }));
    slots = points.length ? monthSlots(points[0].t, points[points.length - 1].t) : [];
    nights = points.map((p) => ({ t: p.t, sl: p.sl, weight: p.n }));
  } else {
    const days = daysBetween(hkYears, addDays(today, -range + 1), today).filter(({ d }) => d && d.sl && d.sl.a >= 60);
    nights = days.map(({ iso, d }) => ({ t: iso, sl: d.sl, weight: 1 }));
    if (range === 365) {
      points = weekly(nights.map((x) => ({ t: x.t, v: x.sl.a })));
      slots = weekSlots(today);
    } else {
      points = nights.map((x) =>
        x.sl.c != null
          ? {
              t: x.t,
              parts: [
                { v: x.sl.d || 0, cls: 'st-d', label: 'deep' },
                { v: x.sl.c || 0, cls: 'st-c', label: 'core' },
                { v: x.sl.r || 0, cls: 'st-r', label: 'REM' },
              ],
              sl: x.sl,
            }
          : { t: x.t, parts: [{ v: x.sl.a, cls: 'st-a', label: 'asleep' }], sl: x.sl }
      );
      slots = daySlots(range, today);
    }
  }
  const wsum = nights.reduce((s, x) => s + x.weight, 0);
  const wavg = (k) => {
    const list = nights.filter((x) => x.sl[k] != null);
    const w = list.reduce((s, x) => s + x.weight, 0);
    return w ? list.reduce((s, x) => s + x.sl[k] * x.weight, 0) / w : null;
  };
  const enough = range === 'all' ? null : nights.filter((x) => x.sl.a >= 420).length;
  const staged = range !== 'all' && range !== 365 && nights.some((x) => x.sl.c != null);
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Sleep trend</h2>
        <RangeSeg value={range} onChange={setRange} />
      </div>
      {points.length ? (
        <>
          {staged ? (
            <div className="legend small">
              <span className="lg">
                <span className="lg-sq st-d" /> Deep
              </span>
              <span className="lg">
                <span className="lg-sq st-c" /> Core
              </span>
              <span className="lg">
                <span className="lg-sq st-r" /> REM
              </span>
            </div>
          ) : null}
          <BarChart
            points={points}
            slots={slots}
            fmt={fmtMins}
            color="sleep"
            label={range === 'all' ? 'asleep a night (avg)' : 'asleep (week avg)'}
            goal={goal}
            goalLabel={`Goal ${fmtMins(goal)}`}
            tickStep={120}
            yLabel={(v) => `${v / 60}h`}
            tipExtra={(p) => (p.sl && p.sl.s != null && !p.month ? [{ text: `${clock(p.sl.s)} → ${clock(p.sl.e)}` }, { value: fmtMins(p.sl.a), text: 'total asleep' }] : [])}
          />
          <Tiles
            items={[
              { value: fmtMins(wavg('a')), label: 'asleep a night' },
              { value: clock(wavg('s')), label: 'typical bedtime' },
              { value: clock(wavg('e')), label: 'typical wake-up' },
              enough != null ? { value: `${enough} of ${nights.length}`, label: 'nights with 7h+' } : { value: n0(wsum), label: 'nights tracked' },
              wavg('d') != null ? { value: fmtMins(wavg('d')), label: 'deep sleep a night' } : null,
              wavg('r') != null ? { value: fmtMins(wavg('r')), label: 'REM a night' } : null,
            ]}
          />
        </>
      ) : (
        <p className="empty">No nights tracked in {rangeText(range)}. Try All time.</p>
      )}
      <AsOf hk={hk} extra="When the Watch and another app both tracked a night, the Watch’s record is used." />
    </section>
  );
}

export function SleepView({ hk, hkYears, today }) {
  return (
    <div className="grid">
      <div className="col">
        <NightCard hk={hk} hkYears={hkYears} />
      </div>
      <div className="col">
        <SleepTrendCard hk={hk} hkYears={hkYears} today={today} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Body view
const BODY = [
  ['fat', 'Body fat', (v) => `${d1(v)}%`],
  ['lean', 'Lean mass', (v) => `${d1(v)} lb`],
  ['bmi', 'BMI', (v) => d1(v)],
  ['lb', 'Weight', (v) => `${d1(v)} lb`],
];
function BodyCompCard({ hk, health }) {
  const [m, setM] = useState('fat');
  const def = BODY.find((x) => x[0] === m);
  const pts = hk.body.filter((x) => x[m] != null).map((x) => ({ t: x.date, v: x[m] }));
  const last = (k) => [...hk.body].reverse().find((x) => x[k] != null);
  const w = latestWeight(health);
  const h = Number(health.profile.heightIn);
  const bmiNow = w && h ? (w.lb / (h * h)) * 703 : null;
  if (!hk.body.length && !bmiNow) return null;
  const lf = last('fat');
  const ll = last('lean');
  const lw = last('waist');
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Body composition</h2>
      </div>
      <Tiles
        items={[
          bmiNow ? { value: d1(bmiNow), label: `BMI now (${d1(w.lb)} lb, ${Math.floor(h / 12)}′${Math.round(h % 12)}″)` } : null,
          lf ? { value: `${d1(lf.fat)}%`, label: `body fat, ${monthYear(lf.date)}` } : null,
          ll ? { value: `${d1(ll.lean)} lb`, label: `lean mass, ${monthYear(ll.date)}` } : null,
          lw ? { value: `${d1(lw.waist)} in`, label: `waist, ${monthYear(lw.date)}` } : null,
        ]}
      />
      {hk.body.length ? (
        <>
          <MetricSeg value={m} onChange={setM} options={BODY.map((x) => [x[0], x[1]])} />
          <LineChart points={pts} fmt={def[2]} label={def[1]} color="green" gap={120} />
          <p className="muted small note">
            {plural(hk.body.length, 'reading')} from your smart scale ({monthYear(hk.body[0].date)}
            {hk.body.length > 1 ? ` to ${monthYear(hk.body[hk.body.length - 1].date)}` : ''}). Scale body-fat numbers are estimates; the trend is more useful than any one reading.
          </p>
        </>
      ) : null}
    </section>
  );
}
function OtherCard({ hk, hkYears }) {
  const months = allMonths(hk, hkYears);
  const sum = (k) => Object.values(months).reduce((t, m) => t + (m[k] || 0), 0);
  const span = (k) => {
    const ks = Object.keys(months)
      .filter((m) => months[m][k])
      .sort();
    return ks.length ? `${monthYear(ks[0])} – ${monthYear(ks[ks.length - 1])}` : '';
  };
  const items = [
    sum('hw') ? { value: n0(sum('hw')), label: `handwashes timed by your Watch (${span('hw')})` } : null,
    sum('mm') ? { value: `${n0(sum('mm'))} min`, label: `mindfulness (${span('mm')})` } : null,
    sum('cy') ? { value: `${d1(sum('cy'))} mi`, label: `cycling (${span('cy')})` } : null,
    hk.sleepGoal ? { value: `${hk.sleepGoal.hours} hr`, label: 'sleep goal in Health' } : null,
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Other Apple Health data</h2>
      </div>
      <Tiles items={items} />
    </section>
  );
}
export function BodyView({ hk, hkYears, health, weightCard }) {
  return (
    <div className="grid">
      <div className="col">{weightCard}</div>
      <div className="col">
        <BodyCompCard hk={hk} health={health} />
        <OtherCard hk={hk} hkYears={hkYears} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Hearing view
function SoundCard({ hk, hkYears, today, k, title, blurb, alerts }) {
  const [range, setRange] = useState(() => pickRange((r) => seriesOf(hk, hkYears, k, r, today).length, [90, 365], 8));
  const pts = lineData(hk, hkYears, k, range, today);
  const s = stats(seriesOf(hk, hkYears, k, range, today));
  const last = latestOf(hk, hkYears, k, today);
  const mins = k === 'hp' ? stats(seriesOf(hk, hkYears, 'hpm', range, today)) : null;
  const months = allMonths(hk, hkYears);
  const nAlerts = Object.values(months).reduce((t, m) => t + (m[alerts] || 0), 0);
  if (!last) return null;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
        <RangeSeg value={range} onChange={setRange} />
      </div>
      <LineChart points={pts} from={range === 'all' ? null : rangeFrom(range, today)} to={range === 'all' ? null : today} fmt={(v) => `${n0(v)} dB`} label="average level" color={k === 'hp' ? 'purple' : 'amber'} refLine={{ v: 80, label: '80 dB' }} gap={range === 'all' ? 70 : 10} yLabel={(v) => String(Math.round(v))} />
      <Tiles
        items={[
          s ? { value: `${n0(s.avg)} dB`, label: `typical day, ${rangeText(range)}` } : null,
          mins ? { value: fmtMins(mins.avg), label: 'listening on days you used them' } : null,
          nAlerts ? { value: n0(nAlerts), label: 'loud-sound notifications, all time' } : null,
        ]}
      />
      <p className="muted small note">{blurb}</p>
    </section>
  );
}
function AudiogramCard({ hk }) {
  const a = hk.audiogram;
  const [ref, setRef] = useState(null);
  if (!a || !a.points || !a.points.length) return null;
  const pts = a.points.filter((p) => p[0] >= 250 && p[0] <= 8000);
  const pta = (i) => {
    const f = pts.filter((p) => [500, 1000, 2000, 4000].includes(p[0]));
    return f.length ? f.reduce((s, p) => s + p[i], 0) / f.length : null;
  };
  const W = 360;
  const H = 210;
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const fx = (f) => pad.l + ((Math.log2(f) - Math.log2(250)) / (Math.log2(8000) - Math.log2(250))) * (W - pad.l - pad.r);
  const lo = -10;
  const hi = Math.max(40, Math.ceil(Math.max(...pts.flatMap((p) => [p[1], p[2]])) / 10) * 10 + 10);
  const fy = (db) => pad.t + ((db - lo) / (hi - lo)) * (H - pad.t - pad.b); // louder (worse) is lower down, audiogram style
  const line = (i) => pts.map((p, j) => `${j ? 'L' : 'M'}${fx(p[0]).toFixed(1)},${fy(p[i]).toFixed(1)}`).join(' ');
  const L = pta(1);
  const R = pta(2);
  const verdict = (v) => (v == null ? '' : v < 20 ? 'normal range' : v < 35 ? 'mild loss range' : 'worth checking with an audiologist');
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Hearing test</h2>
        <span className="muted small">{shortDate(a.date)}</span>
      </div>
      <Tiles items={[L != null ? { value: `${d1(L)} dB`, label: `left ear average · ${verdict(L)}` } : null, R != null ? { value: `${d1(R)} dB`, label: `right ear average · ${verdict(R)}` } : null]} />
      <div className="legend small">
        <span className="lg">
          <span className="lg-x">×</span> Left
        </span>
        <span className="lg">
          <span className="lg-o">○</span> Right
        </span>
      </div>
      <svg className="audiogram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Audiogram: hearing thresholds by pitch for each ear">
        <rect x={pad.l} y={fy(lo)} width={W - pad.l - pad.r} height={fy(20) - fy(lo)} className="ag-normal" />
        {[-10, 0, 10, 20, 30, 40, 50, 60, 70, 80].filter((v) => v <= hi).map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={fy(v)} y2={fy(v)} className="grid" />
            <text x={pad.l - 6} y={fy(v) + 4} textAnchor="end" className="axis">
              {v}
            </text>
          </g>
        ))}
        {[250, 500, 1000, 2000, 4000, 8000].map((f) => (
          <text key={f} x={fx(f)} y={H - 8} textAnchor="middle" className="axis">
            {f >= 1000 ? `${f / 1000}k` : f}
          </text>
        ))}
        <path d={line(1)} className="ag-left" />
        <path d={line(2)} className="ag-right" />
        {pts.map((p) => (
          <g key={p[0]} onPointerEnter={() => setRef(p)} onPointerLeave={() => setRef(null)}>
            <text x={fx(p[0])} y={fy(p[1]) + 5} textAnchor="middle" className="ag-x">
              ×
            </text>
            <circle cx={fx(p[0])} cy={fy(p[2])} r="5" className="ag-o" />
          </g>
        ))}
      </svg>
      <p className="muted small">{ref ? `${ref[0]} Hz: left ${d1(ref[1])} dB, right ${d1(ref[2])} dB` : 'Pitch in Hz across; the quietest sound you heard, in dB, down. Higher on the chart is better; the shaded band is the normal range.'}</p>
      <p className="muted small note">From a hearing test with your AirPods. Averages use 500–4,000 Hz; under 20 dB is considered normal hearing (WHO). A screening, not a diagnosis.</p>
    </section>
  );
}
export function HearingView({ hk, hkYears, today }) {
  return (
    <div className="grid">
      <div className="col">
        <SoundCard hk={hk} hkYears={hkYears} today={today} k="hp" alerts="hpe" title="Headphone audio" blurb="Average volume through AirPods and other headphones on days you listened. Listening around 80 dB is considered safe for about 40 hours a week (WHO); louder cuts that time quickly." />
        <SoundCard hk={hk} hkYears={hkYears} today={today} k="en" alerts="lde" title="Noise around you" blurb="Average sound level around you, measured by your Apple Watch’s microphone (levels only, never audio)." />
      </div>
      <div className="col">
        <AudiogramCard hk={hk} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tab bar
export const VIEWS = [
  ['today', 'Today'],
  ['activity', 'Activity'],
  ['heart', 'Heart'],
  ['sleep', 'Sleep'],
  ['body', 'Body'],
  ['hearing', 'Hearing'],
];
export function ViewTabs({ view, onChange }) {
  return (
    <div className="seg health-tabs" role="tablist" aria-label="Health sections">
      {VIEWS.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={view === k} className={`seg-btn ${view === k ? 'on' : ''}`} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}
export { EmptyHk };
