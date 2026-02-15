import chalk from 'chalk';
import { renderTable, formatCurrency, formatShareCount, sparkline } from './table-renderer.js';
import { padRight } from './format-utils.js';
import type { QueryResult } from '../core/types.js';

/**
 * Renders side-by-side comparison tables for multiple companies.
 */

export function renderComparison(results: QueryResult[]): string {
  if (results.length === 0) return '';
  if (results.length === 1) return renderTable(results[0]);

  const lines: string[] = [];
  const metric = results[0].metric;

  // Header
  const header = `${metric.display_name} — Company Comparison`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push('');

  // Collect all fiscal years across all companies
  const allYears = new Set<number>();
  for (const r of results) {
    for (const dp of r.data_points) {
      allYears.add(dp.fiscal_year);
    }
  }
  const years = Array.from(allYears).sort((a, b) => a - b);

  // Value formatter based on metric type
  const formatValue = metric.unit_type === 'ratio'
    ? (v: number) => `$${v.toFixed(2)}`
    : metric.unit_type === 'shares'
    ? formatShareCount
    : formatCurrency;

  // Column widths
  const fyColWidth = 10;
  const companyColWidth = 14;

  // Table header
  let headerRow = `  ${padRight('FY', fyColWidth)}`;
  for (const r of results) {
    const label = r.company.ticker || r.company.name.slice(0, 12);
    headerRow += padRight(label, companyColWidth);
  }
  lines.push(chalk.underline(headerRow));

  // Data rows
  for (const year of years) {
    let row = `  ${padRight(String(year), fyColWidth)}`;
    for (const r of results) {
      const dp = r.data_points.find(d => d.fiscal_year === year);
      const val = dp ? formatValue(dp.value) : chalk.dim('--');
      row += padRight(val, companyColWidth);
    }
    lines.push(row);
  }

  lines.push('');

  // Sparkline row (per company)
  if (years.length >= 3) {
    let sparkRow = `  ${padRight('Trend', fyColWidth)}`;
    for (const r of results) {
      const values = years.map(y => {
        const dp = r.data_points.find(d => d.fiscal_year === y);
        return dp?.value;
      }).filter((v): v is number => v !== undefined);

      sparkRow += padRight(values.length >= 2 ? sparkline(values) : chalk.dim('--'), companyColWidth);
    }
    lines.push(sparkRow);
  }

  // CAGR row
  let cagrRow = `  ${padRight('CAGR', fyColWidth)}`;
  for (const r of results) {
    const cagr = r.calculations.cagr;
    const val = cagr != null ? `${cagr.toFixed(1)}%` : '--';
    cagrRow += padRight(val, companyColWidth);
  }
  lines.push(chalk.bold(cagrRow));
  lines.push('');

  // Provenance per company
  lines.push(chalk.dim('  -- Provenance ' + '-'.repeat(45)));
  for (const r of results) {
    const ticker = r.company.ticker || r.company.name;
    lines.push(chalk.dim(`  ${ticker}: ${r.provenance.metric_concept}`));
    lines.push(chalk.dim(`    Filings: ${r.provenance.filings_used.map(f => f.accession_number).join(', ')}`));
  }

  return lines.join('\n');
}

export function renderComparisonJson(results: QueryResult[]): string {
  return JSON.stringify({
    comparison: results.map(r => ({
      company: {
        cik: r.company.cik,
        ticker: r.company.ticker,
        name: r.company.name,
      },
      metric: r.metric.id,
      data: r.data_points.map(dp => ({
        fiscal_year: dp.fiscal_year,
        value: dp.value,
      })),
      cagr: r.calculations.cagr,
      provenance: r.provenance,
    })),
  }, null, 2);
}

