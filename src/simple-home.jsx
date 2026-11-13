// Home, kept simple: what's left to spend with the add box, what's coming up, savings in one line, and one small
// thing from an area you'd like to get into. Everything else lives in its own tab (Settings → Tabs).
import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { Hero, useNow } from './pulse.jsx';
import { CountUp, Skeleton } from './fx.jsx';
import { QuickAdd } from './budget-add.jsx';
import { OwedToYou } from './budget.jsx';
import * as C from './budget-core.js';
import { homeSummary, fmt, fmt0, dateLabel, todayISO } from './budget-logic.js';
import { SMALL_AREAS, smallToday, setSmallArea, setSmallOn, smallDone, smallUndo, smallSkip, setTab } from './home-logic.js';
import { logTime, currentStep, removeLog, statusOf, setStatus } from './learning-logic.js';
import { CERTS } from './learning-catalog.js';
import { addGrocery } from './cooking-logic.js';
import { maintenance, addReading, latestOdo } from './auto-logic.js';

const AREA_ICON = { learning: 'learn', cooking: 'pot', health: 'heart', auto: 'car' };
const OFFER_AFTER = 5; // Dones in an area before Home offers its tab

function greeting(d) {
  const h = d.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Bar({ spent, budget, frac, status }) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : spent > 0 ? 100 : 0;
  return (
    <div className="bar">
      <div className={`bar-fill bar-${status}`} style={{ width: `${pct}%` }} />
      {budget > 0 && frac > 0 && frac < 1 ? <div className="bar-pace" style={{ left: `${frac * 100}%` }} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- 1. money + the add box
function MoneyCard({ s, data, onAdd }) {
  const monthName = new Date(`${s.key}-01T12:00:00`).toLocaleString('en-US', { month: 'long' });
  const daysLeft = Math.max(1, s.pacing.days - s.pacing.day + 1);
  return (
    <section className="card money sh-money">
      <div className="card-head">
        <h2 className="card-title">{monthName}</h2>
        <a className="link small" href="#/budget">
          Budget →
        </a>
      </div>
      <div className="muted small">{s.left >= 0 ? 'Left to spend' : 'Over budget by'}</div>
      <div className={`big num ${s.left < 0 ? 'neg' : ''}`}>
        <CountUp value={Math.abs(s.left)} format={fmt} />
      </div>
      <div className="muted small num sh-perday">
        {s.left > 0 ? `About ${fmt0(s.left / daysLeft)} a day for the next ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}` : `${fmt(s.spent)} spent of ${fmt0(s.budget)}`}
      </div>
      <Bar spent={s.spent} budget={s.budget} frac={s.pacing.frac} status={s.status} />
      <QuickAdd data={data} onAdd={onAdd} />
    </section>
  );
}

// ---------------------------------------------------------------- 2. coming up
function dueLabel(u) {
  if (u.daysAway === 0) return 'Today';
  if (u.daysAway === 1) return 'Tomorrow';
  return dateLabel(u.due);
}
function ComingUp({ s, onToggle }) {
  return (
    <section className="card sh-coming">
      <div className="card-head">
        <h2 className="card-title">Coming up</h2>
        <span className="muted small num">{s.upcomingTotal > 0 ? `${fmt(s.upcomingTotal)} this week` : ''}</span>
      </div>
      {s.upcoming.length === 0 ? (
        <p className="empty">No bills in the next 7 days.</p>
      ) : (
        <ul className="list">
          {s.upcoming.map((u) => (
            <li key={`${u.key}-${u.id}`} className={`bill ${u.paid ? 'done' : ''}`}>
              <label className="bill-check">
                <input type="checkbox" checked={u.paid} onChange={() => onToggle(u)} aria-label={`${u.name} paid`} />
                <span className="box">{u.paid ? <Icon name="check" size={14} /> : null}</span>
              </label>
              <div className="grow">
                <div className="bill-name">{u.name}</div>
                <div className="muted small">
                  {dueLabel(u)}
                  {u.split ? ` · your share of ${fmt(u.full)}` : ''}
                </div>
              </div>
              <div className="num bill-amt">{fmt(u.cost)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 3. savings, one line
function SavingsLine({ data }) {
  const bal = C.savingsBalance(data);
  return (
    <a className="card sh-savings" href="#/budget?view=savings">
      <span className="grow">Savings</span>
      <span className="num sh-sv-v">{fmt0(bal)}</span>
      <Icon name="chev" size={18} />
    </a>
  );
}

// ---------------------------------------------------------------- 4. one small thing
function nextService(auto) {
  if (!auto) return null;
  const m = maintenance(auto)
    .filter((x) => x.when)
    .sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0))[0];
  if (!m) return null;
  const byMiles = m.milesLeft != null && m.when !== m.dueDate;
  const when = m.status === 'over' ? 'is due now' : byMiles ? `in about ${Math.max(0, m.milesLeft).toLocaleString()} miles` : m.days < 60 ? `in ${Math.max(0, m.days)} ${m.days === 1 ? 'day' : 'days'}` : `in about ${Math.round(m.days / 30.44)} months`;
  return `${m.name} ${when}.`;
}

function AreaPicker({ current, onPick, onHide, onCancel }) {
  return (
    <>
      <p className="st-lead">Pick an area you’d like to get into. You’ll get one tiny thing a day from it. Do it or skip it; nothing keeps score.</p>
      <div className="st-areas" role="group" aria-label="Areas">
        {Object.entries(SMALL_AREAS).map(([k, a]) => (
          <button key={k} className={`chip st-area ${current === k ? 'on' : ''}`} aria-pressed={current === k} onClick={() => onPick(k)}>
            <Icon name={AREA_ICON[k]} size={16} /> {a.name}
          </button>
        ))}
      </div>
      <div className="st-foot">
        {onCancel ? (
          <button className="linkish small" onClick={onCancel}>
            Keep {SMALL_AREAS[current].name}
          </button>
        ) : null}
        <button className="linkish small st-hide" onClick={onHide}>
          Hide this card
        </button>
      </div>
    </>
  );
}

function SmallThing({ home, mutateHome, learning, mutateLearning, cooking, mutateCooking, auto, mutateAuto }) {
  const today = todayISO();
  const t = smallToday(home, today);
  const [picking, setPicking] = useState(false);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const actionId = t.action && t.action.id;
  useEffect(() => setVal(''), [actionId, t.area]);
  if (!t.on) return null;
  const hide = () => mutateHome((d) => setSmallOn(d, false), 'Hidden. Turn it back on in Settings.');
  const pick = (k) => {
    setPicking(false);
    if (k !== t.area) mutateHome((d) => setSmallArea(d, k));
  };
  if (!t.area || picking)
    return (
      <section className="card small-thing">
        <div className="card-head">
          <h2 className="card-title">One small thing</h2>
        </div>
        <AreaPicker current={t.area} onPick={pick} onHide={hide} onCancel={t.area ? () => setPicking(false) : null} />
      </section>
    );

  const a = t.action;
  const tabOn = (home.tabs || []).includes(t.area);
  const cert = t.area === 'learning' && learning ? currentStep(learning) : null;
  const certCode = cert && CERTS[cert] ? CERTS[cert].code || CERTS[cert].name : '';
  const odo = auto && auto.odo && auto.odo.length ? latestOdo(auto) : null;

  // Done: write whatever the action means elsewhere first, then mark today's thing done (remembering it for Undo).
  const done = async () => {
    if (busy) return;
    setBusy(true);
    let ref = null;
    try {
      if (a.kind === 'study' && cert) {
        let id = null;
        let was = null;
        await mutateLearning((d) => {
          was = statusOf(d, cert);
          id = logTime(d, cert, a.minutes || 10).id; // time on a planned step starts it
        });
        ref = id ? { learn: id, cert, was } : null;
      } else if (a.kind === 'grocery') {
        if (!val.trim()) return;
        let added = [];
        await mutateCooking((d) => {
          const before = new Set(d.grocery.map((g) => g.id));
          addGrocery(d, [val]);
          added = d.grocery.filter((g) => !before.has(g.id)).map((g) => g.id);
        });
        ref = { grocery: added };
      } else if (a.kind === 'miles') {
        const n = Math.round(Number(String(val).replace(/[,\s]/g, '')));
        if (!n || n < 0) return;
        if ((await mutateAuto((d) => addReading(d, n, today))) === false) return;
        ref = { miles: n };
      }
      await mutateHome((d) => smallDone(d, a.id, today, ref));
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    const r = t.ref || {};
    if (r.learn)
      await mutateLearning((d) => {
        removeLog(d, r.learn);
        if (r.was === 'planned' && statusOf(d, r.cert) === 'studying') setStatus(d, r.cert, 'planned');
      });
    if (r.grocery && r.grocery.length) await mutateCooking((d) => (d.grocery = d.grocery.filter((g) => !r.grocery.includes(g.id))));
    if (r.miles) await mutateAuto((d) => (d.odo = d.odo.filter((o) => !(o.date === today && o.miles === r.miles))));
    await mutateHome((d) => smallUndo(d, today));
  };
  const skip = () => mutateHome((d) => smallSkip(d, today));

  const needsVal = a && (a.kind === 'grocery' || a.kind === 'miles');
  const okVal = a && (a.kind === 'grocery' ? val.trim() : a.kind === 'miles' ? Number(String(val).replace(/[,\s]/g, '')) > 0 : true);
  return (
    <section className={`card small-thing st-${t.area}`}>
      <div className="card-head">
        <h2 className="card-title">One small thing</h2>
        <button className="chip st-which" onClick={() => setPicking(true)} aria-label={`${t.name}. Change area`}>
          <Icon name={AREA_ICON[t.area]} size={15} /> {t.name}
        </button>
      </div>
      {t.done ? (
        <>
          <div className="st-done">
            <span className="st-tick" aria-hidden="true">
              <Icon name="check" size={16} />
            </span>
            <div className="grow">
              <div className="st-text">{a.text}</div>
              <div className="muted small">Done. That’s it for today.</div>
            </div>
            <button className="linkish small" onClick={undo}>
              Undo
            </button>
          </div>
          {t.total >= OFFER_AFTER && !tabOn ? (
            <div className="st-offer">
              <span className="small">You’ve done {t.total} of these. Want the {t.area === 'auto' ? 'Auto' : t.name} tab back in the sidebar?</span>
              <button className="btn small quiet" onClick={() => mutateHome((d) => setTab(d, t.area, true), `${t.area === 'auto' ? 'Auto' : t.name} is back in the sidebar`)}>
                Turn it on
              </button>
            </div>
          ) : null}
        </>
      ) : t.out ? (
        <div className="st-out">
          <p className="st-text">That’s all for today. A new one shows up tomorrow.</p>
          <button className="linkish small" onClick={() => setPicking(true)}>
            Try a different area
          </button>
        </div>
      ) : (
        <form
          className="st-now"
          onSubmit={(e) => {
            e.preventDefault();
            if (okVal) done();
          }}
        >
          <p className="st-text">{a.text}</p>
          {a.kind === 'study' ? <p className="muted small st-sub">{certCode ? `Done logs ${a.minutes || 10} minutes on ${certCode}.` : 'Anything you’re curious about counts.'}</p> : null}
          {a.kind === 'service' ? <p className="small st-sub">{nextService(auto) || 'Nothing on the schedule yet.'}</p> : null}
          {a.href ? (
            <a className="link small st-sub" href={a.href}>
              Open flashcards →
            </a>
          ) : null}
          {a.kind === 'grocery' ? <input className="input st-in" value={val} onChange={(e) => setVal(e.target.value)} placeholder="What do you need?" aria-label="Grocery item" /> : null}
          {a.kind === 'miles' ? <input className="input num st-in" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} placeholder={odo ? `Last: ${Number(odo.miles).toLocaleString()}` : 'Miles'} aria-label="Odometer miles" /> : null}
          <div className="st-btns">
            <button className="btn primary" type="submit" disabled={busy || (needsVal && !okVal)}>
              {a.kind === 'grocery' ? 'Add to the list' : a.kind === 'miles' ? 'Save' : a.kind === 'service' ? 'Got it' : 'Done'}
            </button>
            <button className="btn quiet" type="button" onClick={skip}>
              Something else
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- the page
let homeSeen = false;
export function SimpleHome({ user, data, dataError, onAdd, onToggle, mutateBudget, home, mutateHome, learning, mutateLearning, cooking, mutateCooking, auto, mutateAuto, forecast, pageSky }) {
  const s = useMemo(() => (data ? homeSummary(data) : null), [data]);
  const nd = useMemo(() => (data ? C.normalizeBudget(JSON.parse(JSON.stringify(data))) : null), [data]);
  const key = C.todayKey();
  const ms = useMemo(() => (nd && nd.months[key] ? C.monthStats(nd, key) : null), [nd, key]);
  const first = String((user && user.displayName) || '').split(' ')[0];
  const now = useNow();
  const [intro] = useState(() => !homeSeen);
  useEffect(() => {
    homeSeen = true;
  }, []);
  const upd = (fn, msg) => mutateBudget((d) => fn(C.normalizeBudget(d)), msg);
  return (
    <div className={`home simple-home ${intro ? 'intro' : ''}`}>
      <Hero simple wx={forecast.s} greeting={greeting(now)} name={first} pageSky={pageSky} />
      {dataError ? <div className="alert">{dataError}</div> : null}
      <div className="sh-cards">
        {s && nd ? (
          <>
            <div className="slot o1">
              <MoneyCard s={s} data={nd} onAdd={onAdd} />
            </div>
            <div className="slot o2">
              <ComingUp s={s} onToggle={onToggle} />
              {ms ? <OwedToYou data={nd} upd={upd} s={ms} monthKey={key} goSettings={() => (location.hash = '#/budget?view=settings')} /> : null}
            </div>
            <div className="slot o3">
              <SavingsLine data={nd} />
            </div>
          </>
        ) : (
          <div className="slot o1">{dataError ? <section className="card"><p className="empty">Budget data unavailable.</p></section> : <Skeleton lines={4} tall />}</div>
        )}
        {home ? (
          <div className="slot o4">
            <SmallThing home={home} mutateHome={mutateHome} learning={learning} mutateLearning={mutateLearning} cooking={cooking} mutateCooking={mutateCooking} auto={auto} mutateAuto={mutateAuto} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
