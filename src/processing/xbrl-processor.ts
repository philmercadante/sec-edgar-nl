import { createHash } from 'node:crypto';
import { getCompanyFacts, extractFacts } from '../core/sec-client.js';
import type { MetricDefinition, DataPoint, SecFact, CikLookup } from '../core/types.js';

/**
 * XBRL Processor: extracts, deduplicates, and normalizes SEC XBRL data
 * into clean DataPoints with full provenance.
 *
 * Deduplication strategy: "most recently filed wins"
 * - Same fiscal period may appear in multiple filings (10-K, 10-K/A, etc.)
 * - We keep the value from the most recently filed document
 * - This handles restatements correctly
 *
 * Concept selection: "most recent data wins"
 * - Companies switch XBRL concepts across filing years
 * - We try all concepts and pick the one with the most recent fiscal year
 */

/** Metadata about which XBRL concepts were tried and why one was selected */
export interface ConceptSelectionInfo {
  concepts_tried: Array<{
    taxonomy: string;
    concept: string;
    priority: number;
    found: boolean;
    annual_count: number;
    max_fiscal_year: number | null;
  }>;
  selected_reason: string;
}

export interface FetchResult {
  dataPoints: DataPoint[];
  conceptUsed: string;
  conceptSelection: ConceptSelectionInfo;
}

/**
 * Fetch and process metric data for a company.
 * Tries all XBRL concepts and picks the one with the most recent data.
 */
export async function fetchMetricData(
  company: CikLookup,
  metric: MetricDefinition,
  years: number = 5
): Promise<FetchResult> {
  const companyFacts = await getCompanyFacts(company.cik);

  const conceptsTried: ConceptSelectionInfo['concepts_tried'] = [];
  let bestResult: { facts: SecFact[]; concept: string; maxFy: number; priority: number } | null = null;

  for (const concept of metric.xbrl_concepts.sort((a, b) => a.priority - b.priority)) {
    const unit = metric.unit_type === 'currency' ? 'USD' : 'shares';
    const facts = extractFacts(companyFacts, concept.taxonomy, concept.concept, unit);

    if (facts.length === 0) {
      conceptsTried.push({
        taxonomy: concept.taxonomy,
        concept: concept.concept,
        priority: concept.priority,
        found: false,
        annual_count: 0,
        max_fiscal_year: null,
      });
      continue;
    }

    const annualFacts = filterAnnualFacts(facts, metric);
    const deduped = annualFacts.length > 0 ? deduplicateFacts(annualFacts) : [];
    const maxFy = deduped.length > 0 ? Math.max(...deduped.map(f => f.fy)) : null;

    conceptsTried.push({
      taxonomy: concept.taxonomy,
      concept: concept.concept,
      priority: concept.priority,
      found: true,
      annual_count: deduped.length,
      max_fiscal_year: maxFy,
    });

    if (deduped.length === 0) continue;

    // Prefer concept with most recent fiscal year; break ties by priority
    if (!bestResult || maxFy! > bestResult.maxFy) {
      bestResult = {
        facts: deduped,
        concept: `${concept.taxonomy}:${concept.concept}`,
        maxFy: maxFy!,
        priority: concept.priority,
      };
    }
  }

  if (!bestResult) {
    return {
      dataPoints: [],
      conceptUsed: '',
      conceptSelection: {
        concepts_tried: conceptsTried,
        selected_reason: 'No XBRL concepts had annual data for this company',
      },
    };
  }

  // Build selection reason
  const otherConcepts = conceptsTried.filter(
    c => c.found && c.annual_count > 0 && `${c.taxonomy}:${c.concept}` !== bestResult!.concept
  );
  let selectedReason = `Selected ${bestResult.concept} (most recent FY: ${bestResult.maxFy})`;
  if (otherConcepts.length > 0) {
    const others = otherConcepts
      .map(c => `${c.taxonomy}:${c.concept} (max FY: ${c.max_fiscal_year})`)
      .join(', ');
    selectedReason += `. Also found: ${others}`;
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
    conceptSelection: {
      concepts_tried: conceptsTried,
      selected_reason: selectedReason,
    },
  };
}

/**
 * Fetch quarterly metric data for a company.
 * Similar to fetchMetricData but filters for quarterly (10-Q) filings.
 */
export async function fetchQuarterlyData(
  company: CikLookup,
  metric: MetricDefinition,
  quarters: number = 8
): Promise<FetchResult> {
  const companyFacts = await getCompanyFacts(company.cik);

  const conceptsTried: ConceptSelectionInfo['concepts_tried'] = [];
  let bestResult: { facts: SecFact[]; concept: string; maxEndDate: string } | null = null;

  for (const concept of metric.xbrl_concepts.sort((a, b) => a.priority - b.priority)) {
    const unit = metric.unit_type === 'currency' ? 'USD' : 'shares';
    const facts = extractFacts(companyFacts, concept.taxonomy, concept.concept, unit);

    if (facts.length === 0) {
      conceptsTried.push({
        taxonomy: concept.taxonomy,
        concept: concept.concept,
        priority: concept.priority,
        found: false,
        annual_count: 0,
        max_fiscal_year: null,
      });
      continue;
    }

    const quarterlyFacts = filterQuarterlyFacts(facts, metric);
    const deduped = quarterlyFacts.length > 0 ? deduplicateQuarterlyFacts(quarterlyFacts) : [];
    const maxEnd = deduped.length > 0 ? deduped.reduce((a, b) => a.end > b.end ? a : b).end : null;

    conceptsTried.push({
      taxonomy: concept.taxonomy,
      concept: concept.concept,
      priority: concept.priority,
      found: true,
      annual_count: deduped.length,
      max_fiscal_year: maxEnd ? new Date(maxEnd).getFullYear() : null,
    });

    if (deduped.length === 0) continue;

    if (!bestResult || maxEnd! > bestResult.maxEndDate) {
      bestResult = {
        facts: deduped,
        concept: `${concept.taxonomy}:${concept.concept}`,
        maxEndDate: maxEnd!,
      };
    }
  }

  if (!bestResult) {
    return {
      dataPoints: [],
      conceptUsed: '',
      conceptSelection: {
        concepts_tried: conceptsTried,
        selected_reason: 'No XBRL concepts had quarterly data for this company',
      },
    };
  }

  // Take the most recent N quarters
  const sorted = bestResult.facts
    .sort((a, b) => b.end.localeCompare(a.end))
    .slice(0, quarters);

  sorted.reverse();

  const dataPoints = sorted.map(fact => factToQuarterlyDataPoint(
    fact,
    metric.id,
    company,
    bestResult!.concept
  ));

  return {
    dataPoints,
    conceptUsed: bestResult.concept,
    conceptSelection: {
      concepts_tried: conceptsTried,
      selected_reason: `Selected ${bestResult.concept} (most recent: ${bestResult.maxEndDate})`,
    },
  };
}

/**
 * Filter to quarterly facts only.
 *
 * For duration metrics (income stmt, cash flow): SEC 10-Q filings contain
 * both single-quarter (3-month) AND cumulative year-to-date values.
 * We must filter for ~3-month durations only by checking start/end dates.
 *
 * For balance sheet (end_of_period): end-of-quarter snapshots from any filing.
 */
function filterQuarterlyFacts(facts: SecFact[], metric: MetricDefinition): SecFact[] {
  return facts.filter(fact => {
    // Must be from a 10-Q or 10-K filing
    if (!fact.form.startsWith('10-Q') && !fact.form.startsWith('10-K')) return false;
    if (!fact.fy) return false;

    // Must be a quarterly period
    if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(fact.fp)) return false;

    // For duration metrics, only keep single-quarter (~3 month) values
    if (metric.aggregation === 'sum') {
      if (!fact.start || !fact.end) return false;
      const startDate = new Date(fact.start);
      const endDate = new Date(fact.end);
      const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      // Single quarter: 80-100 days. Reject cumulative (>120 days)
      return durationDays >= 60 && durationDays <= 120;
    }

    // For balance sheet, any quarter-end snapshot is fine
    return true;
  });
}

/**
 * Deduplicate quarterly facts by period end date.
 * Most recently filed wins per quarter.
 */
function deduplicateQuarterlyFacts(facts: SecFact[]): SecFact[] {
  const byPeriodEnd = new Map<string, SecFact>();

  for (const fact of facts) {
    const key = fact.end;
    const existing = byPeriodEnd.get(key);
    if (!existing || fact.filed > existing.filed) {
      byPeriodEnd.set(key, fact);
    }
  }

  return Array.from(byPeriodEnd.values());
}

function factToQuarterlyDataPoint(
  fact: SecFact,
  metricId: string,
  company: CikLookup,
  xbrlConcept: string
): DataPoint {
  // Derive quarter label from end date month
  const endDate = new Date(fact.end);
  const month = endDate.getMonth(); // 0-indexed
  const year = endDate.getFullYear();

  // Map end month to quarter: Jan-Mar=Q1, Apr-Jun=Q2, Jul-Sep=Q3, Oct-Dec=Q4
  const quarter = Math.floor(month / 3) + 1;
  const fp = `Q${quarter}` as DataPoint['fiscal_period'];

  const checksum = createHash('sha256')
    .update(`${company.cik}:${metricId}:${year}:${fp}:${fact.val}:${fact.accn}`)
    .digest('hex');

  return {
    metric_id: metricId,
    cik: company.cik,
    company_name: company.name,
    fiscal_year: year,
    fiscal_period: fp,
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
