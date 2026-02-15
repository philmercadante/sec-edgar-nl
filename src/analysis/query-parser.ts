import { findMetricByName } from '../processing/metric-definitions.js';
import type { MetricDefinition } from '../core/types.js';

/**
 * Pattern-based query parser. No LLM required.
 *
 * Parses natural language queries like:
 * - "Apple's R&D spending over the last 5 years"
 * - "MSFT revenue"
 * - "Show me Tesla's capital expenditures"
 */

export interface ParsedQuery {
  company: string;
  metric: MetricDefinition | null;
  years: number;
  raw: string;
}

export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim();

  // Extract year count
  const years = extractYears(raw);

  // Extract company
  const company = extractCompany(raw);

  // Extract metric
  const metric = extractMetric(raw);

  return { company, metric, years, raw };
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

function extractCompany(input: string): string {
  const cleaned = input
    .replace(/^(?:show\s+me|what\s+is|what\s+are|how\s+has|how\s+have|get|fetch|find)\s+/i, '')
    .replace(/\s*(?:over\s+the\s+)?(?:last|past|previous)\s+\d+\s*(?:fiscal\s+)?years?\s*/i, '')
    .replace(/[''`]/g, "'");

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
    .replace(/\s*(?:over\s+the\s+)?(?:last|past|previous)\s+\d+\s*(?:fiscal\s+)?years?\s*/i, '')
    .replace(/\bfor\s+\w+/i, '')
    .replace(/\bchanged\b/i, '')
    .replace(/\bspending\b/i, '')
    .trim();

  return findMetricByName(cleaned) ?? findMetricByName(lower);
}
