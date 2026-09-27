// Birthdays: a list you can type or import (a .vcf exported from Contacts, or a .csv), what's coming up, and a
// calendar file with yearly reminders. Saved in trackers/<doc>-birthdays.
import { uid, todayISO } from './budget-logic.js';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function defaultBirthdays() {
  return { version: 1, people: [] };
}
const validMD = (m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(2024, m, 0).getDate(); // 2024: Feb 29 is fine
export function normalizeBirthdays(d) {
  if (!d || typeof d !== 'object') return defaultBirthdays();
  return {
    version: 1,
    people: Array.isArray(d.people) ? d.people.filter((p) => p && p.name && validMD(Number(p.m), Number(p.d))) : [],
    updatedAt: d.updatedAt,
  };
}

// ---------------------------------------------------------------- editing
export function addPerson(d, { name, m, d: day, y = null, note = '' }) {
  const n = String(name || '').trim();
  const mm = Number(m);
  const dd = Number(day);
  if (!n || !validMD(mm, dd)) return null;
  const yy = Number(y);
  const p = { id: uid(), name: n, m: mm, d: dd, y: yy > 1900 && yy <= new Date().getFullYear() ? yy : null, note: String(note || '').trim() };
  d.people.push(p);
  return p;
}
export function updatePerson(d, id, patch) {
  const p = d.people.find((x) => x.id === id);
  if (!p) return;
  const next = { ...p, ...patch };
  if (!String(next.name || '').trim() || !validMD(Number(next.m), Number(next.d))) return;
  Object.assign(p, { name: String(next.name).trim(), m: Number(next.m), d: Number(next.d), y: Number(next.y) > 1900 ? Number(next.y) : null, note: String(next.note || '').trim() });
}
export function removePerson(d, id) {
  const i = d.people.findIndex((x) => x.id === id);
  return i >= 0 ? { item: d.people.splice(i, 1)[0], index: i } : null;
}
export function restorePerson(d, item, index) {
  if (!d.people.some((x) => x.id === item.id)) d.people.splice(Math.min(index, d.people.length), 0, item);
}
// Add imported people; someone already on the list (same name) gets their date updated instead of a duplicate.
export function importPeople(d, list) {
  let added = 0;
  let updated = 0;
  let same = 0;
  list.forEach((x) => {
    if (!validMD(x.m, x.d)) return;
    const key = x.name.trim().toLowerCase();
    const p = d.people.find((q) => q.name.trim().toLowerCase() === key);
    if (!p) {
      if (addPerson(d, x)) added++;
    } else if (p.m !== x.m || p.d !== x.d || (x.y && p.y !== x.y)) {
      p.m = x.m;
      p.d = x.d;
      if (x.y) p.y = x.y;
      updated++;
    } else same++;
  });
  return { added, updated, same };
}

// ---------------------------------------------------------------- what's coming up
export function nextDate(p, today = todayISO()) {
  const [ty, tm, td] = today.split('-').map(Number);
  const make = (year) => {
    // Feb 29 birthdays land on Feb 28 in other years
    const day = p.m === 2 && p.d === 29 && new Date(year, 1, 29).getMonth() !== 1 ? 28 : p.d;
    return new Date(year, p.m - 1, day);
  };
  const t = new Date(ty, tm - 1, td);
  let n = make(ty);
  if (n < t) n = make(ty + 1);
  const days = Math.round((n - t) / 86400000);
  return { iso: isoOf(n), days, turning: p.y ? n.getFullYear() - p.y : null };
}
export function upcoming(d, today = todayISO(), within = 366) {
  return d.people
    .map((p) => ({ p, ...nextDate(p, today) }))
    .filter((x) => x.days <= within)
    .sort((a, b) => a.days - b.days || a.p.name.localeCompare(b.p.name));
}
export const whenLabel = (days) => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`);
export const dateText = (p) => `${MONTHS[p.m - 1].slice(0, 3)} ${p.d}`;
export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// ---------------------------------------------------------------- import
// vCard (Contacts → select all → File → Export vCard). BDAY comes as 1990-05-12, 19900512, --05-12 or --0512;
// Contacts writes birthdays without a year as 1604-05-12 (with X-APPLE-OMIT-YEAR).
export function parseVcf(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n'); // unfold
  const out = [];
  let cur = null;
  const unesc = (s) => s.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ').replace(/\\\\/g, '\\').trim();
  for (const raw of lines) {
    const line = raw.trim();
    if (/^BEGIN:VCARD/i.test(line)) cur = { fn: '', n: '', bday: '' };
    else if (/^END:VCARD/i.test(line)) {
      if (cur) {
        const name = cur.fn || cur.n;
        const b = parseBday(cur.bday);
        if (name && b) out.push({ name, ...b });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).toUpperCase();
      const val = line.slice(i + 1);
      const prop = key.replace(/^ITEM\d+\./, '').split(';')[0];
      if (prop === 'FN') cur.fn = unesc(val);
      else if (prop === 'N' && !cur.n) {
        const [last, first] = val.split(';').map(unesc);
        cur.n = [first, last].filter(Boolean).join(' ');
      } else if (prop === 'BDAY') cur.bday = val.trim();
    }
  }
  return out;
}
export function parseBday(s) {
  const v = String(s || '').trim();
  let m;
  if ((m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})/))) {
    const y = Number(m[1]);
    return validMD(Number(m[2]), Number(m[3])) ? { m: Number(m[2]), d: Number(m[3]), y: y > 1900 && y !== 1604 ? y : null } : null;
  }
  if ((m = v.match(/^--(\d{2})-?(\d{2})/))) return validMD(Number(m[1]), Number(m[2])) ? { m: Number(m[1]), d: Number(m[2]), y: null } : null;
  return null;
}
// CSV with a header row: a name column (Name, or First + Last) and a birthday column (Birthday, Birth date, DOB,
// Date). Dates like 1990-05-12, 5/12/1990, 5/12, May 12, 12 May 1990.
export function parseCsv(text) {
  const rows = csvRows(String(text || ''));
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...names) => head.findIndex((h) => names.some((n) => h === n || h.replace(/[^a-z]/g, '') === n.replace(/[^a-z]/g, '')));
  const iName = find('name', 'full name', 'display name');
  const iFirst = find('first', 'first name', 'given name');
  const iLast = find('last', 'last name', 'family name', 'surname');
  let iDate = find('birthday', 'birth date', 'birthdate', 'dob', 'date of birth', 'bday', 'date');
  if (iDate < 0) iDate = head.findIndex((h) => /birth|bday/.test(h));
  if (iDate < 0 || (iName < 0 && iFirst < 0)) return [];
  return rows
    .slice(1)
    .map((r) => {
      const name = iName >= 0 && r[iName] ? r[iName].trim() : [r[iFirst], iLast >= 0 ? r[iLast] : ''].map((x) => (x || '').trim()).filter(Boolean).join(' ');
      const b = parseDateText(r[iDate]);
      return name && b ? { name, ...b } : null;
    })
    .filter(Boolean);
}
function csvRows(text) {
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}
export function parseDateText(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  const iso = parseBday(v);
  if (iso) return iso;
  let m;
  if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) {
    let y = m[3] ? Number(m[3]) : null;
    if (y && y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000;
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    return validMD(mm, dd) ? { m: mm, d: dd, y: y > 1900 ? y : null } : null;
  }
  const mon = (w) => MONTHS.findIndex((x) => x.toLowerCase().startsWith(w.toLowerCase().slice(0, 3))) + 1;
  if ((m = v.match(/^([A-Za-z]{3,})\.? (\d{1,2})(?:st|nd|rd|th)?,? ?(\d{4})?$/))) {
    const mm = mon(m[1]);
    const dd = Number(m[2]);
    return mm && validMD(mm, dd) ? { m: mm, d: dd, y: m[3] ? Number(m[3]) : null } : null;
  }
  if ((m = v.match(/^(\d{1,2}) ([A-Za-z]{3,})\.?,? ?(\d{4})?$/))) {
    const mm = mon(m[2]);
    const dd = Number(m[1]);
    return mm && validMD(mm, dd) ? { m: mm, d: dd, y: m[3] ? Number(m[3]) : null } : null;
  }
  return null;
}

// ---------------------------------------------------------------- calendar file
// One all-day event per person, repeating every year, with a reminder at 9 AM the day before.
export function toIcs(d, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dashboard//Birthdays//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Birthdays'];
  d.people.forEach((p) => {
    const y = p.y || 2000;
    const start = `${y}${pad(p.m)}${pad(p.d)}`;
    const endD = new Date(y, p.m - 1, p.d + 1);
    const end = `${endD.getFullYear()}${pad(endD.getMonth() + 1)}${pad(endD.getDate())}`;
    out.push(
      'BEGIN:VEVENT',
      `UID:bday-${p.id}@dashboard`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `RRULE:FREQ=YEARLY${p.m === 2 && p.d === 29 ? ';BYMONTH=2;BYMONTHDAY=-1' : ''}`,
      `SUMMARY:${esc(`${p.name}’s birthday`)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`${p.name}’s birthday is tomorrow`)}`,
      'TRIGGER:-PT15H',
      'END:VALARM',
      'END:VEVENT'
    );
  });
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}
