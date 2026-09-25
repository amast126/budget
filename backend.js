// Firebase access for the dashboard. Same project, sign-in and budget document as the budget module,
// so a quick-add here lands in the budget instantly (it listens to the same document).
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
} from 'firebase/auth';
import { getFirestore, doc, onSnapshot, runTransaction } from 'firebase/firestore';

const CFG = window.BUDGET_CONFIG || {};
const CLIENT = 'home-' + Math.random().toString(36).slice(2);

export function createFirebaseBackend() {
  // Default app name on purpose: Firebase keys the saved sign-in by app name, so this shares the
  // budget module's sign-in instead of asking you to sign in twice.
  const fb = CFG.firebase && CFG.firebase.apiKey ? initializeApp(CFG.firebase) : null;
  const auth = fb ? getAuth(fb) : null;
  // Memory cache only: the budget module owns the on-device Firestore cache in its own frame.
  const db = fb ? getFirestore(fb) : null;
  const owner = String(CFG.ownerEmail || '').toLowerCase();
  const allowed = (CFG.allowedEmails || []).map((e) => String(e).toLowerCase());
  const docId = CFG.sharedDocId || null;

  const budgetRef = (user) => doc(db, 'trackers', docId || user.uid);
  // Other modules get their own document next to the budget, e.g. trackers/alec-tracker-learning.
  const moduleRef = (user, name) => doc(db, 'trackers', `${docId || user.uid}-${name}`);

  const listen = (ref, cb, onError) =>
    onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return cb(null);
        const d = snap.data();
        try {
          cb(d.json ? JSON.parse(d.json) : null);
        } catch (e) {
          onError && onError(e);
        }
      },
      (e) => onError && onError(e)
    );
  // Read-modify-write in one transaction so nothing saved a moment ago elsewhere is lost.
  const mutate = (ref, fn, init) =>
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      let data;
      if (snap.exists() && snap.data().json) data = JSON.parse(snap.data().json);
      else if (init) data = init();
      else throw new Error('Data not found');
      fn(data);
      data.updatedAt = Date.now();
      tx.set(ref, { json: JSON.stringify(data), updatedAt: data.updatedAt, client: CLIENT });
    });

  return {
    configured: !!fb,
    isAllowed(user) {
      const email = String((user && user.email) || '').toLowerCase();
      if (owner) return email === owner;
      return allowed.length === 0 || allowed.includes(email);
    },
    onAuth(cb) {
      if (!auth) {
        cb(null);
        return () => {};
      }
      getRedirectResult(auth).catch(() => {});
      return onAuthStateChanged(auth, cb);
    },
    async signIn() {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        const code = String((e && e.code) || '');
        if (/popup-closed|cancelled-popup|user-cancelled/i.test(code)) return;
        if (/popup/i.test(code)) {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw e;
      }
    },
    signOut: () => (auth ? fbSignOut(auth) : Promise.resolve()),
    subscribeBudget: (user, cb, onError) => listen(budgetRef(user), cb, onError),
    mutateBudget: (user, fn) => mutate(budgetRef(user), fn),
    subscribeModule: (user, name, cb, onError) => listen(moduleRef(user, name), cb, onError),
    mutateModule: (user, name, fn, init) => mutate(moduleRef(user, name), fn, init),
  };
}
