// Reads an Apple Health export (the export.zip from Health → your picture → Export All Health Data) right in the
// browser and boils it down to daily numbers. Nothing is uploaded anywhere: the file is read locally, and only the
// daily summaries are saved to your private dashboard documents.
//
// Works on the .zip (preferred: includes ECGs and workout routes) or on export.xml alone. The XML can be close to
// a gigabyte, so it's streamed line by line and never held in memory.

// ---------------------------------------------------------------- zip reading (no library: central directory + DecompressionStream)
const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);
const u64 = (v, o) => Number(v.getBigUint64(o, true));
const bytesOf = async (blob, from, to) => new DataView(await blob.slice(from, to).arrayBuffer());

export async function zipEntries(file) {
  const size = file.size;
  const tailLen = Math.min(size, 65557 + 20);
  const tail = await bytesOf(file, size - tailLen, size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('That file isn’t a zip. Choose the export.zip from the Health app, or export.xml from inside it.');
  let count = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdOff = u32(tail, eocd + 16);
  if (cdOff === 0xffffffff || cdSize === 0xffffffff || count === 0xffff) {
    // ZIP64: the locator sits just before the end record and points at the real one.
    const loc = eocd - 20;
    if (loc >= 0 && u32(tail, loc) === 0x07064b50) {
      const recOff = u64(tail, loc + 8);
      const rec = await bytesOf(file, recOff, recOff + 56);
      count = u64(rec, 32);
      cdSize = u64(rec, 40);
      cdOff = u64(rec, 48);
    }
  }
  const cd = await bytesOf(file, cdOff, cdOff + cdSize);
  const dec = new TextDecoder();
  const out = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (u32(cd, p) !== 0x02014b50) break;
    const method = u16(cd, p + 10);
    let comp = u32(cd, p + 20);
    let full = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    let local = u32(cd, p + 42);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    // ZIP64 extra field holds the real sizes/offset when the 32-bit ones are maxed out.
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = u16(cd, e);
      const len = u16(cd, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (full === 0xffffffff) (full = u64(cd, q)), (q += 8);
        if (comp === 0xffffffff) (comp = u64(cd, q)), (q += 8);
        if (local === 0xffffffff) local = u64(cd, q);
      }
      e += 4 + len;
    }
    out.push({ name, method, comp, size: full, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export async function entryStream(file, entry) {
  const h = await bytesOf(file, entry.local, entry.local + 30);
  if (u32(h, 0) !== 0x04034b50) throw new Error(`Couldn’t read ${entry.name} from the zip.`);
  const start = entry.local + 30 + u16(h, 26) + u16(h, 28);
  const raw = file.slice(start, start + entry.comp).stream();
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error(`${entry.name} uses a zip compression this browser can’t read.`);
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t unzip files. Update it, or unzip the export and choose export.xml.');
  return raw.pipeThrough(new DecompressionStream('deflate-raw'));
}

async function entryText(file, entry) {
  return new Response(await entryStream(file, entry)).text();
}

// Count bytes as they stream past (for the progress bar).
function counted(stream, onBytes) {
  let n = 0;
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, ctl) {
        n += chunk.byteLength;
        onBytes(n);
        ctl.enqueue(chunk);
      },
    })
  );
}

// ---------------------------------------------------------------- helpers
const at = (line, name) => {
  const k = ` ${name}="`;
  const i = line.indexOf(k);
  if (i < 0) return null;
  const s = i + k.length;
  return line.slice(s, line.indexOf('"', s));
};
const num = (line, name) => {
  const v = at(line, name);
  return v == null ? NaN : parseFloat(v);
};
// "2026-09-20 23:41:07 -0400" → epoch ms
export function tms(s) {
  if (!s) return NaN;
  const sign = s[20] === '-' ? -1 : 1;
  const off = sign * (Number(s.slice(21, 23)) * 60 + Number(s.slice(23, 25)));
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19)) - off * 60000;
}
const dayMs = 86400000;
const isoPlus = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * dayMs).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / dayMs);
// Minutes after midnight of `day` for a local timestamp string (negative = the evening before).
const minsFrom = (day, s) => daysBetween(day, s.slice(0, 10)) * 1440 + Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

const Q = 'HKQuantityTypeIdentifier';
const C = 'HKCategoryTypeIdentifier';
// Summed per day, deduplicated across devices hour by hour (the Watch and iPhone both count steps).
const HOURLY = { [`${Q}StepCount`]: 'st', [`${Q}DistanceWalkingRunning`]: 'di', [`${Q}FlightsClimbed`]: 'fl', [`${Q}ActiveEnergyBurned`]: 'ae', [`${Q}BasalEnergyBurned`]: 'ab', [`${Q}DistanceCycling`]: 'cy', [`${Q}DistanceSwimming`]: 'sw', [`${Q}TimeInDaylight`]: 'dl', [`${Q}AppleExerciseTime`]: 'ex' };
// Averaged per day.
const AVG = {
  [`${Q}RestingHeartRate`]: 'rhr',
  [`${Q}HeartRateVariabilitySDNN`]: 'hrv',
  [`${Q}WalkingHeartRateAverage`]: 'whr',
  [`${Q}RespiratoryRate`]: 'rr',
  [`${Q}OxygenSaturation`]: 'o2',
  [`${Q}WalkingSpeed`]: 'ws',
  [`${Q}WalkingStepLength`]: 'wl',
  [`${Q}WalkingDoubleSupportPercentage`]: 'wd',
  [`${Q}WalkingAsymmetryPercentage`]: 'wa',
  [`${Q}StairAscentSpeed`]: 'su',
  [`${Q}StairDescentSpeed`]: 'sd',
  [`${Q}BloodPressureSystolic`]: 'bps',
  [`${Q}BloodPressureDiastolic`]: 'bpd',
  [`${Q}BloodGlucose`]: 'bg',
  [`${Q}BodyTemperature`]: 'bt',
};
// Loudness is averaged by sound energy over time, the way the Health app does it.
const SOUND = { [`${Q}HeadphoneAudioExposure`]: 'hp', [`${Q}EnvironmentalAudioExposure`]: 'en' };
// Counted per day.
const EVENTS = {
  [`${C}HighHeartRateEvent`]: 'hre',
  [`${C}LowHeartRateEvent`]: 'lre',
  [`${C}IrregularHeartRhythmEvent`]: 'ire',
  [`${C}AudioExposureEvent`]: 'lde',
  [`${C}EnvironmentalAudioExposureEvent`]: 'lde',
  [`${C}HeadphoneAudioExposureEvent`]: 'hpe',
  [`${C}HandwashingEvent`]: 'hw',
};
// Kept as a list of readings.
const READINGS = {
  [`${Q}VO2Max`]: 'vo2',
  [`${Q}BodyMass`]: 'lb',
  [`${Q}BodyFatPercentage`]: 'fat',
  [`${Q}LeanBodyMass`]: 'lean',
  [`${Q}BodyMassIndex`]: 'bmi',
  [`${Q}WaistCircumference`]: 'waist',
  [`${Q}AppleWalkingSteadiness`]: 'steady',
  [`${Q}SixMinuteWalkTestDistance`]: 'walk6',
  [`${Q}HeartRateRecoveryOneMinute`]: 'hrr',
  [`${Q}Height`]: 'height',
};
const WORKOUT_NAMES = {
  Walking: 'walk',
  Running: 'run',
  Cycling: 'bike',
  Swimming: 'swim',
  TraditionalStrengthTraining: 'weights',
  FunctionalStrengthTraining: 'weights',
  HighIntensityIntervalTraining: 'hiit',
  CrossTraining: 'hiit',
  Tennis: 'tennis',
  Hiking: 'hike',
  Elliptical: 'elliptical',
  Rowing: 'row',
  Yoga: 'yoga',
  Golf: 'golf',
  Basketball: 'basketball',
  Soccer: 'soccer',
  StairClimbing: 'stairs',
  Dance: 'dance',
  Pickleball: 'pickleball',
  CoreTraining: 'core',
  Cooldown: 'cooldown',
};
export const workoutLabel = (raw) =>
  String(raw || '')
    .replace(/^HKWorkoutActivityType/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

// Toward lb, mi, in, °F-free units the dashboard already uses.
function toLb(v, unit) {
  if (unit === 'kg') return v / 0.45359237;
  if (unit === 'g') return v / 453.59237;
  return v;
}
function toMi(v, unit) {
  if (unit === 'km') return v * 0.621371;
  if (unit === 'm') return v / 1609.344;
  if (unit === 'yd') return v / 1760;
  if (unit === 'ft') return v / 5280;
  return v;
}
function toIn(v, unit) {
  if (unit === 'ft') return v * 12;
  if (unit === 'cm') return v / 2.54;
  if (unit === 'm') return v / 0.0254;
  return v;
}

// Merge overlapping [start, end] intervals and return the total minutes.
function unionMinutes(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = s[0];
  for (let i = 1; i < s.length; i++) {
    const [a, b] = s[i];
    if (a <= ce) ce = Math.max(ce, b);
    else {
      total += ce - cs;
      cs = a;
      ce = b;
    }
  }
  total += ce - cs;
  return total / 60000;
}

// ---------------------------------------------------------------- the XML pass
function makeState() {
  return {
    exportDate: null,
    me: {},
    hourly: {}, // key → { 'YYYY-MM-DD HH': { source: sum } }
    avg: {}, // key → { day: [sum, n, min] }
    sound: {}, // key → { day: [energy·sec, sec] }
    hr: {}, // day → [min, max, sum, n]
    hrT: new Float64Array(1 << 16),
    hrV: new Float32Array(1 << 16),
    hrN: 0,
    events: {}, // key → { day: n }
    mindful: {},
    readings: {}, // key → [[day, value, time]]
    sleep: {}, // night → { source: [[start, end, value, startStr, endStr]] }
    sleepGoal: null,
    rings: {}, // day → {...}
    workouts: [],
    audiogram: null,
    types: {},
  };
}

function pushHr(st, t, v) {
  if (st.hrN === st.hrT.length) {
    const t2 = new Float64Array(st.hrT.length * 2);
    t2.set(st.hrT);
    st.hrT = t2;
    const v2 = new Float32Array(st.hrV.length * 2);
    v2.set(st.hrV);
    st.hrV = v2;
  }
  st.hrT[st.hrN] = t;
  st.hrV[st.hrN] = v;
  st.hrN++;
}

function onRecord(st, line) {
  const type = at(line, 'type');
  if (!type) return;
  st.types[type] = (st.types[type] || 0) + 1;
  const sd = at(line, 'startDate');
  if (!sd || sd < '2000') return;
  const day = sd.slice(0, 10);
  const key = HOURLY[type];
  if (key) {
    let v = num(line, 'value');
    if (!(v >= 0)) return;
    const unit = at(line, 'unit');
    if (key === 'di' || key === 'cy') v = toMi(v, unit);
    if (key === 'sw') v = unit === 'm' ? v * 1.09361 : unit === 'mi' ? v * 1760 : v; // yards
    if ((key === 'ae' || key === 'ab') && unit === 'kJ') v /= 4.184;
    if (key === 'dl' || key === 'ex') v = unit === 's' ? v / 60 : unit === 'hr' ? v * 60 : v;
    const src = at(line, 'sourceName') || '?';
    const byHour = (st.hourly[key] = st.hourly[key] || {});
    const hk = sd.slice(0, 13);
    const cell = (byHour[hk] = byHour[hk] || {});
    cell[src] = (cell[src] || 0) + v;
    return;
  }
  if (type === `${Q}HeartRate`) {
    const v = num(line, 'value');
    if (!(v > 20 && v < 250)) return;
    const d = (st.hr[day] = st.hr[day] || [v, v, 0, 0]);
    if (v < d[0]) d[0] = v;
    if (v > d[1]) d[1] = v;
    d[2] += v;
    d[3]++;
    pushHr(st, tms(sd) / 1000, v);
    return;
  }
  const ak = AVG[type];
  if (ak) {
    let v = num(line, 'value');
    if (!Number.isFinite(v)) return;
    const unit = at(line, 'unit');
    if (ak === 'o2' || ak === 'wd' || ak === 'wa') v = v <= 1 ? v * 100 : v;
    if (ak === 'ws' && unit === 'km/hr') v *= 0.621371;
    if (ak === 'ws' && unit === 'm/s') v *= 2.23694;
    if (ak === 'wl') v = toIn(v, unit);
    if ((ak === 'su' || ak === 'sd') && unit === 'm/s') v *= 3.28084;
    if (ak === 'bt' && unit === 'degC') v = (v * 9) / 5 + 32;
    const m = (st.avg[ak] = st.avg[ak] || {});
    const d = (m[day] = m[day] || [0, 0, v]);
    d[0] += v;
    d[1]++;
    if (v < d[2]) d[2] = v;
    return;
  }
  const sk = SOUND[type];
  if (sk) {
    const v = num(line, 'value');
    const secs = (tms(at(line, 'endDate')) - tms(sd)) / 1000;
    if (!Number.isFinite(v) || !(secs > 0)) return;
    const m = (st.sound[sk] = st.sound[sk] || {});
    const d = (m[day] = m[day] || [0, 0]);
    d[0] += secs * 10 ** (v / 10);
    d[1] += secs;
    return;
  }
  const ek = EVENTS[type];
  if (ek) {
    const m = (st.events[ek] = st.events[ek] || {});
    m[day] = (m[day] || 0) + 1;
    return;
  }
  const rk = READINGS[type];
  if (rk) {
    let v = num(line, 'value');
    if (!Number.isFinite(v)) return;
    const unit = at(line, 'unit');
    if (rk === 'lb' || rk === 'lean') v = toLb(v, unit);
    if (rk === 'fat' || rk === 'steady') v = v <= 1 ? v * 100 : v;
    if (rk === 'height' || rk === 'waist') v = toIn(v, unit);
    if (rk === 'walk6') v = unit === 'm' ? v : unit === 'ft' ? v * 0.3048 : unit === 'yd' ? v * 0.9144 : v;
    (st.readings[rk] = st.readings[rk] || []).push([day, v, sd.slice(11, 16)]);
    return;
  }
  if (type === `${C}SleepAnalysis`) {
    const val = (at(line, 'value') || '').replace('HKCategoryValueSleepAnalysis', '');
    const ed = at(line, 'endDate');
    const a = tms(sd);
    const b = tms(ed);
    if (!(b > a)) return;
    // A night runs 6 pm to 6 pm and is named for the morning you wake up.
    const night = Number(sd.slice(11, 13)) >= 18 ? isoPlus(day, 1) : day;
    const src = at(line, 'sourceName') || '?';
    const n = (st.sleep[night] = st.sleep[night] || {});
    (n[src] = n[src] || []).push([a, b, val, sd, ed]);
    return;
  }
  if (type === `${C}MindfulSession`) {
    const mins = (tms(at(line, 'endDate')) - tms(sd)) / 60000;
    if (mins > 0) st.mindful[day] = (st.mindful[day] || 0) + mins;
    return;
  }
  if (type === 'HKDataTypeSleepDurationGoal') {
    const v = num(line, 'value');
    if (v > 0) st.sleepGoal = { hours: at(line, 'unit') === 'min' ? v / 60 : v, date: day };
  }
}

function onActivitySummary(st, line) {
  const day = at(line, 'dateComponents');
  if (!day || day < '2000') return;
  const ae = num(line, 'activeEnergyBurned');
  const ex = num(line, 'appleExerciseTime');
  const sh = num(line, 'appleStandHours');
  const mg = num(line, 'activeEnergyBurnedGoal');
  const mt = num(line, 'appleMoveTime');
  const mtg = num(line, 'appleMoveTimeGoal');
  if (!(ae > 0 || ex > 0 || sh > 0 || mt > 0)) return; // Watch not worn
  st.rings[day] = {
    ae: r0(ae || 0),
    mg: mtg > 0 ? null : r0(mg || 0),
    mt: mtg > 0 ? r0(mt || 0) : undefined,
    mtg: mtg > 0 ? r0(mtg) : undefined,
    ex: r0(ex || 0),
    eg: r0(num(line, 'appleExerciseTimeGoal') || 30),
    sh: r0(sh || 0),
    sg: r0(num(line, 'appleStandHoursGoal') || 12),
  };
}

function startWorkout(line) {
  const raw = at(line, 'workoutActivityType') || '';
  const name = raw.replace('HKWorkoutActivityType', '');
  const sd = at(line, 'startDate');
  const ed = at(line, 'endDate');
  let min = num(line, 'duration');
  const du = at(line, 'durationUnit');
  if (du === 's') min /= 60;
  if (du === 'hr') min *= 60;
  const w = {
    raw,
    type: WORKOUT_NAMES[name] || 'other',
    label: workoutLabel(raw),
    d: sd.slice(0, 10),
    t: sd.slice(11, 16),
    start: tms(sd),
    end: tms(ed),
    min: Number.isFinite(min) ? min : (tms(ed) - tms(sd)) / 60000,
    src: at(line, 'sourceName') || '',
  };
  const te = num(line, 'totalEnergyBurned');
  if (te > 0) w.kcal = at(line, 'totalEnergyBurnedUnit') === 'kJ' ? te / 4.184 : te;
  const td = num(line, 'totalDistance');
  if (td > 0) w.dist = [td, at(line, 'totalDistanceUnit')];
  return w;
}
function workoutChild(w, line, inActivity) {
  const s = line.trimStart();
  if (s.startsWith('<WorkoutStatistics ')) {
    if (inActivity && w.statsSeen) return;
    const type = at(s, 'type');
    const unit = at(s, 'unit');
    if (type === `${Q}ActiveEnergyBurned`) {
      const v = num(s, 'sum');
      if (v > 0) w.kcal = unit === 'kJ' ? v / 4.184 : v;
    } else if (/Distance(WalkingRunning|Cycling|Swimming|Wheelchair|DownhillSnowSports)$/.test(type || '')) {
      const v = num(s, 'sum');
      if (v > 0) w.dist = [v, unit];
    } else if (type === `${Q}HeartRate`) {
      const a = num(s, 'average');
      if (a > 0) w.hr = a;
      const mx = num(s, 'maximum');
      if (mx > 0) w.hrMax = mx;
    }
  } else if (s.startsWith('<MetadataEntry ')) {
    const k = at(s, 'key');
    const v = at(s, 'value');
    if (k === 'HKIndoorWorkout') w.indoor = v === '1';
    if (k === 'HKElevationAscended') {
      const m = /([\d.]+)\s*(cm|m|ft)/.exec(v || '');
      if (m) w.elevFt = m[2] === 'cm' ? Number(m[1]) / 30.48 : m[2] === 'm' ? Number(m[1]) * 3.28084 : Number(m[1]);
    }
    if (k === 'HKWeatherTemperature') {
      const m = /([\d.-]+)\s*deg(F|C)/.exec(v || '');
      if (m) w.tempF = m[2] === 'C' ? (Number(m[1]) * 9) / 5 + 32 : Number(m[1]);
    }
  } else if (s.startsWith('<FileReference ')) {
    const p = at(s, 'path') || '';
    const m = /route_[^/]+\.gpx$/.exec(p);
    if (m) w.route = m[0].replace(/\.gpx$/, '');
  }
}

export async function parseXmlStream(stream, onLine) {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let start = 0;
    let i;
    while ((i = buf.indexOf('\n', start)) >= 0) {
      onLine(buf.slice(start, i));
      start = i + 1;
    }
    buf = buf.slice(start);
  }
  if (buf) onLine(buf);
}

function lineHandler(st) {
  let workout = null;
  let inActivity = false;
  let audiogram = null;
  return (raw) => {
    const line = raw.trimStart();
    if (line.charCodeAt(0) !== 60) return; // '<'
    const c1 = line.charCodeAt(1);
    if (workout) {
      if (line.startsWith('</Workout>')) {
        st.workouts.push(workout);
        workout = null;
        return;
      }
      if (line.startsWith('<WorkoutActivity ')) {
        inActivity = true;
        return;
      }
      if (line.startsWith('</WorkoutActivity>')) {
        inActivity = false;
        workout.statsSeen = true;
        return;
      }
      workoutChild(workout, line, inActivity);
      return; // Records inside a workout are repeats of top-level ones
    }
    if (audiogram) {
      if (line.startsWith('<SensitivityPoint ')) {
        audiogram.points.push([num(line, 'frequencyValue'), r1(num(line, 'leftEarValue')), r1(num(line, 'rightEarValue'))]);
      } else if (line.startsWith('</Audiogram>')) {
        st.audiogram = audiogram;
        audiogram = null;
      }
      return;
    }
    if (c1 === 82 && line.startsWith('<Record ')) return onRecord(st, line); // 'R'
    if (c1 === 87 && line.startsWith('<Workout ')) {
      workout = startWorkout(line);
      inActivity = false;
      if (line.endsWith('/>')) {
        st.workouts.push(workout);
        workout = null;
      }
      return;
    }
    if (c1 === 65 && line.startsWith('<ActivitySummary ')) return onActivitySummary(st, line);
    if (c1 === 65 && line.startsWith('<Audiogram ')) {
      const sd = at(line, 'startDate') || '';
      audiogram = { date: sd.slice(0, 10), points: [] };
      if (line.endsWith('/>')) audiogram = null;
      return;
    }
    if (line.startsWith('<Me ')) {
      st.me = {
        dob: at(line, 'HKCharacteristicTypeIdentifierDateOfBirth') || '',
        sex: (at(line, 'HKCharacteristicTypeIdentifierBiologicalSex') || '').replace('HKBiologicalSex', '').toLowerCase(),
      };
      return;
    }
    if (line.startsWith('<ExportDate ')) st.exportDate = at(line, 'value');
  };
}

// ---------------------------------------------------------------- boil it down
function sumHourly(byHour) {
  const out = {};
  for (const hk in byHour) {
    const cell = byHour[hk];
    let best = 0;
    for (const s in cell) if (cell[s] > best) best = cell[s];
    const day = hk.slice(0, 10);
    out[day] = (out[day] || 0) + best;
  }
  return out;
}

function sleepNight(night, bySource) {
  // Prefer the source that tracks sleep stages (the Watch), then whichever recorded the most sleep.
  let best = null;
  for (const src in bySource) {
    const list = bySource[src];
    const asleep = list.filter((x) => x[2].startsWith('Asleep'));
    const staged = asleep.some((x) => x[2] === 'AsleepCore' || x[2] === 'AsleepDeep' || x[2] === 'AsleepREM');
    const mins = unionMinutes(asleep.map((x) => [x[0], x[1]]));
    const inBed = unionMinutes(list.filter((x) => x[2] === 'InBed').map((x) => [x[0], x[1]]));
    // Stages first, then the Watch over phone apps when both tracked stages, then the most sleep recorded.
    const score = (staged ? 2e6 : 0) + (staged && mins > 60 && /watch/i.test(src) ? 1e6 : 0) + mins * 10 + inBed / 1000;
    if (!best || score > best.score) best = { src, list, asleep, staged, mins, inBed, score };
  }
  if (!best) return null;
  const allBed = unionMinutes(Object.values(bySource).flatMap((l) => l.filter((x) => x[2] === 'InBed').map((x) => [x[0], x[1]])));
  if (best.mins < 20 && allBed < 60) return null;
  const out = { a: r0(best.mins) || undefined, src: best.src };
  if (best.staged) {
    const sum = (v) => r0(best.list.filter((x) => x[2] === v).reduce((s, x) => s + (x[1] - x[0]) / 60000, 0));
    out.c = sum('AsleepCore') + sum('AsleepUnspecified');
    out.d = sum('AsleepDeep');
    out.r = sum('AsleepREM');
  }
  const aw = best.list.filter((x) => x[2] === 'Awake').reduce((s, x) => s + (x[1] - x[0]) / 60000, 0);
  if (aw) out.w = r0(aw);
  // Time in bed: the bed/bedtime records if they cover the sleep, otherwise sleep plus time awake.
  const bed = Math.max(best.inBed || allBed || 0, (out.a || 0) + (out.w || 0));
  if (bed) out.b = r0(bed);
  const span = best.asleep.length ? best.asleep : best.list;
  const first = span.reduce((m, x) => (x[0] < m[0] ? x : m));
  const last = span.reduce((m, x) => (x[1] > m[1] ? x : m));
  out.s = minsFrom(night, first[3]);
  out.e = minsFrom(night, last[4]);
  return out;
}

function hrInWindow(st, a, b) {
  // Heart-rate samples come in time order per source; a binary search on the merged list is plenty here.
  const T = st.hrT;
  let lo = 0;
  let hi = st.hrN;
  const s = a / 1000;
  const e = b / 1000;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (T[m] < s) lo = m + 1;
    else hi = m;
  }
  let sum = 0;
  let n = 0;
  let mx = 0;
  for (let i = lo; i < st.hrN && T[i] <= e; i++) {
    sum += st.hrV[i];
    n++;
    if (st.hrV[i] > mx) mx = st.hrV[i];
  }
  return n >= 3 ? { avg: sum / n, max: mx } : null;
}

function sortHr(st) {
  const n = st.hrN;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const T = st.hrT;
  idx.sort((x, y) => T[x] - T[y]);
  const t2 = new Float64Array(n);
  const v2 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    t2[i] = T[idx[i]];
    v2[i] = st.hrV[idx[i]];
  }
  st.hrT = t2;
  st.hrV = v2;
}

function finish(st) {
  const days = {};
  const D = (d) => (days[d] = days[d] || {});
  for (const key in st.hourly) {
    const perDay = sumHourly(st.hourly[key]);
    for (const d in perDay) {
      const v = perDay[d];
      if (!(v > 0)) continue;
      D(d)[key] = key === 'di' || key === 'cy' ? r2(v) : r0(v);
    }
  }
  for (const d in st.rings) {
    const r = st.rings[d];
    const x = D(d);
    Object.assign(x, { ae: r.ae, ex: r.ex, sh: r.sh, eg: r.eg, sg: r.sg });
    if (r.mg != null) x.mg = r.mg;
    if (r.mtg) Object.assign(x, { mt: r.mt, mtg: r.mtg });
  }
  const prec = { rhr: r0, hrv: r0, whr: r0, rr: r1, o2: r1, ws: r2, wl: r1, wd: r1, wa: r1, su: r2, sd: r2, bps: r0, bpd: r0, bg: r0, bt: r1 };
  for (const key in st.avg) {
    for (const d in st.avg[key]) {
      const [s, n, mn] = st.avg[key][d];
      D(d)[key] = (prec[key] || r1)(s / n);
      if (key === 'o2') D(d).o2l = r1(mn);
    }
  }
  for (const key in st.sound) {
    for (const d in st.sound[key]) {
      const [e, secs] = st.sound[key][d];
      if (secs < 30) continue;
      D(d)[key] = r0(10 * Math.log10(e / secs));
      if (key === 'hp') D(d).hpm = r0(secs / 60);
    }
  }
  for (const d in st.hr) {
    const [mn, mx, s, n] = st.hr[d];
    Object.assign(D(d), { hl: r0(mn), hh: r0(mx), ha: r0(s / n) });
  }
  for (const key in st.events) for (const d in st.events[key]) D(d)[key] = st.events[key][d];
  for (const d in st.mindful) D(d).mm = r0(st.mindful[d]);
  for (const night in st.sleep) {
    const s = sleepNight(night, st.sleep[night]);
    if (s) D(night).sl = s;
  }

  sortHr(st);
  const workouts = st.workouts
    .filter((w) => w.min > 0.5)
    .map((w) => {
      const out = { id: `${w.d}T${w.t}-${w.type}`, d: w.d, t: w.t, type: w.type, label: w.label, min: r0(w.min) };
      if (w.kcal) out.kcal = r0(w.kcal);
      if (w.dist) out.mi = r2(toMi(w.dist[0], w.dist[1]));
      if (w.raw.endsWith('Swimming') && w.dist) out.yd = r0(w.dist[1] === 'yd' ? w.dist[0] : w.dist[1] === 'm' ? w.dist[0] * 1.09361 : toMi(w.dist[0], w.dist[1]) * 1760);
      let hr = w.hr ? { avg: w.hr, max: w.hrMax } : null;
      if (!hr) hr = hrInWindow(st, w.start, w.end);
      if (hr) {
        out.hr = r0(hr.avg);
        if (hr.max) out.hrMax = r0(hr.max);
      }
      if (w.indoor) out.indoor = true;
      if (w.elevFt) out.elev = r0(w.elevFt);
      if (w.tempF) out.tempF = r0(w.tempF);
      if (w.route) out.route = w.route;
      out.src = w.src;
      return out;
    })
    .filter((w, i, all) => all.findIndex((x) => x.id === w.id) === i) // some apps write the same workout twice
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const byDay = (list, fn = (v) => v) => {
    const m = {};
    for (const [d, v] of list || []) m[d] = fn(v); // last reading of the day wins
    return m;
  };
  const R = st.readings;
  const weights = Object.entries(byDay(R.lb, r1)).map(([date, lb]) => ({ date, lb }));
  const bodyDays = new Set([...(R.fat || []), ...(R.lean || []), ...(R.bmi || []), ...(R.waist || [])].map((x) => x[0]));
  const fat = byDay(R.fat, r1);
  const lean = byDay(R.lean, r1);
  const bmi = byDay(R.bmi, r1);
  const waist = byDay(R.waist, r1);
  const lbDay = byDay(R.lb, r1);
  const body = [...bodyDays].sort().map((date) => ({ date, lb: lbDay[date], fat: fat[date], lean: lean[date], bmi: bmi[date], waist: waist[date] }));
  const heightIn = R.height && R.height.length ? r1(R.height[R.height.length - 1][1]) : null;
  const list = (k, f = r1) =>
    Object.entries(byDay(R[k], f))
      .map(([d, v]) => [d, v])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const keys = Object.keys(days).sort();
  return {
    kind: 'apple-health',
    version: 1,
    exportDate: st.exportDate,
    first: keys[0] || null,
    last: keys[keys.length - 1] || null,
    me: { ...st.me, heightIn },
    days,
    workouts,
    weights,
    body,
    vo2: list('vo2'),
    steady: list('steady', r0),
    walk6: list('walk6', r0),
    hrr: list('hrr', r0),
    audiogram: st.audiogram,
    sleepGoal: st.sleepGoal,
    types: st.types,
  };
}

// ---------------------------------------------------------------- ECGs and routes
export function parseEcg(text, file) {
  const lines = text.split(/\r?\n/);
  const meta = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (/^-?\d/.test(l)) break;
    const m = /^([^,]+),"?(.*?)"?$/.exec(l);
    if (m) meta[m[1].trim()] = m[2].trim();
  }
  const rate = parseFloat(meta['Sample Rate']) || 512;
  const vals = [];
  for (; i < lines.length; i++) {
    const v = parseFloat(lines[i]);
    if (Number.isFinite(v)) vals.push(v);
  }
  // Keep 128 samples a second: plenty for a picture of the rhythm, a quarter of the size.
  const step = Math.max(1, Math.round(rate / 128));
  const trace = [];
  for (let j = 0; j + step <= vals.length; j += step) {
    let s = 0;
    for (let k = 0; k < step; k++) s += vals[j + k];
    trace.push(Math.round(s / step));
  }
  const when = meta['Recorded Date'] || '';
  const id = (when.slice(0, 16).replace(' ', 'T') || file).replace(/[^\dT:-]/g, '');
  // Beats per minute from the R-peaks (the tall spikes), as the Watch doesn't write it into the file.
  let bpm = null;
  if (vals.length > rate * 5) {
    const sorted = [...vals].sort((a, b) => a - b);
    const hi = sorted[Math.floor(sorted.length * 0.995)];
    const thr = hi * 0.55;
    const peaks = [];
    const gap = rate * 0.3;
    for (let j = 1; j < vals.length - 1; j++) {
      if (vals[j] > thr && vals[j] >= vals[j - 1] && vals[j] >= vals[j + 1] && (!peaks.length || j - peaks[peaks.length - 1] > gap)) peaks.push(j);
    }
    if (peaks.length > 3) {
      const iv = [];
      for (let j = 1; j < peaks.length; j++) iv.push(peaks[j] - peaks[j - 1]);
      iv.sort((a, b) => a - b);
      bpm = Math.round((60 * rate) / iv[Math.floor(iv.length / 2)]);
    }
  }
  return {
    meta: { id, date: when.slice(0, 10), time: when.slice(11, 16), result: meta.Classification || 'Unknown', symptoms: meta.Symptoms || '', bpm, device: meta.Device || '', rate: Math.round(rate / step) },
    trace,
  };
}

// Route as delta-encoded integers (1e-5 degrees), thinned to at most `max` points.
export function parseGpx(text, max = 300) {
  const pts = [];
  const re = /<trkpt\s+lon="(-?[\d.]+)"\s+lat="(-?[\d.]+)"|<trkpt\s+lat="(-?[\d.]+)"\s+lon="(-?[\d.]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    const lat = parseFloat(m[2] || m[3]);
    const lon = parseFloat(m[1] || m[4]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push([lat, lon]);
  }
  if (pts.length < 2) return null;
  const step = Math.max(1, Math.ceil(pts.length / max));
  const keep = pts.filter((_, i) => i % step === 0);
  if (keep[keep.length - 1] !== pts[pts.length - 1]) keep.push(pts[pts.length - 1]);
  const out = [];
  let pl = 0;
  let pn = 0;
  for (const [lat, lon] of keep) {
    const a = Math.round(lat * 1e5);
    const b = Math.round(lon * 1e5);
    out.push(a - pl, b - pn);
    pl = a;
    pn = b;
  }
  return out;
}
export function decodeRoute(enc) {
  const pts = [];
  let a = 0;
  let b = 0;
  for (let i = 0; i + 1 < enc.length; i += 2) {
    a += enc[i];
    b += enc[i + 1];
    pts.push([a / 1e5, b / 1e5]);
  }
  return pts;
}

// ---------------------------------------------------------------- entry point
// file: a File/Blob (export.zip or export.xml). onProgress(fraction, label).
export async function readAppleHealth(file, onProgress = () => {}) {
  const st = makeState();
  const handle = lineHandler(st);
  const isZip = /\.zip$/i.test(file.name || '') || (await file.slice(0, 2).text()) === 'PK';
  let ecgs = [];
  const routes = {};
  if (isZip) {
    const entries = await zipEntries(file);
    const xml = entries.find((e) => /(^|\/)export\.xml$/.test(e.name));
    if (!xml) throw new Error('No export.xml inside that zip. Make sure it’s the file from Health → Export All Health Data.');
    const total = xml.size || 1;
    const stream = counted(await entryStream(file, xml), (n) => onProgress(Math.min(0.95, (n / total) * 0.95), 'Reading your health records'));
    await parseXmlStream(stream, handle);
    onProgress(0.96, 'Reading ECGs and routes');
    for (const e of entries.filter((x) => /electrocardiograms\/.+\.csv$/i.test(x.name))) {
      try {
        ecgs.push(parseEcg(await entryText(file, e), e.name));
      } catch {
        /* skip a bad file */
      }
    }
    for (const e of entries.filter((x) => /workout-routes\/.+\.gpx$/i.test(x.name))) {
      try {
        const r = parseGpx(await entryText(file, e));
        if (r) routes[e.name.replace(/^.*\//, '').replace(/\.gpx$/, '')] = r;
      } catch {
        /* skip */
      }
    }
  } else {
    const total = file.size || 1;
    await parseXmlStream(counted(file.stream(), (n) => onProgress(Math.min(0.97, n / total), 'Reading your health records')), handle);
  }
  if (!st.exportDate && !Object.keys(st.types).length) throw new Error('That doesn’t look like an Apple Health export.');
  onProgress(0.98, 'Summarizing');
  const out = finish(st);
  ecgs.sort((a, b) => (a.meta.id < b.meta.id ? -1 : 1));
  out.ecg = ecgs.map((e) => e.meta);
  out.ecgTraces = Object.fromEntries(ecgs.map((e) => [e.meta.id, e.trace]));
  // Keep only routes that belong to a workout we kept.
  const used = new Set(out.workouts.map((w) => w.route).filter(Boolean));
  out.routes = Object.fromEntries(Object.entries(routes).filter(([k]) => used.has(k)));
  onProgress(1, 'Done');
  return out;
}

export { isoPlus, daysBetween };
