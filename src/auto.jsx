import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { fmt, todayISO, dateLabel } from './budget-logic.js';
import {
  SCHEDULE,
  SCHEDULE_URL,
  latestOdo,
  milesOn,
  milesPerYear,
  addReading,
  maintenance,
  logService,
  removeService,
  deadlines,
  renew,
  warranty,
  carMoney,
  recallsUrl,
  RECALL_STATES,
  setRecall,
  autoAlerts,
  monthLabel,
  dayLabel,
} from './auto-logic.js';

const mi = (n) => `${Math.round(n).toLocaleString()} mi`;
const carName = (c) => `${c.year} ${c.make} ${c.model} ${c.trim}`.trim();
const TONE = { over: 'Overdue', soon: 'Due soon', near: 'Coming up', ok: 'OK', none: 'Not set' };

// Recalls for the model year from NHTSA, cached for a day on this device.
export function useRecalls(car) {
  const key = car ? `${car.year}-${car.make}-${car.model}` : '';
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!car) return;
    try {
      const c = JSON.parse(localStorage.getItem('dash.recalls') || 'null');
      if (c && c.key === key && Date.now() - c.at < 86400000) return setList(c.list);
    } catch {
      /* ignore */
    }
    fetch(recallsUrl(car))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((j) => {
        const l = (j.results || []).map((x) => ({
          id: x.NHTSACampaignNumber,
          date: x.ReportReceivedDate,
          component: String(x.Component || '').split(':').pop().toLowerCase(),
          summary: x.Summary || '',
          remedy: x.Remedy || '',
        }));
        setList(l);
        try {
          localStorage.setItem('dash.recalls', JSON.stringify({ key, at: Date.now(), list: l }));
        } catch {
          /* ignore */
        }
      })
      .catch(() => setList((x) => x || []));
  }, [key]);
  return list;
}

// ---------------------------------------------------------------- Home card
export function AutoHomeCard({ auto, data, recalls }) {
  const money = useMemo(() => carMoney(data), [data]);
  if (!auto) return null;
  const alerts = autoAlerts(auto, money, recalls).slice(0, 3);
  return (
    <section className="card auto-home">
      <div className="card-head">
        <h2 className="card-title">Auto</h2>
        <a className="link small" href="#/auto">
          Car →
        </a>
      </div>
      <div className="auto-home-top">
        <div className="grow">
          <div className="bill-name">{carName(auto.car)}</div>
          <div className="muted small">~{mi(milesOn(auto))}</div>
        </div>
        <img className="auto-thumb" src="car.png" alt="" />
      </div>
      {alerts.length ? (
        <ul className="alerts">
          {alerts.map((a, i) => (
            <li key={i} className={`al al-${a.tone}`}>
              <span className="al-dot" />
              {a.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ok-note small">Nothing due right now.</p>
      )}
      {money && money.loan && money.loan.left != null ? (
        <a className="home-row" href="#/auto">
          <span className="grow">
            <span className="bill-name">Car loan</span>
            <span className="muted small block">
              {money.loan.left} payment{money.loan.left === 1 ? '' : 's'} left · {fmt(money.loan.owed)} · paid off {monthLabel(`${money.loan.ends}-01`)}
            </span>
          </span>
        </a>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- page pieces
function CarCard({ auto, mutate }) {
  const [miles, setMiles] = useState('');
  const l = latestOdo(auto);
  const rate = milesPerYear(auto);
  const w = warranty(auto);
  const save = (e) => {
    e.preventDefault();
    const n = Number(String(miles).replace(/[^\d]/g, ''));
    if (!n) return;
    mutate((a) => addReading(a, n), `Mileage updated to ${mi(n)}`);
    setMiles('');
  };
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Mileage &amp; warranty</h2>
      </div>
      <div className="odo">
        <div>
          <div className="big num">{mi(milesOn(auto))}</div>
          <div className="muted small">
            {l.date === todayISO() ? 'Updated today' : `Estimated from ${mi(l.miles)} on ${dayLabel(l.date)}`} · about {rate.rate.toLocaleString()} mi a year
            {rate.how === 'purchase' ? ' (since purchase)' : ''}
          </div>
        </div>
      </div>
      <form className="add-row" onSubmit={save}>
        <input className="input num" inputMode="numeric" placeholder="Odometer now" value={miles} onChange={(e) => setMiles(e.target.value)} aria-label="Current mileage" />
        <button className="btn" type="submit" disabled={!miles.trim()}>
          Update
        </button>
      </form>
      <h3 className="k-head">Warranty</h3>
      <ul className="list">
        {w.map((x) => (
          <li key={x.name} className="w-row">
            <span className="bill-name">{x.name}</span>
            <span className={`small ${x.active ? 'rc-ok' : 'muted'}`}>{x.text}</span>
          </li>
        ))}
      </ul>
      <label className="field">
        <span className="small muted">Purchase month</span>
        <input className="input" type="month" value={auto.car.boughtMonth || ''} onChange={(e) => mutate((a) => (a.car.boughtMonth = e.target.value))} aria-label="Purchase month" />
      </label>
    </section>
  );
}

function DeadlinesCard({ auto, mutate }) {
  const list = deadlines(auto);
  const field = { inspection: 'inspection', registration: 'registration', insurance: 'insuranceRenews' };
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Deadlines</h2>
      </div>
      <ul className="list">
        {list.map((d) => (
          <li key={d.id} className="dl-row">
            <div className="row-between">
              <span className="bill-name">{d.name}</span>
              <span className={`tag tag-${d.status}`}>{d.days == null ? TONE.none : d.days < 0 ? `${-d.days} days late` : d.days === 0 ? 'Today' : `${d.days} days`}</span>
            </div>
            <div className="muted small">{d.label}</div>
            <div className="dl-actions">
              <input className="input small-input" type="date" value={d.date || ''} onChange={(e) => mutate((a) => (a[field[d.id]] = e.target.value))} aria-label={`${d.name} date`} />
              {d.date ? (
                <button className="btn quiet small" onClick={() => mutate((a) => renew(a, d.id), `${d.name} updated`)}>
                  {d.renew}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small note">“Inspected” sets the next one 12 months out (through the end of that month). “Renewed” adds 2 years to registration and 6 months to insurance.</p>
    </section>
  );
}

function MoneyCard({ data }) {
  const m = carMoney(data);
  if (!m) return null;
  const pct = m.gas && m.gas.budget ? Math.min(100, (m.gas.spent / m.gas.budget) * 100) : 0;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Costs</h2>
        <span className="muted small">From your budget</span>
      </div>
      <ul className="list">
        {m.loan ? (
          <li className="w-row">
            <div className="row-between">
              <span className="bill-name">Car payment</span>
              <span className="num bill-amt">{fmt(m.loan.amount)}/mo</span>
            </div>
            <span className="muted small">
              {m.loan.left != null ? `${m.loan.left} payments left (${fmt(m.loan.owed)}) · last one ${monthLabel(`${m.loan.ends}-01`)} · charges on the ${m.loan.day}th` : `Charges on the ${m.loan.day}th`}
            </span>
          </li>
        ) : null}
        {m.insurance ? (
          <li className="w-row">
            <div className="row-between">
              <span className="bill-name">{m.insurance.name}</span>
              <span className="num bill-amt">{fmt(m.insurance.amount)}/mo</span>
            </div>
            {m.insurance.next ? (
              <span className="muted small">
                {fmt(m.insurance.next.amount)}/mo from {monthLabel(`${m.insurance.next.from}-01`)}
              </span>
            ) : null}
          </li>
        ) : null}
        {m.gas ? (
          <li className="w-row">
            <div className="row-between">
              <span className="bill-name">{m.gas.name} this month</span>
              <span className="num small">
                {fmt(m.gas.spent)} <span className="muted">/ {fmt(m.gas.budget)}</span>
              </span>
            </div>
            <div className="bar slim">
              <div className={`bar-fill ${m.gas.spent > m.gas.budget ? 'bar-over' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            {m.gas.recent.length ? (
              <ul className="log-list small">
                {m.gas.recent.map((t) => (
                  <li key={t.id}>
                    <span className="muted">{dateLabel(t.date)}</span> · {t.desc} · <span className="num">{fmt(t.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function MaintenanceCard({ auto, onLog }) {
  const list = maintenance(auto);
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Maintenance</h2>
        <button className="btn primary small" onClick={onLog}>
          Log service
        </button>
      </div>
      <ul className="list">
        {list.map((m) => (
          <li key={m.id} className="mt-row">
            <div className="row-between">
              <span className="bill-name">{m.name}</span>
              <span className={`tag tag-${m.unknown && m.status === 'ok' ? 'none' : m.status}`}>{m.status === 'over' ? 'Overdue' : m.status === 'soon' ? 'Due soon' : m.unknown ? 'No record' : 'OK'}</span>
            </div>
            <div className="muted small">
              Every {m.miles.toLocaleString()} mi or {m.months >= 12 && m.months % 12 === 0 ? `${m.months / 12} yr` : `${m.months} mo`} ·{' '}
              {m.unknown ? `next mark ${mi(m.dueMiles)}` : `last ${dayLabel(m.last.date)}${m.last.miles ? ` at ${mi(m.last.miles)}` : ''}; next ${mi(m.dueMiles)}`}
              {m.milesLeft > 0 ? ` (~${m.milesLeft.toLocaleString()} mi, around ${monthLabel(m.when)})` : ''}
            </div>
            {m.note ? <div className="muted small">{m.note}</div> : null}
            {!m.unknown ? (
              <div className="bar slim">
                <div className={`bar-fill ${m.status === 'over' ? 'bar-over' : m.status === 'soon' ? 'bar-ahead' : ''}`} style={{ width: `${Math.max(3, Math.min(100, (1 - m.milesLeft / m.miles) * 100))}%` }} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="muted small note">
        Intervals from{' '}
        <a href={SCHEDULE_URL} target="_blank" rel="noopener">
          Nissan’s 2021 Altima maintenance guide
        </a>{' '}
        for the 2.5L AWD. “No record” items count from the next mileage mark until you log one.
      </p>
    </section>
  );
}

function HistoryCard({ auto, mutate }) {
  const list = [...auto.service].sort((x, y) => (x.date < y.date ? 1 : -1));
  if (!list.length) return null;
  const names = Object.fromEntries(SCHEDULE.map((s) => [s.id, s.name]));
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Service history</h2>
        <span className="muted small">{fmt(list.reduce((t, s) => t + (s.cost || 0), 0))} logged</span>
      </div>
      <ul className="list">
        {list.map((s) => (
          <li key={s.id} className="bill">
            <div className="grow">
              <div className="bill-name">{[...(s.items || []).map((i) => names[i] || i), s.note].filter(Boolean).join(', ') || 'Service'}</div>
              <div className="muted small">
                {dayLabel(s.date)}
                {s.miles ? ` · ${mi(s.miles)}` : ''}
                {s.shop ? ` · ${s.shop}` : ''}
              </div>
            </div>
            {s.cost ? <span className="num bill-amt">{fmt(s.cost)}</span> : null}
            <button className="x" aria-label="Delete this entry" onClick={() => mutate((a) => removeService(a, s.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecallsCard({ auto, recalls, mutate }) {
  const [open, setOpen] = useState(null);
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Recalls</h2>
        <a className="link small" href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener">
          Check your VIN →
        </a>
      </div>
      {!recalls ? (
        <p className="empty">Checking NHTSA…</p>
      ) : recalls.length === 0 ? (
        <p className="empty">No recalls listed for the {auto.car.year} {auto.car.model}.</p>
      ) : (
        <ul className="list">
          {recalls.map((r) => (
            <li key={r.id} className="rc-recall">
              <button className="step-head" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                <span className="grow">
                  <span className="step-title">{r.component.replace(/^./, (c) => c.toUpperCase())}</span>
                  <span className="muted small">
                    {r.id} · {r.date}
                  </span>
                </span>
                <Icon name={open === r.id ? 'down' : 'chev'} size={18} />
              </button>
              {open === r.id ? (
                <div className="small recall-body">
                  <p>{r.summary}</p>
                  {r.remedy ? (
                    <p>
                      <b>Fix: </b>
                      {r.remedy}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <select className="input small-input" value={auto.recalls[r.id] || ''} onChange={(e) => mutate((a) => setRecall(a, r.id, e.target.value))} aria-label={`Status of recall ${r.id}`}>
                {RECALL_STATES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small note">These cover “certain” {auto.car.year} {auto.car.model}s. Enter your VIN on NHTSA’s site (or ask the dealer at your next service) to see if yours is affected; repairs are free.</p>
    </section>
  );
}

function LogServiceSheet({ auto, budget, onSave, onClose }) {
  const [f, setF] = useState({ date: todayISO(), miles: String(milesOn(auto)), items: [], cost: '', shop: '', note: '', toBudget: true, method: (budget && budget.methods[0]) || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (id) => setF({ ...f, items: f.items.includes(id) ? f.items.filter((x) => x !== id) : [...f.items, id] });
  const ok = f.items.length || f.note.trim();
  const cost = Number(f.cost);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <form
        className="sheet tall"
        role="dialog"
        aria-label="Log service"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave(f);
        }}
      >
        <h2 className="card-title">Log service</h2>
        <div className="chips svc-items">
          {SCHEDULE.map((s) => (
            <button type="button" key={s.id} className={`chip ${f.items.includes(s.id) ? 'on' : ''}`} aria-pressed={f.items.includes(s.id)} onClick={() => toggle(s.id)}>
              {f.items.includes(s.id) ? '✓ ' : ''}
              {s.name}
            </button>
          ))}
        </div>
        <label className="field wide">
          <span className="small muted">Anything else (optional)</span>
          <input className="input" value={f.note} onChange={set('note')} placeholder="e.g. new wiper blades, 2 front tires" />
        </label>
        <div className="qa shop-form">
          <label className="field">
            <span className="small muted">Date</span>
            <input className="input" type="date" value={f.date} onChange={set('date')} />
          </label>
          <label className="field">
            <span className="small muted">Mileage</span>
            <input className="input num" inputMode="numeric" value={f.miles} onChange={set('miles')} aria-label="Mileage at service" />
          </label>
          <label className="field">
            <span className="small muted">Cost</span>
            <input className="input num" inputMode="decimal" placeholder="0.00" value={f.cost} onChange={set('cost')} aria-label="Cost" />
          </label>
          <label className="field">
            <span className="small muted">Shop</span>
            <input className="input" value={f.shop} onChange={set('shop')} placeholder="Dealer, Jiffy Lube…" />
          </label>
        </div>
        {budget && cost > 0 ? (
          <label className="check-line small">
            <input type="checkbox" checked={f.toBudget} onChange={(e) => setF({ ...f, toBudget: e.target.checked })} /> Add {fmt(cost)} to {budget.category} in the budget, paid with{' '}
            <select className="inline-select" value={f.method} onChange={set('method')} aria-label="Paid with">
              {budget.methods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="btn primary block" type="submit" disabled={!ok}>
          Save
        </button>
        <button className="btn quiet block" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- hero
// The soonest thing coming up: a deadline or a maintenance item.
function nextUp(auto) {
  const items = [
    ...deadlines(auto)
      .filter((d) => d.date)
      .map((d) => ({ name: d.name, days: d.days })),
    ...maintenance(auto).map((m) => ({ name: m.name, days: m.days })),
  ].sort((a, b) => a.days - b.days);
  const n = items[0];
  if (!n) return null;
  return {
    value: n.days < 0 ? 'Overdue' : n.days === 0 ? 'Today' : n.days === 1 ? '1 day' : n.days < 60 ? `${n.days} days` : `${Math.round(n.days / 30)} mo`,
    label: n.name.replace(/^NYS /, ''),
    warn: n.days <= 30,
  };
}

function Hero({ auto, data }) {
  const money = carMoney(data);
  const next = nextUp(auto);
  const c = auto.car;
  return (
    <section className="auto-hero" aria-label={carName(c)}>
      <img className="hero-car" src="car.png" alt={`${c.year} ${c.make} ${c.model}`} />
      <div className="hero-body">
        <div className="eyebrow">My car</div>
        <h2 className="hero-title">
          {c.year} {c.make} {c.model} <span className="trim">{c.trim}</span>
        </h2>
        <div className="hero-sub">
          {c.engine} {c.drive} · {c.body} · bought {c.isNew ? 'new' : 'used'} {c.boughtMonth ? monthLabel(`${c.boughtMonth}-01`) : c.bought}
        </div>
        <div className="hero-stats">
          <div className="hs">
            <b className="num">{Math.round(milesOn(auto)).toLocaleString()}</b>
            <span>miles</span>
          </div>
          {money && money.loan && money.loan.left != null ? (
            <div className="hs">
              <b className="num">{money.loan.left}</b>
              <span>payments left · done {monthLabel(`${money.loan.ends}-01`)}</span>
            </div>
          ) : null}
          {next ? (
            <div className={`hs ${next.warn ? 'warn' : ''}`}>
              <b>{next.value}</b>
              <span>to {next.label.toLowerCase()}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- page
export function AutoPage({ auto, data, recalls, mutate, budget, onAddExpense, error }) {
  const [logging, setLogging] = useState(false);
  if (!auto) {
    return (
      <div className="home">
        <header className="page-head">
          <h1 className="page-title">Auto</h1>
        </header>
        <section className="card">
          <p className="empty">{error || 'Loading…'}</p>
        </section>
      </div>
    );
  }
  const save = async (f) => {
    const names = Object.fromEntries(SCHEDULE.map((s) => [s.id, s.name]));
    await mutate((a) => logService(a, f), 'Service logged');
    const cost = Number(f.cost);
    if (budget && f.toBudget && cost > 0) {
      const what = [...f.items.map((i) => names[i]), f.note.trim()].filter(Boolean).join(', ');
      await onAddExpense({ date: f.date, desc: `Car: ${what}${f.shop ? ` (${f.shop.trim()})` : ''}`.slice(0, 80), category: budget.category, amount: cost, method: f.method });
    }
    setLogging(false);
  };
  return (
    <div className="home auto">
      <header className="page-head">
        <h1 className="page-title">Auto</h1>
      </header>
      {error ? <div className="alert">{error}</div> : null}
      <Hero auto={auto} data={data} />
      <div className="grid">
        <div className="col">
          <DeadlinesCard auto={auto} mutate={mutate} />
          <MaintenanceCard auto={auto} onLog={() => setLogging(true)} />
          <HistoryCard auto={auto} mutate={mutate} />
        </div>
        <div className="col">
          <CarCard auto={auto} mutate={mutate} />
          <MoneyCard data={data} />
          <RecallsCard auto={auto} recalls={recalls} mutate={mutate} />
        </div>
      </div>
      {logging ? <LogServiceSheet auto={auto} budget={budget} onSave={save} onClose={() => setLogging(false)} /> : null}
    </div>
  );
}
