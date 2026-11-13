// Home's document: which tabs are on, and One small thing (an area, one action a day, done or skipped). Made-up data.
import * as H from '../src/home-logic.js';

export async function homeUnit(check) {
  const d = H.normalizeHome(null);
  check(d.tabs.length === 0 && d.small.on === true && d.small.area === '', 'a new home document: only Home and Budget, One small thing on with no area yet');
  const kept = H.normalizeHome({ place: { name: 'Testville', lat: 1, lon: 2 }, tabs: ['auto', 'bogus', 'news'], small: { on: false, area: 'nope', log: { '2026-01-01': { area: 'health', done: 'walk' } } } });
  check(kept.tabs.join() === 'auto,news' && kept.small.on === false && kept.small.area === '' && kept.small.log['2026-01-01'].done === 'walk', 'normalize keeps known tabs and the log, drops unknown ones');

  H.setTab(d, 'auto', true);
  H.setTab(d, 'news', true);
  H.setTab(d, 'news', true);
  H.setTab(d, 'nope', true);
  check(d.tabs.join() === 'news,auto', 'tabs switch on once each, in sidebar order');
  H.setTab(d, 'news', false);
  check(d.tabs.join() === 'auto', 'and off');

  const day = '2026-11-13';
  check(!H.smallToday(d, day).area, 'no area: the card asks for one');
  H.setSmallArea(d, 'health');
  let t = H.smallToday(d, day);
  const first = t.action.id;
  check(t.area === 'health' && t.name === 'Health' && !t.done && !t.out && H.SMALL_AREAS.health.actions.some((a) => a.id === first), `one action for today (${t.action.text})`);
  check(H.smallToday(d, day).action.id === first, 'the same one all day');
  check(H.smallToday(d, '2026-11-14').action.id !== first, 'a different one tomorrow');
  H.smallSkip(d, day);
  t = H.smallToday(d, day);
  check(t.action.id !== first && !t.done, 'Something else: the next one');
  H.smallDone(d, t.action.id, day, { miles: 5 });
  t = H.smallToday(d, day);
  check(t.done && t.total === 1 && t.week === 1 && t.ref.miles === 5, 'done, with what it wrote kept for Undo');
  H.smallUndo(d, day);
  t = H.smallToday(d, day);
  check(!t.done && t.total === 0 && !t.ref, 'Undo reopens it');
  H.smallSkip(d, day);
  H.smallSkip(d, day);
  t = H.smallToday(d, day);
  check(t.out && !t.action, 'skipping every one: nothing more today');
  H.setSmallArea(d, 'cooking');
  t = H.smallToday(d, day);
  check(t.area === 'cooking' && !t.out && !!t.action, 'a different area starts fresh the same day');
  // the log only keeps about four months
  H.smallDone(d, 'cook', '2026-01-02');
  H.smallDone(d, 'cook', day);
  check(!d.small.log['2026-01-02'] && !!d.small.log[day], 'old days drop off the log');
  H.setSmallOn(d, false);
  check(!H.smallToday(d, day).on, 'the card can be switched off');
}
