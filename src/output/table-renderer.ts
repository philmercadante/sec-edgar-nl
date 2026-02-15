import chalk from 'chalk';
import type { QueryResult } from '../core/types.js';

/**
 * Renders query results as formatted terminal tables with provenance.
 * Supports both annual (FY) and quarterly (Q1-Q4) display.
 */

export function renderTable(result: QueryResult): string {
  const { company, metric, data_points, calculations, provenance } = result;
  const isQuarterly = data_points.some(dp => dp.fiscal_period !== 'FY');
  const lines: string[] = [];

  // Header
  const periodLabel = isQuarterly
    ? `Last ${data_points.length} Quarters`
    : `Last ${data_points.length} Fiscal Years`;
  const header = `${company.name} (${company.ticker}) — ${metric.display_name} (${periodLabel})`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push('');

  // Compute value column width from data
  const valueColWidth = Math.max(
    metric.display_name.length + 2,
    ...data_points.map(dp => formatCurrency(dp.value).length + 2),
    16
  );

  // Table header
  const colPeriod = isQuarterly ? 'Quarter' : 'Fiscal Year';
  const colValue = metric.display_name;
  const colChange = isQuarterly ? 'QoQ Change' : 'YoY Change';
  lines.push(`  ${chalk.underline(padRight(colPeriod, 14))}${chalk.underline(padRight(colValue, valueColWidth))}${chalk.underline(padRight(colChange, 12))}`);

  // Table rows
  for (let i = 0; i < data_points.length; i++) {
    const dp = data_points[i];
    const periodStr = isQuarterly
      ? `${dp.fiscal_period} ${dp.fiscal_year}`
      : `FY${dp.fiscal_year}`;

    let changeStr = '--';
    if (i > 0) {
      const yoy = calculations.yoy_changes.find(y => y.year === dp.fiscal_year);
      if (isQuarterly) {
        // For quarterly, compute sequential QoQ
        const prev = data_points[i - 1].value;
        if (prev !== 0 && !((prev > 0 && dp.value < 0) || (prev < 0 && dp.value > 0))) {
          const change = ((dp.value - prev) / Math.abs(prev)) * 100;
          changeStr = formatChange(Math.round(change * 10) / 10);
        }
      } else if (yoy?.change_pct != null) {
        changeStr = formatChange(yoy.change_pct);
      }
    }

    lines.push(`  ${padRight(periodStr, 14)}${padRight(formatCurrency(dp.value), valueColWidth)}${changeStr}`);
  }

  lines.push('');

  // CAGR (annual only)
  if (!isQuarterly && calculations.cagr != null) {
    lines.push(`  ${calculations.cagr_years}-Year CAGR: ${chalk.bold(calculations.cagr.toFixed(1) + '%')}`);
    lines.push('');
  }

  // Provenance
  lines.push(chalk.dim('  -- Provenance ' + '-'.repeat(45)));
  lines.push(chalk.dim(`  Metric:   ${provenance.metric_concept}`));

  lines.push(chalk.dim('  Filings:  ' + provenance.filings_used.map(f =>
    `${f.accession_number} (FY${f.fiscal_year} ${f.form_type})`
  ).join('\n            ')));

  lines.push(chalk.dim(`  Dedup:    ${provenance.dedup_strategy}`));
  lines.push(chalk.dim(`  Period:   ${provenance.period_type}`));

  if (provenance.notes.length > 0) {
    lines.push(chalk.dim(`  Notes:    ${provenance.notes.join('; ')}`));
  }

  return lines.join('\n');
}

export function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatChange(pct: number): string {
  const str = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  if (pct > 0) return chalk.green(str);
  if (pct < 0) return chalk.red(str);
  return str;
}

function padRight(str: string, len: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - stripped.length);
  return str + ' '.repeat(padding);
}
