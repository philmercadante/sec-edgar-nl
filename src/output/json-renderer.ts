import type { QueryResult } from '../core/types.js';

/**
 * Renders query results as structured JSON for programmatic use.
 */

export function renderJson(result: QueryResult): string {
  return JSON.stringify({
    company: {
      cik: result.company.cik,
      ticker: result.company.ticker,
      name: result.company.name,
    },
    metric: {
      id: result.metric.id,
      display_name: result.metric.display_name,
    },
    data: result.data_points.map(dp => ({
      fiscal_year: dp.fiscal_year,
      value: dp.value,
      period_end: dp.period_end,
      source: {
        accession_number: dp.source.accession_number,
        form_type: dp.source.form_type,
        filing_date: dp.source.filing_date,
        xbrl_concept: dp.source.xbrl_concept,
      },
    })),
    calculations: {
      yoy_changes: result.calculations.yoy_changes,
      cagr: result.calculations.cagr,
      cagr_years: result.calculations.cagr_years,
    },
    provenance: result.provenance,
  }, null, 2);
}
