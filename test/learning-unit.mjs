// Learning: exam prep (readiness, modules, practice tests, exam plan, phone alerts), flashcards, and the guitar's
// tempo log and amp settings. Made-up data only.
import * as L from '../src/learning-logic.js';
import * as K from '../src/cards-logic.js';
import * as G from '../src/guitar-logic.js';
import { OUTLINES, outlineItems } from '../src/learning-outlines.js';

export async function learningUnit(check) {
  const today = '2026-09-28'; // a Monday
  const o = OUTLINES['ai-901'];
  const items = outlineItems(o);
  const keys = new Set(items.map((x) => x.key));
  const slugs = o.course.paths.flatMap((p) => p.modules.map((m) => m[0]));
  check(items.length === 29 && keys.size === 29 && new Set(slugs).size === 14 && o.domains.every((dm) => dm.weight[0] < dm.weight[1]), 'exam prep: AI-901 outline has 29 skills in 2 parts, and 14 course modules, all with their own keys');

  // readiness: solid counts 1, shaky ½, weighted by each part's share of the exam
  const d = L.normalize({ plan: ['ai-901', 'az-104'], certs: {}, log: [] });
  check(L.readiness(o, L.prepOf(d, 'ai-901')).pct === 0 && L.statusOf(d, 'ai-901') === 'planned', 'exam prep: nothing rated is 0% ready');
  for (const x of items.filter((x) => x.domain.key === 'concepts')) L.rateSkill(d, 'ai-901', x.key, 2);
  let r = L.readiness(o, L.prepOf(d, 'ai-901'));
  check(Math.abs(r.pct - 42.5 / 100) < 1e-9 && r.domains[0].pct === 1 && r.domains[1].pct === 0 && L.statusOf(d, 'ai-901') === 'studying', `exam prep: every concept solid is ${Math.round(r.pct * 100)}% (that part’s share), and rating starts the cert`);
  L.rateSkill(d, 'ai-901', 'ga-prompts', 1);
  L.rateSkill(d, 'ai-901', 'rai-fair', 0);
  r = L.readiness(o, L.prepOf(d, 'ai-901'));
  check(r.next[0].key !== 'ga-prompts' && r.next.every((x) => x.domain.key === 'foundry' || x.key === 'rai-fair') && r.next[0].domain.key === 'foundry' && r.rated === 14, `exam prep: study next is what’s not rated yet in the bigger part first (${r.next.map((x) => x.key).join(', ')})`);

  // modules
  L.toggleModule(d, 'ai-901', 'get-started-ai-fundamentals', '2026-09-20');
  L.toggleModule(d, 'ai-901', 'rag-fundamentals');
  L.toggleModule(d, 'ai-901', 'rag-fundamentals');
  const mp = L.moduleProgress(o, L.prepOf(d, 'ai-901'));
  check(mp.done === 1 && mp.total === 14 && mp.paths[0].doneUnits === 10 && mp.minutesLeft === Math.round(231 * (1 - 10 / 55)) + 337, `exam prep: a module ticked and one unticked; about ${mp.minutesLeft} minutes left`);

  // practice tests
  check(L.addTest(d, 'ai-901', { score: '140' }) === null && L.addTest(d, 'ai-901', { score: '' }) === null, 'practice tests: a score has to be 0–100');
  L.addTest(d, 'ai-901', { score: '81', date: '2026-09-25', parts: { concepts: '88', foundry: '' } });
  L.addTest(d, 'ai-901', { score: 70, date: '2026-09-18', parts: { concepts: 80, foundry: 62 } });
  let ts = L.testSummary(L.prepOf(d, 'ai-901'));
  check(ts.last.score === 81 && ts.change === 11 && ts.avg === 76 && !ts.ready && ts.weak.key === 'concepts' && L.prepOf(d, 'ai-901').tests[0].date === '2026-09-18', 'practice tests: kept in date order; latest, change and average; the weakest part from the latest breakdown');
  const t3 = L.addTest(d, 'ai-901', { score: 84, date: '2026-09-27' });
  ts = L.testSummary(L.prepOf(d, 'ai-901'));
  check(ts.ready && ts.avg === 78, 'practice tests: two in a row at 80%+ means ready to book');
  L.removeTest(d, 'ai-901', t3.id);
  check(!L.testSummary(L.prepOf(d, 'ai-901')).ready, 'practice tests: removing one updates it');

  // exam date and plan
  L.logTime(d, 'ai-901', 360, '2026-09-22');
  L.bookExam(d, 'ai-901', '2026-10-26');
  const plan = L.examPlan(d, 'ai-901', new Date('2026-09-28T09:00:00'));
  check(L.statusOf(d, 'ai-901') === 'booked' && plan.days === 28 && plan.left === 14 && plan.perWeek === 3.5 && plan.onPace, `exam date: booked, 28 days, 14h left at ${plan.perWeek}h a week`);
  L.bookExam(d, 'ai-901', '');
  check(L.statusOf(d, 'ai-901') === 'studying' && !L.certState(d, 'ai-901').examDate, 'exam date: clearing it goes back to studying');

  // phone alerts: 14, 7, 1, 0 days out, once each; a Sunday check-in when behind
  L.bookExam(d, 'ai-901', '2026-10-05');
  let al = L.learningAlerts(d, today);
  check(al.length === 1 && al[0].title === 'AI-901 exam in 7 days' && al[0].key === 'exam:ai-901:2026-10-05:7' && /Readiness \d+%, practice tests averaging 76%/.test(al[0].body) && /Shakiest: Writing effective system and user prompts\./.test(al[0].body) && al[0].click === '#/learning?prep', `alerts: a week out (${al[0] && al[0].body})`);
  check(L.learningAlerts(d, '2026-09-30', { [al[0].key]: today }).length === 0, 'alerts: the week-out alert goes once, not every day of that week');
  check(L.learningAlerts(d, '2026-10-04')[0].title === 'AI-901 exam tomorrow' && L.learningAlerts(d, '2026-10-05')[0].title === 'AI-901 exam today' && L.learningAlerts(d, '2026-09-15').length === 0 && L.learningAlerts(d, '2026-10-06').length === 0, 'alerts: the day before and the day of; nothing too early or after');
  const sun = L.learningAlerts(d, '2026-10-04', {}).length; // Sunday, a day out: countdown only
  const quiet = JSON.parse(JSON.stringify(d)); // no practice test that week
  quiet.prep['ai-901'].tests = quiet.prep['ai-901'].tests.filter((t) => t.date < '2026-09-21');
  const sunday = L.learningAlerts(quiet, '2026-09-27', {}); // Sunday, 8 days out: countdown (14) + check-in
  check(sun === 1 && sunday.some((a) => a.key === 'studyweek:ai-901:2026-09-21' && /toward AI-901/.test(a.body)) && sunday.some((a) => a.key.endsWith(':14')), 'alerts: a Sunday check-in when the week is short of the pace the exam needs');
  {
    const busy = JSON.parse(JSON.stringify(d)); // a practice test on the 25th, no logged time
    check(!L.learningAlerts(busy, '2026-09-27', {}).some((a) => a.key.startsWith('studyweek')), 'alerts: a week with a practice test gets no check-in');
    L.setStatus(busy, 'ai-901', 'studying');
    check(L.examPlan(busy, 'ai-901') === null && L.learningAlerts(busy, '2026-09-28').length === 0, 'alerts: an exam that isn’t booked any more has no countdown');
  }
  L.logTime(quiet, 'ai-901', 600, '2026-09-26');
  check(!L.learningAlerts(quiet, '2026-09-27', {}).some((a) => a.key.startsWith('studyweek')), 'alerts: no check-in when the week’s study is on pace');
  check(L.weekStartISO('2026-09-27') === '2026-09-21' && L.weekStartISO('2026-09-28') === '2026-09-28', 'alerts: weeks start on Monday');

  // ---------------------------------------------------------------- flashcards
  const c = K.normalizeCards(null);
  const bulk = K.parseBulk('Temperature\tHow random the output is\nToken|A chunk of text\nRAG — Retrieval first, then generate\nno separator here, well-known\n\nOCR - Reading text from images');
  check(bulk.cards.length === 4 && bulk.skipped.length === 1 && bulk.cards[1].front === 'Token' && bulk.cards[2].front === 'RAG' && bulk.cards[3].back === 'Reading text from images', 'flashcards: pasting many (tab, |, spaced dashes); a line without one (a hyphenated word isn’t one) is left out');
  const add = K.addCards(c, [...bulk.cards, { front: 'token', back: 'dupe' }], 'ai-901', today);
  check(add.added.length === 4 && add.dupes.length === 1 && c.cards.every((x) => x.due === today && x.reps === 0), 'flashcards: added as new, a repeated front in the same deck left out');
  c.newPerDay = 3;
  let q = K.dueQueue(c, today);
  check(q.length === 3 && K.cardStats(c, today).dueNew === 3 && K.cardStats(c, today).fresh === 4, 'flashcards: new cards come in a few a day');
  // ratings
  const card = { ...q[0] };
  const s0 = K.schedule(card, 0, today);
  const s2 = K.schedule(card, 2, today);
  const s3 = K.schedule(card, 3, today);
  const s1 = K.schedule(card, 1, today);
  check(s0.interval === 0 && s0.due === today && s1.interval === 1 && s2.interval === 2 && s2.due === '2026-09-30' && s3.interval === 4 && s3.ease > card.ease && s0.ease === card.ease, 'flashcards: a new card: Again today, Hard 1 day, Good 2, Easy 4 (Again doesn’t lower a new card’s ease)');
  for (const c0 of [{ reps: 1, interval: 2, ease: 2.5 }, { reps: 1, interval: 4, ease: 2.65 }, { reps: 4, interval: 1, ease: 1.3 }, { reps: 6, interval: 300, ease: 3 }]) {
    const [h1, g1, e1] = [1, 2, 3].map((r) => K.schedule({ ...card, ...c0 }, r, today).interval);
    check(h1 < g1 && g1 < e1 || e1 === 365, `flashcards: Hard < Good < Easy (${h1}/${g1}/${e1} from ${c0.interval}d)`);
  }
  const lapsed = { ...card, reps: 3, interval: 10, ease: 2.5, last: '2026-09-18' };
  const a1 = K.schedule(lapsed, 0, today);
  const a2 = K.schedule({ ...lapsed, ...a1 }, 0, today);
  check(a1.ease === 2.3 && a2.ease === 2.3 && a1.lapses === 1, 'flashcards: forgetting a learned card lowers its ease once a day');
  const later = K.schedule({ ...card, reps: 3, interval: 10, ease: 2.5 }, 2, today);
  const hard = K.schedule({ ...card, reps: 3, interval: 10, ease: 2.5 }, 1, today);
  check(later.interval === 25 && hard.interval === 12 && hard.ease === 2.35 && K.schedule({ ...card, reps: 3, interval: 10, ease: 1.3, last: '2026-09-01' }, 0, today).ease === 1.3, 'flashcards: Good multiplies by the ease, Hard grows a little and lowers it; ease never below 1.3');
  K.review(c, q[0].id, 2, today);
  K.review(c, q[1].id, 0, today);
  q = K.dueQueue(c, today);
  const st = K.cardStats(c, today);
  check(st.today === 2 && q.some((x) => x.id === c.cards[1].id) && !q.some((x) => x.id === c.cards[0].id) && q.filter(K.isNew).length === 1 && st.streak === 1, 'flashcards: reviewed cards leave the queue until due; Again stays today; today’s new allowance counts what was started');
  check(K.dueQueue(c, today, 'general').length === 0 && K.intervalText(0) === 'today' && K.intervalText(45) === '2mo' && K.intervalText(350) === '1y' && K.dueText(c.cards[0], today) === 'In 2d', 'flashcards: decks, and how long until a card is back');
  {
    const big = K.normalizeCards(null);
    const long = 'x'.repeat(1100);
    const r = K.addCards(big, Array.from({ length: 900 }, (_, i) => ({ front: `Card ${i}`, back: long })), 'general', today);
    check(r.full && r.added.length > 500 && r.added.length < 900 && JSON.stringify(big).length + big.cards.length * 60 < 1000000, `flashcards: adding stops before the deck outgrows its document (${r.added.length} of 900 fit)`);
  }
  K.updateCard(c, c.cards[0].id, { front: 'Temperature (sampling)', back: '' });
  K.resetCard(c, c.cards[1].id, today);
  K.removeCard(c, c.cards[3].id);
  check(c.cards[0].front === 'Temperature (sampling)' && c.cards[0].back === 'How random the output is' && c.cards[1].reps === 0 && c.cards.length === 3, 'flashcards: edit (a blank side is kept), start over, delete');
  const norm = K.normalizeCards({ cards: [{ id: 'a', front: 'x', back: 'y' }, { id: 'b', front: '', back: 'y' }], newPerDay: 0 });
  check(norm.cards.length === 1 && norm.newPerDay === 20, 'flashcards: bad cards dropped when read');

  // ---------------------------------------------------------------- guitar: tempo and amp settings
  const g = G.normalizeGuitar({ songs: [{ id: 's1', title: 'Song A', status: 'learning' }, { id: 's2', title: 'Song B', status: 'want' }] });
  const ex = G.addExercise(g, ' Strumming pattern 1 ');
  check(G.addExercise(g, 'strumming PATTERN 1') === ex && G.tempoItems(g).map((i) => i.key).join() === `song:s1,ex:${ex.id}`, 'tempo: songs you’re learning and your exercises (no duplicates)');
  check(G.logTempo(g, 'song:s1', 20) === null && G.logTempo(g, 'song:s1', 300) === null, 'tempo: 30–240 bpm');
  G.logTempo(g, 'song:s1', 60, '2026-09-10');
  G.logTempo(g, 'song:s1', 64, '2026-09-20');
  G.logTempo(g, 'song:s1', 70, '2026-09-20');
  G.logTempo(g, 'song:s1', 68, '2026-09-27');
  const h = G.tempoHistory(g, 'song:s1');
  check(h.history.length === 3 && h.best === 70 && h.last.bpm === 68 && h.gain === 8 && G.tempoHistory(g, `ex:${ex.id}`) === null, 'tempo: a day’s best per day, the latest, the best and the gain');
  G.removeSong(g, 's1');
  G.logTempo(g, `ex:${ex.id}`, 90);
  G.removeExercise(g, ex.id);
  check(g.tempo.length === 0 && g.exercises.length === 0, 'tempo: removing a song or exercise removes its tempos');
  const amp = G.cleanAmp({ type: 'Lead', gain: 7.3, bass: 12, treble: 'x', reverb: { on: 1, level: 3, color: 'purple' }, notes: 'Bridge pickup' });
  check(amp.gain === 7.5 && amp.bass === 10 && amp.treble === 5 && amp.reverb.on === true && amp.reverb.color === 'green' && amp.delay.on === false && amp.mod.on === false && G.cleanAmp({ type: 'Metal' }).type === 'Clean' && G.cleanAmp({ type: 'Pushed', fx: { on: true, color: 'yellow' } }).fx.color === 'orange', 'amp: knobs kept 0–10 in half steps, five effects, unknown types and colors fall back');
  check(G.clockOf(0) === '7 o’clock' && G.clockOf(5) === 'noon' && G.clockOf(7.5) === '2:30' && G.clockOf(10) === '5 o’clock' && G.ampSummary(amp) === 'Lead · gain 2:30 · reverb (green)', 'amp: knob positions as clock times, and the one-line summary');
  G.addSong(g, { title: 'Song C', status: 'learning' });
  const sc = g.songs.find((s) => s.title === 'Song C');
  G.setAmp(g, sc.id, amp);
  const back = G.normalizeGuitar(JSON.parse(JSON.stringify(g)));
  G.clearAmp(g, sc.id);
  check(back.songs.find((s) => s.title === 'Song C').amp.type === 'Lead' && !g.songs.find((s) => s.title === 'Song C').amp, 'amp: saved on the song, kept when read back, and removable');
}
