import { RateLimiter } from './rate-limiter.js';
import { getCached, setCache } from './cache.js';
import { SecApiError, NotFoundError, RateLimitError, DataParseError } from './errors.js';
import type { CompanyFacts, SecFact } from './types.js';

/**
 * SEC EDGAR API client.
 *
 * Uses the free EDGAR APIs:
 * - data.sec.gov/api/xbrl/companyfacts/ for XBRL data
 *
 * Rate limited to 10 req/s per SEC fair access policy.
 * Implements exponential backoff for 429 responses.
 */

const BASE_URL = 'https://data.sec.gov';
const USER_AGENT = process.env.SEC_USER_AGENT || 'sec-edgar-nl contact@sec-edgar-nl.dev';
const MAX_RETRIES = 3;

const rateLimiter = new RateLimiter(10);

async function fetchWithRateLimit(url: string, cacheTtlHours: number = 24): Promise<string> {
  // Check cache first (with error resilience)
  try {
    const cached = getCached(url);
    if (cached !== null) return cached;
  } catch {
    // Cache read failed (corruption, locked) — proceed without cache
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await rateLimiter.acquire();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
        },
      });
    } catch (err) {
      lastError = new SecApiError(
        `Network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`,
        0,
        url
      );
      // Network error — retry with backoff
      await sleep(backoffMs(attempt));
      continue;
    }

    if (response.ok) {
      const body = await response.text();
      try {
        setCache(url, body, cacheTtlHours);
      } catch {
        // Cache write failed — non-fatal, continue
      }
      return body;
    }

    if (response.status === 404) {
      throw new NotFoundError(url);
    }

    if (response.status === 429) {
      lastError = new RateLimitError(url);
      await sleep(backoffMs(attempt));
      continue;
    }

    if (response.status === 403) {
      throw new SecApiError(
        'SEC API rejected request (403 Forbidden). Check your SEC_USER_AGENT environment variable — SEC requires a valid User-Agent with contact info.',
        403,
        url
      );
    }

    if (response.status >= 500) {
      lastError = new SecApiError(
        `SEC server error: ${response.status}`,
        response.status,
        url
      );
      await sleep(backoffMs(attempt));
      continue;
    }

    throw new SecApiError(
      `SEC API error: ${response.status} ${response.statusText}`,
      response.status,
      url
    );
  }

  throw lastError ?? new SecApiError(`Failed after ${MAX_RETRIES} retries`, 0, url);
}

/** Exponential backoff with jitter: 1s, 2s, 4s */
function backoffMs(attempt: number): number {
  const base = 1000 * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch all XBRL facts for a company.
 * CIK must be zero-padded to 10 digits.
 */
export async function getCompanyFacts(cik: string): Promise<CompanyFacts> {
  const paddedCik = cik.padStart(10, '0');
  const url = `${BASE_URL}/api/xbrl/companyfacts/CIK${paddedCik}.json`;
  const body = await fetchWithRateLimit(url, 168); // Cache for 7 days

  try {
    return JSON.parse(body) as CompanyFacts;
  } catch {
    throw new DataParseError(
      `Failed to parse SEC response for CIK ${cik}. The data may be corrupted or the API format may have changed.`,
      url
    );
  }
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

/** Shape of the SEC submissions API response */
export interface CompanySubmissions {
  cik: string;
  entityType: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  sic: string;
  sicDescription: string;
  stateOfIncorporation: string;
  fiscalYearEnd: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
    files: Array<{ name: string; filingCount: number }>;
  };
}

/**
 * Fetch company submissions (filing history) from SEC EDGAR.
 * Returns the list of all recent filings for a company.
 */
export async function getCompanySubmissions(cik: string): Promise<CompanySubmissions> {
  const paddedCik = cik.padStart(10, '0');
  const url = `${BASE_URL}/submissions/CIK${paddedCik}.json`;
  const body = await fetchWithRateLimit(url, 24); // Cache for 1 day

  try {
    return JSON.parse(body) as CompanySubmissions;
  } catch {
    throw new DataParseError(
      `Failed to parse submissions for CIK ${cik}.`,
      url
    );
  }
}

/** Shape of the SEC XBRL Frames API response */
export interface FrameData {
  taxonomy: string;
  tag: string;
  ccp: string; // Calendar/Company Period (e.g., CY2024)
  uom: string; // Unit of measure (e.g., USD)
  label: string;
  description: string;
  pts: number; // Number of data points
  data: FrameDataPoint[];
}

export interface FrameDataPoint {
  accn: string;
  cik: number;
  entityName: string;
  loc: string; // State/country code
  start: string;
  end: string;
  val: number;
}

/**
 * Fetch cross-company XBRL data from the Frames API.
 * Returns all companies that reported a specific concept in a given period.
 */
export async function getFrameData(
  taxonomy: string,
  concept: string,
  unit: string,
  period: string
): Promise<FrameData> {
  const url = `${BASE_URL}/api/xbrl/frames/${taxonomy}/${concept}/${unit}/${period}.json`;
  const body = await fetchWithRateLimit(url, 24); // Cache for 1 day

  try {
    return JSON.parse(body) as FrameData;
  } catch {
    throw new DataParseError(
      `Failed to parse frames data for ${taxonomy}/${concept}/${period}.`,
      url
    );
  }
}

/**
 * Fetch a specific filing document (XML, HTML, etc.)
 * Used for Form 4 XML documents and 13F information tables.
 */
export async function getFilingDocument(cik: string, accessionNumber: string, filename: string): Promise<string> {
  const paddedCik = cik.padStart(10, '0');
  const accessionNoDashes = accessionNumber.replace(/-/g, '');
  const url = `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${accessionNoDashes}/${filename}`;
  return fetchWithRateLimit(url, 720); // Cache for 30 days (filings are immutable)
}
