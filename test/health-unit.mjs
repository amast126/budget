// Node checks for the Health additions (sync link, readiness, weight trend and goal, adaptive target, nutrients,
// saved meals, habits, checkups, labs, training, sleep patterns, the monthly report). Made-up data only.
import * as M from '../src/health-more.js';
import * as T from '../src/health-training.js';
import * as I from '../src/health-insights.js';
import { normalizeHealth, nutrientsFor, entryFor, targets, addEntries } from '../src/health-logic.js';
import { addDays } from '../src/budget-logic.js';
import { nutritionOf } from '../scripts/fetch-recipes.mjs';

const TODAY = '2026-09-28'; // a Monday
const hkYearsOf = (days) => {
  const out = {};
  for (const [iso, d] of Object.entries(days)) ((out[iso.slice(0, 4)] = out[iso.slice(0, 4)] || { version: 1, days: {} }).days[iso] = d);
  return out;
};
const yearsOf = (days) => {
  const out = { 2025: { version: 1, days: {} }, 2026: { version: 1, days: {} } };
  for (const [iso, d] of Object.entries(days)) out[iso.slice(0, 4)].days[iso] = { food: [], steps: null, workouts: [], ...d };
  return out;
};

export async function healthUnit(check) {
  // ---------------- the sync link
  check(M.parseDuration('7:12') === 432 && M.parseDuration('7h 12m') === 432 && M.parseDuration('7 hr 12 min') === 432 && M.parseDuration('432') === 432 && M.parseDuration('7.5') === 450, 'sync: sleep durations in any form');
  check(M.parseDuration('25920') === 432 && M.parseDuration('3600s') === 60 && M.parseDate('Sep 27, 2026 at 12:00 AM') === '2026-09-27' && M.parseDate('9/27/2026') === '2026-09-27' && M.parseDate('September 7, 2026', 'x') === '2026-09-07', 'sync: seconds and Shortcuts-style dates');
  check(M.parseClock('Sep 27, 2026 at 11:10 PM') === 1390 && M.parseSync('?sleep=25920&weight=78.2 kg', TODAY).weight.lb === 172.4, 'sync: a date-time as text and kilograms');
  check(M.parseClock('23:10') === 1390 && M.parseClock('11:10 PM') === 1390 && M.parseClock('6:55 am') === 415 && M.parseClock('12:05 AM') === 5 && M.parseClock('2026-09-27T06:40:00') === 400, 'sync: clock times');
  const s = M.parseSync('#/health-sync?k=abc&date=2026-09-27&steps=8,123&active=520.4&exercise=34&stand=11&sleep=7:12&deep=55&rem=1:20&bed=23:10&wake=6:40&hrv=45&rhr=58&o2=0.97&weight=172.4 lb&water=64&caffeine=190&junk=1&resting=abc', TODAY);
  check(s.key === 'abc' && s.date === '2026-09-27' && s.on === TODAY && s.act.st === 8123 && s.act.ae === 520 && s.act.sh === 11 && s.act.wat === 64 && s.act.caf === 190, `sync: activity for the day before (${JSON.stringify(s.act)})`);
  check(s.sl.a === 432 && s.sl.d === 55 && s.sl.r === 80 && s.sl.s === -50 && s.sl.e === 400 && s.sl.b === 450 && s.morn.hrv === 45 && s.morn.rhr === 58 && s.morn.o2 === 97, `sync: last night and this morning (${JSON.stringify(s.sl)})`);
  check(s.weight.lb === 172.4 && s.weight.date === TODAY && s.skipped.includes('resting calories'), 'sync: weight, and a bad value is skipped');
  check(M.parseSync('?steps=5000', TODAY).date === '2026-09-27', 'sync: date defaults to yesterday');
  const junk = M.parseSync('?exercise=[Exercise]&stand=None&steps=34%0A5&date=27/09/2026', TODAY);
  check(junk.count === 0 && junk.date === '2026-09-27' && junk.skipped.length === 3, `sync: placeholders and run-together values are skipped (${JSON.stringify(junk.skipped)})`);
  check(M.parseSync('?date=2026-27-09&steps=1', TODAY).date === '2026-09-27', 'sync: an impossible date falls back to yesterday');
  const st1 = M.parseSync('?sleep=432&deep=20&rem=95&awake=15', TODAY).sl;
  const st2 = M.parseSync('?sleep=25920&deep=3600&awake=900', TODAY).sl;
  const st3 = M.parseSync('?sleep=7.2&deep=1.1', TODAY).sl;
  check(st1.d === 20 && st1.r === 95 && st1.w === 15 && st2.a === 432 && st2.d === 60 && st2.w === 15 && st3.d === 66 && M.parseDuration('1h05m') === 65, 'sync: sleep stages in the same unit as the night');
  const l1 = M.parseSync('?k=abc&steps=5000&date=2026-09-27', TODAY);
  const l2 = M.parseSync('?date=2026-09-27&steps=5000&k=other&dry=1', TODAY);
  check(l1.link === l2.link && !l1.onGiven && M.parseSync('?on=2026-09-28&steps=1', TODAY).onGiven, 'sync: the same link is recognized again');
  const plan = M.planSync(s);
  const hy = { version: 1, days: { [TODAY]: { sl: { a: 440, d: 60, r: 90, c: 290, src: 'Test Watch' }, hl: 50 } } };
  plan.years['2026'](hy);
  check(hy.days['2026-09-27'].st === 8123 && hy.days['2026-09-27'].sy === 1 && hy.days[TODAY].hrv === 45 && hy.days[TODAY].hl === 50, 'sync: days merged, other fields kept');
  const hyg = { version: 1, days: { '2026-09-20': { mg: 520, eg: 30, sg: 12, ae: 400 } } };
  M.planSync(M.parseSync('?date=2026-09-27&active=610&stand=11', TODAY)).years['2026'](hyg);
  check(hyg.days['2026-09-27'].mg === 520 && hyg.days['2026-09-27'].sg === 12, 'sync: ring goals carried forward so the rings still close');
  check(hy.days[TODAY].sl.a === 432, 'sync: a night with stages replaces the imported one');
  const hy1 = { version: 1, days: { [TODAY]: { sl: { a: 440, d: 60, r: 90, c: 290, src: 'Test Watch' } } } };
  M.planSync(M.parseSync('?sleep=7:00', TODAY)).years['2026'](hy1);
  check(hy1.days[TODAY].sl.a === 440, 'sync: an imported night with stages is kept over a plain total');
  const hy2 = { version: 1, days: {} };
  M.planSync(M.parseSync('?sleep=6:30&date=2026-09-27', TODAY)).years['2026'](hy2);
  check(hy2.days[TODAY].sl.a === 390 && hy2.days[TODAY].sl.src === 'Shortcut', 'sync: a night with no import is saved');
  const h0 = normalizeHealth({ weights: [{ date: TODAY, lb: 171 }] });
  plan.health(h0);
  check(h0.weights.length === 1 && h0.weights[0].lb === 171, 'sync: a weigh-in you typed wins');
  const h1 = normalizeHealth({ weights: [{ date: '2026-09-20', lb: 173 }] });
  plan.health(h1);
  plan.sync(h1);
  check(h1.weights.length === 2 && h1.weights[1].src === 'sync' && h1.sync.count === 1, 'sync: weight added and the sync counted');
  const hkMain = {};
  plan.main(hkMain);
  check(hkMain.syncedAt && hkMain.last === TODAY, 'sync: summary marks the sync');
  check(M.newSyncKey().length === 20 && /#\/health-sync\?k=KEY&date=/.test(M.syncTemplate('https://x.test/', 'KEY')), 'sync: key and link template');

  // ---------------- readiness
  const base = {};
  for (let i = 1; i <= 30; i++) base[addDays(TODAY, -i)] = { sl: { a: 450 }, hrv: 50, rhr: 58 };
  const goodDays = { ...base, [TODAY]: { sl: { a: 480 }, hrv: 58 }, [addDays(TODAY, -1)]: { ...base[addDays(TODAY, -1)], rhr: 55 } };
  const good = M.readiness({ hkYears: hkYearsOf(goodDays) }, TODAY);
  check(good.level === 'ready' && good.score >= 75 && /above your norm/.test(good.reasons.join(' ')), `readiness: rested → Ready ${good.score} (${good.reasons.join('; ')})`);
  const badDays = { ...base, [TODAY]: { sl: { a: 320 }, hrv: 38, rhr: 64 } };
  const bad = M.readiness({ hkYears: hkYearsOf(badDays) }, TODAY);
  check(bad.level === 'easy' && /under your usual/.test(bad.reasons[0] + bad.reasons[1]) && /below your norm/.test(bad.reasons.join(' ')), `readiness: short night, low HRV → Take it easy ${bad.score} (${bad.reasons.join('; ')})`);
  check(M.readiness({ hkYears: hkYearsOf(base) }, TODAY) === null, 'readiness: nothing for today → none');
  check(M.readiness({ hkYears: hkYearsOf({ [TODAY]: { hrv: 50 } }) }, TODAY) === null, 'readiness: HRV with no history yet → none (not NaN)');
  const typical = M.readiness({ hkYears: hkYearsOf({ ...base, [TODAY]: { sl: { a: 450 }, hrv: 50, rhr: 58 } }) }, TODAY);
  check(typical.level === 'normal' && typical.score >= 55 && typical.score < 75, `readiness: a typical morning reads Normal (${typical.score})`);

  // ---------------- weight trend and goal
  const wts = [];
  for (let i = 42; i >= 0; i -= 2) wts.push({ date: addDays(TODAY, -i), lb: 190 - ((42 - i) / 7) * 1 + (i % 4 ? 0.4 : -0.4) });
  const hw = normalizeHealth({ weights: wts, goalWeight: 178, profile: { goal: 'lose' } });
  const wt = M.weightTrend(hw, TODAY);
  check(wt.rate < -0.8 && wt.rate > -1.2 && wt.trend < 186 && wt.trend > 183, `weight: rate about −1 lb/week (${wt.rate}), trend ${wt.trend}`);
  const wg = M.weightGoal(hw, TODAY);
  check(wg.eta && wg.eta > addDays(TODAY, 30) && wg.eta < addDays(TODAY, 90) && !wg.warn, `weight: reach 178 around ${wg.eta}`);
  const fast = normalizeHealth({ weights: wts.map((w, i) => ({ ...w, lb: 200 - i * 0.9 })), profile: { goal: 'lose' } });
  check(/more than 1%/.test(M.weightGoal(fast, TODAY).warn || ''), 'weight: warns when losing too fast');
  check(M.weightTrend(normalizeHealth({ weights: [{ date: '2026-08-01', lb: 180 }, { date: '2026-08-10', lb: 179 }, { date: '2026-08-12', lb: 179 }, { date: '2026-08-20', lb: 178 }] }), TODAY).rate === null, 'weight: no rate from stale weigh-ins');

  // ---------------- adaptive target
  const food = (k) => [
    { id: 'a', meal: 'lunch', name: 'Test lunch', k: k / 2, p: 60, c: 100, f: 30 },
    { id: 'b', meal: 'dinner', name: 'Test dinner', k: k / 2, p: 60, c: 100, f: 30 },
  ];
  const fd = {};
  for (let i = 1; i <= 28; i++) fd[addDays(TODAY, -i)] = { food: food(2300) };
  const aw = [];
  for (let i = 28; i >= 0; i -= 3) aw.push({ date: addDays(TODAY, -i), lb: 185 - ((28 - i) / 7) * 0.5 });
  const ha = normalizeHealth({ weights: aw, profile: { sex: 'male', age: 30, heightIn: 71, activity: 'light', goal: 'lose' } });
  const ad = M.adaptive(ha, yearsOf(fd), TODAY);
  check(ad.ready && Math.abs(ad.measured - 2550) <= 30 && ad.est === ad.measured && ad.suggested === Math.round((ad.est - 500) / 10) * 10 && ad.due, `adaptive: burns about 2,550 (${ad.measured}), suggests ${ad.suggested}`);
  M.acceptAdaptive(ha, ad, TODAY);
  const ta = targets(ha);
  check(ta.source === 'adaptive' && ta.cal === ad.suggested && ta.p === Math.round(ha.weights[ha.weights.length - 1].lb * 0.8) && ha.checkins.length === 1, 'adaptive: accepted target drives the macros');
  check(!M.adaptive(ha, yearsOf(fd), TODAY).due, 'adaptive: not due again for a week');
  const notYet = M.adaptive(normalizeHealth({ weights: aw.slice(-2) }), yearsOf({}), TODAY);
  check(!notYet.ready && notYet.need.length === 2, 'adaptive: says what it still needs');

  // ---------------- fiber, sugar, sodium
  const oats = { name: 'Test oats', per100: { k: 380, p: 13, c: 68, f: 7, fib: 10, sug: 1, na: 6 }, portions: [{ label: '1/2 cup', g: 40 }] };
  const n = nutrientsFor(oats, oats.portions[0], 1);
  check(n.fib === 4 && n.sug === 0.4 && n.na === 2 && n.k === 152, `nutrients: fiber/sugar/sodium scale with the portion (${JSON.stringify(n)})`);
  const e1 = entryFor(oats, oats.portions[0], 2, 'breakfast');
  const ex = M.extraTotals([e1, { name: 'Unknown', k: 100, meal: 'snack' }]);
  check(ex.fib === 8 && ex.counted === 1 && ex.of === 2, 'nutrients: totals say how many foods had data');
  check(M.nutrientGoals({ cal: 2500 }).fib === 35 && M.nutrientGoals({ cal: 2500 }).na === 2300, 'nutrients: goals from calories');
  check(M.proteinByMeal([{ meal: 'lunch', p: 20 }, { meal: 'lunch', p: 12.5 }, { meal: 'dinner', p: 40 }]).lunch === 32.5, 'nutrients: protein by meal');

  // ---------------- saved meals and recipes
  const hm = normalizeHealth({});
  const saved = M.saveMeal(hm, 'Usual breakfast', 'breakfast', [e1, { ...e1, id: 'z', name: 'Test coffee', k: 5 }]);
  const ents = M.mealEntries(saved, 'breakfast');
  check(hm.meals.length === 1 && ents.length === 2 && ents[0].id !== e1.id && !('id' in saved.items[0]) && M.mealTotals(saved).k === e1.k + 5, 'saved meal: items stored without ids, logged with new ones');
  const yd = { version: 1, days: {} };
  addEntries(yd, TODAY, ents);
  check(yd.days[TODAY].food.length === 2, 'saved meal: logged in one go');
  check(nutritionOf({ calories: 500, protein: 35, carbohydrates: 50, fat: 15, fiber: 8, sodium: 900 }).join() === '500,35,50,15,8,,900' && nutritionOf({ calories: 400, protein: 20, carbohydrates: 40, fat: 12 }).length === 4, 'recipes job: fiber, sugar and sodium when a recipe lists them');
  const rf = M.recipeFood({ id: 9, title: 'Sample bowls', nutrition: [500, 35, 50, 15, 8, 6, 900] });
  check(rf.perServing.fib === 8 && rf.perServing.na === 900 && rf.src === 'bb', 'recipe: extra nutrients carried');

  // ---------------- habits
  const hh = normalizeHealth({});
  const habits = M.habitsOf(hh);
  const hd = {};
  for (let i = 0; i < 6; i++) hd[addDays(TODAY, -i)] = { hb: { water: 8, vitamins: 1 }, hbAt: 1 };
  hd[addDays(TODAY, -2)].hb.alcohol = 3;
  const hy3 = yearsOf(hd);
  const water = habits.find((x) => x.id === 'water');
  const alc = habits.find((x) => x.id === 'alcohol');
  check(M.habitStreak(hy3, null, water, TODAY).current === 6, 'habits: water streak');
  check(M.habitStreak(hy3, null, alc, TODAY).current === 2 && M.habitStreak(hy3, null, alc, TODAY).best === 3, 'habits: a limit habit breaks when you go over');
  const hkw = hkYearsOf({ [TODAY]: { wat: 96 } });
  check(M.habitValue(yearsOf({}), hkw, water, TODAY) === 12 && M.habitValue(yearsOf({ [TODAY]: { hb: { water: 3 } } }), hkw, water, TODAY) === 3, 'habits: water from Apple Health counts until you set your own');
  const yd5 = { version: 1, days: {} };
  M.stepHabit(yd5, TODAY, 'water', 1, 12);
  M.stepHabit(yd5, TODAY, 'water', 1, 12);
  M.stepHabit(yd5, TODAY, 'water', -1, 99);
  check(yd5.days[TODAY].hb.water === 13, 'habits: quick taps all count, starting from what was shown');
  const hz0 = normalizeHealth({ habits: [], checkups: [] });
  check(M.habitsOf(hz0).length === 0 && M.checkupsOf(hz0).length === 0 && M.checkupReminders(hz0, TODAY).length === 0, 'habits and checkups can be emptied');
  const yd2 = { version: 1, days: {} };
  M.setHabit(yd2, TODAY, 'water', 2);
  M.setHabit(yd2, TODAY, 'water', 0);
  const zeroKept = yd2.days[TODAY].hb.water === 0;
  M.setHabit(yd2, TODAY, 'water', null);
  check(zeroKept && !yd2.days[TODAY].hb && yd2.days[TODAY].hbAt === 1, 'habits: zero is kept (over Apple’s count); clearing leaves the day tracked');
  M.addHabit(hh, 'Stretch');
  check(M.habitsOf(hh).length === 5 && M.habitsOf(hh)[4].kind === 'check', 'habits: add your own');

  // ---------------- checkups and labs
  check(M.addMonths('2026-08-31', 6) === '2027-02-28' && M.addMonths('2026-01-15', 12) === '2027-01-15', 'checkups: months add up at month ends');
  const hc = normalizeHealth({});
  M.updateCheckup(hc, 'dentist', { last: '2026-04-10' });
  M.updateCheckup(hc, 'physical', { last: '2025-08-01' });
  M.updateCheckup(hc, 'eye', { booked: '2026-10-02' });
  const rem = M.checkupReminders(hc, TODAY);
  check(rem.length === 3 && rem[0].state === 'overdue' && /Physical overdue/.test(rem[0].text) && rem.some((r) => r.state === 'soon' && /Dental cleaning due Oct 10/.test(r.text)) && rem.some((r) => r.state === 'booked'), `checkups: reminders (${rem.map((r) => r.text).join('; ')})`);
  check(M.checkupStatus({ id: 'x', every: 6, last: '2025-01-01', booked: '2026-09-01' }, TODAY).state === 'ok', 'checkups: a booked visit that has passed counts as the last one');
  M.doneCheckup(hc, 'physical', TODAY);
  check(M.checkupStatus(M.checkupsOf(hc).find((c) => c.id === 'physical'), TODAY).state === 'ok', 'checkups: marking done resets the clock');
  M.addLab(hc, 'ldl', '2025-09-01', '128');
  M.addLab(hc, 'ldl', '2026-09-01', '96');
  M.addLab(hc, 'vitd', '2026-09-01', 22);
  M.addLab(hc, 'a1c', '2026-09-01', 5.7);
  const ls = M.labSummary(hc);
  check(ls.find((x) => x.t.id === 'ldl').flag === 'ok' && ls.find((x) => x.t.id === 'ldl').prev.value === 128 && ls.find((x) => x.t.id === 'vitd').flag === 'low' && ls.find((x) => x.t.id === 'a1c').flag === 'high', 'labs: latest value, previous, and flags');

  // ---------------- training
  const hz = normalizeHealth({ profile: { dob: '1990-01-15' } });
  const max = T.maxHr(hz);
  check(max === 183, `zones: max heart rate from age (${max})`);
  // 10 min at 120-124, 10 at 150-154, 10 at 170-174
  const w = { id: 'w1', d: TODAY, t: '18:00', type: 'run', min: 30, hb: [120, 10, 0, 0, 0, 0, 0, 10, 0, 0, 0, 10] };
  const z = T.zonesOf(w, max);
  check(z.mins[1] === 10 && z.mins[3] === 10 && z.mins[4] === 10 && !z.est, `zones: from the histogram (${z.mins})`);
  check(T.loadOf(w, max) === 110, `load: minutes × zone (${T.loadOf(w, max)})`);
  check(T.loadOf({ type: 'tennis', minutes: 60 }, max) === 150 && T.zonesOf({ hr: 140, min: 40 }, max).mins[2] === 40, 'load: estimates without a histogram');
  const hkT = { workouts: [] };
  for (let i = 7; i < 35; i += 2) hkT.workouts.push({ id: `a${i}`, d: addDays(TODAY, -i), t: '07:00', type: 'run', min: 30, hr: 140 });
  for (let i = 0; i < 7; i++) hkT.workouts.push({ id: `b${i}`, d: addDays(TODAY, -i), t: '07:00', type: 'run', min: 45, hr: 160 });
  const tl = T.trainingLoad({ hk: hkT, health: hz, years: yearsOf({}) }, TODAY);
  check(tl.state === 'spike' && tl.ratio > 1.5 && tl.series.length === 12, `load: a sudden jump is flagged (${tl.ratio})`);
  // strength
  const sy = { 2026: { version: 1, days: {} } };
  const day = (iso, sets) => {
    const l = T.addLift(sy[2026], iso, 'bench');
    sets.forEach((x) => T.addSet(sy[2026], iso, l.id, x));
  };
  day('2026-09-07', [{ r: 8, lb: 155 }, { r: 8, lb: 155 }]);
  day('2026-09-14', [{ r: 8, lb: 160 }, { r: 7, lb: 160 }]);
  day('2026-09-21', [{ r: 5, lb: 175 }]);
  T.addLift(sy[2026], '2026-09-21', 'squat');
  const hist = T.history(sy, 'bench');
  check(hist.length === 3 && T.e1rm({ r: 8, lb: 150 }) === 190 && hist[2].best === 204.2, `strength: history and estimated max (${hist.map((x) => x.best)})`);
  const pr = T.prs(sy, '2026-09-01', TODAY);
  check(pr.length === 2 && pr[0].date === '2026-09-21', 'strength: PRs after the first session');
  const hs = normalizeHealth({});
  check(T.weeklyVolume(hs, sy, '2026-09-14').chest.sets === 2 && T.lastSession(sy, 'bench', TODAY).date === '2026-09-21', 'strength: weekly sets by muscle group, last session');
  const r = T.saveRoutine(hs, 'Push', ['bench', 'ohp', 'pushdown']);
  const sy2 = { version: 1, days: {} };
  T.startRoutine(sy2, TODAY, r);
  check(sy2.days[TODAY].lifts.length === 3 && T.addExercise(hs, 'Test sled push', 'legs').id.startsWith('x'), 'strength: routines and your own exercises');
  // tennis
  const hkTen = { workouts: [{ id: 't1', d: '2026-09-20', t: '17:00', type: 'tennis', min: 90 }, { id: 't2', d: '2026-08-10', t: '09:00', type: 'tennis', min: 60 }] };
  const ht = normalizeHealth({});
  T.setTennisNote(ht, 't1', { kind: 'singles', partner: 'Sam', score: '6-4 6-3', result: 'W' });
  const ts = T.tennisSummary({ hk: hkTen, health: ht, years: yearsOf({ '2026-09-25': { workouts: [{ id: 'm1', type: 'tennis', minutes: 60 }] } }) }, TODAY);
  check(ts.hoursThis === 2.5 && ts.countThis === 2 && ts.hoursLast === 1 && ts.record.w === 1 && ts.partners[0][0] === 'Sam' && ts.sessions[1].note.score === '6-4 6-3', `tennis: month hours and record (${ts.hoursThis}h)`);

  // ---------------- sleep patterns
  const sn = {};
  for (let i = 0; i < 20; i++) sn[addDays(TODAY, -i)] = { sl: { a: 400, s: -60, e: 420, b: 470 } };
  const sc = I.sleepConsistency({ hkYears: hkYearsOf(sn), health: {} }, TODAY);
  check(sc.score === 100 && sc.debt === 7 * 80 && sc.lag === 60 && sc.suggest.lights === 420 - 480 - 60 - 30 && sc.suggest.catchUp, `sleep: regular, 9h 20m short, lights out ${sc.suggest.lights}`);
  // alcohol nights: 60 min less sleep, lower HRV
  const fdays = {};
  const hdays = {};
  for (let i = 1; i <= 40; i++) {
    const iso = addDays(TODAY, -i);
    const drink = i % 4 === 0;
    fdays[iso] = { hb: drink ? { alcohol: 2 } : {}, hbAt: 1 };
    hdays[addDays(iso, 1)] = { sl: { a: drink ? 390 : 450 }, hrv: drink ? 40 : 50, rhr: drink ? 61 : 58 };
  }
  const sf = I.sleepFactors({ health: normalizeHealth({}), years: yearsOf(fdays), hkYears: hkYearsOf(hdays), hk: { workouts: [] } }, TODAY, 40);
  const alcF = sf.factors.find((f) => f.id === 'alcohol');
  check(alcF && alcF.tone === 'bad' && /1h 00m less/.test(alcF.text) && /20% lower/.test(alcF.text) && /3 bpm higher/.test(alcF.text), `sleep: alcohol pattern found (${alcF && alcF.text})`);
  // monthly report
  const rep = I.monthReport({ health: hw, years: yearsOf(fd), hkYears: hkYearsOf({ ...base, ...sn }), hk: { workouts: hkTen.workouts } }, '2026-09', TODAY);
  check(rep.title === 'September 2026' && rep.partial && rep.cur.sleep && rep.cur.tennisHours === 1.5 && rep.cur.cal && rep.weight && rep.weight.change < 0 && rep.sleepWeeks, `report: September (${rep.cur.tennisHours}h tennis, weight ${rep.weight && rep.weight.change})`);
  check(I.prevMonth('2026-01') === '2025-12' && I.reportMonths({ hkYears: hkYearsOf(base), years: yearsOf({}) }, TODAY).includes('2026-09'), 'report: months to pick from');
}
