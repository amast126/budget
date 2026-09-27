/**
 * Builds news.json for the dashboard's News tab. Runs in GitHub Actions about every 30 minutes
 * (.github/workflows/news.yml). No dependencies: Node 20+ has fetch built in.
 *
 *   Top stories  Google News' own top stories, each with the other outlets covering it
 *   US politics  AP and Reuters
 *   NYC politics THE CITY and Gothamist (their own feeds, kept to politics), City & State, Politico New York, amNY,
 *                Daily News; plus Mamdani coverage anywhere
 *   Long Island  Newsday, News12 Long Island, Patch, LI Herald, TBR News Media, Long Island Press
 *   Tech & AI    The Verge, Ars Technica, TechCrunch, Wired (their own feeds, with photos and summaries) plus an
 *                AI-focused search of the same sites and Reuters tech
 *   Markets      energy (nuclear, grid, clean power), quantum computing and robotics, from business and tech outlets
 *   Gaming       Polygon, GameSpot and VGC feeds, IGN, Kotaku, Eurogamer, plus the games you play
 *   Marvel       Marvel Studios news from the trades (for the Entertainment tab's Doomsday watch list)
 *   Pop culture  Variety and The Hollywood Reporter feeds, Vulture, Entertainment Weekly
 *   Music        Pitchfork and Billboard feeds, Stereogum, Rolling Stone music, Guitar World
 *   Reddit       top posts of the day on r/popular, and what's hot on your subreddits (score and comment counts
 *                when Reddit's JSON answers, otherwise its RSS)
 * Sources with `feed` are the outlet's own RSS/Atom feed; the rest are Google News RSS searches limited to those
 * sites. The newest stories that came without a photo get one (and a one-line summary) from the article's own
 * og:image / og:description tags, a few dozen per run, each tried once. A source's `tag` is shown on each of its
 * stories (Energy, Quantum, Robotics, Your games).
 *
 * Each source keeps its previous items when a fetch fails, and news.json lists every source with ok/count so a
 * broken feed URL is easy to spot. The file is only rewritten when something changed.
 * Run locally: node scripts/fetch-news.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'news.json');
const UA = 'Mozilla/5.0 (compatible; dashboard-news/1.1; +https://amast126.github.io/budget/)';

const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
const TOP = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
// Stories from the NYC outlets' own feeds are kept to city and state politics.
const NYC_POLITICS =
  /\b(Mamdani|mayor|mayoral|City Hall|City Council|council ?members?|Hochul|Albany|MTA|NYPD|police commissioner|rent|rents|housing|budget|elections?|primary|ballot|comptroller|public advocate|borough president|Lander|Adams|Cuomo|Sliwa|Stefanik|Blakeman|governor|legislat\w*|lawmakers?|DSA|ICE|migrants?|shelters?|chancellor|congestion pricing|subway|fares?|zoning|tenants?|landlords?|unions?|strike)\b/i;

// Edit these to change what shows in each News section. `outlet: true` shows the site's own name (The Verge,
// Variety...) instead of the source name, for searches that cover several sites.
const SECTIONS = {
  top: {
    keep: 40,
    maxAgeDays: 2,
    ranked: true, // Google's order, replaced each run (not merged by date)
    sources: { top: { name: 'Top stories', outlet: true, url: TOP, cluster: true } },
  },
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
  // Google News keeps only so many search terms, so each of these stays short (tested Sept 27, 2026). `intitle:` keeps
  // the theme searches to stories that are actually about the theme, not ones that mention it in passing.
  nyc: {
    keep: 60,
    maxAgeDays: 5,
    sources: {
      thecity: { name: 'THE CITY', feed: 'https://www.thecity.nyc/feed/', match: NYC_POLITICS },
      gothamist: { name: 'Gothamist', feed: 'https://gothamist.com/feed', match: NYC_POLITICS },
      nyc: {
        name: 'NYC',
        outlet: true,
        url: gnews('(site:gothamist.com OR site:thecity.nyc OR site:cityandstateny.com OR site:politico.com/news/new-york OR site:amny.com OR site:nydailynews.com) (Mamdani OR mayor OR "City Hall" OR "City Council" OR Hochul OR MTA OR NYPD OR rent) when:3d'),
      },
      mamdani: {
        name: 'Mamdani',
        outlet: true,
        url: gnews('intitle:Mamdani (site:nytimes.com OR site:politico.com OR site:gothamist.com OR site:thecity.nyc OR site:apnews.com OR site:reuters.com OR site:nydailynews.com OR site:amny.com) when:3d'),
      },
    },
  },
  li: {
    keep: 60,
    maxAgeDays: 4,
    sources: {
      li: {
        name: 'Long Island',
        outlet: true,
        url: gnews('(site:newsday.com OR site:patch.com OR site:news12.com OR site:liherald.com OR site:longislandpress.com OR site:tbrnewsmedia.com) ("Long Island" OR Suffolk OR Nassau OR Huntington OR "Dix Hills") when:3d'),
      },
      lipress: { name: 'Long Island Press', feed: 'https://www.longislandpress.com/feed/' },
    },
  },
  tech: {
    keep: 80,
    maxAgeDays: 3,
    sources: {
      verge: { name: 'The Verge', feed: 'https://www.theverge.com/rss/index.xml' },
      ars: { name: 'Ars Technica', feed: 'https://feeds.arstechnica.com/arstechnica/index' },
      techcrunch: { name: 'TechCrunch', feed: 'https://techcrunch.com/feed/' },
      wired: { name: 'Wired', feed: 'https://www.wired.com/feed/rss' },
      tech: { name: 'Tech', outlet: true, url: gnews('(site:theverge.com OR site:arstechnica.com OR site:techcrunch.com OR site:wired.com) when:1d') },
      ai: {
        name: 'AI',
        outlet: true,
        url: gnews('(OpenAI OR Anthropic OR ChatGPT OR Claude OR Gemini OR "artificial intelligence" OR "AI model" OR Nvidia) (site:theverge.com OR site:arstechnica.com OR site:techcrunch.com OR site:wired.com OR site:reuters.com/technology) when:2d'),
      },
    },
  },
  markets: {
    keep: 90,
    perSource: 30, // so one busy theme (The Quantum Insider posts a lot) can't crowd out the others
    maxAgeDays: 5,
    sources: {
      energy: {
        name: 'Energy',
        tag: 'Energy',
        outlet: true,
        url: gnews('(intitle:"nuclear power" OR intitle:reactor OR intitle:uranium OR intitle:grid OR intitle:fusion) (site:reuters.com OR site:cnbc.com OR site:bloomberg.com OR site:barrons.com OR site:marketwatch.com OR site:axios.com OR site:utilitydive.com OR site:canarymedia.com) when:3d'),
      },
      quantum: {
        name: 'Quantum',
        tag: 'Quantum',
        outlet: true,
        url: gnews('intitle:quantum -"First Quantum" (site:reuters.com OR site:cnbc.com OR site:bloomberg.com OR site:barrons.com OR site:axios.com OR site:thequantuminsider.com OR site:techcrunch.com) when:4d'),
      },
      robotics: {
        name: 'Robotics',
        tag: 'Robotics',
        outlet: true,
        url: gnews('(intitle:robot OR intitle:robots OR intitle:robotics OR intitle:humanoid OR intitle:robotaxi) (site:reuters.com OR site:cnbc.com OR site:bloomberg.com OR site:barrons.com OR site:techcrunch.com OR site:theverge.com OR site:therobotreport.com OR site:axios.com) when:3d'),
      },
    },
  },
  gaming: {
    keep: 70,
    maxAgeDays: 4,
    sources: {
      polygon: { name: 'Polygon', feed: 'https://www.polygon.com/rss/index.xml' },
      gamespot: { name: 'GameSpot', feed: 'https://www.gamespot.com/feeds/news/' },
      vgc: { name: 'VGC', feed: 'https://www.videogameschronicle.com/feed/' },
      games: { name: 'Gaming', outlet: true, url: gnews('(site:ign.com OR site:polygon.com OR site:kotaku.com OR site:gamespot.com OR site:videogameschronicle.com OR site:eurogamer.net) when:1d') },
      mygames: {
        name: 'Your games',
        tag: 'Your games',
        outlet: true,
        url: gnews('(intitle:"Black Ops" OR intitle:"Call of Duty" OR intitle:TFT OR intitle:"Pokemon Go" OR intitle:"GTA 6") (site:ign.com OR site:polygon.com OR site:kotaku.com OR site:gamespot.com OR site:charlieintel.com OR site:dexerto.com) when:3d'),
      },
    },
  },
  marvel: {
    keep: 50,
    maxAgeDays: 7,
    sources: {
      marvel: {
        name: 'Marvel',
        outlet: true,
        url: gnews('(intitle:Doomsday OR intitle:Marvel OR intitle:MCU OR intitle:Avengers OR intitle:"Spider-Man" OR intitle:VisionQuest) (site:variety.com OR site:hollywoodreporter.com OR site:deadline.com OR site:ign.com OR site:polygon.com OR site:theverge.com OR site:empireonline.com) when:4d'),
      },
    },
  },
  pop: {
    keep: 70,
    maxAgeDays: 3,
    sources: {
      variety: { name: 'Variety', feed: 'https://variety.com/feed/' },
      thr: { name: 'The Hollywood Reporter', feed: 'https://www.hollywoodreporter.com/feed/' },
      pop: { name: 'Pop culture', outlet: true, url: gnews('(site:variety.com OR site:hollywoodreporter.com OR site:vulture.com OR site:ew.com) when:1d') },
    },
  },
  music: {
    keep: 70,
    maxAgeDays: 4,
    sources: {
      pitchfork: { name: 'Pitchfork', feed: 'https://pitchfork.com/feed/feed-news/rss' },
      billboard: { name: 'Billboard', feed: 'https://www.billboard.com/feed/' },
      music: {
        name: 'Music',
        outlet: true,
        url: gnews('(site:pitchfork.com OR site:billboard.com OR site:stereogum.com OR site:rollingstone.com/music OR site:guitarworld.com) when:2d'),
      },
    },
  },
};
// Reddit listings: [subreddit, sort, time window, how many]. r/popular's top of the day, then your subreddits' hot posts.
const REDDIT = [
  ['popular', 'top', 'day', 25],
  ['GTA6', 'hot', null, 10],
  ['CODZombies', 'hot', null, 8],
  ['TeamfightTactics', 'hot', null, 8],
  ['nyc', 'hot', null, 8],
  ['longisland', 'hot', null, 8],
];
// How many of each section's newest photo-less stories get a photo and summary from the article page per run.
const ENRICH = { top: 12, politics: 4, nyc: 4, li: 4, tech: 3, markets: 3, gaming: 2, pop: 2, music: 2, marvel: 2 };
const ENRICH_MAX = 36;
const ENRICH_MS = 100000; // and no more than this long, so a slow run still finishes well inside the workflow's 5 minutes
const REDDIT_GAP = Number(process.env.NEWS_REDDIT_GAP_MS || 1200);
// Bump a section's number after changing its searches: stories kept from the old searches are dropped on the next run.
const SEARCH_VERSION = { nyc: 2, markets: 3, gaming: 2, marvel: 2 };
// Pages that aren't stories: sign-in pages, and the stock quotes, filings and profile pages that finance sites publish
// under news searches.
const NOT_NEWS = /(^(Log ?in|Sign ?in|Sign up|Subscribe)\b|\bSEC Filings\b|\bStock (Price|Quote)\b|\bProfile and Biography\b|\bPrice Data\b|\b(Annual|Quarterly) (Income Statement|Balance Sheet|Cash Flow)\b|^Restrict to |^[A-Z.]{1,6} \| .*\b(Profile|Filings)\b)/i;
export const KEYS = ['top', 'politics', 'nyc', 'li', 'tech', 'markets', 'gaming', 'marvel', 'pop', 'music', 'reddit'];

const nowISO = () => new Date().toISOString();
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { timeoutMs = 20000, accept = 'application/rss+xml, application/atom+xml, text/xml, */*' } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: ctl.signal });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return text;
  } finally {
    clearTimeout(t);
  }
}
// Just the <head> of a page (where og:image lives), without downloading the rest.
async function fetchHead(url, { timeoutMs = 15000, limit = 500000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, signal: ctl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!/html/i.test(res.headers.get('content-type') || 'text/html')) throw new Error('not a page');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let s = '';
    while (s.length < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      s += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(s)) break;
    }
    reader.cancel().catch(() => {});
    return { html: s, url: res.url || url };
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- text helpers
const NAMED = { nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', trade: '™', copy: '©', reg: '®', eacute: 'é', middot: '·', bull: '•', apos: "'", quot: '"', lt: '<', gt: '>' };
export const decode = (s = '') =>
  String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (NAMED[n.toLowerCase()] != null ? NAMED[n.toLowerCase()] : m));
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decode(m[1]).trim() : '';
};
const attr = (xml, name, a) => {
  const m = xml.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]*)"`, 'i'));
  return m ? decode(m[1]) : '';
};
const attrs = (s) => Object.fromEntries([...String(s).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1].toLowerCase(), m[2] != null ? m[2] : m[3]]));
const isoDate = (s) => {
  const d = new Date(s);
  return !s || isNaN(d) ? nowISO() : d.toISOString();
};
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
export const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const isGoogle = (u) => /^https:\/\/news\.google\.com\//.test(u || '');
const normTitle = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const stripSource = (title, source) => (source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title);

// One or two sentences of plain text from a feed's HTML description (no "The post … appeared first on …").
export function summarize(html, title = '') {
  let t = decode(
    String(html || '')
      .replace(/<(script|style|figure|figcaption|table)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*The post .{3,200} appeared first on .{2,80}$/i, '')
    .replace(/\s*(Continue reading|Read more|Read the full story|Keep reading|Read full article)\b.*$/i, '')
    .replace(/\s*\[(…|\.\.\.)\]\s*$/, '…')
    .trim();
  if (title && normTitle(t).startsWith(normTitle(title))) t = t.slice(title.length).replace(/^[\s:.–—-]+/, '');
  if (t.length < 30) return '';
  if (t.length <= 220) return t;
  const cut = t.slice(0, 220);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('.” '));
  return end > 60 ? cut.slice(0, end + 1).trim() : `${cut.replace(/\s+\S*$/, '').replace(/[,;:–—-]+$/, '')}…`;
}

const BAD_IMG = /(feedburner|feedsportal|pixel|gravatar|1x1|spacer|blank\.gif|doubleclick|\/stats?\.|tracking|emoji|\.svg(\?|$))/i;
// The story's photo from a feed item: media:content, then an enclosure, then the first <img> in its content,
// then media:thumbnail.
export function feedImage(x, ...htmls) {
  const found = [];
  for (const m of x.matchAll(/<(media:content|media:thumbnail|enclosure|link)\b([^>]*)>/gi)) {
    const kind = m[1].toLowerCase();
    const a = attrs(m[2]);
    const u = kind === 'link' ? (/enclosure/i.test(a.rel || '') ? a.href : '') : a.url;
    if (!u) continue;
    const type = String(a.type || a.medium || '').toLowerCase();
    const looksImage = /image/.test(type) || (!type && /\.(jpe?g|png|webp)(\?|$)/i.test(u));
    if (kind === 'media:thumbnail') found.push([3, u]);
    else if (looksImage) found.push([kind === 'media:content' ? 0 : 1, u]);
  }
  htmls.forEach((h) => {
    const m = String(h || '').match(/<img\b[^>]*?\bsrc=["']([^"']+)["']/i);
    if (m) found.push([2, m[1]]);
  });
  const ok = found.map(([r, u]) => [r, decode(u).trim()]).filter(([, u]) => /^https:\/\//.test(u) && !BAD_IMG.test(u));
  ok.sort((a, b) => a[0] - b[0]);
  return ok.length ? ok[0][1] : null;
}
function atomLink(x) {
  let alt = '';
  for (const m of x.matchAll(/<link\b([^>]*)>/gi)) {
    const a = attrs(m[1]);
    if (!a.href) continue;
    const rel = (a.rel || 'alternate').toLowerCase();
    if (rel === 'alternate') return decode(a.href);
    if (!alt && !/self|replies|edit|enclosure|related/.test(rel)) alt = decode(a.href);
  }
  return alt;
}

// ---------------------------------------------------------------- parsers
// An outlet's own RSS or Atom feed.
export function parseFeed(xml, key, { name, max = 30, match, tag: label }) {
  const atom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const parts = xml.split(atom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  return parts
    .slice(0, max)
    .map((raw) => {
      const x = raw.split(atom ? /<\/entry>/i : /<\/item>/i)[0];
      const title = decode(tag(x, 'title').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      const guid = tag(x, 'guid') || tag(x, 'id');
      const link = atom ? atomLink(x) : tag(x, 'link') || attr(x, 'link', 'href') || (/^https?:\/\//.test(guid) ? guid : '');
      const body = tag(x, 'content:encoded') || tag(x, 'content');
      const desc = tag(x, 'description') || tag(x, 'summary') || tag(x, 'media:description');
      const item = {
        id: `${key}-${hash(guid || link)}`,
        title,
        url: link.trim(),
        date: isoDate(tag(x, 'pubDate') || tag(x, 'published') || tag(x, 'updated') || tag(x, 'dc:date')),
        source: name,
        domain: hostOf(link),
      };
      const image = feedImage(x, body, desc);
      if (image) item.image = image;
      const summary = summarize(desc, title) || summarize(body, title);
      if (summary) item.summary = summary;
      if (label) item.tag = label;
      return item;
    })
    .filter((i) => i.title && /^https?:\/\//.test(i.url) && !NOT_NEWS.test(i.title) && (!match || match.test(`${i.title} ${i.summary || ''}`)));
}

// Other outlets' versions of a top story, from the list Google News puts in its description.
export function relatedFrom(html, title) {
  const out = [];
  for (const m of String(html || '').matchAll(/<li>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:&nbsp;|\s)*<font[^>]*>([\s\S]*?)<\/font>/g)) {
    const t = decode(m[2]).trim();
    if (normTitle(t) === normTitle(title)) continue;
    out.push({ title: t, url: decode(m[1]), source: decode(m[3]).trim() });
  }
  return out.slice(0, 6);
}

// A Google News RSS feed (a search, or the top stories).
export function parseGoogleNews(xml, key, { name, outlet, tag: label, cluster }) {
  return xml
    .split('<item>')
    .slice(1)
    .map((x) => {
      const source = tag(x, 'source') || name;
      const title = stripSource(tag(x, 'title'), source);
      const link = tag(x, 'link');
      const item = { id: `${key}-${hash(tag(x, 'guid') || link)}`, title, url: link, date: isoDate(tag(x, 'pubDate')), source: outlet ? source : name, domain: hostOf(attr(x, 'source', 'url')) };
      if (label) item.tag = label;
      if (cluster) {
        const rel = relatedFrom(tag(x, 'description'), title);
        if (rel.length) item.related = rel;
      }
      return item;
    })
    .filter((i) => i.title && i.url && !NOT_NEWS.test(i.title));
}

const redditId = (name) => `rd-${hash(name)}`;
// A subreddit listing as JSON (with scores and comment counts).
export function parseRedditJSON(j, from) {
  const kids = (j && j.data && Array.isArray(j.data.children) ? j.data.children : []).map((c) => c && c.data).filter(Boolean);
  return kids
    .filter((d) => d.title && d.permalink && !d.over_18 && !d.stickied)
    .map((d) => {
      const prev = d.preview && d.preview.images && d.preview.images[0];
      let image = null;
      if (prev) {
        const r = (prev.resolutions || []).find((x) => x.width >= 320) || prev.source;
        image = r && r.url ? decode(r.url) : null;
      }
      if (!image && /^https:\/\//.test(d.thumbnail || '')) image = d.thumbnail;
      return {
        id: redditId(d.name || d.permalink),
        title: decode(d.title),
        url: `https://www.reddit.com${d.permalink}`,
        date: new Date((Number(d.created_utc) || Date.now() / 1000) * 1000).toISOString(),
        source: d.subreddit_name_prefixed || `r/${d.subreddit}`,
        from,
        score: Number(d.score) || 0,
        comments: Number(d.num_comments) || 0,
        image: image && /^https:\/\//.test(image) ? image : null,
      };
    });
}
// The same listing as RSS (no scores), for when Reddit turns the JSON away.
export function parseRedditRSS(xml, from) {
  return xml
    .split('<entry>')
    .slice(1)
    .map((e) => {
      const sub = attr(e, 'category', 'label') || (attr(e, 'category', 'term') ? `r/${attr(e, 'category', 'term')}` : 'Reddit');
      const content = tag(e, 'content');
      const thumb = attr(e, 'media:thumbnail', 'url') || (content.match(/<img src="([^"]+)"/) || [])[1] || null;
      return {
        id: redditId(tag(e, 'id') || attr(e, 'link', 'href')),
        title: tag(e, 'title'),
        url: attr(e, 'link', 'href'),
        date: isoDate(tag(e, 'published') || tag(e, 'updated')),
        source: sub,
        from,
        image: thumb && /^https:\/\//.test(thumb) ? decode(thumb) : null,
      };
    })
    .filter((i) => i.title && i.url);
}

// The photo and description a page gives link previews (og:image, twitter:image, og:description).
export function ogFrom(html, base) {
  const head = String(html || '').split(/<\/head>/i)[0];
  const meta = {};
  for (const m of head.matchAll(/<meta\b([^>]*)>/gi)) {
    const a = attrs(m[1]);
    const k = String(a.property || a.name || a.itemprop || '').toLowerCase();
    if (k && a.content && !(k in meta)) meta[k] = decode(a.content).trim();
  }
  let image = meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || '';
  try {
    image = image ? new URL(image, base).href : '';
  } catch {
    image = '';
  }
  if (!/^https:\/\//.test(image) || BAD_IMG.test(image)) image = '';
  return { image: image || null, summary: summarize(meta['og:description'] || meta['twitter:description'] || meta.description || '') };
}

// Google News links are redirects; this asks Google for the article's real address (the same call its page makes).
async function decodeGoogle(url) {
  const id = (String(url).match(/\/articles\/([^?/]+)/) || [])[1];
  if (!id) return null;
  const page = await fetchText(`https://news.google.com/rss/articles/${id}`, { timeoutMs: 20000, accept: 'text/html' });
  const sg = (page.match(/data-n-a-sg="([^"]+)"/) || [])[1];
  const ts = (page.match(/data-n-a-ts="([^"]+)"/) || [])[1];
  if (!sg || !ts) return null;
  const req = [[['Fbv4je', JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sg]), null, 'generic']]];
  const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': UA },
    body: `f.req=${encodeURIComponent(JSON.stringify(req))}`,
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const u = JSON.parse(JSON.parse(text.split('\n\n')[1])[0][2])[1];
  return /^https?:\/\//.test(u) ? u : null;
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- merging
// A story seen before keeps what was learned about it (its photo, summary, real address, when it first showed up).
function carry(old, fresh) {
  const o = { ...fresh };
  for (const k of ['image', 'summary', 'tried', 'seen']) if (old[k] != null && o[k] == null) o[k] = old[k];
  if (old.direct) {
    o.url = old.url;
    o.direct = 1;
    if (old.domain) o.domain = old.domain;
  }
  return o;
}
const richness = (i) => (i.image ? 4 : 0) + (i.summary ? 2 : 0) + (isGoogle(i.url) ? 0 : 1);
// Merge fresh items into a section's list: newest first, no repeats (the same story from an outlet's feed and a
// search keeps the richer copy), trimmed. `seen` is when the story first showed up here ("since you last looked").
export function merge(old, fresh, { keep, maxAgeDays, perSource, ranked }, checked = nowISO()) {
  const cutoff = new Date(Date.parse(checked) - maxAgeDays * 86400000).toISOString();
  const byId = new Map((old || []).map((i) => [i.id, i]));
  if (ranked) {
    // replaced by the new list in its own order; details carried over from last time
    return fresh
      .map((f) => (byId.has(f.id) ? carry(byId.get(f.id), f) : { ...f, seen: checked }))
      .filter((i, n, a) => a.findIndex((x) => normTitle(x.title) === normTitle(i.title)) === n)
      .slice(0, keep);
  }
  for (const f of fresh) byId.set(f.id, byId.has(f.id) ? carry(byId.get(f.id), f) : { ...f, seen: checked });
  const best = new Map();
  for (const i of byId.values()) {
    if (i.date < cutoff || NOT_NEWS.test(i.title)) continue;
    const k = normTitle(i.title).slice(0, 90);
    const b = best.get(k);
    if (!b) best.set(k, i);
    else {
      const [win, lose] = richness(i) > richness(b) || (richness(i) === richness(b) && i.date > b.date) ? [i, b] : [b, i];
      const seen = [win.seen, lose.seen].filter(Boolean).sort()[0];
      best.set(k, seen ? { ...win, seen } : win);
    }
  }
  const per = new Map();
  return [...best.values()]
    .sort(byDateDesc)
    .filter((i) => {
      if (!perSource) return true;
      const src = i.id.split('-')[0];
      per.set(src, (per.get(src) || 0) + 1);
      return per.get(src) <= perSource;
    })
    .slice(0, keep);
}

// Run tasks a few at a time.
async function pool(tasks, n) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    })
  );
  return out;
}

// Photos and summaries for the newest stories that came without one, from the article pages.
async function enrich(out, checked) {
  const todo = [];
  for (const [sec, n] of Object.entries(ENRICH)) {
    (out[sec] || [])
      .slice(0, sec === 'top' ? 16 : 8)
      .filter((i) => !i.image && !i.tried)
      .slice(0, n)
      .forEach((i) => todo.push(i));
  }
  const list = todo.slice(0, ENRICH_MAX);
  let googleOk = true;
  const st = { tried: 0, decoded: 0, images: 0, checked };
  const until = Date.now() + ENRICH_MS;
  await pool(
    list.map((i) => async () => {
      if (Date.now() > until) return; // out of time: the rest wait for the next run
      try {
        if (isGoogle(i.url)) {
          if (!googleOk) return;
          let real = null;
          try {
            real = await decodeGoogle(i.url);
          } catch (e) {
            if (e.status === 429 || e.status === 403 || e.status === 503) {
              googleOk = false; // Google wants a break: leave the rest for the next run
              return;
            }
          }
          if (!real) {
            i.tried = 1;
            return;
          }
          i.url = real;
          i.direct = 1;
          i.domain = i.domain || hostOf(real);
          st.decoded++;
        }
        st.tried++;
        i.tried = 1;
        const page = await fetchHead(i.url);
        const og = ogFrom(page.html, page.url);
        if (og.image) {
          i.image = og.image;
          st.images++;
        }
        if (og.summary && !i.summary) i.summary = og.summary;
      } catch {
        i.tried = 1;
      }
    }),
    3
  );
  if (!googleOk) st.paused = true;
  return st;
}

async function getSource(key, src) {
  if (src.feed) return parseFeed(await fetchText(src.feed), key, src);
  return parseGoogleNews(await fetchText(src.url), key, src);
}

async function getReddit([sub, sort, t, n]) {
  const q = `limit=${n}${t ? `&t=${t}` : ''}`;
  try {
    const j = JSON.parse(await fetchText(`https://www.reddit.com/r/${sub}/${sort}.json?${q}&raw_json=1`, { timeoutMs: 20000, accept: 'application/json' }));
    const items = parseRedditJSON(j, sub);
    if (items.length) return { items, via: 'json' };
  } catch {
    /* Reddit often turns cloud servers away from the JSON; the RSS usually still answers */
  }
  return { items: parseRedditRSS(await fetchText(`https://www.reddit.com/r/${sub}/${sort}/.rss?${q}`, { timeoutMs: 20000 }), sub), via: 'rss' };
}

export async function main(file = OUT) {
  const prev = readJSON(file) || {};
  const before = JSON.stringify(KEYS.map((k) => prev[k] || [])); // (items are updated in place below)
  const checked = nowISO();
  const sources = { ...(prev.sources || {}) };
  const out = {};

  const jobs = [];
  for (const [section, cfg] of Object.entries(SECTIONS)) for (const [key, src] of Object.entries(cfg.sources)) jobs.push({ section, key, src });
  const results = await pool(
    jobs.map(({ section, key, src }) => async () => {
      try {
        const items = await getSource(key, src);
        sources[key] = { ok: true, count: items.length, checked, section, kind: src.feed ? 'feed' : 'google', name: src.name, ...(src.feed ? { url: src.feed } : {}) };
        log(`${section}/${src.name}: ${items.length}`);
        return items;
      } catch (e) {
        sources[key] = { ...(sources[key] || {}), ok: false, error: String(e.message || e).slice(0, 100), checked, section, kind: src.feed ? 'feed' : 'google', name: src.name, ...(src.feed ? { url: src.feed } : {}) };
        log(`${section}/${src.name} FAILED: ${e.message}`);
        return null;
      }
    }),
    4
  );
  for (const [section, cfg] of Object.entries(SECTIONS)) {
    const fresh = jobs.flatMap((j, i) => (j.section === section && results[i] ? results[i] : []));
    const kept = ((prev.searchVersion || {})[section] || 1) === (SEARCH_VERSION[section] || 1) ? prev[section] || [] : [];
    out[section] = fresh.length ? merge(kept, fresh, cfg, checked) : kept;
  }

  // Reddit: each listing replaces its own last copy; one that fails keeps its last copy.
  const oldReddit = (prev.reddit || []).map((i) => (i.from ? i : { ...i, from: 'popular' }));
  const oldById = new Map(oldReddit.map((i) => [i.id, i]));
  out.reddit = [];
  for (const listing of REDDIT) {
    const sub = listing[0];
    const skey = sub === 'popular' ? 'reddit' : `reddit-${sub}`;
    try {
      const { items, via } = await getReddit(listing);
      if (!items.length) throw new Error('empty');
      out.reddit.push(...items.map((i) => ({ ...i, seen: (oldById.get(i.id) || {}).seen || checked })));
      sources[skey] = { ok: true, count: items.length, checked, section: 'reddit', kind: 'reddit', name: `r/${sub}`, via };
      log(`Reddit r/${sub} (${via}): ${items.length}`);
    } catch (e) {
      out.reddit.push(...oldReddit.filter((i) => i.from === sub));
      sources[skey] = { ...(sources[skey] || {}), ok: false, error: String(e.message || e).slice(0, 100), checked, section: 'reddit', kind: 'reddit', name: `r/${sub}` };
      log(`Reddit r/${sub} FAILED: ${e.message}`);
    }
    await sleep(REDDIT_GAP); // Reddit asks for no more than about one request a second
  }

  const st = await enrich(out, checked);
  sources.photos = { ok: !st.paused, count: st.images, checked, kind: 'enrich', decoded: st.decoded, tried: st.tried };
  log(`Photos: ${st.images} of ${st.tried} pages (${st.decoded} Google links resolved)${st.paused ? ', Google asked to slow down' : ''}`);

  const itemsChanged = before !== JSON.stringify(KEYS.map((k) => out[k] || []));
  const okChanged = JSON.stringify(Object.entries(prev.sources || {}).map(([k, v]) => [k, v.ok])) !== JSON.stringify(Object.entries(sources).map(([k, v]) => [k, v.ok]));
  if (itemsChanged || okChanged) {
    fs.writeFileSync(file, JSON.stringify({ generated: checked, searchVersion: SEARCH_VERSION, sources, ...Object.fromEntries(KEYS.map((k) => [k, out[k] || []])) }, null, 1) + '\n');
    log(`Wrote news.json: ${KEYS.map((k) => `${(out[k] || []).length} ${k}`).join(', ')}`);
  } else {
    log('No changes');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error('fetch-news failed:', e);
    process.exitCode = 1; // the last good news.json stays in place
  });
}
