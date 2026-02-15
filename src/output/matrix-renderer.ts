import chalk from 'chalk';
import { formatCurrency, formatShareCount } from './table-renderer.js';
import { padRight, csvEscape } from './format-utils.js';
import type { MatrixResult } from '../core/query-engine.js';

/**
 * Renders a financial matrix: companies as columns, metrics as rows.
 */
export function renderMatrixTable(result: MatrixResult): string {
  const lines: string[] = [];

  const header = `Financial Matrix — FY${result.fiscal_year}`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push('');

  if (result.companies.length === 0 || result.metrics.length === 0) {
    lines.push(chalk.dim('  No data found.'));
    return lines.join('\n');
  }

  // Column widths
  const metricColWidth = Math.max(24, ...result.metrics.map(m => m.display_name.length + 2));
  const companyColWidth = 14;

  // Header row with company tickers
  let headerRow = `  ${padRight('Metric', metricColWidth)}`;
  for (const c of result.companies) {
    headerRow += padRight(c.company.ticker, companyColWidth);
  }
  lines.push(chalk.underline(headerRow));

  // Data rows (one per metric)
  for (const metric of result.metrics) {
    const formatValue = metric.unit_type === 'ratio'
      ? (v: number) => `$${v.toFixed(2)}`
      : metric.unit_type === 'shares'
      ? formatShareCount
      : formatCurrency;

    let row = `  ${padRight(metric.display_name, metricColWidth)}`;
    for (const c of result.companies) {
      const val = c.values.get(metric.id);
      row += padRight(val !== undefined ? formatValue(val) : chalk.dim('--'), companyColWidth);
    }
    lines.push(row);
  }

  lines.push('');

  // Notes about fiscal year differences
  lines.push(chalk.dim(`  Note: Values are for FY${result.fiscal_year} or most recent available.`));

  return lines.join('\n');
}

/**
 * Renders matrix as JSON.
 */
export function renderMatrixJson(result: MatrixResult): string {
  return JSON.stringify({
    fiscal_year: result.fiscal_year,
    metrics: result.metrics,
    companies: result.companies.map(c => {
      const values: Record<string, number> = {};
      for (const [k, v] of c.values) {
        values[k] = v;
      }
      return {
        company: {
          cik: c.company.cik,
          ticker: c.company.ticker,
          name: c.company.name,
        },
        values,
      };
    }),
  }, null, 2);
}

/**
 * Renders matrix as CSV.
 * Format: company ticker as first column, metrics as subsequent columns.
 */
export function renderMatrixCsv(result: MatrixResult): string {
  const lines: string[] = [];

  // Header
  const metricHeaders = result.metrics.map(m => csvEscape(m.display_name));
  lines.push(['ticker', 'company_name', ...metricHeaders].join(','));

  // Data rows (one per company)
  for (const c of result.companies) {
    const values = result.metrics.map(m => {
      const val = c.values.get(m.id);
      return val !== undefined ? String(val) : '';
    });
    lines.push([c.company.ticker, csvEscape(c.company.name), ...values].join(','));
  }

  return lines.join('\n');
}
