import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import css from './styles.css';
import { createFirebaseBackend } from './backend.js';
import { IS_DEMO, createDemoBackend, resetDemo, exitDemo, enterDemo, cameFromAccount, demoLink } from './demo.js';
import { Icon } from './ui.jsx';
import { LearningPage, LearningHomeCard } from './learning.jsx';
import { defaultLearning, normalize as normalizeLearning } from './learning-logic.js';
import { CookingPage, CookingHomeCard, FinishShopSheet, tonightPick } from './cooking.jsx';
import { defaultCooking, normalizeCooking, putAway, groceriesCategory } from './cooking-logic.js';
import { WeatherCard, TodoCard, useForecast } from './home-cards.jsx';
import { Hero, RingsCard, WeekCard, WeekSheet, InsightsCard, HeatmapCard, useNow } from './pulse.jsx';
import { CountUp, Skeleton } from './fx.jsx';
import { Sparkline } from './spark.jsx';
import { AutoPage, AutoHomeCard, useRecalls } from './auto.jsx';
import { defaultAuto, normalizeAuto } from './auto-logic.js';
import { defaultHome, normalizeHome, DEFAULT_PLACE, removeTodo, restoreTodo } from './home-logic.js';
import { HealthPage, HealthHomeCard } from './health.jsx';
import { FunPage } from './fun.jsx';
import { defaultFun, normalizeFun } from './fun-logic.js';
import { defaultGuitar, normalizeGuitar } from './guitar-logic.js';
import { defaultSourdough, normalizeSourdough } from './sourdough-logic.js';
import { defaultBirthdays, normalizeBirthdays, upcoming as upcomingBirthdays } from './birthdays-logic.js';
import { BirthdaysCard, BirthdaySheet } from './birthdays.jsx';
import { PortfolioCard } from './portfolio.jsx';
import * as H from './health-logic.js';
import * as HK from './hk-logic.js';
import {
  homeSummary,
  newTransaction,
  addTransaction,
  toggleBillPaid,
  fmt,
  fmt0,
  todayISO,
  dateLabel,
  keyOf,
  STATUS_LABEL,
  daysIn,
} from './budget-logic.js';

if (!document.getElementById('dash-css')) {
  const s = document.createElement('style');
  s.id = 'dash-css';
  s.textContent = css;
  document.head.appendChild(s);
}

// Demo mode (?demo) runs on sample data in this browser and never touches Firebase. Otherwise tests inject a
// stand-in backend, and the live site uses Firebase.
const backend = IS_DEMO ? createDemoBackend() : window.__DASH_BACKEND__ || createFirebaseBackend();
const FROM_ACCOUNT = IS_DEMO && cameFromAccount();
const EXIT_LABEL = FROM_ACCOUNT ? 'Back to my dashboard' : 'Exit demo';
const budgetSrc = IS_DEMO ? 'budget-demo.html' : 'budget.html';

// ---------------------------------------------------------------- helpers
const lsGet = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};
function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function useRoute() {
  const get = () => (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
  const [r, setR] = useState(get);
  useEffect(() => {
    const on = () => setR(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

// ---------------------------------------------------------------- small pieces
function Pill({ status }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

function Bar({ spent, budget, frac, status }) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : spent > 0 ? 100 : 0;
  return (
    <div className="bar" title={budget > 0 && frac < 1 ? `Even pace today: ${fmt0(budget * frac)}` : undefined}>
      <div className={`bar-fill bar-${status}`} style={{ width: `${pct}%` }} />
      {budget > 0 && frac > 0 && frac < 1 ? <div className="bar-pace" style={{ left: `${frac * 100}%` }} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- home cards
// Spending so far this month, day by day, against an even pace to the budget.
function SpendSpark({ data, s }) {
  const m = (data.months || {})[s.key];
  const days = s.pacing.days;
  const upto = s.pacing.day;
  if (!m || upto < 2) return null;
  const byDay = new Array(days).fill(0);
  (m.transactions || []).forEach((t) => {
    const d = Number(String(t.date || '').slice(8, 10));
    if (d >= 1 && d <= days) byDay[d - 1] += Number(t.amount) || 0;
  });
  let cum = 0;
  const mon = new Date(`${s.key}-15T12:00:00`).toLocaleString('en-US', { month: 'short' });
  const points = byDay.slice(0, upto).map((v, i) => {
    cum += v;
    return { i, v: cum, label: `${mon} ${i + 1}` };
  });
  return (
    <div className="money-spark">
      <Sparkline points={points} reference={[{ i: 0, v: 0 }, { i: days - 1, v: s.budget }]} domain={days - 1} tone={s.status === 'on' || s.status === 'under' ? 'green' : 'amber'} fmt={fmt0} label="Spent so far this month" height={52} />
      <div className="muted small">Spent so far vs an even pace (gray line) to {fmt0(s.budget)}</div>
    </div>
  );
}

function MoneyCard({ s, data }) {
  const monthName = new Date(`${s.key}-01T12:00:00`).toLocaleString('en-US', { month: 'long' });
  const pd = s.payday;
  return (
    <section className="card money">
      <div className="card-head">
        <h2 className="card-title">{monthName}</h2>
        <span className="muted small">Day {s.pacing.day} of {s.pacing.days}</span>
      </div>
      <div className="money-grid">
        <div className="money-main">
          <div className="muted small">{s.left >= 0 ? 'Left to spend' : 'Over budget by'}</div>
          <div className={`big num ${s.left < 0 ? 'neg' : ''}`}>
            <CountUp value={Math.abs(s.left)} format={fmt} />
          </div>
          <div className="muted small num">
            {fmt(s.spent)} spent of {fmt0(s.budget)}
          </div>
        </div>
        <div className="money-side">
          <div className="muted small">Next payday</div>
          <div className="mid num">{pd ? (pd.days === 0 ? 'Today' : pd.days === 1 ? 'Tomorrow' : `${pd.days} days`) : '—'}</div>
          <div className="muted small">{pd ? dateLabel(pd.iso) : 'Set a payday in Budget → Settings'}</div>
        </div>
      </div>
      <Bar spent={s.spent} budget={s.budget} frac={s.pacing.frac} status={s.status} />
      {data ? <SpendSpark data={data} s={s} /> : null}
      <div className="row-between">
        <Pill status={s.status} />
        <a className="link small" href="#/budget">Open budget →</a>
      </div>
    </section>
  );
}

function QuickAdd({ s, onAdd }) {
  const blank = () => ({ date: todayISO(), desc: '', amount: '', category: s.categoryNames[0] || '', method: s.methods[0] || '' });
  const [d, setD] = useState(blank);
  const [busy, setBusy] = useState(false);
  const amtRef = useRef(null);
  useEffect(() => {
    // keep selections valid if the budget's categories or methods change
    setD((x) => ({
      ...x,
      category: s.categoryNames.includes(x.category) ? x.category : s.categoryNames[0] || '',
      method: s.methods.includes(x.method) ? x.method : s.methods[0] || '',
    }));
  }, [s.categoryNames.join('|'), s.methods.join('|')]);
  const amount = Number(d.amount);
  const ok = d.desc.trim() && d.amount !== '' && !isNaN(amount) && amount !== 0 && d.date && d.category;
  const submit = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    const done = await onAdd(newTransaction(d));
    setBusy(false);
    if (done) {
      setD((x) => ({ ...blank(), category: x.category, method: x.method }));
      amtRef.current && amtRef.current.focus();
    }
  };
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Quick add</h2>
        <span className="muted small">Goes straight into the budget</span>
      </div>
      <form className="qa" onSubmit={submit}>
        <label className="qa-amt">
          <span className="sr">Amount</span>
          <span className="qa-dollar">$</span>
          <input ref={amtRef} className="input num" inputMode="decimal" placeholder="0.00" value={d.amount} onChange={set('amount')} aria-label="Amount" />
        </label>
        <input className="input qa-desc" placeholder="What was it?" value={d.desc} onChange={set('desc')} aria-label="Description" />
        <select className="input" value={d.category} onChange={set('category')} aria-label="Category">
          {s.categoryNames.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="input" value={d.method} onChange={set('method')} aria-label="Paid with">
          {s.methods.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input className="input" type="date" value={d.date} onChange={set('date')} aria-label="Date" />
        <button className="btn primary" disabled={!ok || busy} type="submit">
          {busy ? 'Adding…' : 'Add expense'}
        </button>
      </form>
    </section>
  );
}

function dueLabel(u) {
  if (u.daysAway === 0) return 'Today';
  if (u.daysAway === 1) return 'Tomorrow';
  return dateLabel(u.due);
}

function BillsCard({ s, onToggle }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Bills this week</h2>
        <span className="muted small num">{s.upcomingTotal > 0 ? `${fmt(s.upcomingTotal)} still to go` : 'All set'}</span>
      </div>
      {s.upcoming.length === 0 ? (
        <p className="empty">Nothing charges in the next 7 days.</p>
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
                  {u.card ? ' · Apple Card' : ''}
                  {u.split ? ` · your share of ${fmt(u.full)}` : ''}
                </div>
              </div>
              <div className="num bill-amt">{fmt(u.cost)}</div>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small note">Bills tick themselves on their charge day. Tick one early if you paid it already.</p>
    </section>
  );
}

function WatchCard({ s }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Running hot</h2>
        <span className="muted small">{s.watch.length ? `${s.watch.length} of ${s.categories.length} categories` : 'This month'}</span>
      </div>
      {s.watch.length === 0 ? (
        <p className="empty">Every category is on pace.</p>
      ) : (
        <ul className="list">
          {s.watch.map((c) => (
            <li key={c.name} className="cat">
              <div className="row-between">
                <span className="cat-name">{c.name}</span>
                <span className="num small">
                  {fmt0(c.spent)} <span className="muted">/ {fmt0(c.budget)}</span>
                </span>
              </div>
              <Bar spent={c.spent} budget={c.budget} frac={s.pacing.frac} status={c.status} />
              <Pill status={c.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Sections of the News tab, in order. Keys match news.json (written by scripts/fetch-news.mjs).
const NEWS_TABS = [
  ['politics', 'US politics', 'AP and Reuters, U.S. coverage', ['ap', 'reuters']],
  ['nyc', 'NYC', 'NYC politics: Gothamist, THE CITY, City & State, Politico New York, amNY, Daily News, plus Mamdani coverage', ['nyc', 'mamdani']],
  ['tech', 'Tech & AI', 'The Verge, Ars Technica, TechCrunch, Wired, Reuters tech', ['tech', 'ai']],
  ['reddit', 'Reddit', 'Top posts on r/popular today', ['reddit']],
  ['pop', 'Pop culture', 'Variety, The Hollywood Reporter, Vulture, Entertainment Weekly', ['pop']],
  ['music', 'Music', 'Pitchfork, Billboard, Stereogum, Rolling Stone, Guitar World', ['music']],
  ['markets', 'Markets', 'Energy, quantum computing and robotics from Reuters, CNBC, Bloomberg, Barron’s, TechCrunch and trade press', ['energy', 'quantum', 'robotics']],
];

function NewsPage({ news, read, markRead, markAllRead }) {
  const [tab, setTab] = useState(() => {
    const t = lsGet('dash.newsTab', 'politics');
    return NEWS_TABS.some(([k]) => k === t) ? t : 'politics';
  });
  const [limit, setLimit] = useState(20);
  useEffect(() => lsSet('dash.newsTab', tab), [tab]);
  const items = (news && news[tab]) || [];
  const unread = (k) => ((news && news[k]) || []).filter((i) => !read.has(i.id)).length;
  const shown = items.slice(0, limit);
  const cur = NEWS_TABS.find(([k]) => k === tab);
  const st = (news && news.sources) || {};
  const failed = cur[3].some((k) => st[k] && !st[k].ok);
  return (
    <div className="home news-page">
      <header className="page-head row-between">
        <div>
          <h1 className="page-title">News</h1>
          <div className="muted">{news && news.generated ? `Updated ${timeAgo(news.generated)}` : 'Loading…'}</div>
        </div>
        {items.some((i) => !read.has(i.id)) ? (
          <button className="btn quiet small" onClick={() => markAllRead(items)}>
            Mark all read
          </button>
        ) : null}
      </header>
      <section className="card news">
        <div className="seg news-tabs" role="tablist">
          {NEWS_TABS.map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className={`seg-btn tab ${tab === k ? 'on' : ''}`}
              onClick={() => {
                setTab(k);
                setLimit(20);
              }}
            >
              {l}
              {unread(k) ? <span className="count">{unread(k)}</span> : null}
            </button>
          ))}
        </div>
        {!news ? (
          <p className="empty">Loading…</p>
        ) : items.length === 0 ? (
          <p className="empty">{news.error ? 'The news feed hasn’t been generated yet.' : 'Nothing here yet. This section fills in on the next update, within about 30 minutes.'}</p>
        ) : (
          <ul className="list">
            {shown.map((i) => (
              <li key={i.id}>
                <a className={`story ${read.has(i.id) ? 'read' : ''}`} href={i.url} target="_blank" rel="noopener" onClick={() => markRead(i.id)}>
                  {i.image ? <img className="thumb" src={i.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
                  <div className="grow">
                    <div className="story-title">
                      {!read.has(i.id) ? <span className="dot" /> : null}
                      {i.title}
                    </div>
                    <div className="muted small">
                      {i.tag ? <span className={`tag tag-theme th-${String(i.tag).toLowerCase().replace(/[^a-z]/g, '')}`}>{i.tag}</span> : null}
                      {i.source}
                      {i.date ? ` · ${timeAgo(i.date)}` : ''}
                      {i.comments ? ` · ${i.comments}` : ''}
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
        {items.length > limit ? (
          <button className="btn quiet block" onClick={() => setLimit(limit + 20)}>
            Show more
          </button>
        ) : null}
        <p className="muted small note">
          {cur[2]}
          {failed ? ' · a source failed on the last run, showing the last good copy' : ''}
        </p>
      </section>
    </div>
  );
}

let homeSeen = false;
// A birthday this week moves the Birthdays card up next to the to-do list on phones.
const bdaySoon = (b, today) => upcomingBirthdays(b, today, 7).length > 0;
function Home({ user, data, onAdd, onToggle, dataError, learning, mutateLearning, cooking, recipes, home, mutateHome, onDeleteTodo, auto, recalls, health, healthYears, hk, hkYears, news, fun, guitar, mutateGuitar, sourdough, birthdays, mutateBirthdays, onBirthdays }) {
  const s = useMemo(() => (data ? homeSummary(data) : null), [data]);
  const first = String((user && user.displayName) || '').split(' ')[0];
  const place = (home && home.place) || DEFAULT_PLACE;
  const forecast = useForecast(place);
  const now = useNow();
  const day = todayISO();
  const [week, setWeek] = useState(false);
  const [intro] = useState(() => !homeSeen);
  useEffect(() => {
    homeSeen = true;
  }, []);
  // Everything the rings, streaks, insights and header read from, recomputed only when a document changes.
  const ctx = useMemo(
    () => ({ data, health, years: healthYears, hk, hkYears, learning, home, auto, fun, birthdays, today: day, now: new Date(), pick: tonightPick(cooking, recipes), demo: IS_DEMO, sport: IS_DEMO ? 'running' : 'tennis' }),
    [data, health, healthYears, hk, hkYears, learning, home, auto, fun, birthdays, cooking, recipes, day]
  );
  // Slots carry a phone order; on wide screens the two columns show as laid out.
  return (
    <div className={`home ${intro ? 'intro' : ''}`}>
      <Hero ctx={ctx} wx={forecast.s} greeting={greeting(now)} name={first} />
      {dataError ? <div className="alert">{dataError}</div> : null}
      <div className="grid home-grid">
        <div className="col">
          <div className="slot o1">
            <RingsCard ctx={ctx} onReview={() => setWeek(true)} />
          </div>
          <div className="slot o2">
            <WeekCard ctx={ctx} onOpen={() => setWeek(true)} />
          </div>
          {s ? (
            <>
              <div className="slot o5">
                <MoneyCard s={s} data={data} />
              </div>
              <div className="slot o8">
                <QuickAdd s={s} onAdd={onAdd} />
              </div>
              <div className="slot o9">
                <BillsCard s={s} onToggle={onToggle} />
              </div>
            </>
          ) : (
            <div className="slot o5">{dataError ? <section className="card"><p className="empty">Budget data unavailable.</p></section> : <Skeleton lines={4} tall />}</div>
          )}
          <div className="slot o7">
            <InsightsCard ctx={ctx} />
          </div>
          <div className="slot o11">
            <HeatmapCard ctx={ctx} />
          </div>
          {s ? (
            <div className="slot o12">
              <WatchCard s={s} />
            </div>
          ) : null}
        </div>
        <div className="col">
          <div className="slot o3">
            <WeatherCard place={place} forecast={forecast} onPlace={(p) => mutateHome((d) => (d.place = p), `Weather set to ${p.name}`)} />
          </div>
          <div className="slot o4">
            <TodoCard data={home} mutate={mutateHome} onDelete={onDeleteTodo} />
          </div>
          {birthdays && birthdays.people.length ? (
            <div className={`slot ${bdaySoon(birthdays, day) ? 'o4' : 'o15'}`}>
              <BirthdaysCard data={birthdays} mutate={mutateBirthdays} onManage={onBirthdays} />
            </div>
          ) : null}
          <div className="slot o6">
            <HealthHomeCard health={health} years={healthYears} hk={hk} hkYears={hkYears} />
          </div>
          <div className="slot o10">
            <AutoHomeCard auto={auto} data={data} recalls={recalls} />
          </div>
          <div className="slot o13">
            <LearningHomeCard data={learning} mutate={mutateLearning} guitar={guitar} mutateGuitar={mutateGuitar} />
          </div>
          <div className="slot o14">
            <CookingHomeCard data={cooking} recipes={recipes} sourdough={sourdough} />
          </div>
          {data ? (
            <div className="slot o12">
              <PortfolioCard data={data} news={news} />
            </div>
          ) : null}
          {birthdays && !birthdays.people.length ? (
            <div className="slot o15">
              <BirthdaysCard data={birthdays} mutate={mutateBirthdays} onManage={onBirthdays} />
            </div>
          ) : null}
        </div>
      </div>
      {week ? <WeekSheet ctx={ctx} onClose={() => setWeek(false)} /> : null}
    </div>
  );
}

function BudgetFrame({ visible }) {
  return (
    <div className={`frame-wrap ${visible ? '' : 'hidden'}`}>
      <iframe className="frame" src={budgetSrc} title="Budget" />
    </div>
  );
}

// A slim bar across the top in demo mode: what this is, start over, or leave.
function DemoBar() {
  const [ask, setAsk] = useState(false);
  return (
    <div className="demo-bar" role="region" aria-label="Demo mode">
      <span className="demo-tag">Demo</span>
      {ask ? (
        <>
          <span className="grow">Start over with fresh sample data?</span>
          <button className="demo-btn" onClick={resetDemo}>
            Reset
          </button>
          <button className="demo-btn" onClick={() => setAsk(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="grow">
            <span className="demo-long">Sample data for a made-up person. Try anything: changes stay in this browser and nothing is real.</span>
            <span className="demo-short">Sample data</span>
          </span>
          <button className="demo-btn" onClick={() => setAsk(true)}>
            Reset
          </button>
          <button className="demo-btn" onClick={exitDemo}>
            {EXIT_LABEL}
          </button>
        </>
      )}
    </div>
  );
}

function Settings({ user, onClose, onToast }) {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(demoLink());
      onToast({ text: 'Demo link copied' });
    } catch {
      onToast({ text: `Demo link: ${demoLink()}` });
    }
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <h2 className="card-title">Settings</h2>
        {IS_DEMO ? (
          <p className="muted small">
            {FROM_ACCOUNT ? 'You’re in demo mode' : 'This is the demo'}: sample data for a made-up person, kept only in this browser. Nothing here touches {FROM_ACCOUNT ? 'your account' : 'an account'}.
          </p>
        ) : (
          <p className="muted small">Signed in as {user.email}. Only this account can open the dashboard.</p>
        )}
        {IS_DEMO ? (
          <button className="btn primary block" onClick={exitDemo}>
            {EXIT_LABEL}
          </button>
        ) : null}
        <a className="btn quiet block" href={budgetSrc} target="_blank" rel="noopener">
          Open budget in its own tab <Icon name="ext" size={16} />
        </a>
        {IS_DEMO ? (
          <button className="btn quiet block" onClick={resetDemo}>
            Reset the demo data
          </button>
        ) : (
          <>
            <div className="settings-demo">
              <h3 className="settings-sub">Demo mode</h3>
              <p className="muted small">The whole dashboard with sample data for a made-up person, for showing it to someone or taking screenshots. Your data stays put, and you can switch back anytime.</p>
              <button className="btn quiet block" onClick={() => enterDemo(true)}>
                Switch to demo mode
              </button>
              <button className="btn quiet block" onClick={copyLink}>
                Copy the demo link
              </button>
            </div>
            <button className="btn quiet block" onClick={() => backend.signOut()}>
              Sign out
            </button>
          </>
        )}
        <p className="muted small">Build {window.__BUILD || 'dev'}</p>
        <button className="btn primary block" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function DemoOffer() {
  return (
    <div className="demo-offer">
      <p className="muted small">Just looking? The demo shows everything with sample data. No sign-in needed.</p>
      <button className="btn quiet" onClick={() => enterDemo(false)}>
        Try the demo
      </button>
    </div>
  );
}

function Gate({ user, error }) {
  const [msg, setMsg] = useState('');
  return (
    <div className="gate">
      <div className="gate-box">
        <h1 className="page-title">Dashboard</h1>
        {user ? (
          <>
            <p>{user.email} doesn’t have access to this dashboard.</p>
            <button className="btn quiet" onClick={() => backend.signOut()}>
              Sign out
            </button>
            <DemoOffer />
          </>
        ) : (
          <>
            <p className="muted">Sign in to open it. Nothing is shown until you do.</p>
            <button
              className="btn primary"
              onClick={() => backend.signIn().catch((e) => setMsg('Sign-in didn’t finish. Allow pop-ups for this site, or open it directly in Safari or Chrome, and try again.'))}
            >
              Sign in with Google
            </button>
            <DemoOffer />
          </>
        )}
        {msg || error ? <p className="alert">{msg || error}</p> : null}
      </div>
    </div>
  );
}

// Fill in any missing fields on a stored module document before a change is applied to it.
function inPlace(normalizeFn) {
  return (d) => {
    const n = normalizeFn(d);
    Object.keys(n).forEach((k) => (d[k] = n[k]));
    return d;
  };
}
const normalizeLearningInPlace = inPlace(normalizeLearning);
const normalizeCookingInPlace = inPlace(normalizeCooking);
const normalizeHomeInPlace = inPlace(normalizeHome);
const normalizeAutoInPlace = inPlace(normalizeAuto);
const normalizeHealthInPlace = inPlace(H.normalizeHealth);
const normalizeYearInPlace = inPlace(H.normalizeYear);
const normalizeHkInPlace = inPlace(HK.normalizeHk);
const normalizeHkYearInPlace = inPlace(HK.normalizeHkYear);

// The newer modules (Entertainment, Guitar, Sourdough, Birthdays) share one pattern: a document per module,
// normalized on the way in and before every change.
const MODULES = {
  fun: [normalizeFun, defaultFun, 'Entertainment'],
  guitar: [normalizeGuitar, defaultGuitar, 'guitar practice'],
  sourdough: [normalizeSourdough, defaultSourdough, 'the sourdough corner'],
  birthdays: [normalizeBirthdays, defaultBirthdays, 'birthdays'],
};
function useModuleDoc(allowed, user, name) {
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!allowed) return;
    const [norm, , label] = MODULES[name];
    return backend.subscribeModule(
      user,
      name,
      (d) => {
        setDoc(norm(d));
        setErr('');
      },
      (e) => {
        setErr(`Couldn’t load ${label}: ${e.message || e}`);
        setDoc((x) => x || norm(null));
      }
    );
  }, [allowed, user && user.uid]);
  return [doc, err];
}

// ---------------------------------------------------------------- app
function App() {
  const route = useRoute();
  const [user, setUser] = useState(undefined);
  const [data, setData] = useState(null);
  const [dataError, setDataError] = useState('');
  const [news, setNews] = useState(null);
  const [read, setRead] = useState(() => new Set(lsGet('dash.read', [])));
  const [toast, setToast] = useState(null);
  const [settings, setSettings] = useState(false);
  const [budgetOpened, setBudgetOpened] = useState(route === 'budget');
  const [learning, setLearning] = useState(null);
  const [learningError, setLearningError] = useState('');
  const [cooking, setCooking] = useState(null);
  const [cookingError, setCookingError] = useState('');
  const [recipes, setRecipes] = useState(null);
  const [shopping, setShopping] = useState(false);
  const [home, setHome] = useState(null);
  const [auto, setAuto] = useState(null);
  const [health, setHealth] = useState(null);
  const [healthYears, setHealthYears] = useState(null);
  const [healthError, setHealthError] = useState('');
  const [hk, setHk] = useState(null);
  const [hkYears, setHkYears] = useState(null);
  const [more, setMore] = useState(false);
  const [autoError, setAutoError] = useState('');
  const recalls = useRecalls(auto ? auto.car : null);
  const [budgetRev, setBudgetRev] = useState(0);
  const [bdaySheet, setBdaySheet] = useState(false);
  useEffect(() => (backend.onBudgetWrite ? backend.onBudgetWrite(() => setBudgetRev((n) => n + 1)) : undefined), []);

  useEffect(() => backend.onAuth((u) => setUser(u || null)), []);
  const allowed = user && backend.isAllowed(user);
  const [fun, funError] = useModuleDoc(allowed, user, 'fun');
  const [guitar] = useModuleDoc(allowed, user, 'guitar');
  const [sourdough] = useModuleDoc(allowed, user, 'sourdough');
  const [birthdays] = useModuleDoc(allowed, user, 'birthdays');

  useEffect(() => {
    if (!allowed) return;
    return backend.subscribeBudget(
      user,
      (d) => {
        setData(d);
        setDataError(d ? '' : 'No budget data found for this account yet.');
      },
      (e) => setDataError(`Couldn’t load the budget: ${e.message || e}`)
    );
  }, [allowed, user && user.uid]);

  useEffect(() => {
    if (!allowed) return;
    return backend.subscribeModule(
      user,
      'learning',
      (d) => {
        setLearning(normalizeLearning(d)); // nothing saved yet → the default roadmap
        setLearningError('');
      },
      (e) => setLearningError(`Couldn’t load learning progress: ${e.message || e}`)
    );
  }, [allowed, user && user.uid]);

  useEffect(() => {
    if (!allowed) return;
    return backend.subscribeModule(
      user,
      'cooking',
      (d) => {
        setCooking(normalizeCooking(d)); // nothing saved yet → empty kitchen, two starter recipes
        setCookingError('');
      },
      (e) => setCookingError(`Couldn’t load the kitchen: ${e.message || e}`)
    );
  }, [allowed, user && user.uid]);

  useEffect(() => {
    if (!allowed) return;
    return backend.subscribeModule(
      user,
      'home',
      (d) => setHome(normalizeHome(d)), // nothing saved yet → Dix Hills weather, empty to-do list
      () => setHome((h) => h || defaultHome())
    );
  }, [allowed, user && user.uid]);

  useEffect(() => {
    if (!allowed) return;
    return backend.subscribeModule(
      user,
      'auto',
      (d) => {
        setAuto(normalizeAuto(d)); // nothing saved yet → the Altima with today's mileage and sticker dates
        setAutoError('');
      },
      (e) => setAutoError(`Couldn’t load the car: ${e.message || e}`)
    );
  }, [allowed, user && user.uid]);

  // Health: the main document plus this year's and last year's day logs.
  useEffect(() => {
    if (!allowed) return;
    const year = H.todayISO().slice(0, 4);
    const years = [year, String(Number(year) - 1)];
    const got = {};
    const push = () => years.every((y) => got[y]) && setHealthYears({ ...got });
    const offs = [
      backend.subscribeModule(
        user,
        'health',
        (d) => {
          setHealth(H.normalizeHealth(d));
          setHealthError('');
        },
        (e) => setHealthError(`Couldn’t load health data: ${e.message || e}`)
      ),
      ...years.map((y) =>
        backend.subscribeModule(
          user,
          `health-${y}`,
          (d) => {
            got[y] = H.normalizeYear(d);
            push();
          },
          (e) => setHealthError(`Couldn’t load health data: ${e.message || e}`)
        )
      ),
    ];
    return () => offs.forEach((f) => f && f());
  }, [allowed, user && user.uid]);

  // Apple Health imports: the summary document plus this year's and last year's days.
  useEffect(() => {
    if (!allowed) return;
    const year = H.todayISO().slice(0, 4);
    const years = [year, String(Number(year) - 1)];
    const got = {};
    const push = () => years.every((y) => got[y]) && setHkYears({ ...got });
    const offs = [
      backend.subscribeModule(user, 'health-hk', (d) => setHk(HK.normalizeHk(d)), () => setHk((h) => h || HK.defaultHk())),
      ...years.map((y) =>
        backend.subscribeModule(
          user,
          `health-hk-${y}`,
          (d) => {
            got[y] = HK.normalizeHkYear(d);
            push();
          },
          () => {
            got[y] = got[y] || HK.defaultHkYear();
            push();
          }
        )
      ),
    ];
    return () => offs.forEach((f) => f && f());
  }, [allowed, user && user.uid]);

  // Weekly recipe file written by the recipes job; loaded once per visit.
  useEffect(() => {
    if (!allowed) return;
    fetch(`recipes.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then(setRecipes)
      .catch(() => setRecipes({ picks: [], pool: [], common: null, source: { ok: false } }));
  }, [allowed]);

  const loadNews = useCallback(() => {
    fetch(`news.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then(setNews)
      .catch((e) => setNews({ error: String(e.message || e) }));
  }, []);
  useEffect(() => {
    if (!allowed) return;
    loadNews();
    const on = () => document.visibilityState === 'visible' && loadNews();
    document.addEventListener('visibilitychange', on);
    const t = setInterval(loadNews, 10 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', on);
      clearInterval(t);
    };
  }, [allowed, loadNews]);

  useEffect(() => {
    if (route === 'budget') setBudgetOpened(true);
    window.scrollTo(0, 0);
  }, [route]);

  const saveRead = (set) => {
    lsSet('dash.read', [...set].slice(-1500));
    setRead(new Set(set));
  };
  const markRead = (id) => {
    if (read.has(id)) return;
    const n = new Set(read);
    n.add(id);
    saveRead(n);
  };
  const markAllRead = (items) => {
    const n = new Set(read);
    items.forEach((i) => n.add(i.id));
    saveRead(n);
  };

  const toastTimer = useRef(null);
  const showToast = (t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  const onAdd = async (t) => {
    try {
      await backend.mutateBudget(user, (d) => addTransaction(d, t));
      showToast({
        text: `Added ${fmt(t.amount)} to ${t.category}${keyOf(t.date) !== keyOf(todayISO()) ? ` (${keyOf(t.date)})` : ''}`,
        undo: async () => {
          await backend.mutateBudget(user, (d) => {
            const m = d.months && d.months[keyOf(t.date)];
            if (m) m.transactions = m.transactions.filter((x) => x.id !== t.id);
          });
          showToast({ text: 'Removed' });
        },
      });
      return true;
    } catch (e) {
      showToast({ text: navigator.onLine === false ? 'You’re offline. Try again when you’re connected.' : `Couldn’t save: ${e.message || e}`, error: true });
      return false;
    }
  };
  const mutateLearning = async (fn, msg) => {
    try {
      await backend.mutateModule(user, 'learning', (d) => fn(normalizeLearningInPlace(d)), defaultLearning);
      if (msg) showToast({ text: msg });
    } catch (e) {
      showToast({ text: navigator.onLine === false ? 'You’re offline. Try again when you’re connected.' : `Couldn’t save: ${e.message || e}`, error: true });
    }
  };
  const mutateCooking = async (fn, msg) => {
    try {
      await backend.mutateModule(user, 'cooking', (d) => fn(normalizeCookingInPlace(d)), defaultCooking);
      if (msg) showToast({ text: msg });
    } catch (e) {
      showToast({ text: navigator.onLine === false ? 'You’re offline. Try again when you’re connected.' : `Couldn’t save: ${e.message || e}`, error: true });
    }
  };
  const mutateHome = async (fn, msg) => {
    try {
      await backend.mutateModule(user, 'home', (d) => fn(normalizeHomeInPlace(d)), defaultHome);
      if (msg) showToast({ text: msg });
    } catch (e) {
      showToast({ text: navigator.onLine === false ? 'You’re offline. Try again when you’re connected.' : `Couldn’t save: ${e.message || e}`, error: true });
    }
  };
  const mutateAuto = async (fn, msg) => {
    try {
      await backend.mutateModule(user, 'auto', (d) => fn(normalizeAutoInPlace(d)), defaultAuto);
      if (msg) showToast({ text: msg });
    } catch (e) {
      showToast({ text: navigator.onLine === false ? 'You’re offline. Try again when you’re connected.' : `Couldn’t save: ${e.message || e}`, error: true });
    }
  };
  const saveErr = (e) => showToast({ text: navigator.onLine === false ? 'You’re offline. Try again when you’re connected.' : `Couldn’t save: ${e.message || e}`, error: true });
  const mutateDoc = (name) => async (fn, msg) => {
    const [norm, def] = MODULES[name];
    try {
      await backend.mutateModule(user, name, (d) => fn(inPlace(norm)(d)), def);
      if (msg) showToast(typeof msg === 'string' ? { text: msg } : msg);
      return true;
    } catch (e) {
      saveErr(e);
      return false;
    }
  };
  const mutateFun = mutateDoc('fun');
  const mutateGuitar = mutateDoc('guitar');
  const mutateSourdough = mutateDoc('sourdough');
  const mutateBirthdays = mutateDoc('birthdays');
  const mutateHealth = async (fn, msg) => {
    try {
      await backend.mutateModule(user, 'health', (d) => fn(normalizeHealthInPlace(d)), H.defaultHealth);
      if (msg) showToast({ text: msg });
      return true;
    } catch (e) {
      saveErr(e);
      return false;
    }
  };
  const mutateYear = async (iso, fn, msg) => {
    try {
      await backend.mutateModule(user, `health-${H.yearOf(iso)}`, (d) => fn(normalizeYearInPlace(d)), H.defaultYear);
      if (msg) showToast(typeof msg === 'string' ? { text: msg } : msg);
      return true;
    } catch (e) {
      saveErr(e);
      return false;
    }
  };
  const healthAct = {
    mutateHealth: (fn) => mutateHealth(fn),
    async logFood(iso, food, portion, qty, meal) {
      const entry = H.entryFor(food, portion, qty, meal);
      await mutateHealth((h) => H.remember(h, food, portion, qty));
      await mutateYear(iso, (y) => H.addEntry(y, iso, entry), {
        text: `${entry.name} · ${entry.k} cal added to ${(H.MEALS.find((m) => m[0] === meal) || [])[1] || 'today'}`,
        undo: async () => {
          await mutateYear(iso, (y) => H.removeEntry(y, iso, entry.id));
          setToast(null);
        },
      });
    },
    async deleteEntry(iso, entry) {
      await mutateYear(iso, (y) => H.removeEntry(y, iso, entry.id), {
        text: `Removed ${entry.name}`,
        undo: async () => {
          await mutateYear(iso, (y) => H.addEntry(y, iso, entry));
          setToast(null);
        },
      });
    },
    async updateEntry(iso, id, { food, portion, qty, meal }) {
      if (food) await mutateHealth((h) => H.remember(h, food, portion, qty));
      await mutateYear(iso, (y) => H.updateEntry(y, iso, id, food, portion, qty, meal));
    },
    copyMeal: (iso, fromDay, meal) => mutateYear(iso, (y) => H.copyMeal(fromDay, y, iso, meal), `Copied yesterday’s ${meal === 'snack' ? 'snacks' : meal}`),
    setSteps: (iso, v) => mutateYear(iso, (y) => H.setSteps(y, iso, v)),
    addWorkout: (iso, w) => mutateYear(iso, (y) => H.addWorkout(y, iso, w), 'Workout logged'),
    removeWorkout: (iso, id) => mutateYear(iso, (y) => H.removeWorkout(y, iso, id)),
    logWeight: (n) => mutateHealth((h) => H.logWeight(h, n), `Logged ${n} lb`),
    removeWeight: (date) => mutateHealth((h) => H.removeWeight(h, date)),
    // Save a parsed Apple Health export: each year's days, ECGs, routes, weigh-ins, then the summary last
    // (so "imported" only shows once everything else is in).
    async importAppleHealth(bundle) {
      const plan = HK.planImport(bundle);
      for (const y of plan.summary.years) {
        await backend.mutateModule(user, `health-hk-${y}`, (d) => plan.years[y](normalizeHkYearInPlace(d)), HK.defaultHkYear);
      }
      await backend.mutateModule(user, 'health-hk-ecg', plan.ecg, () => ({ version: 1, traces: {} }));
      await backend.mutateModule(user, 'health-hk-routes', plan.routes, () => ({ version: 1, routes: {} }));
      let res = { added: 0, filled: [] };
      await backend.mutateModule(user, 'health', (d) => (res = plan.health(normalizeHealthInPlace(d))), H.defaultHealth);
      await backend.mutateModule(user, 'health-hk', (d) => plan.main(normalizeHkInPlace(d)), HK.defaultHk);
      showToast({ text: 'Apple Health data imported' });
      return { ...plan.summary, ...res, first: bundle.first, last: bundle.last };
    },
    // One-time read of a document that isn't kept live (ECG traces, workout routes).
    loadDoc: (name) =>
      new Promise((resolve, reject) => {
        let off = null;
        let done = false;
        off = backend.subscribeModule(
          user,
          name,
          (d) => {
            if (done) return;
            done = true;
            resolve(d);
            setTimeout(() => off && off(), 0);
          },
          (e) => {
            done = true;
            reject(e);
          }
        );
      }),
  };
  // Log one serving of a Budget Bytes recipe (from the Cooking tab) to today's food.
  const logRecipe = (r) => {
    const [k, p, c, f] = r.nutrition;
    const food = { name: r.title, src: 'bb', ref: String(r.webId || r.id), perServing: { k, p, c, f }, portions: [{ label: '1 serving', mult: 1 }] };
    return healthAct.logFood(H.todayISO(), food, food.portions[0], 1, H.mealNow());
  };
  const autoBudget = useMemo(() => {
    if (!data) return null;
    const s = homeSummary(data);
    return { methods: s.methods, category: s.categoryNames.find((n) => /gas|auto/i.test(n)) || s.categoryNames[0] };
  }, [data]);
  const onDeleteTodo = async (t) => {
    let removed = null;
    await mutateHome((d) => (removed = removeTodo(d, t.id)));
    showToast({
      text: 'To-do deleted',
      undo: async () => {
        if (removed) await mutateHome((d) => restoreTodo(d, removed.item, removed.index));
        setToast(null);
      },
    });
  };
  // Finish a shop: log the total under Groceries in the budget (optional) and put the ticked items away.
  const budgetInfo = useMemo(() => {
    if (!data) return null;
    const s = homeSummary(data);
    return { methods: s.methods, category: groceriesCategory(s.categoryNames) };
  }, [data]);
  const finishShop = async (entry) => {
    const before = cooking ? { kitchen: cooking.kitchen, grocery: cooking.grocery } : null;
    const count = cooking ? cooking.grocery.filter((g) => g.done).length : 0;
    let t = null;
    try {
      if (entry && budgetInfo) {
        t = newTransaction({ date: entry.date, desc: entry.desc.trim() || 'Groceries', category: budgetInfo.category, amount: entry.amount, method: entry.method });
        await backend.mutateBudget(user, (d) => addTransaction(d, t));
      }
      await backend.mutateModule(user, 'cooking', (d) => putAway(normalizeCookingInPlace(d)), defaultCooking);
      setShopping(false);
      showToast({
        text: `${t ? `Logged ${fmt(t.amount)} to ${t.category} · ` : ''}${count} put away`,
        undo: async () => {
          if (t)
            await backend.mutateBudget(user, (d) => {
              const m = d.months && d.months[keyOf(t.date)];
              if (m) m.transactions = m.transactions.filter((x) => x.id !== t.id);
            });
          if (before)
            await backend.mutateModule(user, 'cooking', (d) => {
              normalizeCookingInPlace(d);
              d.kitchen = before.kitchen;
              d.grocery = before.grocery;
            }, defaultCooking);
          showToast({ text: 'Undone' });
        },
      });
    } catch (e) {
      showToast({ text: navigator.onLine === false ? 'You’re offline. Try again when you’re connected.' : `Couldn’t save: ${e.message || e}`, error: true });
    }
  };

  const onToggle = async (u) => {
    try {
      await backend.mutateBudget(user, (d) => toggleBillPaid(d, u.key, u.id));
    } catch (e) {
      showToast({ text: `Couldn’t update ${u.name}: ${e.message || e}`, error: true });
    }
  };

  if (user === undefined) return <div className="gate"><p className="muted">Loading…</p></div>;
  if (!allowed) return <Gate user={user} />;

  // On phones the bar shows Home, News, Budget and Health; the rest sit behind More.
  const EXTRA = ['fun', 'learning', 'cooking', 'auto'];
  const nav = (to, icon, label) => (
    <a className={`nav-item ${route === to ? 'active' : ''} ${EXTRA.includes(to) ? 'nav-extra' : ''}`} href={`#/${to === 'home' ? '' : to}`}>
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  );

  return (
    <div className={`app ${route === 'budget' ? 'on-budget' : ''} ${IS_DEMO ? 'demo' : ''}`}>
      {IS_DEMO ? <DemoBar /> : null}
      <nav className="nav">
        <div className="brand">Dashboard</div>
        {nav('home', 'home', 'Home')}
        {nav('news', 'news', 'News')}
        {nav('budget', 'budget', 'Budget')}
        {nav('health', 'heart', 'Health')}
        {nav('fun', 'game', 'Entertainment')}
        {nav('learning', 'learn', 'Learning')}
        {nav('cooking', 'pot', 'Cooking')}
        {nav('auto', 'car', 'Auto')}
        <button className="nav-item nav-settings nav-extra" onClick={() => setSettings(true)} aria-label="Settings">
          <Icon name="gear" />
          <span>Settings</span>
        </button>
        <button className={`nav-item nav-more ${EXTRA.includes(route) ? 'active' : ''}`} onClick={() => setMore(true)} aria-label="More">
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>
      <main className="main">
        {route === 'learning' ? <LearningPage data={learning} mutate={mutateLearning} error={learningError} guitar={guitar} mutateGuitar={mutateGuitar} /> : null}
        {route === 'cooking' ? (
          <CookingPage data={cooking} recipes={recipes} mutate={mutateCooking} error={cookingError} onFinishShop={() => setShopping(true)} onLogRecipe={logRecipe} sourdough={sourdough} mutateSourdough={mutateSourdough} />
        ) : null}
        {route === 'fun' ? <FunPage data={fun} mutate={mutateFun} error={funError} news={news} read={read} markRead={markRead} /> : null}
        {route === 'news' ? <NewsPage news={news} read={read} markRead={markRead} markAllRead={markAllRead} /> : null}
        {route === 'auto' ? (
          <AutoPage auto={auto} data={data} recalls={recalls} mutate={mutateAuto} budget={autoBudget} onAddExpense={(d) => onAdd(newTransaction(d))} error={autoError} />
        ) : null}
        {route === 'health' ? <HealthPage health={health} years={healthYears} hk={hk} hkYears={hkYears} act={healthAct} error={healthError} /> : null}
        {['budget', 'learning', 'cooking', 'news', 'auto', 'health', 'fun'].includes(route) ? null : (
          <Home
            user={user}
            data={data}
            dataError={dataError}
            onAdd={onAdd}
            onToggle={onToggle}
            learning={learning}
            mutateLearning={mutateLearning}
            cooking={cooking}
            recipes={recipes}
            home={home}
            mutateHome={mutateHome}
            onDeleteTodo={onDeleteTodo}
            auto={auto}
            recalls={recalls}
            health={health}
            healthYears={healthYears}
            hk={hk}
            hkYears={hkYears}
            news={news}
            fun={fun}
            guitar={guitar}
            mutateGuitar={mutateGuitar}
            sourdough={sourdough}
            birthdays={birthdays}
            mutateBirthdays={mutateBirthdays}
            onBirthdays={() => setBdaySheet(true)}
          />
        )}
        {budgetOpened ? <BudgetFrame key={budgetRev} visible={route === 'budget'} /> : null}
      </main>
      {toast ? (
        <div className={`toast ${toast.error ? 'error' : ''}`} role="status">
          <span>{toast.text}</span>
          {toast.undo ? (
            <button className="toast-btn" onClick={toast.undo}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
      {settings ? <Settings user={user} onClose={() => setSettings(false)} onToast={showToast} /> : null}
      {bdaySheet && birthdays ? <BirthdaySheet data={birthdays} mutate={mutateBirthdays} onClose={() => setBdaySheet(false)} onToast={showToast} /> : null}
      {more ? (
        <div className="sheet-bg" onClick={() => setMore(false)}>
          <div className="sheet more-sheet" role="dialog" aria-label="More" onClick={(e) => e.stopPropagation()}>
            {[
              ['fun', 'game', 'Entertainment'],
              ['learning', 'learn', 'Learning'],
              ['cooking', 'pot', 'Cooking'],
              ['auto', 'car', 'Auto'],
            ].map(([to, icon, label]) => (
              <a key={to} className={`more-item ${route === to ? 'active' : ''}`} href={`#/${to}`} onClick={() => setMore(false)}>
                <Icon name={icon} /> {label}
              </a>
            ))}
            <button
              className="more-item"
              onClick={() => {
                setMore(false);
                setSettings(true);
              }}
            >
              <Icon name="gear" /> Settings
            </button>
          </div>
        </div>
      ) : null}
      {shopping && cooking ? (
        <FinishShopSheet count={cooking.grocery.filter((g) => g.done).length} budget={budgetInfo} onSubmit={finishShop} onClose={() => setShopping(false)} />
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
