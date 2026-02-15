import { getCached, setCache } from './cache.js';
import type { CikLookup } from './types.js';

/**
 * Company resolver: ticker or name -> CIK.
 *
 * Uses SEC's company tickers JSON endpoint which maps all tickers to CIKs.
 * This is cached aggressively since tickers rarely change.
 */

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const USER_AGENT = process.env.SEC_USER_AGENT || 'sec-edgar-nl contact@sec-edgar-nl.dev';

interface SecTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

let tickerMap: Map<string, CikLookup> | null = null;
let nameMap: Map<string, CikLookup> | null = null;

async function loadTickers(): Promise<void> {
  if (tickerMap && nameMap) return;

  let body = getCached(TICKERS_URL);
  if (!body) {
    const response = await fetch(TICKERS_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });
    if (!response.ok) throw new Error(`Failed to fetch tickers: ${response.status}`);
    body = await response.text();
    setCache(TICKERS_URL, body, 168); // 7 days
  }

  const data = JSON.parse(body) as Record<string, SecTickerEntry>;
  tickerMap = new Map();
  nameMap = new Map();

  for (const entry of Object.values(data)) {
    const lookup: CikLookup = {
      cik: String(entry.cik_str),
      ticker: entry.ticker.toUpperCase(),
      name: entry.title,
    };
    tickerMap.set(entry.ticker.toUpperCase(), lookup);
    nameMap.set(entry.title.toLowerCase(), lookup);
  }
}

/**
 * Resolve a company identifier (ticker or name) to CIK info.
 * Tries exact ticker match first, then fuzzy name match.
 */
export async function resolveCompany(query: string): Promise<CikLookup | null> {
  await loadTickers();

  // Exact ticker match
  const upper = query.toUpperCase().trim();
  const byTicker = tickerMap!.get(upper);
  if (byTicker) return byTicker;

  // Exact name match
  const lower = query.toLowerCase().trim();
  const byName = nameMap!.get(lower);
  if (byName) return byName;

  // Fuzzy name match — find names containing the query
  const matches: CikLookup[] = [];
  for (const [name, lookup] of nameMap!) {
    if (name.includes(lower)) {
      matches.push(lookup);
    }
  }

  // Common aliases
  const aliases: Record<string, string> = {
    'apple': 'AAPL',
    'microsoft': 'MSFT',
    'google': 'GOOGL',
    'alphabet': 'GOOGL',
    'amazon': 'AMZN',
    'tesla': 'TSLA',
    'meta': 'META',
    'facebook': 'META',
    'nvidia': 'NVDA',
    'netflix': 'NFLX',
  };

  const alias = aliases[lower];
  if (alias) {
    const byAlias = tickerMap!.get(alias);
    if (byAlias) return byAlias;
  }

  // Return first fuzzy match if only one, otherwise null (ambiguous)
  if (matches.length === 1) return matches[0];

  return null;
}
