/**
 * Renders query results as CSV for spreadsheet import.
 */

import type { QueryResult } from '../core/types.js';

export function renderCsv(result: QueryResult): string {
  const { data_points, calculations } = result;
  const isQuarterly = data_points.some(dp => dp.fiscal_period !== 'FY');
  const lines: string[] = [];

  // Header
  const changeLabel = isQuarterly ? 'QoQ_Change_Pct' : 'YoY_Change_Pct';
  lines.push(`Period,Value,${changeLabel},Period_End,Form_Type,Accession_Number,XBRL_Concept`);

  // Data rows
  for (let i = 0; i < data_points.length; i++) {
    const dp = data_points[i];
    const period = isQuarterly
      ? `${dp.fiscal_period} ${dp.fiscal_year}`
      : `FY${dp.fiscal_year}`;

    let change = '';
    if (i > 0) {
      if (isQuarterly) {
        const prev = data_points[i - 1].value;
        // Skip sign flips (e.g., profit to loss) — percentage change is meaningless
        if (prev !== 0 && !((prev > 0 && dp.value < 0) || (prev < 0 && dp.value > 0))) {
          change = (((dp.value - prev) / Math.abs(prev)) * 100).toFixed(1);
        }
      } else {
        const yoy = calculations.yoy_changes.find(y => y.year === dp.fiscal_year);
        if (yoy?.change_pct != null) {
          change = yoy.change_pct.toFixed(1);
        }
      }
    }

    lines.push([
      period,
      dp.value.toString(),
      change,
      dp.period_end,
      dp.source.form_type,
      dp.source.accession_number,
      dp.source.xbrl_concept,
    ].join(','));
  }

  return lines.join('\n');
}

export function renderComparisonCsv(results: QueryResult[]): string {
  if (results.length === 0) return '';

  const lines: string[] = [];
  const metric = results[0].metric;

  // Collect all fiscal years
  const allYears = new Set<number>();
  for (const r of results) {
    for (const dp of r.data_points) {
      allYears.add(dp.fiscal_year);
    }
  }
  const years = Array.from(allYears).sort((a, b) => a - b);

  // Header: FY, Company1, Company2, ...
  const tickers = results.map(r => r.company.ticker || r.company.name);
  lines.push(['FY', ...tickers].join(','));

  // Rows
  for (const year of years) {
    const values = results.map(r => {
      const dp = r.data_points.find(d => d.fiscal_year === year);
      return dp ? dp.value.toString() : '';
    });
    lines.push([year.toString(), ...values].join(','));
  }

  // CAGR row
  const cagrs = results.map(r =>
    r.calculations.cagr != null ? r.calculations.cagr.toFixed(1) + '%' : ''
  );
  lines.push(['CAGR', ...cagrs].join(','));

  return lines.join('\n');
}
