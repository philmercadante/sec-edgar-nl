import type { DataPoint, ProvenanceInfo, MetricDefinition } from '../core/types.js';
import type { ConceptSelectionInfo, RestatementInfo } from '../processing/xbrl-processor.js';

/**
 * Build provenance info from processed data points.
 * Every output MUST include provenance — this is non-negotiable.
 */

export function buildProvenance(
  dataPoints: DataPoint[],
  metric: MetricDefinition,
  conceptUsed: string,
  conceptSelection?: ConceptSelectionInfo,
  restatements?: RestatementInfo[]
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

  // Flag restatements
  if (restatements && restatements.length > 0) {
    for (const r of restatements) {
      const dir = r.change_pct > 0 ? '+' : '';
      notes.push(
        `FY${r.fiscal_year} was restated: original $${formatCompact(r.original_value)} → $${formatCompact(r.restated_value)} (${dir}${r.change_pct}%) in filing ${r.restated_filing_date}`
      );
    }
  }

  // Detect quarterly vs annual from data
  const isQuarterly = dataPoints.some(dp => dp.fiscal_period !== 'FY');

  // Note if balance sheet vs income statement
  if (metric.aggregation === 'end_of_period') {
    notes.push('Values are end-of-period (balance sheet) snapshots');
  } else if (metric.aggregation === 'sum') {
    notes.push(isQuarterly ? 'Values are single-quarter amounts' : 'Values are cumulative for the full fiscal year');
  }

  // Add concept selection reasoning
  if (conceptSelection) {
    const tried = conceptSelection.concepts_tried;
    const notFound = tried.filter(c => !c.found);
    if (notFound.length > 0) {
      notes.push(
        `Concepts not found: ${notFound.map(c => c.concept).join(', ')}`
      );
    }
    const foundButNotSelected = tried.filter(
      c => c.found && c.annual_count > 0 && `${c.taxonomy}:${c.concept}` !== conceptUsed
    );
    if (foundButNotSelected.length > 0) {
      notes.push(
        `Alternative concepts available: ${foundButNotSelected.map(c => `${c.concept} (max FY${c.max_fiscal_year})`).join(', ')}`
      );
    }
  }

  return {
    metric_concept: conceptUsed,
    filings_used: Array.from(filingMap.values()).sort((a, b) => a.fiscal_year - b.fiscal_year),
    dedup_strategy: 'Most recently filed values selected (grouped by period end date)',
    period_type: isQuarterly ? 'Quarterly (single quarter)' : 'Annual (full fiscal year)',
    notes,
  };
}

/** Compact number formatting for provenance notes */
function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}
