// Phone alerts for the budget, run each morning by .github/workflows/budget-alerts.yml.
// Reads the budget document with a Firebase service account (the FIREBASE_SERVICE_ACCOUNT secret), works out what's
// due today (bills tomorrow, categories near or over budget, payday, roommates who haven't paid, the month's wrap-up)
// and posts each to your ntfy topic (Budget → Settings → Phone alerts). Each alert goes out once: what was sent is
// kept in trackers/<doc>-alerts. The Actions log is public, so it only ever prints counts, never amounts or names.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { computeAlerts } from '../src/budget-insights.js';
import { normalizeBudget } from '../src/budget-core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TZ = 'America/New_York';
const KEEP_DAYS = 90; // forget sent keys after this long

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
export const localDay = (now, tz = TZ) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

// The doc id from config.js (the same file the site loads), unless BUDGET_DOC is set.
export function readConfig(root = path.join(HERE, '..')) {
  try {
    const ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), ctx);
    return ctx.window.BUDGET_CONFIG || {};
  } catch {
    return {};
  }
}

// A Google OAuth token from the service account key (a signed JWT, exchanged at the token endpoint).
export async function accessToken(sa, fetchImpl, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key));
  const r = await fetchImpl(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${claims}.${sig}`,
  });
  if (!r.ok) throw new Error(`token endpoint returned ${r.status}`);
  const j = await r.json();
  if (!j.access_token) throw new Error('no access token in the response');
  return j.access_token;
}

const docUrl = (project, id) => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/trackers/${encodeURIComponent(id)}`;
// Documents are stored as { json: "<the data as a string>", updatedAt, client }, like the site writes them.
async function readDoc(fetchImpl, token, project, id) {
  const r = await fetchImpl(docUrl(project, id), { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`reading ${id.endsWith('-alerts') ? 'the alerts record' : 'the budget'} returned ${r.status}`);
  const j = await r.json();
  const s = j.fields && j.fields.json && j.fields.json.stringValue;
  return s ? JSON.parse(s) : null;
}
async function writeDoc(fetchImpl, token, project, id, data) {
  const now = Date.now();
  const r = await fetchImpl(docUrl(project, id), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify({ ...data, updatedAt: now }) }, updatedAt: { integerValue: String(now) }, client: { stringValue: 'alerts-job' } } }),
  });
  if (!r.ok) throw new Error(`saving the alerts record returned ${r.status}`);
}

// ntfy's JSON publishing (so titles can have any characters).
async function publish(fetchImpl, server, topic, a, click) {
  const body = { topic, title: a.title, message: a.body, tags: String(a.tags || '').split(',').filter(Boolean), priority: a.priority || 3 };
  if (click) body.click = click;
  const r = await fetchImpl(server, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.ok;
}

export async function run({ env = process.env, fetchImpl = globalThis.fetch, now = new Date(), log = console.log, root } = {}) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) {
    log('No FIREBASE_SERVICE_ACCOUNT secret yet, so there is nothing to check. See Budget → Settings → Phone alerts.');
    return { status: 'no-secret', due: 0, sent: 0 };
  }
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT isn’t valid JSON. Paste the whole key file as the secret.');
  }
  if (!sa.private_key || !sa.client_email) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing private_key or client_email.');
  const cfg = readConfig(root);
  const project = env.FIREBASE_PROJECT || sa.project_id || (cfg.firebase && cfg.firebase.projectId);
  const docId = env.BUDGET_DOC || cfg.sharedDocId;
  if (!project || !docId) throw new Error('Couldn’t tell which project or document to read (set BUDGET_DOC).');
  const token = await accessToken(sa, fetchImpl, now.getTime());
  const data = normalizeBudget(await readDoc(fetchImpl, token, project, docId));
  if (!data) throw new Error('The budget document is empty.');
  const prefs = (data.config && data.config.alerts) || {};
  if (!prefs.topic) {
    log('Alerts aren’t turned on yet (no ntfy topic in Budget → Settings → Phone alerts).');
    return { status: 'no-topic', due: 0, sent: 0 };
  }
  const today = localDay(now);
  const recordId = `${docId}-alerts`;
  const record = (await readDoc(fetchImpl, token, project, recordId)) || { version: 1, sent: {} };
  record.sent = record.sent || {};
  const due = computeAlerts(data, today, prefs, record.sent);
  const server = env.NTFY_SERVER || 'https://ntfy.sh';
  const click = env.DASH_URL || 'https://amast126.github.io/budget/#/budget';
  let sent = 0;
  let failed = 0;
  for (const a of due) {
    if (env.DRY_RUN) continue;
    const ok = await publish(fetchImpl, server, prefs.topic, a, click);
    if (ok) {
      record.sent[a.key] = today;
      sent++;
    } else failed++;
  }
  // forget old keys so the record stays small
  const cutoff = localDay(new Date(now.getTime() - KEEP_DAYS * 86400000));
  for (const [k, d] of Object.entries(record.sent)) if (d < cutoff) delete record.sent[k];
  record.lastRun = now.toISOString();
  record.lastDue = due.length;
  record.lastSent = sent;
  if (!env.DRY_RUN) await writeDoc(fetchImpl, token, project, recordId, record);
  log(`${due.length} ${due.length === 1 ? 'alert' : 'alerts'} due today, ${sent} sent${failed ? `, ${failed} failed` : ''}${env.DRY_RUN ? ' (dry run)' : ''}.`);
  return { status: failed ? 'partial' : 'ok', due: due.length, sent, failed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then(
    (r) => process.exit(r.status === 'partial' ? 1 : 0),
    (e) => {
      console.error(`Budget alerts stopped: ${e.message || e}`);
      process.exit(1);
    }
  );
}
