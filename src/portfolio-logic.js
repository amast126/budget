// Pure helpers for the portfolio: the holdings from the budget, and what each company is called in headlines.
// Shared by the Home portfolio card and the News tab's For you (both run on this device only).

export function holdingsOf(data) {
  const hs = (data && data.portfolio && Array.isArray(data.portfolio.holdings) ? data.portfolio.holdings : []).filter((h) => h && String(h.ticker || '').trim());
  const by = new Map();
  hs.forEach((h) => {
    const t = String(h.ticker).trim().toUpperCase();
    const cur = by.get(t) || { ticker: t, shares: 0, basis: 0 };
    cur.shares += Number(h.shares) || 0;
    cur.basis += Number(h.basis) || 0;
    by.set(t, cur);
  });
  return [...by.values()];
}

// What a ticker is called in headlines: the ticker itself, the company's name without "Inc", "Corp" and the like,
// and a distinctive first word ("Constellation", "Alphabet"). From Finnhub's company profile, cached for a week;
// funds have no profile, so only their ticker counts.
const ALIASES = { alphabet: ['Google'], 'meta platforms': ['Meta', 'Facebook'] };
export function namesFor(ticker, profileName) {
  const out = [ticker];
  const clean = String(profileName || '')
    .replace(/\.com\b/gi, '')
    .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|plc|holdings?|group|class [a-c]|sa|nv|ag)\b\.?/gi, '')
    .replace(/[,.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean) {
    out.push(clean);
    const first = clean.split(' ')[0];
    if (first.length >= 5 && first.toLowerCase() !== clean.toLowerCase()) out.push(first);
    (ALIASES[clean.toLowerCase()] || ALIASES[first.toLowerCase()] || []).forEach((a) => out.push(a));
  }
  return [...new Set(out)];
}
export function mentions(text, names) {
  return names.some((n) => new RegExp(`(^|[^A-Za-z0-9$])\\$?${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`, 'i').test(text || ''));
}
