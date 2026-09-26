// Food lookups for the Health tab, called straight from the browser (both services allow it):
//   USDA FoodData Central  search generic and branded foods. DEMO_KEY works without signing up but allows about
//                          30 searches an hour and 50 a day; a free personal key (api.data.gov) raises that to 1,000 an hour.
//   Open Food Facts        barcode lookups for packaged foods.
// Nutrients come back per 100 g; portions come from USDA's household measures or the package's serving size.

const USDA = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const N = { k: [1008, 2047, 2048], p: [1003], c: [1005], f: [1004] };
const r1 = (n) => Math.round(Number(n || 0) * 10) / 10;
const cap = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const title = (s) => {
  const t = cap(s);
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s,(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : t;
};

function nutrientsFromUsda(list) {
  const get = (ids) => {
    for (const id of ids) {
      const n = (list || []).find((x) => x.nutrientId === id);
      if (n && n.value != null) return Number(n.value);
    }
    return null;
  };
  let k = get(N.k);
  const p = get(N.p) || 0;
  const c = get(N.c) || 0;
  const f = get(N.f) || 0;
  if (k == null) k = p * 4 + c * 4 + f * 9;
  return { k: Math.round(k), p: r1(p), c: r1(c), f: r1(f) };
}

export function foodFromUsda(x) {
  const portions = [];
  const seen = new Set();
  for (const m of x.foodMeasures || []) {
    const label = cap(m.disseminationText || m.modifier || '');
    if (!label || !m.gramWeight || /quantity not specified/i.test(label) || seen.has(label)) continue;
    seen.add(label);
    portions.push({ label, g: Number(m.gramWeight) });
  }
  if (x.servingSize && /^(g|grm|ml|mlt)$/i.test(x.servingSizeUnit || '')) {
    const hh = cap(x.householdServingFullText);
    portions.unshift({ label: hh ? `${hh} (${Math.round(x.servingSize)} g)` : `1 serving (${Math.round(x.servingSize)} g)`, g: Number(x.servingSize) });
  }
  portions.push({ label: '100 g', g: 100 });
  return {
    name: title(x.description),
    brand: x.brandName || x.brandOwner ? title(x.brandName || x.brandOwner) : undefined,
    src: 'usda',
    ref: String(x.fdcId),
    kind: x.dataType === 'Branded' ? 'branded' : 'generic',
    per100: nutrientsFromUsda(x.foodNutrients),
    portions,
  };
}

// Generic foods first (they're what "banana" or "chicken breast" usually means), then brands.
export async function searchUsda(query, key) {
  const res = await fetch(`${USDA}?api_key=${encodeURIComponent(key || 'DEMO_KEY')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query.trim(), pageSize: 30, dataType: ['Survey (FNDDS)', 'Foundation', 'SR Legacy', 'Branded'] }),
  });
  if (res.status === 429) throw Object.assign(new Error('USDA’s free search limit is used up for now. Try again in an hour, or add a free key in Targets & settings.'), { limit: true });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const j = await res.json();
  const rank = { 'Survey (FNDDS)': 0, Foundation: 1, 'SR Legacy': 2, Branded: 3 };
  const foods = (j.foods || []).map((x, i) => ({ x, i }));
  foods.sort((a, b) => (rank[a.x.dataType] ?? 4) - (rank[b.x.dataType] ?? 4) || a.i - b.i);
  const out = [];
  const names = new Set();
  for (const { x } of foods) {
    const f = foodFromUsda(x);
    const k = `${f.name}|${f.brand || ''}`.toLowerCase();
    if (names.has(k) || !f.per100) continue;
    names.add(k);
    out.push(f);
  }
  return out.slice(0, 25);
}

export function foodFromOff(code, p) {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : null);
  if (kcal == null) return null;
  const portions = [];
  const sq = Number(p.serving_quantity);
  if (sq > 0) portions.push({ label: cap(p.serving_size) ? `1 serving (${cap(p.serving_size)})` : `1 serving (${Math.round(sq)} g)`, g: sq });
  portions.push({ label: '100 g', g: 100 });
  return {
    name: title(p.product_name || p.generic_name || `Product ${code}`),
    brand: p.brands ? title(String(p.brands).split(',')[0]) : undefined,
    src: 'off',
    ref: String(code),
    kind: 'branded',
    per100: { k: Math.round(kcal), p: r1(n.proteins_100g), c: r1(n.carbohydrates_100g), f: r1(n.fat_100g) },
    portions,
  };
}

export async function lookupBarcode(code, key) {
  const clean = String(code).replace(/\D/g, '');
  if (clean.length < 8) throw new Error('That doesn’t look like a barcode number.');
  // A 12-digit UPC-A is the same code as the 13-digit EAN with a leading 0; Open Food Facts files most under the EAN.
  const tries = clean.length === 12 ? [`0${clean}`, clean] : [clean];
  for (const c of tries) {
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=product_name,generic_name,brands,nutriments,serving_size,serving_quantity`);
      if (r.ok) {
        const j = await r.json();
        const f = j && j.product ? foodFromOff(c, j.product) : null;
        if (f) return f;
      }
    } catch {
      /* try the next form, then USDA */
    }
  }
  // USDA's branded list has UPCs for most US groceries.
  const res = await fetch(`${USDA}?api_key=${encodeURIComponent(key || 'DEMO_KEY')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: clean.replace(/^0+/, ''), pageSize: 5, dataType: ['Branded'] }),
  });
  if (res.ok) {
    const j = await res.json();
    const hit = (j.foods || []).find((x) => String(x.gtinUpc || '').replace(/^0+/, '') === clean.replace(/^0+/, ''));
    if (hit) return foodFromUsda(hit);
  }
  throw new Error('No nutrition found for that barcode. Search for it by name instead.');
}

// ---------------------------------------------------------------- barcode scanning
// Chrome on Android has a built-in barcode reader; iPhone Safari doesn't, so we load ZXing (vendored in /vendor) on demand.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
let zxingPromise = null;
function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!zxingPromise) {
    zxingPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/zxing-0.23.0.min.js';
      s.onload = () => (window.ZXing ? resolve(window.ZXing) : reject(new Error('Scanner failed to load')));
      s.onerror = () => {
        zxingPromise = null;
        reject(new Error('Scanner failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return zxingPromise;
}
async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const ok = await window.BarcodeDetector.getSupportedFormats();
    const f = FORMATS.filter((x) => ok.includes(x));
    return f.length ? new window.BarcodeDetector({ formats: f }) : null;
  } catch {
    return null;
  }
}
function zxingReader(Z) {
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  return new Z.BrowserMultiFormatReader(hints);
}

// Live camera scanning into a <video>. Returns a stop() function.
export async function startScanner(video, onCode, onError) {
  const native = await nativeDetector();
  if (native) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) {
      onError(e);
      return () => {};
    }
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    await video.play().catch(() => {});
    let live = true;
    const tick = async () => {
      if (!live) return;
      try {
        const found = await native.detect(video);
        if (found && found[0] && found[0].rawValue) {
          live = false;
          stream.getTracks().forEach((t) => t.stop());
          return onCode(found[0].rawValue);
        }
      } catch {
        /* keep trying */
      }
      setTimeout(tick, 200);
    };
    tick();
    return () => {
      live = false;
      stream.getTracks().forEach((t) => t.stop());
    };
  }
  let reader;
  try {
    const Z = await loadZxing();
    reader = zxingReader(Z);
    video.setAttribute('playsinline', '');
    await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, (result) => {
      if (result) {
        reader.reset();
        onCode(result.getText());
      }
    });
  } catch (e) {
    onError(e);
  }
  return () => reader && reader.reset();
}

// Read a barcode from a photo (the fallback when live camera access isn't available).
export async function decodePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const native = await nativeDetector();
    if (native) {
      const bmp = await createImageBitmap(file);
      const found = await native.detect(bmp);
      if (found && found[0]) return found[0].rawValue;
    }
    const Z = await loadZxing();
    const res = await zxingReader(Z).decodeFromImageUrl(url);
    return res.getText();
  } catch {
    throw new Error('Couldn’t find a barcode in that photo. Get closer, keep it flat and well lit, or type the number.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
