/**
 * Form 4 Insider Trading Processor.
 *
 * Fetches and parses SEC Form 4 filings to extract insider
 * buy/sell transactions with full provenance.
 *
 * The processor:
 * 1. Gets company submissions to find recent Form 4 filings
 * 2. Fetches and parses each Form 4 XML document
 * 3. Aggregates transactions and classifies the signal
 */

import { getCompanySubmissions, getFilingDocument } from '../core/sec-client.js';
import type {
  CikLookup,
  CompanyInfo,
  InsiderTransaction,
  InsiderActivityResult,
  InsiderInfo,
  InsiderSignal,
  TransactionCode,
} from '../core/types.js';

/**
 * Fetch insider trading activity for a company.
 */
export async function fetchInsiderActivity(
  company: CikLookup,
  options: { days?: number } = {}
): Promise<InsiderActivityResult> {
  const days = options.days ?? 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString().split('T')[0];

  // Get company submissions
  const submissions = await getCompanySubmissions(company.cik);
  const { recent } = submissions.filings;

  // Find Form 4 filings within the date range
  const form4Indices: number[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    if ((recent.form[i] === '4' || recent.form[i] === '4/A') && recent.filingDate[i] >= cutoff) {
      form4Indices.push(i);
    }
  }

  // Fetch and parse each Form 4 (up to 50 to be reasonable)
  const indicesToFetch = form4Indices.slice(0, 50);
  const allTransactions: InsiderTransaction[] = [];
  const accessionNumbers: string[] = [];

  // Fetch in batches of 5 for parallelism within rate limits
  for (let batch = 0; batch < indicesToFetch.length; batch += 5) {
    const batchIndices = indicesToFetch.slice(batch, batch + 5);
    const batchPromises = batchIndices.map(async (idx) => {
      const accession = recent.accessionNumber[idx];
      const primaryDoc = recent.primaryDocument[idx];
      const filingDate = recent.filingDate[idx];

      // The primaryDocument often points to the XSLT-rendered HTML view
      // (e.g., "xslF345X05/wk-form4_123.xml"). Strip the XSLT prefix
      // to get the raw XML filename at the filing root.
      const rawXmlFilename = primaryDoc.includes('/')
        ? primaryDoc.split('/').pop()!
        : primaryDoc;

      try {
        const xml = await getFilingDocument(company.cik, accession, rawXmlFilename);
        const transactions = parseForm4Xml(xml, accession, filingDate);
        return transactions;
      } catch {
        // Some filings may fail to parse — skip gracefully
        return [];
      }
    });

    const results = await Promise.all(batchPromises);
    for (let j = 0; j < batchIndices.length; j++) {
      accessionNumbers.push(recent.accessionNumber[batchIndices[j]]);
      allTransactions.push(...results[j]);
    }
  }

  // Sort by transaction date descending
  allTransactions.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

  // Build summary — only count open market purchases (P) and sales (S)
  // Grants (A), exercises (M), gifts (G), tax withholding (F) are not market signals
  const buys = allTransactions.filter(t => t.transaction_code === 'P');
  const sells = allTransactions.filter(t => t.transaction_code === 'S');

  const buyValue = buys.reduce((sum, t) => sum + (t.total_value ?? 0), 0);
  const sellValue = sells.reduce((sum, t) => sum + (t.total_value ?? 0), 0);
  const buyShares = buys.reduce((sum, t) => sum + t.shares, 0);
  const sellShares = sells.reduce((sum, t) => sum + t.shares, 0);

  const uniqueInsiders = new Set(allTransactions.map(t => t.insider.cik)).size;

  const signal = classifySignal(buyValue, sellValue);

  const filingDates = accessionNumbers.length > 0
    ? [
        recent.filingDate[indicesToFetch[indicesToFetch.length - 1]],
        recent.filingDate[indicesToFetch[0]],
      ] as [string, string]
    : ['', ''] as [string, string];

  const companyInfo: CompanyInfo = {
    cik: company.cik,
    ticker: company.ticker,
    name: company.name,
    fiscal_year_end_month: 0,
  };

  return {
    company: companyInfo,
    period_days: days,
    transactions: allTransactions,
    summary: {
      total_buys: buys.length,
      total_sells: sells.length,
      buy_shares: buyShares,
      sell_shares: sellShares,
      buy_value: buyValue,
      sell_value: sellValue,
      net_shares: buyShares - sellShares,
      unique_insiders: uniqueInsiders,
      signal,
    },
    provenance: {
      filing_count: accessionNumbers.length,
      filing_date_range: filingDates,
      accession_numbers: accessionNumbers,
    },
  };
}

/**
 * Parse a Form 4 XML document into insider transactions.
 *
 * Uses regex-based extraction since Form 4 XML has a well-defined,
 * predictable structure. This avoids adding an XML parser dependency.
 */
export function parseForm4Xml(xml: string, accessionNumber: string, filingDate: string): InsiderTransaction[] {
  const transactions: InsiderTransaction[] = [];

  // Extract insider info
  const insider = extractInsiderInfo(xml);
  if (!insider) return [];

  // Extract non-derivative transactions
  const nonDerivBlock = xml.match(/<nonDerivativeTable>([\s\S]*?)<\/nonDerivativeTable>/i);
  if (nonDerivBlock) {
    const txnRegex = /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi;
    let match;
    while ((match = txnRegex.exec(nonDerivBlock[1])) !== null) {
      const txn = parseTransaction(match[1], insider, accessionNumber, filingDate);
      if (txn) transactions.push(txn);
    }
  }

  return transactions;
}

function extractInsiderInfo(xml: string): InsiderInfo | null {
  const ownerBlock = xml.match(/<reportingOwner>([\s\S]*?)<\/reportingOwner>/i);
  if (!ownerBlock) return null;

  const cik = extractTagValue(ownerBlock[1], 'rptOwnerCik') || '';
  const name = extractTagValue(ownerBlock[1], 'rptOwnerName') || '';

  if (!name) return null;

  const isDirector = extractTagValue(ownerBlock[1], 'isDirector') === '1' ||
                     extractTagValue(ownerBlock[1], 'isDirector') === 'true';
  const isOfficer = extractTagValue(ownerBlock[1], 'isOfficer') === '1' ||
                    extractTagValue(ownerBlock[1], 'isOfficer') === 'true';
  const isTenPct = extractTagValue(ownerBlock[1], 'isTenPercentOwner') === '1' ||
                   extractTagValue(ownerBlock[1], 'isTenPercentOwner') === 'true';
  const officerTitle = extractTagValue(ownerBlock[1], 'officerTitle') || '';

  return {
    cik: cik.replace(/^0+/, '') || '0', // Strip leading zeros, keep at least '0'
    name: formatName(name),
    is_director: isDirector,
    is_officer: isOfficer,
    is_ten_percent_owner: isTenPct,
    officer_title: officerTitle,
  };
}

function parseTransaction(
  block: string,
  insider: InsiderInfo,
  accessionNumber: string,
  filingDate: string
): InsiderTransaction | null {
  // Extract date
  const dateBlock = block.match(/<transactionDate>([\s\S]*?)<\/transactionDate>/i);
  const date = dateBlock ? extractTagValue(dateBlock[1], 'value') : null;
  if (!date) return null;

  // Extract transaction code
  const codingBlock = block.match(/<transactionCoding>([\s\S]*?)<\/transactionCoding>/i);
  const code = codingBlock ? extractTagValue(codingBlock[1], 'transactionCode') : null;
  if (!code) return null;

  // Extract amounts
  const amountsBlock = block.match(/<transactionAmounts>([\s\S]*?)<\/transactionAmounts>/i);
  if (!amountsBlock) return null;

  const sharesStr = extractNestedValue(amountsBlock[1], 'transactionShares');
  const priceStr = extractNestedValue(amountsBlock[1], 'transactionPricePerShare');
  const adCode = extractNestedValue(amountsBlock[1], 'transactionAcquiredDisposedCode');

  const shares = sharesStr ? parseFloat(sharesStr) : 0;
  const price = priceStr ? parseFloat(priceStr) : null;
  if (isNaN(shares) || shares === 0) return null;

  // Extract post-transaction holdings
  const postBlock = block.match(/<postTransactionAmounts>([\s\S]*?)<\/postTransactionAmounts>/i);
  const sharesAfterStr = postBlock ? extractNestedValue(postBlock[1], 'sharesOwnedFollowingTransaction') : null;
  const sharesAfter = sharesAfterStr ? parseFloat(sharesAfterStr) : 0;

  const totalValue = price != null && !isNaN(price) ? Math.round(shares * price * 100) / 100 : null;

  return {
    insider,
    transaction_date: date,
    transaction_code: code as TransactionCode,
    transaction_type: adCode === 'A' ? 'acquisition' : 'disposition',
    shares: Math.round(shares),
    price_per_share: price != null && !isNaN(price) ? Math.round(price * 100) / 100 : null,
    total_value: totalValue,
    shares_owned_after: Math.round(sharesAfter),
    filing_date: filingDate,
    filing_accession: accessionNumber,
  };
}

function extractTagValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
  return match ? match[1].trim() : null;
}

function extractNestedValue(xml: string, outerTag: string): string | null {
  const outerMatch = xml.match(new RegExp(`<${outerTag}>([\\s\\S]*?)</${outerTag}>`, 'i'));
  if (!outerMatch) return null;
  // Try to get inner <value> tag first
  const valueMatch = outerMatch[1].match(/<value>([^<]*)<\/value>/i);
  if (valueMatch) return valueMatch[1].trim();
  // Fallback: return raw content
  return outerMatch[1].trim();
}

/**
 * Format insider name from "LAST FIRST MIDDLE" to "First Last".
 */
function formatName(name: string): string {
  // Already in normal format (e.g., "Tim Cook")
  if (name.includes(' ') && name !== name.toUpperCase()) return name;

  // Convert "COOK TIMOTHY D" to "Timothy D Cook"
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[0];
    const rest = parts.slice(1);
    const formatted = [...rest, last].map(p =>
      p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    ).join(' ');
    return formatted;
  }

  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/**
 * Classify the insider signal based on buy vs sell values.
 * Only considers open market purchases (P) and sales (S).
 */
function classifySignal(buyValue: number, sellValue: number): InsiderSignal {
  if (buyValue === 0 && sellValue === 0) return 'neutral';
  if (buyValue > 0 && sellValue === 0) return 'bullish';
  if (sellValue > 0 && buyValue === 0) return 'bearish';

  const ratio = buyValue / sellValue;
  if (ratio > 2) return 'bullish';
  if (ratio < 0.5) return 'bearish';
  return 'mixed';
}

/** Human-readable transaction code labels */
export const TRANSACTION_CODE_LABELS: Record<string, string> = {
  P: 'BUY',
  S: 'SELL',
  A: 'GRANT',
  D: 'DISP',
  F: 'TAX',
  M: 'EXERCISE',
  G: 'GIFT',
  C: 'CONVERT',
  X: 'EXPIRE',
  J: 'OTHER',
};
