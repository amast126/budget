/**
 * Builds news.json for the dashboard's News tab. Runs in GitHub Actions about every 30 minutes
 * (.github/workflows/news.yml). No dependencies: Node 20+ has fetch built in.
 *
 *   US politics  AP and Reuters
 *   Tech & AI    The Verge, Ars Technica, TechCrunch, Wired (plus an AI-focused search of the same sites and Reuters tech)
 *   Pop culture  Variety, The Hollywood Reporter, Vulture, Entertainment Weekly
 *   Music        Pitchfork, Billboard, Stereogum, Rolling Stone music, Guitar World
 *   Reddit       top posts of the day on r/popular (Reddit sometimes blocks GitHub; then the last good copy stays)
 * All but Reddit come from Google News RSS searches limited to those sites.
 *
 * Each source keeps its previous items when a fetch fails. The file is only rewritten when something changed.
 * Run locally: node scripts/fetch-news.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'news.json');
const UA = 'Mozilla/5.0 (compatible; dashboard-news/1.0; +https://amast126.github.io/budget/)';

const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
// Edit these to change what shows in each News section. `outlet: true` shows the site's own name (The Verge,
// Variety...) instead of the source name, for searches that cover several sites.
const SECTIONS = {
  politics: {
    keep: 90,
    maxAgeDays: 4,
    sources: {
      ap: {
        name: 'AP',
        url: gnews('site:apnews.com (Trump OR Congress OR Senate OR "House Republicans" OR "House Democrats" OR "Supreme Court" OR "White House" OR "Justice Department" OR midterms OR governor) when:2d'),
      },
      reuters: { name: 'Reuters', url: gnews('(site:reuters.com/world/us OR site:reuters.com/legal) when:2d') },
    },
  },
  tech: {
    keep: 60,
    maxAgeDays: 3,
    sources: {
      tech: { name: 'Tech', outlet: true, url: gnews('(site:theverge.com OR site:arstechnica.com OR site:techcrunch.com OR site:wired.com) when:1d') },
      ai: {
        name: 'AI',
        outlet: true,
        url: gnews('(OpenAI OR Anthropic OR ChatGPT OR Claude OR Gemini OR "artificial intelligence" OR "AI model" OR Nvidia) (site:theverge.com OR site:arstechnica.com OR site:techcrunch.com OR site:wired.com OR site:reuters.com/technology) when:2d'),
      },
    },
  },
  pop: {
    keep: 60,
    maxAgeDays: 3,
    sources: {
      pop: { name: 'Pop culture', outlet: true, url: gnews('(site:variety.com OR site:hollywoodreporter.com OR site:vulture.com OR site:ew.com) when:1d') },
    },
  },
  music: {
    keep: 60,
    maxAgeDays: 4,
    sources: {
      music: {
        name: 'Music',
        outlet: true,
        url: gnews('(site:pitchfork.com OR site:billboard.com OR site:stereogum.com OR site:rollingstone.com/music OR site:guitarworld.com) when:2d'),
      },
    },
  },
};
const REDDIT = 'https://www.reddit.com/r/popular/top/.rss?t=day&limit=25';

const nowISO = () => new Date().toISOString();
const log = (...a) => console.log(...a);

async function fetchText(url, timeoutMs = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' }, signal: ctl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}
const decode = (s = '') =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ');
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decode(m[1]).trim() : '';
};
const attr = (xml, name, a) => {
  const m = xml.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]*)"`, 'i'));
  return m ? decode(m[1]) : '';
};
const isoDate = (s) => {
  const d = new Date(s);
  return isNaN(d) ? nowISO() : d.toISOString();
};
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

async function getGoogleNews(key, { name, url, outlet }) {
  const xml = await fetchText(url);
  return xml
    .split('<item>')
    .slice(1)
    .map((x) => {
      const source = tag(x, 'source') || name;
      let title = tag(x, 'title');
      if (title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      const link = tag(x, 'link');
      return { id: `${key}-${hash(tag(x, 'guid') || link)}`, title, url: link, date: isoDate(tag(x, 'pubDate')), source: outlet ? source : name };
    })
    .filter((i) => i.title && i.url);
}

async function getReddit() {
  const xml = await fetchText(REDDIT, 20000);
  return xml
    .split('<entry>')
    .slice(1)
    .map((e) => {
      const sub = attr(e, 'category', 'label') || (attr(e, 'category', 'term') ? `r/${attr(e, 'category', 'term')}` : 'Reddit');
      const content = tag(e, 'content');
      const thumb = attr(e, 'media:thumbnail', 'url') || (content.match(/<img src="([^"]+)"/) || [])[1] || null;
      return {
        id: `rd-${hash(tag(e, 'id') || attr(e, 'link', 'href'))}`,
        title: tag(e, 'title'),
        url: attr(e, 'link', 'href'),
        date: isoDate(tag(e, 'published') || tag(e, 'updated')),
        source: sub,
        image: thumb && /^https:\/\//.test(thumb) ? thumb : null,
      };
    })
    .filter((i) => i.title && i.url);
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Merge fresh items into a section's list: newest first, no repeats (same story from two searches), trimmed.
function merge(old, fresh, { keep, maxAgeDays }) {
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
  const byId = new Map();
  for (const i of [...old, ...fresh]) byId.set(i.id, i);
  const seen = new Set();
  return [...byId.values()]
    .filter((i) => i.date >= cutoff)
    .sort(byDateDesc)
    .filter((i) => {
      const k = normTitle(i.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, keep);
}

async function main() {
  const prev = readJSON(OUT) || {};
  const checked = nowISO();
  const sources = { ...(prev.sources || {}) };
  const out = { reddit: prev.reddit || [] };

  for (const [section, cfg] of Object.entries(SECTIONS)) {
    const fresh = [];
    for (const [key, src] of Object.entries(cfg.sources)) {
      try {
        const items = await getGoogleNews(key, src);
        fresh.push(...items);
        sources[key] = { ok: true, count: items.length, checked };
        log(`${section}/${src.name}: ${items.length}`);
      } catch (e) {
        sources[key] = { ...(sources[key] || {}), ok: false, error: String(e.message || e).slice(0, 100), checked };
        log(`${section}/${src.name} FAILED: ${e.message}`);
      }
    }
    out[section] = fresh.length ? merge(prev[section] || [], fresh, cfg) : prev[section] || [];
  }

  try {
    const items = await getReddit();
    if (items.length) out.reddit = items; // today's top list replaces yesterday's
    sources.reddit = { ok: true, count: items.length, checked };
    log(`Reddit: ${items.length}`);
  } catch (e) {
    sources.reddit = { ...(sources.reddit || {}), ok: false, error: String(e.message || e).slice(0, 100), checked };
    log(`Reddit FAILED: ${e.message}`);
  }

  const keys = ['politics', 'tech', 'pop', 'music', 'reddit'];
  const itemsChanged = keys.some((k) => JSON.stringify(prev[k] || []) !== JSON.stringify(out[k] || []));
  const okChanged = JSON.stringify(Object.entries(prev.sources || {}).map(([k, v]) => [k, v.ok])) !== JSON.stringify(Object.entries(sources).map(([k, v]) => [k, v.ok]));
  if (itemsChanged || okChanged) {
    fs.writeFileSync(OUT, JSON.stringify({ generated: checked, sources, ...Object.fromEntries(keys.map((k) => [k, out[k] || []])) }, null, 1) + '\n');
    log(`Wrote news.json: ${keys.map((k) => `${(out[k] || []).length} ${k}`).join(', ')}`);
  } else {
    log('No changes');
  }
}

main().catch((e) => {
  console.error('fetch-news failed:', e);
  process.exitCode = 1; // the last good news.json stays in place
});
