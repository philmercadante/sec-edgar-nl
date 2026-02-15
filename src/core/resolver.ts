import { getCached, setCache } from './cache.js';
import type { CikLookup } from './types.js';

/**
 * Company resolver: ticker or name -> CIK.
 *
 * Uses SEC's company tickers JSON endpoint which maps all tickers to CIKs.
 * This is cached aggressively since tickers rarely change.
 *
 * Resolution order:
 * 1. Exact ticker match (AAPL)
 * 2. Common aliases (Apple -> AAPL)
 * 3. Exact company name match
 * 4. Fuzzy name match (substring)
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

  let body: string | null = null;
  try {
    body = getCached(TICKERS_URL);
  } catch {
    // Cache read failed — proceed to fetch
  }

  if (!body) {
    const response = await fetch(TICKERS_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });
    if (!response.ok) throw new Error(`Failed to fetch company tickers from SEC (${response.status}). Check your network connection.`);
    body = await response.text();
    try {
      setCache(TICKERS_URL, body, 168); // 7 days
    } catch {
      // Cache write failed — non-fatal
    }
  }

  let data: Record<string, SecTickerEntry>;
  try {
    data = JSON.parse(body) as Record<string, SecTickerEntry>;
  } catch {
    throw new Error('Failed to parse SEC company tickers data. The response may be corrupted — try clearing the cache with: sec-edgar-nl cache --clear');
  }
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

// Common aliases: colloquial name -> ticker
const ALIASES: Record<string, string> = {
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
  'berkshire': 'BRK-B',
  'jpmorgan': 'JPM',
  'jp morgan': 'JPM',
  'johnson & johnson': 'JNJ',
  'j&j': 'JNJ',
  'disney': 'DIS',
  'walmart': 'WMT',
  'paypal': 'PYPL',
  'intel': 'INTC',
  'amd': 'AMD',
  'salesforce': 'CRM',
  'adobe': 'ADBE',
  'uber': 'UBER',
  'airbnb': 'ABNB',
  'snapchat': 'SNAP',
  'snap': 'SNAP',
  'spotify': 'SPOT',
  'twitter': 'X',
  'coinbase': 'COIN',
  'palantir': 'PLTR',
  'crowdstrike': 'CRWD',
  'snowflake': 'SNOW',
  'datadog': 'DDOG',
};

export interface ResolveResult {
  company: CikLookup | null;
  suggestions: CikLookup[];
}

/**
 * Resolve a company identifier (ticker or name) to CIK info.
 * Returns the match plus suggestions if ambiguous.
 */
export async function resolveCompany(query: string): Promise<CikLookup | null> {
  const result = await resolveCompanyWithSuggestions(query);
  return result.company;
}

/**
 * Resolve with full context — returns suggestions for ambiguous matches.
 */
export async function resolveCompanyWithSuggestions(query: string): Promise<ResolveResult> {
  await loadTickers();

  if (!tickerMap || !nameMap) {
    throw new Error('Failed to load company data from SEC. Check your network connection and try again.');
  }

  const upper = query.toUpperCase().trim();
  const lower = query.toLowerCase().trim();

  // 1. Exact ticker match
  const byTicker = tickerMap.get(upper);
  if (byTicker) return { company: byTicker, suggestions: [] };

  // 2. Common alias
  const alias = ALIASES[lower];
  if (alias) {
    const byAlias = tickerMap.get(alias);
    if (byAlias) return { company: byAlias, suggestions: [] };
  }

  // 3. Exact name match
  const byName = nameMap.get(lower);
  if (byName) return { company: byName, suggestions: [] };

  // 4. Fuzzy name match — find names containing the query
  const matches: CikLookup[] = [];
  for (const [name, lookup] of nameMap) {
    if (name.includes(lower)) {
      matches.push(lookup);
    }
  }

  if (matches.length === 1) {
    return { company: matches[0], suggestions: [] };
  }

  if (matches.length > 1) {
    // Return top 5 as suggestions, no auto-pick
    return { company: null, suggestions: matches.slice(0, 5) };
  }

  return { company: null, suggestions: [] };
}
