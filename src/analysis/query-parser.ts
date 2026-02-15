import { findMetricByName } from '../processing/metric-definitions.js';
import type { MetricDefinition } from '../core/types.js';

/**
 * Pattern-based query parser. No LLM required.
 *
 * Parses natural language queries like:
 * - "Apple's R&D spending over the last 5 years"
 * - "MSFT revenue"
 * - "Show me Tesla's capital expenditures"
 * - "AAPL revenue quarterly 8 quarters"
 */

export type PeriodType = 'annual' | 'quarterly';

export interface ParsedQuery {
  company: string;
  metric: MetricDefinition | null;
  years: number;
  periodType: PeriodType;
  quarters: number;
  targetYear?: number;
  raw: string;
}

export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim();

  // Detect quarterly mode
  const periodType = detectPeriodType(raw);
  const years = periodType === 'annual' ? extractYears(raw) : 5;
  const quarters = periodType === 'quarterly' ? extractQuarters(raw) : 0;

  // Detect specific fiscal year (e.g., "FY2023", "in 2023", "2023")
  const targetYear = extractTargetYear(raw);

  // Extract company
  const company = extractCompany(raw);

  // Extract metric
  const metric = extractMetric(raw);

  return { company, metric, years, periodType, quarters, targetYear, raw };
}

function detectPeriodType(input: string): PeriodType {
  const lower = input.toLowerCase();
  if (/\bquarter(ly|s)?\b/i.test(lower)) return 'quarterly';
  if (/\bq[1-4]\b/i.test(lower)) return 'quarterly';
  if (/\d+\s*q\b/i.test(lower)) return 'quarterly';
  return 'annual';
}

function extractYears(input: string): number {
  // "last 5 years", "past 3 years", "5 year", "10y"
  const yearPatterns = [
    /(?:last|past|previous)\s+(\d+)\s*(?:fiscal\s+)?years?/i,
    /(\d+)\s*(?:fiscal\s+)?years?/i,
    /(\d+)\s*y(?:r|ear)?s?\b/i,
  ];

  for (const pattern of yearPatterns) {
    const match = input.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n >= 1 && n <= 20) return n;
    }
  }

  return 5; // Default
}

function extractQuarters(input: string): number {
  // "8 quarters", "last 12 quarters", "4q"
  const quarterPatterns = [
    /(?:last|past|previous)\s+(\d+)\s*quarters?/i,
    /(\d+)\s*quarters?/i,
    /(\d+)\s*q\b/i,
  ];

  for (const pattern of quarterPatterns) {
    const match = input.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n >= 1 && n <= 40) return n;
    }
  }

  return 8; // Default for quarterly
}

function extractTargetYear(input: string): number | undefined {
  // Match "FY2023", "fy 2023", "in 2023", "for 2023"
  const patterns = [
    /\bFY\s*(\d{4})\b/i,
    /\b(?:in|for|during)\s+(\d{4})\b/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      const year = parseInt(match[1], 10);
      if (year >= 1993 && year <= 2030) return year;
    }
  }

  // Don't match bare 4-digit numbers that could be year counts
  // Only match trailing year: "AAPL revenue 2023"
  const trailingYear = input.match(/\b(20[0-3]\d)\s*$/);
  if (trailingYear) {
    return parseInt(trailingYear[1], 10);
  }

  return undefined;
}

function extractCompany(input: string): string {
  const cleaned = input
    .replace(/^(?:show\s+me|what\s+is|what\s+are|how\s+has|how\s+have|get|fetch|find)\s+/i, '')
    .replace(/\s*(?:over\s+the\s+)?(?:last|past|previous)\s+\d+\s*(?:fiscal\s+)?(?:years?|quarters?)\s*/i, '')
    .replace(/\bquarterly\b/gi, '')
    .replace(/[\u2018\u2019\u201A\u201B\u0060\u00B4]/g, "'")
    .replace(/^'+/, ''); // strip leading stray quotes

  // Try "Company's metric" pattern
  const possessiveMatch = cleaned.match(/^([A-Za-z][A-Za-z\s.&]*?)'s\s/i);
  if (possessiveMatch) return possessiveMatch[1].trim();

  // Try ticker at start: "AAPL revenue"
  const tickerMatch = cleaned.match(/^([A-Z]{1,5})\s/);
  if (tickerMatch) return tickerMatch[1];

  // Try "metric for Company"
  const forMatch = cleaned.match(/\bfor\s+([A-Za-z][A-Za-z\s.&]+?)(?:\s*$|\s+over|\s+in|\s+from)/i);
  if (forMatch) return forMatch[1].trim();

  // Try any capitalized word that might be a company/ticker
  const words = cleaned.split(/\s+/);
  for (const word of words) {
    // All caps 1-5 chars = likely a ticker
    if (/^[A-Z]{1,5}$/.test(word)) return word;
  }

  // Fallback: first word
  return words[0] || '';
}

function extractMetric(input: string): MetricDefinition | null {
  const lower = input.toLowerCase();

  // Remove company-like tokens and noise words
  const cleaned = lower
    .replace(/^(?:show\s+me|what\s+is|what\s+are|how\s+has|how\s+have|get|fetch|find)\s+/i, '')
    .replace(/\b[a-z]{1,5}'s\b/i, '')
    .replace(/\s*(?:over\s+the\s+)?(?:last|past|previous)\s+\d+\s*(?:fiscal\s+)?(?:years?|quarters?)\s*/i, '')
    .replace(/\bfor\s+\w+/i, '')
    .replace(/\bchanged\b/i, '')
    .replace(/\bspending\b/i, '')
    .replace(/\bquarterly\b/gi, '')
    .trim();

  return findMetricByName(cleaned) ?? findMetricByName(lower) ?? null;
}
