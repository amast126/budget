// Health tab additions on the Today view and around it: readiness, fiber/sugar/sodium, habits, the weekly calorie
// check-in, the weight goal, saved meals, the daily sync from an iPhone Shortcut, and Checkups & labs.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { LineChart } from './chart-kit.jsx';
import { dateLabel } from './budget-logic.js';
import { MEALS, totals, todayISO, addDays, targets } from './health-logic.js';
import { fmtMins, clock } from './hk-logic.js';
import * as M from './health-more.js';
import * as S from './health-sync.js';

const n0 = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString());
const g1 = (n) => {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric' });
const longDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const plural = (n, w, many = /(s|sh|ch|x|z)$/.test(w) ? `${w}es` : `${w}s`) => `${n0(n)} ${Math.round(n) === 1 ? w : many}`;
const mealLabel = (m) => (MEALS.find((x) => x[0] === m) || MEALS[3])[1];

// ---------------------------------------------------------------- readiness
export function ReadinessDial({ score, level, size = 64 }) {
  const r = size / 2 - 5;
  const C = 2 * Math.PI * r;
  return (
    <svg className={`rd-dial rd-${level}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Readiness ${score} of 100`}>
      <circle className="rd-track" cx={size / 2} cy={size / 2} r={r} />
      <circle className="rd-arc" cx={size / 2} cy={size / 2} r={r} strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 6} textAnchor="middle" className="rd-num">
        {score}
      </text>
    </svg>
  );
}
export function ReadinessCard({ ctx, iso }) {
  const r = useMemo(() => M.readiness(ctx, iso), [ctx.hkYears, ctx.hk, ctx.years, ctx.health, iso]);
  if (!r) return null;
  const isToday = iso === todayISO();
  return (
    <section className={`card readiness rd-${r.level}`}>
      <div className="card-head">
        <h2 className="card-title">Readiness</h2>
        <span className="muted small">{isToday ? 'This morning' : dateLabel(iso)}</span>
      </div>
      <div className="rd-top">
        <ReadinessDial score={r.score} level={r.level} />
        <div>
          <b className="rd-label">{r.label}</b>
          <div className="muted small">{r.advice}</div>
        </div>
      </div>
      {r.reasons.length ? (
        <ul className="rd-reasons small">
          {r.reasons.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
      <p className="muted small note">Last night’s sleep, HRV and resting heart rate against your own last 30 days, plus yesterday’s training load.</p>
    </section>
  );
}

// ---------------------------------------------------------------- fiber, sugar, sodium, protein by meal
function NBar({ label, value, goal, unit, kind }) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  const over = kind === 'limit' && value > goal;
  const met = kind === 'goal' && value >= goal;
  return (
    <div className="nbar">
      <div className="row-between small">
        <span>{label}</span>
        <span className="num">
          <b>{n0(value)}</b>
          <span className="muted">
            {' '}
            / {n0(goal)}
            {unit} {kind === 'limit' ? 'limit' : kind === 'ref' ? 'ref' : 'goal'}
          </span>
        </span>
      </div>
      <div className="bar slim">
        <div className={`bar-fill ${over ? 'bar-over' : met ? '' : kind === 'ref' && value > goal ? 'bar-ahead' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
export function NutrientsCard({ day, t, years, iso }) {
  if (!day.food.length) return null;
  const x = M.extraTotals(day.food);
  const goals = M.nutrientGoals(t);
  const pm = M.proteinByMeal(day.food);
  const wk = iso === todayISO() ? M.weekNutrients(years, iso) : null;
  const light = ['breakfast', 'lunch', 'dinner'].filter((m) => pm[m] != null && pm[m] < 20);
  return (
    <section className="card nutrients">
      <div className="card-head">
        <h2 className="card-title">Fiber, sugar &amp; sodium</h2>
        <span className="muted small">{x.counted < x.of ? `from ${x.counted} of ${plural(x.of, 'food')}` : ''}</span>
      </div>
      {x.counted ? (
        <>
          <NBar label="Fiber" value={x.fib} goal={goals.fib} unit="g" kind="goal" />
          <NBar label="Sugar (total)" value={x.sug} goal={goals.sug} unit="g" kind="ref" />
          <NBar label="Sodium" value={x.na} goal={goals.na} unit="mg" kind="limit" />
        </>
      ) : (
        <p className="muted small">None of today’s foods listed these. Foods from search and barcodes usually do; quick adds don’t.</p>
      )}
      <h3 className="k-head">Protein by meal</h3>
      <div className="pm-row">
        {MEALS.map(([m, l]) => (
          <div key={m} className={`pm ${pm[m] != null && m !== 'snack' && pm[m] < 20 ? 'pm-low' : ''}`}>
            <b className="num">{pm[m] != null ? `${n0(pm[m])}g` : '—'}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>
      {light.length ? <p className="muted small tight">About 25–40 g at each meal helps build and keep muscle; {light.map(mealLabel).join(' and ').toLowerCase()} ran light.</p> : null}
      {wk ? (
        <p className="muted small tight">
          7-day average: fiber <b className="num">{g1(wk.fib)} g</b> · sugar <b className="num">{g1(wk.sug)} g</b> · sodium <b className="num">{n0(wk.na)} mg</b>
        </p>
      ) : null}
      <p className="muted small note">Fiber goal: 14 g per 1,000 calories. Sodium: under 2,300 mg. Sugar counts natural sugar too (fruit, milk); the reference line is 10% of your calories, the usual limit for added sugar.</p>
    </section>
  );
}

// ---------------------------------------------------------------- habits
export function HabitsCard({ health, years, hkYears, iso, onSet, onStep, mutateHealth }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ name: '', kind: 'check', unit: '', goal: '', limit: false });
  const list = M.habitsOf(health);
  const yd = years && years[iso.slice(0, 4)];
  const mine = (yd && yd.days[iso] && yd.days[iso].hb) || {};
  return (
    <section className="card habits">
      <div className="card-head">
        <h2 className="card-title">Habits</h2>
        <button className="link-btn small" onClick={() => setEdit(!edit)}>
          {edit ? 'Done' : 'Edit'}
        </button>
      </div>
      <ul className="hb-list">
        {list.map((hb) => {
          const v = M.habitValue(years, hkYears, hb, iso);
          const st = M.habitStreak(years, hkYears, hb, iso);
          const done = M.habitDone(years, hkYears, hb, iso);
          const streak = st.current >= 2 ? (
            <span className={`hb-streak ${st.today ? 'on' : ''}`} title={`Best: ${st.best} days`}>
              <Icon name="flame" size={13} />
              {st.current}
            </span>
          ) : null;
          if (edit) {
            return (
              <li key={hb.id} className="hb-row">
                <span className="grow">
                  <b>{hb.name}</b>
                  <span className="muted small block">{hb.kind === 'check' ? 'Checkbox' : `${hb.limit ? 'At most' : 'At least'} ${plural(hb.goal, hb.unit)} a day`}</span>
                </span>
                <button className="x" aria-label={`Remove ${hb.name}`} onClick={() => mutateHealth((h) => M.removeHabit(h, hb.id))}>
                  ×
                </button>
              </li>
            );
          }
          if (hb.kind === 'check') {
            return (
              <li key={hb.id} className="hb-row">
                <button className={`hb-check ${done ? 'on' : ''}`} aria-pressed={done} onClick={() => onSet(hb.id, done ? false : true)}>
                  <span className="box">{done ? <Icon name="check" size={14} /> : null}</span>
                  {hb.name}
                </button>
                {streak}
              </li>
            );
          }
          const n = v || 0;
          return (
            <li key={hb.id} className="hb-row">
              <span className="grow">
                <b>{hb.name}</b>
                <span className={`small block ${hb.limit && n > hb.goal ? 'hb-over' : 'muted'}`}>
                  {hb.limit ? `${plural(n, hb.unit)} · limit ${hb.goal}` : `${n} of ${plural(hb.goal, hb.unit)}`}
                  {mine[hb.id] == null && v != null ? ' · from Apple Health' : ''}
                </span>
              </span>
              {streak}
              <span className="stepper">
                <button className="btn quiet small" aria-label={`One less ${hb.unit} of ${hb.name}`} disabled={!n} onClick={() => onStep(hb.id, -1, n)}>
                  −
                </button>
                <b className="num">{n}</b>
                <button className="btn quiet small" aria-label={`One more ${hb.unit} of ${hb.name}`} onClick={() => onStep(hb.id, 1, n)}>
                  +
                </button>
              </span>
              {!hb.limit ? (
                <span className="hb-meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (n / (hb.goal || 1)) * 100)}%` }} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {edit ? (
        <form
          className="hb-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!f.name.trim()) return;
            mutateHealth((h) => M.addHabit(h, f.name, f.kind, f.unit, f.goal, f.limit));
            setF({ name: '', kind: 'check', unit: '', goal: '', limit: false });
          }}
        >
          <input className="input" placeholder="New habit (e.g. Stretch)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Habit name" />
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Habit type">
            <option value="check">Checkbox</option>
            <option value="count">Count</option>
          </select>
          {f.kind === 'count' ? (
            <>
              <input className="input" placeholder="Unit (e.g. glass)" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label="Unit" />
              <input className="input num" inputMode="numeric" placeholder="Goal" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} aria-label="Daily goal" />
              <label className="check-line small">
                <input type="checkbox" checked={f.limit} onChange={(e) => setF({ ...f, limit: e.target.checked })} /> It’s a limit (stay at or under)
              </label>
            </>
          ) : null}
          <button className="btn" type="submit" disabled={!f.name.trim()}>
            Add habit
          </button>
        </form>
      ) : (
        <p className="muted small note">Water and caffeine logged in Apple Health (through the daily sync) count here too. Limits count as kept on days you check in.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- weekly calorie check-in
export function CheckInCard({ health, years, onAccept, onSkip }) {
  const a = useMemo(() => M.adaptive(health, years), [health, years]);
  if (!a.ready || !a.due) return null;
  const goal = (health.profile && health.profile.goal) || 'maintain';
  const pace = { maintain: 'to hold your weight', lose_slow: 'to lose about ½ lb a week', lose: 'to lose about 1 lb a week', gain: 'to gain slowly' }[goal];
  return (
    <section className="card checkin">
      <div className="card-head">
        <h2 className="card-title">Weekly check-in</h2>
        <span className="muted small">last 4 weeks</span>
      </div>
      <p className="small">
        You ate about <b className="num">{n0(a.intake)}</b> calories a day on the {a.n} days you logged fully, and your weight moved <b className="num">{a.rate > 0 ? '+' : ''}{g1(a.rate)} lb</b> a week. That puts what you really burn near <b className="num">{n0(a.measured)}</b>
        {a.formula ? ` (the formula guessed ${n0(a.formula)})` : ''}.
      </p>
      <div className="ci-target">
        <span className="muted small">Suggested target {pace}</span>
        <b className="num big-ish">{n0(a.suggested)} cal</b>
        {a.current ? <span className="muted small">now {n0(a.current)}</span> : null}
      </div>
      <div className="plan-actions">
        <button className="btn primary" onClick={() => onAccept(a)}>
          Use {n0(a.suggested)}
        </button>
        <button className="btn quiet" onClick={onSkip}>
          Not now
        </button>
      </div>
    </section>
  );
}
export function AdaptiveNote({ health, years, t, onAccept, onOff }) {
  const a = useMemo(() => M.adaptive(health, years), [health, years]);
  if (t.source === 'adaptive') {
    return (
      <p className="small calc">
        Using your check-in target from {shortDate(health.adaptive.at)}: your logging says you burn about <b>{n0(health.adaptive.est)}</b> a day.{' '}
        <button className="link-btn small" onClick={onOff}>
          Go back to the formula
        </button>
      </p>
    );
  }
  if (!a.ready) return <p className="muted small note">Adaptive target: after {a.need.join(' and ')}, a weekly check-in tunes your target to what you really burn.</p>;
  return (
    <p className="small calc">
      From your last 4 weeks of logging and weigh-ins, you burn about <b>{n0(a.measured)}</b> a day.{' '}
      <button className="link-btn small" onClick={() => onAccept(a)}>
        Use {n0(a.suggested)} cal as my target
      </button>
    </p>
  );
}

// ---------------------------------------------------------------- weight goal
export function WeightGoal({ health, onGoal }) {
  const g = useMemo(() => M.weightGoal(health), [health.weights, health.goalWeight, health.profile]);
  const [v, setV] = useState(health.goalWeight ? String(health.goalWeight) : '');
  const t = g.t;
  const planned = M.GOAL_RATE[(health.profile && health.profile.goal) || 'maintain'];
  return (
    <div className="w-goal">
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          onGoal(Number(v) || null);
        }}
      >
        <label className="grow wg-label small muted" htmlFor="goal-weight">
          Goal weight
        </label>
        <input id="goal-weight" className="input num wg-input" inputMode="decimal" placeholder="lb" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => Number(v || 0) !== Number(health.goalWeight || 0) && onGoal(Number(v) || null)} aria-label="Goal weight in pounds" />
        <button className="btn quiet small" type="submit">
          Save
        </button>
      </form>
      {t ? (
        <ul className="wg-lines small">
          {t.rate != null ? (
            <li>
              Trend <b className="num">{g1(t.trend)} lb</b>, {Math.abs(t.rate) < 0.05 ? 'holding steady' : <>{t.rate > 0 ? 'up' : 'down'} <b className="num">{g1(Math.abs(t.rate))} lb</b> a week</>} over the last 4 weeks.
            </li>
          ) : (
            <li className="muted">Weigh in 4+ times over two weeks for a rate and a projection.</li>
          )}
          {g.goal && g.reached ? <li>You’re at your goal. Nice work.</li> : null}
          {g.goal && !g.reached && g.eta ? (
            <li>
              At this rate you’d reach <b className="num">{g1(g.goal)} lb</b> around <b>{longDate(g.eta)}</b>.
            </li>
          ) : null}
          {g.goal && !g.reached && !g.eta && t.rate != null ? <li className="muted">At this rate you’re not heading toward {g1(g.goal)} lb yet.</li> : null}
          {g.goal && !g.reached && g.plannedEta ? (
            <li className="muted">
              At your plan’s {g1(Math.abs(planned))} lb a week: {longDate(g.plannedEta)}.
            </li>
          ) : null}
          {g.note ? <li className="muted">{g.note}</li> : null}
        </ul>
      ) : null}
      {g.warn ? <p className="alert small">{g.warn}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- saved meals and meal prep, in the Add food sheet
export function MealsTab({ health, plan, meal, onPickFood, onLogMeal, onRemoveMeal }) {
  const saved = (health.meals || []).slice().sort((a, b) => (a.meal === meal ? -1 : 0) - (b.meal === meal ? -1 : 0));
  const prep = (plan || []).filter((r) => r.nutrition);
  return (
    <div className="meals-tab">
      <h3 className="k-head">Saved meals</h3>
      {saved.length ? (
        <ul className="list rc-list">
          {saved.map((m) => {
            const t = M.mealTotals(m);
            return (
              <li key={m.id} className="sm-row">
                <button className="rc" onClick={() => onLogMeal(m)}>
                  <span className="grow">
                    <span className="rc-title">{m.name}</span>
                    <span className="muted small">
                      {plural(m.items.length, 'item')} · {n0(t.k)} cal · P {n0(t.p)}g
                    </span>
                  </span>
                  <span className="btn small">Add</span>
                </button>
                <button className="x" aria-label={`Delete ${m.name}`} onClick={() => onRemoveMeal(m.id)}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">Save a meal you eat often from the food log (“Save as a meal” under any meal), then add it here in one tap.</p>
      )}
      <h3 className="k-head">This week’s meal prep</h3>
      {prep.length ? (
        <ul className="list rc-list">
          {prep.map((r) => (
            <li key={r.id}>
              <button className="rc" onClick={() => onPickFood(M.recipeFood(r))}>
                <span className="grow">
                  <span className="rc-title">{r.title}</span>
                  <span className="muted small">
                    1 serving · {n0(r.nutrition[0])} cal · P {n0(r.nutrition[1])}g
                  </span>
                </span>
                <Icon name="chev" size={18} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">
          Recipes in your meal prep plan (Cooking → Meal prep) show up here as servings to log. <a href="#/cooking?prep">Plan the week →</a>
        </p>
      )}
    </div>
  );
}
export function SaveMealForm({ meal, onSave, onCancel }) {
  const [name, setName] = useState(`My ${mealLabel(meal).toLowerCase().replace(/s$/, '')}`);
  return (
    <form
      className="add-row save-meal"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
    >
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Meal name" autoFocus />
      <button className="btn small" type="submit" disabled={!name.trim()}>
        Save
      </button>
      <button className="btn quiet small" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- daily sync from the iPhone
const SITE = () => `${location.origin}${location.pathname}`;
// Only an iPhone or iPad can run the Shortcut.
export const canRunShortcuts = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const syncedText = (at) => new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
// "Sync now": opens the Shortcuts app, which reads Health and opens the sync link back here.
export function SyncNow({ health, small }) {
  const sync = (health && health.sync) || {};
  if (!sync.v2At || !canRunShortcuts()) return null;
  return (
    <a className={`btn ${small ? 'quiet small' : 'small'} sync-now`} href={S.runShortcutUrl()} title={`Runs the ${S.SHORTCUT_NAME} shortcut`}>
      <Icon name="sync" size={small ? 15 : 16} /> {small ? 'Sync' : 'Sync now'}
    </a>
  );
}
function CopyButton({ text, label, quiet }) {
  const [done, setDone] = useState(null); // null | 'ok' | 'no'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone('ok');
    } catch {
      setDone('no');
    }
    setTimeout(() => setDone(null), 2500);
  };
  return (
    <button className={`btn small${quiet ? ' quiet' : ''}`} onClick={copy}>
      {done === 'ok' ? 'Copied' : done === 'no' ? 'Couldn’t copy: press and hold the text' : label}
    </button>
  );
}
// The Find Health Samples actions: [Type, Group By]
export const FINDS = [
  ['Steps', 'Day'],
  ['Active Energy', 'Day'],
  ['Exercise Minutes', 'Day'],
  ['Heart Rate', 'None'],
  ['Resting Heart Rate', 'None'],
  ['Heart Rate Variability', 'None'],
  ['Sleep Analysis', 'None'],
  ['Workouts', 'None'],
];
export const FINDS_EXTRA = [
  ['Resting Energy', 'Day'],
  ['Walking + Running Distance', 'Day'],
  ['Flights Climbed', 'Day'],
  ['Weight', 'None'],
];
function ShortcutGuide({ sync }) {
  const start = S.linkStart(SITE(), sync.key);
  const template = S.templateText();
  const extras = S.templateText(S.TEXT_EXTRAS);
  return (
    <ol className="sync-steps small">
      <li>
        <b>Make the shortcut.</b> In the Shortcuts app, tap <b>+</b> and name it <b>{S.SHORTCUT_NAME}</b>, spelled exactly like that so the Sync now button can find it.
      </li>
      <li>
        <b>Add the first search.</b> Add <b>Find Health Samples</b>. Set Type to <b>Steps</b>, add the filter <b>Start Date is in the last 3 days</b>, and set <b>Group By</b> to <b>Day</b>.
      </li>
      <li>
        <b>Duplicate it for the rest.</b> Press and hold the action, tap <b>Duplicate</b>, and change the Type (and Group By) to each of these, in any order:
        <table className="sync-finds">
          <thead>
            <tr>
              <th>Type</th>
              <th>Group By</th>
            </tr>
          </thead>
          <tbody>
            {FINDS.slice(1).map(([t, g]) => (
              <tr key={t}>
                <td>{t}</td>
                <td>{g}</td>
              </tr>
            ))}
            {FINDS_EXTRA.map(([t, g]) => (
              <tr key={t} className="muted">
                <td>{t} (optional)</td>
                <td>{g}</td>
              </tr>
            ))}
          </tbody>
        </table>
        Group By None means no grouping: those send every reading, so the dashboard can work out each day’s lowest and highest heart rate and each workout’s average.
      </li>
      <li>
        <b>Add a Text action</b> and paste this in:
        <pre className="sync-template">{template}</pre>
        <div className="plan-actions">
          <CopyButton text={template} label="Copy text" />
          <CopyButton text={extras} label="Copy optional lines" quiet />
        </div>
        Then swap each <b>[bracketed]</b> line for its variable:
        <ul className="sync-sub">
          <li>
            Delete the placeholder, tap <b>Select Variable</b> above the keyboard, and tap the result under the matching Find action. Current Date is in the Select Variable list.
          </li>
          <li>
            Tap the bubble you just added and pick the part after the <b>›</b> (Value, Start Date, End Date, Source). For workouts pick <b>Workout Type</b> (it may be called Workout Activity Type or Name, not plain Type), and for calories <b>Active Energy</b>.
          </li>
          <li>
            Keep <b>#end</b> as the last line. If you added the optional searches, paste the optional lines just above <b>#hr</b> and fill them in the same way.
          </li>
          <li className="muted">Optional: set each date bubble’s Date Format to ISO 8601 with Include ISO 8601 Time on. The default format works too; ISO makes the link a little shorter.</li>
        </ul>
      </li>
      <li>
        <b>Add URL Encode.</b> It picks up the Text on its own.
      </li>
      <li>
        <b>Add a second Text</b> with your link start, then insert <b>URL Encoded Text</b> right after <code>d=</code> with no space:
        <code className="sync-link">{start}</code>
        <div className="plan-actions">
          <CopyButton text={start} label="Copy link start" />
        </div>
      </li>
      <li>
        <b>Add Open URLs</b> and run the shortcut once. Allow Health access for everything it asks about. The first time, this page shows what it found and asks before saving, so you can check the numbers.
      </li>
      <li>
        <b>Run it every morning.</b> On the Automation tab, tap <b>+</b>, choose <b>Time of Day</b>, pick a time you’re usually on your phone, Daily, and <b>Run Immediately</b>. Then choose <b>{S.SHORTCUT_NAME}</b>. An iPhone only lets Shortcuts read Health while it’s unlocked, so if a run happens while it’s locked, the next run fills in the missed day: every run sends the last 3 days.
      </li>
    </ol>
  );
}
export function SyncCard({ health, hk, mutateHealth }) {
  const [open, setOpen] = useState(false);
  const sync = health.sync || {};
  const last = sync.lastAt ? syncedText(sync.lastAt) : null;
  return (
    <section className="card sync-card">
      <button className="step-head card-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="grow">
          <span className="card-title">Daily sync from iPhone</span>
          <span className="muted small block">
            {last ? `Last synced ${last}` : 'A Shortcut that sends Apple Health here every morning'}
            {sync.problems && sync.problems.length ? ' · needs a look' : ''}
          </span>
        </span>
        <Icon name={open ? 'down' : 'chev'} size={18} />
      </button>
      {open ? (
        <div className="sync-body">
          <p className="small">
            An iPhone Shortcut reads Apple Health and opens a link that saves it here: steps, calories and exercise, heart rate through the day (average, lowest, highest), resting heart rate and HRV, each night’s sleep with its stages, and workouts with calories and average heart rate. It runs on its own every morning, and <b>Sync now</b> runs it whenever you want today’s numbers so far (the button is at the top of the Health tab on your iPhone once the Shortcut has synced). Each run sends the last 3 days, so a missed morning fills itself in.
          </p>
          {sync.problems && sync.problems.length ? (
            <div className="alert small sync-problems">
              <b>The last sync had trouble with part of the Shortcut:</b>
              <ul>
                {sync.problems.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {sync.key ? (
            <>
              <h3 className="k-head">Set up the Shortcut (about 15 minutes)</h3>
              <ShortcutGuide sync={sync} />
              <p className="muted small note">Your link start carries a private key (k=…). A link without it asks before saving, so nobody can slip numbers into your log by sending you a link. Safari needs to be signed in to the dashboard once.</p>
              <div className="plan-actions">
                <button className="btn quiet small" onClick={() => mutateHealth((h) => (h.sync = { ...(h.sync || {}), key: M.newSyncKey() }))}>
                  New key
                </button>
                <span className="muted small">A new key means pasting the new link start into the Shortcut.</span>
              </div>
              {sync.count ? <p className="muted small">{plural(sync.count, 'sync')} so far{sync.lastDate ? `, the latest through ${shortDate(sync.lastDate)}` : ''}.</p> : null}
            </>
          ) : (
            <button className="btn primary" onClick={() => mutateHealth((h) => (h.sync = { ...(h.sync || {}), key: M.newSyncKey() }))}>
              Make my link
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
const dayName = (iso) => {
  const t = todayISO();
  if (iso === t) return 'Today (so far)';
  if (iso === addDays(t, -1)) return 'Yesterday';
  return new Date(`${iso}T12:00:00`).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
// Each day the link had, newest first.
function SyncDays({ parsed }) {
  const rows = S.syncDays(parsed);
  if (!rows.length) return null;
  return (
    <ul className="sync-days">
      {rows.map((r) => (
        <li key={r.iso}>
          <b>{dayName(r.iso)}</b>
          {r.lines.map((l, i) => (
            <span key={i} className="small block">
              {l}
            </span>
          ))}
          {r.workouts.map((w, i) => (
            <span key={`w${i}`} className="small block sync-workout">
              {w}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}
function SyncProblems({ parsed, quiet }) {
  const p = parsed.problems || [];
  const skipped = parsed.skipped || [];
  return (
    <>
      {p.length ? (
        <div className={quiet ? 'muted small sync-problems' : 'alert small sync-problems'}>
          <b>Check the Shortcut:</b>
          <ul>
            {p.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {skipped.length ? <p className="muted small">Skipped (didn’t look right): {skipped.join(', ')}.</p> : null}
      {parsed.v === 2 && parsed.found && parsed.found.length ? (
        <details className="sync-found small">
          <summary>What the link had</summary>
          <ul>
            {parsed.found.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
// The page the Shortcut opens: save, say what was saved, then offer the Health tab.
export function HealthSyncPage({ health, hk, hkYears, years, act }) {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => /^#\/health-sync/.test(location.hash) && setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const parsed = useMemo(() => M.parseSync(hash), [hash]);
  const [state, setState] = useState('wait'); // wait | confirm | saving | done | dup | empty | error
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  const started = useRef(null);
  const ready = !!(health && hk);
  const v2 = parsed.v === 2;
  // Once a v2 link is in, take its numbers out of the address, so the tab and history don't keep them; a reload
  // then just says it's saved.
  const forget = () => {
    if (v2 && /[?&]d=/.test(location.hash)) history.replaceState(history.state, '', '#/health-sync?saved=1');
  };
  const save = async () => {
    setState('saving');
    try {
      await act.applySync(parsed);
      forget();
      setState('done');
    } catch (e) {
      setErr(e.message || String(e));
      setState('error');
    }
  };
  useEffect(() => {
    if (!ready || started.current === hash) return;
    started.current = hash;
    setWhy('');
    if (/[?&]saved=1/.test(hash)) return setState('dup');
    if (!parsed.count) return setState('empty');
    if (parsed.dry) return setState('confirm');
    // Opened again (a reload, or Back from Health): it's already in.
    if (health.sync && health.sync.lastLink && health.sync.lastLink === parsed.link) {
      forget();
      return setState('dup');
    }
    const key = health.sync && health.sync.key;
    if (!key || key !== parsed.key) {
      setWhy('key');
      return setState('confirm');
    }
    // The first link from the new Shortcut: show what it found before anything is saved.
    if (v2 && !health.sync.v2At) {
      setWhy('first');
      return setState('confirm');
    }
    // An old link opened days later would put "last night" on the wrong night.
    if (!v2 && !parsed.onGiven && parsed.date < addDays(todayISO(), -2)) {
      setWhy('old');
      return setState('confirm');
    }
    save();
  }, [ready, hash]);
  const bits = M.syncSummary(parsed);
  const r = state === 'done' && hkYears ? M.readiness({ health, hk, hkYears, years }, todayISO()) : null;
  const title = parsed.dry ? 'Preview' : why === 'first' ? 'First sync: check these numbers' : 'Save these numbers?';
  return (
    <div className="home health">
      <header className="page-head">
        <h1 className="page-title">Health sync</h1>
      </header>
      <section className="card sync-page">
        {state === 'wait' || state === 'saving' ? <p className="empty">{state === 'wait' ? 'Loading…' : 'Saving…'}</p> : null}
        {state === 'empty' ? (
          <>
            <p className="empty">This link didn’t have any numbers in it.</p>
            {v2 ? <SyncProblems parsed={parsed} /> : null}
            <p className="muted small">{v2 ? 'Check the Text action in the Shortcut: each #section line, with its variables on the lines under it.' : 'Check that the Shortcut puts each value after its name, like steps=8123&sleep=7:12. Values that come out blank are skipped.'}</p>
          </>
        ) : null}
        {state === 'confirm' ? (
          <>
            <h2 className="card-title">{title}</h2>
            <p className="small">{bits.join(' · ')}</p>
            {v2 ? <SyncDays parsed={parsed} /> : <p className="muted small">Activity for {longDate(parsed.date)}; sleep and morning readings for {longDate(parsed.on)}.</p>}
            {why === 'key' ? <p className="alert small">This link doesn’t carry your sync key, so it may not be from your Shortcut. Only save it if you made it.</p> : null}
            {why === 'old' ? <p className="alert small">This link is from {longDate(parsed.date)}. Saving it now would put its sleep and morning readings on today.</p> : null}
            {why === 'first' ? <p className="small">If these look like your numbers, save them. From now on, links from your Shortcut save right away.</p> : null}
            {parsed.dry ? <p className="muted small">Nothing was saved. Take dry=1& out of the link in the Shortcut to save for real.</p> : null}
            {v2 ? <SyncProblems parsed={parsed} /> : null}
            <div className="plan-actions">
              {!parsed.dry ? (
                <button className="btn primary" onClick={save}>
                  Save
                </button>
              ) : null}
              <a
                className="btn quiet"
                href="#/health"
                onClick={(e) => {
                  if (!v2) return;
                  e.preventDefault();
                  location.replace('#/health');
                }}
              >
                {parsed.dry ? 'Close' : 'Don’t save'}
              </a>
            </div>
          </>
        ) : null}
        {state === 'done' ? (
          <>
            <h2 className="card-title">Saved to Health</h2>
            <p className="small">{bits.join(' · ')}</p>
            {v2 ? <SyncDays parsed={parsed} /> : null}
            {v2 ? <SyncProblems parsed={parsed} quiet /> : parsed.skipped.length ? <p className="muted small">Skipped (didn’t look right): {parsed.skipped.join(', ')}.</p> : null}
            {r ? (
              <div className="rd-top">
                <ReadinessDial score={r.score} level={r.level} size={52} />
                <div>
                  <b className="rd-label">{r.label}</b>
                  <div className="muted small">{r.reasons[0] || r.advice}</div>
                </div>
              </div>
            ) : null}
            <div className="plan-actions">
              <a className="btn primary" href="#/health">
                Open Health
              </a>
            </div>
            <p className="muted small note">You can close this tab.</p>
          </>
        ) : null}
        {state === 'dup' ? (
          <>
            <h2 className="card-title">Already saved</h2>
            <p className="small">{bits.join(' · ')}</p>
            <div className="plan-actions">
              <a className="btn primary" href="#/health">
                Open Health
              </a>
            </div>
          </>
        ) : null}
        {state === 'error' ? <p className="alert small">Couldn’t save: {err}</p> : null}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- checkups and labs
const STATE_TEXT = { overdue: 'Overdue', soon: 'Due soon', booked: 'Booked', ok: 'Up to date', unknown: 'Not set' };
function CheckupRow({ c, onSave, onDone, onRemove }) {
  const st = M.checkupStatus(c);
  const last = M.lastVisit(c);
  const [open, setOpen] = useState(false);
  return (
    <li className={`cu-row cu-${st.state}`}>
      <button className="rc" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="grow">
          <span className="rc-title">{c.name}</span>
          <span className="muted small">
            {last ? `Last ${longDate(last)}` : 'No visit recorded'} · every {c.every >= 12 && c.every % 12 === 0 ? plural(c.every / 12, 'year') : plural(c.every, 'month')}
            {st.date && st.state !== 'booked' ? ` · due ${longDate(st.date)}` : ''}
            {st.state === 'booked' ? ` · booked ${longDate(st.date)}` : ''}
          </span>
        </span>
        <span className={`pill cu-pill cu-${st.state}`}>{STATE_TEXT[st.state]}</span>
      </button>
      {open ? (
        <div className="cu-edit">
          <label className="field">
            <span className="small muted">Last visit</span>
            <input className="input" type="date" defaultValue={last || ''} onChange={(e) => e.target.value && onSave({ last: e.target.value })} aria-label={`${c.name} last visit`} />
          </label>
          <label className="field">
            <span className="small muted">Booked for</span>
            <input className="input" type="date" defaultValue={c.booked || ''} onChange={(e) => onSave({ booked: e.target.value || null })} aria-label={`${c.name} appointment`} />
          </label>
          <label className="field">
            <span className="small muted">How often</span>
            <select className="input" value={c.every} onChange={(e) => onSave({ every: Number(e.target.value) })} aria-label={`${c.name} how often`}>
              {[3, 6, 12, 24, 36, 60, 120].map((m) => (
                <option key={m} value={m}>
                  Every {m >= 12 ? plural(m / 12, 'year') : plural(m, 'month')}
                </option>
              ))}
            </select>
          </label>
          <div className="plan-actions">
            <button className="btn small" onClick={onDone}>
              Went today
            </button>
            <button className="btn quiet small danger-text" onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
function LabChart({ list, t }) {
  const pts = list.map((x) => ({ t: x.date, v: x.value }));
  if (pts.length < 2) return null;
  const ref = t.hi != null ? { v: t.hi, label: `${t.hi} ${t.unit}` } : t.lo != null ? { v: t.lo, label: `${t.lo} ${t.unit}` } : null;
  return <LineChart points={pts} fmt={(v) => `${g1(v)} ${t.unit}`} label={t.name} color="blue" height={140} refLine={ref} gap={4000} dots />;
}
export function CheckupsView({ health, mutateHealth }) {
  const list = M.checkupsOf(health);
  const [nc, setNc] = useState({ name: '', every: 12 });
  const tests = M.labTests(health);
  const [lab, setLab] = useState({ test: tests[0].id, date: todayISO(), value: '' });
  const [custom, setCustom] = useState(null);
  const [openTest, setOpenTest] = useState(null);
  const summary = M.labSummary(health);
  const cur = tests.find((t) => t.id === lab.test);
  return (
    <div className="grid">
      <div className="col">
        <section className="card checkups">
          <div className="card-head">
            <h2 className="card-title">Checkups</h2>
            <span className="muted small">Due ones show on Home</span>
          </div>
          <ul className="list">
            {list.map((c) => (
              <CheckupRow
                key={c.id}
                c={c}
                onSave={(patch) => mutateHealth((h) => M.updateCheckup(h, c.id, patch))}
                onDone={() => mutateHealth((h) => M.doneCheckup(h, c.id), `${c.name} marked done today`)}
                onRemove={() => mutateHealth((h) => M.removeCheckup(h, c.id))}
              />
            ))}
          </ul>
          <form
            className="add-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!nc.name.trim()) return;
              mutateHealth((h) => M.updateCheckup(h, null, { name: nc.name.trim(), every: Number(nc.every) || 12 }));
              setNc({ name: '', every: 12 });
            }}
          >
            <input className="input" placeholder="Add a checkup (e.g. Dermatologist)" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} aria-label="New checkup" />
            <select className="input cu-every" value={nc.every} onChange={(e) => setNc({ ...nc, every: e.target.value })} aria-label="How often">
              {[6, 12, 24, 36].map((m) => (
                <option key={m} value={m}>
                  {m >= 12 ? `${m / 12} yr` : `${m} mo`}
                </option>
              ))}
            </select>
            <button className="btn" type="submit" disabled={!nc.name.trim()}>
              Add
            </button>
          </form>
        </section>
      </div>
      <div className="col">
        <section className="card labs">
          <div className="card-head">
            <h2 className="card-title">Lab results</h2>
          </div>
          {summary.length ? (
            <ul className="list lab-list">
              {summary.map(({ t, list: l, last, prev, flag }) => (
                <li key={t.id}>
                  <button className="rc" onClick={() => setOpenTest(openTest === t.id ? null : t.id)} aria-expanded={openTest === t.id}>
                    <span className="grow">
                      <span className="rc-title">{t.name}</span>
                      <span className="muted small">
                        {longDate(last.date)}
                        {prev ? ` · was ${g1(prev.value)} on ${longDate(prev.date)}` : ''}
                        {t.note ? ` · ${t.note}` : ''}
                      </span>
                    </span>
                    <span className="lab-val">
                      <span>
                        <b className="num">{g1(last.value)}</b> <span className="muted small">{t.unit}</span>
                      </span>
                      <span className={`pill lab-${flag}`}>{flag === 'ok' ? 'In range' : flag === 'high' ? 'High' : 'Low'}</span>
                    </span>
                  </button>
                  {openTest === t.id ? (
                    <div className="lab-more">
                      <LabChart list={l} t={t} />
                      <ul className="log-list small">
                        {[...l].reverse().map((x) => (
                          <li key={x.id}>
                            <span className="muted">{longDate(x.date)}</span> · <span className="num">{g1(x.value)} {t.unit}</span>
                            <button className="x" aria-label={`Delete ${t.name} from ${x.date}`} onClick={() => mutateHealth((h) => M.removeLab(h, x.id))}>
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Add results from your bloodwork to see them against normal ranges and track them over time.</p>
          )}
          <h3 className="k-head">Add a result</h3>
          <form
            className="lab-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!Number.isFinite(Number(lab.value)) || lab.value === '') return;
              mutateHealth((h) => M.addLab(h, lab.test, lab.date, lab.value), `${cur ? cur.name : 'Result'} saved`);
              setLab({ ...lab, value: '' });
            }}
          >
            <select
              className="input"
              value={lab.test}
              onChange={(e) => {
                if (e.target.value === '__new') return setCustom({ name: '', unit: '', lo: '', hi: '' });
                setLab({ ...lab, test: e.target.value });
              }}
              aria-label="Test"
            >
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="__new">Another test…</option>
            </select>
            <input className="input" type="date" value={lab.date} onChange={(e) => setLab({ ...lab, date: e.target.value })} aria-label="Test date" />
            <input className="input num" inputMode="decimal" placeholder={cur ? cur.unit : 'Value'} value={lab.value} onChange={(e) => setLab({ ...lab, value: e.target.value })} aria-label="Result value" />
            <button className="btn" type="submit" disabled={lab.value === ''}>
              Add
            </button>
          </form>
          {custom ? (
            <form
              className="lab-form lab-custom"
              onSubmit={(e) => {
                e.preventDefault();
                let id = null;
                mutateHealth((h) => {
                  const t = M.addLabTest(h, custom.name, custom.unit, custom.lo, custom.hi);
                  id = t && t.id;
                }).then(() => id && setLab((l) => ({ ...l, test: id })));
                setCustom(null);
              }}
            >
              <input className="input" placeholder="Test name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} aria-label="New test name" autoFocus />
              <input className="input" placeholder="Unit" value={custom.unit} onChange={(e) => setCustom({ ...custom, unit: e.target.value })} aria-label="New test unit" />
              <input className="input num" placeholder="Low" value={custom.lo} onChange={(e) => setCustom({ ...custom, lo: e.target.value })} aria-label="Normal low" />
              <input className="input num" placeholder="High" value={custom.hi} onChange={(e) => setCustom({ ...custom, hi: e.target.value })} aria-label="Normal high" />
              <button className="btn" type="submit" disabled={!custom.name.trim()}>
                Add test
              </button>
            </form>
          ) : null}
          <p className="muted small note">Ranges are typical adult reference ranges. Your lab’s report and your doctor have the final word.</p>
        </section>
      </div>
    </div>
  );
}
export { clock, fmtMins, totals, targets, addDays };
