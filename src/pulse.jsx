// Home's living parts: the sky header, life rings with streaks, the week in review, insights across tabs,
// and the calendar heatmap.
import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { fmt0, todayISO, addDays, dateLabel } from './budget-logic.js';
import { useWidth } from './chart-kit.jsx';
import { CountUp, celebrate, cheerOnce, reducedMotion } from './fx.jsx';
import { lifeRings, streaks, countdowns, dayLine, skyOf, weekReview, weekHeadline, mondayOf, insights, HEAT_METRICS, heatValue, binsOf, binOf } from './pulse-logic.js';
import { fmtMins } from './hk-logic.js';

const n0 = (n) => Math.round(Number(n) || 0).toLocaleString();
const shortDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric' });

export function useNow(ms = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    const on = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', on);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', on);
    };
  }, [ms]);
  return now;
}

// ---------------------------------------------------------------- header
export function Hero({ ctx, wx, greeting, name }) {
  const now = useNow();
  const sky = skyOf(now, wx && wx.sunriseISO, wx && wx.sunsetISO, wx && wx.code);
  const lines = useMemo(() => dayLine({ ...ctx, wx, now }), [ctx, wx, now.getHours(), now.getMinutes() >> 4]);
  const cds = useMemo(() => countdowns(ctx), [ctx]);
  const arc = 72 - Math.sin(Math.PI * sky.x) * 52; // % from the top: low at the ends, high at noon/midnight
  return (
    <header className={`hero sky-${sky.phase} wx-${sky.kind}`}>
      <div className="sky-art" aria-hidden="true">
        {sky.phase === 'night' || sky.phase === 'dusk' ? <span className="stars" /> : null}
        <span className={`orb ${sky.phase === 'night' ? 'moon' : 'sun'}`} style={{ left: `${6 + sky.x * 80}%`, top: `${arc}%` }} />
        {sky.kind === 'cloudy' || sky.kind === 'partly' || sky.kind === 'rain' || sky.kind === 'storm' || sky.kind === 'snow' || sky.kind === 'fog' ? (
          <>
            <span className="cloud c1" />
            <span className="cloud c2" />
            {sky.kind !== 'partly' ? <span className="cloud c3" /> : null}
          </>
        ) : null}
        {sky.kind === 'rain' || sky.kind === 'storm' ? <span className="rain" /> : null}
        {sky.kind === 'snow' ? <span className="snow" /> : null}
      </div>
      <div className="hero-top">
        <div className="grow">
          <h1 className="hero-title">
            {greeting}
            {name ? `, ${name}` : ''}
          </h1>
          <div className="hero-date">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        {wx ? (
          <div className="hero-wx" title={`${wx.now.text}, feels like ${wx.feels}°`}>
            <span className="hero-wx-icon" aria-hidden="true">
              {wx.now.icon}
            </span>
            <span>
              <b className="hero-temp">{wx.temp}°</b>
              <span className="hero-hl">
                H {wx.high}° · L {wx.low}°
              </span>
            </span>
          </div>
        ) : null}
      </div>
      {lines.length ? <p className="hero-line">{lines.join(' ')}</p> : null}
      {cds.length ? (
        <div className="chips-row" role="list" aria-label="Countdowns">
          {cds.map((c) => {
            const body = (
              <>
                <b className="cd-n">{c.text ? c.text : <CountUp value={c.n} />}</b>
                {c.text ? null : (
                  <span className="cd-l">
                    {c.unit} {c.label}
                  </span>
                )}
              </>
            );
            return c.href ? (
              <a key={c.id} role="listitem" className={`cd ${c.tone || ''}`} href={c.href}>
                {body}
              </a>
            ) : (
              <span key={c.id} role="listitem" className={`cd ${c.tone || ''}`}>
                {body}
              </span>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}

// ---------------------------------------------------------------- life rings + streaks
function Ring({ value, closed, label }) {
  const [on, setOn] = useState(() => reducedMotion());
  useEffect(() => {
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(t);
  }, []);
  const r = 26;
  const C = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <svg viewBox="0 0 64 64" className="ring-svg" role="img" aria-label={`${label}: ${closed ? 'closed' : `${Math.round(v * 100)}%`}`}>
      <circle className="ring-track" cx="32" cy="32" r={r} />
      <circle className="ring-arc" cx="32" cy="32" r={r} strokeDasharray={C} strokeDashoffset={on ? C * (1 - v) : C} transform="rotate(-90 32 32)" />
      {closed ? <path className="ring-check" d="M22 33l7 7 13-15" /> : <text className="ring-pct" x="32" y="36.5" textAnchor="middle">{`${Math.round(v * 100)}%`}</text>}
    </svg>
  );
}

export function RingsCard({ ctx, onReview }) {
  const rings = useMemo(() => lifeRings(ctx), [ctx]);
  const st = useMemo(() => streaks(ctx), [ctx]);
  const closed = rings.filter((r) => r.closed).length;
  const ready = rings.every((r) => !r.pending);
  const today = ctx.today || todayISO();
  useEffect(() => {
    if (ready && closed === 4) cheerOnce(`rings:${today}`, () => celebrate({ big: true }));
  }, [ready, closed, today]);
  const bodyClosed = rings.find((r) => r.id === 'body' && r.closed);
  useEffect(() => {
    if (ready && bodyClosed && closed < 4) cheerOnce(`body:${today}`, () => celebrate({}));
  }, [ready, !!bodyClosed]);
  // Streaks that are alive (today, or through yesterday so you can keep them going), longest first.
  const live = st.filter((x) => x.current > 0).sort((a, b) => b.current - a.current);
  const bestEver = !live.length ? [...st].sort((a, b) => b.best - a.best)[0] : null;
  return (
    <section className="card rings-card">
      <div className="card-head">
        <h2 className="card-title">Today’s rings</h2>
        <span className="muted small">{ready ? (closed === 4 ? 'All closed' : `${closed} of 4 closed`) : ''}</span>
      </div>
      <div className="life-rings">
        {rings.map((r) => (
          <a key={r.id} className={`lring ${r.closed ? 'closed' : ''} ${r.pending ? 'pending' : ''}`} href={r.href} title={r.goal}>
            <Ring value={r.value} closed={r.closed} label={r.label} />
            <span className="lr-label">{r.label}</span>
            <span className="lr-detail">{r.detail}</span>
          </a>
        ))}
      </div>
      {live.length ? (
        <div className="streaks" aria-label="Streaks">
          {live.map((x) => (
            <span key={x.id} className={`streak ${x.today ? 'on' : 'keep'}`} title={`${x.current} ${x.label} in a row (${x.hint}). Best: ${x.best}.${x.today ? '' : ' Keep it going today.'}`}>
              <Icon name="flame" size={14} />
              <b className="num">{x.current}</b> {x.short}
              <span className="muted"> · best {x.best}</span>
            </span>
          ))}
        </div>
      ) : bestEver && bestEver.best > 1 ? (
        <p className="muted small streak-none">No streaks going right now. Your best: {bestEver.best} {bestEver.label} in a row.</p>
      ) : null}
      <div className="row-between rings-foot">
        <span className="muted small">Tap a ring to see what closes it.</span>
        <button className="link-btn small" onClick={onReview}>
          Week in review →
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- week in review
function Delta({ cur, prev, goodUp, fmt = n0, unit = '' }) {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  if (Math.abs(d) < 0.5) return <span className="delta flat">same as last week</span>;
  const good = goodUp ? d > 0 : d < 0;
  return (
    <span className={`delta ${good ? 'good' : 'bad'}`}>
      {d > 0 ? '▲' : '▼'} {fmt(Math.abs(d))}
      {unit} vs last week
    </span>
  );
}
function weekTiles(w, p) {
  const h = (m) => `${Math.round((m / 60) * 10) / 10}h`;
  return [
    w.spent != null
      ? {
          label: `Spent${w.allowance ? ` · ${w.spent <= w.allowance ? `${fmt0(w.allowance - w.spent)} under` : `${fmt0(w.spent - w.allowance)} over`} budget` : ''}`,
          value: fmt0(w.spent),
          delta: <Delta cur={w.spent} prev={p && p.spent} goodUp={false} fmt={fmt0} />,
          tone: w.allowance && w.spent <= w.allowance ? 'good' : w.allowance ? 'bad' : '',
        }
      : null,
    w.dining ? { label: `Dining out · ${w.dining.n} time${w.dining.n === 1 ? '' : 's'}`, value: fmt0(w.dining.amount), delta: <Delta cur={w.dining.amount} prev={p && p.dining && p.dining.amount} goodUp={false} fmt={fmt0} /> } : null,
    w.groceries != null ? { label: 'Groceries', value: fmt0(w.groceries) } : null,
    w.workouts ? { label: `Workouts · ${n0(w.workouts.minutes)} min`, value: n0(w.workouts.n), delta: <Delta cur={w.workouts.n} prev={p && p.workouts && p.workouts.n} goodUp /> } : null,
    w.steps != null ? { label: 'Steps a day', value: n0(w.steps), delta: <Delta cur={w.steps} prev={p && p.steps} goodUp /> } : null,
    w.food ? { label: w.food.avg ? `Food logged · avg ${n0(w.food.avg)} cal` : 'Food logged', value: `${w.food.days}/${w.n} days` } : null,
    w.sleep ? { label: `Asleep a night · ${w.sleep.n} night${w.sleep.n === 1 ? '' : 's'}`, value: fmtMins(w.sleep.avg) } : null,
    w.study ? { label: `Study · goal ${h(w.study.goal)}`, value: h(w.study.minutes), delta: <Delta cur={w.study.minutes / 60} prev={p && p.study && p.study.minutes / 60} goodUp fmt={(v) => Math.round(v * 10) / 10} unit="h" />, tone: w.study.minutes >= w.study.goal ? 'good' : '' } : null,
    w.todos != null ? { label: 'To-dos done', value: n0(w.todos), delta: <Delta cur={w.todos} prev={p && p.todos} goodUp /> } : null,
  ].filter(Boolean);
}
function WeekBody({ ctx, start }) {
  const w = useMemo(() => weekReview(ctx, start), [ctx, start]);
  const p = useMemo(() => weekReview(ctx, addDays(start, -7)), [ctx, start]);
  useEffect(() => {
    if (w.complete && w.allowance && w.spent <= w.allowance) cheerOnce(`week:${start}`, () => celebrate({ big: true }));
  }, [start]);
  return (
    <>
      <p className="week-head">{weekHeadline(w)}</p>
      {w.noCard ? <p className="muted small">No card spending imported for this week yet (the budget has transactions through {dateLabel(w.noCard)}).</p> : w.cardThrough ? <p className="muted small">Spending covers card transactions through {dateLabel(w.cardThrough)}.</p> : null}
      <div className="tiles week-tiles">
        {weekTiles(w, p).map((t, i) => (
          <div key={i} className={`tile ${t.tone ? `w-${t.tone}` : ''}`}>
            <b>{t.value}</b>
            <span>{t.label}</span>
            {t.delta || null}
          </div>
        ))}
      </div>
    </>
  );
}
export function WeekSheet({ ctx, onClose }) {
  const today = ctx.today || todayISO();
  const thisWeek = mondayOf(today);
  const [start, setStart] = useState(thisWeek);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet tall week-sheet" role="dialog" aria-label="Week in review" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 className="card-title">Week in review</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="day-nav week-nav">
          <button className="btn quiet small" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">
            ‹
          </button>
          <span className="small num">
            {start === thisWeek ? 'This week' : start === addDays(thisWeek, -7) ? 'Last week' : `Week of ${shortDay(start)}`} · {shortDay(start)}–{shortDay(addDays(start, 6))}
          </span>
          <button className="btn quiet small" onClick={() => setStart(addDays(start, 7))} disabled={start >= thisWeek} aria-label="Next week">
            ›
          </button>
        </div>
        <WeekBody ctx={ctx} start={start} />
      </div>
    </div>
  );
}
// On Sundays the recap of this week sits on Home; on Mondays, last week's.
export function WeekCard({ ctx, onOpen }) {
  const today = ctx.today || todayISO();
  const dow = new Date(`${today}T12:00:00`).getDay();
  if (dow !== 0 && dow !== 1) return null;
  const start = dow === 0 ? mondayOf(today) : addDays(mondayOf(today), -7);
  return (
    <section className="card week-card">
      <div className="card-head">
        <h2 className="card-title">{dow === 0 ? 'Your week' : 'Last week'}</h2>
        <button className="link-btn small" onClick={onOpen}>
          Details →
        </button>
      </div>
      <WeekBody ctx={ctx} start={start} />
    </section>
  );
}

// ---------------------------------------------------------------- insights
const TONE = { good: ['✓', 'Going well'], watch: ['!', 'Worth a look'], info: ['i', 'Good to know'] };
export function InsightsCard({ ctx }) {
  const list = useMemo(() => insights(ctx).slice(0, 4), [ctx]);
  if (!list.length) return null;
  return (
    <section className="card insights">
      <div className="card-head">
        <h2 className="card-title">Insights</h2>
        <span className="muted small">Across your tabs</span>
      </div>
      <ul className="list">
        {list.map((x) => (
          <li key={x.id}>
            <a className="insight" href={x.href}>
              <span className={`ins-icon ins-${x.tone}`} role="img" aria-label={TONE[x.tone][1]}>
                {TONE[x.tone][0]}
              </span>
              <span className="grow">{x.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- heatmap
const HEAT_FMT = {
  spend: (v) => fmt0(v),
  steps: (v) => `${n0(v)} steps`,
  study: (v) => `${n0(v)} min`,
  food: (v) => `${n0(v)} cal`,
};
export function HeatmapCard({ ctx }) {
  const [metric, setMetric] = useState(() => {
    try {
      return localStorage.getItem('dash.heat') || 'spend';
    } catch {
      return 'spend';
    }
  });
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const today = ctx.today || todayISO();
  const cell = 12;
  const gap = 3;
  const labelW = 22;
  const weeks = Math.max(10, Math.min(27, Math.floor((width - labelW) / (cell + gap))));
  const start = addDays(mondayOf(today), -(weeks - 1) * 7);
  const grid = useMemo(() => {
    const cache = {};
    const cols = [];
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const iso = addDays(start, w * 7 + d);
        col.push({ iso, v: iso > today ? undefined : heatValue(ctx, metric, iso, cache) });
      }
      cols.push(col);
    }
    return cols;
  }, [ctx, metric, weeks, start, today]);
  const all = grid.flat().filter((c) => c.v != null);
  const cuts = binsOf(all.map((c) => c.v));
  const pos = all.filter((c) => c.v > 0);
  const f = HEAT_FMT[metric];
  const summary =
    metric === 'spend'
      ? all.length
        ? `Spent on ${pos.length} of ${all.length} days · ${fmt0(pos.reduce((s, c) => s + c.v, 0) / Math.max(1, all.length))} a day on average`
        : 'No spending recorded in this range.'
      : metric === 'steps'
        ? pos.length
          ? `${n0(pos.reduce((s, c) => s + c.v, 0) / pos.length)} steps a day on the ${pos.length} days with a count`
          : 'No steps in this range. Type them on Health, or import from Apple Health.'
        : metric === 'study'
          ? pos.length
            ? `Studied on ${pos.length} days · ${Math.round((pos.reduce((s, c) => s + c.v, 0) / 60) * 10) / 10}h in all`
            : 'No study logged in this range.'
          : pos.length
            ? `Food logged on ${pos.length} days · ${n0(pos.reduce((s, c) => s + c.v, 0) / pos.length)} cal a day on those days`
            : 'No food logged in this range.';
  const hv = hover ? hover : null;
  const months = [];
  grid.forEach((col, i) => {
    const m = col[0].iso.slice(5, 7);
    if (i === 0 || grid[i - 1][0].iso.slice(5, 7) !== m) months.push({ i, label: new Date(`${col[0].iso}T12:00:00`).toLocaleString('en-US', { month: 'short' }) });
  });
  const setM = (m) => {
    setMetric(m);
    setHover(null);
    try {
      localStorage.setItem('dash.heat', m);
    } catch {
      /* ignore */
    }
  };
  return (
    <section className="card heat-card">
      <div className="card-head">
        <h2 className="card-title">Patterns</h2>
        <span className="muted small">Last {weeks} weeks</span>
      </div>
      <div className="seg metric-seg" role="group" aria-label="Measure">
        {HEAT_METRICS.map(([k, l]) => (
          <button key={k} className={`seg-btn ${metric === k ? 'on' : ''}`} onClick={() => setM(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="heat" ref={ref} onPointerLeave={() => setHover(null)}>
        <div className="heat-months">
          {months.map((m) => (
            <span key={m.i} style={{ left: labelW + m.i * (cell + gap) }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="heat-body">
          <div className="heat-days" style={{ width: labelW }}>
            {['M', '', 'W', '', 'F', '', ''].map((d, i) => (
              <span key={i} style={{ height: cell, marginBottom: gap }}>
                {d}
              </span>
            ))}
          </div>
          <div className="heat-grid" role="grid" aria-label={`${HEAT_METRICS.find((m) => m[0] === metric)[1]} by day`}>
            {grid.map((col, i) => (
              <div key={i} className="heat-col" role="row">
                {col.map((c) => {
                  const b = c.v === undefined ? 'future' : binOf(c.v, cuts);
                  return (
                    <span
                      key={c.iso}
                      role="gridcell"
                      tabIndex={-1}
                      aria-label={`${dateLabel(c.iso)}: ${c.v == null ? 'no data' : f(c.v)}`}
                      className={`hc b${b} ${hv && hv.iso === c.iso ? 'hl' : ''}`}
                      style={{ width: cell, height: cell, marginBottom: gap }}
                      onPointerEnter={() => c.v !== undefined && setHover(c)}
                      onPointerDown={() => c.v !== undefined && setHover(c)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="row-between heat-foot">
        <span className="small heat-read">{hv ? `${dateLabel(hv.iso)}: ${hv.v == null ? 'no data' : f(hv.v)}` : summary}</span>
        <span className="heat-legend small muted" aria-hidden="true">
          Less <i className="hc b0" /> <i className="hc b1" /> <i className="hc b2" /> <i className="hc b3" /> <i className="hc b4" /> More
        </span>
      </div>
    </section>
  );
}
