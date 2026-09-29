// Learning tab: Exam prep (exam date and countdown, a skills checklist from the official outline with a readiness
// score, Microsoft's course modules to tick off, practice test scores) and Flashcards (cards you write, reviewed
// with spaced repetition).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { LineChart } from './chart-kit.jsx';
import { MiniBars } from './spark.jsx';
import { celebrate } from './fx.jsx';
import { todayISO } from './budget-logic.js';
import { CERTS } from './learning-catalog.js';
import { moduleUrl } from './learning-outlines.js';
import * as L from './learning-logic.js';
import * as K from './cards-logic.js';

export const certName = (id) => {
  const c = CERTS[id];
  if (!c) return id === 'general' ? 'General' : id;
  return c.kind === 'cert' && !/applied/i.test(c.code) ? c.code : c.name;
};
const pctText = (x) => `${Math.round(x * 100)}%`;
const fmtH = (h) => (h >= 10 || Number.isInteger(h) ? `${Math.round(h)}h` : `${h.toFixed(1).replace(/\.0$/, '')}h`);
const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`);
const monthYear = (iso) => new Date(`${iso}T12:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
const plural = (n, w) => `${n} ${n === 1 ? w : `${w}s`}`;
const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
const validDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number(v.slice(0, 4)) >= 2020 && Number(v.slice(0, 4)) <= 2100;
// A date box that saves only a whole, sensible date: typing a year one digit at a time (which reports 0002, 0020…)
// or clearing one part doesn't save or clear anything. Clearing is a separate button.
export function DateField({ value, onCommit, label, min, max }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  const commit = (x) => validDay(x) && x !== value && onCommit(x);
  return (
    <input
      className="input"
      type="date"
      value={v}
      min={min}
      max={max}
      aria-label={label}
      onChange={(e) => {
        setV(e.target.value);
        if (validDay(e.target.value) && e.target.value >= (min || '2020')) commit(e.target.value);
      }}
      onBlur={() => (validDay(v) ? commit(v) : setV(value || ''))}
    />
  );
}

// The certs you could be preparing for: on the roadmap, a real exam, not passed or skipped.
export function prepChoices(d) {
  return d.plan.filter((id) => CERTS[id] && CERTS[id].kind === 'cert' && !['passed', 'skipped'].includes(L.statusOf(d, id)));
}
function usePick(d) {
  const choices = prepChoices(d);
  const cur = L.currentStep(d);
  const [pick, setPick] = useState(null);
  const id = choices.includes(pick) ? pick : choices.includes(cur) ? cur : choices[0] || null;
  return [id, setPick, choices];
}

// ---------------------------------------------------------------- exam prep
function Stat({ label, value, sub }) {
  return (
    <div className="exam-stat">
      <span className="small muted">{label}</span>
      <b className="num">{value}</b>
      {sub ? <span className="small muted">{sub}</span> : null}
    </div>
  );
}
function ExamCard({ id, data, mutate }) {
  const c = CERTS[id];
  const plan = L.examPlan(data, id);
  const o = L.outlineOf(id);
  const prep = L.prepOf(data, id);
  const r = o ? L.readiness(o, prep) : null;
  const ts = L.testSummary(prep);
  const logged = L.loggedHours(data, id);
  const link = c.links.find((l) => /exam page/i.test(l.label)) || c.links[0];
  const past = plan && plan.days < 0;
  return (
    <section className="card exam-card">
      <div className="card-head">
        <h2 className="card-title">{certName(id)} exam</h2>
        <span className="muted small">{c.format}</span>
      </div>
      <div className="exam-top">
        <div className={`exam-count ${plan && !past ? '' : 'none'}`}>
          {plan && !past ? (
            <>
              <b className="num">{plan.days}</b>
              <span>{plan.days === 0 ? 'today!' : `${plan.days === 1 ? 'day' : 'days'} to go`}</span>
            </>
          ) : (
            <>
              <b>–</b>
              <span>{past ? 'Date passed' : 'No date yet'}</span>
            </>
          )}
        </div>
        <div className="exam-stats">
          <Stat label="Readiness" value={r && r.rated ? pctText(r.pct) : '–'} sub={r ? `${r.rated}/${r.count} rated` : 'No outline yet'} />
          <Stat label="Practice" value={ts ? `${ts.avg}%` : '–'} sub={ts ? (ts.count > 1 ? `avg of last ${Math.min(3, ts.count)}` : 'one test so far') : 'None yet'} />
          <Stat label="Studied" value={fmtH(logged)} sub={`of ~${c.estHours}h`} />
        </div>
      </div>
      {plan && plan.days > 0 ? (
        <p className="small exam-plan">
          {plan.left <= 0
            ? 'You’ve put in the estimated hours. Keep rating skills and taking practice tests.'
            : plan.days < 7
              ? `About ${fmtH(plan.left)} left on the estimate before ${L.dayLabel(plan.date)}. Focus on the shaky skills.`
              : `About ${fmtH(plan.left)} left on the estimate. ${fmtH(plan.perWeek)} a week gets there by ${L.dayLabel(plan.date)}${plan.onPace ? `, within your ${plan.pace}h pace.` : `, more than your ${plan.pace}h pace.`}`}
        </p>
      ) : null}
      {plan && plan.days < 0 ? <p className="small">The exam date has passed. Mark it passed on Certifications, or set a new date.</p> : null}
      {!plan && ts && ts.ready ? <p className="small good-note">Your last two practice tests were 80% or better. Good time to book.</p> : null}
      <div className="exam-date-row">
        <label className="field">
          <span className="small muted">{plan ? 'Exam date' : 'Booked it? Enter the date'}</span>
          <DateField value={plan ? plan.date : ''} min={todayISO()} label={`${certName(id)} exam date`} onCommit={(v) => mutate((d) => L.bookExam(d, id, v), `${certName(id)} exam set for ${L.dayLabel(v)}`)} />
        </label>
        {plan ? (
          <button className="btn quiet small" onClick={() => mutate((d) => L.bookExam(d, id, ''), 'Exam date cleared')}>
            Clear date
          </button>
        ) : null}
        {link ? (
          <a className="chip-link" href={link.url} target="_blank" rel="noopener">
            {c.vendor === 'Microsoft' && !/applied/i.test(c.code) ? 'Schedule on Microsoft Learn' : 'Exam page'} <Icon name="ext" size={13} />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function ReadinessCard({ id, mutate, o, prep }) {
  const r = L.readiness(o, prep);
  const rate = (key, v) => mutate((d) => L.rateSkill(d, id, key, v));
  return (
    <section className="card readiness">
      <div className="card-head">
        <h2 className="card-title">Skills checklist</h2>
        <span className="muted small">Official outline, {monthYear(o.updated)}</span>
      </div>
      <div className="ready-top">
        <div className="ready-pct">
          <b className="num">{pctText(r.pct)}</b>
          <span className="small muted">ready</span>
        </div>
        <div className="grow">
          {r.domains.map((dm) => (
            <div key={dm.key} className="ready-dm">
              <div className="row-between small">
                <span>
                  {dm.short} <span className="muted">· {dm.weight[0]}–{dm.weight[1]}% of the exam</span>
                </span>
                <span className="num">{pctText(dm.pct)}</span>
              </div>
              <div className="bar slim">
                <div className="bar-fill" style={{ width: `${Math.round(dm.pct * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {r.next.length ? (
        <div className="study-next">
          <h3 className="k-head">Study next</h3>
          <ul>
            {r.next.map((x) => (
              <li key={x.key} className="small">
                {x.text} <span className="muted">· {x.group.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="small good-note">Every skill rated solid. Practice tests will show if that holds up.</p>
      )}
      <p className="muted small note">Rate each skill as you go. Readiness weighs each part by its share of the exam: solid counts fully, shaky half.</p>
      {o.domains.map((dm) => (
        <div key={dm.key} className="outline-dm">
          <h3 className="k-head">
            {dm.name} <span className="muted">{dm.weight[0]}–{dm.weight[1]}%</span>
          </h3>
          {dm.groups.map((g) => (
            <div key={g.key} className="outline-g">
              <div className="outline-gname small">{g.name}</div>
              <ul className="skill-list">
                {g.items.map(([k, text]) => {
                  const lv = prep.skills[k] || 0;
                  return (
                    <li key={k} className={`skill lv${lv}`}>
                      <span className="skill-text small">{text}</span>
                      <div className="seg mini-seg skill-seg" role="group" aria-label={`How well you know: ${text}`}>
                        {L.SKILL_LEVELS.map(([v, l]) => (
                          <button key={v} className={`seg-btn ${lv === v ? 'on' : ''}`} aria-pressed={lv === v} onClick={() => lv !== v && rate(k, v)}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ))}
      <a className="chip-link" href={o.guide} target="_blank" rel="noopener">
        Official study guide <Icon name="ext" size={13} />
      </a>
    </section>
  );
}

function TestsCard({ id, mutate, o, prep }) {
  const [f, setF] = useState({ date: todayISO(), score: '', parts: {} });
  const ts = L.testSummary(prep);
  const c = CERTS[id];
  const practice = c.links.find((l) => /practice/i.test(l.label));
  // one point a day (the day's last score), so retakes don't stack up on the chart
  const byDay = new Map(prep.tests.map((t) => [t.date, t.score]));
  const pts = [...byDay].map(([t, v]) => ({ t, v }));
  const partName = (k) => ((o && o.domains.find((dm) => dm.key === k)) || { short: k }).short;
  const valid = f.score !== '' && Number(f.score) >= 0 && Number(f.score) <= 100;
  const save = (e) => {
    e.preventDefault();
    if (!valid) return;
    const score = Math.round(Number(f.score));
    if (score >= L.READY_SCORE) celebrate();
    mutate((d) => L.addTest(d, id, { ...f, date: validDay(f.date) && f.date <= todayISO() ? f.date : todayISO() }), `Logged ${score}% on the ${certName(id)} practice test`);
    setF({ date: todayISO(), score: '', parts: {} });
  };
  return (
    <section className="card tests">
      <div className="card-head">
        <h2 className="card-title">Practice tests</h2>
        {practice ? (
          <a className="link small" href={practice.url} target="_blank" rel="noopener">
            Take one →
          </a>
        ) : null}
      </div>
      {ts ? (
        <>
          <p className="small">
            Latest <b className="num">{ts.last.score}%</b>
            {ts.change != null ? <span className={ts.change >= 0 ? 'up' : 'down'}> ({ts.change >= 0 ? '+' : ''}{ts.change})</span> : null}
            {ts.count > 1 ? (
              <>
                {' '}
                · last {Math.min(3, ts.count)} average <b className="num">{ts.avg}%</b>
              </>
            ) : null}
          </p>
          {ts.ready ? <p className="small good-note">Two in a row at 80% or better: you’re ready to book.</p> : <p className="muted small">Ready to book when two in a row reach 80%.</p>}
          {ts.weak ? (
            <p className="small">
              Weakest area last time: <b>{partName(ts.weak.key)}</b> at {ts.weak.score}%.
            </p>
          ) : null}
          {pts.length > 1 ? <LineChart points={pts} fmt={(v) => `${Math.round(v)}%`} label="practice test score" color="blue" height={140} refLine={{ v: L.READY_SCORE, label: '80%' }} gap={4000} dots yLabel={(v) => `${Math.round(v)}`} /> : null}
          <ul className="log-list small">
            {[...prep.tests]
              .reverse()
              .slice(0, 6)
              .map((t) => (
                <li key={t.id}>
                  <span className="muted">{L.dayLabel(t.date)}</span> · <b className="num">{t.score}%</b>
                  {t.parts ? <span className="muted"> · {Object.entries(t.parts).map(([k, v]) => `${partName(k)} ${v}%`).join(', ')}</span> : null}
                  <button className="x" aria-label="Remove this score" onClick={() => mutate((d) => L.removeTest(d, id, t.id))}>
                    ×
                  </button>
                </li>
              ))}
          </ul>
        </>
      ) : (
        <p className="empty small">Log each score from Microsoft’s free practice assessment. Two in a row at 80% or better means you’re ready to book.</p>
      )}
      <form className="test-form" onSubmit={save}>
        <label className="field">
          <span className="small muted">Date</span>
          <input className="input" type="date" value={f.date} max={todayISO()} onChange={(e) => setF({ ...f, date: e.target.value })} onBlur={() => !validDay(f.date) && setF({ ...f, date: todayISO() })} aria-label="Test date" />
        </label>
        <label className="field">
          <span className="small muted">Score %</span>
          <input className="input num" inputMode="numeric" placeholder="e.g. 76" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })} aria-label="Score percent" />
        </label>
        {o
          ? o.domains.map((dm) => (
              <label key={dm.key} className="field">
                <span className="small muted">{dm.short} % (optional)</span>
                <input className="input num" inputMode="numeric" value={f.parts[dm.key] || ''} onChange={(e) => setF({ ...f, parts: { ...f.parts, [dm.key]: e.target.value.replace(/[^\d]/g, '').slice(0, 3) } })} aria-label={`${dm.short} score percent`} />
              </label>
            ))
          : null}
        <button className="btn primary" type="submit" disabled={!valid}>
          Log score
        </button>
      </form>
    </section>
  );
}

function ModulesCard({ id, mutate, o, prep }) {
  const mp = L.moduleProgress(o, prep);
  const tick = (slug, name, done) => {
    const last = !done && mp.done === mp.total - 1;
    if (last) celebrate({ big: true });
    mutate((d) => L.toggleModule(d, id, slug), last ? 'Every module done. Nice work!' : done ? undefined : `Finished “${name}”`);
  };
  return (
    <section className="card modules">
      <div className="card-head">
        <h2 className="card-title">Course modules</h2>
        <span className="muted small">
          {mp.done} of {mp.total}
          {mp.minutesLeft > 0 ? ` · about ${hm(mp.minutesLeft)} left` : ''}
        </span>
      </div>
      <p className="muted small">
        Microsoft’s free course,{' '}
        <a href={o.course.url} target="_blank" rel="noopener">
          {o.course.name}
        </a>
        . Microsoft Learn doesn’t share your progress with other sites, so tick modules off here as you finish them.
      </p>
      {mp.paths.map((p) => (
        <div key={p.key} className="mod-path">
          <div className="row-between">
            <a className="mod-path-name" href={p.url} target="_blank" rel="noopener">
              {p.name}
            </a>
            <span className="muted small num">
              {p.done}/{p.modules.length}
            </span>
          </div>
          <div className="bar slim">
            <div className="bar-fill" style={{ width: `${Math.round((p.doneUnits / p.units) * 100)}%` }} />
          </div>
          <ul className="mod-list">
            {p.modules.map(([slug, name, units]) => {
              const done = !!prep.modules[slug];
              return (
                <li key={slug} className={done ? 'done' : ''}>
                  <button className="mod-check" role="checkbox" aria-checked={done} aria-label={`${name} done`} onClick={() => tick(slug, name, done)}>
                    {done ? <Icon name="check" size={13} /> : null}
                  </button>
                  <a className="grow small" href={moduleUrl(slug)} target="_blank" rel="noopener">
                    {name}
                  </a>
                  <span className="muted small num">{units} units</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function PrepSection({ data, mutate }) {
  const [id, setPick, choices] = usePick(data);
  if (!id) return <section className="card"><p className="empty">Nothing on the roadmap needs an exam right now. Add a certification on the Certifications tab.</p></section>;
  const o = L.outlineOf(id);
  const prep = L.prepOf(data, id);
  const guide = CERTS[id].links.find((l) => /study guide/i.test(l.label));
  return (
    <>
      {choices.length > 1 ? (
        <div className="chips prep-pick" role="group" aria-label="Exam">
          {choices.map((k) => (
            <button key={k} className={`chip ${k === id ? 'on' : ''}`} aria-pressed={k === id} onClick={() => setPick(k)}>
              {certName(k)}
            </button>
          ))}
        </div>
      ) : null}
      <ExamCard id={id} data={data} mutate={mutate} />
      <div className="grid">
        <div className="col">
          {o ? (
            <ReadinessCard id={id} mutate={mutate} o={o} prep={prep} />
          ) : (
            <section className="card">
              <div className="card-head">
                <h2 className="card-title">Skills checklist</h2>
              </div>
              <p className="small">
                The checklist is built from each exam’s official outline, and only AI-901’s is in so far. {certName(id)}’s can be added the same way. Until then, its study guide lists what the exam covers.
              </p>
              {guide ? (
                <a className="chip-link" href={guide.url} target="_blank" rel="noopener">
                  {certName(id)} study guide <Icon name="ext" size={13} />
                </a>
              ) : null}
            </section>
          )}
        </div>
        <div className="col">
          <TestsCard key={id} id={id} mutate={mutate} o={o} prep={prep} />
          {o ? <ModulesCard id={id} mutate={mutate} o={o} prep={prep} /> : null}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- flashcards
function deckChoices(cards, learning) {
  const ids = new Set(['general']);
  if (learning) prepChoices(learning).forEach((id) => ids.add(id));
  if (learning) learning.plan.forEach((id) => CERTS[id] && ids.add(id));
  cards.cards.forEach((c) => ids.add(c.deck));
  return [...ids].map((id) => [id, certName(id)]);
}

// Ratings save in order, several to a save when you go fast (one Firestore write at a time, never overlapping).
function useRatingQueue(mutate, today) {
  const q = useRef({ pending: [], busy: false, inFlight: new Set() });
  const flush = () => {
    const r = q.current;
    if (r.busy || !r.pending.length) return;
    const batch = r.pending.splice(0);
    r.busy = true;
    mutate((d) => batch.forEach((x) => K.review(d, x.id, x.rating, today))).finally(() => {
      batch.forEach((x) => r.inFlight.delete(x.id));
      r.busy = false;
      flush();
    });
  };
  return {
    rate(id, rating) {
      q.current.pending.push({ id, rating });
      q.current.inFlight.add(id);
      flush();
    },
    saving: (id) => q.current.inFlight.has(id),
  };
}

function ReviewCard({ cards, mutate, deck, setDeck, decks, today }) {
  const [s, setS] = useState(null); // { queue: [ids], i, shown, again: {id: n}, done: n }
  const saver = useRatingQueue(mutate, today);
  const box = useRef(null);
  const showBtn = useRef(null);
  const goodBtn = useRef(null);
  const stats = K.cardStats(cards, today, deck);
  const card = s && s.i < s.queue.length ? cards.cards.find((c) => c.id === s.queue[s.i]) : null;
  const start = () => {
    // cards whose last rating is still saving aren't due in this snapshot yet; leave them out
    const queue = K.dueQueue(cards, today, deck)
      .map((c) => c.id)
      .filter((id) => !saver.saving(id));
    if (queue.length) setS({ queue, i: 0, shown: false, again: {}, done: 0 });
  };
  const rate = (r) => {
    if (!card || !s.shown) return;
    const id = card.id;
    saver.rate(id, r);
    setS((x) => {
      const again = { ...x.again };
      const queue = [...x.queue];
      // Again: see it once more at the end of this session (up to twice)
      if (r === 0 && (again[id] || 0) < 2) {
        again[id] = (again[id] || 0) + 1;
        queue.push(id);
      }
      return { ...x, queue, again, i: x.i + 1, shown: false, done: x.done + 1 };
    });
  };
  // Space or Enter shows the answer; 1–4 rate it. Only while the review has focus or nothing else does: keys on
  // other buttons, links and fields keep doing their own thing.
  useEffect(() => {
    if (!card) return undefined;
    const on = (e) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target;
      const elsewhere = t && t !== document.body && !(box.current && box.current.contains(t));
      if (elsewhere) return;
      if (!s.shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setS((x) => ({ ...x, shown: true }));
      } else if (s.shown && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        rate(Number(e.key) - 1);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  // keep keyboard focus in the review: Good once the answer shows, Show answer on the next card
  useEffect(() => {
    if (!s || !card) return;
    const el = s.shown ? goodBtn.current : showBtn.current;
    if (el && box.current && (box.current.contains(document.activeElement) || document.activeElement === document.body)) el.focus({ preventScroll: true });
  }, [s && s.i, s && s.shown, !!card]);
  // a card deleted mid-session: skip it, answer hidden
  useEffect(() => {
    if (s && s.i < s.queue.length && !card) setS((x) => ({ ...x, i: x.i + 1, shown: false }));
  }, [s, card]);
  const finished = s && s.i >= s.queue.length;
  return (
    <section className="card review" ref={box}>
      <div className="card-head">
        <h2 className="card-title">Review</h2>
        <select className="inline-select small" value={deck || ''} onChange={(e) => (setDeck(e.target.value || null), setS(null))} aria-label="Deck">
          <option value="">All decks</option>
          {decks.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div aria-live="polite">
        {card ? (
          <div className="fc">
            <div className="fc-progress small muted">
              {Math.min(s.i + 1, s.queue.length)} of {s.queue.length} · {certName(card.deck)}
              {K.isNew(card) ? ' · new' : ''}
            </div>
            <div className="fc-face fc-front">{card.front}</div>
            {s.shown ? (
              <>
                <div className="fc-face fc-back">{card.back}</div>
                <div className="fc-rate">
                  {K.RATINGS.map(([r, l]) => (
                    <button key={r} ref={r === 2 ? goodBtn : undefined} className={`btn fc-r r${r}`} onClick={() => rate(r)}>
                      <b>{l}</b>
                      <span className="small">{K.intervalText(K.schedule(card, r, today).interval)}</span>
                    </button>
                  ))}
                </div>
                <p className="muted small note">Keys: 1 Again · 2 Hard · 3 Good · 4 Easy</p>
              </>
            ) : (
              <button ref={showBtn} className="btn primary block" onClick={() => setS((x) => ({ ...x, shown: true }))}>
                Show answer
              </button>
            )}
            <button className="link-btn small fc-stop" onClick={() => setS(null)}>
              Stop for now
            </button>
          </div>
        ) : finished ? (
          <div className="fc-done">
            <p>
              <b>Done: {plural(s.done, 'review')}.</b> {stats.tomorrow ? `${plural(stats.tomorrow, 'card')} due tomorrow.` : 'Nothing due tomorrow.'}
            </p>
            {stats.due ? (
              <button className="btn small" onClick={start}>
                {plural(stats.due, 'more card')} due
              </button>
            ) : null}
          </div>
        ) : stats.total ? (
          <>
            <div className="fc-counts">
              <Stat label="Due" value={stats.dueReviews} />
              <Stat label="New today" value={stats.dueNew} sub={`${stats.fresh} waiting`} />
              <Stat label="Streak" value={stats.streak ? `${stats.streak}d` : '–'} sub={stats.today ? `${stats.today} today` : null} />
            </div>
            {stats.due ? (
              <button className="btn primary block" onClick={start}>
                Start review ({stats.due})
              </button>
            ) : (
              <p className="small good-note">All caught up{stats.tomorrow ? `. ${plural(stats.tomorrow, 'card')} due tomorrow.` : '.'}</p>
            )}
          </>
        ) : (
          <p className="empty small">No cards {deck ? 'in this deck ' : ''}yet. Write your own below: a term or question on the front, the answer on the back, or paste many at once from your notes.</p>
        )}
      </div>
    </section>
  );
}

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
function AddCardsCard({ cards, mutate, decks, deck }) {
  const [mode, setMode] = useState('one');
  const [pick, setTo] = useState(null);
  const to = (deck && decks.some(([k]) => k === deck) ? deck : null) || (pick && decks.some(([k]) => k === pick) ? pick : null) || (decks[1] ? decks[1][0] : 'general');
  const [f, setF] = useState({ front: '', back: '' });
  const [bulk, setBulk] = useState('');
  const parsed = useMemo(() => K.parseBulk(bulk), [bulk]);
  const add = (list, reset) => {
    // try it on a copy first, to say what happened
    const trial = K.addCards(JSON.parse(JSON.stringify(cards)), list, to);
    const n = trial.added.length;
    const bits = [trial.dupes.length ? `${trial.dupes.length} already there` : '', trial.full ? `the deck is full, so ${list.length - n - trial.dupes.length} left out` : ''].filter(Boolean).join('; ');
    const msg = n ? `Added ${plural(n, 'card')} to ${certName(to)}${bits ? ` (${bits})` : ''}` : trial.full ? 'The deck is full. Delete some cards to add more.' : 'Those cards are already in that deck';
    if (!n) return mutate(() => {}, { text: msg, error: trial.full });
    return mutate((d) => K.addCards(d, list, to), msg).then((ok) => ok && reset());
  };
  return (
    <section className="card add-cards">
      <div className="card-head">
        <h2 className="card-title">Add cards</h2>
        <div className="seg mini-seg" role="tablist">
          {[
            ['one', 'One'],
            ['many', 'Paste many'],
          ].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={mode === k} className={`seg-btn ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="small muted">Deck</span>
        <select className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Add to deck">
          {decks.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {mode === 'one' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (f.front.trim() && f.back.trim()) add([f], () => setF({ front: '', back: '' }));
          }}
        >
          <label className="field">
            <span className="small muted">Front</span>
            <textarea className="input" rows={2} value={f.front} onChange={(e) => setF({ ...f, front: e.target.value })} placeholder="e.g. What does temperature control in a model deployment?" aria-label="Card front" />
          </label>
          <label className="field">
            <span className="small muted">Back</span>
            <textarea className="input" rows={3} value={f.back} onChange={(e) => setF({ ...f, back: e.target.value })} aria-label="Card back" />
          </label>
          <button className="btn primary" type="submit" disabled={!f.front.trim() || !f.back.trim()}>
            Add card
          </button>
        </form>
      ) : (
        <>
          <label className="field">
            <span className="small muted">One card per line: the front, then a tab, a |, or a dash with spaces ( — or - ), then the back</span>
            <textarea className="input mono" rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Front | Back\nAnother front | its back'} aria-label="Cards to add" />
          </label>
          {bulk.trim() ? (
            <p className="small">
              {plural(parsed.cards.length, 'card')} ready
              {parsed.skipped.length ? <span className="muted"> · {plural(parsed.skipped.length, 'line')} without a separator, left out</span> : null}
            </p>
          ) : (
            <p className="muted small">A Quizlet export (tab between term and definition) pastes in as it is.</p>
          )}
          <button className="btn primary" disabled={!parsed.cards.length} onClick={() => add(parsed.cards, () => setBulk(''))}>
            Add {parsed.cards.length ? plural(parsed.cards.length, 'card') : 'cards'}
          </button>
        </>
      )}
    </section>
  );
}

function CardRow({ c, mutate, decks, today }) {
  const [edit, setEdit] = useState(null);
  if (edit) {
    return (
      <li className="card-row editing">
        <textarea className="input" rows={2} value={edit.front} onChange={(e) => setEdit({ ...edit, front: e.target.value })} aria-label="Front" />
        <textarea className="input" rows={3} value={edit.back} onChange={(e) => setEdit({ ...edit, back: e.target.value })} aria-label="Back" />
        <div className="plan-actions">
          <select className="inline-select small" value={edit.deck} onChange={(e) => setEdit({ ...edit, deck: e.target.value })} aria-label="Deck">
            {decks.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <button className="btn primary small" disabled={!edit.front.trim() || !edit.back.trim()} onClick={() => mutate((d) => K.updateCard(d, c.id, edit)).then(() => setEdit(null))}>
            Save
          </button>
          <button className="btn quiet small" onClick={() => setEdit(null)}>
            Cancel
          </button>
          <button className="btn quiet small" onClick={() => mutate((d) => K.resetCard(d, c.id, today), 'Card starts over as new')}>
            Start over
          </button>
          <button
            className="btn quiet small danger-text"
            onClick={() => {
              const snap = { ...c };
              mutate((d) => K.removeCard(d, c.id), { text: 'Card deleted', undo: () => mutate((d) => !d.cards.some((x) => x.id === snap.id) && d.cards.push(snap), 'Card restored') });
            }}
          >
            Delete
          </button>
        </div>
      </li>
    );
  }
  return (
    <li className="card-row">
      <button className="card-row-btn" onClick={() => setEdit({ front: c.front, back: c.back, deck: c.deck })} aria-label={`Edit card: ${c.front}`}>
        <span className="grow">
          <span className="card-front small">{c.front}</span>
          <span className="card-back small muted">{c.back}</span>
        </span>
        <span className="card-meta small muted">
          {certName(c.deck)}
          <br />
          {K.dueText(c, today)}
        </span>
      </button>
    </li>
  );
}

function CardListCard({ cards, mutate, decks, deck, today }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(30);
  const ql = q.trim().toLowerCase();
  const list = cards.cards.filter((c) => (!deck || c.deck === deck) && (!ql || c.front.toLowerCase().includes(ql) || c.back.toLowerCase().includes(ql))).reverse();
  if (!cards.cards.length) return null;
  return (
    <section className="card card-list">
      <div className="card-head">
        <h2 className="card-title">Your cards</h2>
        <span className="muted small">{plural(list.length, 'card')}</span>
      </div>
      <input className="input" type="search" placeholder="Search cards" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cards" />
      <ul className="card-rows">
        {list.slice(0, limit).map((c) => (
          <CardRow key={c.id} c={c} mutate={mutate} decks={decks} today={today} />
        ))}
      </ul>
      {list.length > limit ? (
        <button className="btn quiet block" onClick={() => setLimit(limit + 60)}>
          Show more ({list.length - limit} left)
        </button>
      ) : null}
    </section>
  );
}

function CardStatsCard({ cards, mutate, today }) {
  const s = K.cardStats(cards, today);
  const days = K.reviewsByDay(cards, today, 14).map((x, i, a) => ({ v: x.v, label: i === a.length - 1 ? 'Today' : new Date(`${x.day}T12:00:00`).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), current: i === a.length - 1 }));
  if (!s.total) return null;
  return (
    <section className="card card-stats">
      <div className="card-head">
        <h2 className="card-title">Progress</h2>
        <span className="muted small">
          {s.learned} of {s.total} learned
        </span>
      </div>
      <div className="bar slim">
        <div className="bar-fill" style={{ width: `${Math.round((s.learned / s.total) * 100)}%` }} />
      </div>
      <p className="muted small note">Learned means you’ve got it well enough that it won’t come back for three weeks or more.</p>
      {days.some((x) => x.v) ? <MiniBars values={days} fmt={(v) => plural(Math.round(v), 'review')} label="Reviews, last 14 days" /> : null}
      <label className="small muted">
        New cards a day{' '}
        <select className="inline-select" value={cards.newPerDay} onChange={(e) => mutate((d) => (d.newPerDay = Number(e.target.value)))} aria-label="New cards a day">
          {[5, 10, 15, 20, 30, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

export function CardsSection({ cards, mutate, learning }) {
  const today = todayISO();
  const [deck, setDeck] = useState(null);
  if (!cards) return <section className="card"><p className="empty">Loading…</p></section>;
  const decks = deckChoices(cards, learning);
  return (
    <div className="grid cards-grid">
      <div className="col">
        <ReviewCard cards={cards} mutate={mutate} deck={deck} setDeck={setDeck} decks={decks} today={today} />
        <AddCardsCard cards={cards} mutate={mutate} decks={decks} deck={deck} />
      </div>
      <div className="col">
        <CardStatsCard cards={cards} mutate={mutate} today={today} />
        <CardListCard cards={cards} mutate={mutate} decks={decks} deck={deck} today={today} />
      </div>
    </div>
  );
}

// For Home: flashcards due, readiness for the exam you're on.
export function cardsDue(cards, today = todayISO()) {
  return cards ? K.cardStats(cards, today).due : 0;
}
export function readinessOf(learning, id) {
  const o = id && L.outlineOf(id);
  if (!o) return null;
  const prep = L.prepOf(learning, id);
  return Object.keys(prep.skills).length ? L.readiness(o, prep).pct : null;
}
