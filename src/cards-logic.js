// Flashcards for the Learning tab, with spaced repetition. Only cards you write (or paste in); nothing comes
// pre-filled. Saved in trackers/<doc>-cards, apart from the rest of Learning, since a deck can grow large.
//
// Scheduling follows the usual SM-2 pattern, simplified: each card keeps an interval (days until it's due again)
// and an ease. Again brings it back today; Hard grows the interval a little; Good multiplies it by the ease;
// Easy by more, and the three always differ. New cards come in at most `newPerDay` a day, so a big paste doesn't
// bury you. The deck lives in one Firestore document (1 MB at most), so adding stops before it would get too big.
import { uid, todayISO } from './budget-logic.js';

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d + n));
};
const daysBetween = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

export const RATINGS = [
  [0, 'Again'],
  [1, 'Hard'],
  [2, 'Good'],
  [3, 'Easy'],
];
export const MAX_CARDS = 3000;
export const MAX_BYTES = 880000; // leaves room under Firestore's 1 MB for reviews to add their dates
export const MATURE = 21; // days: a card you know well
const START_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3.2;
const MAX_INTERVAL = 365;

export function defaultCards() {
  return { version: 1, newPerDay: 20, cards: [], log: {} };
}
const clip = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim().slice(0, n);
export function normalizeCards(d) {
  const base = defaultCards();
  if (!d || typeof d !== 'object') return base;
  return {
    version: 1,
    newPerDay: Number(d.newPerDay) > 0 ? Math.min(200, Math.round(Number(d.newPerDay))) : base.newPerDay,
    cards: Array.isArray(d.cards) ? d.cards.filter((c) => c && c.id && c.front && c.back) : [],
    log: d.log && typeof d.log === 'object' ? d.log : {},
    updatedAt: d.updatedAt,
  };
}

// ---------------------------------------------------------------- adding
// One card per line: the front, then a tab, a "|", " :: ", or a dash with spaces around it (" — ", " – ", " - "), then
// the back. Quizlet exports use a tab. Lines without a separator come back in `skipped` so you can see what didn't
// take. (A dash needs the spaces, so hyphenated words stay whole.)
const SEPS = ['\t', '|', ' :: ', ' — ', ' – ', ' - '];
export function parseBulk(text) {
  const cards = [];
  const skipped = [];
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const sep = SEPS.find((s) => raw.includes(s));
    const at = sep ? raw.indexOf(sep) : -1;
    const front = at > 0 ? clip(raw.slice(0, at), 400) : '';
    const back = at > 0 ? clip(raw.slice(at + sep.length), 1200) : '';
    if (front && back) cards.push({ front, back });
    else skipped.push(line);
  }
  return { cards, skipped };
}
const sameText = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
// Adds cards to a deck; a card whose front is already in that deck is left out (returned in `dupes`), and adding
// stops (`full`) when the deck would outgrow its document.
const PER_CARD_EXTRA = 60; // the dates a card gains once reviewed
export function addCards(d, list, deck = 'general', today = todayISO()) {
  const added = [];
  const dupes = [];
  let bytes = JSON.stringify(d).length + d.cards.filter((c) => !c.last).length * PER_CARD_EXTRA;
  let full = false;
  for (const x of list) {
    const front = clip(x.front, 400);
    const back = clip(x.back, 1200);
    if (!front || !back) continue;
    if (d.cards.length >= MAX_CARDS) {
      full = true;
      break;
    }
    if (d.cards.some((c) => c.deck === deck && sameText(c.front, front)) || added.some((c) => sameText(c.front, front))) {
      dupes.push(front);
      continue;
    }
    const c = { id: uid(), deck, front, back, added: today, due: today, interval: 0, ease: START_EASE, reps: 0, lapses: 0 };
    const size = JSON.stringify(c).length + 1 + PER_CARD_EXTRA;
    if (bytes + size > MAX_BYTES) {
      full = true;
      break;
    }
    bytes += size;
    d.cards.push(c);
    added.push(c);
  }
  return { added, dupes, full };
}
export function updateCard(d, id, patch) {
  const c = d.cards.find((x) => x.id === id);
  if (!c) return;
  if (patch.front != null && clip(patch.front, 400)) c.front = clip(patch.front, 400);
  if (patch.back != null && clip(patch.back, 1200)) c.back = clip(patch.back, 1200);
  if (patch.deck) c.deck = patch.deck;
}
export function removeCard(d, id) {
  d.cards = d.cards.filter((c) => c.id !== id);
}
// Start a card over, as if new.
export function resetCard(d, id, today = todayISO()) {
  const c = d.cards.find((x) => x.id === id);
  if (c) Object.assign(c, { due: today, interval: 0, ease: START_EASE, reps: 0, lapses: 0, last: undefined, first: undefined });
}

// ---------------------------------------------------------------- reviewing
const isNew = (c) => !c.reps && !c.last;
// Today's queue: cards due (oldest due first), then new cards up to what's left of today's allowance.
export function dueQueue(d, today = todayISO(), deck = null) {
  const inDeck = (c) => !deck || c.deck === deck;
  const due = d.cards.filter((c) => inDeck(c) && !isNew(c) && c.due <= today).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const introduced = d.cards.filter((c) => c.first === today).length;
  const fresh = d.cards
    .filter((c) => inDeck(c) && isNew(c))
    .sort((a, b) => (a.added < b.added ? -1 : a.added > b.added ? 1 : 0))
    .slice(0, Math.max(0, d.newPerDay - introduced));
  return [...due, ...fresh];
}
// The card's next state after a rating (nothing saved). Hard, Good and Easy always give different intervals, and
// Again lowers the ease only for a card you'd learned, once a day.
export function schedule(c, rating, today = todayISO()) {
  let ease = c.ease || START_EASE;
  const interval = c.interval || 0;
  let reps = c.reps || 0;
  let lapses = c.lapses || 0;
  let next;
  if (rating === 0) {
    if (reps > 0) {
      lapses++;
      if (c.last !== today) ease -= 0.2;
    }
    reps = 0;
    next = 0;
  } else {
    let hard;
    let good;
    let easy;
    if (reps === 0) {
      hard = 1;
      good = 2;
      easy = 4;
    } else {
      hard = Math.max(interval + 1, Math.round(interval * 1.2));
      good = Math.max(interval + 1, Math.round(interval * ease));
      easy = Math.round(interval * ease * 1.3);
    }
    good = Math.max(good, hard + 1);
    easy = Math.max(easy, good + 1);
    if (rating === 1) ease -= 0.15;
    if (rating === 3) ease += 0.15;
    next = rating === 1 ? hard : rating === 2 ? good : easy;
    reps++;
  }
  ease = Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, ease)) * 100) / 100;
  next = Math.min(MAX_INTERVAL, next);
  return { ease, interval: next, reps, lapses, due: addDays(today, next), last: today, first: c.first || today };
}
// "today", "1d", "12d", "2mo", "1y": how long until a card comes back.
export const intervalText = (n) => (n <= 0 ? 'today' : n < 30 ? `${n}d` : n < 330 ? `${Math.round(n / 30)}mo` : `${Math.round((n / 365) * 10) / 10}y`);
export function review(d, id, rating, today = todayISO()) {
  const c = d.cards.find((x) => x.id === id);
  if (!c) return null;
  Object.assign(c, schedule(c, rating, today));
  d.log = { ...(d.log || {}) };
  d.log[today] = (d.log[today] || 0) + 1;
  // keep a year of daily counts
  const cutoff = addDays(today, -400);
  for (const k of Object.keys(d.log)) if (k < cutoff) delete d.log[k];
  return c;
}

// ---------------------------------------------------------------- summaries
export function cardStats(d, today = todayISO(), deck = null) {
  const list = deck ? d.cards.filter((c) => c.deck === deck) : d.cards;
  const queue = dueQueue(d, today, deck);
  const fresh = list.filter(isNew).length;
  const learned = list.filter((c) => !isNew(c) && c.interval >= MATURE).length;
  const tomorrow = list.filter((c) => !isNew(c) && c.due === addDays(today, 1)).length;
  // days in a row with at least one review, counting today only once it's done
  let streak = 0;
  for (let day = d.log[today] ? today : addDays(today, -1); d.log[day]; day = addDays(day, -1)) streak++;
  return { total: list.length, due: queue.length, dueReviews: queue.filter((c) => !isNew(c)).length, dueNew: queue.filter(isNew).length, fresh, learned, tomorrow, today: d.log[today] || 0, streak };
}
export function reviewsByDay(d, today = todayISO(), n = 14) {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - n + 1);
    return { day, v: d.log[day] || 0 };
  });
}
export const dueText = (c, today = todayISO()) => (isNew(c) ? 'New' : c.due <= today ? 'Due' : `In ${intervalText(daysBetween(today, c.due))}`);
export { isNew };
