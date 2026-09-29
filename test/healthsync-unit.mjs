// The Health Sync Shortcut's text link (version 2), with made-up numbers only.
import * as S from '../src/health-sync.js';
import * as M from '../src/health-more.js';
import * as HK from '../src/hk-logic.js';

const pad = (n) => String(n).padStart(2, '0');
const addDays = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 864e5).toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// minutes after midnight of `iso` (may run past midnight) → [day, h, m, s]
const at = (iso, min, s = 0) => [addDays(iso, Math.floor(min / 1440)), Math.floor((((min % 1440) + 1440) % 1440) / 60), (((min % 1440) + 1440) % 1440) % 60, s];
const fmtIso = ([day, h, m, s]) => `${day}T${pad(h)}:${pad(m)}:${pad(s)}-04:00`;
const fmtMed = ([day, h, m]) => {
  const [y, mo, d] = day.split('-').map(Number);
  return `${MON[mo - 1]} ${d}, ${y} at ${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};
const NIGHT = [['Core', 25], ['Deep', 40], ['Core', 30], ['REM', 20], ['Awake', 3], ['Core', 35], ['Deep', 25], ['Core', 30], ['REM', 30], ['Awake', 2], ['Core', 40], ['REM', 35], ['Core', 30], ['Awake', 4], ['Core', 45], ['REM', 30], ['Core', 20]];

// What the Shortcut's Text would hold for three days ending `today` at `now` (minutes after midnight).
// A made-up person: background heart rate every 6 minutes, tennis yesterday evening, weights two mornings ago.
// rolling: the window counts back from `now` (the first day starts at 7 am), as "last 3 days" may.
export function makeSyncText({ today, now = 7 * 60 + 2, fmt = 'iso', extras = true, rolling = false, sources = true, end = true } = {}) {
  let seed = 11;
  const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const F = fmt === 'iso' ? fmtIso : fmtMed;
  const d2 = addDays(today, -2);
  const d1 = addDays(today, -1);
  const days = [d2, d1, today];
  const out = [];
  const sec = (name, ...lists) => {
    out.push(`#${name}`);
    for (const l of lists) out.push(...l);
  };
  const midnight = days.map((d) => F(at(d, 0)));
  sec('today', [F(at(today, now, 11))]);
  sec('steps', ['9,412', '11,230', '1,504'], midnight);
  sec('active', ['512.4 kcal', '688.1 kcal', '41 kcal'], midnight);
  sec('exercise', ['34 min', '61 min', '0 min'], midnight);
  // heart rate
  const hv = [];
  const ht = [];
  for (let m = rolling ? now : 0; m <= 2 * 1440 + now; m += 6) {
    const mod = m % 1440;
    const asleep = mod < 7 * 60 || mod >= 23 * 60 + 10;
    hv.push(`${asleep ? 50 + Math.round(R() * 8) : 66 + Math.round(R() * 24)}`);
    ht.push(F(at(d2, m, 30)));
  }
  const workout = (day, start, mins, base, amp) => {
    for (let s = 0; s < mins * 60; s += 5) {
      hv.push(`${base + Math.round(amp * Math.sin(s / 600) ** 2 + R() * 8)} count/min`);
      ht.push(F(at(day, start + Math.floor(s / 60), s % 60)));
    }
  };
  workout(d1, 18 * 60, 92, 120, 40);
  workout(d2, 7 * 60 + 10, 45, 98, 20);
  sec('rhr', ['56', '55', '57'], days.map((d) => F(at(d, 6 * 60 + 30))));
  sec('hrv', ['41 ms', '47 ms', '44 ms', '52 ms', '38 ms', '45 ms'], [F(at(d2, 3 * 60)), F(at(d2, 14 * 60)), F(at(d2, 22 * 60)), F(at(d1, 3 * 60)), F(at(d1, 15 * 60)), F(at(today, 4 * 60))]);
  // sleep: the tail of one night (the window starts at midnight), then two whole nights
  const sv = [];
  const ss = [];
  const se = [];
  const sw = [];
  const expect = {};
  const night = (day, start, end, stages) => {
    const wake = addDays(day, start >= 18 * 60 ? 1 : 0);
    const e = (expect[wake] = { a: 0, d: 0, r: 0, c: 0, w: 0 });
    sv.push('In Bed');
    ss.push(F(at(day, day === d2 && start < 18 * 60 ? Math.max(start - 10, 0) : start - 10))); // nothing before the window
    se.push(F(at(day, end + 5)));
    sw.push('Jordan’s iPhone');
    let t = start;
    for (let i = 0; t < end; i = (i + 1) % stages.length) {
      const [v, mins] = stages[i];
      const len = Math.min(mins, end - t);
      sv.push(v);
      ss.push(F(at(day, t)));
      se.push(F(at(day, t + len)));
      sw.push('Jordan’s Apple Watch');
      const k = { Core: 'c', Deep: 'd', REM: 'r', Awake: 'w' }[v];
      e[k] += len;
      if (v !== 'Awake') e.a += len;
      t += len;
    }
  };
  night(d2, 0, 6 * 60 + 40, NIGHT.slice(9));
  night(d2, 23 * 60 + 5, 1440 + 6 * 60 + 50, NIGHT);
  night(d1, 23 * 60 + 20, 1440 + 6 * 60 + 45, NIGHT);
  sec('sleep', sv, ss, se, sources ? sw : []);
  sec('workouts', ['Tennis', 'Traditional Strength Training'], [F(at(d1, 18 * 60)), F(at(d2, 7 * 60 + 10))], [F(at(d1, 18 * 60 + 92)), F(at(d2, 7 * 60 + 55))]);
  sec('workout-cal', ['612 kcal', '245 kcal']);
  if (extras) {
    sec('resting', ['1,802 kcal', '1,815 kcal', '402 kcal'], midnight);
    sec('distance', ['4.12 mi', '5.6 mi', '0.71 mi'], midnight);
    sec('weight', ['181.4 lb'], [F(at(d1, 7 * 60 + 5))]);
  }
  sec('hr', hv, ht);
  if (end) out.push('#end');
  return { text: out.join('\n'), expect: { nights: expect, d2, d1 } };
}

export async function healthSyncUnit(check) {
  const TODAY = '2026-09-28';
  const { text, expect } = makeSyncText({ today: TODAY });
  const s = S.parseSyncText(text, '2026-09-30');
  const { d1, d2 } = expect;
  check(s.today === TODAY && s.now === '07:02' && !s.problems.length, `sync v2: the phone’s own date wins, nothing flagged (${s.problems.join(' | ')})`);
  check(s.days[d2].st === 9412 && s.days[d1].st === 11230 && s.days[TODAY].st === 1504 && s.days[d1].ae === 688 && s.days[d2].ex === 34 && s.days[TODAY].ex === 0 && s.days[d1].ab === 1815 && s.days[d1].di === 5.6, 'sync v2: totals for each day');
  const h1 = s.days[d1];
  check(h1.hl >= 50 && h1.hl <= 52 && h1.hh >= 150 && h1.hh <= 170 && h1.ha > 100 && h1.ha < 150 && h1.sc.hr > 1000, `sync v2: heart rate for the day: avg ${h1.ha}, ${h1.hl}–${h1.hh} from ${h1.sc && h1.sc.hr} readings`);
  check(s.days[d2].hrv === 44 && s.days[d2].sc.hrv === 3 && s.days[d1].rhr === 55, 'sync v2: HRV averaged per day, resting heart rate');
  const n1 = s.days[d1].sl;
  const n0 = s.days[TODAY].sl;
  const e0 = expect.nights[TODAY];
  check(n0 && n0.a === e0.a && n0.d === e0.d && n0.r === e0.r && n0.c === e0.c && n0.w === e0.w && n0.src === 'Shortcut' && n0.s === -40 && n0.e === 405, `sync v2: last night with its stages (${JSON.stringify(n0)} vs ${JSON.stringify(e0)})`);
  check(n1 && n1.a === expect.nights[d1].a && n1.b >= n1.a && !s.days[d2].sl, 'sync v2: each whole night; the first one, cut off where the link starts, is left to the run before');
  const tennis = s.workouts.find((w) => w.type === 'tennis');
  const lift = s.workouts.find((w) => w.type === 'weights');
  check(tennis && tennis.id === `${d1}T18:00-tennis` && tennis.min === 92 && tennis.kcal === 612 && tennis.hr >= 135 && tennis.hr <= 155 && tennis.hrMax >= 155 && Array.isArray(tennis.hb) && tennis.label === 'Tennis', `sync v2: tennis with calories and heart rate (${JSON.stringify(tennis && { ...tennis, hb: undefined })})`);
  const hbMin = tennis.hb.slice(1).reduce((a, b) => a + b, 0);
  check(Math.abs(hbMin - 92) < 2 && lift.label === 'Traditional Strength Training' && lift.kcal === 245 && lift.hr > 95 && lift.hr < 125, `sync v2: minutes in each heart-rate zone add up to the workout (${hbMin}); strength training too`);
  check(s.weights.length === 1 && s.weights[0].date === d1 && s.weights[0].lb === 181.4, 'sync v2: a weigh-in');

  // the default date format ("Sep 27, 2026 at 4:12 PM") gives the same days
  const med = S.parseSyncText(makeSyncText({ today: TODAY, fmt: 'medium' }).text, '2026-09-30');
  check(med.days[d1].st === 11230 && med.days[TODAY].sl.a === e0.a && med.days[TODAY].sl.d === e0.d && med.workouts.length === 2 && Math.abs(med.days[d1].ha - h1.ha) <= 1 && med.days[d1].hh === h1.hh, 'sync v2: dates in the default Shortcuts format work the same');

  // mistakes the page points out
  const bad = S.parseSyncText(['#today', '2026-09-28T07:00:00-04:00', '#steps', '100', '200', '2026-09-27T00:00:00-04:00', '2026-09-27T00:00:00-04:00', '#active', '500', '2026-09-27T00:00:00-04:00', '#hrv', '40', '#sleep', 'Core', '2026-09-27T01:00:00-04:00', '#stepz', '1'].join('\n'), TODAY);
  const p = bad.problems.join(' | ');
  check(/Group By to Day/.test(p) && /HRV: 1 value but 0 dates/.test(p) && /Sleep: 1 value but 1 date/.test(p) && /#stepz/.test(p) && bad.days['2026-09-27'].ae === 500 && bad.days['2026-09-27'].st == null, `sync v2: mistakes explained, the good sections still used (${p})`);
  check(/one long line/.test(S.parseSyncText('#today2026-09-28#steps8123', TODAY).problems.join()), 'sync v2: a link that skipped URL Encode is explained');
  check(S.sleepValue('Asleep (REM)') === 'AsleepREM' && S.sleepValue('3') === 'AsleepCore' && S.sleepValue('In Bed') === 'InBed' && S.sleepValue('Asleep') === 'AsleepUnspecified' && S.sleepValue('Lunch') === null, 'sync v2: sleep stages however Shortcuts names them');
  check(S.workoutKind('Outdoor Run').type === 'run' && S.workoutKind('HIIT').type === 'hiit' && S.workoutKind('48').type === 'tennis' && S.workoutKind('Kayaking').type === 'other' && S.workoutKind('Kayaking').label === 'Kayaking', 'sync v2: workout names from the Fitness app, HealthKit numbers, and ones it doesn’t know');

  // the whole link, as Shortcuts' URL Encode would make it
  const link = `#/health-sync?k=abc&v=2&d=${encodeURIComponent(text)}`;
  const ps = M.parseSync(link, TODAY);
  const ps2 = M.parseSync(`#/health-sync?k=zzz&v=2&dry=1&d=${encodeURIComponent(text)}`, TODAY);
  check(ps.v === 2 && ps.key === 'abc' && ps.count > 20 && ps.link === ps2.link && ps2.dry && /^v2:/.test(ps.link) && ps.link.length < 20, `sync v2: the link parsed, and the same text is recognized again (link ${Math.round(link.length / 1024)} KB)`);
  check(M.syncSummary(ps).join(' · ') === '3 days · 2 nights of sleep · 2 workouts · 1 weigh-in', `sync v2: summary (${M.syncSummary(ps).join(' · ')})`);
  const rows = S.syncDays(ps);
  check(rows.length === 3 && rows[0].iso === TODAY && rows[1].workouts[0].startsWith('Tennis 1h 32m · 612 cal · avg ') && /^Slept \dh \d\dm: deep/.test(rows[0].lines[2]), `sync v2: one row per day (${rows[1].bits.join(' · ')})`);

  // saving: each value keeps whichever run saw more of the day
  const plan = M.planSync(ps);
  const year = {
    days: {
      [d2]: { st: 9500, ha: 70, hl: 48, hh: 150, hrv: 50, sl: { a: 430, d: 60, src: 'Apple Watch' } }, // imported
      [d1]: { st: 5000, ae: 300, ha: 90, hl: 60, hh: 120, sc: { hr: 200 }, sy: 1, sl: { a: 200, src: 'Shortcut' } }, // an earlier sync, mid-day
      '2026-09-20': { ae: 500, mg: 600, eg: 30, sg: 12 },
    },
  };
  plan.years['2026'](year);
  const y2 = year.days[d2];
  const y1 = year.days[d1];
  const yt = year.days[TODAY];
  check(y2.st === 9500 && y2.ha === 70 && y2.hl === 48 && y2.hh === 150 && y2.hrv === 50 && y2.sl.src === 'Apple Watch' && y2.sy === 1, 'sync v2 save: an imported day keeps its numbers (bigger totals, heart rate, the Watch’s night)');
  check(y1.st === 11230 && y1.ae === 688 && y1.ha === h1.ha && y1.sc.hr === h1.sc.hr && y1.hl === Math.min(60, h1.hl) && y1.hh === h1.hh && y1.sl.a === n1.a && y1.mg === 600, 'sync v2 save: a fuller run replaces an earlier one; ring goals carried over');
  check(yt.st === 1504 && yt.sl.d === n0.d && yt.hrv === 45 && yt.pt === 1 && y1.pt == null, 'sync v2 save: today so far, marked as partial');
  {
    // charts and monthly averages leave today-so-far totals out; the import clears the mark and its counts
    const hkYears = { 2026: year };
    const pts = HK.seriesOf({}, hkYears, 'st', 30, TODAY);
    check(!pts.some((p) => p.t === TODAY) && pts.some((p) => p.t === d1) && HK.seriesOf({}, hkYears, 'rhr', 30, TODAY).some((p) => p.t === TODAY), 'sync v2: charts skip today’s partial totals (not its resting heart rate)');
    const doc = { days: { [TODAY]: { ...yt } } };
    HK.planImport({ days: { [TODAY]: { st: 9000, ha: 70 } }, workouts: [], body: [], vo2: [], steady: [], walk6: [], hrr: [], weights: [], first: TODAY, last: TODAY }).years['2026'](doc);
    const di = doc.days[TODAY];
    check(di.pt == null && di.st === 9000 && di.ha === 70 && di.sc && di.sc.hr == null && di.sc.hrv === 1 && di.hrv === 45, 'sync v2: an import clears the partial mark and the sync’s counts for what it brings');
  }
  // a later, partial look at the same day doesn't undo it
  const partial = S.parseSyncText(['#today', `${TODAY}T09:00:00-04:00`, '#steps', '6000', `${d1}T00:00:00-04:00`, '#hr', ...Array.from({ length: 5 }, () => '99'), ...Array.from({ length: 5 }, (_, i) => `${d1}T00:1${i}:00-04:00`), '#sleep', 'Core', `${d2}T23:30:00-04:00`, `${d1}T00:30:00-04:00`, '#end'].join('\n'), TODAY);
  check(partial.days[d1].st === 6000 && partial.days[d1].ha === 99 && partial.days[d1].sl.a === 60 && !partial.problems.length, `sync v2: a small overlapping run parses (${partial.problems.join(' | ')})`);
  M.planSync({ ...partial, link: 'x' }).years['2026'](year);
  check(year.days[d1].st === 11230 && year.days[d1].ha === h1.ha && year.days[d1].hh === h1.hh && year.days[d1].sl.a === n1.a, 'sync v2 save: an overlapping run with less of the day changes nothing');
  const hk = { workouts: [{ id: `${d2}T07:10-weights`, d: d2, t: '07:10', type: 'weights', min: 45, hb: [100, 5], src: 'Apple Watch' }, { id: `${d1}T18:00-tennis`, d: d1, t: '18:00', type: 'tennis', min: 50, src: 'Shortcut' }] };
  plan.main(hk);
  check(hk.workouts.length === 2 && hk.workouts.find((w) => w.type === 'weights').src === 'Apple Watch' && hk.workouts.find((w) => w.type === 'tennis').min === 92 && hk.last === TODAY && hk.syncedAt > 0, 'sync v2 save: an imported workout stays; a synced one is updated');
  const h = { weights: [{ date: d2, lb: 180 }], sync: { key: 'abc', count: 4 } };
  plan.health(h);
  plan.sync(h, 123);
  check(h.weights.length === 2 && h.weights[1].src === 'sync' && h.sync.v2At === 123 && h.sync.count === 5 && h.sync.lastLink === ps.link && h.sync.lastDate === TODAY, 'sync v2 save: weigh-in and the sync noted');
  // a link whose "last 3 days" starts at 7 am: the first day's totals and heart rate are left out
  {
    const r = S.parseSyncText(makeSyncText({ today: TODAY, rolling: true }).text, TODAY);
    check((!r.days[d2] || (r.days[d2].st == null && r.days[d2].ha == null)) && r.days[d1].st === 11230 && r.found.some((f) => f.startsWith(`Left out ${d2}`)) && r.workouts.length === 2, `sync v2: the first day of a link that starts partway through it is left out (${JSON.stringify(r.days[d2])})`);
  }
  // sleep from two sources: the Watch's stages win over another app's plain "Asleep" (with Source, or without)
  {
    const extra = (withSrc) => {
      const base = makeSyncText({ today: TODAY, sources: withSrc }).text.split('\n');
      const at = base.indexOf('#sleep');
      const end = base.indexOf('#workouts');
      const sl = base.slice(at + 1, end);
      const n = withSrc ? sl.length / 4 : sl.length / 3;
      const cols = [0, 1, 2, 3].map((c) => sl.slice(c * n, (c + 1) * n));
      cols[0].push('Asleep');
      cols[1].push(`${d1}T23:00:00-04:00`);
      cols[2].push(`${TODAY}T07:10:00-04:00`);
      if (withSrc) cols[3].push('Sleep App');
      return [...base.slice(0, at + 1), ...cols.flat(), ...base.slice(end)].join('\n');
    };
    const a = S.parseSyncText(extra(true), TODAY).days[TODAY].sl;
    const b = S.parseSyncText(extra(false), TODAY).days[TODAY].sl;
    check(a.a === e0.a && a.c === e0.c && b.a === e0.a && b.c === e0.c, `sync v2: another sleep app doesn’t inflate the night (${a.a}/${a.c}, ${b.a}/${b.c} vs ${e0.a}/${e0.c})`);
  }
  // the night the clocks go back: real minutes when the dates carry their offsets
  {
    const r = S.parseSyncText(['#today', '2026-11-01T08:00:00-05:00', '#sleep', 'Core', 'Deep', 'Core', '2026-10-31T23:00:00-04:00', '2026-11-01T01:30:00-04:00', '2026-11-01T01:10:00-05:00', '2026-11-01T01:30:00-04:00', '2026-11-01T01:10:00-05:00', '2026-11-01T06:00:00-05:00', '#end'].join('\n'), '2026-11-01');
    const sl = r.days['2026-11-01'] && r.days['2026-11-01'].sl;
    check(sl && sl.a === 480 && sl.d === 40 && sl.c === 440, `sync v2: a night across the clock change adds up (${JSON.stringify(sl)})`);
  }
  // more mistakes, each named
  {
    const t = (lines) => S.parseSyncText(['#today', `${TODAY}T08:00:00-04:00`, ...lines, '#end'].join('\n'), TODAY).problems.join(' | ');
    check(/date after today/.test(t(['#steps', '8123', '9000', `${d1}T00:00:00-04:00`, `${addDays(TODAY, 1)}T00:00:00-04:00`])), 'sync v2: totals dated tomorrow (End Date picked) are flagged, not saved');
    check(/have no times/.test(t(['#sleep', 'Core', 'Deep', `${d1}T00:00:00-04:00`, `${d1}T00:00:00-04:00`, `${d1}T00:00:00-04:00`, `${d1}T00:00:00-04:00`])), 'sync v2: dates without times are flagged');
    check(/can’t read/.test(t(['#hrv', '45', '27.09.2026 23:10'])), 'sync v2: a date format it can’t read is named as such');
    check(/end before they start/.test(t(['#sleep', 'Core', 'Deep', `${d1}T02:00:00-04:00`, `${d1}T03:00:00-04:00`, `${d1}T01:00:00-04:00`, `${d1}T02:00:00-04:00`])), 'sync v2: Start and End swapped is flagged');
    check(/pick Workout Type/.test(t(['#workouts', 'Workouts', `${d1}T18:00:00-04:00`, `${d1}T19:00:00-04:00`])), 'sync v2: the plain Type property on workouts is flagged');
    check(/no #end/.test(S.parseSyncText(makeSyncText({ today: TODAY, end: false }).text, TODAY).problems.join()), 'sync v2: a link with no #end (maybe cut short) is flagged');
    const odd = ['Sep 27, 2026 at 11:10:05 PM EDT', 'Sunday, September 27, 2026 at 11:10:05 PM Eastern Daylight Time', 'Sun, 27 Sep 2026 23:10:00 -0400'].map((x) => S.parseStamp(x, TODAY));
    check(odd.every((x) => x && x.str === '2026-09-27 23:10:00'.slice(0, 16) + x.str.slice(16)) && odd[2].abs === Date.UTC(2026, 8, 28, 3, 10), 'sync v2: long times with a zone and RFC 2822 dates');
    check(S.workoutKind('constructor').type === 'other' && S.sections('#constructor\n1').constructor.length === 1 && /constructor/.test(S.parseSyncText('#constructor\n1\n#toString\n2', TODAY).problems.join()), 'sync v2: odd names don’t hit built-in object properties');
  }
  // merging: a short staged fragment doesn't replace a long night; body measurements keep what else they had
  {
    const d = { sl: { a: 450, src: 'Shortcut' } };
    S.mergeSyncDay(d, { sl: { a: 70, d: 10, src: 'Shortcut' } });
    const hk2 = { body: [{ date: d1, lb: 180, lean: 140, bmi: 24 }] };
    S.planSyncText({ ...ps, weights: [{ date: d1, lb: 181.4, fat: 18.2 }], workouts: [] }).main(hk2);
    check(d.sl.a === 450 && hk2.body[0].lean === 140 && hk2.body[0].fat === 18.2, 'sync v2 save: a short night fragment doesn’t replace a long night; body measurements merge');
  }
  check(S.templateText().split('\n')[0] === '#today' && S.templateText().endsWith('[Heart Rate › Start Date]\n#end') && S.templateText().includes('[Sleep Analysis › Source]') && S.linkStart('https://x.test/', 'KEY') === 'https://x.test/#/health-sync?k=KEY&v=2&d=' && S.runShortcutUrl() === 'shortcuts://run-shortcut?name=Health%20Sync', 'sync v2: template, link start and the Sync now link');
  // the template, filled in the way the Shortcut fills it, parses cleanly
  const filled = S.parseSyncText(S.templateText().replace(/\[[^\]]+\]\n?/g, ''), TODAY);
  check(filled.problems.length === 1 && /#today/.test(filled.problems[0]) && filled.count === 0, `sync v2: an unfilled template has no numbers, and the only complaint is the missing date (${filled.problems.join(' | ')})`);
}
