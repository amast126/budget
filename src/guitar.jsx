// Guitar, on the Learning tab: practice timer and streak, JustinGuitar course progress, one-minute chord changes,
// songs, and a tuner and metronome that run in the browser (Web Audio; the tuner asks for the microphone).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { MiniBars, Sparkline } from './spark.jsx';
import { LineChart } from './chart-kit.jsx';
import { celebrate, centerOf } from './fx.jsx';
import { useNow } from './pulse.jsx';
import { dateLabel, todayISO } from './budget-logic.js';
import * as G from './guitar-logic.js';

const TIMER_KEY = 'dash.guitarTimer';
const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};
const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// One AudioContext for the metronome, the changes timer and the tuner, made on the first tap (browsers require it).
let actx = null;
export function audio() {
  if (!actx) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    actx = new A();
  }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}
function beep(freq = 880, len = 0.12, at = 0, vol = 0.5) {
  const c = audio();
  if (!c) return;
  const t = (at || c.currentTime) + 0.01;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

// ---------------------------------------------------------------- practice
function PracticeCard({ data, mutate }) {
  const [start, setStart] = useState(() => Number(lsGet(TIMER_KEY)) || 0);
  const now = useNow(start ? 1000 : 60000);
  const today = todayISO();
  const st = G.streak(data, today);
  const wk = G.weekSummary(data, today);
  const todayMin = G.minutesOn(data, today);
  const bars = G.weeklyMinutes(data, 8, today).map((w) => ({ ...w, label: w.current ? 'This week' : `Week of ${dateLabel(w.from)}` }));
  const recent = [...data.sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 4);
  const log = (m, e) => {
    if (!st.today && e) celebrate({ ...centerOf(e.currentTarget), count: 18 });
    mutate((d) => G.logPractice(d, m), `Logged ${G.minutesLabel(m)} of guitar`);
  };
  const toggleTimer = (e) => {
    if (!start) {
      const t = Date.now();
      lsSet(TIMER_KEY, String(t));
      setStart(t);
      return;
    }
    const m = Math.round((Date.now() - start) / 60000);
    lsSet(TIMER_KEY, null);
    setStart(0);
    if (m >= 1) log(m, e);
  };
  return (
    <section className="card practice">
      <div className="card-head">
        <h2 className="card-title">Practice</h2>
        <label className="muted small">
          Goal{' '}
          <select className="inline-select" value={data.goalMin} onChange={(e) => mutate((d) => (d.goalMin = Number(e.target.value)))} aria-label="Daily practice goal">
            {[10, 15, 20, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} min a day
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="practice-top">
        <div className={`streak-badge ${st.current ? 'on' : ''}`}>
          <Icon name="flame" size={20} />
          <b className="num">{st.current}</b>
          <span>day streak</span>
        </div>
        <div className="grow">
          <div className="small">
            Today <b className="num">{todayMin}</b> <span className="muted">of {data.goalMin} min</span>
          </div>
          <div className="bar slim">
            <div className={`bar-fill ${todayMin >= data.goalMin ? '' : 'bar-ahead'}`} style={{ width: `${Math.min(100, (todayMin / data.goalMin) * 100)}%` }} />
          </div>
          <div className="muted small">
            {wk.minutes ? `This week ${G.minutesLabel(wk.minutes)} over ${plural(wk.played, 'day')}` : 'Nothing logged this week yet'}
            {st.best > st.current ? ` · best streak ${st.best}` : ''}
          </div>
        </div>
      </div>
      <div className="week-dots" aria-label="Days played this week">
        {wk.days.map((x) => (
          <span key={x.iso} className={`wd ${x.min ? 'on' : ''} ${x.today ? 'today' : ''} ${x.future ? 'future' : ''}`} title={`${dateLabel(x.iso)}: ${x.min ? G.minutesLabel(x.min) : 'no practice'}`}>
            {new Date(`${x.iso}T12:00:00`).toLocaleString('en-US', { weekday: 'narrow' })}
          </span>
        ))}
      </div>
      <div className="practice-acts">
        <button className={`btn ${start ? 'primary timer-on' : ''}`} onClick={toggleTimer} aria-label={start ? 'Stop the practice timer and log it' : 'Start the practice timer'}>
          {start ? `Stop · ${mmss(now - start)}` : 'Start timer'}
        </button>
        <div className="log-btns">
          {[10, 20, 30, 45].map((m) => (
            <button key={m} className="btn quiet small" onClick={(e) => log(m, e)}>
              +{m}m
            </button>
          ))}
        </div>
      </div>
      {start ? <p className="muted small note">The timer keeps running if you leave this page. Stop it to log the time.</p> : null}
      {bars.some((b) => b.v > 0) ? <MiniBars values={bars} goal={data.goalMin * 5} fmt={(v) => G.minutesLabel(Math.round(v))} label="Minutes a week, last 8 weeks (line: 5 days at your goal)" /> : null}
      {recent.length ? (
        <ul className="log-list small">
          {recent.map((s) => (
            <li key={s.id}>
              <span className="muted">{dateLabel(s.date)}</span> · {G.minutesLabel(s.minutes)}
              {s.what ? ` · ${s.what}` : ''}
              <button className="x" aria-label="Remove this session" onClick={() => mutate((d) => G.removePractice(d, s.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- course
function CourseCard({ data, mutate }) {
  const c = data.course;
  const [lesson, setLesson] = useState(c.lesson);
  useEffect(() => setLesson(c.lesson), [c.lesson]);
  const gradeName = (G.GRADES.find(([g]) => g === c.grade) || [])[1];
  const done = [...c.done].reverse().slice(0, 3);
  return (
    <section className="card course">
      <div className="card-head">
        <h2 className="card-title">JustinGuitar</h2>
        <a className="link small" href={G.JG_URL} target="_blank" rel="noopener">
          Open lessons <Icon name="ext" size={13} />
        </a>
      </div>
      <div className="seg" role="group" aria-label="Grade">
        {G.GRADES.map(([g, l]) => (
          <button key={g} className={`seg-btn ${c.grade === g ? 'on' : ''}`} onClick={() => c.grade !== g && mutate((d) => G.setCourse(d, { grade: g, module: 1 }))}>
            {l}
          </button>
        ))}
      </div>
      <div className="module-row">
        <span className="small muted">{c.grade === 4 ? 'Section' : 'Module'}</span>
        <button className="icon-btn" aria-label="Previous module" disabled={c.module <= 1} onClick={() => mutate((d) => G.setCourse(d, { module: Math.max(1, c.module - 1) }))}>
          −
        </button>
        <b className="module-n num" aria-live="polite">
          {c.module}
        </b>
        <button className="icon-btn" aria-label="Next module" onClick={() => mutate((d) => G.setCourse(d, { module: c.module + 1 }))}>
          +
        </button>
      </div>
      <input
        className="input"
        placeholder="Lesson you’re on (e.g. the chord or song)"
        value={lesson}
        onChange={(e) => setLesson(e.target.value)}
        onBlur={() => lesson !== c.lesson && mutate((d) => G.setCourse(d, { lesson: lesson.trim() }))}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="Current lesson"
      />
      <button
        className="btn block"
        onClick={(e) => {
          celebrate(centerOf(e.currentTarget));
          mutate((d) => G.finishModule(d), `Finished ${gradeName} module ${c.module}. On to ${c.module + 1}`);
        }}
      >
        <Icon name="check" size={16} /> Finished {c.grade === 4 ? 'section' : 'module'} {c.module}
      </button>
      {done.length ? (
        <ul className="log-list small">
          {done.map((x, i) => (
            <li key={`${x.grade}-${x.module}-${x.date}-${i}`}>
              <span className="grow">
                <span className="muted">{dateLabel(x.date)}</span> · {(G.GRADES.find(([g]) => g === x.grade) || [])[1]}, {x.grade === 4 ? 'section' : 'module'} {x.module}
                {x.lesson ? ` · ${x.lesson}` : ''}
              </span>
              {i === 0 ? (
                <button className="x" aria-label="Undo the last finished module" onClick={() => mutate((d) => G.undoFinish(d))}>
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small note">{plural(c.done.length, 'module')} finished so far. Tap “Finished” when you wrap one up and it moves you to the next.</p>
      )}
    </section>
  );
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------- one-minute changes
function ChangesCard({ data, mutate }) {
  const pairs = useMemo(() => G.changePairs(data), [data]);
  const last = pairs[0] ? pairs[0].pair.split('–') : ['A', 'D'];
  const [a, setA] = useState(last[0]);
  const [b, setB] = useState(last[1]);
  const [ends, setEnds] = useState(0);
  const [count, setCount] = useState('');
  const [phase, setPhase] = useState('idle'); // idle → running → count
  const now = useNow(phase === 'running' ? 200 : 60000);
  const left = ends ? ends - now.getTime() : 0;
  const inputRef = useRef(null);
  useEffect(() => {
    if (phase === 'running' && left <= 0) {
      beep(660, 0.5);
      setPhase('count');
      setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    }
  }, [phase, left]);
  const go = () => {
    beep(880, 0.15);
    setEnds(Date.now() + 60000);
    setPhase('running');
  };
  const save = (e) => {
    e.preventDefault();
    const n = Number(count);
    if (!(n >= 0) || count === '') return;
    const p = pairs.find((x) => x.pair === G.pairKey(a, b));
    if (p && n > p.best) celebrate(centerOf(e.currentTarget));
    mutate((d) => G.logChanges(d, a, b, n), p && n > p.best ? `New best on ${a}–${b}: ${n}` : `${a}–${b}: ${n} changes`);
    setCount('');
    setPhase('idle');
  };
  return (
    <section className="card changes">
      <div className="card-head">
        <h2 className="card-title">One-minute changes</h2>
        <span className="muted small">Switch chords as many times as you can in a minute</span>
      </div>
      <div className="changes-pick">
        <select className="input" value={a} onChange={(e) => setA(e.target.value)} aria-label="First chord" disabled={phase === 'running'}>
          {G.CHORDS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="muted">to</span>
        <select className="input" value={b} onChange={(e) => setB(e.target.value)} aria-label="Second chord" disabled={phase === 'running'}>
          {G.CHORDS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {phase === 'running' ? (
          <button className="btn primary changes-clock num" onClick={() => setPhase('count')} aria-label="Stop early">
            {Math.ceil(left / 1000)}s
          </button>
        ) : (
          <button className="btn" onClick={go} disabled={a === b}>
            Start 1:00
          </button>
        )}
      </div>
      <form className="changes-log" onSubmit={save}>
        <input ref={inputRef} className="input num" inputMode="numeric" placeholder={phase === 'count' ? 'How many?' : 'Changes'} value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} aria-label={`Changes between ${a} and ${b}`} />
        <button className="btn primary" type="submit" disabled={count === '' || a === b}>
          Log {a}–{b}
        </button>
      </form>
      {pairs.length ? (
        <ul className="list pairs">
          {pairs.slice(0, 6).map((p) => (
            <li key={p.pair} className="pair-row">
              <button className="pair-name" onClick={() => ([setA, setB].forEach((f, i) => f(p.pair.split('–')[i])))} title="Practice this pair">
                {p.pair}
              </button>
              <div className="grow pair-spark">
                {p.history.length > 1 ? (
                  <Sparkline points={p.history.map((x, i) => ({ i, v: x.count, label: dateLabel(x.date) }))} domain={p.history.length - 1} height={30} fmt={(v) => String(Math.round(v))} label={`${p.pair} changes`} endLabel={false} />
                ) : null}
              </div>
              <span className="small num">
                <b>{p.last.count}</b> <span className="muted">best {p.best}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small note">JustinGuitar’s trick for getting chord changes clean: one minute, one pair, count every change. Beat your number next time.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- songs
function SongsCard({ data, mutate }) {
  const [f, setF] = useState({ title: '', artist: '' });
  const [show, setShow] = useState('learning');
  const counts = Object.fromEntries(G.SONG_STATUS.map(([k]) => [k, data.songs.filter((s) => s.status === k).length]));
  const list = data.songs.filter((s) => s.status === show);
  const [amp, setAmp] = useState(null); // the song whose amp settings are open
  return (
    <section className="card songs">
      <div className="card-head">
        <h2 className="card-title">Songs</h2>
        <span className="muted small">{counts.can} you can play</span>
      </div>
      <div className="seg mini-seg" role="group" aria-label="Show songs">
        {G.SONG_STATUS.map(([k, l]) => (
          <button key={k} className={`seg-btn ${show === k ? 'on' : ''}`} onClick={() => setShow(k)}>
            {l} {counts[k] ? <span className="muted">{counts[k]}</span> : null}
          </button>
        ))}
      </div>
      {list.length ? (
        <ul className="list">
          {list.map((s) => (
            <li key={s.id} className={`song ${amp === s.id ? 'amp-open' : ''}`}>
              <div className="grow">
                <div className="bill-name">{s.title}</div>
                {s.artist ? <div className="muted small">{s.artist}</div> : null}
                {s.amp ? <div className="small amp-sum">{G.ampSummary(s.amp)}</div> : null}
              </div>
              <button className={`icon-btn amp-btn ${s.amp ? 'set' : ''}`} onClick={() => setAmp(amp === s.id ? null : s.id)} aria-label={`Amp settings for ${s.title}`} aria-expanded={amp === s.id} title="Amp settings">
                <Icon name="sliders" size={16} />
              </button>
              <select className="inline-select small" value={s.status} onChange={(e) => {
                if (e.target.value === 'can') celebrate(centerOf(e.currentTarget));
                mutate((d) => G.setSongStatus(d, s.id, e.target.value), e.target.value === 'can' ? `You can play ${s.title}` : undefined);
              }} aria-label={`${s.title} status`}>
                {G.SONG_STATUS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                className="x"
                aria-label={`Remove ${s.title}`}
                onClick={() => {
                  const song = { ...s };
                  const tempos = data.tempo.filter((t) => t.key === `song:${s.id}`);
                  mutate((d) => G.removeSong(d, s.id), {
                    text: `Removed ${s.title}`,
                    undo: () =>
                      mutate((d) => {
                        if (d.songs.some((x) => x.id === song.id)) return;
                        d.songs.push(song);
                        d.tempo.push(...tempos);
                      }, `${song.title} is back`),
                  });
                }}
              >
                ×
              </button>
              {amp === s.id ? <AmpEditor song={s} mutate={mutate} onClose={() => setAmp(null)} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty small">{show === 'can' ? 'Songs move here when you can play them start to finish.' : show === 'learning' ? 'Nothing in progress. Add a song, or move one over from Want to learn.' : 'Your someday list.'}</p>
      )}
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.title.trim()) return;
          mutate((d) => G.addSong(d, { ...f, status: show }), `Added ${f.title.trim()}`);
          setF({ title: '', artist: '' });
        }}
      >
        <input className="input" placeholder="Song" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Song title" />
        <input className="input" placeholder="Artist" value={f.artist} onChange={(e) => setF({ ...f, artist: e.target.value })} aria-label="Artist" />
        <button className="btn" type="submit" disabled={!f.title.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- amp settings (Boss Katana)
// A knob drawn as on the amp (pointer from 7 o'clock to 5 o'clock), set with the slider under it.
function Knob({ label, value, onChange, small }) {
  const angle = -150 + value * 30;
  return (
    <label className={`knob ${small ? 'small-knob' : ''}`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="15" className="knob-body" />
        <line x1="20" y1="20" x2="20" y2="8" className="knob-ptr" transform={`rotate(${angle} 20 20)`} />
      </svg>
      <span className="knob-label small">{label}</span>
      <input type="range" min="0" max="10" step="0.5" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} aria-valuetext={`${value} (${G.clockOf(value)})`} />
      <span className="knob-val small muted">{G.clockOf(value)}</span>
    </label>
  );
}
function AmpEditor({ song, mutate, onClose }) {
  const [a, setA] = useState(() => G.cleanAmp(song.amp || G.defaultAmp()));
  const fx = (k, patch) => setA({ ...a, [k]: { ...a[k], ...patch } });
  return (
    <div className="amp-ed">
      <div className="seg mini-seg amp-types" role="group" aria-label="Amp type">
        {G.AMP_TYPES.map((t) => (
          <button key={t} className={`seg-btn ${a.type === t ? 'on' : ''}`} aria-pressed={a.type === t} onClick={() => setA({ ...a, type: t })}>
            {t}
          </button>
        ))}
      </div>
      <label className="check-line small">
        <input type="checkbox" checked={a.variation} onChange={(e) => setA({ ...a, variation: e.target.checked })} /> Variation
      </label>
      <div className="knobs">
        {G.AMP_KNOBS.map(([k, l]) => (
          <Knob key={k} label={l} value={a[k]} onChange={(v) => setA({ ...a, [k]: v })} />
        ))}
      </div>
      <div className="fx-rows">
        {G.AMP_FX.map(([k, l]) => (
          <div key={k} className={`fx-row ${a[k].on ? 'on' : ''}`}>
            <label className="check-line small">
              <input type="checkbox" checked={a[k].on} onChange={(e) => fx(k, { on: e.target.checked })} /> {l}
            </label>
            {a[k].on ? (
              <>
                <Knob small label="Level" value={a[k].level} onChange={(v) => fx(k, { level: v })} />
                <div className="fx-colors" role="group" aria-label={`${l} button color`}>
                  {G.FX_COLORS.map(([c, cl]) => (
                    <button key={c} className={`fx-color fx-${c} ${a[k].color === c ? 'on' : ''}`} aria-label={cl} aria-pressed={a[k].color === c} title={cl} onClick={() => fx(k, { color: c })} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
      <input className="input" placeholder="Notes: pickup, which channel it’s saved to…" value={a.notes} onChange={(e) => setA({ ...a, notes: e.target.value })} aria-label="Amp notes" />
      <div className="plan-actions">
        <button className="btn primary small" onClick={() => mutate((d) => G.setAmp(d, song.id, a), `Amp settings saved for ${song.title}`).then((ok) => ok && onClose())}>
          Save
        </button>
        <button className="btn quiet small" onClick={onClose}>
          Cancel
        </button>
        {song.amp ? (
          <button className="btn quiet small" onClick={() => mutate((d) => G.clearAmp(d, song.id)).then((ok) => ok && onClose())}>
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tempo
function TempoCard({ data, mutate }) {
  const items = G.tempoItems(data).map((it) => ({ ...it, h: G.tempoHistory(data, it.key) }));
  const [sel, setSel] = useState(null);
  const [bpm, setBpm] = useState('');
  const [ex, setEx] = useState('');
  const key = items.some((i) => i.key === sel) ? sel : (items.find((x) => x.h) || items[0] || {}).key;
  const cur = items.find((x) => x.key === key);
  const n = Math.round(Number(bpm));
  const valid = n >= G.MIN_BPM && n <= G.MAX_BPM;
  const recent = cur ? data.tempo.filter((t) => t.key === cur.key).slice(-4).reverse() : [];
  return (
    <section className="card tempo">
      <div className="card-head">
        <h2 className="card-title">Tempo</h2>
        <span className="muted small">The speed you can play it cleanly</span>
      </div>
      {items.length ? (
        <>
          <ul className="tempo-list">
            {items.map((it) => (
              <li key={it.key}>
                <button className={`tempo-item ${it.key === key ? 'on' : ''}`} onClick={() => setSel(it.key)} aria-pressed={it.key === key}>
                  <span className="grow">
                    <span className="bill-name">{it.label}</span>
                    <span className="muted small block">
                      {it.sub}
                      {it.h ? ` · best ${it.h.best} bpm` : ' · no tempo yet'}
                    </span>
                  </span>
                  {it.h ? (
                    <b className="num tempo-now">
                      {it.h.last.bpm}
                      <span className="small muted"> bpm</span>
                    </b>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {cur && cur.h && cur.h.history.length > 1 ? (
            <LineChart points={cur.h.history.map((t) => ({ t: t.date, v: t.bpm }))} fmt={(v) => `${Math.round(v)} bpm`} label={`${cur.label} tempo`} color="purple" height={140} gap={4000} dots yLabel={(v) => String(Math.round(v))} />
          ) : null}
          {cur && cur.h ? (
            <p className="small">
              {cur.label}: <b>{cur.h.last.bpm} bpm</b> on {dateLabel(cur.h.last.date)}
              {cur.h.gain > 0 ? `, up ${cur.h.gain} since ${dateLabel(cur.h.first.date)}` : ''}.
            </p>
          ) : null}
          {cur ? (
            <form
              className="add-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valid) return;
                const best = cur.h ? cur.h.best : 0;
                if (n > best && best) celebrate();
                mutate((d) => G.logTempo(d, cur.key, n), n > best && best ? `New best: ${cur.label} at ${n} bpm` : `${cur.label} at ${n} bpm`);
                setBpm('');
              }}
            >
              <input className="input num" inputMode="numeric" placeholder="bpm" value={bpm} onChange={(e) => setBpm(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} aria-label={`Clean tempo for ${cur.label}`} />
              <button className="btn" type="submit" disabled={!valid}>
                Log for {cur.label.length > 22 ? `${cur.label.slice(0, 20)}…` : cur.label}
              </button>
            </form>
          ) : null}
          {recent.length ? (
            <ul className="log-list small">
              {recent.map((t) => (
                <li key={t.id}>
                  <span className="muted">{dateLabel(t.date)}</span> · {t.bpm} bpm
                  <button className="x" aria-label="Remove this tempo" onClick={() => mutate((d) => G.removeTempo(d, t.id))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {cur && cur.key.startsWith('ex:') ? (
            <button
              className="link-btn small"
              onClick={() => {
                const ex = data.exercises.find((x) => `ex:${x.id}` === cur.key);
                const tempos = data.tempo.filter((t) => t.key === cur.key);
                mutate((d) => G.removeExercise(d, ex.id), {
                  text: `Removed ${ex.name}`,
                  undo: () =>
                    mutate((d) => {
                      if (d.exercises.some((x) => x.id === ex.id)) return;
                      d.exercises.push(ex);
                      d.tempo.push(...tempos);
                    }, `${ex.name} is back`),
                });
              }}
            >
              Remove this exercise
            </button>
          ) : null}
        </>
      ) : (
        <p className="empty small">Songs you’re learning show up here. Add an exercise too, then log the speed you can play it cleanly.</p>
      )}
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ex.trim()) return;
          mutate((d) => G.addExercise(d, ex), `Added ${ex.trim()}`);
          setEx('');
        }}
      >
        <input className="input" placeholder="Exercise, e.g. Strumming pattern 1" value={ex} onChange={(e) => setEx(e.target.value)} aria-label="New exercise" />
        <button className="btn quiet" type="submit" disabled={!ex.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- tuner
function Tuner() {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  const [reading, setReading] = useState(null);
  const run = useRef(null);
  const stop = () => {
    const r = run.current;
    run.current = null;
    if (r) {
      cancelAnimationFrame(r.raf);
      r.stream.getTracks().forEach((t) => t.stop());
      try {
        r.src.disconnect();
      } catch {
        /* already */
      }
    }
    setOn(false);
    setReading(null);
  };
  useEffect(() => stop, []);
  const start = async () => {
    setErr('');
    const c = audio();
    if (!c || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return setErr('This browser can’t use the microphone here.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = c.createMediaStreamSource(stream);
      const an = c.createAnalyser();
      an.fftSize = 4096;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const recent = [];
      let lastT = 0;
      const r = { stream, src, raf: 0 };
      run.current = r;
      const tick = (t) => {
        if (run.current !== r) return;
        if (t - lastT > 80) {
          lastT = t;
          an.getFloatTimeDomainData(buf);
          const f = G.detectPitch(buf, c.sampleRate);
          if (f) {
            recent.push(f);
            if (recent.length > 5) recent.shift();
            const med = [...recent].sort((x, y) => x - y)[Math.floor(recent.length / 2)];
            setReading({ note: G.noteOf(med), string: G.nearestString(med), at: Date.now() });
          } else if (recent.length) {
            recent.length = 0;
          }
        }
        r.raf = requestAnimationFrame(tick);
      };
      r.raf = requestAnimationFrame(tick);
      setOn(true);
    } catch (e) {
      setErr(/denied|allowed|permission/i.test(String(e && (e.name || e.message))) ? 'Microphone access was blocked. Allow it for this site in your browser settings, then try again.' : 'Couldn’t start the microphone.');
    }
  };
  const n = reading && Date.now() - reading.at < 1500 ? reading : null;
  const cents = n ? n.note.cents : 0;
  const inTune = n && Math.abs(cents) <= 5;
  return (
    <div className="tuner">
      <div className={`tuner-face ${n ? (inTune ? 'good' : 'off') : ''}`}>
        <div className="tuner-note">
          {n ? n.note.name : '–'}
          <sub>{n ? n.note.octave : ''}</sub>
        </div>
        <div className="tuner-meter" aria-hidden="true">
          <span className="tick mid" />
          <span className="needle" style={{ left: `${50 + Math.max(-50, Math.min(50, cents))}%` }} />
        </div>
        <div className="tuner-read small">{n ? (inTune ? 'In tune' : cents < 0 ? `${-cents}¢ flat, tune up` : `${cents}¢ sharp, tune down`) : on ? 'Pluck one string…' : 'Standard tuning, A = 440 Hz'}</div>
      </div>
      <div className="strings" aria-label="Strings">
        {G.STRINGS.map(([name, oct], i) => (
          <span key={i} className={`string ${n && n.string.index === i ? 'hit' : ''} ${n && n.string.index === i && Math.abs(n.string.cents) <= 5 ? 'good' : ''}`}>
            {name}
            <sub>{oct}</sub>
          </span>
        ))}
      </div>
      {err ? <p className="alert small">{err}</p> : null}
      <button className={`btn block ${on ? '' : 'primary'}`} onClick={on ? stop : start}>
        {on ? 'Stop tuner' : 'Start tuner'}
      </button>
      <p className="muted small note">Uses the microphone while it’s on. Nothing is recorded or sent anywhere.</p>
    </div>
  );
}

// ---------------------------------------------------------------- metronome
function Metronome({ data, mutate }) {
  const [bpm, setBpm] = useState(() => Number(lsGet('dash.bpm')) || 80);
  const [beats, setBeats] = useState(4);
  const [on, setOn] = useState(false);
  const [beat, setBeat] = useState(-1);
  const ref = useRef({ bpm, beats, timer: 0, next: 0, n: 0, taps: [] });
  ref.current.bpm = bpm;
  ref.current.beats = beats;
  useEffect(() => lsSet('dash.bpm', String(bpm)), [bpm]);
  const stop = () => {
    clearInterval(ref.current.timer);
    ref.current.timer = 0;
    setOn(false);
    setBeat(-1);
  };
  useEffect(() => stop, []);
  const start = () => {
    const c = audio();
    if (!c) return;
    const r = ref.current;
    r.next = c.currentTime + 0.06;
    r.n = 0;
    const schedule = () => {
      while (r.next < c.currentTime + 0.12) {
        const accent = r.n % r.beats === 0;
        beep(accent ? 1560 : 1040, 0.05, r.next, accent ? 0.7 : 0.45);
        const i = r.n % r.beats;
        const delay = Math.max(0, (r.next - c.currentTime) * 1000);
        setTimeout(() => r.timer && setBeat(i), delay);
        r.next += 60 / r.bpm;
        r.n++;
      }
    };
    schedule();
    r.timer = setInterval(schedule, 25);
    setOn(true);
  };
  const tap = () => {
    const t = performance.now();
    const taps = ref.current.taps.filter((x) => t - x < 2500);
    taps.push(t);
    ref.current.taps = taps;
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((x, i) => x - taps[i]);
      const avg = gaps.slice(-4).reduce((a, x) => a + x, 0) / Math.min(4, gaps.length);
      setBpm(Math.max(30, Math.min(240, Math.round(60000 / avg))));
    }
  };
  const nudge = (n) => setBpm((b) => Math.max(30, Math.min(240, b + n)));
  return (
    <div className="metronome">
      <div className="met-bpm">
        <button className="icon-btn" onClick={() => nudge(-5)} aria-label="5 slower">
          −
        </button>
        <div className="met-n">
          <b className="num">{bpm}</b>
          <span>bpm</span>
        </div>
        <button className="icon-btn" onClick={() => nudge(5)} aria-label="5 faster">
          +
        </button>
      </div>
      <input className="met-slider" type="range" min="30" max="240" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} aria-label="Tempo" />
      <div className="met-dots" aria-hidden="true">
        {Array.from({ length: beats }, (_, i) => (
          <span key={i} className={`met-dot ${i === 0 ? 'accent' : ''} ${beat === i ? 'on' : ''}`} />
        ))}
      </div>
      <div className="met-row">
        <label className="small muted">
          Beats{' '}
          <select className="inline-select" value={beats} onChange={(e) => setBeats(Number(e.target.value))} aria-label="Beats per bar">
            {[2, 3, 4, 6].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <button className="btn quiet small" onClick={tap}>
          Tap tempo
        </button>
      </div>
      <button className={`btn block ${on ? '' : 'primary'}`} onClick={on ? stop : start}>
        {on ? 'Stop' : 'Start metronome'}
      </button>
      {data ? <LogTempo data={data} mutate={mutate} bpm={bpm} /> : null}
    </div>
  );
}
// Played it cleanly at this speed? Log it for a song or exercise, straight from the metronome.
function LogTempo({ data, mutate, bpm }) {
  const items = G.tempoItems(data);
  const [key, setKey] = useState('');
  const k = items.some((i) => i.key === key) ? key : items[0] ? items[0].key : '';
  if (!items.length) return null;
  const it = items.find((i) => i.key === k);
  return (
    <div className="met-log">
      <span className="small">Clean at {bpm}?</span>
      <select className="inline-select small" value={k} onChange={(e) => setKey(e.target.value)} aria-label="Log the tempo for">
        {items.map((i) => (
          <option key={i.key} value={i.key}>
            {i.label}
          </option>
        ))}
      </select>
      <button className="btn quiet small" onClick={() => mutate((d) => G.logTempo(d, k, bpm), `${it.label} at ${bpm} bpm`)}>
        Log it
      </button>
    </div>
  );
}

function ToolsCard({ data, mutate }) {
  const [tool, setTool] = useState('tuner');
  return (
    <section className="card tools">
      <div className="card-head">
        <h2 className="card-title">Tools</h2>
        <div className="seg mini-seg" role="tablist">
          {[
            ['tuner', 'Tuner'],
            ['metronome', 'Metronome'],
          ].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tool === k} className={`seg-btn ${tool === k ? 'on' : ''}`} onClick={() => setTool(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {tool === 'tuner' ? <Tuner /> : <Metronome data={data} mutate={mutate} />}
    </section>
  );
}

// ---------------------------------------------------------------- the header: an amp
// The Guitar section's header, drawn as an amp: a control panel whose knobs read today's playing against the daily
// goal, the week's minutes against seven days of it, and the days played this week, a power light that's on once
// you've played today, the streak on a little display, and the grille with where you are in the course.
function PanelKnob({ label, value, read }) {
  const v = Math.max(0, Math.min(10, value));
  const ticks = Array.from({ length: 11 }, (_, i) => -150 + i * 30);
  return (
    <div className="ak">
      <svg viewBox="0 0 56 56" aria-hidden="true">
        {ticks.map((a) => (
          <line key={a} x1="28" y1="3.5" x2="28" y2="7" className="ak-tick" transform={`rotate(${a} 28 28)`} />
        ))}
        <circle cx="28" cy="28" r="18" className="ak-skirt" />
        <circle cx="28" cy="28" r="14" className="ak-cap" />
        <line x1="28" y1="28" x2="28" y2="13.5" className="ak-ptr" transform={`rotate(${-150 + v * 30} 28 28)`} />
      </svg>
      <span className="ak-label">{label}</span>
      <span className="ak-read">{read}</span>
    </div>
  );
}
export function AmpHero({ data }) {
  const today = todayISO();
  const goal = data ? data.goalMin : 20;
  const mins = data ? G.minutesOn(data, today) : 0;
  const wk = data ? G.weekSummary(data, today) : { minutes: 0, played: 0 };
  const st = data ? G.streak(data, today) : { current: 0 };
  const c = data ? data.course : null;
  const grade = c ? (G.GRADES.find(([g]) => g === c.grade) || [])[1] : null;
  return (
    <section className="learn-hero amp-hero">
      <div className="amp-panel">
        <div className="amp-power">
          <span className={`amp-led ${mins ? 'on' : ''}`} />
          <span className="ak-label">{mins ? 'Played today' : 'Not yet today'}</span>
        </div>
        <div className="amp-knobs">
          <PanelKnob label="Today" value={(mins / goal) * 10} read={G.minutesLabel(mins)} />
          <PanelKnob label="Week" value={(wk.minutes / (goal * 7)) * 10} read={G.minutesLabel(wk.minutes)} />
          <PanelKnob label="Days" value={(wk.played / 7) * 10} read={`${wk.played} of 7`} />
        </div>
        <div className="amp-lcd" role="img" aria-label={`${st.current}-day streak`}>
          <span>Streak</span>
          <b>{st.current}</b>
        </div>
      </div>
      <div className="amp-grille">
        <div className="lh-kicker amp-kicker">Learning</div>
        <h1 className="page-title amp-title">Guitar</h1>
        {c ? (
          <p className="amp-sub">
            {grade}, {c.grade === 4 ? 'section' : 'module'} {c.module}
            {c.lesson ? ` · ${c.lesson}` : ''}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the section, and a line for Home
export function GuitarSection({ data, mutate }) {
  if (!data) return <section className="card"><p className="empty">Loading…</p></section>;
  return (
    <div className="grid guitar">
      <div className="col">
        <PracticeCard data={data} mutate={mutate} />
        <ChangesCard data={data} mutate={mutate} />
        <SongsCard data={data} mutate={mutate} />
      </div>
      <div className="col">
        <CourseCard data={data} mutate={mutate} />
        <ToolsCard data={data} mutate={mutate} />
        <TempoCard data={data} mutate={mutate} />
      </div>
    </div>
  );
}

export function GuitarHomeRow({ data, mutate }) {
  if (!data) return null;
  const today = todayISO();
  const st = G.streak(data, today);
  const mins = G.minutesOn(data, today);
  const c = data.course;
  const grade = (G.GRADES.find(([g]) => g === c.grade) || [])[1];
  return (
    <div className="home-row guitar-row">
      <a className="grow plain" href="#/learning?guitar">
        <span className="bill-name">
          Guitar{st.current ? <span className="streak-mini"> 🔥 {st.current}</span> : null}
        </span>
        <span className="muted small block">
          {mins ? `${G.minutesLabel(mins)} today` : st.current ? 'Play today to keep the streak' : 'Not yet today'} · {grade}, {c.grade === 4 ? 'section' : 'module'} {c.module}
        </span>
      </a>
      <button className="btn quiet small" onClick={() => mutate((d) => G.logPractice(d, data.goalMin), `Logged ${data.goalMin}m of guitar`)}>
        +{data.goalMin}m
      </button>
    </div>
  );
}
