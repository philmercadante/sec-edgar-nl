import chalk from 'chalk';
import { formatCurrency } from './table-renderer.js';
import type { RatioResult } from '../core/query-engine.js';

export function renderRatioTable(result: RatioResult): string {
  const { company, ratio, data_points } = result;
  const lines: string[] = [];

  const header = `${company.name} (${company.ticker}) — ${ratio.display_name} (Last ${data_points.length} Fiscal Years)`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push(chalk.dim(`  ${ratio.description}`));
  lines.push(chalk.dim(`  Formula: ${result.numerator_metric} ${ratio.operation === 'subtract' ? '−' : '÷'} ${result.denominator_metric}`));
  lines.push('');

  // Table header
  const colYear = 'Fiscal Year';
  const colValue = ratio.display_name;
  const colNum = result.numerator_metric;
  const colDen = result.denominator_metric;
  lines.push(`  ${chalk.underline(padRight(colYear, 14))}${chalk.underline(padRight(colValue, 16))}${chalk.underline(padRight(colNum, 18))}${chalk.underline(colDen)}`);

  // Table rows
  for (const dp of data_points) {
    const yearStr = `FY${dp.fiscal_year}`;
    const valueStr = formatRatioValue(dp.value, ratio.format);
    const numStr = formatCurrency(dp.numerator_value);
    const denStr = formatCurrency(dp.denominator_value);

    lines.push(`  ${padRight(yearStr, 14)}${padRight(valueStr, 16)}${padRight(numStr, 18)}${denStr}`);
  }

  // Trend arrow
  if (data_points.length >= 2) {
    const first = data_points[0].value;
    const last = data_points[data_points.length - 1].value;
    const diff = last - first;
    lines.push('');
    const trendStr = diff > 0 ? chalk.green(`+${formatDelta(diff, ratio.format)} ↑`) : diff < 0 ? chalk.red(`${formatDelta(diff, ratio.format)} ↓`) : chalk.dim('Flat →');
    lines.push(`  Trend (FY${data_points[0].fiscal_year}→FY${data_points[data_points.length - 1].fiscal_year}): ${trendStr}`);
  }

  return lines.join('\n');
}

export function renderRatioJson(result: RatioResult): string {
  return JSON.stringify({
    company: { cik: result.company.cik, ticker: result.company.ticker, name: result.company.name },
    ratio: { id: result.ratio.id, display_name: result.ratio.display_name, description: result.ratio.description },
    formula: {
      numerator: result.numerator_metric,
      denominator: result.denominator_metric,
      operation: result.ratio.operation || 'divide',
    },
    data: result.data_points,
  }, null, 2);
}

export function renderRatioCsv(result: RatioResult): string {
  const lines: string[] = [];
  const { ratio, data_points } = result;

  lines.push(`Period,${ratio.display_name},${result.numerator_metric},${result.denominator_metric}`);

  for (const dp of data_points) {
    lines.push([
      `FY${dp.fiscal_year}`,
      dp.value.toString(),
      dp.numerator_value.toString(),
      dp.denominator_value.toString(),
    ].join(','));
  }

  return lines.join('\n');
}

function formatRatioValue(value: number, format: string): string {
  switch (format) {
    case 'percentage':
      return colorPct(value);
    case 'multiple':
      return `${value.toFixed(2)}x`;
    case 'currency':
      return formatCurrency(value);
    default:
      return value.toFixed(2);
  }
}

function formatDelta(value: number, format: string): string {
  const abs = Math.abs(value);
  switch (format) {
    case 'percentage':
      return `${abs.toFixed(1)}pp`;
    case 'multiple':
      return `${abs.toFixed(2)}x`;
    case 'currency':
      return formatCurrency(value);
    default:
      return abs.toFixed(2);
  }
}

function colorPct(value: number): string {
  const str = `${value.toFixed(1)}%`;
  if (value >= 20) return chalk.green(str);
  if (value >= 10) return chalk.cyan(str);
  if (value < 0) return chalk.red(str);
  return str;
}

function padRight(str: string, len: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - stripped.length);
  return str + ' '.repeat(padding);
}
