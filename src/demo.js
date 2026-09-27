// Demo mode: the whole dashboard on sample data, for anyone with the link (…/budget/?demo), no sign-in needed.
// It never touches Firebase or anyone's account. The sample documents live in this browser's storage under
// "demo:" keys and changes stay there until "Reset demo". The budget module (its own page, in a frame) runs in
// its local mode on the same sample budget, from budget-demo.html.
import { demoDocs, DEMO_PERSON } from './demo-data.js';

export const IS_DEMO = typeof location !== 'undefined' && /(^|&)demo(=[^&]*)?(&|$)/.test(location.search.slice(1));
const P = 'demo:';
const META = 'meta';
const BUDGET = 'budget-tracker-v1'; // the budget module's own key (it becomes demo:budget-tracker-v1 in budget-demo.html)

// If storage is full or blocked (private browsing), documents are kept in memory for this visit instead.
const mem = new Map();
const raw = {
  get(k) {
    if (mem.has(k)) return mem.get(k);
    try {
      return localStorage.getItem(P + k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(P + k, v);
      mem.delete(k);
    } catch {
      mem.set(k, v);
    }
  },
};
const readDoc = (k) => {
  const v = raw.get(k);
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

function demoKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(P)) out.push(k);
    }
  } catch {
    /* no storage */
  }
  return out;
}

// Write the sample documents the first time (or after a reset).
export function seedDemo(force = false) {
  if (!force && raw.get(META)) return false;
  demoKeys().forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
  mem.clear();
  const docs = demoDocs(new Date());
  for (const [name, doc] of Object.entries(docs)) raw.set(name, JSON.stringify(doc));
  raw.set(META, JSON.stringify({ version: 1, seeded: new Date().toISOString() }));
  return true;
}

export function demoSeededAt() {
  const m = readDoc(META);
  return m && m.seeded ? m.seeded : null;
}

// Start over with fresh sample data (everything reloads, including the budget frame).
export function resetDemo() {
  seedDemo(true);
  location.reload();
}
export function exitDemo() {
  location.href = `${location.pathname}#/`;
}
export function enterDemo() {
  location.href = `${location.pathname}?demo#/`;
}

// Same shape as the Firebase backend (backend.js), backed by the "demo:" documents.
export function createDemoBackend() {
  seedDemo();
  const subs = new Map(); // name → Set of callbacks
  const emit = (name) => {
    const set = subs.get(name);
    if (!set) return;
    const d = readDoc(name);
    set.forEach((cb) => setTimeout(() => cb(d == null ? null : JSON.parse(JSON.stringify(d))), 0));
  };
  // The budget frame (and other tabs on the demo) change the same storage; pass those changes on.
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(P)) emit(e.key.slice(P.length));
  });
  const subscribe = (name, cb) => {
    if (!subs.has(name)) subs.set(name, new Set());
    subs.get(name).add(cb);
    const d = readDoc(name);
    setTimeout(() => cb(d == null ? null : d), 0);
    return () => subs.get(name).delete(cb);
  };
  const mutate = async (name, fn, init) => {
    let data = readDoc(name);
    if (!data) {
      if (init) data = init();
      else throw new Error('Data not found');
    }
    fn(data);
    data.updatedAt = Date.now();
    raw.set(name, JSON.stringify(data));
    emit(name);
  };
  const listeners = new Set();
  return {
    configured: true,
    demo: true,
    isAllowed: () => true,
    onAuth(cb) {
      setTimeout(() => cb({ ...DEMO_PERSON, demo: true }), 0);
      return () => {};
    },
    signIn: async () => {},
    signOut: async () => exitDemo(),
    subscribeBudget: (user, cb) => subscribe(BUDGET, cb),
    mutateBudget: async (user, fn) => {
      await mutate(BUDGET, fn);
      listeners.forEach((f) => f());
    },
    subscribeModule: (user, name, cb) => subscribe(name, cb),
    mutateModule: (user, name, fn, init) => mutate(name, fn, init),
    // The budget frame doesn't watch storage, so the app reloads it after the budget changes from here.
    onBudgetWrite(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
  };
}
