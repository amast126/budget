import React, { useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { CERTS, OPTIONAL, TIPS, SOURCES, PRICES_NOTE } from './learning-catalog.js';
import {
  STATUSES,
  STATUS_TEXT,
  certState,
  statusOf,
  loggedHours,
  hoursThisWeek,
  projectPlan,
  currentStep,
  renewals,
  remainingCost,
  dayLabel,
  daysUntil,
  setStatus,
  setField,
  markRenewed,
  logTime,
  removeLog,
  addToPlan,
  removeFromPlan,
  move,
} from './learning-logic.js';

const NOTES_URL = 'https://claude.ai/artifact/3ASyGPPJjLZxxc6JMvYUKY'; // "Microsoft AI Certification Notes" doc
const PACES = [3, 4, 5, 6, 8, 10];
const fmtH = (h) => (h >= 10 || Number.isInteger(h) ? `${Math.round(h)}h` : `${h.toFixed(1).replace(/\.0$/, '')}h`);

function Progress({ value, tone = 'green' }) {
  return (
    <div className="bar slim">
      <div className={`bar-fill ${tone === 'amber' ? 'bar-ahead' : ''}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

function LogButtons({ onLog, busy }) {
  return (
    <div className="log-btns">
      {[
        [15, '+15m'],
        [30, '+30m'],
        [60, '+1h'],
        [120, '+2h'],
      ].map(([m, l]) => (
        <button key={m} className="btn quiet small" disabled={busy} onClick={() => onLog(m)}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Home card
export function LearningHomeCard({ data, mutate }) {
  if (!data) return null;
  const cur = currentStep(data);
  const week = hoursThisWeek(data);
  const goal = data.hoursPerWeek;
  const c = cur && CERTS[cur];
  const st = cur ? certState(data, cur) : null;
  const due = renewals(data).filter((r) => r.open);
  const exam = st && st.status === 'booked' && st.examDate ? daysUntil(st.examDate) : null;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Learning</h2>
        <a className="link small" href="#/learning">
          Roadmap →
        </a>
      </div>
      {c ? (
        <>
          <div className="row-between">
            <div>
              <div className="bill-name">
                {c.kind === 'cert' ? `${c.code} · ` : ''}
                {c.name}
              </div>
              <div className="muted small">
                {STATUS_TEXT[st.status] || 'Planned'}
                {exam != null ? ` · exam ${exam === 0 ? 'today' : exam === 1 ? 'tomorrow' : exam > 0 ? `in ${exam} days` : `${-exam} days ago`}` : ''}
                {` · ${fmtH(loggedHours(data, cur))} of ~${c.estHours}h`}
              </div>
            </div>
          </div>
          <div className="week-row">
            <span className="small">
              This week <b className="num">{fmtH(week)}</b> <span className="muted">of {goal}h</span>
            </span>
            <LogButtons onLog={(m) => mutate((d) => logTime(d, cur, m), `Logged ${m >= 60 ? m / 60 + 'h' : m + 'm'} on ${c.code === 'Skill' ? c.name : c.code}`)} />
          </div>
          <Progress value={week / goal} tone={week >= goal ? 'green' : 'amber'} />
        </>
      ) : (
        <p className="empty">Everything on the roadmap is done. Pick the next one on the Learning tab.</p>
      )}
      {due.map((r) => (
        <p key={r.id} className="alert small">
          {r.c.code} renewal is open. Free online assessment, due by {dayLabel(r.expires)}.
        </p>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- detail
function CertDetail({ id, data, mutate, inPlan, afterId }) {
  const c = CERTS[id];
  const st = certState(data, id);
  const status = st.status || 'planned';
  const logged = loggedHours(data, id);
  const recent = data.log.filter((e) => e.cert === id).slice(-4).reverse();
  const label = c.code === 'Skill' ? c.name : c.code;
  return (
    <div className="cert-detail">
      <p>{c.summary}</p>
      <p>
        <b>Why for you: </b>
        {c.why}
      </p>
      <p>
        <b>Impact: </b>
        {c.impact}
      </p>
      {c.roles && c.roles.length ? <p className="muted small">Roles: {c.roles.join(', ')}</p> : null}
      <dl className="facts-grid">
        <div>
          <dt>Cost</dt>
          <dd>{c.cost ? `$${c.cost}` : 'Free'}</dd>
        </div>
        <div>
          <dt>Exam</dt>
          <dd>{c.format}</dd>
        </div>
        <div>
          <dt>Valid</dt>
          <dd>{c.validity}</dd>
        </div>
        <div>
          <dt>Study time</dt>
          <dd>~{c.estHours} hours</dd>
        </div>
      </dl>
      <div className="links">
        {c.links.map((l) => (
          <a key={l.url} className="chip-link" href={l.url} target="_blank" rel="noopener">
            {l.label} <Icon name="ext" size={13} />
          </a>
        ))}
      </div>

      <div className="track">
        <div className="seg" role="group" aria-label={`${label} status`}>
          {STATUSES.map(([k, l]) => (
            <button key={k} className={`seg-btn ${status === k ? 'on' : ''}`} onClick={() => status !== k && mutate((d) => setStatus(d, id, k))}>
              {l}
            </button>
          ))}
        </div>
        {status === 'booked' ? (
          <label className="field">
            <span className="small muted">Exam date</span>
            <input className="input" type="date" value={st.examDate || ''} onChange={(e) => mutate((d) => setField(d, id, 'examDate', e.target.value))} />
          </label>
        ) : null}
        {status === 'passed' ? (
          <label className="field">
            <span className="small muted">Passed on</span>
            <input className="input" type="date" value={st.passedDate || ''} onChange={(e) => mutate((d) => setField(d, id, 'passedDate', e.target.value))} />
          </label>
        ) : null}
        {status === 'passed' && c.renewYearly && st.expires ? (
          <div className="row-between small">
            <span>
              Renew by <b>{dayLabel(st.expires)}</b> (window opens 6 months before)
            </span>
            <button className="btn quiet small" onClick={() => mutate((d) => markRenewed(d, id), `${label} renewed through ${dayLabel(st.expires)}`)}>
              I renewed it
            </button>
          </div>
        ) : null}
        {status !== 'passed' && status !== 'skipped' ? (
          <div className="week-row">
            <span className="small">
              Logged <b className="num">{fmtH(logged)}</b> <span className="muted">of ~{c.estHours}h</span>
            </span>
            <LogButtons onLog={(m) => mutate((d) => logTime(d, id, m), `Logged ${m >= 60 ? m / 60 + 'h' : m + 'm'} on ${label}`)} />
          </div>
        ) : null}
        {recent.length ? (
          <ul className="log-list small">
            {recent.map((e) => (
              <li key={e.id}>
                <span className="muted">{dayLabel(e.date)}</span> · {e.minutes >= 60 ? `${e.minutes / 60}h` : `${e.minutes}m`}
                <button className="x" aria-label="Remove this entry" onClick={() => mutate((d) => removeLog(d, e.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="plan-actions">
          {inPlan ? (
            <>
              <button className="btn quiet small" onClick={() => mutate((d) => move(d, id, -1))} aria-label="Move earlier">
                <Icon name="up" size={16} /> Earlier
              </button>
              <button className="btn quiet small" onClick={() => mutate((d) => move(d, id, 1))} aria-label="Move later">
                <Icon name="down" size={16} /> Later
              </button>
              <button className="btn quiet small" onClick={() => mutate((d) => removeFromPlan(d, id), `Removed ${label} from the roadmap`)}>
                Remove from roadmap
              </button>
            </>
          ) : (
            <button className="btn quiet small" onClick={() => mutate((d) => addToPlan(d, id, afterId), `Added ${label} to the roadmap`)}>
              Add to roadmap
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page
export function LearningPage({ data, mutate, error }) {
  const [picked, setOpen] = useState(undefined); // undefined = follow the current cert
  const open = picked === undefined ? (data ? currentStep(data) : null) : picked;
  const steps = useMemo(() => (data ? projectPlan(data) : []), [data]);
  if (!data) {
    return (
      <div className="home">
        <header className="page-head">
          <h1 className="page-title">Learning</h1>
        </header>
        <section className="card">
          <p className="empty">{error || 'Loading…'}</p>
        </section>
      </div>
    );
  }
  const cur = currentStep(data);
  const week = hoursThisWeek(data);
  const goal = data.hoursPerWeek;
  const optional = [...OPTIONAL, ...Object.keys(CERTS).filter((id) => !OPTIONAL.includes(id))].filter((id) => !data.plan.includes(id));
  const due = renewals(data);
  const last = steps.filter((s) => s.target && s.status !== 'passed').slice(-1)[0];
  const toggle = (id) => setOpen(open === id ? null : id);

  return (
    <div className="home learning">
      <header className="page-head">
        <h1 className="page-title">Learning</h1>
        <div className="muted">
          Cloud &amp; AI path ·{' '}
          <label className="pace">
            <select
              className="inline-select"
              value={goal}
              onChange={(e) => mutate((d) => (d.hoursPerWeek = Number(e.target.value)), `Pace set to ${e.target.value} hours a week`)}
              aria-label="Study hours per week"
            >
              {PACES.map((p) => (
                <option key={p} value={p}>
                  {p} hrs/week
                </option>
              ))}
            </select>
          </label>{' '}
          ·{' '}
          <a className="link" href={NOTES_URL} target="_blank" rel="noopener">
            Study notes
          </a>
        </div>
      </header>
      {error ? <div className="alert">{error}</div> : null}
      <div className="grid">
        <div className="col">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">This week</h2>
              <span className="muted small num">
                {fmtH(week)} of {goal}h
              </span>
            </div>
            <Progress value={week / goal} tone={week >= goal ? 'green' : 'amber'} />
            {cur ? (
              <div className="week-row">
                <span className="small">
                  On <b>{CERTS[cur].code === 'Skill' ? CERTS[cur].name : CERTS[cur].code}</b>
                </span>
                <LogButtons onLog={(m) => mutate((d) => logTime(d, cur, m), `Logged ${m >= 60 ? m / 60 + 'h' : m + 'm'}`)} />
              </div>
            ) : null}
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Roadmap</h2>
              <span className="muted small">{last ? `Done ~${last.label.replace('Target ', '').replace('Exam ', '')}` : ''}</span>
            </div>
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={s.id} className={`step st-${s.status} ${open === s.id ? 'open' : ''}`}>
                  <button className="step-head" onClick={() => toggle(s.id)} aria-expanded={open === s.id}>
                    <span className="step-num">{s.status === 'passed' ? <Icon name="check" size={14} /> : i + 1}</span>
                    <span className="grow">
                      <span className="step-title">
                        {s.c.kind === 'cert' ? <span className="code">{s.c.code}</span> : null}
                        {s.c.name}
                      </span>
                      <span className="step-meta small">
                        <span className={`tag tag-${s.status}`}>{STATUS_TEXT[s.status]}</span>
                        <span className="muted">{s.label}</span>
                      </span>
                      {s.status !== 'passed' && s.status !== 'skipped' ? <Progress value={s.pct} /> : null}
                    </span>
                    <Icon name={open === s.id ? 'down' : 'chev'} size={18} />
                  </button>
                  {open === s.id ? <CertDetail id={s.id} data={data} mutate={mutate} inPlan /> : null}
                </li>
              ))}
            </ol>
            <p className="muted small note">
              Target dates assume {goal} hours a week, one cert at a time, plus a week to book each exam. They move as you log time or book dates.
              {remainingCost(data) ? ` Exam fees left on the roadmap: $${remainingCost(data)}.` : ''} {PRICES_NOTE}
            </p>
          </section>
        </div>

        <div className="col">
          {due.length ? (
            <section className="card">
              <div className="card-head">
                <h2 className="card-title">Renewals</h2>
              </div>
              <ul className="list">
                {due.map((r) => (
                  <li key={r.id} className="bill">
                    <div className="grow">
                      <div className="bill-name">{r.c.code}</div>
                      <div className="muted small">
                        {r.open ? 'Renewal open now' : `Window opens ${dayLabel(r.opens)}`} · expires {dayLabel(r.expires)}
                      </div>
                    </div>
                    <a className="link small" href="https://aka.ms/ManageCerts" target="_blank" rel="noopener">
                      Renew →
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Also worth knowing</h2>
              <span className="muted small">Optional, add any to the roadmap</span>
            </div>
            <ul className="steps">
              {optional.map((id) => {
                const c = CERTS[id];
                return (
                  <li key={id} className={`step ${open === id ? 'open' : ''}`}>
                    <button className="step-head" onClick={() => toggle(id)} aria-expanded={open === id}>
                      <span className="grow">
                        <span className="step-title">
                          {c.kind === 'cert' && c.code !== 'Applied Skill' ? <span className="code">{c.code}</span> : null}
                          {c.name}
                        </span>
                        <span className="step-meta small muted">
                          {c.vendor} · {c.level} · {c.cost ? `$${c.cost}` : 'Free'}
                          {statusOf(data, id) !== 'planned' ? ` · ${STATUS_TEXT[statusOf(data, id)]}` : ''}
                        </span>
                      </span>
                      <Icon name={open === id ? 'down' : 'chev'} size={18} />
                    </button>
                    {open === id ? <CertDetail id={id} data={data} mutate={mutate} afterId={cur} /> : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">How to study</h2>
            </div>
            <ul className="tips">
              {TIPS.map(([t, body]) => (
                <li key={t}>
                  <b>{t}.</b> {body}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Sources</h2>
              <span className="muted small">Checked Sept 2026</span>
            </div>
            <ul className="tips small">
              {SOURCES.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="muted small note">
              Salary figures are Skillsoft’s averages for people who hold each cert (US, 2024 survey). The US samples are small, and they describe the jobs holders already have, not a raise a cert guarantees.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
