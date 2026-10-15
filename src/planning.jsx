// The Planning tab: a house on Long Island (with renovations) and a wedding, costed out and laid over your savings
// projection from the Budget, so you can see whether both fit and when.
import React, { useEffect, useMemo, useState } from 'react';
import { SectionTabs } from './learning.jsx';
import { useWidth, Tip, monthLabel } from './chart-kit.jsx';
import { Kpi } from './budget-ui.jsx';
import { fmt, fmt0, todayISO, dateLabel } from './budget-core.js';
import * as P from './planning-logic.js';

const money = (n) => fmt0(Math.round(n || 0));
const SECTION_KEYS = ['plan', 'house', 'wedding'];
const SECTIONS = [
  ['plan', 'The plan'],
  ['house', 'House'],
  ['wedding', 'Wedding'],
];
const cleanNum = (s) => String(s).replace(/[^0-9.]/g, '');
const shortMonth = (k) => (P.isKey(k) ? monthLabel(k) : '');
const dayText = (d) => (P.isDay(d) ? `${dateLabel(d)}, ${d.slice(0, 4)}` : '');

function useSection() {
  const fromHash = () => {
    const q = (location.hash.split('?')[1] || '').split('&')[0];
    return SECTION_KEYS.includes(q) ? q : null;
  };
  const [sec, setSec] = useState(() => {
    let saved = null;
    try {
      saved = localStorage.getItem('dash.planSection');
    } catch {
      /* private mode */
    }
    return fromHash() || (SECTION_KEYS.includes(saved) ? saved : 'plan');
  });
  useEffect(() => {
    const on = () => fromHash() && setSec(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const choose = (k) => {
    setSec(k);
    try {
      localStorage.setItem('dash.planSection', k);
    } catch {
      /* private mode */
    }
    if (location.hash.startsWith('#/planning')) history.replaceState(null, '', `#/planning?${k}`);
  };
  return [sec, choose];
}

// A number that saves when you leave the field (or press Enter).
function Field({ label, value, onSave, prefix, suffix, aria, wide }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => setV(value == null ? '' : String(value)), [value]);
  return (
    <label className={`pf ${wide ? 'pf-wide' : ''}`}>
      <span className="small muted">{label}</span>
      <span className="pf-in">
        {prefix ? <span className="pf-fix">{prefix}</span> : null}
        <input
          className="input num"
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(cleanNum(e.target.value))}
          onBlur={() => String(value == null ? '' : value) !== v && onSave(v === '' ? '' : Number(v))}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
          aria-label={aria || label}
        />
        {suffix ? <span className="pf-fix">{suffix}</span> : null}
      </span>
    </label>
  );
}

function RingMark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" className="pl-mark">
      <circle cx="16" cy="19" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 6.5h8l2 3-6 4.5-6-4.5z" fill="currentColor" opacity=".85" />
    </svg>
  );
}
function HouseMark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" className="pl-mark">
      <path d="M5 15 16 6l11 9M8 13v13h16V13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M14 26v-7h4v7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- the top: both goals and whether they fit
function PlanHero({ plan, view, t, mutate, go }) {
  const today = todayISO();
  const s = P.shareOf(plan);
  const h = plan.house;
  const w = plan.wedding;
  const wc = P.weddingCosts(w);
  const wk = P.weddingMonth(w);
  const m = P.houseMonthly(h);
  const cash = P.cashToBuy(h);
  const earliest = useMemo(() => (view && P.isKey(h.buyMonth) ? P.earliestBuy(plan, view, today) : null), [plan, view, today]);
  const half = s === 0.5 ? 'your half' : `your ${Math.round(s * 100)}%`;
  let verdict = null;
  if (!view) verdict = <p className="pl-verdict">Loading your budget…</p>;
  else if (!view.proj.length) verdict = <p className="pl-verdict">Set up savings in the Budget to see whether these fit.</p>;
  else if (!t || (!wk && !P.isKey(h.buyMonth))) verdict = <p className="pl-verdict">Pick a wedding date and a month to buy, and this checks both against your savings.</p>;
  else {
    const pct = view.income > 0 ? (m.total * s) / view.income : 0;
    const over = P.isKey(h.buyMonth) && pct > Number(h.maxPct) / 100 ? ` Your share of the house each month would be ${Math.round(pct * 100)}% of your take-home, over your ${h.maxPct}% limit.` : '';
    verdict = t.ok ? (
      <p className={`pl-verdict ${over ? 'short' : 'ok'}`}>
        <b>The cash fits.</b> The plans never pull your savings under your {plan.reserveMonths}-month cushion{t.low ? `; the lowest point is ${money(t.low.after)} in ${shortMonth(t.low.key)}` : ''}.{over}
      </p>
    ) : (
      <p className="pl-verdict short">
        <b>Short by {money(t.short)}</b> in {shortMonth(t.worst.key)}: the plans would take your savings under your {money(t.worst.reserve)} cushion.
        {P.isKey(h.buyMonth) && earliest && earliest !== h.buyMonth ? ` At this price you could buy in ${shortMonth(earliest)}.` : ''}
        {over}
      </p>
    );
  }
  return (
    <section className="card pl-hero">
      <div className="pl-goals">
        <button className="pl-goal wed" onClick={() => go('wedding')} aria-label="Wedding details">
          <RingMark />
          <span className="pl-g-k">Wedding</span>
          <span className="pl-g-v">{wk ? dayText(w.date) || shortMonth(wk) : 'Date not set'}</span>
          <span className="pl-g-s">{wk ? P.whenText(wk, today) : 'Set it under Wedding'}</span>
          <span className="pl-g-n num">
            {money(wc.total)} · {half} {money(Math.max(0, wc.total - wc.family) * s)}
          </span>
          <span className="pl-bar" aria-hidden="true">
            <i style={{ width: `${wc.total > 0 ? Math.min(100, (wc.paid / wc.total) * 100) : 0}%` }} />
          </span>
          <span className="pl-g-s">{wc.paid > 0 ? `${money(wc.paid)} paid` : 'Nothing paid yet'}</span>
        </button>
        <button className="pl-goal home" onClick={() => go('house')} aria-label="House details">
          <HouseMark />
          <span className="pl-g-k">House · {P.COUNTIES[h.county] ? P.COUNTIES[h.county].name : ''}</span>
          <span className="pl-g-v num">{money(h.price)}</span>
          <span className="pl-g-s">{P.isKey(h.buyMonth) ? `Buying ${shortMonth(h.buyMonth)}, ${P.whenText(h.buyMonth, today)}` : 'Buy month not set'}</span>
          <span className="pl-g-n num">
            {money(cash.total * s)} to buy · {money(m.total * s)} a month ({half})
          </span>
        </button>
      </div>
      {verdict}
      <div className="pl-when">
        <label>
          <span className="small muted">Wedding date</span>
          <input className="input" type="date" value={P.isDay(w.date) ? w.date : ''} onChange={(e) => mutate((d) => P.setWedding(d, { date: e.target.value }))} aria-label="Wedding date" />
        </label>
        <label>
          <span className="small muted">Buy the house in</span>
          <input className="input" type="month" value={h.buyMonth || ''} onChange={(e) => mutate((d) => P.setHouse(d, { buyMonth: e.target.value }))} aria-label="Month to buy" />
        </label>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the plan: the chart and what's coming
function PlanChart({ rows, outs }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  if (!rows || rows.length < 2) return <p className="empty">Not enough months to draw.</p>;
  const H = 210;
  const pad = { l: 44, r: 58, t: 12, b: 24 };
  const vals = rows.flatMap((r) => [r.saved, r.after, r.reserve]);
  const vmin = Math.min(0, ...vals);
  const vmax = Math.max(...vals, 1);
  const span = vmax - vmin;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 5, 10].map((x) => x * mag).find((x) => span / x <= 4) || 10 * mag;
  // the range hugs the data; grid lines sit on round numbers inside it
  const lo = vmin < 0 ? vmin - span * 0.04 : 0;
  const hi = vmax + span * 0.06;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) ticks.push(v);
  const n = rows.length - 1;
  const x = (i) => pad.l + (i / n) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const path = (f) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(r)).toFixed(1)}`).join(' ');
  const stepPath = rows.map((r, i) => `${i ? `L${x(i).toFixed(1)},${y(rows[i - 1].reserve).toFixed(1)} L` : 'M'}${x(i).toFixed(1)},${y(r.reserve).toFixed(1)}`).join(' ');
  const yl = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
  const last = rows[n];
  const marks = rows.map((r, i) => ({ r, i, kinds: [...new Set(outs.filter((o) => o.key === r.key).map((o) => o.kind))] })).filter((m) => m.kinds.length);
  // label an event only when it isn't crowding the one before (the line still marks it)
  let lastX = -1e9;
  marks.forEach((m) => {
    m.label = x(m.i) - lastX > 52 ? (m.kinds.includes('house') ? 'House' : m.kinds.includes('wedding') ? 'Wedding' : 'Reno') : '';
    if (m.label) lastX = x(m.i);
  });
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + pad.l;
    const i = Math.max(0, Math.min(n, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * n)));
    const r = rows[i];
    const lines = [{ text: monthLabel(r.key) }, { key: 'k-line pl-k-after', value: money(r.after), text: 'after the plans' }, { key: 'k-line pl-k-saved', value: money(r.saved), text: 'savings projection' }, { key: 'k-line pl-k-res', value: money(r.reserve), text: 'cushion' }];
    if (r.out > 0) lines.push({ text: `${money(r.out)} goes out this month` });
    setTip({ x: Math.min(W - 190, Math.max(0, x(i) + 10)), y: 2, i, lines });
  };
  const endY = [y(last.after), y(last.saved)];
  if (Math.abs(endY[0] - endY[1]) < 14) endY[endY[0] > endY[1] ? 0 : 1] += endY[0] > endY[1] ? 7 : -7;
  return (
    <div className="chart pl-chart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`Savings after the plans, ending at ${money(last.after)} in ${monthLabel(last.key)}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
            <text className="axis" x={pad.l - 6} y={y(v) + 4} textAnchor="end">
              {yl(v)}
            </text>
          </g>
        ))}
        <text className="axis" x={pad.l} y={H - 6}>
          {monthLabel(rows[0].key)}
        </text>
        <text className="axis" x={W - pad.r} y={H - 6} textAnchor="end">
          {monthLabel(last.key)}
        </text>
        {marks.map((m) => (
          <g key={m.r.key}>
            <line className="pl-event" x1={x(m.i)} x2={x(m.i)} y1={pad.t} y2={H - pad.b} />
            {m.label ? (
              <text className="axis pl-event-l" x={x(m.i) + 4} y={pad.t + 10}>
                {m.label}
              </text>
            ) : null}
          </g>
        ))}
        <path className="pl-ln res" d={stepPath} />
        <path className="pl-ln saved" d={path((r) => r.saved)} />
        <path className="pl-ln after" d={path((r) => r.after)} />
        {tip ? <line className="crosshair" x1={x(tip.i)} x2={x(tip.i)} y1={pad.t} y2={H - pad.b} /> : null}
        {tip ? <circle className="pl-dot" cx={x(tip.i)} cy={y(rows[tip.i].after)} r="4" /> : null}
        <text className="end-label num" x={x(n) + 6} y={endY[0] + 4}>
          {yl(last.after)}
        </text>
        {Math.abs(last.saved - last.after) >= 1 ? (
          <text className="axis num" x={x(n) + 6} y={endY[1] + 4}>
            {yl(last.saved)}
          </text>
        ) : null}
        <rect x={pad.l} y={0} width={Math.max(0, W - pad.l - pad.r)} height={H} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setTip(null)} />
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

function TimelineCard({ plan, view, t }) {
  return (
    <section className="card pl-time">
      <div className="card-head">
        <h2 className="card-title">Savings with the plans</h2>
      </div>
      <div className="legend small" aria-hidden="true">
        <span className="lg">
          <span className="lg-line pl-lg-after" />
          After the plans
        </span>
        <span className="lg">
          <span className="lg-line pl-lg-saved" />
          Savings projection
        </span>
        <span className="lg">
          <span className="lg-line pl-lg-res" />
          {plan.reserveMonths}-month cushion
        </span>
      </div>
      {t ? <PlanChart rows={t.rows} outs={t.outs} /> : <p className="empty">{view && !view.proj.length ? 'Set up savings in the Budget first.' : 'Loading…'}</p>}
      <p className="muted small note">
        The projection is the Budget’s: scheduled paycheck savings, planned deposits and interest. The plans take out {Math.round(P.shareOf(plan) * 100)}% of each cost, and the money taken out stops earning interest. The cushion is {plan.reserveMonths} months of your bills, with the house in place of rent once you own it.
      </p>
    </section>
  );
}

function ComingCard({ t }) {
  const outs = t ? t.outs : [];
  return (
    <section className="card">
      <h2 className="card-title">What comes out, and when</h2>
      {outs.length ? (
        <ul className="list pl-outs">
          {outs.map((o, i) => (
            <li key={`${o.key}-${i}`} className="row-between">
              <span className="grow">
                <b>{shortMonth(o.key)}</b>
                <span className="muted small"> · {o.label}</span>
              </span>
              <span className="num">{money(o.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Nothing scheduled yet. Pick a wedding date or a month to buy.</p>
      )}
      <p className="muted small note">Your share only. Wedding payments land on their due dates; anything not scheduled lands in the wedding month.</p>
    </section>
  );
}

function SettingsCard({ plan, mutate }) {
  return (
    <section className="card">
      <h2 className="card-title">How it’s split</h2>
      <div className="pf-grid">
        <Field label="Your share of both" value={plan.share} suffix="%" onSave={(v) => mutate((d) => (d.share = Math.max(0, Math.min(100, Number(v) || 0))))} />
        <Field label="Cushion to keep" value={plan.reserveMonths} suffix="months" onSave={(v) => mutate((d) => (d.reserveMonths = Math.max(0, Math.min(24, Number(v) || 0))))} />
      </div>
      <p className="muted small">Your partner’s finances aren’t in here; the plan assumes they cover the other {100 - Math.round(P.shareOf(plan) * 100)}% of both, and the affordability check assumes a take-home like yours.</p>
      <details className="pl-sources">
        <summary className="small muted">Where the starting numbers come from</summary>
        <ul className="small">
          {P.SOURCES.map(([l, u]) => (
            <li key={u}>
              <a href={u} target="_blank" rel="noreferrer">
                {l}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------- the house
function HouseCard({ plan, mutate }) {
  const h = plan.house;
  const set = (k) => (v) => mutate((d) => P.setHouse(d, { [k]: v === '' ? '' : Number(v) }));
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">The house</h2>
        <select className="input pl-county" value={h.county} onChange={(e) => mutate((d) => P.setCounty(d, e.target.value))} aria-label="County">
          {Object.entries(P.COUNTIES).map(([k, c]) => (
            <option key={k} value={k}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="pf-grid">
        <Field label="Price" prefix="$" value={h.price} onSave={set('price')} wide />
        <Field label="Down payment" suffix="%" value={h.downPct} onSave={set('downPct')} />
        <Field label="Mortgage rate" suffix="%" value={h.rate} onSave={set('rate')} />
        <label className="pf">
          <span className="small muted">Loan</span>
          <select className="input" value={h.term} onChange={(e) => mutate((d) => P.setHouse(d, { term: Number(e.target.value) }))} aria-label="Loan term">
            <option value={30}>30-year fixed</option>
            <option value={15}>15-year fixed</option>
          </select>
        </label>
        <Field label="Property tax rate" suffix="%" value={h.taxRate} onSave={set('taxRate')} />
        <Field label="Or the listing’s tax bill" prefix="$" suffix="/yr" value={h.taxBill} onSave={set('taxBill')} />
        <Field label="Home insurance" prefix="$" suffix="/yr" value={h.insurance} onSave={set('insurance')} />
        <Field label="Upkeep to set aside" suffix="% / yr" value={h.maint} onSave={set('maint')} />
        <Field label="HOA" prefix="$" suffix="/mo" value={h.hoa} onSave={set('hoa')} />
        {Number(h.downPct) < 20 ? <Field label="PMI (under 20% down)" suffix="% / yr" value={h.pmi} onSave={set('pmi')} /> : null}
        <Field label="Your attorney" prefix="$" value={h.attorney} onSave={set('attorney')} />
      </div>
      {h.county === 'suffolk' ? (
        <label className="check-row small">
          <input type="checkbox" checked={!!h.eastEnd} onChange={(e) => mutate((d) => P.setHouse(d, { eastEnd: e.target.checked }))} /> In an East End town (Peconic Bay transfer tax)
        </label>
      ) : null}
      <p className="muted small note">
        Starting points: the {P.COUNTIES[h.county].name} median sale price and tax rate, and the current 30-year rate ({P.RATE}%). Tax bills vary a lot by school district, so a listing’s actual bill is better than the rate when you have one.
      </p>
    </section>
  );
}

function MonthlyCard({ plan, view }) {
  const h = plan.house;
  const s = P.shareOf(plan);
  const m = P.houseMonthly(h);
  const rent = view && P.isKey(h.buyMonth) ? view.rentAt(h.buyMonth) : view ? view.rentAt(todayISO().slice(0, 7)) : 0;
  const mine = m.total * s;
  const pctTake = view && view.income > 0 ? mine / view.income : null;
  const rows = [
    ['Mortgage (principal and interest)', m.pi],
    ['Property tax', m.tax],
    ['Home insurance', m.ins],
    ['PMI', m.pmi],
    ['Upkeep set-aside', m.maint],
    ['HOA', m.hoa],
  ].filter(([, v]) => v > 0);
  return (
    <section className="card">
      <h2 className="card-title">Each month</h2>
      <div className="kpis">
        <Kpi label="Total" value={money(m.total)} sub={`on a ${money(m.loan)} loan`} />
        <Kpi label={s === 0.5 ? 'Your half' : 'Your share'} value={money(mine)} tone={pctTake != null && pctTake > Number(h.maxPct) / 100 ? 'red' : 'green'} sub={pctTake != null ? `${Math.round(pctTake * 100)}% of your take-home` : ''} />
      </div>
      <ul className="list pl-rows">
        {rows.map(([l, v]) => (
          <li key={l} className="row-between">
            <span>{l}</span>
            <span className="num">{fmt(v)}</span>
          </li>
        ))}
      </ul>
      {rent > 0 ? (
        <p className="small note">
          Rent {P.isKey(h.buyMonth) ? `in ${shortMonth(h.buyMonth)}` : 'now'} is {money(rent)}, so your share runs{' '}
          <b className={mine > rent ? 'c-red' : 'c-green'}>
            {money(Math.abs(mine - rent))} {mine > rent ? 'more' : 'less'}
          </b>{' '}
          a month than renting.
        </p>
      ) : null}
    </section>
  );
}

function CashCard({ plan, view }) {
  const h = plan.house;
  const s = P.shareOf(plan);
  const cc = P.closingCosts(h);
  const c = P.cashToBuy(h);
  const atBuy = P.renosAtBuy(h);
  const today = todayISO();
  const earliest = useMemo(() => (view && view.proj.length ? P.earliestBuy(plan, view, today) : null), [plan, view, today]);
  return (
    <section className="card">
      <h2 className="card-title">Cash to buy</h2>
      <ul className="list pl-rows">
        <li className="row-between">
          <span>Down payment ({h.downPct}%)</span>
          <span className="num">{money(c.down)}</span>
        </li>
        <li>
          <details>
            <summary className="row-between">
              <span>Closing costs</span>
              <span className="num">{money(cc.total)}</span>
            </summary>
            <ul className="list pl-sub">
              {cc.items.map(([l, v]) => (
                <li key={l} className="row-between small">
                  <span className="muted">{l}</span>
                  <span className="num">{money(v)}</span>
                </li>
              ))}
            </ul>
          </details>
        </li>
        {atBuy.length ? (
          <li className="row-between">
            <span>Renovations right away ({atBuy.length})</span>
            <span className="num">{money(c.renos)}</span>
          </li>
        ) : null}
        <li className="row-between pl-total">
          <b>Total</b>
          <b className="num">{money(c.total)}</b>
        </li>
        <li className="row-between">
          <span>{s === 0.5 ? 'Your half' : 'Your share'}</span>
          <b className="num">{money(c.total * s)}</b>
        </li>
      </ul>
      {earliest ? (
        <p className="small note">
          With the wedding and your cushion, the earliest you could buy at this price is <b>{shortMonth(earliest)}</b> ({P.whenText(earliest, today)}).
        </p>
      ) : view && view.proj.length ? (
        <p className="small note c-red">Not within the next six years of your savings projection at this price.</p>
      ) : null}
    </section>
  );
}

function AffordCard({ plan, view, mutate }) {
  const h = plan.house;
  const a = useMemo(() => (view ? P.affordability(plan, view, todayISO()) : null), [plan, view]);
  if (!a) return null;
  return (
    <section className="card">
      <h2 className="card-title">How much house</h2>
      <div className="kpis">
        <Kpi label="Most you could take on" value={money(a.price)} tone={a.price >= Number(h.price) ? 'green' : 'red'} sub={a.byCash == null ? 'by the monthly cost (pick a buy month to check the cash too)' : a.limit === 'cash' ? 'limited by cash at the buy month' : 'limited by the monthly cost'} />
        <Kpi label="By the monthly cost" value={money(a.byMonthly)} sub={`your share within ${money(a.cap)} a month`} />
        {a.byCash != null ? <Kpi label="By cash at the buy month" value={money(a.byCash)} sub={`${money(a.cash)} free after the wedding and your cushion`} /> : null}
      </div>
      <label className="pl-slider">
        <span className="small muted">Your share of housing up to {h.maxPct}% of your take-home</span>
        <input type="range" min="20" max="50" step="1" value={Number(h.maxPct)} onChange={(e) => mutate((d) => P.setHouse(d, { maxPct: Number(e.target.value) }))} aria-label="Housing limit as a share of take-home" />
      </label>
      <p className="muted small note">Uses the tax rate, your down payment percent and today’s rate. A common rule keeps housing near 28% of gross pay, which is roughly 35–40% of take-home.</p>
    </section>
  );
}

function RenoCard({ plan, mutate, onToast }) {
  const h = plan.house;
  const [f, setF] = useState({ preset: '', name: '', cost: '', month: '' });
  const ok = f.name.trim() && Number(f.cost) > 0;
  const add = async (e) => {
    e.preventDefault();
    if (!ok) return;
    const r = { id: P.uid(), name: f.name.trim(), cost: Number(f.cost), month: f.month };
    if (await mutate((d) => P.addReno(d, r))) setF({ preset: '', name: '', cost: '', month: '' });
  };
  const remove = async (r) => {
    if (await mutate((d) => P.removeReno(d, r.id))) onToast({ text: `Removed ${r.name}`, undo: async () => mutate((d) => P.addReno(d, r)) });
  };
  return (
    <section className="card">
      <h2 className="card-title">Renovations</h2>
      {h.renos.length ? (
        <ul className="list pl-rows">
          {h.renos.map((r) => (
            <li key={r.id} className="row-between">
              <span className="grow">
                {r.name}
                <span className="muted small"> · {P.isKey(r.month) && P.isKey(h.buyMonth) && r.month > h.buyMonth ? shortMonth(r.month) : 'when you buy'}</span>
              </span>
              <span className="sv-amt">
                <span className="num">{money(r.cost)}</span>
                <button className="x small-x" aria-label={`Remove ${r.name}`} onClick={() => remove(r)}>
                  ×
                </button>
              </span>
            </li>
          ))}
          <li className="row-between pl-total">
            <b>Total</b>
            <b className="num">{money(h.renos.reduce((a, r) => a + Number(r.cost || 0), 0))}</b>
          </li>
        </ul>
      ) : (
        <p className="empty">None yet. Add what you’d want done.</p>
      )}
      <form className="pl-form" onSubmit={add}>
        <select
          className="input"
          value={f.preset}
          onChange={(e) => {
            const p = P.RENO_PRESETS.find(([n]) => n === e.target.value);
            setF(p ? { ...f, preset: p[0], name: p[0], cost: String(p[1]) } : { ...f, preset: '' });
          }}
          aria-label="Typical project"
        >
          <option value="">Typical projects…</option>
          {P.RENO_PRESETS.map(([n, c]) => (
            <option key={n} value={n}>
              {n} (~{money(c)})
            </option>
          ))}
        </select>
        <input className="input" placeholder="What" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Renovation" />
        <input className="input num" inputMode="decimal" placeholder="Cost" value={f.cost} onChange={(e) => setF({ ...f, cost: cleanNum(e.target.value) })} aria-label="Renovation cost" />
        <input className="input" type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} aria-label="Renovation month (blank: when you buy)" title="Blank: when you buy" />
        <button className="btn" type="submit" disabled={!ok}>
          Add
        </button>
      </form>
      <p className="muted small note">Typical costs are national averages; Long Island labor usually runs higher, so a contractor’s quote is worth swapping in. Leave the month blank to pay for it when you buy.</p>
    </section>
  );
}

// ---------------------------------------------------------------- the wedding
function WeddingCard({ plan, mutate }) {
  const w = plan.wedding;
  const s = P.shareOf(plan);
  const wc = P.weddingCosts(w);
  const today = todayISO();
  const wk = P.weddingMonth(w);
  const months = wk ? Math.max(1, P.monthsUntil(wk, today)) : null;
  const mine = wc.left * s;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">The estimate</h2>
        <span className="muted small num">{money(wc.total)}</span>
      </div>
      <div className="pf-grid">
        <label className="pf">
          <span className="small muted">Date</span>
          <input className="input" type="date" value={P.isDay(w.date) ? w.date : ''} onChange={(e) => mutate((d) => P.setWedding(d, { date: e.target.value }))} aria-label="Wedding date (estimate)" />
        </label>
        <Field label="Guests" value={w.guests} onSave={(v) => mutate((d) => P.setWedding(d, { guests: Math.max(0, Math.round(Number(v) || 0)) }))} />
      </div>
      <ul className="list pl-cats">
        {wc.rows.map((r) => (
          <li key={r.id} className="pl-cat">
            <span className="grow">
              {r.name}
              {r.booked != null ? <span className="spill t-green">Booked</span> : null}
              <span className="muted small pl-cat-sub">
                {r.booked != null ? `${money(r.booked)} booked (estimate ${money(r.est)})` : r.perGuest ? `${money(r.amount)} a guest × ${w.guests}` : 'estimate'}
                {r.paid > 0 ? ` · ${money(r.paid)} paid` : ''}
              </span>
            </span>
            {r.booked == null ? (
              <span className="pl-cat-in">
                <Field label={r.perGuest ? 'A guest' : 'Budget'} aria={`${r.name} ${r.perGuest ? 'per guest' : 'budget'}`} prefix="$" value={r.amount} onSave={(v) => mutate((d) => P.setCat(d, r.id, v))} />
              </span>
            ) : (
              <span className="num">{money(r.booked)}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="pf-grid">
        <Field label="Cushion on what’s not booked" suffix="%" value={w.cushion} onSave={(v) => mutate((d) => P.setWedding(d, { cushion: Math.max(0, Number(v) || 0) }))} />
        <Field label="Family is putting in" prefix="$" value={w.family} onSave={(v) => mutate((d) => P.setWedding(d, { family: Math.max(0, Number(v) || 0) }))} />
      </div>
      <ul className="list pl-rows">
        <li className="row-between">
          <span>Categories</span>
          <span className="num">{money(wc.sub)}</span>
        </li>
        {wc.cushion > 0 ? (
          <li className="row-between">
            <span>Cushion</span>
            <span className="num">{money(wc.cushion)}</span>
          </li>
        ) : null}
        {wc.family > 0 ? (
          <li className="row-between">
            <span>From family</span>
            <span className="num">−{money(wc.family)}</span>
          </li>
        ) : null}
        {wc.paid > 0 ? (
          <li className="row-between">
            <span>Paid so far</span>
            <span className="num">−{money(wc.paid)}</span>
          </li>
        ) : null}
        <li className="row-between pl-total">
          <b>Still to pay</b>
          <b className="num">{money(wc.left)}</b>
        </li>
        <li className="row-between">
          <span>{s === 0.5 ? 'Your half' : 'Your share'}</span>
          <b className="num">{money(mine)}</b>
        </li>
      </ul>
      {months ? (
        <p className="small note">
          About <b>{money(mine / months)} a month</b> until {shortMonth(wk)} covers your share without touching what’s already saved.
        </p>
      ) : (
        <p className="muted small note">Add a date to spread it out by month.</p>
      )}
      <p className="muted small note">Long Island weddings average about $67,000, roughly double the national $34,200. Catering here runs about $150–350 a guest.</p>
    </section>
  );
}

function VendorsCard({ plan, mutate, onToast }) {
  const w = plan.wedding;
  const [f, setF] = useState({ name: '', cat: 'venue', total: '' });
  const [open, setOpen] = useState(null);
  const [pay, setPay] = useState({ due: '', amount: '', note: '' });
  const ok = f.name.trim() && Number(f.total) > 0;
  const add = async (e) => {
    e.preventDefault();
    if (!ok) return;
    const v = { id: P.uid(), name: f.name.trim(), cat: f.cat, total: Number(f.total) };
    if (await mutate((d) => P.addVendor(d, v))) {
      setF({ name: '', cat: f.cat, total: '' });
      setOpen(v.id);
    }
  };
  const addPay = async (v) => {
    if (!(Number(pay.amount) > 0)) return;
    const p = { id: P.uid(), due: pay.due, amount: Number(pay.amount), note: pay.note };
    if (await mutate((d) => P.addPayment(d, v.id, p))) setPay({ due: '', amount: '', note: '' });
  };
  const removeVendor = async (v) => {
    if (await mutate((d) => P.removeVendor(d, v.id)))
      onToast({
        text: `Removed ${v.name}`,
        undo: async () =>
          mutate((d) => {
            d.wedding.vendors.push(JSON.parse(JSON.stringify(v)));
          }),
      });
  };
  const catName = (id) => (P.WEDDING_CATS.find((c) => c.id === id) || {}).name || id;
  return (
    <section className="card">
      <h2 className="card-title">Vendors</h2>
      {w.vendors.length ? (
        <ul className="list pl-vendors">
          {w.vendors.map((v) => {
            const paid = v.payments.filter((p) => p.paid).reduce((a, p) => a + Number(p.amount || 0), 0);
            const scheduled = v.payments.reduce((a, p) => a + Number(p.amount || 0), 0);
            const isOpen = open === v.id;
            return (
              <li key={v.id}>
                <button className="txrow pl-vrow" onClick={() => setOpen(isOpen ? null : v.id)} aria-expanded={isOpen} aria-label={`${v.name} payments`}>
                  <span className="grow">
                    <b>{v.name}</b>
                    <span className="muted small">
                      {catName(v.cat)} · {money(paid)} of {money(v.total)} paid
                    </span>
                  </span>
                  <span className="num">{money(v.total)}</span>
                </button>
                {isOpen ? (
                  <div className="pl-pays">
                    {v.payments.length ? (
                      <ul className="list">
                        {v.payments.map((p) => {
                          const late = !p.paid && P.isDay(p.due) && p.due < todayISO();
                          return (
                            <li key={p.id} className="row-between small">
                              <label className="check-row">
                                <input type="checkbox" checked={!!p.paid} onChange={() => mutate((d) => P.togglePaid(d, v.id, p.id))} aria-label={`Paid ${money(p.amount)}${p.due ? ` due ${p.due}` : ''}`} />
                                <span>
                                  {p.due ? dayText(p.due) : 'No date'}
                                  {p.note ? ` · ${p.note}` : ''}
                                  {late ? <span className="spill t-red">Overdue</span> : null}
                                </span>
                              </label>
                              <span className="sv-amt">
                                <span className="num">{money(p.amount)}</span>
                                <button className="x small-x" aria-label={`Remove the ${money(p.amount)} payment`} onClick={() => mutate((d) => P.removePayment(d, v.id, p.id))}>
                                  ×
                                </button>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="muted small">No payments yet. Add the deposit and the rest as they’re scheduled.</p>
                    )}
                    {scheduled < v.total - 0.5 ? <p className="muted small">{money(v.total - scheduled)} of the contract isn’t scheduled yet; it counts in the wedding month.</p> : null}
                    <div className="pl-form pl-payform">
                      <input className="input" type="date" value={pay.due} onChange={(e) => setPay({ ...pay, due: e.target.value })} aria-label="Payment due" />
                      <input className="input num" inputMode="decimal" placeholder="Amount" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: cleanNum(e.target.value) })} aria-label="Payment amount" />
                      <input className="input" placeholder="Note (deposit, final…)" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} aria-label="Payment note" />
                      <button className="btn small" onClick={() => addPay(v)} disabled={!(Number(pay.amount) > 0)}>
                        Add payment
                      </button>
                    </div>
                    <div className="pf-grid">
                      <Field label="Contract total" prefix="$" value={v.total} onSave={(x) => mutate((d) => P.updateVendor(d, v.id, { total: Math.max(0, Number(x) || 0) }))} aria={`${v.name} contract total`} />
                    </div>
                    <button className="btn small quiet" onClick={() => removeVendor(v)}>
                      Remove {v.name}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">No vendors yet. Once you book one, its contract replaces the estimate for that category.</p>
      )}
      <form className="pl-form" onSubmit={add}>
        <input className="input" placeholder="Vendor" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Vendor name" />
        <select className="input" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} aria-label="Vendor category">
          {P.WEDDING_CATS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input className="input num" inputMode="decimal" placeholder="Contract total" value={f.total} onChange={(e) => setF({ ...f, total: cleanNum(e.target.value) })} aria-label="Contract total" />
        <button className="btn" type="submit" disabled={!ok}>
          Add vendor
        </button>
      </form>
    </section>
  );
}

function DueCard({ plan, mutate }) {
  const due = P.unpaidPayments(plan.wedding).slice(0, 6);
  const today = todayISO();
  return (
    <section className="card">
      <h2 className="card-title">Payments coming up</h2>
      {due.length ? (
        <ul className="list pl-rows">
          {due.map((p) => (
            <li key={p.id} className="row-between">
              <label className="check-row grow">
                <input type="checkbox" checked={false} onChange={() => mutate((d) => P.togglePaid(d, p.vendor.id, p.id), `Marked ${money(p.amount)} paid`)} aria-label={`Mark ${p.vendor.name} ${money(p.amount)} paid`} />
                <span>
                  <b>{p.vendor.name}</b>
                  <span className="muted small">
                    {' '}
                    · {p.due ? dayText(p.due) : 'no date'}
                    {p.note ? ` · ${p.note}` : ''}
                  </span>
                  {P.isDay(p.due) && p.due < today ? <span className="spill t-red">Overdue</span> : null}
                </span>
              </label>
              <span className="num">{money(p.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Nothing scheduled. Payments you add to a vendor show up here.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- the page
export function PlanningPage({ plan, budget, mutate, error, onToast }) {
  const [section, setSection] = useSection();
  const today = todayISO();
  const view = useMemo(() => (budget ? P.budgetView(budget, today) : null), [budget, today]);
  const t = useMemo(() => (plan && view ? P.timeline(plan, view, today) : null), [plan, view, today]);
  const toast = onToast || (() => {});
  if (!plan) {
    return (
      <div className="home planning">
        <header className="page-head">
          <h1 className="page-title">Planning</h1>
        </header>
        <section className="card">
          <p className="empty">{error || 'Loading…'}</p>
        </section>
      </div>
    );
  }
  const go = (k) => {
    setSection(k);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <div className="home planning">
      <header className="page-head">
        <h1 className="page-title">Planning</h1>
        <p className="muted">A house and a wedding, on top of your budget</p>
      </header>
      {error ? <div className="alert">{error}</div> : null}
      <PlanHero plan={plan} view={view} t={t} mutate={mutate} go={go} />
      <SectionTabs list={SECTIONS} value={section} onChange={setSection} label="Planning sections" />
      {section === 'plan' ? (
        <div className="grid">
          <div className="col">
            <TimelineCard plan={plan} view={view} t={t} />
          </div>
          <div className="col">
            <ComingCard t={t} />
            <SettingsCard plan={plan} mutate={mutate} />
          </div>
        </div>
      ) : null}
      {section === 'house' ? (
        <div className="grid">
          <div className="col">
            <HouseCard plan={plan} mutate={mutate} />
            <RenoCard plan={plan} mutate={mutate} onToast={toast} />
          </div>
          <div className="col">
            <MonthlyCard plan={plan} view={view} />
            <CashCard plan={plan} view={view} />
            <AffordCard plan={plan} view={view} mutate={mutate} />
          </div>
        </div>
      ) : null}
      {section === 'wedding' ? (
        <div className="grid">
          <div className="col">
            <WeddingCard plan={plan} mutate={mutate} />
          </div>
          <div className="col">
            <DueCard plan={plan} mutate={mutate} />
            <VendorsCard plan={plan} mutate={mutate} onToast={toast} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
