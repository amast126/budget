// Sourdough corner, on the Cooking tab: the starter (feed it, see when it peaks), a bake planner that works back
// from when you want bread, a dough calculator, and a log of bakes.
import React, { useEffect, useMemo, useState } from 'react';
import { celebrate, centerOf } from './fx.jsx';
import { useNow } from './pulse.jsx';
import { dateLabel, todayISO } from './budget-logic.js';
import * as S from './sourdough-logic.js';

const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const clock = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
function whenText(d, now = new Date()) {
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  const w = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${w} ${clock(d)}`;
}
function ago(ms) {
  const h = ms / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 36) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
const TEMPS = [64, 66, 68, 70, 72, 74, 76, 78, 80, 82];

// ---------------------------------------------------------------- starter
function StarterCard({ data, mutate }) {
  const now = useNow(60000);
  const s = data.starter;
  const st = S.starterState(data, now);
  const [name, setName] = useState(s.name);
  const [earlier, setEarlier] = useState(null);
  useEffect(() => setName(s.name), [s.name]);
  const feeds = [...s.feeds].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 5);
  const fed = (at, e) => {
    if (e) celebrate({ ...centerOf(e.currentTarget), count: 12 });
    mutate((d) => S.feed(d, at), `Fed ${s.name || 'the starter'} ${s.ratio}`);
  };
  return (
    <section className="card starter">
      <div className="card-head">
        <h2 className="card-title">{s.name || 'Starter'}</h2>
        <div className="seg mini-seg" role="group" aria-label="Where the starter lives">
          {[
            ['counter', 'Counter'],
            ['fridge', 'Fridge'],
          ].map(([k, l]) => (
            <button key={k} className={`seg-btn ${s.where === k ? 'on' : ''}`} onClick={() => s.where !== k && mutate((d) => (d.starter.where = k))}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className={`starter-state st-${st.state}`}>
        <div className="starter-jar" aria-hidden="true">
          <span style={{ height: `${st.state === 'none' ? 10 : st.state === 'resting' ? 30 : Math.round(30 + Math.min(1, st.frac || 0) * 60 - Math.max(0, (st.frac || 0) - 1.2) * 60)}%` }} />
        </div>
        <div className="grow">
          <div className="starter-text">{st.text}</div>
          {st.state === 'none' ? null : (
            <div className="muted small">
              Fed {ago(st.since * 3600000)}
              {st.from && st.state !== 'hungry' ? ` · peak around ${clock(st.from)}–${clock(st.to)}` : ''}
              {st.nextFeed ? ` · next feed by ${whenText(st.nextFeed, now)}` : ''}
            </div>
          )}
        </div>
      </div>
      {st.from && st.state !== 'hungry' ? (
        <div className="rise-bar" aria-hidden="true">
          <span className="rise-window" style={{ left: `${(0.8 / 1.5) * 100}%`, width: `${(0.4 / 1.5) * 100}%` }} />
          <span className="rise-now" style={{ left: `${Math.min(100, ((st.frac || 0) / 1.5) * 100)}%` }} />
        </div>
      ) : null}
      <div className="starter-acts">
        <button className="btn primary" onClick={(e) => fed(new Date(), e)}>
          Fed it now
        </button>
        {earlier == null ? (
          <button className="btn quiet small" onClick={() => setEarlier(localInput(new Date(Date.now() - 3600000)))}>
            Fed earlier…
          </button>
        ) : (
          <form
            className="fed-earlier"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new Date(earlier);
              if (!isNaN(d) && d <= new Date()) fed(d);
              setEarlier(null);
            }}
          >
            <input className="input" type="datetime-local" value={earlier} onChange={(e) => setEarlier(e.target.value)} aria-label="When you fed it" />
            <button className="btn small" type="submit">
              Log
            </button>
          </form>
        )}
      </div>
      <div className="starter-opts small">
        <label>
          Feed ratio{' '}
          <select className="inline-select" value={s.ratio} onChange={(e) => mutate((d) => (d.starter.ratio = e.target.value))} aria-label="Feeding ratio (starter:flour:water)">
            {S.RATIOS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Kitchen{' '}
          <select className="inline-select" value={s.temp} onChange={(e) => mutate((d) => (d.starter.temp = Number(e.target.value)))} aria-label="Kitchen temperature">
            {TEMPS.map((t) => (
              <option key={t} value={t}>
                {t}°F
              </option>
            ))}
          </select>
        </label>
        <input
          className="input small-input"
          placeholder="Name your starter"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== s.name && mutate((d) => (d.starter.name = name.trim()))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Starter name"
        />
      </div>
      {feeds.length ? (
        <ul className="log-list small">
          {feeds.map((f) => (
            <li key={f.id}>
              <span className="muted">{whenText(new Date(f.at), now)}</span> · {f.ratio}
              {f.where === 'fridge' ? ' · fridge' : ''}
              <button className="x" aria-label="Remove this feeding" onClick={() => mutate((d) => S.removeFeed(d, f.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="muted small note">Peak times are estimates from the ratio and kitchen temperature. The real sign: doubled, domed, and bubbly all the way through.</p>
    </section>
  );
}

// ---------------------------------------------------------------- planner
function suggestReady(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 10, 0);
  return localInput(d);
}
function PlannerCard({ data, mutate }) {
  const now = useNow(60000);
  const p = data.plan;
  const ready = p.ready && new Date(p.ready) > now ? p.ready : suggestReady(now);
  const plan = useMemo(() => S.bakePlan({ ready, temp: p.temp, retard: p.retard }), [ready, p.temp, p.retard]);
  const nextId = plan ? (plan.steps.find((s) => s.at > now) || {}).id : null;
  return (
    <section className="card planner">
      <div className="card-head">
        <h2 className="card-title">Bake planner</h2>
        <span className="muted small">{plan ? `${Math.round(plan.hours)} hours start to finish` : ''}</span>
      </div>
      <div className="planner-form">
        <label className="field">
          <span className="small muted">Bread out of the oven</span>
          <input className="input" type="datetime-local" value={ready} onChange={(e) => e.target.value && mutate((d) => (d.plan.ready = e.target.value))} aria-label="When you want the bread done" />
        </label>
        <label className="field">
          <span className="small muted">Kitchen</span>
          <select className="input" value={p.temp} onChange={(e) => mutate((d) => (d.plan.temp = Number(e.target.value)))} aria-label="Kitchen temperature for the bake">
            {TEMPS.map((t) => (
              <option key={t} value={t}>
                {t}°F
              </option>
            ))}
          </select>
        </label>
        <label className="check-line small">
          <input type="checkbox" checked={!!p.retard} onChange={(e) => mutate((d) => (d.plan.retard = e.target.checked))} /> Cold proof overnight in the fridge
        </label>
      </div>
      {plan ? (
        <>
          {plan.start < now ? <p className="alert small">That’s too soon for this schedule: the levain would have needed feeding {whenText(plan.start, now)}. Pick a later time.</p> : null}
          {plan.note && plan.start >= now ? <p className="muted small note">{plan.note}</p> : null}
          <ol className="timeline">
            {plan.steps.map((s) => (
              <li key={s.id} className={`tl ${s.at < now ? 'past' : ''} ${s.id === nextId ? 'next' : ''}`}>
                <div className="tl-when">{whenText(s.at, now)}</div>
                <div className="tl-title">{s.title}</div>
                <div className="tl-body small muted">{s.body}</div>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- calculator
function CalcCard({ data, mutate }) {
  const [c, setC] = useState(data.calc);
  useEffect(() => setC(data.calc), [JSON.stringify(data.calc)]);
  const r = S.doughFor(c);
  const save = (next) => mutate((d) => (d.calc = { ...d.calc, ...next }));
  const num = (k, label, unit, step = 1) => (
    <label className="calc-in">
      <span className="small muted">{label}</span>
      <span className="calc-box">
        <input
          className="input num"
          inputMode="decimal"
          value={c[k]}
          onChange={(e) => setC({ ...c, [k]: e.target.value.replace(/[^\d.]/g, '') })}
          onBlur={() => String(c[k]) !== String(data.calc[k]) && save({ [k]: Number(c[k]) || 0 })}
          aria-label={label}
          step={step}
        />
        <span className="muted small">{unit}</span>
      </span>
    </label>
  );
  return (
    <section className="card dough-calc">
      <div className="card-head">
        <h2 className="card-title">Dough calculator</h2>
        <span className="muted small">Baker’s percentages</span>
      </div>
      <div className="calc-grid">
        <label className="calc-in">
          <span className="small muted">Loaves</span>
          <select className="input" value={c.loaves} onChange={(e) => {
            const v = Number(e.target.value);
            setC({ ...c, loaves: v });
            save({ loaves: v });
          }} aria-label="Loaves">
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        {num('flour', 'Flour per loaf', 'g')}
        {num('hydration', 'Water', '%')}
        {num('levain', 'Levain', '%')}
        {num('salt', 'Salt', '%', 0.1)}
      </div>
      <label className="check-line small">
        <input type="checkbox" checked={!!c.adjust} onChange={(e) => {
          setC({ ...c, adjust: e.target.checked });
          save({ adjust: e.target.checked });
        }} /> Count the starter’s own flour and water (100% hydration)
      </label>
      <table className="calc-out">
        <tbody>
          {[
            ['Flour', r.flour],
            ['Water', r.water],
            ['Levain (active starter)', r.levain],
            ['Salt', r.salt],
          ].map(([l, v]) => (
            <tr key={l}>
              <td>{l}</td>
              <td className="num">{v} g</td>
            </tr>
          ))}
          <tr className="total">
            <td>Dough</td>
            <td className="num">
              {r.total} g{c.loaves > 1 ? ` · ${r.perLoaf} g a loaf` : ''}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted small note">True hydration with the starter counted: {r.trueHydration}%.</p>
    </section>
  );
}

// ---------------------------------------------------------------- bake log
function Stars({ value, onPick, label }) {
  return (
    <span className="stars" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={`star ${n <= value ? 'on' : ''}`} onClick={() => onPick(n === value ? 0 : n)} aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-pressed={n <= value}>
          ★
        </button>
      ))}
    </span>
  );
}
function BakesCard({ data, mutate }) {
  const [f, setF] = useState(null);
  const bakes = [...data.bakes].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return (
    <section className="card bakes">
      <div className="card-head">
        <h2 className="card-title">Bake log</h2>
        {f ? null : (
          <button className="link-btn small" onClick={() => setF({ date: todayISO(), hydration: data.calc.hydration, rating: 0, notes: '' })}>
            + Log a bake
          </button>
        )}
      </div>
      {f ? (
        <form
          className="bake-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.rating >= 4) celebrate(centerOf(e.currentTarget));
            mutate((d) => S.logBake(d, f), 'Bake logged');
            setF(null);
          }}
        >
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Bake date" />
          <label className="calc-in">
            <span className="calc-box">
              <input className="input num" inputMode="numeric" value={f.hydration} onChange={(e) => setF({ ...f, hydration: e.target.value.replace(/\D/g, '') })} aria-label="Hydration" />
              <span className="muted small">% water</span>
            </span>
          </label>
          <Stars value={f.rating} onPick={(n) => setF({ ...f, rating: n })} label="How it turned out" />
          <textarea className="input" rows="2" placeholder="Crumb, crust, what you’d change…" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} aria-label="Notes" />
          <div className="row-between">
            <button className="btn quiet small" type="button" onClick={() => setF(null)}>
              Cancel
            </button>
            <button className="btn primary" type="submit">
              Save bake
            </button>
          </div>
        </form>
      ) : null}
      {bakes.length ? (
        <ul className="list">
          {bakes.slice(0, 8).map((b) => (
            <li key={b.id} className="bake">
              <div className="grow">
                <div className="row-between">
                  <span className="bill-name">
                    {dateLabel(b.date)}
                    {b.hydration ? <span className="muted small"> · {b.hydration}%</span> : null}
                  </span>
                  <Stars value={b.rating} onPick={(n) => mutate((d) => S.rateBake(d, b.id, n))} label={`Rating for ${dateLabel(b.date)}`} />
                </div>
                {b.notes ? <div className="muted small">{b.notes}</div> : null}
              </div>
              <button className="x" aria-label={`Remove the bake from ${dateLabel(b.date)}`} onClick={() => mutate((d) => S.removeBake(d, b.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : f ? null : (
        <p className="empty small">No bakes logged yet. Log each loaf to see what hydration and timing work in your kitchen.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- section, and a line for the Cooking home card
export function SourdoughSection({ data, mutate }) {
  if (!data) return <section className="card"><p className="empty">Loading…</p></section>;
  return (
    <div className="grid sourdough">
      <div className="col">
        <StarterCard data={data} mutate={mutate} />
        <CalcCard data={data} mutate={mutate} />
      </div>
      <div className="col">
        <PlannerCard data={data} mutate={mutate} />
        <BakesCard data={data} mutate={mutate} />
      </div>
    </div>
  );
}

export function SourdoughHomeRow({ data }) {
  const now = useNow(60000);
  if (!data) return null;
  const f = S.lastFeed(data);
  if (!f || now - new Date(f.at) > 14 * 86400000) return null;
  const st = S.starterState(data, now);
  const line = st.state === 'rising' && st.from ? `Rising, peaks around ${clock(st.from)}` : st.text;
  return (
    <a className="home-row" href="#/cooking?sourdough">
      <span className="grow">
        <span className="bill-name">{data.starter.name || 'Sourdough starter'}</span>
        <span className="muted small block">{line}</span>
      </span>
    </a>
  );
}
