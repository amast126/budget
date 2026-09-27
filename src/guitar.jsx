// Guitar, on the Learning tab: practice timer and streak, JustinGuitar course progress, one-minute chord changes,
// songs, and a tuner and metronome that run in the browser (Web Audio; the tuner asks for the microphone).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { MiniBars, Sparkline } from './spark.jsx';
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
            <li key={s.id} className="song">
              <div className="grow">
                <div className="bill-name">{s.title}</div>
                {s.artist ? <div className="muted small">{s.artist}</div> : null}
              </div>
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
              <button className="x" aria-label={`Remove ${s.title}`} onClick={() => mutate((d) => G.removeSong(d, s.id))}>
                ×
              </button>
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
function Metronome() {
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
    </div>
  );
}

function ToolsCard() {
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
      {tool === 'tuner' ? <Tuner /> : <Metronome />}
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
        <ToolsCard />
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
