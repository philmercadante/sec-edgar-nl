import { createHash } from 'node:crypto';
import { getCompanyFacts, extractFacts } from '../core/sec-client.js';
import type { MetricDefinition, DataPoint, SecFact, CompanyFacts, CikLookup } from '../core/types.js';

/**
 * XBRL Processor: extracts, deduplicates, and normalizes SEC XBRL data
 * into clean DataPoints with full provenance.
 *
 * Deduplication strategy: "most recently filed wins"
 * - Same fiscal period may appear in multiple filings (10-K, 10-K/A, etc.)
 * - We keep the value from the most recently filed document
 * - This handles restatements correctly
 */

/**
 * Fetch and process metric data for a company.
 * Tries all XBRL concepts and picks the one with the most recent data.
 * This handles companies that switch XBRL concepts across filing years.
 */
export async function fetchMetricData(
  company: CikLookup,
  metric: MetricDefinition,
  years: number = 5
): Promise<{ dataPoints: DataPoint[]; conceptUsed: string }> {
  const companyFacts = await getCompanyFacts(company.cik);

  // Evaluate all concepts and pick the best one
  let bestResult: { facts: SecFact[]; concept: string; maxFy: number } | null = null;

  for (const concept of metric.xbrl_concepts.sort((a, b) => a.priority - b.priority)) {
    const unit = metric.unit_type === 'currency' ? 'USD' : 'shares';
    const facts = extractFacts(companyFacts, concept.taxonomy, concept.concept, unit);

    if (facts.length === 0) continue;

    const annualFacts = filterAnnualFacts(facts, metric);
    if (annualFacts.length === 0) continue;

    const deduped = deduplicateFacts(annualFacts);
    const maxFy = Math.max(...deduped.map(f => f.fy));

    // Prefer concept with most recent fiscal year; break ties by priority
    if (!bestResult || maxFy > bestResult.maxFy) {
      bestResult = {
        facts: deduped,
        concept: `${concept.taxonomy}:${concept.concept}`,
        maxFy,
      };
    }
  }

  if (!bestResult) {
    return { dataPoints: [], conceptUsed: '' };
  }

  // Take the most recent N years
  const sorted = bestResult.facts
    .sort((a, b) => b.fy - a.fy)
    .slice(0, years);

  // Reverse to chronological order
  sorted.reverse();

  const dataPoints = sorted.map(fact => factToDataPoint(
    fact,
    metric.id,
    company,
    bestResult!.concept
  ));

  return {
    dataPoints,
    conceptUsed: bestResult.concept,
  };
}

/**
 * Filter to annual (full-year) facts only.
 * For income statement / cash flow: look for FY facts (duration metrics).
 * For balance sheet: look for end-of-period facts from 10-K filings.
 */
function filterAnnualFacts(facts: SecFact[], metric: MetricDefinition): SecFact[] {
  return facts.filter(fact => {
    // Must be from a 10-K or 10-K/A filing
    if (!fact.form.startsWith('10-K')) return false;

    // Must have a fiscal year
    if (!fact.fy) return false;

    // For duration metrics (income stmt, cash flow), must be full year (FY)
    if (metric.aggregation === 'sum') {
      return fact.fp === 'FY';
    }

    // For balance sheet (end_of_period), Q4 end is equivalent to FY end
    if (metric.aggregation === 'end_of_period') {
      return fact.fp === 'FY' || fact.fp === 'Q4';
    }

    return fact.fp === 'FY';
  });
}

/**
 * Deduplicate facts: for each period (identified by end date), keep
 * the value from the most recently filed document.
 *
 * Critical insight: each 10-K contains the current year AND prior years
 * for comparison, all sharing the same `fy` value (the filing's fiscal year).
 * We must group by `end` date to correctly identify distinct annual periods.
 */
function deduplicateFacts(facts: SecFact[]): SecFact[] {
  const byPeriodEnd = new Map<string, SecFact>();

  for (const fact of facts) {
    const key = fact.end;
    const existing = byPeriodEnd.get(key);
    if (!existing || fact.filed > existing.filed) {
      byPeriodEnd.set(key, fact);
    }
  }

  // Derive actual fiscal year from end date
  return Array.from(byPeriodEnd.values()).map(fact => ({
    ...fact,
    fy: deriveFiscalYear(fact.end),
  }));
}

/**
 * Derive the fiscal year from a period end date.
 * Convention: fiscal year = calendar year of the period end date.
 * Works for Dec (most companies), Sep (Apple), Jan (NVIDIA), etc.
 */
function deriveFiscalYear(endDate: string): number {
  return new Date(endDate).getFullYear();
}

/**
 * Convert a raw SEC fact into our DataPoint model.
 */
function factToDataPoint(
  fact: SecFact,
  metricId: string,
  company: CikLookup,
  xbrlConcept: string
): DataPoint {
  const checksum = createHash('sha256')
    .update(`${company.cik}:${metricId}:${fact.fy}:${fact.val}:${fact.accn}`)
    .digest('hex');

  return {
    metric_id: metricId,
    cik: company.cik,
    company_name: company.name,
    fiscal_year: fact.fy,
    fiscal_period: 'FY',
    period_start: fact.start ?? '',
    period_end: fact.end,
    value: fact.val,
    unit: 'USD',
    source: {
      accession_number: fact.accn,
      filing_date: fact.filed,
      form_type: fact.form,
      xbrl_concept: xbrlConcept,
    },
    restated_in: null,
    is_latest: true,
    extracted_at: new Date().toISOString(),
    checksum,
  };
}
