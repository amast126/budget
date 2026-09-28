// Recipe photos. Each photo has two documents: a card (560×420) for the grid and lists, and a full size
// (1400×1050) for the recipe page, both JPEG data URLs, so the recipe box itself stays small. Documents are named
// by the recipe and the photo's stamp (recipebox-card-<id>-<stamp>), so a new photo never overwrites the one the
// box still points at: the old one is removed only after the box has switched over. Photos load when they come
// into view, a few at a time, and are kept in memory and in this browser's IndexedDB, so the grid fills in
// instantly next time.
export const CARD = { w: 560, h: 420, q: 0.72 };
export const FULL = { w: 1400, h: 1050, q: 0.78 };
export const docName = (kind, id, stamp) => `recipebox-${kind === 'full' ? 'photo' : 'card'}-${id}-${stamp}`;
const WRITE_TIMEOUT = 60000;

// ---------------------------------------------------------------- IndexedDB (best effort: anything failing just means no cache)
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open('dash-recipe-photos', 2);
      req.onupgradeneeded = () => {
        if (req.result.objectStoreNames.contains('p')) req.result.deleteObjectStore('p');
        req.result.createObjectStore('p');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}
async function idb(mode, fn) {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction('p', mode);
      const req = fn(tx.objectStore('p'));
      tx.oncomplete = () => resolve(req ? req.result : null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
const idbGet = (k) => idb('readonly', (s) => s.get(k));
const idbPut = (k, v) => idb('readwrite', (s) => s.put(v, k));
const idbDel = (k) => idb('readwrite', (s) => s.delete(k));

const withTimeout = (p, ms, msg) =>
  Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))]);

// ---------------------------------------------------------------- the store
// read(name) → Promise<doc | null>; write(name, doc); remove(name). The demo passes its own storage.
export function createPhotoStore({ read, write, remove }) {
  const mem = new Map(); // `${kind}:${id}:${stamp}` → data URL
  const inflight = new Map();
  const queue = [];
  let active = 0;
  const MAX = 4;
  const pump = () => {
    while (active < MAX && queue.length) {
      const job = queue.shift();
      active++;
      job().finally(() => {
        active--;
        pump();
      });
    }
  };
  const key = (kind, id, stamp) => `${kind}:${id}:${stamp}`;
  return {
    // What's already in memory (no waiting): the URL, or undefined.
    peek(kind, id, stamp) {
      return stamp ? mem.get(key(kind, id, stamp)) : undefined;
    },
    // The photo's data URL, or null if it has none (or it couldn't load).
    get(kind, id, stamp) {
      if (!id || !stamp) return Promise.resolve(null);
      const k = key(kind, id, stamp);
      if (mem.has(k)) return Promise.resolve(mem.get(k));
      if (inflight.has(k)) return inflight.get(k);
      const p = (async () => {
        const cached = await idbGet(k);
        if (typeof cached === 'string' && cached) {
          mem.set(k, cached);
          return cached;
        }
        const doc = await new Promise((resolve) => {
          queue.push(() =>
            Promise.resolve()
              .then(() => read(docName(kind, id, stamp)))
              .then(resolve, () => resolve(null))
          );
          pump();
        });
        const url = doc && typeof doc.url === 'string' ? doc.url : null;
        if (url) {
          mem.set(k, url);
          idbPut(k, url);
        }
        return url;
      })().finally(() => inflight.delete(k));
      inflight.set(k, p);
      return p;
    },
    // Save a new photo (both sizes) under its own stamp. Rejects if offline or if the save doesn't finish.
    async put(id, stamp, { card, full }) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You’re offline. Photos save when you’re connected.');
      const slow = 'Saving the photo is taking too long. Check your connection and try again.';
      await withTimeout(Promise.resolve(write(docName('card', id, stamp), { version: 1, url: card })), WRITE_TIMEOUT, slow);
      await withTimeout(Promise.resolve(write(docName('full', id, stamp), { version: 1, url: full || card })), WRITE_TIMEOUT, slow);
      for (const [kind, url] of [
        ['card', card],
        ['full', full || card],
      ]) {
        mem.set(key(kind, id, stamp), url);
        idbPut(key(kind, id, stamp), url);
      }
    },
    // Remove one photo (a recipe's old photo once the box has moved on, or a new one whose save didn't go through).
    async drop(id, stamp) {
      if (!id || !stamp) return;
      for (const kind of ['card', 'full']) {
        mem.delete(key(kind, id, stamp));
        idbDel(key(kind, id, stamp));
        try {
          await remove(docName(kind, id, stamp));
        } catch {
          /* already gone, or offline: the box doesn't point at it either way */
        }
      }
    },
  };
}

// ---------------------------------------------------------------- making photos from a picked file
function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => viaImg(file));
  }
  return viaImg(file);
}
function viaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file isn’t a photo this browser can open.'));
    };
    img.src = url;
  });
}
// Center-crop to 4:3 and encode at the given size.
function encode(img, size) {
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  let sx;
  let sy;
  let sw;
  let sh;
  if (iw / ih > 4 / 3) {
    sh = ih;
    sw = ih * (4 / 3);
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    sw = iw;
    sh = iw * (3 / 4);
    sx = 0;
    sy = (ih - sh) / 2;
  }
  const scale = Math.min(1, size.w / sw);
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  let q = size.q;
  let url = c.toDataURL('image/jpeg', q);
  while (url.length > 850000 && q > 0.35) {
    q -= 0.1;
    url = c.toDataURL('image/jpeg', q);
  }
  return url;
}
export async function photoFromFile(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Pick a photo (JPEG, PNG or HEIC).');
  const img = await loadImage(file);
  return { card: encode(img, CARD), full: encode(img, FULL) };
}
// Does a data URL decode as an image? (Import files are checked before anything is saved.)
export function decodes(url) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(true);
    const img = new Image();
    const t = setTimeout(() => resolve(false), 8000);
    img.onload = () => (clearTimeout(t), resolve(img.naturalWidth > 0));
    img.onerror = () => (clearTimeout(t), resolve(false));
    img.src = url;
  });
}
