import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import css from './styles.css';
import { createFirebaseBackend } from './backend.js';
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
} from './budget-logic.js';

if (!document.getElementById('dash-css')) {
  const s = document.createElement('style');
  s.id = 'dash-css';
  s.textContent = css;
  document.head.appendChild(s);
}

// Tests inject a stand-in backend; the live site always uses Firebase.
const backend = window.__DASH_BACKEND__ || createFirebaseBackend();

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
function Icon({ name, size = 22 }) {
  const p = {
    home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    budget: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    gear: 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={p} />
    </svg>
  );
}

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
function MoneyCard({ s }) {
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
          <div className={`big num ${s.left < 0 ? 'neg' : ''}`}>{fmt(Math.abs(s.left))}</div>
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

function NewsCard({ news, read, markRead, markAllRead }) {
  const [tab, setTab] = useState(() => lsGet('dash.newsTab', 'politics'));
  const [limit, setLimit] = useState(12);
  useEffect(() => lsSet('dash.newsTab', tab), [tab]);
  const items = (news && news[tab]) || [];
  const unread = (k) => ((news && news[k]) || []).filter((i) => !read.has(i.id)).length;
  const shown = items.slice(0, limit);
  const tabs = [
    ['politics', 'US politics'],
    ['reddit', 'Reddit'],
  ];
  const st = (news && news.sources) || {};
  return (
    <section className="card news">
      <div className="card-head">
        <h2 className="card-title">News</h2>
        {items.some((i) => !read.has(i.id)) ? (
          <button className="btn quiet small" onClick={() => markAllRead(items)}>
            Mark all read
          </button>
        ) : null}
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setLimit(12); }}>
            {l}
            {unread(k) ? <span className="count">{unread(k)}</span> : null}
          </button>
        ))}
      </div>
      {!news ? (
        <p className="empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">{news.error ? 'The news feed hasn’t been generated yet. It fills in after the first scheduled run.' : 'Nothing here right now.'}</p>
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
        <button className="btn quiet block" onClick={() => setLimit(limit + 12)}>
          Show more
        </button>
      ) : null}
      <p className="muted small note">
        {news && news.generated ? `Updated ${timeAgo(news.generated)}` : ''}
        {tab === 'politics' ? ' · AP and Reuters, U.S. coverage' : ' · Top posts on r/popular today'}
        {st && ((tab === 'reddit' && st.reddit && !st.reddit.ok) || (tab === 'politics' && ((st.ap && !st.ap.ok) || (st.reuters && !st.reuters.ok))))
          ? ' · a source failed on the last run, showing the last good copy'
          : ''}
      </p>
    </section>
  );
}

function Home({ user, data, onAdd, onToggle, news, read, markRead, markAllRead, dataError }) {
  const s = useMemo(() => (data ? homeSummary(data) : null), [data]);
  const first = String((user && user.displayName) || '').split(' ')[0];
  return (
    <div className="home">
      <header className="page-head">
        <h1 className="page-title">
          {greeting()}
          {first ? `, ${first}` : ''}
        </h1>
        <div className="muted">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </header>
      {dataError ? <div className="alert">{dataError}</div> : null}
      <div className="grid">
        <div className="col">
          {s ? (
            <>
              <MoneyCard s={s} />
              <QuickAdd s={s} onAdd={onAdd} />
              <BillsCard s={s} onToggle={onToggle} />
              <WatchCard s={s} />
            </>
          ) : (
            <section className="card">
              <p className="empty">{dataError ? 'Budget data unavailable.' : 'Loading your budget…'}</p>
            </section>
          )}
        </div>
        <div className="col">
          <NewsCard news={news} read={read} markRead={markRead} markAllRead={markAllRead} />
        </div>
      </div>
    </div>
  );
}

function BudgetFrame({ visible }) {
  return (
    <div className={`frame-wrap ${visible ? '' : 'hidden'}`}>
      <iframe className="frame" src="budget.html" title="Budget" />
    </div>
  );
}

function Settings({ user, onClose }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <h2 className="card-title">Settings</h2>
        <p className="muted small">Signed in as {user.email}. Only this account can open the dashboard.</p>
        <a className="btn quiet block" href="budget.html" target="_blank" rel="noopener">
          Open budget in its own tab <Icon name="ext" size={16} />
        </a>
        <button className="btn quiet block" onClick={() => backend.signOut()}>
          Sign out
        </button>
        <p className="muted small">Build {window.__BUILD || 'dev'}</p>
        <button className="btn primary block" onClick={onClose}>
          Done
        </button>
      </div>
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
          </>
        )}
        {msg || error ? <p className="alert">{msg || error}</p> : null}
      </div>
    </div>
  );
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

  useEffect(() => backend.onAuth((u) => setUser(u || null)), []);
  const allowed = user && backend.isAllowed(user);

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

  const loadNews = useCallback(() => {
    fetch(`news.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then(setNews)
      .catch((e) => setNews({ politics: [], reddit: [], error: String(e.message || e) }));
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
  const onToggle = async (u) => {
    try {
      await backend.mutateBudget(user, (d) => toggleBillPaid(d, u.key, u.id));
    } catch (e) {
      showToast({ text: `Couldn’t update ${u.name}: ${e.message || e}`, error: true });
    }
  };

  if (user === undefined) return <div className="gate"><p className="muted">Loading…</p></div>;
  if (!allowed) return <Gate user={user} />;

  const nav = (to, icon, label) => (
    <a className={`nav-item ${route === to ? 'active' : ''}`} href={`#/${to === 'home' ? '' : to}`}>
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  );

  return (
    <div className={`app ${route === 'budget' ? 'on-budget' : ''}`}>
      <nav className="nav">
        <div className="brand">Dashboard</div>
        {nav('home', 'home', 'Home')}
        {nav('budget', 'budget', 'Budget')}
        <button className="nav-item nav-settings" onClick={() => setSettings(true)} aria-label="Settings">
          <Icon name="gear" />
          <span>Settings</span>
        </button>
      </nav>
      <main className="main">
        {route === 'budget' ? null : (
          <Home user={user} data={data} dataError={dataError} onAdd={onAdd} onToggle={onToggle} news={news} read={read} markRead={markRead} markAllRead={markAllRead} />
        )}
        {budgetOpened ? <BudgetFrame visible={route === 'budget'} /> : null}
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
      {settings ? <Settings user={user} onClose={() => setSettings(false)} /> : null}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
