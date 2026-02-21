import chalk from 'chalk';
import { formatCurrency, formatShareCount, sparkline } from './table-renderer.js';
import { padRight } from './format-utils.js';
import { calculateCAGR, calculateYoYChangePct, computeGrowthSignal } from '../processing/calculations.js';
import type { QueryResult } from '../core/types.js';

/**
 * Renders an extended trend analysis for a metric.
 * Shows: sparkline, multi-period CAGRs, min/max, average, acceleration signal.
 */
export function renderTrendTable(result: QueryResult): string {
  const { company, metric, data_points } = result;
  const lines: string[] = [];

  const header = `${company.name} (${company.ticker}) — ${metric.display_name} Trend Analysis`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push('');

  if (data_points.length === 0) {
    lines.push(chalk.dim('  No data found.'));
    return lines.join('\n');
  }

  const formatValue = metric.unit_type === 'ratio'
    ? (v: number) => `$${v.toFixed(2)}`
    : metric.unit_type === 'shares'
    ? formatShareCount
    : formatCurrency;

  const values = data_points.map(dp => dp.value);
  const years = data_points.map(dp => dp.fiscal_year);

  // Data rows
  const fyColWidth = 10;
  const valueColWidth = Math.max(16, ...values.map(v => formatValue(v).length + 2));
  const changeColWidth = 12;

  lines.push(`  ${chalk.underline(padRight('FY', fyColWidth))}${chalk.underline(padRight(metric.display_name, valueColWidth))}${chalk.underline(padRight('YoY Change', changeColWidth))}`);

  for (let i = 0; i < data_points.length; i++) {
    const dp = data_points[i];
    let changeStr = chalk.dim('--');
    if (i > 0) {
      const pct = calculateYoYChangePct(dp.value, data_points[i - 1].value);
      if (pct !== null) {
        const pctStr = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
        changeStr = pct > 0 ? chalk.green(pctStr) : pct < 0 ? chalk.red(pctStr) : pctStr;
      }
    }
    lines.push(`  ${padRight(`FY${dp.fiscal_year}`, fyColWidth)}${padRight(formatValue(dp.value), valueColWidth)}${changeStr}`);
  }

  lines.push('');

  // Sparkline
  if (values.length >= 3) {
    lines.push(`  Trend: ${sparkline(values)}`);
    lines.push('');
  }

  // Multi-period CAGRs
  lines.push(chalk.bold('  Growth Rates'));
  const latestVal = values[values.length - 1];
  const n = values.length;

  const cagrPeriods = [
    { label: '1-Year', lookback: 1 },
    { label: '3-Year', lookback: 3 },
    { label: '5-Year', lookback: 5 },
    { label: '10-Year', lookback: 10 },
  ];

  for (const { label, lookback } of cagrPeriods) {
    if (n > lookback) {
      const startVal = values[n - 1 - lookback];
      const rate = calculateCAGR(startVal, latestVal, lookback);
      if (rate !== null) {
        const rateStr = (rate >= 0 ? '+' : '') + rate.toFixed(1) + '%';
        const colored = rate > 0 ? chalk.green(rateStr) : rate < 0 ? chalk.red(rateStr) : rateStr;
        lines.push(`  ${padRight(`${label} CAGR:`, 20)}${colored}`);
      }
    }
  }

  lines.push('');

  // Statistics
  lines.push(chalk.bold('  Statistics'));

  const posValues = values.filter(v => v > 0);
  if (posValues.length > 0) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const maxYear = years[values.indexOf(maxVal)];
    const minYear = years[values.indexOf(minVal)];

    lines.push(`  ${padRight('Average:', 20)}${formatValue(avg)}`);
    lines.push(`  ${padRight('High:', 20)}${formatValue(maxVal)} (FY${maxYear})`);
    lines.push(`  ${padRight('Low:', 20)}${formatValue(minVal)} (FY${minYear})`);

    // Relative to average
    const relToAvg = ((latestVal - avg) / Math.abs(avg)) * 100;
    const relStr = (relToAvg >= 0 ? '+' : '') + relToAvg.toFixed(1) + '% vs avg';
    const relColored = relToAvg > 0 ? chalk.green(relStr) : relToAvg < 0 ? chalk.red(relStr) : relStr;
    lines.push(`  ${padRight('Current vs Avg:', 20)}${relColored}`);
  }

  lines.push('');

  // Growth acceleration/deceleration
  const growthSignal = computeGrowthSignal(values);
  if (growthSignal) {
    lines.push(chalk.bold('  Growth Signal'));
    if (growthSignal.signal === 'accelerating') {
      lines.push(`  ${chalk.green('▲ Accelerating')} — Recent growth (${growthSignal.secondHalfAvg.toFixed(1)}%) > earlier growth (${growthSignal.firstHalfAvg.toFixed(1)}%)`);
    } else if (growthSignal.signal === 'decelerating') {
      lines.push(`  ${chalk.red('▼ Decelerating')} — Recent growth (${growthSignal.secondHalfAvg.toFixed(1)}%) < earlier growth (${growthSignal.firstHalfAvg.toFixed(1)}%)`);
    } else {
      lines.push(`  ${chalk.cyan('● Stable')} — Growth rate consistent (~${((growthSignal.firstHalfAvg + growthSignal.secondHalfAvg) / 2).toFixed(1)}%)`);
    }
    lines.push('');
  }

  // Provenance
  const { provenance } = result;
  lines.push(chalk.dim('  -- Provenance ' + '-'.repeat(45)));
  lines.push(chalk.dim(`  Metric:   ${provenance.metric_concept}`));
  lines.push(chalk.dim(`  Dedup:    ${provenance.dedup_strategy}`));
  lines.push(chalk.dim(`  Period:   ${provenance.period_type}`));

  return lines.join('\n');
}

/**
 * Renders trend analysis as JSON with computed analytics.
 */
export function renderTrendJson(result: QueryResult): string {
  const values = result.data_points.map(dp => dp.value);
  const n = values.length;

  // Compute CAGRs
  const cagrs: Record<string, number | null> = {};
  for (const lookback of [1, 3, 5, 10]) {
    if (n > lookback) {
      cagrs[`${lookback}y`] = calculateCAGR(values[n - 1 - lookback], values[n - 1], lookback);
    }
  }

  // Statistics
  const avg = n > 0 ? values.reduce((a, b) => a + b, 0) / n : null;
  const maxVal = n > 0 ? Math.max(...values) : null;
  const minVal = n > 0 ? Math.min(...values) : null;

  // Growth signal
  const growthResult = computeGrowthSignal(values);
  const signal = growthResult?.signal ?? null;

  return JSON.stringify({
    company: { cik: result.company.cik, ticker: result.company.ticker, name: result.company.name },
    metric: { id: result.metric.id, display_name: result.metric.display_name },
    data: result.data_points.map(dp => ({
      fiscal_year: dp.fiscal_year,
      value: dp.value,
    })),
    analysis: {
      cagr: cagrs,
      statistics: { average: avg, high: maxVal, low: minVal },
      growth_signal: signal,
    },
    provenance: result.provenance,
  }, null, 2);
}

/**
 * Renders trend analysis as CSV.
 */
export function renderTrendCsv(result: QueryResult): string {
  const lines: string[] = [];
  lines.push('fiscal_year,value,yoy_change_pct');

  for (let i = 0; i < result.data_points.length; i++) {
    const dp = result.data_points[i];
    const yoy = i > 0 ? calculateYoYChangePct(dp.value, result.data_points[i - 1].value) : null;
    lines.push(`${dp.fiscal_year},${dp.value},${yoy !== null ? yoy.toFixed(1) : ''}`);
  }

  return lines.join('\n');
}
