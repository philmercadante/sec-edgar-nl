import type { DataPoint, ProvenanceInfo, MetricDefinition } from '../core/types.js';

/**
 * Build provenance info from processed data points.
 * Every output MUST include provenance — this is non-negotiable.
 */

export function buildProvenance(
  dataPoints: DataPoint[],
  metric: MetricDefinition,
  conceptUsed: string
): ProvenanceInfo {
  // Collect unique filings used
  const filingMap = new Map<string, {
    accession_number: string;
    form_type: string;
    filing_date: string;
    fiscal_year: number;
  }>();

  for (const dp of dataPoints) {
    if (!filingMap.has(dp.source.accession_number)) {
      filingMap.set(dp.source.accession_number, {
        accession_number: dp.source.accession_number,
        form_type: dp.source.form_type,
        filing_date: dp.source.filing_date,
        fiscal_year: dp.fiscal_year,
      });
    }
  }

  const notes: string[] = [];

  // Check for restatements
  const restated = dataPoints.filter(dp => dp.restated_in);
  if (restated.length > 0) {
    notes.push(`${restated.length} value(s) were restated in subsequent filings`);
  }

  // Note if balance sheet vs income statement
  if (metric.aggregation === 'end_of_period') {
    notes.push('Values are end-of-period (balance sheet) snapshots');
  } else if (metric.aggregation === 'sum') {
    notes.push('Values are cumulative for the full fiscal year');
  }

  return {
    metric_concept: conceptUsed,
    filings_used: Array.from(filingMap.values()).sort((a, b) => a.fiscal_year - b.fiscal_year),
    dedup_strategy: 'Most recently filed values selected',
    period_type: 'Annual (full fiscal year)',
    notes,
  };
}
