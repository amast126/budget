// The Budget tab's other screens: the paycheck view, spending (search, merchants, trends, subscriptions), savings
// and the Apple Card, the outlook (net worth and milestones), stocks, the year, settings, and the statement import.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as C from './budget-core.js';
import * as I from './budget-insights.js';
import { CategoryMark, StatusPill, PaceBar, Money, Sheet, Kpi, Commit, categoryColor } from './budget-ui.jsx';
import { BarChart, LineChart } from './chart-kit.jsx';
import { Icon } from './ui.jsx';
import { IS_DEMO } from './demo-flag.js';

const { fmt, fmt0, pct, sum } = C;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const inDays = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const listNames = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const baseName = (n) => String(n || '').replace(/\s*\((previous|old|current|new)[^)]*\)\s*/i, ' ').trim();

// ---------------------------------------------------------------- paycheck
export function PaycheckView({ data, openTxn, goSettings }) {
  const today = C.todayISO();
  const v = useMemo(() => I.paycheckView(data, today), [data, today]);
  const [showSpent, setShowSpent] = useState(false);
  if (!v)
    return (
      <section className="card">
        <h2 className="card-title">Paycheck</h2>
        <p className="empty">Add a recent payday in Settings, and this shows what each paycheck has to cover and what’s left to spend until the next one.</p>
        <button className="btn primary" onClick={goSettings}>
          Open settings
        </button>
      </section>
    );
  const spentRows = I.allTransactions(data).filter((t) => t.date >= v.start && t.date <= today);
  const day = C.daysBetween(v.start, today) + 1;
  const p = { state: 'current', frac: Math.min(1, day / 14), day, days: 14 };
  const st = C.statusOf(v.spent, Math.max(0, v.spendable), p);
  const checks = [v, ...v.upcoming];
  const avg = sum(checks, (c) => c.spendable) / checks.length;
  const nextDays = C.daysBetween(today, v.next);
  const billsLeft = v.bills.filter((b) => !b.paid);
  return (
    <div className="bud-paycheck">
      <section className="card pc-hero">
        <div className="bs-top">
          <div>
            <div className="muted small">{v.left >= 0 ? 'Left to spend until payday' : 'Over this paycheck by'}</div>
            <div className={`big num ${v.left < 0 ? 'neg' : ''}`}>{fmt(Math.abs(v.left))}</div>
            <div className="muted small">
              {v.left >= 0 ? `About ${v.perDay >= 10 ? fmt0(v.perDay) : fmt(v.perDay)} a day for ${plural(v.daysLeft, 'day')}` : `${plural(v.daysLeft, 'day')} to go`}. Next payday {C.dateLabel(v.next)} ({inDays(nextDays)}).
            </div>
          </div>
          <StatusPill st={st} />
        </div>
        <PaceBar spent={v.spent} budget={Math.max(0, v.spendable)} p={p} st={st} />
        <ul className="list pc-flow">
          <li className="row-between">
            <span>Paycheck {C.dateLabel(v.start)}</span>
            <Money v={v.income} className="c-green" />
          </li>
          <li className="row-between">
            <span>To savings</span>
            <Money v={-v.savings} />
          </li>
          <li className="row-between">
            <span>
              Bills before {C.dateLabel(C.addDays(v.end, 1))}
              <span className="muted small"> · {plural(v.bills.length, 'bill')}</span>
            </span>
            <Money v={-v.billTotal} />
          </li>
          <li className="row-between pc-sub">
            <b>To spend</b>
            <b>
              <Money v={v.spendable} />
            </b>
          </li>
          <li>
            <button className="row-between linkish pc-spent" onClick={() => setShowSpent(!showSpent)} aria-expanded={showSpent}>
              <span>
                Spent so far <span className="muted small">· {plural(spentRows.length, 'purchase')}</span>
              </span>
              <Money v={-v.spent} />
            </button>
          </li>
          {showSpent ? (
            <li>
              <ul className="list txlist">
                {spentRows.map((t) => (
                  <li key={t.id}>
                    <button className="txrow compact" onClick={() => openTxn(t.id)}>
                      <CategoryMark category={t.category} size={22} />
                      <span className="grow">
                        {t.desc} <span className="muted small">· {C.dateLabel(t.date)}</span>
                      </span>
                      <span className="num">{fmt(t.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
          <li className="row-between pc-sub">
            <b>Left</b>
            <b className={v.left < 0 ? 'c-red' : ''}>
              <Money v={v.left} />
            </b>
          </li>
        </ul>
        <p className="muted small note">
          Evened out over the next three months, a paycheck leaves about <b className="num">{fmt0(avg)}</b> to spend; your spending budgets add up to {fmt0(v.budgetPerCheck)} a paycheck.
          {v.spendable < avg * 0.7 && v.bills.length ? ` This one is lighter because ${listNames([...v.bills].sort((a, b) => b.cost - a.cost).slice(0, 3).map((b) => b.bill.name))} land before the next payday.` : ''}
          {v.spendable > avg * 1.3 ? ' This one is roomier than usual: fewer bills land before the next payday.' : ''}
        </p>
      </section>
      <div className="bud-cols">
        <div className="col">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">This paycheck’s bills</h2>
              <span className="muted small num">
                {fmt(v.billTotal)}
                {billsLeft.length ? `, ${fmt0(sum(billsLeft, (b) => b.cost))} still to charge` : ', all charged'}
              </span>
            </div>
            {v.bills.length ? (
              <ul className="list">
                {v.bills.map((b) => (
                  <li key={`${b.bill.id}-${b.due}`} className={`row-between pc-bill ${b.paid ? 'done' : ''}`}>
                    <span>
                      {b.paid ? <Icon name="check" size={14} /> : null} {b.bill.name}
                      <span className="muted small"> · {C.dateLabel(b.due)}</span>
                    </span>
                    <span className="num">
                      {fmt(b.cost)}
                      {b.cost < b.full ? <span className="muted small"> of {fmt(b.full)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">No bills land in this paycheck.</p>
            )}
          </section>
        </div>
        <div className="col">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Coming paychecks</h2>
              <span className="muted small">What each leaves to spend</span>
            </div>
            <ul className="list pc-next">
              {v.upcoming.map((u) => {
                const tight = u.spendable < avg * 0.7;
                const roomy = u.spendable > avg * 1.3;
                return (
                  <li key={u.start}>
                    <details>
                      <summary className="row-between">
                        <span>
                          <b>{C.dateLabel(u.start)}</b>
                          <span className="muted small"> · {plural(u.bills.length, 'bill')}</span> {u.extra ? <span className="spill t-green">Extra paycheck</span> : null}
                          {!u.extra && tight ? <span className="spill t-amber">Tight</span> : null}
                          {!u.extra && roomy ? <span className="spill t-green">Roomy</span> : null}
                        </span>
                        <Money v={u.spendable} cents={false} className={u.spendable < 0 ? 'c-red' : ''} />
                      </summary>
                      <ul className="list pc-detail">
                        <li className="row-between muted small">
                          <span>Paycheck, less {fmt0(u.savings)} to savings</span>
                          <span className="num">{fmt0(u.income - u.savings)}</span>
                        </li>
                        {u.bills.map((b) => (
                          <li key={`${b.bill.id}-${b.due}`} className="row-between small">
                            <span>
                              {b.bill.name} <span className="muted">· {C.dateLabel(b.due)}</span>
                            </span>
                            <span className="num">−{fmt(b.cost)}</span>
                          </li>
                        ))}
                        {u.extra ? <li className="muted small">{C.monthName(C.keyOf(u.start))}’s third paycheck. The month view counts two a month, so there this one is extra.</li> : null}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- spending
export function SpendingView({ data, dark, openTxn, openMerchant, openCategory }) {
  return (
    <div className="bud-spending">
      <SearchCard data={data} dark={dark} openTxn={openTxn} openMerchant={openMerchant} />
      <div className="bud-cols">
        <div className="col">
          <TrendsCard data={data} dark={dark} openCategory={openCategory} />
          <TopMerchants data={data} openMerchant={openMerchant} />
        </div>
        <div className="col">
          <SubscriptionsCard data={data} openMerchant={openMerchant} />
        </div>
      </div>
    </div>
  );
}

function SearchCard({ data, dark, openTxn, openMerchant }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [limit, setLimit] = useState(60);
  useEffect(() => setLimit(60), [q, cat]);
  const results = useMemo(() => (q.trim() || cat ? I.searchTxns(data, q, { category: cat }) : []), [data, q, cat]);
  const total = sum(results, (t) => t.amount);
  const monthTotals = {};
  results.forEach((t) => (monthTotals[C.keyOf(t.date)] = (monthTotals[C.keyOf(t.date)] || 0) + (Number(t.amount) || 0)));
  const groups = [];
  results.slice(0, limit).forEach((t) => {
    const k = C.keyOf(t.date);
    let g = groups[groups.length - 1];
    if (!g || g.key !== k) groups.push((g = { key: k, rows: [] }));
    g.rows.push(t);
  });
  const merchants = new Set(results.map((t) => I.merchantKey(t.desc)));
  const one = results.length > 1 && merchants.size === 1 ? results[0].desc : null;
  const cats = data.config.categories.map((c) => c.name);
  return (
    <section className="card bud-search">
      <label className="search-box">
        <Icon name="search" size={18} />
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every month: a store, an amount, a category" aria-label="Search expenses" />
      </label>
      <div className="news-chips cat-chips" role="group" aria-label="Category">
        <button className={`nchip ${cat === '' ? 'on' : ''}`} style={{ '--sc': dark ? '#62d39b' : '#145a3c' }} onClick={() => setCat('')} aria-pressed={cat === ''}>
          All
        </button>
        {cats.map((c) => (
          <button key={c} className={`nchip ${cat === c ? 'on' : ''}`} style={{ '--sc': categoryColor(c, dark) }} onClick={() => setCat(cat === c ? '' : c)} aria-pressed={cat === c}>
            {c}
          </button>
        ))}
      </div>
      {q.trim() || cat ? (
        <>
          <div className="row-between search-sum">
            <span className="muted small num">
              {plural(results.length, 'match', 'matches')}, {fmt(total)}
            </span>
            {one ? (
              <button className="btn small quiet" onClick={() => openMerchant(one)}>
                Everything at {one}
              </button>
            ) : null}
          </div>
          {results.length === 0 ? <p className="empty">Nothing matches. Try part of a name, or an amount like 12.50.</p> : null}
          {groups.map((g) => (
            <div key={g.key} className="search-group">
              <div className="row-between search-month">
                <b className="small">{C.monthLong(g.key)}</b>
                <span className="muted small num">{fmt(monthTotals[g.key])}</span>
              </div>
              <ul className="list txlist">
                {g.rows.map((t) => (
                  <li key={t.id}>
                    <button className="txrow compact" onClick={() => openTxn(t.id)}>
                      <CategoryMark category={t.category} size={22} />
                      <span className="grow">
                        {t.desc}
                        <span className="muted small">
                          {' '}
                          · {C.dateLabel(t.date)} · {t.category}
                        </span>
                      </span>
                      <span className="num">{fmt(t.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {results.length > limit ? (
            <button className="btn quiet block" onClick={() => setLimit(limit + 100)}>
              Show more
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function MiniBars({ values, budget, color, label }) {
  const W = 88;
  const H = 24;
  const max = Math.max(budget || 0, ...values, 1);
  const n = values.length || 1;
  const bw = Math.max(2, W / n - 2);
  return (
    <svg className="minibars" width={W} height={H} role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = Math.max(v > 0 ? 1.5 : 0, (v / max) * H);
        return <rect key={i} x={i * (W / n)} y={H - h} width={bw} height={h} rx="1" style={{ fill: color, opacity: i === n - 1 ? 1 : 0.45 }} />;
      })}
      {budget ? <line x1="0" x2={W} y1={H - (budget / max) * H} y2={H - (budget / max) * H} className="mb-goal" /> : null}
    </svg>
  );
}

function TrendsCard({ data, dark, openCategory }) {
  const today = C.todayISO();
  const tr = useMemo(() => I.categoryTrends(data, today, 12), [data, today]);
  if (!tr.keys.length) return null;
  const cats = data.config.categories;
  const goal = sum(cats, (c) => c.budget);
  const pts = tr.keys.map((k) => ({ t: k, month: true, parts: cats.map((c) => ({ v: C.round2(tr.byMonth[k][c.name] || 0), color: categoryColor(c.name, dark), label: c.name })) }));
  const used = tr.perCategory.filter((c) => c.values.some((v) => v > 0));
  const cur = C.todayKey();
  return (
    <section className="card trends">
      <div className="card-head">
        <h2 className="card-title">Trends</h2>
        <span className="muted small">{plural(tr.keys.length, 'month')} by category</span>
      </div>
      <BarChart points={pts} slots={tr.keys} fmt={fmt} label="Spending by category" goal={goal || undefined} goalLabel={goal ? `Budget ${fmt0(goal)}` : undefined} height={170} />
      {tr.callouts.length ? (
        <ul className="callouts">
          {tr.callouts.slice(0, 3).map((c) => (
            <li key={c.name} className={c.diff > 0 ? 'co-up' : 'co-down'}>
              <CategoryMark category={c.name} size={22} />
              <span>
                <b>{c.name}</b>: {fmt0(c.now)} so far this month, <b className="num">{fmt0(Math.abs(c.diff))}</b> {c.diff > 0 ? 'more' : 'less'} than your usual {fmt0(c.avg)} by the {C.ordinal(tr.day)}.
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small note">{tr.compared ? `Every category is within $25 of your ${plural(tr.compared, 'month')} average for this point in the month.` : 'Comparisons start once there’s a finished month to compare with.'}</p>
      )}
      <ul className="list trend-rows">
        {used.map((c) => {
          const budget = (cats.find((x) => x.name === c.name) || {}).budget || 0;
          const now = tr.keys[tr.keys.length - 1] === cur ? c.values[c.values.length - 1] : 0;
          return (
            <li key={c.name}>
              <button className="txrow compact" onClick={() => openCategory({ name: c.name })}>
                <CategoryMark category={c.name} size={22} />
                <span className="grow">
                  <span className="tr-name">{c.name}</span>
                  <span className="muted small">avg {fmt0(c.avg)}</span>
                </span>
                <MiniBars values={c.values} budget={budget} color={categoryColor(c.name, dark)} label={`${c.name}, last ${c.values.length} months`} />
                <span className="num tr-now">{fmt0(now)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const RANGES = [
  ['1', 'This month'],
  ['3', '3 months'],
  ['12', '12 months'],
];
function TopMerchants({ data, openMerchant }) {
  const [range, setRange] = useState('3');
  const cur = C.todayKey();
  const since = `${C.addMonths(cur, -(Number(range) - 1))}-01`;
  const list = useMemo(() => I.topMerchants(data, since, 10), [data, since]);
  const max = Math.max(1, ...list.map((m) => m.total));
  return (
    <section className="card">
      <div className="card-head wrap">
        <h2 className="card-title">Where it goes</h2>
        <div className="seg" role="group" aria-label="Range">
          {RANGES.map(([k, l]) => (
            <button key={k} className={`seg-btn ${range === k ? "on" : ""}`} aria-pressed={range === k} onClick={() => setRange(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        <ul className="list tm-list">
          {list.map((m) => (
            <li key={m.key}>
              <button className="txrow compact" onClick={() => openMerchant(m.name)}>
                <CategoryMark category={m.category} size={22} />
                <span className="grow">
                  <span className="row-between">
                    <span>
                      {m.name} <span className="muted small">× {m.count}</span>
                    </span>
                    <span className="num">{fmt(m.total)}</span>
                  </span>
                  <span className="tm-bar" style={{ width: `${(m.total / max) * 100}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Nothing logged in this range.</p>
      )}
    </section>
  );
}

function SubscriptionsCard({ data, openMerchant }) {
  const today = C.todayISO();
  const s = useMemo(() => I.findSubscriptions(data, today), [data, today]);
  const row = (x) => {
    const bits = [];
    if (x.next) bits.push(`next ${C.dateLabel(x.next)}`);
    if (x.source === 'bill') bits.push('a bill');
    else bits.push(`${plural(x.months, 'month')} running`);
    const body = (
      <>
        <span className="grow">
          <b>{x.changesTo ? baseName(x.name) : x.name}</b> {x.status === 'new' ? <span className="spill t-blue">New</span> : null}
          {x.priceUp ? <span className="spill t-amber">Up from {fmt(x.priceUp)}</span> : null}
          {x.status === 'ending' ? <span className="spill t-grey">Ends after {C.monthShort(x.ends)}</span> : null}
          <span className="muted small sub-line">
            {bits.join(' · ')}
            {x.changesTo ? ` · ${x.changesTo.amount < x.monthly ? 'drops' : 'goes'} to ${fmt(x.changesTo.amount)} from ${C.monthShort(x.changesTo.from)}` : ''}
          </span>
        </span>
        <span className="num sub-amt">
          {fmt(x.monthly)}
          <span className="muted small">/mo</span>
        </span>
      </>
    );
    return (
      <li key={x.key}>
        {x.source === 'expenses' ? (
          <button className="txrow" onClick={() => openMerchant(x.name)}>
            {body}
          </button>
        ) : (
          <div className="txrow">{body}</div>
        )}
      </li>
    );
  };
  return (
    <section className="card subs">
      <div className="card-head">
        <h2 className="card-title">Subscriptions</h2>
        <span className="muted small num">
          {fmt(s.monthly)}/mo · {fmt0(s.yearly)}/yr
        </span>
      </div>
      {s.active.length ? <ul className="list">{s.active.map(row)}</ul> : <p className="empty">No repeating charges found yet. They show up after a couple of months of the same charge.</p>}
      {s.stopped.length ? (
        <>
          <h3 className="ss-h">Cancelled or stopped</h3>
          <p className="small c-green sub-saved">
            Not paying these saves <b className="num">{fmt0(s.savedYearly)}</b> a year.
          </p>
          <ul className="list">
            {s.stopped.map((x) => (
              <li key={x.key} className="row-between sub-stopped">
                <span>
                  {x.name}
                  <span className="muted small"> · last {x.last ? C.dateLabel(x.last) : '—'}</span>
                </span>
                <span className="num muted">{fmt(x.monthly)}/mo</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="muted small note">Found from charges that repeat each month at about the same price, plus bills filed under Subscriptions. A price change or a new one gets a tag.</p>
    </section>
  );
}

// ---------------------------------------------------------------- savings and the card
export function SavingsView({ data, upd, onToast }) {
  if (!data.savings)
    return (
      <section className="card">
        <p className="empty">Savings tracking isn’t set up yet.</p>
        <button className="btn primary" onClick={() => upd((d) => (d.savings = C.defaultSavings()))}>
          Start tracking savings
        </button>
      </section>
    );
  return (
    <div className="bud-savings">
      <SavingsPanel data={data} upd={upd} onToast={onToast} />
      {data.card ? <CardPanel data={data} upd={upd} onToast={onToast} /> : null}
    </div>
  );
}

function SavingsPanel({ data, upd, onToast }) {
  const sv = data.savings;
  const cfg = data.config;
  const cur = C.todayKey();
  const bal = C.savingsBalance(data);
  const pendingDc = C.pendingDailyCash(data);
  const paydays = C.paydaysIn(cur, cfg.payAnchor);
  const per = sum(C.activeSavings(cfg, cur), (x) => x.biweekly);
  const due = paydays.length * per;
  const deposited = sum(sv.entries.filter((e) => e.type === 'deposit' && e.date.startsWith(cur)), (e) => e.amount);
  const dcMonth = C.dailyCashEstimate(data.months[cur], cfg.bills, cur);
  const proj = useMemo(() => C.projectSavings(data, 16), [data]);
  const stats = C.monthStats(data, cur);
  const goal = stats.fixed * 3;
  const hit = proj.find((p) => p.balance >= goal);
  const at = (k) => proj.find((p) => p.key === k);
  const [f, setF] = useState({ date: C.todayISO(), type: 'deposit', amount: '', note: '' });
  const [snap, setSnap] = useState({ balance: String(sv.balance), asOf: sv.asOf, apy: String(sv.apy) });
  useEffect(() => setSnap({ balance: String(sv.balance), asOf: sv.asOf, apy: String(sv.apy) }), [sv.balance, sv.asOf, sv.apy]);
  const [limit, setLimit] = useState(12);
  const ok = Number(f.amount) > 0 && f.date;
  const add = async (e) => {
    e.preventDefault();
    if (!ok) return;
    const a = C.round2(Number(f.amount));
    const entry = { id: C.uid(), date: f.date, type: f.type, amount: f.type === 'withdrawal' ? -a : a, note: f.note.trim(), absorbed: false };
    await upd((d) => d.savings.entries.push(entry));
    onToast({ text: `${C.ENTRY_LABEL[f.type]} of ${fmt(a)} logged`, undo: async () => (await upd((d) => (d.savings.entries = d.savings.entries.filter((x) => x.id !== entry.id))), onToast({ text: 'Removed' })) });
    setF({ ...f, amount: '', note: '' });
  };
  const remove = async (entry) => {
    await upd((d) => (d.savings.entries = d.savings.entries.filter((x) => x.id !== entry.id)));
    onToast({ text: `Removed ${C.ENTRY_LABEL[entry.type] || 'entry'}`, undo: async () => (await upd((d) => d.savings.entries.push(entry)), onToast({ text: 'Restored' })) });
  };
  const changed = String(sv.balance) !== snap.balance || sv.asOf !== snap.asOf || String(sv.apy) !== snap.apy;
  const update = async () => {
    await upd((d) => {
      d.savings.balance = C.round2(Number(snap.balance) || 0);
      d.savings.asOf = snap.asOf || C.todayISO();
      d.savings.apy = Number(snap.apy) || 0;
      C.absorbAll(d);
    });
    onToast({ text: 'Savings balance updated' });
  };
  const entries = [...sv.entries].sort(byDateDesc);
  const pts = proj.map((p) => ({ t: p.key, month: true, v: Math.round(p.balance) }));
  return (
    <>
      <section className="card">
        <div className="kpis">
          <Kpi label="Savings balance" value={fmt(bal)} tone="green" sub={`${sv.apy}% APY, about ${fmt(bal * C.monthlyRate(sv.apy))} a month${pendingDc > 0 ? `. Includes ${fmt(pendingDc)} Daily Cash since the last update` : ''}`} />
          <Kpi label="Deposited this month" value={fmt(deposited)} sub={due > 0 ? `of ${fmt0(due)}: ${plural(paydays.length, 'payday')} × ${fmt0(per)}` : 'No paydays scheduled this month'} />
          <Kpi label="Daily Cash this month" value={fmt(dcMonth)} sub="3% at Apple and a few Apple Pay partners, 2% Apple Pay, 1% the card itself" />
          <Kpi label="Three months of fixed costs" value={fmt0(goal)} sub={bal >= goal ? 'Reached' : hit ? `On track for about ${C.monthShort(hit.key)}` : 'Beyond the 16-month projection'} />
        </div>
      </section>
      <div className="bud-cols">
        <div className="col">
          <section className="card">
            <h2 className="card-title">Log a deposit or withdrawal</h2>
            <p className="muted small">Paycheck deposits count toward the monthly target. Everything else just grows the balance.</p>
            <form className="sv-form" onSubmit={add}>
              <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
              <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Type">
                {C.ENTRY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {C.ENTRY_LABEL[t]}
                  </option>
                ))}
              </select>
              <input className="input num" inputMode="decimal" placeholder="Amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Amount" />
              <input className="input" placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} aria-label="Note" />
              <button className="btn primary" type="submit" disabled={!ok}>
                Log it
              </button>
            </form>
            {entries.length ? (
              <ul className="list sv-entries">
                {entries.slice(0, limit).map((e) => (
                  <li key={e.id} className={`row-between ${e.absorbed ? 'absorbed' : ''}`} title={e.absorbed ? 'Already inside the balance snapshot' : undefined}>
                    <span>
                      {C.ENTRY_LABEL[e.type] || e.type}
                      <span className="muted small">
                        {' '}
                        · {C.dateLabel(e.date)} {e.date.slice(0, 4) !== C.todayISO().slice(0, 4) ? e.date.slice(0, 4) : ''}
                        {e.note ? ` · ${e.note}` : ''}
                      </span>
                    </span>
                    <span className="sv-amt">
                      <Money v={e.amount} sign className={e.amount < 0 ? 'c-red' : 'c-green'} />
                      <button className="x small-x" aria-label={`Remove ${C.ENTRY_LABEL[e.type] || 'entry'} of ${fmt(Math.abs(e.amount))}`} onClick={() => remove(e)}>
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">No entries yet.</p>
            )}
            {entries.length > limit ? (
              <button className="btn quiet block" onClick={() => setLimit(limit + 40)}>
                Show more
              </button>
            ) : null}
            <p className="muted small note">Faded entries were already inside the balance when you last updated it. Daily Cash from purchases in the expense log is added on its own.</p>
          </section>
        </div>
        <div className="col">
          <section className="card">
            <h2 className="card-title">Balance snapshot</h2>
            <p className="muted small">Copy the balance from your savings account now and then. Everything logged before you press Update counts as already inside it.</p>
            <div className="form-grid three">
              <label>
                <span className="muted small">Balance</span>
                <input className="input num" type="number" step="0.01" value={snap.balance} onChange={(e) => setSnap({ ...snap, balance: e.target.value })} aria-label="Savings balance" />
              </label>
              <label>
                <span className="muted small">As of</span>
                <input className="input" type="date" value={snap.asOf} onChange={(e) => setSnap({ ...snap, asOf: e.target.value })} aria-label="Balance as of" />
              </label>
              <label>
                <span className="muted small">APY %</span>
                <input className="input num" type="number" step="0.01" value={snap.apy} onChange={(e) => setSnap({ ...snap, apy: e.target.value })} aria-label="APY" />
              </label>
            </div>
            <button className="btn" onClick={update} disabled={!changed}>
              Update balance
            </button>
          </section>
          <section className="card">
            <h2 className="card-title">Where this is headed</h2>
            <p className="muted small">
              Scheduled deposits ({fmt0(per)} a paycheck now, stepping up as set in Settings) plus {sv.apy}% interest.
            </p>
            <LineChart points={pts} fmt={fmt0} label="Projected savings" color="green" height={170} gap={40} dots={false} refLine={goal > 0 ? { v: goal, label: '3 months fixed' } : undefined} />
            <ul className="list sv-marks">
              {[
                ['End of 2026', '2026-12'],
                ['June 2027', '2027-06'],
                ['End of 2027', '2027-12'],
              ]
                .filter(([, k]) => at(k))
                .map(([l, k]) => (
                  <li key={k} className="row-between">
                    <span>{l}</span>
                    <span className="num">{fmt0(at(k).balance)}</span>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function CardPanel({ data, upd, onToast }) {
  const card = data.card;
  const bal = C.cardBalance(data);
  const since = bal - (Number(card.balance) || 0);
  const used = card.limit > 0 ? bal / card.limit : 0;
  const carry = bal * ((Number(card.apr) || 0) / 100 / 12);
  const fields = () => ({ balance: String(card.balance), asOf: card.asOf, apr: String(card.apr), limit: String(card.limit), lastInterest: String(card.lastInterest || '') });
  const [f, setF] = useState(fields);
  useEffect(() => setF(fields()), [card.balance, card.asOf, card.apr, card.limit, card.lastInterest]);
  const [pay, setPay] = useState('200');
  const changed = ['balance', 'asOf', 'apr', 'limit', 'lastInterest'].some((k) => String(card[k] ?? '') !== f[k]);
  const update = async () => {
    await upd((d) => {
      d.card.balance = C.round2(Number(f.balance) || 0);
      d.card.asOf = f.asOf || C.todayISO();
      d.card.apr = Number(f.apr) || 0;
      d.card.limit = Number(f.limit) || 0;
      d.card.lastInterest = Number(f.lastInterest) || 0;
      C.absorbCard(d);
    });
    onToast({ text: 'Apple Card updated' });
  };
  const po = C.payoff(bal, card.apr, Number(pay) || 0);
  return (
    <section className="card card-panel">
      <div className="card-head">
        <h2 className="card-title">Apple Card</h2>
        <span className="muted small">Due the last day of the month</span>
      </div>
      <div className="kpis">
        <Kpi label="Card balance" value={fmt(bal)} sub={since > 0.005 ? `Includes ${fmt(since)} logged since ${C.dateLabel(card.asOf)}` : `As of ${C.dateLabel(card.asOf)}`} />
        <Kpi label="Credit used" value={pct(used)} sub={card.limit ? `of a ${fmt0(card.limit)} limit. Under 10% is best for your score.` : 'Add the limit below'} tone={used > 0.3 ? 'amber' : null} />
        <Kpi label="Cost of carrying it a month" value={fmt(carry)} sub={`at ${card.apr}% APR. Last statement charged ${fmt(card.lastInterest || 0)}.`} tone={carry > 0 ? 'red' : null} />
        <Kpi label="Pay in full by month end" value={fmt(bal)} sub="and the interest stays at zero" tone="green" />
      </div>
      <div className="bud-cols">
        <div className="col">
          <h3 className="ss-h">Update from Wallet</h3>
          <div className="form-grid">
            <label>
              <span className="muted small">Balance</span>
              <input className="input num" type="number" step="0.01" value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} aria-label="Card balance" />
            </label>
            <label>
              <span className="muted small">As of</span>
              <input className="input" type="date" value={f.asOf} onChange={(e) => setF({ ...f, asOf: e.target.value })} aria-label="Card balance as of" />
            </label>
            <label>
              <span className="muted small">APR %</span>
              <input className="input num" type="number" step="0.01" value={f.apr} onChange={(e) => setF({ ...f, apr: e.target.value })} aria-label="APR" />
            </label>
            <label>
              <span className="muted small">Limit</span>
              <input className="input num" type="number" step="1" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} aria-label="Credit limit" />
            </label>
            <label>
              <span className="muted small">Last interest</span>
              <input className="input num" type="number" step="0.01" value={f.lastInterest} onChange={(e) => setF({ ...f, lastInterest: e.target.value })} aria-label="Last interest charged" />
            </label>
          </div>
          <button className="btn" onClick={update} disabled={!changed}>
            Update card
          </button>
        </div>
        <div className="col">
          <h3 className="ss-h">If you carried it instead</h3>
          <label className="carry">
            Paying <input className="input num" type="number" step="10" min="0" value={pay} onChange={(e) => setPay(e.target.value)} aria-label="Monthly payment" /> a month
          </label>
          <p className="small">{bal <= 0 ? 'Nothing to carry.' : po ? `${plural(po.months, 'month')} to clear ${fmt(bal)}, and ${fmt(po.interest)} of it would be interest.` : 'That payment doesn’t cover the monthly interest, so the balance would grow.'}</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- outlook
export function OutlookView({ data, auto, goSavings, dark }) {
  const today = C.todayISO();
  const cur = C.todayKey();
  const nw = useMemo(() => I.netWorth(data, { auto, today }), [data, auto, today]);
  const snaps = Object.entries(data.netWorth || {}).sort(([a], [b]) => (a < b ? -1 : 1));
  const pts = snaps.map(([k, s]) => ({ t: k, month: true, v: Math.round(s.total) }));
  const prev = snaps.filter(([k]) => k < cur).pop();
  const ms = useMemo(() => I.milestones(data, today), [data, today]);
  const freed = ms.length ? ms[ms.length - 1].freedSoFar : 0;
  const lastBill = [...ms].reverse().find((m) => m.kind === 'bill');
  const p = data.portfolio;
  return (
    <div className="bud-outlook">
      <div className="bud-cols">
        <div className="col">
          <section className="card nw">
            <div className="card-head">
              <h2 className="card-title">Net worth</h2>
              {prev ? (
                <span className={`small num ${nw.total - prev[1].total >= 0 ? 'c-green' : 'c-red'}`}>
                  {nw.total - prev[1].total >= 0 ? '+' : '−'}
                  {fmt0(Math.abs(nw.total - prev[1].total))} since {C.monthName(prev[0])}
                </span>
              ) : null}
            </div>
            <div className={`big num ${nw.total < 0 ? 'neg' : ''}`}>{nw.total < 0 ? '−' : ''}{fmt0(Math.abs(nw.total))}</div>
            <ul className="list nw-rows">
              <li className="row-between">
                <span>Savings</span>
                <Money v={nw.savings} />
              </li>
              {p ? (
                <li className="row-between">
                  <span>
                    Stocks
                    <span className="muted small"> · {p.refreshedAt ? `prices from ${new Date(p.refreshedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'no prices yet'}</span>
                  </span>
                  <Money v={nw.stocks} />
                </li>
              ) : null}
              {data.card ? (
                <li className="row-between">
                  <span>Apple Card</span>
                  <Money v={-nw.card} />
                </li>
              ) : null}
              {nw.loan > 0 ? (
                <li className="row-between">
                  <span>
                    Car loan<span className="muted small"> · {nw.loanNote}</span>
                  </span>
                  <Money v={-nw.loan} />
                </li>
              ) : null}
            </ul>
            {pts.length >= 2 ? (
              <LineChart points={pts} fmt={fmt0} label="Net worth" color="blue" height={150} gap={40} />
            ) : (
              <p className="muted small note">A reading is saved each month when you open the budget, so this becomes a chart over time.</p>
            )}
          </section>
        </div>
        <div className="col">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">What’s coming</h2>
              {freed > 0 && lastBill ? <span className="muted small num">+{fmt0(freed)} a month by {C.monthShort(lastBill.key)}</span> : null}
            </div>
            {ms.length ? (
              <ol className="mtl">
                {ms.map((m) => (
                  <li key={`${m.kind}-${m.key}-${m.title}`} className={`mt-${m.kind}`}>
                    <span className="mt-dot" aria-hidden="true" />
                    <div className="mt-when small">
                      <b>{C.monthShort(m.key)}</b>
                      <span className="muted"> · {m.months <= 0 ? 'this month' : `in ${plural(m.months, 'month')}`}</span>
                    </div>
                    <div className="mt-title">{m.title}</div>
                    <div className="muted small">{m.detail}</div>
                    {m.frees > 0 ? (
                      <div className="small c-green num">
                        +{fmt0(m.frees)} a month{m.freedSoFar > m.frees ? ` (${fmt0(m.freedSoFar)} a month freed by then)` : ''}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">Nothing scheduled. Bills with an end month and savings steps in Settings show up here.</p>
            )}
            <button className="btn small quiet" onClick={goSavings}>
              Savings projection
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- stocks
const tickersOf = (p) => [...new Set(p.holdings.map((h) => String(h.ticker || '').trim().toUpperCase()).filter(Boolean))];
const signed = (v) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;
const pctStr = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`);
export function StocksView({ data, upd, onToast }) {
  const p = data.portfolio;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [paste, setPaste] = useState('');
  const [pasting, setPasting] = useState(() => !p || p.holdings.length === 0);
  const tried = useRef(false);
  const refresh = async () => {
    const tickers = tickersOf(data.portfolio);
    if (!tickers.length || busy) return;
    if (IS_DEMO) {
      setErr('Prices don’t refresh in the demo.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const q = await C.fetchQuotes(tickers);
      await upd((d) => {
        d.portfolio.quotes = { ...d.portfolio.quotes, ...q };
        d.portfolio.refreshedAt = new Date().toISOString();
      });
    } catch (e) {
      setErr(`Couldn’t get prices: ${e.message || e}`);
    }
    setBusy(false);
  };
  useEffect(() => {
    if (tried.current || !p || !p.holdings.length || IS_DEMO) return;
    tried.current = true;
    const age = p.refreshedAt ? Date.now() - new Date(p.refreshedAt).getTime() : Infinity;
    if (age > 15 * 60000) refresh();
  }, []);
  if (!p)
    return (
      <section className="card">
        <p className="empty">The stock tracker isn’t set up yet.</p>
        <button className="btn primary" onClick={() => upd((d) => (d.portfolio = C.defaultPortfolio()))}>
          Start tracking stocks
        </button>
      </section>
    );
  const r = C.portfolioRows(data);
  const based = r.rows.filter((h) => h.value != null && h.basis > 0);
  const invested = sum(based, (h) => h.basis);
  const gain = sum(based, (h) => h.value) - invested;
  const savings = data.savings ? C.savingsBalance(data) : 0;
  const owed = data.card ? C.cardBalance(data) : 0;
  const when = p.refreshedAt ? new Date(p.refreshedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not yet';
  const doPaste = async () => {
    const list = C.parseHoldings(paste);
    if (!list.length) {
      setErr('Nothing recognized. One line per holding: ticker, shares, cost basis.');
      return;
    }
    setErr('');
    await upd((d) =>
      list.forEach((h) => {
        const ex = d.portfolio.holdings.find((x) => String(x.ticker).toUpperCase() === h.ticker);
        if (ex) {
          ex.shares = h.shares;
          ex.basis = h.basis;
        } else d.portfolio.holdings.push({ id: C.uid(), ...h });
      })
    );
    setPaste('');
    setPasting(false);
    onToast({ text: `${plural(list.length, 'holding')} saved` });
    tried.current = false;
  };
  const setField = (id, k, v) => upd((d) => {
    const h = d.portfolio.holdings.find((x) => x.id === id);
    if (h) h[k] = v === '' ? 0 : Number(v);
  });
  const remove = async (h) => {
    await upd((d) => (d.portfolio.holdings = d.portfolio.holdings.filter((x) => x.id !== h.id)));
    onToast({ text: `Removed ${h.ticker}`, undo: async () => (await upd((d) => d.portfolio.holdings.push(h)), onToast({ text: 'Restored' })) });
  };
  return (
    <div className="bud-stocks">
      <section className="card">
        <div className="kpis">
          <Kpi label="Account value" value={fmt(r.total)} sub={`${fmt0(r.positions)} in positions, ${fmt(r.cash)} cash`} />
          <Kpi label="Day’s change" value={signed(r.day)} tone={r.day < 0 ? 'red' : r.day > 0 ? 'green' : null} sub={`Prices refreshed ${when}`} />
          {based.length ? (
            <Kpi label="Unrealized gain" value={signed(gain)} tone={gain < 0 ? 'red' : 'green'} sub={`${gain >= 0 ? '+' : '−'}${pct(Math.abs(invested ? gain / invested : 0))} on ${fmt0(invested)} invested${based.length < r.rows.length ? ` (${plural(based.length, 'holding')} with a cost basis)` : ''}`} />
          ) : (
            <Kpi label="Unrealized gain" value="—" sub="Add a cost basis to a holding to see its gain" />
          )}
          <Kpi label="Portfolio, savings, card" value={fmt(r.total + savings - owed)} sub={`${fmt0(r.total)} plus ${fmt0(savings)} saved, minus ${fmt0(owed)} owed`} />
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Holdings</h2>
            <span className="muted small">Shares and cost basis are yours to edit; prices come from Finnhub.</span>
          </div>
          <span className="row-gap">
            <button className="btn small quiet" onClick={() => setPasting(!pasting)}>
              {pasting ? 'Close' : 'Paste holdings'}
            </button>
            <button className="btn small" onClick={refresh} disabled={busy || !p.holdings.length}>
              {busy ? 'Fetching…' : 'Refresh prices'}
            </button>
          </span>
        </div>
        {err ? <p className="small c-red">{err}</p> : null}
        {pasting ? (
          <div className="paste">
            <textarea className="input" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'One line per holding: ticker, shares, cost basis\nVTI 12.5 3100'} aria-label="Holdings to paste" />
            <button className="btn primary" onClick={doPaste} disabled={!paste.trim()}>
              Save holdings
            </button>
          </div>
        ) : null}
        {r.rows.length ? (
          <ul className="list holds">
            {r.rows.map((h) => (
              <li key={h.id} className="hold">
                <div className="h-name">
                  <b>{h.ticker}</b>
                  <span className="muted small num">{h.price != null ? fmt(h.price) : h.q && h.q.as_of === 'not found' ? 'not found' : 'no price yet'}</span>
                  {h.q && h.q.change_pct != null ? <span className={`small num ${h.q.change_pct < 0 ? 'c-red' : 'c-green'}`}>{pctStr(h.q.change_pct)}</span> : null}
                </div>
                <label className="h-f">
                  <span className="muted small">Shares</span>
                  <Commit type="number" className="input num" step="0.001" min="0" value={h.shares} onCommit={(v) => setField(h.id, 'shares', v)} aria-label={`${h.ticker} shares`} />
                </label>
                <label className="h-f">
                  <span className="muted small">Cost basis</span>
                  <Commit type="number" className="input num" step="0.01" min="0" value={h.basis} onCommit={(v) => setField(h.id, 'basis', v)} aria-label={`${h.ticker} cost basis`} />
                </label>
                <div className="h-val">
                  <b className="num">{h.value != null ? fmt(h.value) : '—'}</b>
                  {h.gain != null && h.basis > 0 ? <span className={`small num ${h.gain < 0 ? 'c-red' : 'c-green'}`}>{signed(h.gain)}</span> : null}
                </div>
                <button className="x small-x" aria-label={`Remove ${h.ticker}`} onClick={() => remove(h)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No holdings yet. Paste them, or add one below.</p>
        )}
        <div className="bud-cols tight">
          <AddHolding upd={upd} onAdded={() => (tried.current = false)} />
          <label className="h-cash">
            <span className="muted small">Cash in the account</span>
            <Commit type="number" className="input num" step="0.01" value={p.cash} onCommit={(v) => upd((d) => (d.portfolio.cash = v === '' ? 0 : Number(v)))} aria-label="Cash in the account" />
          </label>
        </div>
        <p className="muted small note">A value tracker, not advice: it shows what the positions are worth and nothing about what to do with them.</p>
      </section>
      {r.rows.length ? <Movers data={data} upd={upd} rows={r.rows} day={r.day} /> : null}
    </div>
  );
}

function AddHolding({ upd, onAdded }) {
  const [f, setF] = useState({ ticker: '', shares: '', basis: '' });
  const ok = /^[A-Za-z.]{1,6}$/.test(f.ticker.trim()) && Number(f.shares) > 0;
  const add = async (e) => {
    e.preventDefault();
    if (!ok) return;
    const t = f.ticker.trim().toUpperCase();
    await upd((d) => {
      const ex = d.portfolio.holdings.find((x) => String(x.ticker).toUpperCase() === t);
      if (ex) {
        ex.shares = Number(f.shares);
        ex.basis = Number(f.basis) || 0;
      } else d.portfolio.holdings.push({ id: C.uid(), ticker: t, shares: Number(f.shares), basis: Number(f.basis) || 0 });
    });
    setF({ ticker: '', shares: '', basis: '' });
    onAdded();
  };
  return (
    <form className="add-hold" onSubmit={add}>
      <input className="input" placeholder="Ticker" value={f.ticker} onChange={(e) => setF({ ...f, ticker: e.target.value })} aria-label="Ticker" />
      <input className="input num" type="number" step="0.001" min="0" placeholder="Shares" value={f.shares} onChange={(e) => setF({ ...f, shares: e.target.value })} aria-label="Shares" />
      <input className="input num" type="number" step="0.01" min="0" placeholder="Cost basis" value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })} aria-label="Cost basis" />
      <button className="btn small" type="submit" disabled={!ok}>
        Add
      </button>
    </form>
  );
}

function Movers({ data, upd, rows, day }) {
  const p = data.portfolio;
  const today = C.todayISO();
  const brief = p.brief && p.brief.date === today ? p.brief : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const tried = useRef(false);
  const tickers = tickersOf(p);
  const load = async () => {
    if (!tickers.length || busy || IS_DEMO) return;
    setBusy(true);
    setErr('');
    try {
      const b = await C.fetchBrief(tickers);
      await upd((d) => (d.portfolio.brief = { date: C.todayISO(), fetchedAt: new Date().toISOString(), market: b.market || {}, news: b.news || {} }));
    } catch (e) {
      setErr(`Couldn’t pull the day’s news: ${e.message || e}`);
    }
    setBusy(false);
  };
  useEffect(() => {
    if (tried.current || brief || !tickers.length || IS_DEMO) return;
    tried.current = true;
    load();
  }, []);
  const moved = rows.filter((r) => r.q && r.q.change_pct != null).sort((a, b) => Math.abs(b.dayValue || 0) - Math.abs(a.dayValue || 0));
  const news = (t) => ((brief && brief.news && brief.news[t]) || []).slice(0, 2);
  const mk = (brief && brief.market) || {};
  const top = moved[0];
  return (
    <section className="card movers">
      <div className="card-head">
        <div>
          <h2 className="card-title">Today’s movers</h2>
          <span className="muted small">
            {mk.SPY || mk.QQQ ? `S&P 500 ${pctStr(mk.SPY && mk.SPY.change_pct)}, Nasdaq ${pctStr(mk.QQQ && mk.QQQ.change_pct)}. ` : ''}
            Your positions {day >= 0 ? 'up' : 'down'} {fmt(Math.abs(day))} on the day.
          </span>
        </div>
        <button className="btn small quiet" onClick={load} disabled={busy || IS_DEMO}>
          {busy ? 'Fetching news…' : 'Refresh'}
        </button>
      </div>
      {err ? <p className="small c-red">{err}</p> : null}
      {!brief && !busy && !err ? <p className="muted small">{IS_DEMO ? 'Company news doesn’t load in the demo.' : 'Opens with the day’s news once prices have loaded.'}</p> : null}
      {busy && !brief ? <p className="muted small">Pulling headlines for {tickers.join(', ')}…</p> : null}
      {top ? (
        <p className="small">
          {top.ticker} moved the portfolio most today, {top.q.change_pct >= 0 ? 'adding' : 'taking'} {fmt(Math.abs(top.dayValue || 0))} at {pctStr(top.q.change_pct)}.
          {moved.length > 1 ? ` ${moved.filter((x) => x.q.change_pct > 0).length} of your ${moved.length} positions are up.` : ''}
        </p>
      ) : null}
      {brief
        ? moved
            .filter((x) => news(x.ticker).length)
            .map((x) => (
              <div key={x.ticker} className="mover">
                <div className="row-gap">
                  <b>{x.ticker}</b>
                  <span className={`small num ${x.q.change_pct < 0 ? 'c-red' : 'c-green'}`}>{pctStr(x.q.change_pct)}</span>
                  {x.dayValue != null ? <span className="muted small num">{signed(x.dayValue)} on your position</span> : null}
                </div>
                <ul className="mover-news">
                  {news(x.ticker).map((n, i) => (
                    <li key={i} className="small">
                      {n.url ? (
                        <a href={n.url} target="_blank" rel="noopener noreferrer">
                          {n.headline}
                        </a>
                      ) : (
                        n.headline
                      )}
                      {n.source ? <span className="muted"> · {n.source}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))
        : null}
    </section>
  );
}

// ---------------------------------------------------------------- year
export function YearView({ data, openCategory }) {
  const keys = Object.keys(data.months).sort();
  const years = [...new Set(keys.map((k) => k.slice(0, 4)))];
  const [year, setYear] = useState(years.includes(C.todayKey().slice(0, 4)) ? C.todayKey().slice(0, 4) : years[years.length - 1]);
  if (!keys.length) return <p className="empty">Add a month to see the year.</p>;
  const cur = C.todayKey();
  const ks = keys.filter((k) => k.startsWith(year) && k <= cur);
  const stats = Object.fromEntries(ks.map((k) => [k, C.monthStats(data, k)]));
  const cats = data.config.categories;
  const budget = sum(cats, (c) => c.budget);
  const spent = sum(ks, (k) => stats[k].spent);
  const net = sum(ks, (k) => stats[k].net);
  const income = sum(ks, (k) => stats[k].income);
  const slots = Array.from({ length: 12 }, (_, i) => `${year}-${C.pad2(i + 1)}`);
  const pts = ks.map((k) => ({ t: k, month: true, v: C.round2(stats[k].spent), cls: stats[k].spent > budget ? 'red' : 'green' }));
  return (
    <div className="bud-year">
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Year at a glance</h2>
            <span className="muted small">
              {plural(ks.length, 'month')} tracked. Spent {fmt0(spent)} of {fmt0(budget * ks.length)}; net {fmt0(net)} ({pct(income > 0 ? net / income : 0)} of income).
            </span>
          </div>
          {years.length > 1 ? (
            <select className="inline-select" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          ) : null}
        </div>
        <BarChart points={pts} slots={slots} fmt={fmt} label="Spending by month" goal={budget || undefined} goalLabel={budget ? `Budget ${fmt0(budget)}` : undefined} height={170} xLabels={[slots[0], slots[5], slots[11]]} />
      </section>
      <section className="card">
        <h2 className="card-title">By category</h2>
        <div className="table-scroll">
          <table className="ytable">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Budget</th>
                {ks.map((k) => (
                  <th key={k} className="num">
                    {C.monthAbbr(k)}
                  </th>
                ))}
                <th className="num">Avg</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => {
                const vals = ks.map((k) => stats[k].spentBy[c.name] || 0);
                return (
                  <tr key={c.id}>
                    <th scope="row">
                      <button className="linkish" onClick={() => openCategory({ name: c.name, key: ks[ks.length - 1] })}>
                        {c.name}
                      </button>
                    </th>
                    <td className="num muted">{fmt0(c.budget)}</td>
                    {vals.map((v, i) => (
                      <td key={ks[i]} className={`num ${v > c.budget ? 'c-red' : ''}`}>
                        {v ? fmt0(v) : '—'}
                      </td>
                    ))}
                    <td className="num">{fmt0(ks.length ? sum(vals) / ks.length : 0)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Spending</th>
                <td className="num muted">{fmt0(budget)}</td>
                {ks.map((k) => (
                  <td key={k} className={`num ${stats[k].spent > budget ? 'c-red' : ''}`}>
                    {fmt0(stats[k].spent)}
                  </td>
                ))}
                <td className="num">{fmt0(ks.length ? spent / ks.length : 0)}</td>
              </tr>
              <tr>
                <th scope="row">Fixed costs</th>
                <td />
                {ks.map((k) => (
                  <td key={k} className="num">
                    {fmt0(stats[k].fixed)}
                  </td>
                ))}
                <td className="num">{fmt0(ks.length ? sum(ks, (k) => stats[k].fixed) / ks.length : 0)}</td>
              </tr>
              <tr>
                <th scope="row">Net</th>
                <td />
                {ks.map((k) => (
                  <td key={k} className={`num ${stats[k].net < 0 ? 'c-red' : 'c-green'}`}>
                    {fmt0(stats[k].net)}
                  </td>
                ))}
                <td className="num">{fmt0(ks.length ? net / ks.length : 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- settings
const BILL_TYPES = ['Housing', 'Utilities', 'Subscriptions', 'Insurance', 'Transportation', 'Debt', 'Phone & Internet', 'Other'];
export function SettingsView({ data, upd, onToast, alertStatus }) {
  const cfg = data.config;
  const cur = C.todayKey();
  const [bill, setBill] = useState(null);
  const use = useMemo(() => C.categoryUse(data), [data]);
  const list = (path) => (d) => path.split('.').reduce((o, k) => o[k], d);
  const setIn = (path, id, patch) => upd((d) => {
    const arr = list(path)(d);
    const x = arr.find((y) => y.id === id);
    if (x) Object.assign(x, patch);
  });
  const removeIn = (path, id) => upd((d) => {
    const parent = path.split('.');
    const key = parent.pop();
    const o = parent.reduce((a, k) => a[k], d);
    o[key] = o[key].filter((y) => y.id !== id);
  });
  const active = cfg.bills.filter((b) => !b.ends || b.ends >= cur);
  const ended = cfg.bills.filter((b) => b.ends && b.ends < cur);
  const incomeTotal = sum(cfg.incomes, (i) => i.biweekly);
  const renameCat = (c, name) => {
    const n = String(name).trim();
    if (!n || n === c.name) return;
    if (cfg.categories.some((x) => x.id !== c.id && x.name.toLowerCase() === n.toLowerCase())) {
      onToast({ text: `There’s already a category called ${n}`, error: true });
      return;
    }
    upd((d) => C.setCategories(d, d.config.categories.map((x) => (x.id === c.id ? { ...x, name: n } : x))));
    if (use[c.name]) onToast({ text: `Renamed to ${n}; ${plural(use[c.name], 'expense')} moved with it` });
  };
  return (
    <div className="bud-settings">
      <div className="bud-cols">
        <div className="col">
          <section className="card">
            <h2 className="card-title">Income and payday</h2>
            <p className="muted small">Biweekly take-home. Monthly is biweekly × 26 ÷ 12.</p>
            <ul className="list set-rows">
              {cfg.incomes.map((x) => (
                <li key={x.id} className="set-row">
                  <Commit className="input" value={x.name} onCommit={(v) => setIn('config.incomes', x.id, { name: v })} aria-label="Income source" />
                  <Commit type="number" className="input num" step="0.01" value={x.biweekly} onCommit={(v) => setIn('config.incomes', x.id, { biweekly: v === '' ? 0 : v })} aria-label={`${x.name} biweekly`} />
                  <button className="x small-x" aria-label={`Remove ${x.name || 'income'}`} onClick={() => removeIn('config.incomes', x.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="row-between set-foot">
              <button className="btn small quiet" onClick={() => upd((d) => d.config.incomes.push({ id: C.uid(), name: 'Income', biweekly: 0 }))}>
                + Add income
              </button>
              <span className="muted small num">
                {fmt(incomeTotal)} biweekly, {fmt((incomeTotal * 26) / 12)} a month
              </span>
            </div>
            <label className="set-inline">
              <span>Paid every two weeks, most recently on</span>
              <input className="input" type="date" value={cfg.payAnchor || ''} onChange={(e) => upd((d) => (d.config.payAnchor = e.target.value))} aria-label="A recent payday" />
            </label>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Bills</h2>
              <span className="muted small num">{fmt(sum(C.activeBills(cfg, cur), (b) => C.billCost(null, b)))} yours this month</span>
            </div>
            <ul className="list">
              {active.map((b) => (
                <li key={b.id}>
                  <BillRow b={b} onClick={() => setBill(b)} />
                </li>
              ))}
            </ul>
            <button className="btn small quiet" onClick={() => setBill({ id: C.uid(), name: '', category: 'Utilities', amount: 0, share: 1, card: true, day: '', starts: '', ends: '', isNew: true })}>
              + Add bill
            </button>
            {ended.length ? (
              <details className="ended">
                <summary className="small muted">Ended bills ({ended.length})</summary>
                <ul className="list">
                  {ended.map((b) => (
                    <li key={b.id}>
                      <BillRow b={b} onClick={() => setBill(b)} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>

          <section className="card">
            <h2 className="card-title">Savings targets</h2>
            <p className="muted small">Set aside from each paycheck. Use From and Until to schedule a change; each month uses the rows active then.</p>
            <ul className="list set-rows">
              {cfg.savings.map((x) => (
                <li key={x.id} className="set-row wrap">
                  <Commit className="input" value={x.name} onCommit={(v) => setIn('config.savings', x.id, { name: v })} aria-label="Savings target" />
                  <Commit type="number" className="input num" step="0.01" value={x.biweekly} onCommit={(v) => setIn('config.savings', x.id, { biweekly: v === '' ? 0 : v })} aria-label={`${x.name} per paycheck`} />
                  <input className="input" type="month" value={x.starts || ''} onChange={(e) => setIn('config.savings', x.id, { starts: e.target.value })} aria-label={`${x.name} from`} title="From" />
                  <input className="input" type="month" value={x.ends || ''} onChange={(e) => setIn('config.savings', x.id, { ends: e.target.value })} aria-label={`${x.name} until`} title="Until" />
                  <button className="x small-x" aria-label={`Remove ${x.name || 'target'}`} onClick={() => removeIn('config.savings', x.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="row-between set-foot">
              <button className="btn small quiet" onClick={() => upd((d) => d.config.savings.push({ id: C.uid(), name: 'Savings', biweekly: 0, starts: '', ends: '' }))}>
                + Add target
              </button>
              <span className="muted small num">{fmt(sum(C.activeSavings(cfg, cur), (x) => x.biweekly))} a paycheck now</span>
            </div>
          </section>
        </div>

        <div className="col">
          <section className="card">
            <h2 className="card-title">Spending categories</h2>
            <p className="muted small">Renaming a category moves every logged expense with it. A category in use can’t be removed.</p>
            <ul className="list set-rows">
              {cfg.categories.map((c) => (
                <li key={c.id} className="set-row">
                  <CategoryMark category={c.name} size={24} />
                  <Commit className="input" value={c.name} onCommit={(v) => renameCat(c, v)} aria-label={`Rename ${c.name}`} />
                  <Commit type="number" className="input num" step="1" min="0" value={c.budget} onCommit={(v) => setIn('config.categories', c.id, { budget: v === '' ? 0 : v })} aria-label={`${c.name} monthly budget`} />
                  <button className="x small-x" disabled={!!use[c.name]} title={use[c.name] ? `Used by ${plural(use[c.name], 'expense')}` : 'Remove'} aria-label={`Remove ${c.name}`} onClick={() => removeIn('config.categories', c.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="row-between set-foot">
              <button
                className="btn small quiet"
                onClick={() =>
                  upd((d) => {
                    let n = 'New category';
                    for (let i = 2; d.config.categories.some((c) => c.name === n); i++) n = `New category ${i}`;
                    d.config.categories.push({ id: C.uid(), name: n, budget: 0 });
                  })
                }
              >
                + Add category
              </button>
              <span className="muted small num">{fmt(sum(cfg.categories, (c) => c.budget))} a month</span>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Payment methods</h2>
            <p className="muted small">The choices when you add an expense. Apple Pay, Apple Card and Apple Store/Services earn Daily Cash.</p>
            <ul className="list set-rows">
              {cfg.paymentMethods.map((m, i) => (
                <li key={`${i}-${m}`} className="set-row">
                  <Commit className="input" value={m} onCommit={(v) => upd((d) => (d.config.paymentMethods[i] = String(v).trim()))} aria-label="Payment method" />
                  <button className="x small-x" disabled={cfg.paymentMethods.length <= 1} aria-label={`Remove ${m}`} onClick={() => upd((d) => d.config.paymentMethods.splice(i, 1))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn small quiet" onClick={() => upd((d) => d.config.paymentMethods.push('Other'))}>
              + Add method
            </button>
          </section>

          <section className="card">
            <h2 className="card-title">Roommates</h2>
            <p className="muted small">Shared bills split evenly between everyone here. With a Venmo username, Owed to you gets a request button with the amount and note filled in.</p>
            <ul className="list set-rows">
              {cfg.roommates.map((r) => (
                <li key={r.id} className="set-row">
                  <Commit className="input" value={r.name} placeholder="Name" onCommit={(v) => setIn('config.roommates', r.id, { name: v })} aria-label="Roommate name" />
                  <Commit className="input" value={r.venmo || ''} placeholder="Venmo username" onCommit={(v) => setIn('config.roommates', r.id, { venmo: String(v).trim().replace(/^@/, '') })} aria-label={`${r.name || 'Roommate'} Venmo username`} />
                  <button className="x small-x" aria-label={`Remove ${r.name || 'roommate'}`} onClick={() => removeIn('config.roommates', r.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn small quiet" onClick={() => upd((d) => d.config.roommates.push({ id: C.uid(), name: '', venmo: '' }))}>
              + Add roommate
            </button>
          </section>

          <AlertsCard data={data} upd={upd} onToast={onToast} status={alertStatus} />
          <ShortcutCard />
          <DataCard data={data} upd={upd} onToast={onToast} />
        </div>
      </div>
      {bill ? (
        <BillSheet
          bill={bill}
          onClose={() => setBill(null)}
          onSave={async (b) => {
            const { isNew, ...clean } = b;
            await upd((d) => {
              const i = d.config.bills.findIndex((x) => x.id === clean.id);
              if (i >= 0) d.config.bills[i] = { ...d.config.bills[i], ...clean };
              else d.config.bills.push(clean);
            });
            onToast({ text: isNew ? `Added ${clean.name}` : `Saved ${clean.name}` });
            setBill(null);
          }}
          onDelete={
            bill.isNew
              ? null
              : async () => {
                  const old = cfg.bills.find((x) => x.id === bill.id);
                  await upd((d) => (d.config.bills = d.config.bills.filter((x) => x.id !== bill.id)));
                  setBill(null);
                  onToast({ text: `Removed ${old.name}`, undo: async () => (await upd((d) => d.config.bills.push(old)), onToast({ text: 'Restored' })) });
                }
          }
        />
      ) : null}
    </div>
  );
}

function BillRow({ b, onClick }) {
  const share = C.billShare(b);
  const bits = [b.category || 'Bill', b.day ? (Number(b.day) >= 31 ? 'last day' : `the ${C.ordinal(Number(b.day))}`) : 'ticked by hand'];
  if (b.card) bits.push('Apple Card');
  if (share < 1) bits.push(`your ${Math.round(share * 100)}%`);
  if (b.starts) bits.push(`from ${C.monthShort(b.starts)}`);
  if (b.ends) bits.push(`through ${C.monthShort(b.ends)}`);
  return (
    <button className="txrow" onClick={onClick} aria-label={`Edit ${b.name}`}>
      <span className="grow">
        <b>{b.name || 'Untitled bill'}</b>
        <span className="muted small">{bits.join(' · ')}</span>
      </span>
      <span className="num">{fmt(b.amount)}</span>
    </button>
  );
}

function BillSheet({ bill, onSave, onDelete, onClose }) {
  const [f, setF] = useState(() => ({ ...bill, amount: String(bill.amount ?? ''), share: String(Math.round(C.billShare(bill) * 100)), dc: String(Math.round(C.billDc(bill) * 100)), day: bill.day === '' || bill.day == null ? '' : String(bill.day) }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const ok = String(f.name).trim() && f.amount !== '' && Number.isFinite(Number(f.amount));
  const save = () => {
    if (!ok) return;
    const day = f.day === '' ? '' : Math.max(1, Math.min(31, Math.round(Number(f.day))));
    const out = { ...f, name: String(f.name).trim(), category: String(f.category || '').trim(), amount: C.round2(Number(f.amount)), share: Math.max(0, Math.min(100, Number(f.share) || 0)) / 100, card: !!f.card, day, starts: f.starts || '', ends: f.ends || '' };
    if (f.card) out.dc = Number(f.dc) / 100;
    else delete out.dc;
    onSave(out);
  };
  return (
    <Sheet title={bill.isNew ? 'New bill' : bill.name || 'Bill'} onClose={onClose} className="bill-sheet">
      <div className="form-grid">
        <label className="span2">
          <span className="muted small">Name</span>
          <input className="input" value={f.name} onChange={set('name')} aria-label="Bill name" autoFocus={bill.isNew} />
        </label>
        <label>
          <span className="muted small">Type</span>
          <input className="input" list="bill-types" value={f.category || ''} onChange={set('category')} aria-label="Bill type" />
          <datalist id="bill-types">
            {BILL_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="muted small">Charged each month</span>
          <input className="input num" inputMode="decimal" value={f.amount} onChange={set('amount')} aria-label="Amount charged" />
        </label>
        <label>
          <span className="muted small">Your share %</span>
          <input className="input num" type="number" min="0" max="100" step="1" value={f.share} onChange={set('share')} aria-label="Your share percent" />
        </label>
        <label>
          <span className="muted small">Charge day (blank: tick by hand)</span>
          <input className="input num" type="number" min="1" max="31" step="1" value={f.day} onChange={set('day')} aria-label="Charge day" placeholder="—" />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={!!f.card} onChange={set('card')} /> Charged to the Apple Card
        </label>
        <label>
          <span className="muted small">Daily Cash</span>
          <select className="input" value={f.dc} onChange={set('dc')} disabled={!f.card} aria-label="Daily Cash percent">
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={String(n)}>
                {n}%
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">From (month)</span>
          <input className="input" type="month" value={f.starts || ''} onChange={set('starts')} aria-label="From month" />
        </label>
        <label>
          <span className="muted small">Until (month)</span>
          <input className="input" type="month" value={f.ends || ''} onChange={set('ends')} aria-label="Until month" />
        </label>
      </div>
      <p className="muted small">Day 31 means the last day of the month. A bill with a day ticks itself once it passes. From and Until are for bills that start or end, like installments or a new rate.</p>
      <div className="sheet-acts">
        <button className="btn primary" onClick={save} disabled={!ok}>
          Save
        </button>
        {onDelete ? (
          <button className="btn" onClick={onDelete}>
            Delete
          </button>
        ) : null}
        <button className="btn quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

// Phone alerts: a scheduled GitHub job reads the budget and posts to your ntfy topic.
export function newTopic() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(26);
  (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : { getRandomValues: (b) => b.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  return `dash-${Array.from(bytes, (b) => abc[b % abc.length]).join('')}`;
}
const ALERT_KINDS = [
  ['bills', 'Bill charges tomorrow'],
  ['budget', 'A category nears or passes its budget'],
  ['payday', 'Payday: what this paycheck covers'],
  ['roommates', 'A roommate hasn’t paid after 7 and 14 days'],
  ['monthly', 'Month wrap-up on the 1st'],
];
function AlertsCard({ data, upd, onToast, status }) {
  const a = { ...I.DEFAULT_ALERTS, ...(data.config.alerts || {}) };
  const set = (patch) => upd((d) => (d.config.alerts = { ...I.DEFAULT_ALERTS, ...(d.config.alerts || {}), ...patch }));
  const [sending, setSending] = useState(false);
  const test = async () => {
    if (!a.topic) return;
    if (IS_DEMO) {
      onToast({ text: 'Test alerts don’t send from the demo' });
      return;
    }
    setSending(true);
    try {
      const r = await fetch(`https://ntfy.sh/${encodeURIComponent(a.topic)}`, { method: 'POST', body: 'Alerts from your budget will look like this.', headers: { Title: 'Test from your dashboard', Tags: 'bell' } });
      onToast(r.ok ? { text: 'Test sent. Check your phone.' } : { text: `ntfy said ${r.status}`, error: true });
    } catch (e) {
      onToast({ text: `Couldn’t reach ntfy: ${e.message || e}`, error: true });
    }
    setSending(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(a.topic);
      onToast({ text: 'Topic copied' });
    } catch {
      onToast({ text: a.topic });
    }
  };
  return (
    <section className="card alerts">
      <h2 className="card-title">Phone alerts</h2>
      <p className="muted small">A daily job (GitHub Actions, about 8 am) checks the budget and sends these through ntfy. Your topic name is the only thing protecting them, so it’s long and random.</p>
      {a.topic ? (
        <>
          <div className="topic">
            <code>{a.topic}</code>
            <button className="btn small quiet" onClick={copy}>
              Copy
            </button>
            <button className="btn small" onClick={test} disabled={sending}>
              {sending ? 'Sending…' : 'Send a test'}
            </button>
          </div>
          <p className="muted small al-status">
            {status && status.lastRun
              ? `Last checked ${new Date(status.lastRun).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}: ${status.lastSent || 0} sent.`
              : 'The daily job hasn’t run yet. Finish the setup steps below.'}
          </p>
          <ul className="list al-kinds">
            {ALERT_KINDS.map(([k, l]) => (
              <li key={k}>
                <label className="check-row">
                  <input type="checkbox" checked={!!a[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {l}
                  {k === 'budget' ? (
                    <select className="inline-select" value={String(a.threshold)} onChange={(e) => set({ threshold: Number(e.target.value) })} aria-label="Warn at" disabled={!a.budget}>
                      {[0.75, 0.8, 0.9, 1].map((t) => (
                        <option key={t} value={String(t)}>
                          at {Math.round(t * 100)}%
                        </option>
                      ))}
                    </select>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
          <details className="al-setup">
            <summary className="small">Setup steps</summary>
            <ol className="small">
              <li>
                Install the ntfy app, tap +, and subscribe to the topic above (server ntfy.sh). <b>Send a test</b> to check it arrives.
              </li>
              <li>In the Firebase console for this project: Project settings → Service accounts → Generate new private key. It downloads a JSON file.</li>
              <li>
                In the GitHub repo: Settings → Secrets and variables → Actions → New repository secret. Name it <code>FIREBASE_SERVICE_ACCOUNT</code> and paste the whole file. Then delete the downloaded file.
              </li>
              <li>Actions → Budget alerts → Run workflow, to try it once. After that it runs every morning on its own.</li>
            </ol>
            <button className="btn small quiet" onClick={() => set({ topic: newTopic() })}>
              Make a new topic
            </button>
          </details>
        </>
      ) : (
        <button className="btn primary" onClick={() => set({ topic: newTopic() })}>
          Set up alerts
        </button>
      )}
    </section>
  );
}

function ShortcutCard() {
  const base = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : 'https://amast126.github.io/budget/';
  const url = `${base}#/add?amount=`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* shown below anyway */
    }
  };
  return (
    <section className="card shortcut">
      <h2 className="card-title">Log from Apple Pay</h2>
      <p className="muted small">An iPhone Shortcuts automation can open the add sheet, filled in, each time you pay. It opens Safari for a moment; tap Add and you’re done.</p>
      <details>
        <summary className="small">How to set it up</summary>
        <ol className="small">
          <li>Shortcuts → Automation → New Automation → Wallet. Pick Apple Card, choose Run Immediately, then New Blank Automation.</li>
          <li>
            Add <b>URL Encode</b> and set its text to <i>Shortcut Input › Merchant</i>.
          </li>
          <li>
            Add <b>URL</b>:{' '}
            <code className="wrap">
              {url}
              <i>Shortcut Input › Amount</i>&amp;merchant=<i>URL Encoded Text</i>
            </code>
          </li>
          <li>
            Add <b>Open URLs</b>. Done.
          </li>
        </ol>
        <div className="row-gap">
          <button className="btn small quiet" onClick={copy}>
            Copy the start of the URL
          </button>
          <a className="btn small quiet" href={`${base}${IS_DEMO ? location.search : ''}#/add?amount=6.75&merchant=Test%20Coffee`}>
            Try it
          </a>
        </div>
      </details>
    </section>
  );
}

function DataCard({ data, upd, onToast }) {
  const file = useRef(null);
  const [confirm, setConfirm] = useState(false);
  const exportJson = () => {
    try {
      const { updatedAt, client, ...clean } = data;
      const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `budget-${C.todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
    } catch {
      onToast({ text: 'Export didn’t work in this window. Try a desktop browser.', error: true });
    }
  };
  const importJson = async (f) => {
    try {
      const d = JSON.parse(await f.text());
      if (!d || typeof d !== 'object' || !d.config || !d.months) throw new Error('not a budget');
      const next = C.normalizeBudget(d);
      C.upgradeBudget(next);
      if (!window.confirm(`Replace the whole budget with ${f.name}? (${Object.keys(next.months).length} months)`)) return;
      await upd((cur) => {
        Object.keys(cur).forEach((k) => delete cur[k]);
        Object.assign(cur, next);
      });
      onToast({ text: 'Budget replaced from the file' });
    } catch {
      onToast({ text: 'That file isn’t a budget export. Use a JSON file from Export.', error: true });
    }
  };
  return (
    <section className="card">
      <h2 className="card-title">Your data</h2>
      <p className="muted small">Everything saves as you go. Export a copy now and then as a backup.</p>
      <div className="row-gap">
        <button className="btn small" onClick={exportJson}>
          Export JSON
        </button>
        <button className="btn small quiet" onClick={() => file.current && file.current.click()}>
          Import JSON
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => (e.target.files[0] && importJson(e.target.files[0]), (e.target.value = ''))} />
        <a className="btn small quiet" href={IS_DEMO ? 'budget-demo.html' : 'budget.html'} target="_blank" rel="noopener">
          Classic budget app <Icon name="ext" size={14} />
        </a>
      </div>
      {confirm ? (
        <div className="reset-confirm">
          <p className="small">This erases every month, bill and setting. Export first if you might want it back.</p>
          <div className="row-gap">
            <button
              className="btn danger small"
              onClick={async () => {
                await upd((cur) => {
                  Object.keys(cur).forEach((k) => delete cur[k]);
                  Object.assign(cur, C.seedBudget());
                });
                setConfirm(false);
                onToast({ text: 'Budget reset' });
              }}
            >
              Yes, erase everything
            </button>
            <button className="btn small quiet" onClick={() => setConfirm(false)}>
              Keep my data
            </button>
          </div>
        </div>
      ) : (
        <button className="btn small quiet danger-text" onClick={() => setConfirm(true)}>
          Reset budget…
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- statement import
export function ImportSheet({ data, upd, onToast, onClose, onDone }) {
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState('');
  const [edits, setEdits] = useState({});
  const [overrides, setOverrides] = useState(true);
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  const cats = data.config.categories.map((c) => c.name);
  const methods = data.config.paymentMethods;
  const read = async (f) => {
    setErr('');
    try {
      const st = I.parseStatement(await f.text());
      if (!st.rows.length) {
        setErr('That file doesn’t look like a statement. It needs Date, Description and Amount columns, like the CSV Apple Card exports.');
        return;
      }
      setPlan({ ...I.planImport(data, st.rows), format: st.format, name: f.name });
      setEdits({});
    } catch (e) {
      setErr(`Couldn’t read that file: ${e.message || e}`);
    }
  };
  const items = plan ? plan.items.map((it, i) => (it.action === 'add' && edits[i] ? { ...it, include: edits[i].include !== false, txn: { ...it.txn, ...edits[i].txn } } : it)) : [];
  const adds = items.map((it, i) => [it, i]).filter(([it]) => it.action === 'add');
  const chosen = adds.filter(([it]) => it.include !== false);
  const bills = items.filter((it) => it.action === 'bill');
  const dups = items.filter((it) => it.action === 'duplicate');
  const skips = items.filter((it) => it.action === 'skip');
  const changedBills = bills.filter((b) => b.override != null);
  const edit = (i, patch) => setEdits({ ...edits, [i]: { ...(edits[i] || {}), ...patch, txn: { ...((edits[i] || {}).txn || {}), ...(patch.txn || {}) } } });
  const go = async () => {
    setBusy(true);
    let res = { added: 0, billed: 0 };
    const ok = await upd((d) => (res = I.applyImport(d, items, { overrides })));
    setBusy(false);
    if (ok === false) return;
    const months = {};
    chosen.forEach(([it]) => (months[C.keyOf(it.txn.date)] = (months[C.keyOf(it.txn.date)] || 0) + 1));
    const top = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
    onToast({ text: `Imported ${plural(res.added, 'expense')}${res.billed ? `, updated ${plural(res.billed, 'bill')}` : ''}` });
    onDone(top ? top[0] : null);
  };
  return (
    <Sheet title="Import a statement" onClose={onClose} wide className="import-sheet">
      {!plan ? (
        <>
          <p className="small">
            In Wallet: Apple Card → Card Balance → pick a monthly statement → Export Transactions → CSV. Then choose the file here. It’s read in this browser; expenses you already logged, card payments and your bills are skipped.
          </p>
          <input ref={file} type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && read(e.target.files[0])} aria-label="Statement CSV" />
          {err ? <p className="small c-red">{err}</p> : null}
        </>
      ) : (
        <>
          <p className="small">
            <b>{plan.name}</b>: {plural(plan.counts.add, 'new expense')}, {plan.counts.duplicate} already logged, {plural(plan.counts.bill, 'bill')}, {plan.counts.skip} skipped.
            {plan.unknown ? ` ${plural(plan.unknown, 'merchant')} you haven’t used before: check ${plan.unknown === 1 ? 'its' : 'their'} category.` : ''}
          </p>
          {adds.length ? (
            <ul className="list imp-list">
              {adds.map(([it, i]) => (
                <li key={it.ext} className={`imp-row ${it.include === false ? 'off' : ''} ${it.known ? '' : 'unknown'}`}>
                  <input type="checkbox" checked={it.include !== false} onChange={(e) => edit(i, { include: e.target.checked })} aria-label={`Import ${it.txn.desc}`} />
                  <span className="imp-date muted small">{C.dateLabel(it.txn.date)}</span>
                  <input className="input imp-desc" value={it.txn.desc} onChange={(e) => edit(i, { txn: { desc: e.target.value } })} aria-label={`Description for ${it.row.merchant || it.row.desc}`} />
                  <select className="input" value={it.txn.category} onChange={(e) => edit(i, { txn: { category: e.target.value } })} aria-label={`Category for ${it.txn.desc}`}>
                    {cats.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <select className="input" value={it.txn.method} onChange={(e) => edit(i, { txn: { method: e.target.value } })} aria-label={`Paid with for ${it.txn.desc}`}>
                    {(methods.includes(it.txn.method) ? methods : [it.txn.method, ...methods]).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                  <span className="num imp-amt">{fmt(it.txn.amount)}</span>
                  {!it.known ? <span className="spill t-blue">New</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Nothing new to add: everything here is already in the budget.</p>
          )}
          {changedBills.length ? (
            <label className="check-row small">
              <input type="checkbox" checked={overrides} onChange={(e) => setOverrides(e.target.checked)} /> Save what {changedBills.length === 1 ? 'this bill' : 'these bills'} actually charged ({changedBills.map((b) => `${b.bill.name} ${fmt(b.override)}`).join(', ')})
            </label>
          ) : null}
          <details className="imp-more">
            <summary className="small">
              Skipped rows ({dups.length + bills.length + skips.length})
            </summary>
            <ul className="list small">
              {[...dups, ...bills, ...skips].map((it) => (
                <li key={it.ext} className="row-between">
                  <span>
                    {C.dateLabel(it.row.date)} {it.row.merchant || it.row.desc}
                    <span className="muted"> · {it.reason}</span>
                  </span>
                  <span className="num muted">{fmt(it.row.amount)}</span>
                </li>
              ))}
            </ul>
          </details>
          <p className="muted small">Categories you pick are remembered: next time the same merchant is filled in for you.</p>
          <div className="sheet-acts">
            <button className="btn primary" onClick={go} disabled={busy || (!chosen.length && !(overrides && changedBills.length))}>
              {busy ? 'Importing…' : chosen.length ? `Add ${plural(chosen.length, 'expense')} (${fmt(sum(chosen, ([it]) => it.txn.amount))})` : 'Save bill amounts'}
            </button>
            <button className="btn quiet" onClick={() => (setPlan(null), setEdits({}))}>
              Choose another file
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
