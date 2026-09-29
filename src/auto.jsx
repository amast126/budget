import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { SectionTabs } from './learning.jsx';
import { LineChart } from './chart-kit.jsx';
import { fmt, todayISO, dateLabel } from './budget-logic.js';
import {
  profileOf,
  unitsOf,
  rulesOf,
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
  specsOf,
  setSpec,
  JOBS,
  WEAR_ITEMS,
  TREAD,
  PAD,
  tireState,
  brakeState,
  batteryState,
  addTread,
  addPads,
  addBatteryTest,
  setInstalled,
  removeWear,
  visitPlan,
  visitText,
  ageText,
  priceOf,
} from './auto-logic.js';
import { addFill, removeFill, skipCharge, pendingCharges, fuelStats } from './auto-fuel.js';
import { ownership, keepVsReplace, fundPlan, payment, setNext, setFund, setPrice, addWatch, removeWatch, compareWith, ultraFor, ULTRA, ULTRA_SOURCES, ULTRA_CHECKED } from './auto-costs.js';

const mi = (n) => `${Math.round(n).toLocaleString()} mi`;
const carName = (c) => `${c.year} ${c.make} ${c.model} ${c.trim}`.trim();
const TONE = { over: 'Overdue', soon: 'Due soon', near: 'Coming up', ok: 'OK', none: 'Not set' };
const every = (m) =>
  [m.miles ? `${m.miles.toLocaleString()} mi` : null, m.months ? (m.months >= 12 && m.months % 12 === 0 ? `${m.months / 12} yr` : `${m.months} mo`) : null].filter(Boolean).join(' or ');
const money0 = (n) => `$${Math.round(n).toLocaleString()}`;
const lower = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s); // "Oil & filter" → "oil & filter", "CVT fluid" stays
const perMileText = (n) => (n >= 1 ? `$${n.toFixed(2)}` : `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}¢`);
const cleanNum = (v) => String(v == null ? '' : v).replace(/[^\d.]/g, '');

// The car's picture: the Altima's photo, or a drawn crossover for a car without one.
function CarPic({ car, className }) {
  const img = profileOf(car).image;
  if (img) return <img className={className} src={img} alt={className.includes('cl-car') ? `${car.year} ${car.make} ${car.model}` : ''} />;
  return (
    <svg className={`${className} car-art`} viewBox="0 0 440 170" aria-hidden="true">
      <defs>
        <linearGradient id="ca-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbfcfd" />
          <stop offset="0.5" stopColor="#e3e7ec" />
          <stop offset="1" stopColor="#a9b2bd" />
        </linearGradient>
        <linearGradient id="ca-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4958" />
          <stop offset="1" stopColor="#0f161d" />
        </linearGradient>
        <radialGradient id="ca-rim" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#d9dee4" />
          <stop offset="0.6" stopColor="#7d8793" />
          <stop offset="1" stopColor="#3b434c" />
        </radialGradient>
      </defs>
      <ellipse cx="222" cy="154" rx="196" ry="9" fill="rgba(0,0,0,0.28)" />
      <path d="M28 124 C28 104 40 94 66 90 L126 82 C156 56 194 42 250 42 C300 42 332 56 360 78 L394 86 C412 91 420 102 420 116 L420 126 C420 132 415 136 408 136 L36 136 C31 136 28 131 28 124 Z" fill="url(#ca-body)" />
      <path d="M142 84 C170 62 202 54 246 54 C288 54 314 64 336 80 L328 85 L150 88 Z" fill="url(#ca-glass)" />
      <path d="M236 54 L232 87" stroke="#c9d0d8" strokeWidth="5" />
      <path d="M60 108 L404 104" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" fill="none" />
      <path d="M196 90 L200 132 M300 88 L302 132" stroke="rgba(60,70,82,0.35)" strokeWidth="1.2" />
      <rect x="252" y="99" width="22" height="3.5" rx="1.75" fill="#8c96a2" />
      <rect x="160" y="100" width="22" height="3.5" rx="1.75" fill="#8c96a2" />
      <path d="M398 94 C408 96 414 100 416 106 L396 104 Z" fill="#f4f8ff" />
      <path d="M30 100 C34 96 40 94 46 94 L44 104 L30 106 Z" fill="#c43c3c" />
      {[112, 338].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="132" r="31" fill="#15191e" />
          <circle cx={cx} cy="132" r="20" fill="url(#ca-rim)" />
          {[0, 72, 144, 216, 288].map((a) => (
            <path key={a} d={`M${cx} 132 L${cx + 18 * Math.cos((a * Math.PI) / 180)} ${132 + 18 * Math.sin((a * Math.PI) / 180)}`} stroke="#4a535d" strokeWidth="4" />
          ))}
          <circle cx={cx} cy="132" r="5" fill="#2a3037" />
        </g>
      ))}
    </svg>
  );
}

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
      .catch(() => setList((x) => x || Object.assign([], { failed: true })));
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
        <CarPic car={auto.car} className="auto-thumb" />
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
      {money && money.loan && money.loan.left > 0 ? (
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

// ---------------------------------------------------------------- the cluster (the page's header)
// Drawn as an instrument cluster at night: a gauge for the next service (how much of its interval is left), the
// car and its odometer on the center screen with warning lights above it, and a fuel gauge for what's left of this
// month's gas budget. Lights come on amber for something due soon and red for something overdue, and take you to it.
const GA = 120; // the gauges sweep from -120° to 120°
const polar = (r, deg) => [100 + r * Math.sin((deg * Math.PI) / 180), 100 - r * Math.cos((deg * Math.PI) / 180)];
const arc = (r, a0, a1) => {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
function Gauge({ frac, value, unit, caption, marks, low, tone, label, icon }) {
  const f = Math.max(0, Math.min(1, frac == null ? 0 : frac));
  const deg = -GA + 2 * GA * f;
  const ticks = [];
  for (let i = 0; i <= 32; i++) {
    const d = -GA + (i * 2 * GA) / 32;
    const major = i % 8 === 0;
    const [x0, y0] = polar(major ? 71 : 76, d);
    const [x1, y1] = polar(82, d);
    ticks.push(<line key={i} x1={x0} y1={y0} x2={x1} y2={y1} className={major ? 'cg-major' : 'cg-minor'} />);
  }
  return (
    <div className={`cl-gauge ${tone || ''}`} role="img" aria-label={label}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="96" className="cg-bezel" />
        <circle cx="100" cy="100" r="90" className="cg-face" />
        <path d={arc(87, -GA, GA)} className="cg-track" />
        <path d={arc(87, -GA, -GA + 2 * GA * low)} className="cg-low" />
        {f > 0 ? <path d={arc(87, -GA, deg)} className="cg-glow" /> : null}
        {ticks}
        {marks.map(([t, at]) => {
          const [x, y] = polar(61, -GA + 2 * GA * at);
          return (
            <text key={t} x={x} y={y + 5} className="cg-mark" textAnchor="middle">
              {t}
            </text>
          );
        })}
        <g className="cg-needle" style={{ '--deg': `${deg}deg` }}>
          <path d="M97.7 33 L99.3 7 L100.7 7 L102.3 33 Z" />
        </g>
        {icon ? <g transform="translate(90 152) scale(0.85)">{icon}</g> : null}
      </svg>
      <div className="cg-read">
        <b className="num">{value}</b>
        {unit ? <span className="cg-unit">{unit}</span> : null}
        <span className="cg-cap">{caption}</span>
      </div>
    </div>
  );
}
const PumpIcon = (
  <path className="cg-icon" d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V20M3 20h12M6.5 7.5h5v3.5h-5zM14 9h2a1.5 1.5 0 0 1 1.5 1.5v5a1 1 0 0 0 2 0V8.5L17 6" transform="scale(0.95)" />
);
const WrenchIcon = <path className="cg-icon" d="M14.7 6.3a4 4 0 0 0-5.3 5.2L3.5 17.4l3.1 3.1 5.9-5.9a4 4 0 0 0 5.2-5.3l-2.5 2.5-2.3-.6-.6-2.3z" transform="scale(0.95)" />;

// Warning-light pictograms (24×24, stroked).
const LIGHTS = {
  service: <path d="M14.7 6.3a4 4 0 0 0-5.3 5.2L3.5 17.4l3.1 3.1 5.9-5.9a4 4 0 0 0 5.2-5.3l-2.5 2.5-2.3-.6-.6-2.3z" />,
  tire: (
    <>
      <path d="M6.2 19.5A8.5 8.5 0 0 1 4.5 7.8M17.8 19.5a8.5 8.5 0 0 0 1.7-11.7M4.5 7.8c2 .9 4.5 1.4 7.5 1.4s5.5-.5 7.5-1.4M6.2 19.5h11.6" />
      <path d="M12 11.5v3.8" />
      <circle cx="12" cy="17.4" r="0.4" />
    </>
  ),
  brake: (
    <>
      <circle cx="12" cy="12" r="6.2" />
      <path d="M4.4 6.2a9.5 9.5 0 0 0 0 11.6M19.6 6.2a9.5 9.5 0 0 1 0 11.6M12 8.8v3.8" />
      <circle cx="12" cy="15.2" r="0.4" />
    </>
  ),
  battery: (
    <>
      <rect x="3" y="7.5" width="18" height="11" rx="1.5" />
      <path d="M6.5 7.5V5.5h3v2M14.5 7.5V5.5h3v2M6 13h3M7.5 11.5v3M15 13h3" />
    </>
  ),
  doc: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="1.5" />
      <path d="M4 9.5h16M8.5 3.5v4M15.5 3.5v4M8 13.5h3M8 16h6" />
    </>
  ),
  recall: (
    <>
      <path d="M12 3.8 2.8 19.5h18.4z" />
      <path d="M12 9.5v4.6" />
      <circle cx="12" cy="16.6" r="0.4" />
    </>
  ),
};
function lightsOf(auto, recalls) {
  const m = maintenance(auto);
  const worst = (list) => (list.includes('over') ? 'over' : list.includes('soon') ? 'soon' : '');
  const t = tireState(auto);
  const b = brakeState(auto);
  const bat = batteryState(auto);
  const dl = deadlines(auto);
  const openRecalls = (recalls || []).filter((r) => !auto.recalls[r.id]).length;
  const out = [
    { id: 'service', name: 'Maintenance', to: 'auto-maint', tone: worst(m.map((x) => x.status)) },
    { id: 'tire', name: 'Tires', to: 'auto-wear', tone: worst([t.status]) },
    { id: 'brake', name: 'Brake pads', to: 'auto-wear', tone: worst([b.status]) },
    bat ? { id: 'battery', name: 'Battery', to: 'auto-wear', tone: worst([bat.status]) } : null,
    { id: 'doc', name: rulesOf(auto).inspection ? 'Inspection and registration' : 'Registration and insurance', to: 'auto-deadlines', tone: worst(dl.map((d) => d.status)) },
    { id: 'recall', name: 'Recalls', to: 'auto-recalls', tone: openRecalls ? 'soon' : '' },
  ];
  return out.filter(Boolean);
}

function ClusterHero({ auto, data, recalls, fuel, go }) {
  const c = auto.car;
  const money = carMoney(data);
  const u = unitsOf(c);
  // left: the soonest schedule item, as the share of its interval left
  const next = maintenance(auto)
    .map((m) => {
      const byMiles = m.milesLeft != null ? m.milesLeft / m.miles : null;
      const byTime = m.months ? m.days / (m.months * 30.44) : null;
      const frac = [byMiles, byTime].filter((x) => x != null).sort((x, y) => x - y)[0];
      return { m, frac };
    })
    .sort((x, y) => (x.m.when < y.m.when ? -1 : x.m.when > y.m.when ? 1 : x.frac - y.frac))[0];
  const nm = next && next.m;
  // read it the way it's limited: miles when the mileage comes first, else days (or months, when far off)
  const byMiles = nm && nm.milesLeft != null && nm.when !== nm.dueDate;
  const svcValue = !nm ? '—' : nm.status === 'over' ? 'Due' : byMiles ? Math.max(0, nm.milesLeft).toLocaleString() : nm.days < 60 ? String(Math.max(0, nm.days)) : String(Math.round(nm.days / 30.44));
  const svcUnit = !nm || nm.status === 'over' ? '' : byMiles ? 'mi' : nm.days < 60 ? (nm.days === 1 ? 'day' : 'days') : 'mo';
  // right: this month's gas (or charging) budget left, as a fuel gauge
  const gas = money && money.gas && money.gas.budget ? money.gas : null;
  const left = gas ? gas.budget - gas.spent : null;
  const lights = lightsOf(auto, recalls);
  const alerts = autoAlerts(auto, money, recalls);
  const loan = money && money.loan && money.loan.left ? money.loan : null;
  return (
    <section className="cluster" aria-label={`${carName(c)} dashboard`}>
      <div className="cl-face">
        <Gauge
          frac={next ? next.frac : 0}
          low={0.1}
          value={svcValue}
          unit={svcUnit}
          caption={nm ? `to ${lower(nm.name)}` : 'no schedule'}
          marks={[
            ['0', 0],
            ['½', 0.5],
            ['1', 1],
          ]}
          tone={nm && nm.status === 'over' ? 'red' : nm && nm.status === 'soon' ? 'amber' : ''}
          label={nm ? `Next service: ${nm.name}, ${nm.status === 'over' ? 'overdue' : `${svcValue} ${svcUnit} left`}` : 'No maintenance schedule'}
          icon={WrenchIcon}
        />
        <div className="cl-center">
          <ul className="cl-lights" aria-label="Warning lights">
            {lights.map((l) => (
              <li key={l.id}>
                <button className={`cl-light ${l.tone ? `on-${l.tone}` : ''}`} title={`${l.name}: ${l.tone === 'over' ? 'overdue' : l.tone === 'soon' ? 'due soon' : 'OK'}`} aria-label={`${l.name}: ${l.tone === 'over' ? 'overdue' : l.tone === 'soon' ? 'due soon' : 'OK'}`} onClick={() => go('car', l.to)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {LIGHTS[l.id]}
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <CarPic car={c} className="cl-car" />
          <div className="cl-odo" aria-label={`Odometer about ${mi(milesOn(auto))}`}>
            <span className="num">{String(milesOn(auto)).padStart(6, '0')}</span>
            <small>mi</small>
          </div>
          <h1 className="page-title cl-title">
            {c.year} {c.make} {c.model} <span className="cl-trim">{c.trim}</span>
          </h1>
          <div className="cl-sub">
            {c.engine} {c.drive} · bought {c.isNew ? 'new' : 'used'} {c.boughtMonth ? monthLabel(`${c.boughtMonth}-01`) : c.bought}
          </div>
          <p className={`cl-msg ${alerts.length ? `m-${alerts[0].tone}` : ''}`} role="status">
            {alerts.length ? alerts[0].text : 'All clear'}
          </p>
          <div className="cl-trip">
            {fuel && fuel.eff ? (
              <span>
                <b className="num">{fuel.eff.toFixed(u.digits)}</b> {u.eff} avg
              </span>
            ) : null}
            {loan ? (
              <span>
                <b className="num">{loan.left}</b> payment{loan.left === 1 ? '' : 's'} left · done {monthLabel(`${loan.ends}-01`)}
              </span>
            ) : null}
          </div>
        </div>
        {gas ? (
          <Gauge
            frac={gas.spent > gas.budget ? 0 : 1 - gas.spent / gas.budget}
            low={0.15}
            value={left < 0 ? `−${money0(-left)}` : money0(left)}
            caption={left < 0 ? `over ${gas.name}` : `${gas.name} left`}
            marks={[
              ['E', 0],
              ['½', 0.5],
              ['F', 1],
            ]}
            tone={left < 0 ? 'red' : left / gas.budget < 0.15 ? 'amber' : ''}
            label={`${gas.name} this month: ${fmt(gas.spent)} of ${fmt(gas.budget)} spent`}
            icon={PumpIcon}
          />
        ) : (
          <div className="cl-gauge cl-empty" />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Car section
function DeadlinesCard({ auto, mutate }) {
  const rules = rulesOf(auto);
  const list = deadlines(auto);
  const field = { inspection: 'inspection', registration: 'registration', insurance: 'insuranceRenews' };
  return (
    <section className="card" id="auto-deadlines">
      <div className="card-head">
        <h2 className="card-title">Deadlines</h2>
      </div>
      <ul className="list">
        {list.map((d) => (
          <li key={d.id} className="dl-row">
            <div className="row-between">
              <span className="bill-name">{d.name}</span>
              <span className={`tag tag-${d.status}`}>{d.days == null ? TONE.none : d.days < 0 ? `${-d.days} day${d.days === -1 ? '' : 's'} late` : d.days === 0 ? 'Today' : `${d.days} day${d.days === 1 ? '' : 's'}`}</span>
            </div>
            <div className="muted small">{d.label}</div>
            <div className="dl-actions">
              <input className="input small-input" type="date" value={d.date || ''} onChange={(e) => {
                  const v = e.target.value;
                  mutate((a) => (a[field[d.id]] = v));
                }} aria-label={`${d.name} date`} />
              {d.date ? (
                <button className="btn quiet small" onClick={() => mutate((a) => renew(a, d.id), `${d.name} updated`)}>
                  {d.renew}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small note">
        {rules.inspection ? '“Inspected” sets the next one 12 months out (through the end of that month). ' : ''}“Renewed” adds {rules.registrationMonths === 12 ? 'a year' : `${rules.registrationMonths / 12} years`} to registration and 6 months to insurance.
      </p>
    </section>
  );
}

function VisitCard({ auto, recalls, onLog, onToast }) {
  const plan = visitPlan(auto, recalls);
  const text = visitText(auto, plan);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      onToast('List copied');
    } catch {
      onToast('Couldn’t copy here; select the list and copy it instead');
    }
  };
  const share = () => navigator.share({ title: 'Service visit', text }).catch(() => {});
  return (
    <section className="card visit" id="auto-visit">
      <div className="card-head">
        <h2 className="card-title">Next service visit</h2>
        <span className="muted small">Next 3,000 mi or 90 days</span>
      </div>
      {plan.items.length ? (
        <ul className="list visit-list">
          {plan.items.map((x) => (
            <li key={x.id} className="visit-row">
              <span className={`v-dot v-${x.status}`} aria-hidden="true" />
              <span className="grow">
                <span className="bill-name">{x.name}</span>
                {x.why ? <span className="muted small block">{x.why}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Nothing due in the next 3,000 miles or 90 days.</p>
      )}
      <div className="visit-btns">
        {plan.items.length ? (
          <button className="btn primary small" onClick={() => onLog(plan.log)}>
            Log this visit
          </button>
        ) : null}
        <button className="btn small" onClick={copy}>
          Copy list
        </button>
        {typeof navigator !== 'undefined' && navigator.share ? (
          <button className="btn quiet small" onClick={share}>
            Share
          </button>
        ) : null}
      </div>
      <p className="muted small note">The copied list has the car, its mileage and the specs below, to show the service desk.</p>
    </section>
  );
}

function MaintenanceCard({ auto, onLog }) {
  const list = maintenance(auto);
  const prof = profileOf(auto.car);
  return (
    <section className="card" id="auto-maint">
      <div className="card-head">
        <h2 className="card-title">Maintenance</h2>
        <button className="btn primary small" onClick={() => onLog([])}>
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
              Every {every(m)} ·{' '}
              {m.unknown
                ? m.dueMiles != null
                  ? `next mark ${mi(m.dueMiles)}`
                  : `next around ${monthLabel(m.when)}`
                : `last ${dayLabel(m.last.date)}${m.last.miles ? ` at ${mi(m.last.miles)}` : ''}; next ${m.dueMiles != null ? mi(m.dueMiles) : monthLabel(m.when)}`}
              {m.milesLeft != null && m.milesLeft > 0 ? ` (~${m.milesLeft.toLocaleString()} mi, around ${monthLabel(m.when)})` : ''}
            </div>
            {m.note ? <div className="muted small">{m.note}</div> : null}
            {!m.unknown ? (
              <div className="bar slim">
                <div
                  className={`bar-fill ${m.status === 'over' ? 'bar-over' : m.status === 'soon' ? 'bar-ahead' : ''}`}
                  style={{ width: `${Math.max(3, Math.min(100, (m.milesLeft != null ? 1 - m.milesLeft / m.miles : 1 - m.days / (m.months * 30.44)) * 100))}%` }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="muted small note">
        Intervals from{' '}
        <a href={prof.url} target="_blank" rel="noopener">
          {prof.guide}
        </a>
        {prof.guideFor}. “No record” items count from the next mileage mark (or from when you bought it) until you log one.
      </p>
    </section>
  );
}

// A worn-to-new meter: `v` on a 0–`max` scale with the plan and legal marks.
function WearMeter({ v, max, plan, legal, label }) {
  if (v == null) return null;
  const pct = (x) => `${Math.max(0, Math.min(100, (x / max) * 100))}%`;
  return (
    <div className="wm" role="img" aria-label={label}>
      <div className={`wm-fill ${v <= legal ? 'over' : v <= plan ? 'soon' : ''}`} style={{ width: pct(v) }} />
      <span className="wm-mark" style={{ left: pct(plan) }} />
      <span className="wm-mark legal" style={{ left: pct(legal) }} />
    </div>
  );
}

function WearCard({ auto, mutate, specs }) {
  const t = tireState(auto);
  const b = brakeState(auto);
  const bat = batteryState(auto);
  const [tread, setTread] = useState('');
  const [padF, setPadF] = useState('');
  const [padR, setPadR] = useState('');
  const [test, setTest] = useState('');
  const [editTires, setEditTires] = useState(false);
  const [tm, setTm] = useState(auto.tires.installed || '');
  const [tmi, setTmi] = useState(auto.tires.installedMiles != null ? String(auto.tires.installedMiles) : '');
  const size = (specs.find((s) => s.id === 'tires') || {}).value;
  const saveTread = (e) => {
    e.preventDefault();
    const v = Number(tread);
    mutate((a) => addTread(a, { tread: v }), `Tread ${v}/32" saved`).then((ok) => ok && setTread(''));
  };
  const savePads = (e) => {
    e.preventDefault();
    mutate((a) => addPads(a, { front: padF, rear: padR }), 'Brake pad reading saved').then((ok) => ok && (setPadF(''), setPadR('')));
  };
  const saveTest = (e) => {
    e.preventDefault();
    mutate((a) => addBatteryTest(a, { result: test }), 'Battery test saved').then((ok) => ok && setTest(''));
  };
  const tv = t.last ? t.last.tread : null;
  const recent = [
    ...t.readings.slice(-2).map((r) => ({ kind: 'tires', r, text: `Tread ${r.tread}/32"` })),
    ...auto.brakes.readings.slice(-2).map((r) => ({ kind: 'brakes', r, text: r.repl ? `New ${r.repl} pads` : `Pads ${[r.front != null ? `front ${r.front} mm` : '', r.rear != null ? `rear ${r.rear} mm` : ''].filter(Boolean).join(', ')}` })),
    ...auto.battery.tests.slice(-1).map((r) => ({ kind: 'battery', r, text: `Battery tested ${r.result}` })),
  ]
    .sort((x, y) => (x.r.date < y.r.date ? 1 : -1))
    .slice(0, 4);
  return (
    <section className="card wear" id="auto-wear">
      <div className="card-head">
        <h2 className="card-title">Tires, brakes &amp; battery</h2>
      </div>
      <div className="wear-row">
        <div className="row-between">
          <span className="bill-name">Tires</span>
          <span className={`tag tag-${t.status}`}>{t.status === 'none' ? 'No reading' : TONE[t.status]}</span>
        </div>
        <div className="muted small">
          {size ? `${size} · ` : ''}
          {t.original ? `the originals${t.month ? `, ${ageText(t.age)}` : ''}` : `on since ${monthLabel(`${t.month}-01`)} (${ageText(t.age)})`}
        </div>
        <WearMeter v={tv} max={TREAD.fresh} plan={TREAD.plan} legal={TREAD.legal} label={`Tread ${tv}/32 of an inch`} />
        <p className="small wear-text">{t.text}</p>
        <form className="add-row wear-form" onSubmit={saveTread}>
          <input className="input num" inputMode="decimal" placeholder="Lowest tread, 32nds" value={tread} onChange={(e) => setTread(cleanNum(e.target.value))} aria-label="Tread depth in 32nds of an inch" />
          <button className="btn" type="submit" disabled={!tread || Number(tread) > 20}>
            Save
          </button>
        </form>
        <button
          className="link-btn small"
          onClick={() => {
            if (!editTires) {
              setTm(auto.tires.installed || '');
              setTmi(auto.tires.installedMiles != null ? String(auto.tires.installedMiles) : '');
            }
            setEditTires(!editTires);
          }}
          aria-expanded={editTires}
        >
          {editTires ? 'Done' : t.original ? 'Not the original tires?' : 'Change when they went on'}
        </button>
        {editTires ? (
          <div className="qa wear-install">
            <label className="field">
              <span className="small muted">Put on</span>
              <input className="input" type="month" value={tm} onChange={(e) => setTm(e.target.value)} aria-label="Month the tires went on" />
            </label>
            <label className="field">
              <span className="small muted">Odometer then (optional)</span>
              <input className="input num" inputMode="numeric" value={tmi} onChange={(e) => setTmi(cleanNum(e.target.value))} aria-label="Odometer when the tires went on" />
            </label>
            <button className="btn small" onClick={() => mutate((a) => setInstalled(a, 'tires', tm, tmi), tm ? 'Tires updated' : 'Back to the original tires').then((ok) => ok && setEditTires(false))}>
              Save
            </button>
          </div>
        ) : null}
      </div>
      <div className="wear-row">
        <div className="row-between">
          <span className="bill-name">Brake pads</span>
          <span className={`tag tag-${b.status}`}>{b.status === 'none' ? 'No reading' : TONE[b.status]}</span>
        </div>
        {b.axles.map((x) => (
          <div key={x.k} className="axle">
            <span className="small axle-name">{x.name}</span>
            <WearMeter v={x.v} max={PAD.fresh} plan={PAD.plan} legal={PAD.worn} label={`${x.name} pads ${x.v} mm`} />
            <span className="small muted">{x.text}</span>
          </div>
        ))}
        <form className="add-row wear-form" onSubmit={savePads}>
          <input className="input num" inputMode="decimal" placeholder="Front mm" value={padF} onChange={(e) => setPadF(cleanNum(e.target.value))} aria-label="Front brake pads in mm" />
          <input className="input num" inputMode="decimal" placeholder="Rear mm" value={padR} onChange={(e) => setPadR(cleanNum(e.target.value))} aria-label="Rear brake pads in mm" />
          <button className="btn" type="submit" disabled={!padF && !padR}>
            Save
          </button>
        </form>
      </div>
      {bat ? (
        <div className="wear-row">
          <div className="row-between">
            <span className="bill-name">Battery</span>
            <span className={`tag tag-${bat.status}`}>{bat.status === 'near' ? 'Test it' : TONE[bat.status]}</span>
          </div>
          <p className="small wear-text">{bat.text}</p>
          <form className="add-row wear-form" onSubmit={saveTest}>
            <select className="input" value={test} onChange={(e) => setTest(e.target.value)} aria-label="Battery test result">
              <option value="">Test result…</option>
              <option value="good">Good</option>
              <option value="weak">Weak</option>
              <option value="bad">Bad / replace</option>
            </select>
            <button className="btn" type="submit" disabled={!test}>
              Save
            </button>
          </form>
        </div>
      ) : null}
      {recent.length ? (
        <ul className="log-list small wear-log">
          {recent.map(({ kind, r, text }) => (
            <li key={r.id || `${kind}-${r.date}-${text}`}>
              <span className="muted">{dateLabel(r.date)}</span> · {text}
              {r.id && !r.svc ? (
                <button className="x" aria-label={`Delete ${text}`} onClick={() => mutate((a) => removeWear(a, kind, r.id), 'Reading deleted')}>
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="muted small note">New tires, pads or a battery: tick them in Log service and the clock starts over. The shop can also note tread and pad depth there. Tread in 32nds of an inch: 4 is time to replace, 2 is the legal minimum. Pads: about 10 mm new, replace at 3.</p>
    </section>
  );
}

function HistoryCard({ auto, mutate }) {
  const list = [...auto.service].sort((x, y) => (x.date < y.date ? 1 : -1));
  if (!list.length) return null;
  const names = Object.fromEntries([...profileOf(auto.car).schedule.map((s) => [s.id, s.name]), ...WEAR_ITEMS]);
  // deleting a visit takes its readings with it, so undo puts them all back
  const remove = (s) => {
    const snap = {
      s,
      tires: auto.tires.readings.filter((r) => r.svc === s.id),
      brakes: auto.brakes.readings.filter((r) => r.svc === s.id),
      tests: auto.battery.tests.filter((r) => r.svc === s.id),
      tireInstall: auto.tires.svc === s.id ? { ...auto.tires, readings: undefined } : null,
      batInstall: auto.battery.svc === s.id ? { ...auto.battery, tests: undefined } : null,
    };
    mutate((a) => removeService(a, s.id), {
      text: 'Service deleted',
      undo: () =>
        mutate((a) => {
          if (a.service.some((x) => x.id === s.id)) return;
          a.service.push(snap.s);
          a.service.sort((x, y) => (x.date < y.date ? -1 : 1));
          a.tires.readings.push(...snap.tires);
          a.brakes.readings.push(...snap.brakes);
          a.battery.tests.push(...snap.tests);
          if (snap.tireInstall) a.tires = { ...snap.tireInstall, readings: a.tires.readings };
          if (snap.batInstall) a.battery = { ...snap.batInstall, tests: a.battery.tests };
        }, 'Service restored'),
    });
  };
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
            <button className="x" aria-label="Delete this entry" onClick={() => remove(s)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
        <input className="input" type="month" value={auto.car.boughtMonth || ''} onChange={(e) => {
          const v = e.target.value;
          mutate((a) => (a.car.boughtMonth = v));
        }} aria-label="Purchase month" />
      </label>
    </section>
  );
}

function SpecsCard({ auto, mutate, specs }) {
  const [edit, setEdit] = useState(false);
  const [vals, setVals] = useState({});
  if (!specs.length) return null;
  const save = () => {
    mutate((a) => {
      for (const [k, v] of Object.entries(vals)) setSpec(a, k, v);
    }, 'Specs saved').then((ok) => ok && (setEdit(false), setVals({})));
  };
  return (
    <section className="card specs" id="auto-specs">
      <div className="card-head">
        <h2 className="card-title">Specs</h2>
        <button className="link-btn small" onClick={() => (edit ? save() : setEdit(true))}>
          {edit ? 'Save' : 'Edit'}
        </button>
      </div>
      <dl className="spec-list">
        {specs.map((s) => (
          <div key={s.id} className="spec">
            <dt className="small muted">{s.label}</dt>
            <dd>{edit ? <input className="input" value={vals[s.id] != null ? vals[s.id] : s.value} onChange={(e) => setVals({ ...vals, [s.id]: e.target.value })} aria-label={s.label} /> : s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small note">{edit ? 'Clear a field to go back to the original. ' : ''}Checked September 2026; your owner’s manual and the sticker on the driver’s door jamb have the final word.</p>
    </section>
  );
}

function RecallsCard({ auto, recalls, mutate }) {
  const [open, setOpen] = useState(null);
  return (
    <section className="card" id="auto-recalls">
      <div className="card-head">
        <h2 className="card-title">Recalls</h2>
        <a className="link small" href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener">
          Check your VIN →
        </a>
      </div>
      {!recalls ? (
        <p className="empty">Checking NHTSA…</p>
      ) : recalls.failed ? (
        <p className="empty">Couldn’t reach NHTSA just now. Try again later, or check your VIN on their site.</p>
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
              <select className="input small-input" value={auto.recalls[r.id] || ''} onChange={(e) => {
                  const v = e.target.value;
                  mutate((a) => setRecall(a, r.id, v));
                }} aria-label={`Status of recall ${r.id}`}>
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

function LogServiceSheet({ auto, budget, preset, onSave, onClose }) {
  const [f, setF] = useState({ date: todayISO(), miles: String(milesOn(auto)), items: preset || [], cost: '', shop: '', note: '', toBudget: true, method: (budget && budget.methods[0]) || '', tread: '', padF: '', padR: '', batt: '' });
  const [more, setMore] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (id) => setF({ ...f, items: f.items.includes(id) ? f.items.filter((x) => x !== id) : [...f.items, id] });
  const ok = f.items.length || f.note.trim() || f.tread || f.padF || f.padR || f.batt;
  const cost = Number(f.cost);
  const wear = WEAR_ITEMS.filter(([id]) => id !== 'battery' || profileOf(auto.car).battery);
  const chip = (id, name) => (
    <button type="button" key={id} className={`chip ${f.items.includes(id) ? 'on' : ''}`} aria-pressed={f.items.includes(id)} onClick={() => toggle(id)}>
      {f.items.includes(id) ? '✓ ' : ''}
      {name}
    </button>
  );
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
        <div className="chips svc-items">{profileOf(auto.car).schedule.map((s) => chip(s.id, s.name))}</div>
        <div className="small muted svc-label">Replaced</div>
        <div className="chips svc-items">{wear.map(([id, name]) => chip(id, name))}</div>
        <label className="field wide">
          <span className="small muted">Anything else (optional)</span>
          <input className="input" value={f.note} onChange={set('note')} placeholder="e.g. new wiper blades, alignment" />
        </label>
        <div className="qa shop-form">
          <label className="field">
            <span className="small muted">Date</span>
            <input className="input" type="date" value={f.date} onChange={set('date')} />
          </label>
          <label className="field">
            <span className="small muted">Mileage</span>
            <input className="input num" inputMode="numeric" value={f.miles} onChange={(e) => setF({ ...f, miles: cleanNum(e.target.value) })} aria-label="Mileage at service" />
          </label>
          <label className="field">
            <span className="small muted">Cost</span>
            <input className="input num" inputMode="decimal" placeholder="0.00" value={f.cost} onChange={(e) => setF({ ...f, cost: cleanNum(e.target.value) })} aria-label="Cost" />
          </label>
          <label className="field">
            <span className="small muted">Shop</span>
            <input className="input" value={f.shop} onChange={set('shop')} placeholder="Dealer, Jiffy Lube…" />
          </label>
        </div>
        <button type="button" className="link-btn small" onClick={() => setMore(!more)} aria-expanded={more}>
          {more ? 'Hide measurements' : 'What the shop measured (tread, pads, battery)'}
        </button>
        {more ? (
          <div className="qa shop-form">
            <label className="field">
              <span className="small muted">Lowest tread (32nds)</span>
              <input className="input num" inputMode="decimal" value={f.tread} onChange={(e) => setF({ ...f, tread: cleanNum(e.target.value) })} aria-label="Tread depth at service" />
            </label>
            <label className="field">
              <span className="small muted">Front pads (mm)</span>
              <input className="input num" inputMode="decimal" value={f.padF} onChange={(e) => setF({ ...f, padF: cleanNum(e.target.value) })} aria-label="Front pads at service" disabled={f.items.includes('padsF')} />
            </label>
            <label className="field">
              <span className="small muted">Rear pads (mm)</span>
              <input className="input num" inputMode="decimal" value={f.padR} onChange={(e) => setF({ ...f, padR: cleanNum(e.target.value) })} aria-label="Rear pads at service" disabled={f.items.includes('padsR')} />
            </label>
            {profileOf(auto.car).battery ? (
              <label className="field">
                <span className="small muted">Battery test</span>
                <select className="input" value={f.batt} onChange={set('batt')} aria-label="Battery test at service">
                  <option value="">Not tested</option>
                  <option value="good">Good</option>
                  <option value="weak">Weak</option>
                  <option value="bad">Bad / replace</option>
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
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

// ---------------------------------------------------------------- Fuel section
function FuelCard({ auto, fuel }) {
  const u = unitsOf(auto.car);
  const d = u.digits;
  const vsEpa = fuel.eff && fuel.epa ? Math.round((fuel.eff / fuel.epa - 1) * 100) : null;
  return (
    <section className="card fuel" id="auto-fuel">
      <div className="card-head">
        <h2 className="card-title">{u.effName}</h2>
        <span className="muted small">
          {fuel.count} {fuel.count === 1 ? u.one : u.many}
        </span>
      </div>
      <div className="fuel-stats">
        <div className="fs">
          <b className="num">{fuel.eff ? fuel.eff.toFixed(d) : '—'}</b>
          <span>{u.eff} average</span>
          {vsEpa != null ? <em className={vsEpa < -5 ? 'down' : vsEpa > 0 ? 'up' : ''}>{vsEpa === 0 ? 'right at' : `${Math.abs(vsEpa)}% ${vsEpa < 0 ? 'under' : 'over'}`} the EPA’s {fuel.epa}</em> : fuel.recent && fuel.segs.length > 3 ? <em>{fuel.recent.toFixed(d)} over the last 3</em> : null}
        </div>
        <div className="fs">
          <b className="num">{fuel.price ? `$${fuel.price.toFixed(fuel.electric ? 2 : 2)}` : '—'}</b>
          <span>last price {u.per}</span>
          {fuel.avgPrice && fuel.prices.length > 1 ? <em>${fuel.avgPrice.toFixed(2)} average this year</em> : null}
        </div>
        <div className="fs">
          <b className="num">{fuel.perMile ? perMileText(fuel.perMile) : '—'}</b>
          <span>a mile</span>
          {fuel.perMonth ? <em>~{money0(fuel.perMonth)} a month{fuel.fromEpa ? ' (EPA rating)' : ''}</em> : null}
        </div>
      </div>
      {fuel.segs.length > 1 ? (
        <>
          <h3 className="k-head">{u.by}</h3>
          <LineChart points={fuel.segs.map((s) => ({ t: s.date, v: Math.round(s.eff * 100) / 100 }))} fmt={(v) => `${v.toFixed(d)} ${u.eff}`} label={`${u.eff} per ${u.stop.toLowerCase()}`} color="blue" height={140} gap={4000} dots refLine={fuel.epa ? { v: fuel.epa, label: 'EPA' } : undefined} yLabel={(v) => v.toFixed(fuel.electric ? 1 : 0)} />
        </>
      ) : (
        <p className="muted small">
          {fuel.electric
            ? 'Log each charge with the odometer to see miles per kWh.'
            : 'Fill the tank all the way and note the odometer each time; after two full fills you’ll see your real MPG.'}
        </p>
      )}
      {fuel.prices.length > 1 && Math.max(...fuel.prices.map((p) => p.v)) > Math.min(...fuel.prices.map((p) => p.v)) * 1.02 ? (
        <>
          <h3 className="k-head">Price {u.per}</h3>
          <LineChart points={fuel.prices.map((p) => ({ t: p.t, v: Math.round(p.v * 1000) / 1000 }))} fmt={(v) => `$${v.toFixed(2)}`} label={`Price ${u.per}`} color="amber" height={120} gap={4000} dots yLabel={(v) => `$${v.toFixed(2)}`} />
        </>
      ) : null}
    </section>
  );
}

function PendingRow({ t, auto, mutate, u }) {
  const [qty, setQty] = useState('');
  const [odo, setOdo] = useState('');
  const [full, setFull] = useState(true);
  const q = Number(qty);
  const add = (e) => {
    e.preventDefault();
    mutate((a) => addFill(a, { date: t.date, qty: q, cost: t.amount, miles: odo, full, txId: t.id, where: t.desc }), `${u.stop} added: ${q} ${u.qty} at $${(t.amount / q).toFixed(2)}${u.per}`);
  };
  return (
    <li className="pend">
      <div className="row-between">
        <span>
          <span className="bill-name">{t.desc}</span> <span className="muted small">{dateLabel(t.date)}</span>
        </span>
        <span className="num bill-amt">{fmt(t.amount)}</span>
      </div>
      <form className="pend-form" onSubmit={add}>
        <input className="input num" inputMode="decimal" placeholder={u.qty === 'gal' ? 'Gallons' : 'kWh'} value={qty} onChange={(e) => setQty(cleanNum(e.target.value))} aria-label={`${u.qty === 'gal' ? 'Gallons' : 'kWh'} for ${t.desc} on ${dateLabel(t.date)}`} />
        <input className="input num" inputMode="numeric" placeholder="Odometer" value={odo} onChange={(e) => setOdo(cleanNum(e.target.value))} aria-label={`Odometer for ${t.desc} on ${dateLabel(t.date)}`} />
        {u.qty === 'gal' ? (
          <label className="check-line small">
            <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Full
          </label>
        ) : null}
        <button className="btn small" type="submit" disabled={!(q > 0)}>
          Add
        </button>
        <button className="btn quiet small" type="button" onClick={() => mutate((a) => skipCharge(a, t.id), { text: `${t.desc} left out`, undo: () => mutate((a) => (a.skipTx = a.skipTx.filter((x) => x !== t.id)), 'Back in the list') })}>
          Not {u.qty === 'gal' ? 'gas' : 'a charge'}
        </button>
      </form>
    </li>
  );
}

function AddFillCard({ auto, data, mutate, budget, onAddExpense }) {
  const u = unitsOf(auto.car);
  const pending = pendingCharges(auto, data);
  const [f, setF] = useState({ date: todayISO(), qty: '', cost: '', miles: '', full: true, where: '', toBudget: true, method: (budget && budget.methods[0]) || '' });
  const [busy, setBusy] = useState(false);
  const q = Number(f.qty);
  const c = Number(f.cost);
  const add = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const date = f.date || todayISO();
    let txId = null;
    if (budget && f.toBudget && c > 0) txId = await onAddExpense({ date, desc: f.where.trim() || (u.qty === 'gal' ? 'Gas' : 'Charging'), category: budget.category, amount: c, method: f.method });
    const ok = await mutate((a) => addFill(a, { date, qty: q, cost: c, miles: f.miles, full: f.full, where: f.where, txId }), txId ? null : `${u.stop} logged`);
    setBusy(false);
    if (ok) setF({ ...f, qty: '', cost: '', miles: '', where: '' });
  };
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">{u.add}</h2>
      </div>
      {pending.length ? (
        <>
          <h3 className="k-head">From your budget</h3>
          <p className="muted small">
            {u.qty === 'gal' ? 'Gas' : 'Charging'} charges from the last 60 days. Add the {u.qty === 'gal' ? 'gallons' : 'kWh'} from the receipt (and the odometer, for {u.eff}).
          </p>
          <ul className="list pend-list">
            {pending.slice(0, 8).map((t) => (
              <PendingRow key={t.id} t={t} auto={auto} mutate={mutate} u={u} />
            ))}
          </ul>
          <h3 className="k-head">Or by hand</h3>
        </>
      ) : null}
      <form className="fill-form" onSubmit={add}>
        <div className="qa shop-form">
          <label className="field">
            <span className="small muted">{u.qty === 'gal' ? 'Gallons' : 'kWh'}</span>
            <input className="input num" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: cleanNum(e.target.value) })} aria-label={u.qty === 'gal' ? 'Gallons' : 'kWh'} />
          </label>
          <label className="field">
            <span className="small muted">Total</span>
            <input className="input num" inputMode="decimal" placeholder="0.00" value={f.cost} onChange={(e) => setF({ ...f, cost: cleanNum(e.target.value) })} aria-label="Total cost" />
          </label>
          <label className="field">
            <span className="small muted">Odometer</span>
            <input className="input num" inputMode="numeric" value={f.miles} onChange={(e) => setF({ ...f, miles: cleanNum(e.target.value) })} aria-label="Odometer at fill-up" />
          </label>
          <label className="field">
            <span className="small muted">Date</span>
            <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Fill-up date" />
          </label>
          <label className="field">
            <span className="small muted">Station (optional)</span>
            <input className="input" value={f.where} onChange={(e) => setF({ ...f, where: e.target.value })} placeholder={u.qty === 'gal' ? 'Shell, Costco…' : 'Home, Supercharger…'} aria-label="Station" />
          </label>
        </div>
        {u.qty === 'gal' ? (
          <label className="check-line small">
            <input type="checkbox" checked={f.full} onChange={(e) => setF({ ...f, full: e.target.checked })} /> Filled the tank (needed for MPG)
          </label>
        ) : null}
        {budget && c > 0 ? (
          <label className="check-line small">
            <input type="checkbox" checked={f.toBudget} onChange={(e) => setF({ ...f, toBudget: e.target.checked })} /> Add {fmt(c)} to {budget.category}, paid with{' '}
            <select className="inline-select" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} aria-label="Paid with">
              {budget.methods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="btn primary" type="submit" disabled={busy || !(q > 0) || !(c >= 0) || f.cost === ''}>
          Save {u.stop.toLowerCase()}
        </button>
      </form>
    </section>
  );
}

function FillLogCard({ auto, mutate, fuel }) {
  const u = unitsOf(auto.car);
  const list = [...auto.fills].reverse().slice(0, 40);
  if (!list.length) return null;
  const effAt = Object.fromEntries(fuel.segs.map((s) => [s.date, s.eff]));
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">{u.stops}</h2>
        <span className="muted small">{fmt(fuel.thisMonth)} this month</span>
      </div>
      <ul className="list">
        {list.map((f) => (
          <li key={f.id} className="bill fill-row">
            <div className="grow">
              <div className="bill-name">
                {f.qty} {u.qty}
                {f.where ? ` · ${f.where}` : ''}
                {!f.full && u.qty === 'gal' ? <span className="tag tag-none">partial</span> : null}
              </div>
              <div className="muted small">
                {dateLabel(f.date)}
                {f.miles ? ` · ${mi(f.miles)}` : ''} · ${(f.cost / f.qty).toFixed(2)}
                {u.per}
                {effAt[f.date] && f.full ? ` · ${effAt[f.date].toFixed(u.digits)} ${u.eff}` : ''}
              </div>
            </div>
            <span className="num bill-amt">{fmt(f.cost)}</span>
            <button className="x" aria-label={`Delete the ${u.stop.toLowerCase()} on ${dateLabel(f.date)}`} onClick={() => mutate((a) => removeFill(a, f.id), { text: `${u.stop} deleted`, undo: () => mutate((a) => !a.fills.some((x) => x.id === f.id) && (a.fills.push(f), a.fills.sort((x, y) => (x.date < y.date ? -1 : 1))), 'Restored') })}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- Costs section
function OwnershipCard({ auto, data }) {
  const o = ownership(auto, data);
  const money = o.money;
  const gas = money && money.gas;
  const pct = gas && gas.budget ? Math.min(100, (gas.spent / gas.budget) * 100) : 0;
  const COLORS = { loan: 'c1', insurance: 'c2', fuel: 'c3', upkeep: 'c4' };
  return (
    <section className="card own" id="auto-own">
      <div className="card-head">
        <h2 className="card-title">What the car costs</h2>
        <span className="muted small">From your budget</span>
      </div>
      {o.lines.length ? (
        <>
          <div className="own-top">
            <div>
              <b className="big num">{fmt(o.total)}</b>
              <span className="muted small"> a month</span>
            </div>
            {o.perMile ? (
              <div className="own-pm">
                <b className="num">{perMileText(o.perMile)}</b>
                <span className="muted small"> a mile</span>
              </div>
            ) : null}
          </div>
          <div className="own-bar" role="img" aria-label={o.lines.map((l) => `${l.name} ${fmt(l.monthly)}`).join(', ')}>
            {o.lines.map((l) => (
              <span key={l.id} className={COLORS[l.id]} style={{ flexGrow: l.monthly }} />
            ))}
          </div>
          <ul className="list">
            {o.lines.map((l) => (
              <li key={l.id} className="w-row">
                <div className="row-between">
                  <span className="bill-name">
                    <span className={`own-key ${COLORS[l.id]}`} />
                    {l.name}
                  </span>
                  <span className="num bill-amt">{fmt(l.monthly)}/mo</span>
                </div>
                {l.note ? <span className="muted small">{l.note}</span> : null}
              </li>
            ))}
          </ul>
          {o.afterPayoff ? (
            <p className="own-after">
              From {monthLabel(`${o.afterPayoff.from}-01`)}, with the loan paid off: <b className="num">{fmt(o.afterPayoff.total)}</b> a month{o.rate ? ` (${perMileText((o.afterPayoff.total * 12) / o.rate)} a mile)` : ''}.
            </p>
          ) : null}
          {o.spend.transit ? (
            <p className="muted small note">
              Rides and transit in {o.spend.category} ({fmt(o.spend.transit)}/mo) aren’t counted: they aren’t the car.
            </p>
          ) : null}
        </>
      ) : (
        <p className="empty">Nothing yet: the car payment, insurance and gas come from your budget.</p>
      )}
      {gas ? (
        <div className="own-gas">
          <div className="row-between">
            <span className="bill-name">{gas.name} this month</span>
            <span className="num small">
              {fmt(gas.spent)} <span className="muted">/ {fmt(gas.budget)}</span>
            </span>
          </div>
          <div className="bar slim">
            <div className={`bar-fill ${gas.spent > gas.budget ? 'bar-over' : ''}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function NumField({ label, value, onSave, prefix, suffix, aria }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => setV(value == null ? '' : String(value)), [value]);
  return (
    <label className="field kv-field">
      <span className="small muted">{label}</span>
      <span className="kv-input">
        {prefix ? <span className="kv-fix">{prefix}</span> : null}
        <input className="input num" inputMode="decimal" value={v} onChange={(e) => setV(cleanNum(e.target.value))} onBlur={() => String(value == null ? '' : value) !== v && onSave(v)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())} aria-label={aria || label} />
        {suffix ? <span className="kv-fix">{suffix}</span> : null}
      </span>
    </label>
  );
}

function KeepReplaceCard({ auto, data, mutate }) {
  const kr = keepVsReplace(auto, data);
  const n = auto.next;
  const u = unitsOf(auto.car);
  const comparing = n.comparing && n.watch.find((w) => w.id === n.comparing);
  const rows = [
    ['payment', 'Car payment'],
    ['insurance', 'Insurance'],
    ['fuel', u.qty === 'gal' ? 'Gas' : 'Charging'],
    ['upkeep', 'Upkeep & driving costs'],
    ['jobs', 'Big jobs (spread over the year)'],
  ];
  const save = (k) => (v) => mutate((a) => setNext(a, k, v));
  return (
    <section className="card kr" id="auto-keep">
      <div className="card-head">
        <h2 className="card-title">Keep or replace?</h2>
        <span className="muted small">Next 12 months, a month</span>
      </div>
      <div className="kr-grid">
        <div className="kr-col">
          <h3 className="k-head">Keep the {auto.car.model}</h3>
          <b className="big num">{fmt(kr.keep.total)}</b>
        </div>
        <div className="kr-col">
          <h3 className="k-head">{comparing ? comparing.name : 'Replace it'}</h3>
          <b className="big num">{kr.replace ? fmt(kr.replace.total) : '—'}</b>
        </div>
      </div>
      {kr.replace ? (
        <p className={`kr-verdict ${kr.diff > 0 ? 'keep' : 'swap'}`}>
          {Math.abs(kr.diff) < 10 ? 'Over the next year, about the same either way.' : kr.diff > 0 ? `Over the next year, keeping costs ${fmt(kr.diff)} a month less (${money0(kr.diff * 12)} in all).` : `Over the next year, replacing costs ${fmt(-kr.diff)} a month less (${money0(-kr.diff * 12)} in all).`}
          {kr.loan && kr.afterPayoff != null ? ` Once the ${auto.car.model} is paid off (${monthLabel(`${kr.loan.ends}-01`)}), keeping it runs about ${fmt(kr.afterPayoff)} a month against ${fmt(kr.replace.total)}.` : ''}
        </p>
      ) : (
        <p className="muted small">Add a price below (or pick a car from your watch list) to compare.</p>
      )}
      <table className="kr-table">
        <tbody>
          {rows.map(([k, l]) => (
            <tr key={k}>
              <th scope="row" className="small">
                {l}
              </th>
              <td className="num small">{fmt(kr.keep[k])}</td>
              <td className="num small">{kr.replace ? fmt(kr.replace[k]) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {kr.jobs.length ? (
        <>
          <h3 className="k-head">Big jobs likely this year</h3>
          <ul className="list">
            {kr.jobs.map((j) => (
              <li key={j.key || j.id} className="job-row">
                <span className="grow">
                  <span className="bill-name">{j.name}</span>
                  <span className="muted small block">
                    {j.why}
                    {j.price && !(auto.prices && auto.prices[j.id]) ? ' · estimate' : ''}
                  </span>
                </span>
                <NumField label="Price" aria={`Price for ${j.name}`} value={auto.prices && auto.prices[j.id] ? auto.prices[j.id] : priceOf(auto, j.id)} prefix="$" onSave={(v) => mutate((a) => setPrice(a, j.id, v))} />
              </li>
            ))}
          </ul>
          {kr.unpriced.length ? <p className="small kr-warn">Add a quote for {kr.unpriced.map((j) => j.name.toLowerCase()).join(' and ')} to count {kr.unpriced.length === 1 ? 'it' : 'them'}.</p> : null}
        </>
      ) : null}
      <h3 className="k-head">The next car</h3>
      <div className="kr-inputs">
        <NumField label="Price" value={n.price} prefix="$" onSave={save('price')} aria="Next car price" />
        <NumField label="Down payment" value={n.down} prefix="$" onSave={save('down')} />
        <NumField label="Trade-in" value={n.tradeIn} prefix="$" onSave={save('tradeIn')} aria="Trade-in value" />
        <NumField label="APR" value={n.apr} suffix="%" onSave={save('apr')} />
        <label className="field kv-field">
          <span className="small muted">Term</span>
          <select className="input" value={n.term} onChange={(e) => {
              const v = e.target.value;
              mutate((a) => setNext(a, 'term', v));
            }} aria-label="Loan term">
            {[36, 48, 60, 72, 84].map((t) => (
              <option key={t} value={t}>
                {t} months
              </option>
            ))}
          </select>
        </label>
        <NumField label={u.qty === 'gal' ? 'Its MPG' : 'Its mi/kWh'} value={n.mpg} onSave={save('mpg')} aria="Next car mileage" />
        <NumField label="Insurance / mo" value={n.insurance} prefix="$" onSave={save('insurance')} aria="Next car insurance" />
      </div>
      {kr.replace ? (
        <p className="muted small">
          {fmt(kr.replace.financed)} financed: {fmt(payment(kr.replace.financed, n.apr, n.term))}/mo for {n.term} months{n.apr ? ` at ${n.apr}%` : ' (no interest entered)'}.
          {kr.owed && n.tradeIn ? ` The trade-in pays off the ~${money0(kr.owed)} still owed on the ${auto.car.model} first${kr.equity < 0 ? `, leaving ${money0(-kr.equity)} to roll into the new loan` : ''}.` : ''} Insurance {n.insurance ? 'is your quote' : 'assumed the same'}; routine upkeep assumed the same.
        </p>
      ) : null}
      <p className="muted small note">
        {kr.owed && !n.tradeIn ? `About ${money0(kr.owed)} is still owed on the ${auto.car.model}; a trade-in pays that off first. ` : ''}Trade-in: get a number from{' '}
        <a href="https://www.kbb.com/whats-my-car-worth/" target="_blank" rel="noopener">
          Kelley Blue Book
        </a>{' '}
        or{' '}
        <a href="https://www.edmunds.com/appraisal/" target="_blank" rel="noopener">
          Edmunds
        </a>
        .
        {Object.keys(profileOf(auto.car).prices).length ? (
          <>
            {' '}
            Job estimates are{' '}
            <a href="https://repairpal.com/estimator/nissan/altima" target="_blank" rel="noopener">
              RepairPal’s
            </a>{' '}
            averages for the {auto.car.model} until you enter a quote.
          </>
        ) : null}
      </p>
    </section>
  );
}

function NextCarCard({ auto, data, mutate }) {
  const n = auto.next;
  const fp = fundPlan(auto, data);
  const [w, setW] = useState({ name: '', price: '', mpg: '' });
  const [showUltra, setShowUltra] = useState(false);
  const u = unitsOf(auto.car);
  const add = (e) => {
    e.preventDefault();
    mutate((a) => addWatch(a, w), `${w.name.trim()} added`).then((ok) => ok && setW({ name: '', price: '', mpg: '' }));
  };
  const ULTRA_TXT = { now: 'Has it', soon: 'Coming soon', later: 'Committed' };
  return (
    <section className="card next-car" id="auto-next">
      <div className="card-head">
        <h2 className="card-title">Next car</h2>
      </div>
      <h3 className="k-head">Fund</h3>
      <div className="kr-inputs fund-inputs">
        <NumField label="Goal" value={n.fund.target} prefix="$" onSave={(v) => mutate((a) => setFund(a, 'target', v))} aria="Next car fund goal" />
        <NumField label="Saved" value={n.fund.saved} prefix="$" onSave={(v) => mutate((a) => setFund(a, 'saved', v))} aria="Next car fund saved" />
        <NumField label="A month" value={n.fund.monthly} prefix="$" onSave={(v) => mutate((a) => setFund(a, 'monthly', v))} aria="Next car fund monthly" />
      </div>
      {fp ? (
        <>
          <div className="bar slim">
            <div className="bar-fill" style={{ width: `${fp.pct * 100}%` }} />
          </div>
          <p className="small">
            {fp.done
              ? `Goal reached: ${money0(fp.saved)} saved.`
              : `${money0(fp.saved)} of ${money0(fp.target)}.${fp.by ? ` At ${money0(fp.monthly)} a month you get there ${monthLabel(fp.by)}.` : ''}${fp.payoff && fp.payoff.by && (!fp.by || fp.payoff.by < fp.by) ? ` ${fp.monthly ? 'Adding' : 'Putting'} the ${fmt(fp.payoff.monthly)} car payment in once the loan ends (${monthLabel(`${fp.payoff.from}-01`)}): ${monthLabel(fp.payoff.by)}.` : ''}`}
          </p>
        </>
      ) : (
        <p className="muted small">Set a goal (a down payment, or the whole car) to see when you’ll get there.</p>
      )}
      <h3 className="k-head">Watch list</h3>
      {n.watch.length ? (
        <ul className="list">
          {n.watch.map((x) => {
            const ul = ultraFor(x.name);
            return (
              <li key={x.id} className="bill watch-row">
                <div className="grow">
                  <div className="bill-name">{x.name}</div>
                  <div className="muted small">{[x.price ? money0(x.price) : '', x.mpg ? `${x.mpg} ${u.eff}` : ''].filter(Boolean).join(' · ') || 'Add a price to compare'}</div>
                  {ul ? <span className={`tag ultra-tag u-${ul.status}`}>CarPlay Ultra: {ULTRA_TXT[ul.status].toLowerCase()}</span> : null}
                </div>
                {x.price ? (
                  <button className={`btn small ${n.comparing === x.id ? 'primary' : ''}`} onClick={() => mutate((a) => compareWith(a, x.id), `Comparing the ${x.name}`)} aria-pressed={n.comparing === x.id}>
                    {n.comparing === x.id ? 'Comparing' : 'Compare'}
                  </button>
                ) : null}
                <button className="x" aria-label={`Remove ${x.name}`} onClick={() => mutate((a) => removeWatch(a, x.id), { text: `${x.name} removed`, undo: () => mutate((a) => !a.next.watch.some((y) => y.id === x.id) && a.next.watch.push(x), 'Restored') })}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">Cars you’re considering, with a price to compare against keeping this one.</p>
      )}
      <form className="watch-form" onSubmit={add}>
        <input className="input" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} placeholder="e.g. 2027 Kia EV4" aria-label="Car to watch" />
        <input className="input num" inputMode="decimal" value={w.price} onChange={(e) => setW({ ...w, price: cleanNum(e.target.value) })} placeholder="Price" aria-label="Its price" />
        <input className="input num" inputMode="decimal" value={w.mpg} onChange={(e) => setW({ ...w, mpg: cleanNum(e.target.value) })} placeholder={u.eff} aria-label="Its mileage" />
        <button className="btn" type="submit" disabled={!w.name.trim()}>
          Add
        </button>
      </form>
      <button className="link-btn small ultra-toggle" onClick={() => setShowUltra(!showUltra)} aria-expanded={showUltra}>
        {showUltra ? 'Hide CarPlay Ultra status' : 'Which brands have CarPlay Ultra?'}
      </button>
      {showUltra ? (
        <div className="ultra">
          <ul className="ultra-list">
            {ULTRA.map((x) => (
              <li key={x.brand}>
                <span className={`tag ultra-tag u-${x.status}`}>{ULTRA_TXT[x.status]}</span> <b>{x.brand}</b> <span className="muted small">{x.note}</span>
              </li>
            ))}
          </ul>
          <p className="muted small note">
            Checked {ULTRA_CHECKED}. Only Aston Martin ships it so far; the rest have said they will. Sources:{' '}
            {ULTRA_SOURCES.map(([t, h], i) => (
              <React.Fragment key={h}>
                {i ? ', ' : ''}
                <a href={h} target="_blank" rel="noopener">
                  {t}
                </a>
              </React.Fragment>
            ))}
            .
          </p>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- page
const SECTION_KEYS = ['car', 'fuel', 'costs'];
function useAutoSection() {
  const fromHash = () => {
    const q = (location.hash.split('?')[1] || '').split('&')[0];
    return SECTION_KEYS.includes(q) ? q : null;
  };
  const [sec, setSec] = useState(() => {
    let saved = null;
    try {
      saved = localStorage.getItem('dash.autoSection');
    } catch {
      /* private mode */
    }
    return fromHash() || (SECTION_KEYS.includes(saved) ? saved : 'car');
  });
  const choose = (k) => {
    setSec(k);
    try {
      localStorage.setItem('dash.autoSection', k);
    } catch {
      /* private mode */
    }
    if (/^#\/auto/.test(location.hash)) history.replaceState(history.state, '', `#/auto?${k}`);
  };
  useEffect(() => {
    const on = () => {
      const k = /^#\/auto/.test(location.hash) && fromHash();
      if (k) choose(k);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [sec, choose];
}

export function AutoPage({ auto, data, recalls, mutate, budget, onAddExpense, error, onToast }) {
  const [logging, setLogging] = useState(null);
  const [section, setSection] = useAutoSection();
  if (!auto) {
    return (
      <div className="home auto theme-cluster">
        <header className="page-head">
          <h1 className="page-title">Auto</h1>
        </header>
        <section className="card">
          <p className="empty">{error || 'Loading…'}</p>
        </section>
      </div>
    );
  }
  const u = unitsOf(auto.car);
  const fuel = fuelStats(auto);
  const specs = specsOf(auto);
  const toast = onToast || (() => {});
  const go = (k, id) => {
    setSection(k);
    if (id) setTimeout(() => document.getElementById(id) && document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const save = async (f) => {
    const names = Object.fromEntries([...profileOf(auto.car).schedule.map((s) => [s.id, s.name]), ...WEAR_ITEMS]);
    const cost = Number(f.cost);
    const date = f.date || todayISO();
    const toBudget = !!(budget && f.toBudget && cost > 0);
    if (!(await mutate((a) => logService(a, { ...f, date, budgeted: cost > 0 ? toBudget : undefined }), 'Service logged'))) return;
    if (toBudget) {
      const what = [...f.items.map((i) => names[i]), f.note.trim()].filter(Boolean).join(', ') || 'Service';
      await onAddExpense({ date, desc: `Car: ${what}${f.shop ? ` (${f.shop.trim()})` : ''}`.slice(0, 80), category: budget.category, amount: cost, method: f.method });
    }
    setLogging(null);
  };
  const SECTIONS = [
    ['car', 'Car'],
    ['fuel', u.stops],
    ['costs', 'Costs'],
  ];
  return (
    <div className="home auto theme-cluster">
      {error ? <div className="alert">{error}</div> : null}
      <ClusterHero auto={auto} data={data} recalls={recalls} fuel={fuel} go={go} />
      <SectionTabs list={SECTIONS} value={section} onChange={setSection} label="Auto sections" />
      {section === 'car' ? (
        <div className="grid">
          <div className="col">
            <DeadlinesCard auto={auto} mutate={mutate} />
            <VisitCard auto={auto} recalls={recalls} onLog={(items) => setLogging(items)} onToast={toast} />
            <MaintenanceCard auto={auto} onLog={(items) => setLogging(items)} />
            <HistoryCard auto={auto} mutate={mutate} />
          </div>
          <div className="col">
            <WearCard auto={auto} mutate={mutate} specs={specs} />
            <CarCard auto={auto} mutate={mutate} />
            <SpecsCard auto={auto} mutate={mutate} specs={specs} />
            <RecallsCard auto={auto} recalls={recalls} mutate={mutate} />
          </div>
        </div>
      ) : null}
      {section === 'fuel' ? (
        <div className="grid">
          <div className="col">
            <FuelCard auto={auto} fuel={fuel} />
            <AddFillCard auto={auto} data={data} mutate={mutate} budget={budget} onAddExpense={onAddExpense} />
          </div>
          <div className="col">
            <FillLogCard auto={auto} mutate={mutate} fuel={fuel} />
          </div>
        </div>
      ) : null}
      {section === 'costs' ? (
        <div className="grid">
          <div className="col">
            <OwnershipCard auto={auto} data={data} />
            <NextCarCard auto={auto} data={data} mutate={mutate} />
          </div>
          <div className="col">
            <KeepReplaceCard auto={auto} data={data} mutate={mutate} />
          </div>
        </div>
      ) : null}
      {logging ? <LogServiceSheet auto={auto} budget={budget} preset={logging} onSave={save} onClose={() => setLogging(null)} /> : null}
    </div>
  );
}
