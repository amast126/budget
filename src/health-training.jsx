// The Training view: training load and heart-rate zones, the strength log (routines, PRs, progress, weekly sets by
// muscle), and the tennis log. Also the zone bars inside a workout's sheet.
import React, { useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { LineChart, BarChart } from './chart-kit.jsx';
import { dateLabel } from './budget-logic.js';
import { todayISO, addDays } from './health-logic.js';
import * as T from './health-training.js';
import { IS_DEMO } from './demo-flag.js';

const n0 = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString());
const g1 = (n) => {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
const plural = (n, w, many = `${w}s`) => `${n0(n)} ${Math.round(n) === 1 ? w : many}`;
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric' });
const setText = (s) => `${s.r} × ${g1(s.lb)}`;
const ZONE_CLS = ['z1', 'z2', 'z3', 'z4', 'z5'];

function Tiles({ items }) {
  const list = items.filter(Boolean);
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

// ---------------------------------------------------------------- zones
export function ZoneStrip({ mins }) {
  const total = mins.reduce((s, m) => s + m, 0);
  if (!total) return null;
  return (
    <div className="zone-strip" role="img" aria-label={mins.map((m, i) => `Zone ${i + 1}: ${Math.round(m)} min`).join(', ')}>
      {mins.map((m, i) => (m ? <span key={i} className={`zs ${ZONE_CLS[i]}`} style={{ flexGrow: m }} /> : null))}
    </div>
  );
}
export function ZoneList({ mins, max }) {
  return (
    <ul className="zone-list small">
      {T.ZONES.map(([z, name, lo], i) => (
        <li key={z}>
          <span className={`zdot ${ZONE_CLS[i]}`} />
          <b>{z}</b> {name} <span className="muted">{Math.round(lo * max)}{i < 4 ? `–${Math.round(T.ZONES[i + 1][2] * max) - 1}` : '+'} bpm</span>
          <span className="num grow right">{Math.round(mins[i])} min</span>
        </li>
      ))}
    </ul>
  );
}
export function WorkoutZones({ w, health }) {
  const max = T.maxHr(health);
  const z = T.zonesOf(w, max);
  const load = T.loadOf(w, max);
  return (
    <div className="wk-zones">
      <h3 className="k-head">Heart-rate zones</h3>
      {z ? (
        <>
          <ZoneStrip mins={z.mins} />
          <ZoneList mins={z.mins} max={max} />
          <p className="muted small note">
            Training load {n0(load)}. Zones from a max heart rate of {max} (set it on the Training view).{z.est ? ' Estimated from the average heart rate; re-import your Apple Health export for minute-by-minute zones.' : ''}
          </p>
        </>
      ) : (
        <p className="muted small">No heart rate for this workout. Training load {n0(load)}, estimated from its length.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- training load
function LoadCard({ ctx, mutateHealth }) {
  const tl = useMemo(() => T.trainingLoad(ctx), [ctx.hk, ctx.years, ctx.health]);
  const [max, setMax] = useState(ctx.health.maxHr ? String(ctx.health.maxHr) : '');
  const slots = tl.series.map((p) => p.t);
  const tone = { spike: 'neg', high: 'warn', steady: 'pos', low: '' }[tl.state] || '';
  return (
    <section className="card load-card">
      <div className="card-head">
        <h2 className="card-title">Training load</h2>
        <span className="muted small">last 7 days</span>
      </div>
      <Tiles
        items={[
          { value: n0(tl.acute), label: 'this week' },
          { value: n0(tl.chronic), label: '4-week average' },
          tl.ratio != null ? { value: `${tl.ratio.toFixed(1)}×`, label: 'of your usual', tone } : null,
        ]}
      />
      {tl.state ? <p className="small tight">{T.LOAD_TEXT[tl.state]}</p> : <p className="muted small tight">Log workouts for a few weeks to compare against your usual.</p>}
      <BarChart points={tl.series} slots={slots} fmt={(v) => n0(v)} label="Load" height={130} color="blue" goal={tl.chronic || null} goalLabel="usual" />
      <h3 className="k-head">Time in zones this week</h3>
      {tl.zones.some((m) => m) ? (
        <>
          <ZoneStrip mins={tl.zones} />
          <ZoneList mins={tl.zones} max={tl.max} />
        </>
      ) : (
        <p className="muted small">No workouts with heart rate this week.</p>
      )}
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          mutateHealth((h) => (h.maxHr = Number(max) >= 120 && Number(max) <= 230 ? Number(max) : null));
        }}
      >
        <label className="grow small muted" htmlFor="max-hr">
          Max heart rate {ctx.health.maxHr ? '' : `(from your age: ${tl.max})`}
        </label>
        <input id="max-hr" className="input num wg-input" inputMode="numeric" placeholder={String(tl.max)} value={max} onChange={(e) => setMax(e.target.value)} aria-label="Max heart rate" />
        <button className="btn quiet small" type="submit">
          Save
        </button>
      </form>
      <p className="muted small note">Load is minutes × zone (1–5) for workouts with heart rate, and a typical effort for the sport otherwise. A week far above your 4-week average is when injuries tend to happen.</p>
    </section>
  );
}

// ---------------------------------------------------------------- strength
function LiftBlock({ l, health, years, iso, act }) {
  const ex = T.exerciseOf(health, l.ex);
  const last = T.lastSession(years, l.ex, iso);
  const lastSet = l.sets[l.sets.length - 1] || (last && last.sets[last.sets.length - 1]) || null;
  const [f, setF] = useState({ r: lastSet ? String(lastSet.r) : '', lb: lastSet ? String(lastSet.lb) : '' });
  const best = l.sets.length ? Math.max(...l.sets.map(T.e1rm)) : null;
  const prevBest = useMemo(() => {
    const h = T.history(years, l.ex).filter((s) => s.date < iso);
    return h.length ? Math.max(...h.map((s) => s.best)) : null;
  }, [years, l.ex, iso]);
  const pr = best != null && prevBest != null && best > prevBest;
  return (
    <li className="lift">
      <div className="row-between">
        <b>
          {ex.name} {pr ? <span className="pill pr-pill">PR</span> : null}
        </b>
        <button className="x" aria-label={`Remove ${ex.name}`} onClick={() => act.mutateDay(iso, (y) => T.removeLift(y, iso, l.id))}>
          ×
        </button>
      </div>
      {last ? (
        <div className="muted small">
          Last time ({shortDate(last.date)}): {last.sets.map(setText).join(', ')}
          {!l.sets.length ? (
            <button className="link-btn small repeat" onClick={() => act.mutateDay(iso, (y) => T.copySets(y, iso, l.id, last.sets))}>
              Repeat
            </button>
          ) : null}
        </div>
      ) : null}
      {l.sets.length ? (
        <div className="set-chips">
          {l.sets.map((s, i) => (
            <span key={i} className="set-chip num">
              {setText(s)}
              <button aria-label={`Remove set ${i + 1}`} onClick={() => act.mutateDay(iso, (y) => T.removeSet(y, iso, l.id, i))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <form
        className="set-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!(Number(f.r) > 0)) return;
          act.mutateDay(iso, (y) => T.addSet(y, iso, l.id, { r: f.r, lb: f.lb || 0 }));
        }}
      >
        <input className="input num" inputMode="numeric" placeholder="Reps" value={f.r} onChange={(e) => setF({ ...f, r: e.target.value })} aria-label={`${ex.name} reps`} />
        <span className="muted">×</span>
        <input className="input num" inputMode="decimal" placeholder="lb" value={f.lb} onChange={(e) => setF({ ...f, lb: e.target.value })} aria-label={`${ex.name} weight`} />
        <button className="btn small" type="submit" disabled={!(Number(f.r) > 0)}>
          Add set
        </button>
      </form>
    </li>
  );
}
function StrengthCard({ ctx, act, mutateHealth }) {
  const { health, years } = ctx;
  const [iso, setIso] = useState(todayISO());
  const [pick, setPick] = useState('');
  const [custom, setCustom] = useState(null);
  const [saving, setSaving] = useState(null);
  const [editRoutines, setEditRoutines] = useState(false);
  const list = T.lifts(years, iso);
  const routines = (health.strength && health.strength.routines) || [];
  const all = T.exercises(health);
  const sets = list.reduce((s, l) => s + l.sets.length, 0);
  const volume = list.reduce((s, l) => s + l.sets.reduce((a, x) => a + x.r * x.lb, 0), 0);
  const add = (id) => id && act.mutateDay(iso, (y) => T.addLift(y, iso, id));
  return (
    <section className="card strength">
      <div className="card-head">
        <h2 className="card-title">Strength</h2>
        <div className="day-nav">
          <button className="btn quiet small" onClick={() => setIso(addDays(iso, -1))} aria-label="Previous day">
            ‹
          </button>
          <button className="btn quiet small day-label" onClick={() => setIso(todayISO())} disabled={iso === todayISO()}>
            {iso === todayISO() ? 'Today' : dateLabel(iso)}
          </button>
          <button className="btn quiet small" onClick={() => setIso(addDays(iso, 1))} disabled={iso >= todayISO()} aria-label="Next day">
            ›
          </button>
        </div>
      </div>
      {routines.length ? (
        <div className="chips routine-chips">
          {routines.map((r) =>
            editRoutines ? (
              <span key={r.id} className="chip">
                {r.name}{' '}
                <button className="chip-x" aria-label={`Delete routine ${r.name}`} onClick={() => mutateHealth((h) => T.removeRoutine(h, r.id))}>
                  ×
                </button>
              </span>
            ) : (
              <button key={r.id} className="chip" onClick={() => act.mutateDay(iso, (y) => T.startRoutine(y, iso, r), `${r.name}: ${plural(r.ex.length, 'exercise')} added`)} title={r.ex.map((id) => T.exerciseOf(health, id).name).join(', ')}>
                Start {r.name}
              </button>
            )
          )}
          <button className="link-btn small" onClick={() => setEditRoutines(!editRoutines)}>
            {editRoutines ? 'Done' : 'Edit'}
          </button>
        </div>
      ) : null}
      {list.length ? (
        <ul className="lift-list">
          {list.map((l) => (
            <LiftBlock key={l.id} l={l} health={health} years={years} iso={iso} act={act} />
          ))}
        </ul>
      ) : (
        <p className="muted small">{routines.length ? 'Start a routine or add an exercise.' : 'Add an exercise to log sets. Save a workout as a routine to start it in one tap next time.'}</p>
      )}
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (pick === '__new') return;
          add(pick);
          setPick('');
        }}
      >
        <select
          className="input"
          value={pick}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__new') return setCustom({ name: '', group: 'chest' });
            setPick(v);
          }}
          aria-label="Exercise"
        >
          <option value="">Add an exercise…</option>
          {T.GROUPS.map(([g, gl]) => (
            <optgroup key={g} label={gl}>
              {all
                .filter((x) => x.group === g)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </optgroup>
          ))}
          <option value="__new">Another exercise…</option>
        </select>
        <button className="btn" type="submit" disabled={!pick}>
          Add
        </button>
      </form>
      {custom ? (
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            let id = null;
            mutateHealth((h) => {
              const x = T.addExercise(h, custom.name, custom.group);
              id = x && x.id;
            }).then(() => id && add(id));
            setCustom(null);
          }}
        >
          <input className="input" placeholder="Exercise name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} aria-label="New exercise name" autoFocus />
          <select className="input" value={custom.group} onChange={(e) => setCustom({ ...custom, group: e.target.value })} aria-label="Muscle group">
            {T.GROUPS.map(([g, gl]) => (
              <option key={g} value={g}>
                {gl}
              </option>
            ))}
          </select>
          <button className="btn" type="submit" disabled={!custom.name.trim()}>
            Add
          </button>
        </form>
      ) : null}
      {list.length ? (
        <div className="row-between small strength-foot">
          <span className="muted num">
            {plural(list.length, 'exercise')} · {plural(sets, 'set')} · {n0(volume)} lb moved
          </span>
          {saving == null ? (
            <button className="link-btn small" onClick={() => setSaving('')}>
              Save as a routine
            </button>
          ) : null}
        </div>
      ) : null}
      {saving != null ? (
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            mutateHealth((h) => T.saveRoutine(h, saving, list.map((l) => l.ex)), `Routine “${saving.trim() || 'Routine'}” saved`);
            setSaving(null);
          }}
        >
          <input className="input" placeholder="Routine name (e.g. Push day)" value={saving} onChange={(e) => setSaving(e.target.value)} aria-label="Routine name" autoFocus />
          <button className="btn small" type="submit" disabled={!saving.trim()}>
            Save
          </button>
          <button className="btn quiet small" type="button" onClick={() => setSaving(null)}>
            Cancel
          </button>
        </form>
      ) : null}
    </section>
  );
}
function ProgressCard({ ctx }) {
  const { health, years } = ctx;
  const counts = useMemo(() => {
    const c = {};
    for (const y of Object.values(years || {})) for (const d of Object.values(y.days || {})) (d.lifts || []).forEach((l) => l.sets && l.sets.length && (c[l.ex] = (c[l.ex] || 0) + 1));
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [years]);
  const [ex, setEx] = useState(null);
  const cur = ex || (counts[0] && counts[0][0]);
  const hist = useMemo(() => (cur ? T.history(years, cur) : []), [years, cur]);
  const prList = useMemo(() => T.prs(years, addDays(todayISO(), -90)), [years]);
  if (!counts.length) return null;
  const first = hist[0];
  const last = hist[hist.length - 1];
  const top = hist.reduce((a, s) => (!a || s.top > a.top ? s : a), null);
  return (
    <section className="card progress-card">
      <div className="card-head">
        <h2 className="card-title">Progress</h2>
        <select className="input small-select" value={cur} onChange={(e) => setEx(e.target.value)} aria-label="Exercise to chart">
          {counts.map(([id]) => (
            <option key={id} value={id}>
              {T.exerciseOf(health, id).name}
            </option>
          ))}
        </select>
      </div>
      <Tiles
        items={[
          last ? { value: `${g1(last.best)} lb`, label: 'estimated max, last session' } : null,
          top ? { value: `${g1(top.top)} lb`, label: `heaviest set (${shortDate(top.date)})` } : null,
          first && last && first !== last ? { value: `${last.best >= first.best ? '+' : ''}${g1(last.best - first.best)} lb`, label: `since ${shortDate(first.date)}`, tone: last.best >= first.best ? 'pos' : '' } : { value: plural(hist.length, 'session'), label: 'so far' },
        ]}
      />
      {hist.length >= 2 ? <LineChart points={hist.map((s) => ({ t: s.date, v: s.best }))} fmt={(v) => `${g1(v)} lb`} label="Estimated max" color="purple" height={150} gap={60} dots /> : <p className="muted small">Log it again to start a progress line.</p>}
      {prList.length ? (
        <>
          <h3 className="k-head">Personal records, last 90 days</h3>
          <ul className="log-list small">
            {prList.slice(0, 6).map((p) => (
              <li key={p.date + p.ex}>
                <span className="muted">{shortDate(p.date)}</span> · {T.exerciseOf(health, p.ex).name} · <span className="num">{setText(p.set)}</span> <span className="muted">(est. max {g1(p.best)}, +{g1(p.best - p.prev)})</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="muted small note">Estimated max uses the Epley formula (weight × (1 + reps ÷ 30)) on your best set. Keep reps the same and nudge the weight up, or add a rep at the same weight: either counts as progress.</p>
    </section>
  );
}
function VolumeCard({ ctx }) {
  const { health, years } = ctx;
  const start = T.mondayOf(todayISO());
  const cur = T.weeklyVolume(health, years, start);
  const prev = T.weeklyVolume(health, years, addDays(start, -7));
  const groups = T.GROUPS.filter(([g]) => cur[g] || prev[g]);
  if (!groups.length) return null;
  return (
    <section className="card volume-card">
      <div className="card-head">
        <h2 className="card-title">Sets by muscle</h2>
        <span className="muted small">this week (last week)</span>
      </div>
      <ul className="vol-list">
        {groups.map(([g, gl]) => {
          const n = (cur[g] && cur[g].sets) || 0;
          const p = (prev[g] && prev[g].sets) || 0;
          return (
            <li key={g}>
              <span className="vol-name small">{gl}</span>
              <span className="vol-bar">
                <span className="vol-band" />
                <span className="vol-fill" style={{ width: `${Math.min(100, (n / 25) * 100)}%` }} />
              </span>
              <span className="num small vol-n">
                <b>{n}</b> <span className="muted">({p})</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted small note">The shaded band is 10–20 hard sets a week per muscle, the range most people grow best on.</p>
    </section>
  );
}

// ---------------------------------------------------------------- tennis
function TennisSheet({ s, onSave, onClose, onOpenWorkout }) {
  const [f, setF] = useState({ kind: '', partner: '', score: '', result: '', note: '', ...(s.note || {}) });
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label={`Tennis on ${s.d}`} onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 className="card-title">Tennis · {dateLabel(s.d)}</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted small">
          {n0(s.min)} min{s.kcal ? ` · ${n0(s.kcal)} cal` : ''}
          {s.hr ? ` · avg ${s.hr} bpm` : ''}
          {s.src === 'apple' ? ' · Apple Watch' : ' · logged by hand'}
        </p>
        <div className="seg" role="group" aria-label="Kind of session">
          {T.TENNIS_KINDS.map(([k, l]) => (
            <button key={k} type="button" className={`seg-btn ${f.kind === k ? 'on' : ''}`} onClick={() => setF({ ...f, kind: f.kind === k ? '' : k })}>
              {l}
            </button>
          ))}
        </div>
        <div className="qa target-form">
          <label className="field">
            <span className="small muted">{f.kind === 'doubles' ? 'Partners / opponents' : f.kind === 'lesson' ? 'Coach' : 'Played with'}</span>
            <input className="input" value={f.partner} onChange={(e) => setF({ ...f, partner: e.target.value })} aria-label="Played with" />
          </label>
          <label className="field">
            <span className="small muted">Score</span>
            <input className="input" placeholder="6-4 3-6 10-8" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} aria-label="Score" />
          </label>
        </div>
        <div className="seg" role="group" aria-label="Result">
          {[
            ['W', 'Won'],
            ['L', 'Lost'],
          ].map(([k, l]) => (
            <button key={k} type="button" className={`seg-btn ${f.result === k ? 'on' : ''}`} onClick={() => setF({ ...f, result: f.result === k ? '' : k })}>
              {l}
            </button>
          ))}
        </div>
        <label className="field wide">
          <span className="small muted">Notes</span>
          <textarea className="input" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="What worked, what to practice" aria-label="Notes" />
        </label>
        <div className="plan-actions">
          <button className="btn primary" onClick={() => onSave(f)}>
            Save
          </button>
          {s.src === 'apple' && onOpenWorkout ? (
            <button className="btn quiet" onClick={() => onOpenWorkout(s.w)}>
              Workout details
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
function TennisCard({ ctx, wx, act, mutateHealth, onOpenWorkout }) {
  const sum = useMemo(() => T.tennisSummary(ctx), [ctx.hk, ctx.years, ctx.health]);
  const [open, setOpen] = useState(null);
  const [f, setF] = useState({ minutes: '', date: todayISO() });
  const w = wx && wx.tennis;
  return (
    <section className="card tennis-card">
      <div className="card-head">
        <h2 className="card-title">Tennis</h2>
        <span className="muted small">{sum.record.w + sum.record.l ? `${sum.record.w}–${sum.record.l} this year` : ''}</span>
      </div>
      {w ? (
        <p className="tn-wx small">
          <b>Good tennis weather {w.label}.</b>
        </p>
      ) : null}
      <Tiles
        items={[
          { value: `${g1(sum.hoursThis)} h`, label: `this month (${g1(sum.hoursLast)} h last month)` },
          { value: n0(sum.countThis), label: `session${sum.countThis === 1 ? '' : 's'} this month` },
        ]}
      />
      {sum.months.some((m) => m.v) ? <BarChart points={sum.months} slots={sum.months.map((m) => m.t)} fmt={(v) => `${g1(v)} h`} label="Hours" height={120} color="green" /> : null}
      {sum.sessions.length ? (
        <ul className="list tn-list">
          {sum.sessions.slice(0, 8).map((s) => (
            <li key={s.id}>
              <button className="rc" onClick={() => setOpen(s)}>
                <span className="grow">
                  <span className="rc-title">
                    {dateLabel(s.d)}
                    {s.note && s.note.result ? <span className={`pill tn-${s.note.result}`}>{s.note.result === 'W' ? 'Won' : 'Lost'}</span> : null}
                  </span>
                  <span className="muted small">
                    {[`${n0(s.min)} min`, s.note && s.note.kind ? (T.TENNIS_KINDS.find((k) => k[0] === s.note.kind) || [])[1] : null, s.note && s.note.partner ? `with ${s.note.partner}` : null, s.note && s.note.score ? s.note.score : null, s.src === 'apple' ? 'Apple Watch' : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Icon name="chev" size={18} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Tennis workouts from your Apple Watch show up here after an import, plus any you log below.</p>
      )}
      {sum.partners.length ? <p className="muted small tight">Most played with: {sum.partners.slice(0, 3).map(([p, n]) => `${p} (${n})`).join(', ')}</p> : null}
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!(Number(f.minutes) > 0)) return;
          act.addWorkout(f.date, { type: 'tennis', minutes: f.minutes });
          setF({ ...f, minutes: '' });
        }}
      >
        <input className="input" type="date" value={f.date} max={todayISO()} onChange={(e) => setF({ ...f, date: e.target.value || todayISO() })} aria-label="Tennis date" />
        <input className="input num min-input" inputMode="numeric" placeholder="Min" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} aria-label="Tennis minutes" />
        <button className="btn" type="submit" disabled={!(Number(f.minutes) > 0)}>
          Log
        </button>
      </form>
      {open ? (
        <TennisSheet
          s={open}
          onClose={() => setOpen(null)}
          onOpenWorkout={(w2) => {
            setOpen(null);
            onOpenWorkout(w2);
          }}
          onSave={(note) => {
            mutateHealth((h) => T.setTennisNote(h, open.id, note), 'Saved');
            setOpen(null);
          }}
        />
      ) : null}
    </section>
  );
}

export function TrainingView({ ctx, wx, act, onOpenWorkout }) {
  const mutateHealth = act.mutateHealth;
  return (
    <div className="grid">
      <div className="col">
        {IS_DEMO ? null : <TennisCard ctx={ctx} wx={wx} act={act} mutateHealth={mutateHealth} onOpenWorkout={onOpenWorkout} />}
        <StrengthCard ctx={ctx} act={act} mutateHealth={mutateHealth} />
      </div>
      <div className="col">
        <LoadCard ctx={ctx} mutateHealth={mutateHealth} />
        <ProgressCard ctx={ctx} />
        <VolumeCard ctx={ctx} />
      </div>
    </div>
  );
}
