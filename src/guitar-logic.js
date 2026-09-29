// Guitar (a section of the Learning tab): practice log and streak, where you are in the JustinGuitar course,
// one-minute chord changes, and a song list. Saved in trackers/<doc>-guitar.
import { uid, todayISO } from './budget-logic.js';

const DAY = 86400000;
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d + n));
};

// JustinGuitar's Beginner Guitar Course comes in three grades of modules; after that it's the intermediate
// material. Module names aren't stored here: you type the lesson you're on, and "Finished module" moves you on.
export const GRADES = [
  [1, 'Grade 1'],
  [2, 'Grade 2'],
  [3, 'Grade 3'],
  [4, 'Intermediate'],
];
export const JG_URL = 'https://www.justinguitar.com/';
export const SONG_STATUS = [
  ['want', 'Want to learn'],
  ['learning', 'Learning'],
  ['can', 'Can play'],
];
// Open chords for the one-minute changes exercise (the beginner course builds up to these).
export const CHORDS = ['A', 'D', 'E', 'Am', 'Em', 'Dm', 'G', 'C', 'F', 'Fmaj7', 'Cadd9', 'A7', 'D7', 'E7', 'G7', 'C7', 'B7', 'Asus2', 'Dsus2', 'Asus4', 'Dsus4'];
export const pairKey = (a, b) => `${a}–${b}`;

export function defaultGuitar() {
  return { version: 1, goalMin: 20, sessions: [], course: { grade: 1, module: 1, lesson: '', done: [] }, changes: [], songs: [], tempo: [], exercises: [] };
}
export function normalizeGuitar(d) {
  const base = defaultGuitar();
  if (!d || typeof d !== 'object') return base;
  const c = d.course && typeof d.course === 'object' ? d.course : {};
  return {
    version: 1,
    goalMin: Number(d.goalMin) > 0 ? Number(d.goalMin) : base.goalMin,
    sessions: Array.isArray(d.sessions) ? d.sessions.filter((s) => s && s.date && Number(s.minutes) > 0) : [],
    course: {
      grade: [1, 2, 3, 4].includes(Number(c.grade)) ? Number(c.grade) : 1,
      module: Math.max(1, Math.round(Number(c.module) || 1)),
      lesson: String(c.lesson || ''),
      done: Array.isArray(c.done) ? c.done.filter(Boolean) : [],
    },
    changes: Array.isArray(d.changes) ? d.changes.filter((x) => x && x.pair && Number(x.count) >= 0) : [],
    songs: Array.isArray(d.songs) ? d.songs.filter((s) => s && s.title) : [],
    tempo: Array.isArray(d.tempo) ? d.tempo.filter((t) => t && t.key && Number(t.bpm) > 0) : [],
    exercises: Array.isArray(d.exercises) ? d.exercises.filter((x) => x && x.id && x.name) : [],
    updatedAt: d.updatedAt,
  };
}

// ---------------------------------------------------------------- practice
export function logPractice(d, minutes, { date = todayISO(), what = '' } = {}) {
  const m = Math.round(Number(minutes));
  if (!(m > 0)) return null;
  const s = { id: uid(), date, minutes: Math.min(m, 600), what: String(what || '').trim() };
  d.sessions.push(s);
  return s;
}
export function removePractice(d, id) {
  d.sessions = d.sessions.filter((s) => s.id !== id);
}
export const minutesOn = (d, iso) => d.sessions.filter((s) => s.date === iso).reduce((a, s) => a + Number(s.minutes), 0);
export function minutesBetween(d, from, to) {
  return d.sessions.filter((s) => s.date >= from && s.date <= to).reduce((a, s) => a + Number(s.minutes), 0);
}
export function weekStart(today = todayISO()) {
  const [y, m, dd] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, dd);
  return isoOf(new Date(y, m - 1, dd - ((dt.getDay() + 6) % 7))); // Monday
}
// Days in a row with any practice, counting today if you've played, otherwise ending yesterday.
export function streak(d, today = todayISO()) {
  const days = new Set(d.sessions.map((s) => s.date));
  let n = 0;
  let cur = days.has(today) ? today : addDays(today, -1);
  while (days.has(cur)) {
    n++;
    cur = addDays(cur, -1);
  }
  let best = 0;
  let run = 0;
  let prev = null;
  [...days].sort().forEach((x) => {
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  });
  return { current: n, best, today: days.has(today) };
}
export function weekSummary(d, today = todayISO()) {
  const from = weekStart(today);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDays(from, i);
    days.push({ iso, min: minutesOn(d, iso), future: iso > today, today: iso === today });
  }
  return { from, minutes: days.reduce((a, x) => a + x.min, 0), played: days.filter((x) => x.min > 0).length, days };
}
// Minutes per week for the last n weeks (oldest first), for the little bar chart.
export function weeklyMinutes(d, n = 8, today = todayISO()) {
  const start = weekStart(today);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const from = addDays(start, -7 * i);
    out.push({ from, v: minutesBetween(d, from, addDays(from, 6)), current: i === 0 });
  }
  return out;
}

// ---------------------------------------------------------------- course
export function setCourse(d, patch) {
  Object.assign(d.course, patch);
}
export function finishModule(d, today = todayISO()) {
  d.course.done.push({ grade: d.course.grade, module: d.course.module, lesson: d.course.lesson || '', date: today });
  d.course.module += 1;
  d.course.lesson = '';
}
export function undoFinish(d) {
  const last = d.course.done.pop();
  if (last) {
    d.course.grade = last.grade;
    d.course.module = last.module;
    d.course.lesson = last.lesson || '';
  }
}

// ---------------------------------------------------------------- one-minute changes
export function logChanges(d, a, b, count, date = todayISO()) {
  const n = Math.round(Number(count));
  if (!a || !b || a === b || !(n >= 0)) return null;
  const x = { id: uid(), date, pair: pairKey(a, b), count: Math.min(n, 200) };
  d.changes.push(x);
  return x;
}
export function removeChanges(d, id) {
  d.changes = d.changes.filter((x) => x.id !== id);
}
// Each pair you've practiced: latest score, best, first, and the history (oldest first).
export function changePairs(d) {
  const by = new Map();
  d.changes.forEach((x) => {
    if (!by.has(x.pair)) by.set(x.pair, []);
    by.get(x.pair).push(x);
  });
  return [...by.entries()]
    .map(([pair, list]) => {
      const h = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return { pair, last: h[h.length - 1], best: Math.max(...h.map((x) => x.count)), first: h[0].count, history: h };
    })
    .sort((a, b) => (a.last.date < b.last.date ? 1 : a.last.date > b.last.date ? -1 : 0));
}

// ---------------------------------------------------------------- songs
export function addSong(d, { title, artist = '', status = 'want' }) {
  const t = String(title || '').trim();
  if (!t) return null;
  const s = { id: uid(), title: t, artist: String(artist || '').trim(), status, added: todayISO() };
  d.songs.push(s);
  return s;
}
export function setSongStatus(d, id, status) {
  const s = d.songs.find((x) => x.id === id);
  if (!s) return;
  s.status = status;
  if (status === 'can') s.learned = s.learned || todayISO();
}
export function removeSong(d, id) {
  d.songs = d.songs.filter((s) => s.id !== id);
  d.tempo = (d.tempo || []).filter((t) => t.key !== `song:${id}`);
}

// ---------------------------------------------------------------- tempo
// The speed you can play something cleanly, logged over time: songs (as "song:<id>") and exercises you name
// ("ex:<id>"), so a song's history follows it if you rename it.
export const MIN_BPM = 30;
export const MAX_BPM = 240;
export function addExercise(d, name) {
  const n = String(name || '').trim().slice(0, 60);
  if (!n) return null;
  const have = d.exercises.find((x) => x.name.toLowerCase() === n.toLowerCase());
  if (have) return have;
  const x = { id: uid(), name: n, added: todayISO() };
  d.exercises.push(x);
  return x;
}
export function removeExercise(d, id) {
  d.exercises = d.exercises.filter((x) => x.id !== id);
  d.tempo = d.tempo.filter((t) => t.key !== `ex:${id}`);
}
// What you can log a tempo for: songs you're learning or can play, then your exercises.
export function tempoItems(d) {
  return [
    ...d.songs.filter((s) => s.status !== 'want').map((s) => ({ key: `song:${s.id}`, label: s.title, sub: s.artist || 'Song' })),
    ...d.exercises.map((x) => ({ key: `ex:${x.id}`, label: x.name, sub: 'Exercise' })),
  ];
}
export function logTempo(d, key, bpm, date = todayISO()) {
  const n = Math.round(Number(bpm));
  if (!key || !(n >= MIN_BPM && n <= MAX_BPM)) return null;
  const t = { id: uid(), key, bpm: n, date };
  d.tempo.push(t);
  d.tempo = d.tempo.slice(-3000);
  return t;
}
export function removeTempo(d, id) {
  d.tempo = d.tempo.filter((t) => t.id !== id);
}
// Each item's history (oldest first; a day's best when you logged it more than once), latest and best.
export function tempoHistory(d, key) {
  const byDay = new Map();
  for (const t of d.tempo.filter((x) => x.key === key)) if (!byDay.has(t.date) || byDay.get(t.date).bpm < t.bpm) byDay.set(t.date, t);
  const history = [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!history.length) return null;
  const first = history[0];
  const last = history[history.length - 1];
  return { history, first, last, best: Math.max(...history.map((t) => t.bpm)), gain: last.bpm - first.bpm };
}

// ---------------------------------------------------------------- amp settings (Boss Katana)
// The panel as it is on the Katana: amp type (plus the variation button; Gen 3 adds Pushed), the tone knobs, and the
// effects, each on or off with its level and its button's color (green, red or orange, as the Mk II manual names
// them). On a Mk I, Booster/Mod and Delay/FX share a knob; just turn on the one you use. Knobs don't have numbers,
// so they're saved 0–10 in half steps and shown as a clock position too (0 = 7 o'clock, 5 = noon, 10 = 5 o'clock).
export const AMP_TYPES = ['Acoustic', 'Clean', 'Pushed', 'Crunch', 'Lead', 'Brown'];
export const AMP_KNOBS = [
  ['gain', 'Gain'],
  ['volume', 'Volume'],
  ['bass', 'Bass'],
  ['middle', 'Middle'],
  ['treble', 'Treble'],
];
export const AMP_FX = [
  ['booster', 'Booster'],
  ['mod', 'Mod'],
  ['fx', 'FX'],
  ['delay', 'Delay'],
  ['reverb', 'Reverb'],
];
export const FX_COLORS = [
  ['green', 'Green'],
  ['red', 'Red'],
  ['orange', 'Orange'],
];
const fxOff = () => ({ on: false, level: 5, color: 'green' });
export const defaultAmp = () => ({ type: 'Clean', variation: false, gain: 5, volume: 5, bass: 5, middle: 5, treble: 5, ...Object.fromEntries(AMP_FX.map(([k]) => [k, fxOff()])), notes: '' });
const knob = (v, d = 5) => {
  const n = Math.round(Number(v) * 2) / 2;
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : d;
};
export function cleanAmp(a) {
  const base = defaultAmp();
  const x = a && typeof a === 'object' ? a : {};
  const out = { type: AMP_TYPES.includes(x.type) ? x.type : base.type, variation: !!x.variation, notes: String(x.notes || '').trim().slice(0, 300) };
  for (const [k] of AMP_KNOBS) out[k] = knob(x[k]);
  for (const [k] of AMP_FX) {
    const f = x[k] && typeof x[k] === 'object' ? x[k] : {};
    const color = f.color === 'yellow' ? 'orange' : f.color;
    out[k] = { on: !!f.on, level: knob(f.level), color: FX_COLORS.some(([c]) => c === color) ? color : 'green' };
  }
  return out;
}
export function setAmp(d, songId, amp) {
  const s = d.songs.find((x) => x.id === songId);
  if (s) s.amp = cleanAmp(amp);
}
export function clearAmp(d, songId) {
  const s = d.songs.find((x) => x.id === songId);
  if (s) delete s.amp;
}
export function clockOf(v) {
  const h = 7 + knob(v); // hours past midnight on a dial that starts at 7
  const whole = Math.floor(h);
  const hour = ((whole - 1) % 12) + 1;
  const half = h - whole >= 0.5;
  if (hour === 12 && !half) return 'noon';
  return half ? `${hour}:30` : `${hour} o’clock`;
}
// "Crunch · gain 2 o’clock · reverb (red)": the song row's one-line summary.
export function ampSummary(a) {
  if (!a) return '';
  const fx = AMP_FX.filter(([k]) => a[k] && a[k].on).map(([k, l]) => `${k === 'fx' ? 'FX' : l.toLowerCase()} (${a[k].color})`);
  return [`${a.type}${a.variation ? ' variation' : ''}`, `gain ${clockOf(a.gain)}`, ...fx].join(' · ');
}

// ---------------------------------------------------------------- tuner math
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
// Standard tuning, low to high.
export const STRINGS = [
  ['E', 2, 82.41],
  ['A', 2, 110.0],
  ['D', 3, 146.83],
  ['G', 3, 196.0],
  ['B', 3, 246.94],
  ['E', 4, 329.63],
];
export function noteOf(freq, a4 = 440) {
  if (!(freq > 0)) return null;
  const n = 12 * Math.log2(freq / a4) + 69; // MIDI number, fractional
  const midi = Math.round(n);
  return { midi, name: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, cents: Math.round((n - midi) * 100), freq };
}
export function nearestString(freq) {
  if (!(freq > 0)) return null;
  let best = 0;
  STRINGS.forEach(([, , f], i) => {
    if (Math.abs(Math.log2(freq / f)) < Math.abs(Math.log2(freq / STRINGS[best][2]))) best = i;
  });
  const [name, octave, f] = STRINGS[best];
  return { index: best, name, octave, target: f, cents: Math.round(1200 * Math.log2(freq / f)) };
}
// Pitch of a mono buffer by autocorrelation (good for a single plucked string); null when it's too quiet or unclear.
export function detectPitch(buf, sampleRate) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return null;
  // trim the quiet ends so the correlation isn't dominated by silence
  let a = 0;
  let b = n - 1;
  const th = 0.2;
  for (let i = 0; i < n / 2; i++) if (Math.abs(buf[i]) < th) a = i; else break;
  for (let i = 1; i < n / 2; i++) if (Math.abs(buf[n - i]) < th) b = n - i; else break;
  const x = buf.slice(a, b);
  const m = x.length;
  const minLag = Math.floor(sampleRate / 1000); // up to 1 kHz
  const maxLag = Math.min(m - 1, Math.floor(sampleRate / 60)); // down to 60 Hz
  if (maxLag <= minLag) return null;
  const c = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < m - lag; i++) s += x[i] * x[i + lag];
    c[lag] = s;
  }
  // first dip, then the highest peak after it
  let d = minLag;
  while (d < maxLag && c[d] > c[d + 1]) d++;
  let peak = -1;
  let pos = -1;
  for (let i = d; i <= maxLag; i++) {
    if (c[i] > peak) {
      peak = c[i];
      pos = i;
    }
  }
  if (pos <= 0 || peak < c[0] * 0.3) return null;
  // parabolic interpolation around the peak
  const y1 = c[pos - 1] || c[pos];
  const y2 = c[pos];
  const y3 = c[pos + 1] || c[pos];
  const den = y1 - 2 * y2 + y3;
  const shift = den ? (y1 - y3) / (2 * den) : 0;
  return sampleRate / (pos + shift);
}

export { addDays };
export const minutesLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
export const DAY_MS = DAY;
