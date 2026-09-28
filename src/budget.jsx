// The Budget tab, built into the dashboard (it used to be the budget app in a frame). Same document, same rules
// (budget-core.js), plus the paycheck view, spending insights, subscriptions, milestones and net worth, the Apple
// Card import, smarter adding and Venmo requests.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as C from './budget-core.js';
import * as I from './budget-insights.js';
import { CategoryMark, StatusPill, PaceBar, Money, Sheet, Kpi, isPhoneLike } from './budget-ui.jsx';
import { AddForm, MerchantInput, useMerchants } from './budget-add.jsx';
import { SwipeRow, useSwipe, Skeleton } from './fx.jsx';
import { BarChart } from './chart-kit.jsx';
import { Icon } from './ui.jsx';
import { PaycheckView, SpendingView, OutlookView, SavingsView, StocksView, YearView, SettingsView, ImportSheet } from './budget-views.jsx';

const { fmt, fmt0, pct, sum } = C;
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
export const BUDGET_VIEWS = [
  ['month', 'Month'],
  ['paycheck', 'Paycheck'],
  ['spending', 'Spending'],
  ['savings', 'Savings & card'],
  ['outlook', 'Outlook'],
  ['stocks', 'Stocks'],
  ['year', 'Year'],
  ['settings', 'Settings'],
];

export function BudgetPage({ data: raw, mutate, error, onToast, dark, auto, route, alertStatus }) {
  // A normalized copy for the screens; changes go through `upd`, which normalizes the stored copy first.
  const data = useMemo(() => (raw ? C.normalizeBudget(JSON.parse(JSON.stringify(raw))) : null), [raw]);
  const upd = (fn, msg) => mutate((d) => fn(C.normalizeBudget(d)), msg);
  const [view, setView] = useState(() => {
    const q = String(route || '').split('?')[1] || '';
    const v = new URLSearchParams(q).get('view') || lsGet('dash.budgetView', 'month');
    return BUDGET_VIEWS.some(([k]) => k === v) ? v : 'month';
  });
  useEffect(() => lsSet('dash.budgetView', view), [view]);
  const keys = data ? Object.keys(data.months).sort() : [];
  const [month, setMonth] = useState(null);
  const cur = C.todayKey();
  const monthKey = month && data && data.months[month] ? month : keys.includes(cur) ? cur : keys[keys.length - 1] || null;
  const [txnId, setTxnId] = useState(null);
  const [merchant, setMerchant] = useState(null);
  const [category, setCategory] = useState(null);
  const [importing, setImporting] = useState(false);
  // documents saved by an older budget app get the same one-time upgrade it would have run
  const upgraded = useRef(false);
  useEffect(() => {
    if (!raw || upgraded.current) return;
    if ((raw.configVersion || 0) < C.CONFIG_VERSION || (raw.historyVersion || 0) < C.HISTORY_VERSION) {
      upgraded.current = true;
      upd((d) => C.upgradeBudget(d));
    }
  }, [raw]);
  // one net worth reading a day (the latest each month is kept); waits a moment for the car's loan balance
  const recorded = useRef('');
  useEffect(() => {
    if (!data) return undefined;
    const today = C.todayISO();
    const snap = (data.netWorth || {})[C.todayKey()];
    if (recorded.current === today || (snap && snap.at === today)) return undefined;
    const go = () => {
      recorded.current = today;
      upd((d) => I.recordNetWorth(d, I.netWorth(d, { auto, today }), today));
    };
    if (auto) {
      go();
      return undefined;
    }
    const t = setTimeout(go, 5000);
    return () => clearTimeout(t);
  }, [data, auto]);
  if (!data)
    return (
      <div className="home budget">
        <header className="page-head">
          <h1 className="page-title">Budget</h1>
          <div className="muted">{error || 'Loading…'}</div>
        </header>
        {error ? null : <Skeleton lines={6} />}
      </div>
    );
  const openTxn = (id) => setTxnId(id);
  const openMerchant = (name) => setMerchant(name);
  const common = { data, upd, onToast, dark, openTxn, openMerchant };
  const sub = view === 'month' ? (monthKey ? `${C.monthLong(monthKey)}` : 'No months yet') : BUDGET_VIEWS.find(([k]) => k === view)[1];
  return (
    <div className={`home budget view-${view}`}>
      <header className="page-head row-between bud-head">
        <div>
          <h1 className="page-title">Budget</h1>
          <div className="muted">{sub}</div>
        </div>
        <button className="btn small quiet bud-import" onClick={() => setImporting(true)}>
          <Icon name="down" size={16} /> Import statement
        </button>
      </header>
      <div className="news-chips bud-tabs" role="tablist" aria-label="Budget views">
        {BUDGET_VIEWS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} className={`nchip ${view === k ? 'on' : ''}`} style={{ '--sc': dark ? '#62d39b' : '#145a3c' }} onClick={() => setView(k)}>
            {l}
          </button>
        ))}
      </div>
      {view === 'month' ? (
        <MonthView
          {...common}
          monthKey={monthKey}
          keys={keys}
          setMonth={setMonth}
          openCategory={setCategory}
          openImport={() => setImporting(true)}
          goSavings={() => setView('savings')}
          goSettings={() => setView('settings')}
        />
      ) : null}
      {view === 'paycheck' ? <PaycheckView {...common} goSettings={() => setView('settings')} /> : null}
      {view === 'spending' ? <SpendingView {...common} openCategory={setCategory} /> : null}
      {view === 'savings' ? <SavingsView {...common} /> : null}
      {view === 'outlook' ? <OutlookView {...common} auto={auto} goSavings={() => setView('savings')} /> : null}
      {view === 'stocks' ? <StocksView {...common} /> : null}
      {view === 'year' ? <YearView {...common} openCategory={setCategory} /> : null}
      {view === 'settings' ? <SettingsView {...common} alertStatus={alertStatus} /> : null}
      {txnId ? <TxnSheet {...common} id={txnId} onClose={() => setTxnId(null)} /> : null}
      {merchant ? <MerchantSheet {...common} name={merchant} onClose={() => setMerchant(null)} /> : null}
      {category ? <CategorySheet {...common} name={category.name} monthKey={category.key || monthKey || cur} onClose={() => setCategory(null)} /> : null}
      {importing ? <ImportSheet {...common} onClose={() => setImporting(false)} onDone={(k) => (setImporting(false), k && setMonth(k), setView('month'))} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- month
function MonthNav({ keys, monthKey, setMonth, upd }) {
  const i = keys.indexOf(monthKey);
  const add = (dir) => {
    const k = dir > 0 ? C.nextMonth(keys[keys.length - 1]) : C.prevMonth(keys[0]);
    upd((d) => {
      if (!d.months[k]) d.months[k] = C.emptyMonth();
    });
    setMonth(k);
  };
  return (
    <div className="mnav">
      {i > 0 ? (
        <button className="icon-btn" aria-label={`Previous month (${C.monthShort(keys[i - 1])})`} onClick={() => setMonth(keys[i - 1])}>
          <Icon name="chev" size={18} />
        </button>
      ) : (
        <button className="icon-btn" aria-label="Add the month before" title="Add the month before" onClick={() => add(-1)}>
          +
        </button>
      )}
      <select className="inline-select mnav-sel" value={monthKey} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
        {[...keys].reverse().map((k) => (
          <option key={k} value={k}>
            {C.monthLong(k)}
          </option>
        ))}
      </select>
      {i < keys.length - 1 ? (
        <button className="icon-btn" aria-label={`Next month (${C.monthShort(keys[i + 1])})`} onClick={() => setMonth(keys[i + 1])}>
          <Icon name="chev" size={18} />
        </button>
      ) : (
        <button className="icon-btn" aria-label="Add the next month" title="Add the next month" onClick={() => add(1)}>
          +
        </button>
      )}
    </div>
  );
}

function MonthView({ data, upd, onToast, monthKey, keys, setMonth, openTxn, openMerchant, openCategory, openImport, goSavings, goSettings }) {
  const swipe = useSwipe(
    () => {
      const i = keys.indexOf(monthKey);
      if (i < keys.length - 1) setMonth(keys[i + 1]);
    },
    () => {
      const i = keys.indexOf(monthKey);
      if (i > 0) setMonth(keys[i - 1]);
    },
  );
  if (!monthKey)
    return (
      <section className="card">
        <p className="empty">No months yet.</p>
        <button className="btn primary" onClick={() => upd((d) => (d.months[C.todayKey()] = C.emptyMonth()))}>
          Start {C.monthLong(C.todayKey())}
        </button>
      </section>
    );
  const m = data.months[monthKey];
  const s = C.monthStats(data, monthKey);
  const p = C.pacingFor(monthKey);
  return (
    <div className="bud-month" {...swipe}>
      <MonthNav keys={keys} monthKey={monthKey} setMonth={setMonth} upd={upd} />
      <Summary data={data} s={s} p={p} monthKey={monthKey} />
      <div className="bud-cols">
        <div className="col">
          <Categories data={data} s={s} p={p} monthKey={monthKey} openCategory={openCategory} />
          <RecentDays data={data} s={s} p={p} monthKey={monthKey} openTxn={openTxn} />
        </div>
        <div className="col">
          <Bills data={data} upd={upd} s={s} monthKey={monthKey} />
          <OwedToYou data={data} upd={upd} s={s} monthKey={monthKey} goSettings={goSettings} />
          <SavingsTargets data={data} s={s} monthKey={monthKey} goSavings={goSavings} />
        </div>
        <div className="bud-full">
          <Ledger data={data} upd={upd} onToast={onToast} monthKey={monthKey} openTxn={openTxn} openImport={openImport} />
        </div>
      </div>
      {m.transactions.length === 0 ? (
        <p className="muted small note">
          This month is empty.{' '}
          <button
            className="btn small quiet"
            onClick={() => {
              const i = keys.indexOf(monthKey);
              const fallback = keys[i - 1] || keys[i + 1] || null;
              upd((d) => delete d.months[monthKey]);
              setMonth(fallback);
            }}
          >
            Remove {C.monthLong(monthKey)}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function Summary({ data, s, p, monthKey }) {
  const cfg = data.config;
  const left = s.budget - s.spent;
  const st = C.statusOf(s.spent, s.budget, p);
  const daysLeft = p.days - p.day + 1;
  const line =
    p.state === 'current'
      ? left >= 0
        ? `${fmt0(left / daysLeft)} a day for the ${daysLeft === 1 ? 'last day' : `next ${daysLeft} days`}`
        : `${fmt0(-left)} over with ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to go`
      : p.state === 'past'
        ? left >= 0
          ? `Finished ${fmt0(left)} under budget`
          : `Finished ${fmt0(-left)} over budget`
        : 'Full budget available';
  const paydays = C.paydaysIn(monthKey, cfg.payAnchor);
  const next = p.state === 'current' ? C.nextPayday(cfg.payAnchor) : null;
  const incomeNote = paydays.length
    ? `Paydays ${paydays.map(C.dateLabel).join(', ')}${paydays.length === 3 ? ' (three this month; the third is extra)' : ''}${next ? `. Next ${next.days === 0 ? 'today' : next.days === 1 ? 'tomorrow' : `in ${next.days} days`}` : ''}`
    : `${fmt(s.incomeBiweekly)} biweekly, as a month`;
  const afterSavings = s.income - s.fixed - s.savingsMonthly;
  const over = s.budget - afterSavings;
  return (
    <section className="card bud-summary">
      <div className="bs-top">
        <div>
          <div className="muted small">{left >= 0 ? 'Left to spend' : 'Over budget by'}</div>
          <div className={`big num ${left < 0 ? 'neg' : ''}`}>{fmt(Math.abs(left))}</div>
          <div className="muted small">{line}</div>
        </div>
        <StatusPill st={st} />
      </div>
      <PaceBar spent={s.spent} budget={s.budget} p={p} st={st} />
      <div className="muted small num">
        {fmt(s.spent)} spent of {fmt0(s.budget)}
        {p.state === 'current' ? ` · day ${p.day} of ${p.days}` : ''}
      </div>
      <div className="kpis">
        <Kpi label="Income" value={fmt(s.income)} sub={incomeNote} />
        <Kpi label="Fixed costs" value={fmt(s.fixed)} sub={`${fmt0(s.paidTotal)} charged so far`} />
        <Kpi
          label="Spending budget"
          value={fmt(s.budget)}
          sub={over > 0 ? `${fmt0(over)} more than what's left after bills and savings` : `${fmt0(afterSavings)} left after bills and savings`}
          tone={over > 0 ? 'red' : null}
        />
        <Kpi label="Projected net" value={fmt(s.net)} sub={`${pct(s.rate)} of income. Savings target ${fmt0(s.savingsMonthly)}`} tone={s.net < 0 ? 'red' : null} />
      </div>
    </section>
  );
}

function Categories({ data, s, p, monthKey, openCategory }) {
  const cats = data.config.categories;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Spending budgets</h2>
        <span className="muted small">{p.state === 'current' ? `Pace as of day ${p.day}` : p.state === 'past' ? 'Month complete' : 'Not started'}</span>
      </div>
      <ul className="list bcat-list">
        {cats.map((c) => {
          const spent = s.spentBy[c.name] || 0;
          const st = C.statusOf(spent, c.budget, p);
          const rem = c.budget - spent;
          return (
            <li key={c.id}>
              <button className="bcat" onClick={() => openCategory({ name: c.name, key: monthKey })}>
                <CategoryMark category={c.name} />
                <span className="grow">
                  <span className="row-between">
                    <b>{c.name}</b>
                    <span className={`num ${rem < 0 ? 'c-red' : ''}`}>{rem < 0 ? `${fmt(-rem)} over` : `${fmt(rem)} left`}</span>
                  </span>
                  <PaceBar spent={spent} budget={c.budget} p={p} st={st} />
                  <span className="row-between muted small">
                    <span className="num">
                      {fmt(spent)} of {fmt0(c.budget)}
                    </span>
                    <StatusPill st={st} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {s.otherSpent > 0 ? (
          <li className="bcat other">
            <CategoryMark category="Other" />
            <span className="grow">
              <span className="row-between">
                <b>Other (not in your categories)</b>
                <span className="num c-red">{fmt(s.otherSpent)}</span>
              </span>
            </span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function RecentDays({ data, s, p, monthKey, openTxn }) {
  if (p.state === 'future') return null;
  const m = data.months[monthKey];
  const end = p.state === 'current' ? C.todayISO() : `${monthKey}-${C.pad2(p.days)}`;
  const days = [end, C.addDays(end, -1), C.addDays(end, -2)];
  const perDay = s.budget / p.days;
  const total = sum(
    m.transactions.filter((t) => days.includes(t.date)),
    (t) => t.amount,
  );
  const budgetOf = (name) => (data.config.categories.find((c) => c.name === name) || {}).budget || 0;
  const label = (iso, i) =>
    p.state !== 'current'
      ? `${C.weekdayLabel(iso)}, ${C.dateLabel(iso)}`
      : i === 0
        ? `Today, ${C.dateLabel(iso)}`
        : i === 1
          ? `Yesterday, ${C.dateLabel(iso)}`
          : `${C.weekdayLabel(iso)}, ${C.dateLabel(iso)}`;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Last three days</h2>
        <span className="muted small num">
          {fmt(total)} vs {fmt0(perDay * 3)} at an even pace
        </span>
      </div>
      {days.map((iso, i) => {
        const rows = m.transactions.filter((t) => t.date === iso).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
        const tot = sum(rows, (t) => t.amount);
        const diff = tot - perDay;
        const by = {};
        rows.forEach((t) => (by[t.category] = (by[t.category] || 0) + t.amount));
        const top = Object.entries(by).sort((a, b) => b[1] - a[1]);
        const pushedOver = data.config.categories
          .filter((c) => {
            if (!by[c.name] || c.budget <= 0) return false;
            const before = sum(
              m.transactions.filter((t) => t.category === c.name && t.date < iso),
              (t) => t.amount,
            );
            return before <= c.budget && before + by[c.name] > c.budget;
          })
          .map((c) => c.name);
        const lines = [];
        if (!rows.length) lines.push(iso > C.todayISO() ? 'Hasn’t happened yet.' : 'Nothing logged.');
        else {
          lines.push(`${rows.length} ${rows.length === 1 ? 'purchase' : 'purchases'}, ${fmt0(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'} the ${fmt0(perDay)} daily allowance.`);
          if (top.length === 1) lines.push(`All ${top[0][0]}${rows.length > 1 ? `, led by ${rows[0].desc} at ${fmt(rows[0].amount)}` : ''}.`);
          else lines.push(`${top[0][0]} was ${Math.round((top[0][1] / tot) * 100)}% of it; the largest was ${rows[0].desc} at ${fmt(rows[0].amount)}.`);
          if (pushedOver.length) lines.push(`This day put ${pushedOver.join(' and ')} over for the month.`);
          const leftCat = budgetOf(top[0][0]) - (s.spentBy[top[0][0]] || 0);
          if (p.state === 'current' && i === 0 && budgetOf(top[0][0]) > 0)
            lines.push(leftCat >= 0 ? `${top[0][0]} has ${fmt0(leftCat)} left this month.` : `${top[0][0]} is ${fmt0(-leftCat)} over this month.`);
          const dc = sum(rows, C.cashbackFor);
          if (dc > 0) lines.push(`${fmt(dc)} Daily Cash.`);
        }
        return (
          <div key={iso} className="rday">
            <div className="row-between">
              <b className="small">{label(iso, i)}</b>
              <span className="rday-tot">
                <span className={`num ${!rows.length ? 'muted' : diff > 0 ? 'c-red' : 'c-green'}`}>{fmt(tot)}</span>
                {rows.length ? <StatusPill st={diff > 0 ? 'over' : 'on'} /> : null}
              </span>
            </div>
            {rows.length ? (
              <ul className="list rday-list">
                {rows.map((t) => (
                  <li key={t.id}>
                    <button className="txrow compact" onClick={() => openTxn(t.id)}>
                      <CategoryMark category={t.category} size={22} />
                      <span className="grow">{t.desc}</span>
                      <span className="num">{fmt(t.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className={`small rday-note ${rows.length ? '' : 'muted'}`}>{lines.join(' ')}</p>
          </div>
        );
      })}
    </section>
  );
}

function Ledger({ data, upd, onToast, monthKey, openTxn, openImport }) {
  const m = data.months[monthKey];
  const [filter, setFilter] = useState('All');
  const [limit, setLimit] = useState(40);
  const downAt = useRef(null);
  useEffect(() => {
    setFilter('All');
    setLimit(40);
  }, [monthKey]);
  const cats = data.config.categories.map((c) => c.name);
  const rows = [...(filter === 'All' ? m.transactions : m.transactions.filter((t) => t.category === filter))].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const total = sum(rows, (t) => t.amount);
  const remove = async (t) => {
    let removed = null;
    await upd((d) => (removed = C.removeTxn(d, t.id)));
    onToast({ text: `Removed ${t.desc}`, undo: async () => (await upd((d) => C.restoreTxn(d, removed)), onToast({ text: 'Restored' })) });
  };
  const isCur = monthKey === C.todayKey();
  return (
    <section className="card ledger">
      <div className="card-head">
        <h2 className="card-title">Expenses</h2>
        <span className="muted small num">
          {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
          {filter !== 'All' ? ` in ${filter}` : ''}, {fmt(total)}
        </span>
      </div>
      <AddForm
        key={monthKey}
        data={data}
        dateDefault={isCur ? C.todayISO() : `${monthKey}-01`}
        onAdd={async (t) => {
          const ok = await upd((d) => C.addTxn(d, t));
          onToast({ text: `Added ${fmt(t.amount)} to ${t.category}`, undo: async () => (await upd((d) => C.removeTxn(d, t.id)), onToast({ text: 'Removed' })) });
          return ok;
        }}
      />
      <div className="ledger-bar">
        <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show category">
          <option>All</option>
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn small quiet" onClick={openImport}>
          Import Apple Card CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="empty">{m.transactions.length === 0 ? 'No expenses logged yet. Add the first one above.' : `Nothing in ${filter} this month.`}</p>
      ) : (
        <ul className="list txlist">
          {rows.slice(0, limit).map((t) => (
            <SwipeRow key={t.id} onLeft={() => remove(t)} leftLabel="Delete" className="txswipe">
              <div
                className="txrow"
                role="button"
                tabIndex={0}
                aria-label={`${t.desc}, ${fmt(t.amount)}, ${C.dateLabel(t.date)}`}
                onPointerDown={(e) => (downAt.current = [e.clientX, e.clientY])}
                onClick={(e) => {
                  const d = downAt.current;
                  downAt.current = null;
                  if (e.detail && d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 8) return; // the end of a swipe, not a tap
                  openTxn(t.id);
                }}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openTxn(t.id))}
              >
                <CategoryMark category={t.category} />
                <span className="grow">
                  <b>{t.desc}</b>
                  <span className="muted small">
                    {C.dateLabel(t.date)} · {t.method}
                    {C.cashbackRate(t) > 0 ? <span className="c-green"> +{fmt(C.cashbackFor(t))}</span> : null}
                    {t.src === 'csv' ? ' · imported' : ''}
                  </span>
                </span>
                <span className={`num tx-amt ${t.amount < 0 ? 'c-green' : ''}`}>{fmt(t.amount)}</span>
              </div>
            </SwipeRow>
          ))}
        </ul>
      )}
      {rows.length > limit ? (
        <button className="btn quiet block" onClick={() => setLimit(limit + 60)}>
          Show more
        </button>
      ) : null}
      <p className="muted small note swipe-hint">Tap an expense to edit it; swipe left to delete.</p>
    </section>
  );
}

function Bills({ data, upd, s, monthKey }) {
  const m = data.months[monthKey];
  const [editing, setEditing] = useState(null);
  const [val, setVal] = useState('');
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Fixed costs</h2>
        <span className="muted small num">
          {fmt(s.fixed)} yours · {fmt0(s.paidTotal)} charged
        </span>
      </div>
      <ul className="list">
        {s.bills.map((b) => {
          const paid = C.isPaid(m, b, monthKey);
          const d = b.day ? Math.min(Number(b.day), C.daysIn(monthKey)) : 0;
          const when = d ? (Number(b.day) >= 31 ? 'last day of the month' : `the ${C.ordinal(d)}`) : 'ticked by hand';
          const custom = m.amounts && m.amounts[b.id] !== undefined;
          const share = C.billShare(b);
          return (
            <li key={b.id} className={`bill ${paid ? 'done' : ''}`}>
              <label className="bill-check">
                <input type="checkbox" checked={paid} onChange={() => upd((dd) => C.toggleBill(dd, monthKey, b.id))} aria-label={`${b.name} charged`} />
                <span className="box">{paid ? <Icon name="check" size={14} /> : null}</span>
              </label>
              <div className="grow">
                <div className="bill-name">{b.name}</div>
                <div className="muted small">
                  {b.category}, {when}
                  {b.card ? ', Apple Card' : ''}
                  {share < 1 ? `, your ${Math.round(share * 100)}%` : ''}
                  {b.ends ? `, through ${C.monthShort(b.ends)}` : ''}
                  {custom ? `, usually ${fmt(b.amount)}` : ''}
                </div>
              </div>
              <div className="bill-amts">
                {editing === b.id ? (
                  <input
                    className="input num bill-edit"
                    type="number"
                    step="0.01"
                    autoFocus
                    value={val}
                    aria-label={`${b.name} charged this month`}
                    onChange={(e) => setVal(e.target.value)}
                    onBlur={() => {
                      upd((dd) => C.setBillAmount(dd, monthKey, b.id, val));
                      setEditing(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                ) : (
                  <button
                    className={`linkish num ${custom ? 'custom' : ''}`}
                    onClick={() => (setEditing(b.id), setVal(String(C.billFull(m, b))))}
                    aria-label={`${b.name}: ${fmt(C.billFull(m, b))} charged; change this month's amount`}
                  >
                    {fmt(C.billFull(m, b))}
                  </button>
                )}
                {share < 1 ? <span className="muted small num">yours {fmt(C.billCost(m, b))}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted small note">Bills with a charge day tick themselves on that day. Tap an amount to enter what this month actually charged.</p>
    </section>
  );
}

function OwedToYou({ data, upd, s, monthKey, goSettings }) {
  const m = data.months[monthKey];
  const cfg = data.config;
  const shared = s.bills.filter((b) => C.billShare(b) < 1 && C.billOwed(m, b) > 0);
  if (!shared.length) return null;
  const rs = C.roommatesOf(cfg);
  const today = C.todayISO();
  const outstanding = sum(
    shared.filter((b) => C.isPaid(m, b, monthKey)),
    (b) => C.owedLeft(cfg, m, b),
  );
  if (!rs.length)
    return (
      <section className="card owed">
        <div className="card-head">
          <h2 className="card-title">Owed to you</h2>
          <span className={`num small ${outstanding > 0 ? 'c-amber' : 'c-green'}`}>{outstanding > 0 ? `${fmt(outstanding)} to collect` : 'All collected'}</span>
        </div>
        <ul className="list">
          {shared.map((b) => {
            const got = C.billCollected(m, b);
            return (
              <li key={b.id} className={`bill ${got ? 'done' : ''}`}>
                <label className="bill-check">
                  <input type="checkbox" checked={got} onChange={() => upd((d) => C.setCollected(d, monthKey, b.id, null))} aria-label={`${b.name} paid back`} />
                  <span className="box">{got ? <Icon name="check" size={14} /> : null}</span>
                </label>
                <div className="grow">
                  <div className="bill-name">{b.name}</div>
                  <div className="muted small">
                    {fmt(C.billFull(m, b))} charged, {fmt(C.billCost(m, b))} yours{C.isPaid(m, b, monthKey) ? '' : ', not charged yet'}
                  </div>
                </div>
                <span className="num">{fmt(C.billOwed(m, b))}</span>
              </li>
            );
          })}
        </ul>
        <p className="muted small note">
          You front these in full.{' '}
          <button className="linkish" onClick={goSettings}>
            Add roommates
          </button>{' '}
          to split each bill and request it on Venmo.
        </p>
      </section>
    );
  const dues = I.roommateDues(data, monthKey, today);
  const app = isPhoneLike();
  return (
    <section className="card owed">
      <div className="card-head">
        <h2 className="card-title">Owed to you</h2>
        <span className={`num small ${outstanding > 0 ? 'c-amber' : 'c-green'}`}>{outstanding > 0 ? `${fmt(outstanding)} to collect` : 'All collected'}</span>
      </div>
      {dues.map((d) => {
        const r = d.roommate;
        const charged = shared.filter((b) => C.isPaid(m, b, monthKey));
        const allPaid = charged.length > 0 && charged.every((b) => C.collectedBy(m, b, r.id));
        return (
          <div key={r.id} className="rmate">
            <div className="row-between">
              <b>{r.name || 'Roommate'}</b>
              <span className={`num ${d.owed > 0.005 ? 'c-amber' : 'c-green'}`}>{d.owed > 0.005 ? fmt(d.owed) : 'Paid up'}</span>
            </div>
            {d.owed > 0.005 && d.oldest >= 7 ? <span className="spill t-amber">Waiting {d.oldest} days</span> : null}
            <ul className="rm-bills">
              {shared.map((b) => {
                const got = C.collectedBy(m, b, r.id);
                const charged1 = C.isPaid(m, b, monthKey);
                return (
                  <li key={b.id}>
                    <label className={`rm-bill ${got ? 'done' : ''} ${charged1 ? '' : 'later'}`}>
                      <input type="checkbox" checked={got} onChange={() => upd((dd) => C.setCollected(dd, monthKey, b.id, r.id, !got))} aria-label={`${r.name} paid ${b.name}`} />
                      <span className="grow">{b.name}</span>
                      <span className="num">{fmt(C.billOwed(m, b) / rs.length)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="rm-acts">
              {d.owed > 0.005 ? (
                r.venmo ? (
                  <a className="btn small primary" href={I.venmoLink(r.venmo, d.owed, d.note, app)} target={app ? undefined : '_blank'} rel="noopener">
                    Request {fmt(d.owed)} on Venmo
                  </a>
                ) : (
                  <button className="btn small quiet" onClick={goSettings}>
                    Add {r.name || 'their'}’s Venmo
                  </button>
                )
              ) : null}
              {charged.length ? (
                <label className="small rm-all">
                  <input
                    type="checkbox"
                    checked={allPaid}
                    onChange={() =>
                      upd((dd) => {
                        charged.forEach((b) => C.setCollected(dd, monthKey, b.id, r.id, !allPaid));
                      })
                    }
                  />{' '}
                  Paid everything
                </label>
              ) : null}
            </div>
          </div>
        );
      })}
      <p className="muted small note">You front these in full; each roommate owes an equal cut. Tick a bill once their Venmo lands.</p>
    </section>
  );
}

function SavingsTargets({ data, s, monthKey, goSavings }) {
  const paydays = C.paydaysIn(monthKey, data.config.payAnchor);
  const due = paydays.length * s.savingsBiweekly;
  const deposited = data.savings
    ? sum(
        data.savings.entries.filter((e) => e.type === 'deposit' && e.date.startsWith(monthKey)),
        (e) => e.amount,
      )
    : 0;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Savings targets</h2>
        <span className="muted small num">{fmt0(s.savingsMonthly)} a month</span>
      </div>
      <ul className="list">
        {s.savings.map((x) => (
          <li key={x.id} className="row-between sv-row">
            <span>
              {x.name}
              {x.starts || x.ends ? (
                <span className="muted small"> · {[x.starts ? `from ${C.monthShort(x.starts)}` : '', x.ends ? `through ${C.monthShort(x.ends)}` : ''].filter(Boolean).join(', ')}</span>
              ) : null}
            </span>
            <span className="num">
              {fmt(x.biweekly)} <span className="muted small">/ paycheck</span>
            </span>
          </li>
        ))}
      </ul>
      {data.savings ? (
        <p className="muted small note">
          Savings balance <b className="num">{fmt(C.savingsBalance(data))}</b>.
          {due > 0 ? ` This month: ${fmt0(deposited)} of ${fmt0(due)} deposited (${paydays.length} ${paydays.length === 1 ? 'payday' : 'paydays'} × ${fmt0(s.savingsBiweekly)}).` : ''}{' '}
          <button className="linkish" onClick={goSavings}>
            Open savings
          </button>
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- sheets
function TxnSheet({ data, upd, onToast, id, onClose, openMerchant }) {
  const found = useMemo(() => C.findTxn(data, id), [data, id]);
  const index = useMerchants(data);
  const [f, setF] = useState(() => (found ? { ...found.t, amount: String(found.t.amount) } : null));
  if (!found || !f) return null;
  const cats = data.config.categories.map((c) => c.name);
  const catList = cats.includes(f.category) || !f.category ? cats : [f.category, ...cats];
  const methods = data.config.paymentMethods.includes(f.method) ? data.config.paymentMethods : [f.method, ...data.config.paymentMethods];
  const ok = String(f.desc).trim() && f.amount !== '' && Number.isFinite(Number(f.amount)) && Number(f.amount) !== 0 && f.date;
  const save = async () => {
    if (!ok) return;
    await upd((d) => C.updateTxn(d, id, { date: f.date, desc: f.desc, category: f.category, amount: Number(f.amount), method: f.method }));
    onToast({ text: 'Saved' });
    onClose();
  };
  const del = async () => {
    let removed = null;
    await upd((d) => (removed = C.removeTxn(d, id)));
    onClose();
    onToast({ text: `Removed ${found.t.desc}`, undo: async () => (await upd((d) => C.restoreTxn(d, removed)), onToast({ text: 'Restored' })) });
  };
  return (
    <Sheet title="Expense" onClose={onClose} className="txn-sheet">
      <div className="form-grid">
        <label>
          <span className="muted small">What</span>
          <MerchantInput
            index={index}
            value={f.desc}
            onChange={(v) => setF({ ...f, desc: v })}
            onPick={(e) => setF({ ...f, desc: e.name, category: cats.includes(e.category) ? e.category : f.category })}
          />
        </label>
        <label>
          <span className="muted small">Amount</span>
          <input className="input num" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Amount" />
        </label>
        <label>
          <span className="muted small">Category</span>
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category">
            {catList.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Paid with</span>
          <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} aria-label="Paid with">
            {methods.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Date</span>
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
        </label>
      </div>
      {C.cashbackRate(f) > 0 ? (
        <p className="muted small">
          {Math.round(C.cashbackRate(f) * 100)}% Daily Cash: {fmt(C.cashbackFor({ ...f, amount: Number(f.amount) }))}
        </p>
      ) : null}
      <div className="sheet-acts">
        <button className="btn primary" onClick={save} disabled={!ok}>
          Save
        </button>
        <button className="btn" onClick={del}>
          Delete
        </button>
        <button className="btn quiet" onClick={() => (onClose(), openMerchant(found.t.desc))}>
          Everything at {found.t.desc}
        </button>
      </div>
    </Sheet>
  );
}

function MerchantSheet({ data, upd, onToast, name, onClose, openTxn, dark }) {
  const h = useMemo(() => I.merchantHistory(data, name), [data, name]);
  const [rename, setRename] = useState(h.name);
  const [cat, setCat] = useState(h.category);
  const cur = C.todayKey();
  const slots = Array.from({ length: 12 }, (_, i) => C.addMonths(cur, i - 11));
  const pts = slots.filter((k) => h.byMonth[k]).map((k) => ({ t: k, v: Math.round(h.byMonth[k] * 100) / 100 }));
  const ids = h.txns.map((t) => t.id);
  const applyAll = async (patch, msg) => {
    await upd((d) => ids.forEach((id) => C.updateTxn(d, id, patch)));
    onToast({ text: msg });
  };
  return (
    <Sheet title={h.name} onClose={onClose} className="merchant-sheet" wide>
      <div className="kpis">
        <Kpi label="This year" value={fmt(h.thisYear)} />
        <Kpi label="All time" value={fmt(h.total)} sub={`${h.count} ${h.count === 1 ? 'visit' : 'visits'}`} />
        <Kpi label="Average" value={fmt(h.avg)} sub={h.last ? `last on ${C.dateLabel(h.last)}` : ''} />
      </div>
      {pts.length ? <BarChart points={pts} slots={slots} fmt={fmt} label={`${h.name} by month`} height={140} xLabels={[slots[0], slots[11]]} /> : null}
      <ul className="list txlist">
        {h.txns.slice(0, 60).map((t) => (
          <li key={t.id}>
            <button className="txrow compact" onClick={() => (onClose(), openTxn(t.id))}>
              <CategoryMark category={t.category} size={22} />
              <span className="grow">
                {C.dateLabel(t.date)} {t.date.slice(0, 4) !== cur.slice(0, 4) ? t.date.slice(0, 4) : ''}
                <span className="muted small"> · {t.category}</span>
              </span>
              <span className="num">{fmt(t.amount)}</span>
            </button>
          </li>
        ))}
      </ul>
      <details className="msheet-tools">
        <summary className="small">Tidy up {h.count} expenses</summary>
        <div className="form-row">
          <input className="input" value={rename} onChange={(e) => setRename(e.target.value)} aria-label="Name for all of them" />
          <button className="btn small" disabled={!rename.trim() || rename.trim() === h.name} onClick={() => applyAll({ desc: rename.trim() }, `Renamed ${h.count} to ${rename.trim()}`)}>
            Rename all
          </button>
        </div>
        <div className="form-row">
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category for all of them">
            {data.config.categories.map((c) => (
              <option key={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="btn small" onClick={() => applyAll({ category: cat }, `${h.count} expenses moved to ${cat}`)}>
            Recategorize all
          </button>
        </div>
      </details>
    </Sheet>
  );
}

function CategorySheet({ data, name, monthKey, onClose, openTxn, openMerchant }) {
  const c = data.config.categories.find((x) => x.name === name);
  const budget = c ? Number(c.budget) || 0 : 0;
  const keys = I.recentMonths(data, 12);
  const slots = keys.length ? keys : [monthKey];
  const pts = slots.map((k) => ({
    t: k,
    v:
      Math.round(
        sum(
          ((data.months[k] || {}).transactions || []).filter((t) => t.category === name),
          (t) => t.amount,
        ) * 100,
      ) / 100,
  }));
  const done = pts.filter((p) => p.t < C.todayKey());
  const avg = done.length ? sum(done, (p) => p.v) / done.length : 0;
  const rows = ((data.months[monthKey] || {}).transactions || []).filter((t) => t.category === name).sort((a, b) => (a.date < b.date ? 1 : -1));
  const spent = sum(rows, (t) => t.amount);
  const top = I.topMerchants(
    { ...data, months: Object.fromEntries(Object.entries(data.months).map(([k, m]) => [k, { ...m, transactions: m.transactions.filter((t) => t.category === name) }])) },
    `${C.addMonths(C.todayKey(), -5)}-01`,
    5,
  );
  return (
    <Sheet title={name} onClose={onClose} wide className="cat-sheet">
      <div className="kpis">
        <Kpi label={C.monthLong(monthKey)} value={fmt(spent)} sub={budget ? `of ${fmt0(budget)}` : 'no budget'} tone={budget && spent > budget ? 'red' : null} />
        <Kpi label="Monthly average" value={fmt0(avg)} sub={`over ${done.length} ${done.length === 1 ? 'month' : 'months'}`} />
        <Kpi label="Budget" value={fmt0(budget)} sub={avg > budget && budget ? `${fmt0(avg - budget)} under what you usually spend` : ''} />
      </div>
      <BarChart points={pts} slots={slots} fmt={fmt} label={`${name} by month`} goal={budget || undefined} goalLabel={budget ? `Budget ${fmt0(budget)}` : undefined} height={150} />
      {top.length ? (
        <>
          <h3 className="ss-h">Where it goes (last 6 months)</h3>
          <ul className="list">
            {top.map((mm) => (
              <li key={mm.key}>
                <button className="txrow compact" onClick={() => (onClose(), openMerchant(mm.name))}>
                  <span className="grow">
                    {mm.name} <span className="muted small">× {mm.count}</span>
                  </span>
                  <span className="num">{fmt(mm.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h3 className="ss-h">{C.monthLong(monthKey)}</h3>
      {rows.length ? (
        <ul className="list txlist">
          {rows.map((t) => (
            <li key={t.id}>
              <button className="txrow compact" onClick={() => (onClose(), openTxn(t.id))}>
                <span className="grow">
                  {t.desc} <span className="muted small">· {C.dateLabel(t.date)}</span>
                </span>
                <span className="num">{fmt(t.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Nothing in {name} this month.</p>
      )}
    </Sheet>
  );
}
