import chalk from 'chalk';
import { formatCurrency, formatShareCount, sparkline } from './table-renderer.js';
import { padRight, csvEscape } from './format-utils.js';
import type { MultiMetricResult } from '../core/query-engine.js';

/**
 * Renders a multi-metric comparison table for a single company.
 * Metrics as rows, fiscal years as columns.
 */
export function renderMultiMetricTable(result: MultiMetricResult): string {
  const lines: string[] = [];

  const header = `${result.company.name} (${result.company.ticker}) — Multi-Metric Comparison`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push('');

  if (result.metrics.length === 0 || result.years.length === 0) {
    lines.push(chalk.dim('  No data found.'));
    return lines.join('\n');
  }

  // Column widths
  const metricColWidth = Math.max(22, ...result.metrics.map(m => m.display_name.length + 2));
  const yearColWidth = 14;

  // Header row
  let headerRow = `  ${padRight('Metric', metricColWidth)}`;
  for (const year of result.years) {
    headerRow += padRight(`FY${year}`, yearColWidth);
  }
  if (result.years.length >= 3) {
    headerRow += 'Trend';
  }
  lines.push(chalk.underline(headerRow));

  // Data rows
  for (const metric of result.metrics) {
    const yearMap = result.data.get(metric.id);
    const formatValue = metric.unit_type === 'ratio'
      ? (v: number) => `$${v.toFixed(2)}`
      : metric.unit_type === 'shares'
      ? formatShareCount
      : formatCurrency;

    let row = `  ${padRight(metric.display_name, metricColWidth)}`;
    const values: number[] = [];

    for (const year of result.years) {
      const val = yearMap?.get(year);
      if (val !== undefined) {
        row += padRight(formatValue(val), yearColWidth);
        values.push(val);
      } else {
        row += padRight(chalk.dim('--'), yearColWidth);
      }
    }

    if (result.years.length >= 3 && values.length >= 2) {
      row += sparkline(values);
    }

    lines.push(row);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Renders multi-metric comparison as JSON.
 */
export function renderMultiMetricJson(result: MultiMetricResult): string {
  const data: Record<string, Record<string, number>> = {};
  for (const metric of result.metrics) {
    const yearMap = result.data.get(metric.id);
    if (yearMap) {
      const yearData: Record<string, number> = {};
      for (const [year, value] of yearMap) {
        yearData[`FY${year}`] = value;
      }
      data[metric.id] = yearData;
    }
  }

  return JSON.stringify({
    company: {
      cik: result.company.cik,
      ticker: result.company.ticker,
      name: result.company.name,
    },
    metrics: result.metrics.map(m => ({
      id: m.id,
      display_name: m.display_name,
      unit_type: m.unit_type,
    })),
    years: result.years,
    data,
  }, null, 2);
}

/**
 * Renders multi-metric comparison as CSV.
 * Format: metric_id, display_name, FY2020, FY2021, ...
 */
export function renderMultiMetricCsv(result: MultiMetricResult): string {
  const lines: string[] = [];

  // Header
  const yearHeaders = result.years.map(y => `FY${y}`);
  lines.push(['metric_id', 'display_name', ...yearHeaders].join(','));

  // Data rows
  for (const metric of result.metrics) {
    const yearMap = result.data.get(metric.id);
    const values = result.years.map(y => {
      const val = yearMap?.get(y);
      return val !== undefined ? String(val) : '';
    });
    lines.push([metric.id, csvEscape(metric.display_name), ...values].join(','));
  }

  return lines.join('\n');
}
