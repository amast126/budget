// Sleep patterns (regularity, sleep debt, a suggested bedtime, and what goes with better or worse nights) and the
// one-page monthly Health report.
import React, { useMemo, useState } from 'react';
import { clock, fmtMins } from './hk-logic.js';
import { todayISO } from './health-logic.js';
import * as I from './health-insights.js';
import { exerciseOf } from './health-training.js';

const n0 = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString());
const g1 = (n) => {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric' });

// ---------------------------------------------------------------- sleep patterns
export function ConsistencyCard({ ctx, mutateHealth }) {
  const c = useMemo(() => I.sleepConsistency(ctx), [ctx.hkYears, ctx.hk, ctx.health]);
  const [goal, setGoal] = useState(String(Math.round((c.goal / 60) * 10) / 10));
  if (!c.nights) return null;
  return (
    <section className="card consistency">
      <div className="card-head">
        <h2 className="card-title">Sleep schedule</h2>
        <span className="muted small">last 2 weeks</span>
      </div>
      {c.score != null ? (
        <div className="sc-top">
          <div className={`sc-score num sc-${c.score >= 80 ? 'good' : c.score >= 60 ? 'ok' : 'bad'}`}>{c.score}</div>
          <div>
            <b>{c.label}</b>
            <div className="muted small">
              Bedtime varies ±{c.sdBed} min, wake time ±{c.sdWake} min. Usually {clock(c.bed)} → {clock(c.wake)}.
            </div>
          </div>
        </div>
      ) : (
        <p className="muted small">Five nights with bed and wake times give a regularity score.</p>
      )}
      {c.debt != null ? (
        <p className="small">
          {c.debt > 15 ? (
            <>
              Sleep debt this week: <b className="num">{fmtMins(c.debt)}</b> short of {fmtMins(c.goal)} a night.
            </>
          ) : c.debt < -15 ? (
            <>
              <b className="num">{fmtMins(-c.debt)}</b> ahead of your {fmtMins(c.goal)} goal this week.
            </>
          ) : (
            <>Right on your {fmtMins(c.goal)} goal this week.</>
          )}
        </p>
      ) : null}
      {c.suggest ? (
        <p className="sc-suggest small">
          To wake at <b>{clock(c.suggest.wake)}</b> with {fmtMins(c.goal)} of sleep, aim for lights out by <b>{clock(c.suggest.lights)}</b>
          {c.suggest.catchUp ? ' for the next few nights (30 minutes early, to pay some of the debt back)' : ''}. That allows about {c.lag} minutes to fall asleep and settle, like your usual nights.
        </p>
      ) : null}
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          const h = Number(goal);
          mutateHealth((d) => (d.sleepGoal = h >= 5 && h <= 11 ? Math.round(h * 60) : null));
        }}
      >
        <label className="grow small muted" htmlFor="sleep-goal">
          Sleep goal (hours a night)
        </label>
        <input id="sleep-goal" className="input num wg-input" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Sleep goal in hours" />
        <button className="btn quiet small" type="submit">
          Save
        </button>
      </form>
      <p className="muted small note">A regular schedule, even on weekends, matters about as much as total hours for how rested you feel.</p>
    </section>
  );
}
export function FactorsCard({ ctx }) {
  const f = useMemo(() => I.sleepFactors(ctx), [ctx.hkYears, ctx.years, ctx.hk, ctx.health]);
  const found = f.factors.filter((x) => !x.none);
  const none = f.factors.filter((x) => x.none);
  return (
    <section className="card factors">
      <div className="card-head">
        <h2 className="card-title">What affects your sleep</h2>
        <span className="muted small">{f.nights ? `${f.nights} nights` : ''}</span>
      </div>
      {found.length ? (
        <ul className="fx-list">
          {found.map((x) => (
            <li key={x.id} className={`fx fx-${x.tone}`}>
              <b>{x.label}</b>
              <span className="small">{x.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{f.nights < 20 ? 'This needs a few weeks of sleep data (import or daily sync) alongside your habits and workouts.' : 'No clear patterns yet. Log alcohol and caffeine in Habits for a few weeks and this will compare those nights with the rest.'}</p>
      )}
      {none.length ? <p className="muted small tight">No clear difference: {none.map((x) => x.label.toLowerCase()).join(', ')}.</p> : null}
      <p className="muted small note">From your last 150 days: each night compared with the day before it. These are patterns, not proof of cause, and they sharpen as more nights come in.</p>
    </section>
  );
}

// ---------------------------------------------------------------- monthly report
function Row({ label, cur, prev, fmt = n0, unit = '', better = 'up' }) {
  const val = (x) => (x == null ? null : typeof x === 'object' ? x.v : x);
  const cv = val(cur);
  const pv = val(prev);
  if (cv == null) return null;
  let d = pv != null && pv !== 0 ? cv - pv : null;
  if (d != null && fmt(Math.abs(d)) === fmt(0)) d = 0;
  const good = d == null || Math.abs(d) < 1e-9 ? '' : (d > 0) === (better === 'up') ? 'good' : better === 'none' ? '' : 'bad';
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="num">
        {fmt(cv)}
        {unit}
      </td>
      <td className="num muted">{pv != null ? `${fmt(pv)}${unit}` : '—'}</td>
      <td className={`num delta ${good}`}>{d == null || Math.abs(d) < 1e-9 ? '' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${unit}`}</td>
    </tr>
  );
}
export function ReportView({ ctx }) {
  const today = todayISO();
  const months = useMemo(() => I.reportMonths(ctx, today), [ctx.hkYears, ctx.years]);
  const def = months.find((m) => m < today.slice(0, 7)) || months[0] || today.slice(0, 7);
  const [month, setMonth] = useState(def);
  const r = useMemo(() => I.monthReport(ctx, month, today), [ctx, month]);
  const c = r.cur;
  const p = r.prev;
  const prevTitle = I.monthTitle(I.prevMonth(month)).split(' ')[0];
  return (
    <div className="report">
      <section className="card report-card">
        <div className="card-head">
          <h2 className="card-title">{r.title}</h2>
          <div className="report-tools">
            <select className="input small-select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
              {(months.length ? months : [month]).map((m) => (
                <option key={m} value={m}>
                  {I.monthTitle(m)}
                  {m === today.slice(0, 7) ? ' (so far)' : ''}
                </option>
              ))}
            </select>
            <button className="btn quiet small no-print" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </div>
        {r.partial ? <p className="muted small tight">Month to date: {r.range}.</p> : null}
        <div className="rp-highlights">
          {r.weight && r.weight.change != null ? (
            <div className="rp-hl">
              <b className="num">
                {r.weight.change > 0 ? '+' : r.weight.change < 0 ? '−' : ''}
                {g1(Math.abs(r.weight.change))} lb
              </b>
              <span>weight trend, to {g1(r.weight.end)}</span>
            </div>
          ) : null}
          {r.readiness ? (
            <div className="rp-hl">
              <b className="num">{r.readiness.avg}</b>
              <span>
                average readiness · {r.readiness.ready} ready, {r.readiness.easy} easy days
              </span>
            </div>
          ) : null}
          <div className="rp-hl">
            <b className="num">{c.workouts}</b>
            <span>workouts · {n0(c.workoutMin)} min</span>
          </div>
          {c.tennisN ? (
            <div className="rp-hl">
              <b className="num">{g1(c.tennisHours)} h</b>
              <span>tennis · {c.tennisN} sessions</span>
            </div>
          ) : null}
          {r.prs.length ? (
            <div className="rp-hl">
              <b className="num">{r.prs.length}</b>
              <span>strength PR{r.prs.length === 1 ? '' : 's'}</span>
            </div>
          ) : null}
        </div>
        <table className="rp-table">
          <thead>
            <tr>
              <th />
              <th>{r.title.split(' ')[0]}</th>
              <th>{prevTitle}</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Steps a day" cur={c.steps} prev={p.steps} />
            <Row label="Active calories" cur={c.active} prev={p.active} />
            <Row label="Exercise minutes" cur={c.exercise} prev={p.exercise} />
            <Row label="Workouts" cur={c.workouts || null} prev={p.workouts} />
            <Row label="Training load" cur={c.load || null} prev={p.load} better="none" />
            <Row label="Strength days" cur={c.liftDays || null} prev={p.liftDays} />
            <Row label="Tennis hours" cur={c.tennisHours || null} prev={p.tennisHours} fmt={g1} />
            <Row label="Sleep a night" cur={c.sleep} prev={p.sleep} fmt={fmtMins} />
            <Row label="Resting heart rate" cur={c.rhr} prev={p.rhr} unit=" bpm" better="down" />
            <Row label="HRV" cur={c.hrv} prev={p.hrv} unit=" ms" />
            <Row label="Calories eaten" cur={c.cal} prev={p.cal} better="none" />
            <Row label="Protein" cur={c.protein} prev={p.protein} unit=" g" />
            <Row label="Fiber" cur={c.fiber} prev={p.fiber} unit=" g" fmt={g1} />
            <Row label="Sodium" cur={c.sodium} prev={p.sodium} unit=" mg" better="down" />
          </tbody>
        </table>
        <div className="rp-cols">
          <div>
            <h3 className="k-head">Sleep</h3>
            <ul className="rp-list small">
              {r.bedtime ? (
                <li>
                  Usually {r.bedtime.bed} → {r.bedtime.wake}
                </li>
              ) : null}
              {r.sleepWeeks && r.sleepWeeks.best ? (
                <li>
                  Best week: {shortDate(r.sleepWeeks.best.from)}–{shortDate(r.sleepWeeks.best.to)}, {fmtMins(r.sleepWeeks.best.avg)} a night
                </li>
              ) : null}
              {r.sleepWeeks && r.sleepWeeks.worst ? (
                <li>
                  Worst week: {shortDate(r.sleepWeeks.worst.from)}–{shortDate(r.sleepWeeks.worst.to)}, {fmtMins(r.sleepWeeks.worst.avg)} a night
                </li>
              ) : null}
              {!r.bedtime && !r.sleepWeeks ? <li className="muted">Not enough nights tracked.</li> : null}
            </ul>
          </div>
          <div>
            <h3 className="k-head">Habits</h3>
            <ul className="rp-list small">
              {r.habits.length ? (
                r.habits.map((h) => (
                  <li key={h.id}>
                    {h.name}: {h.done} of {h.tracked} days{h.best >= 3 ? ` · best streak ${h.best}` : ''}
                  </li>
                ))
              ) : (
                <li className="muted">No habits tracked.</li>
              )}
            </ul>
          </div>
          {r.prs.length ? (
            <div>
              <h3 className="k-head">Personal records</h3>
              <ul className="rp-list small">
                {r.prs.slice(0, 6).map((x) => (
                  <li key={x.date + x.ex}>
                    {exerciseOf(ctx.health, x.ex).name}: {x.set.r} × {g1(x.set.lb)} ({shortDate(x.date)})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {c.zone.some((m) => m) ? (
            <div>
              <h3 className="k-head">Heart-rate zones</h3>
              <ul className="rp-list small">
                {c.zone.map((m, i) => (m ? <li key={i}>Zone {i + 1}: {n0(m)} min</li> : null))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
