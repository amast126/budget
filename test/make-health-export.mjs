// Builds a small, made-up Apple Health export.zip for the tests (no real data). Dates are relative to today so the
// charts have something recent to show. Known answers the tests check:
//   steps: 5,700 a day (Watch and iPhone overlap for 13 hours; the iPhone alone adds 500 at 9 pm)
//   sleep: 7h 15m a night for the last 60 nights (core 5h 15m, deep 1h, REM 1h), bedtime 11:15 pm, up 6:30 am
//   rings: Move closed every other day, Exercise always, Stand never
//   2 workouts (a 3.1 mi run with a route 10 days ago, a walk yesterday), 1 ECG, an audiogram, 3 weigh-ins in 2020
import zlib from 'node:zlib';
import fs from 'node:fs';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (day, h, m = 0, s = 0) => {
  // day: a Date at local midnight; h may be negative (evening before) or ≥ 24
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, s);
  return `${isoOf(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} -0400`;
};
const W = 'Test’s Apple Watch';
const P = 'Test’s iPhone';

function xml() {
  const out = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayN = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  const rec = (type, src, unit, start, end, value) => out.push(` <Record type="${type}" sourceName="${src}" sourceVersion="1"${unit ? ` unit="${unit}"` : ''} creationDate="${end}" startDate="${start}" endDate="${end}" value="${value}"/>`);
  const Q = 'HKQuantityTypeIdentifier';
  const C = 'HKCategoryTypeIdentifier';
  out.push('<?xml version="1.0" encoding="UTF-8"?>', '<!DOCTYPE HealthData [', ']>', '<HealthData locale="en_US">', ` <ExportDate value="${at(today, 12)}"/>`);
  out.push(' <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-01-15" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale" HKCharacteristicTypeIdentifierBloodType="HKBloodTypeNotSet"/>');
  rec(`${Q}Height`, 'Scale', 'ft', '2020-06-19 16:34:12 -0400', '2020-06-19 16:34:12 -0400', '5.91667');
  [['2020-06-19', 181.2, 0.195], ['2020-07-20', 179.4, null], ['2020-08-21', 177.8, 0.182]].forEach(([d, lb, fat]) => {
    rec(`${Q}BodyMass`, 'Scale', 'lb', `${d} 08:00:00 -0400`, `${d} 08:00:00 -0400`, lb);
    if (fat) rec(`${Q}BodyFatPercentage`, 'Scale', '%', `${d} 08:00:00 -0400`, `${d} 08:00:00 -0400`, fat);
  });
  for (let n = 400; n >= 1; n--) {
    const d = dayN(n);
    for (let h = 8; h <= 20; h++) {
      rec(`${Q}StepCount`, W, 'count', at(d, h, 5), at(d, h, 15), 400);
      rec(`${Q}StepCount`, P, 'count', at(d, h, 6), at(d, h, 16), 380);
    }
    rec(`${Q}StepCount`, P, 'count', at(d, 21, 0), at(d, 21, 10), 500);
    rec(`${Q}DistanceWalkingRunning`, P, 'mi', at(d, 12, 0), at(d, 12, 30), 2.5);
    rec(`${Q}FlightsClimbed`, P, 'count', at(d, 9, 0), at(d, 9, 1), 4);
    rec(`${Q}ActiveEnergyBurned`, W, 'Cal', at(d, 12, 0), at(d, 12, 1), n % 2 ? 450 : 520);
    rec(`${Q}BasalEnergyBurned`, W, 'Cal', at(d, 12, 0), at(d, 12, 1), 1750);
    rec(`${Q}RestingHeartRate`, W, 'count/min', at(d, 12), at(d, 14), 58 + (n % 5));
    rec(`${Q}HeartRateVariabilitySDNN`, W, 'ms', at(d, 3), at(d, 3, 1), 45 + (n % 7));
    rec(`${Q}WalkingHeartRateAverage`, W, 'count/min', at(d, 10), at(d, 18), 98);
    [62, 75, 110].forEach((v, i) => rec(`${Q}HeartRate`, W, 'count/min', at(d, 9 + i * 4), at(d, 9 + i * 4), v));
    rec(`${Q}WalkingSpeed`, P, 'mi/hr', at(d, 13), at(d, 13, 1), 3.1);
    rec(`${Q}WalkingStepLength`, P, 'in', at(d, 13), at(d, 13, 1), 28);
    rec(`${Q}WalkingDoubleSupportPercentage`, P, '%', at(d, 13), at(d, 13, 1), 0.27);
    rec(`${Q}WalkingAsymmetryPercentage`, P, '%', at(d, 13), at(d, 13, 1), 0.02);
    rec(`${Q}HeadphoneAudioExposure`, P, 'dBASPL', at(d, 17), at(d, 17, 30), 72);
    rec(`${Q}EnvironmentalAudioExposure`, W, 'dBASPL', at(d, 15), at(d, 16), 60);
    rec(`${Q}TimeInDaylight`, W, 'min', at(d, 12), at(d, 12, 40), 40);
    if (n <= 60) {
      // the night ending on the morning of day n-1 (so the latest night is last night)
      const m = dayN(n - 1);
      rec(`${C}SleepAnalysis`, P, '', at(m, -1, 0), at(m, 7, 0), 'HKCategoryValueSleepAnalysisInBed');
      const st = (a, b, v) => rec(`${C}SleepAnalysis`, W, '', at(m, a[0], a[1]), at(m, b[0], b[1]), `HKCategoryValueSleepAnalysis${v}`);
      st([-1, 15], [1, 0], 'AsleepCore');
      st([1, 0], [2, 0], 'AsleepDeep');
      st([2, 0], [3, 0], 'AsleepREM');
      st([3, 0], [6, 30], 'AsleepCore');
      st([6, 30], [6, 40], 'Awake');
      rec(`${Q}OxygenSaturation`, W, '%', at(m, 3), at(m, 3), 0.96);
      rec(`${Q}RespiratoryRate`, W, 'count/min', at(m, 4), at(m, 4), 14.5);
    }
  }
  [[300, 41.2], [200, 42], [100, 43.1], [20, 42.5]].forEach(([n, v]) => rec(`${Q}VO2Max`, W, 'mL/min·kg', at(dayN(n), 18), at(dayN(n), 18), v));
  rec(`${C}HighHeartRateEvent`, W, '', at(dayN(30), 14), at(dayN(30), 14, 10), 'HKCategoryValueNotApplicable');
  out.push(` <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="${W}" sourceVersion="1" creationDate="${at(dayN(10), 18, 30)}" startDate="${at(dayN(10), 18, 0)}" endDate="${at(dayN(10), 18, 30)}">`);
  out.push('  <MetadataEntry key="HKIndoorWorkout" value="0"/>', '  <MetadataEntry key="HKWeatherTemperature" value="64 degF"/>');
  out.push(`  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="${at(dayN(10), 18, 0)}" endDate="${at(dayN(10), 18, 30)}" sum="320" unit="Cal"/>`);
  out.push(`  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="${at(dayN(10), 18, 0)}" endDate="${at(dayN(10), 18, 30)}" sum="3.1" unit="mi"/>`);
  out.push(`  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="${at(dayN(10), 18, 0)}" endDate="${at(dayN(10), 18, 30)}" average="151" minimum="98" maximum="172" unit="count/min"/>`);
  out.push(`  <WorkoutRoute sourceName="${W}" sourceVersion="1" creationDate="${at(dayN(10), 18, 30)}" startDate="${at(dayN(10), 18, 0)}" endDate="${at(dayN(10), 18, 30)}">`, '   <FileReference path="/workout-routes/route_test_run.gpx"/>', '  </WorkoutRoute>');
  out.push(`  <Record type="${Q}HeartRate" sourceName="${W}" unit="count/min" startDate="${at(dayN(10), 18, 5)}" endDate="${at(dayN(10), 18, 5)}" value="150"/>`); // repeat of a top-level record: must be ignored
  out.push(' </Workout>');
  out.push(` <Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="20" durationUnit="min" totalDistance="0.9" totalDistanceUnit="mi" totalEnergyBurned="80" totalEnergyBurnedUnit="Cal" sourceName="${W}" sourceVersion="1" creationDate="${at(dayN(1), 7, 20)}" startDate="${at(dayN(1), 7, 0)}" endDate="${at(dayN(1), 7, 20)}">`, ' </Workout>');
  for (let n = 400; n >= 1; n--) {
    const d = isoOf(dayN(n));
    out.push(` <ActivitySummary dateComponents="${d}" activeEnergyBurned="${n % 2 ? 450 : 520}" activeEnergyBurnedGoal="500" activeEnergyBurnedUnit="Cal" appleMoveTime="0" appleMoveTimeGoal="0" appleExerciseTime="35" appleExerciseTimeGoal="30" appleStandHours="11" appleStandHoursGoal="12"/>`);
  }
  out.push(` <Audiogram type="HKDataTypeIdentifierAudiogram" sourceName="Settings" sourceVersion="1" creationDate="${at(dayN(50), 20)}" startDate="${at(dayN(50), 20)}" endDate="${at(dayN(50), 20, 10)}">`);
  [[250, 5, 8], [500, 10, 6], [1000, 5, 0], [2000, 10, 5], [4000, 15, 10], [8000, 20, 15]].forEach(([f, l, r]) => out.push(`  <SensitivityPoint frequencyValue="${f}" frequencyUnit="Hz" leftEarValue="${l}" leftEarUnit="dBHL" rightEarValue="${r}" rightEarUnit="dBHL"/>`));
  out.push(' </Audiogram>', '</HealthData>');
  return { text: out.join('\n'), ecgDate: at(dayN(40), 9, 30), today };
}

function ecg(when) {
  const lines = ['Name,Test Person', 'Date of Birth,"Jan 15, 1990"', `Recorded Date,${when}`, 'Classification,Sinus Rhythm', 'Symptoms,', 'Software Version,1.90', 'Device,"Watch6,7"', 'Sample Rate,512 hertz', '', '', 'Lead,Lead I', 'Unit,µV', '', ''];
  for (let i = 0; i < 512 * 30; i++) {
    const t = (i % 512) / 512; // one beat a second = 60 bpm
    const v = t > 0.2 && t < 0.24 ? 1200 * Math.sin(((t - 0.2) / 0.04) * Math.PI) : 60 * Math.sin(t * 2 * Math.PI);
    lines.push(v.toFixed(3));
  }
  return lines.join('\n');
}
function gpx() {
  const pts = [];
  for (let i = 0; i <= 600; i++) {
    const a = (i / 600) * 2 * Math.PI;
    pts.push(`<trkpt lon="${(-75.17 + 0.01 * Math.cos(a)).toFixed(6)}" lat="${(39.95 + 0.006 * Math.sin(a)).toFixed(6)}"><ele>30</ele><time>2026-01-01T00:00:00Z</time></trkpt>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Apple Health Export"><trk><name>Route</name><trkseg>\n${pts.join('\n')}\n</trkseg></trk></gpx>`;
}

// Minimal zip writer (deflate), enough for the importer's reader.
function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content);
    const comp = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const nameBuf = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export function makeHealthExport(file) {
  const { text, ecgDate } = xml();
  fs.writeFileSync(
    file,
    zip([
      ['apple_health_export/export.xml', text],
      [`apple_health_export/electrocardiograms/ecg_test.csv`, ecg(ecgDate)],
      ['apple_health_export/workout-routes/route_test_run.gpx', gpx()],
    ])
  );
  return file;
}
