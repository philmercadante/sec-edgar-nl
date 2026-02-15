import { RateLimiter } from './rate-limiter.js';
import { getCached, setCache } from './cache.js';
import type { CompanyFacts, SecFact } from './types.js';

/**
 * SEC EDGAR API client.
 *
 * Uses the free EDGAR APIs:
 * - data.sec.gov/api/xbrl/companyfacts/ for XBRL data
 * - efts.sec.gov/LATEST/search-index for ticker->CIK lookup
 *
 * Rate limited to 10 req/s per SEC fair access policy.
 */

const BASE_URL = 'https://data.sec.gov';
const USER_AGENT = process.env.SEC_USER_AGENT || 'sec-edgar-nl contact@sec-edgar-nl.dev';

const rateLimiter = new RateLimiter(10);

async function fetchWithRateLimit(url: string, cacheTtlHours: number = 24): Promise<string> {
  // Check cache first
  const cached = getCached(url);
  if (cached !== null) return cached;

  await rateLimiter.acquire();

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Not found: ${url}`);
    }
    if (response.status === 429) {
      // Rate limited — wait and retry once
      await new Promise(resolve => setTimeout(resolve, 2000));
      await rateLimiter.acquire();
      const retry = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      });
      if (!retry.ok) throw new Error(`SEC API error after retry: ${retry.status}`);
      const body = await retry.text();
      setCache(url, body, cacheTtlHours);
      return body;
    }
    throw new Error(`SEC API error: ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  setCache(url, body, cacheTtlHours);
  return body;
}

/**
 * Fetch all XBRL facts for a company.
 * CIK must be zero-padded to 10 digits.
 */
export async function getCompanyFacts(cik: string): Promise<CompanyFacts> {
  const paddedCik = cik.padStart(10, '0');
  const url = `${BASE_URL}/api/xbrl/companyfacts/CIK${paddedCik}.json`;
  const body = await fetchWithRateLimit(url, 168); // Cache for 7 days — filings don't change often
  return JSON.parse(body) as CompanyFacts;
}

/**
 * Extract facts for a specific XBRL concept from company facts.
 */
export function extractFacts(
  companyFacts: CompanyFacts,
  taxonomy: string,
  concept: string,
  unit: string = 'USD'
): SecFact[] {
  const taxFacts = companyFacts.facts[taxonomy];
  if (!taxFacts) return [];

  const conceptFacts = taxFacts[concept];
  if (!conceptFacts) return [];

  return conceptFacts.units[unit] ?? [];
}
