import chalk from 'chalk';
import { formatCurrency, formatShareCount } from './table-renderer.js';
import { padRight, csvEscape } from './format-utils.js';
import type { CompanyInfo, MetricDefinition } from '../core/types.js';

export interface SummaryDataPoint {
  metric: MetricDefinition;
  fiscal_year: number;
  value: number;
}

export interface SummaryResult {
  company: CompanyInfo;
  fiscal_year: number;
  metrics: Array<{
    metric: MetricDefinition;
    value: number;
    prior_year_value?: number;
    yoy_change?: number;
    year_values?: Array<{ fiscal_year: number; value: number }>;
  }>;
  derived: Array<{
    name: string;
    value: number;
    format: 'percentage' | 'currency' | 'multiple';
  }>;
}

export function renderSummaryTable(result: SummaryResult): string {
  const lines: string[] = [];

  const header = `${result.company.name} (${result.company.ticker}) — Financial Summary FY${result.fiscal_year}`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push('');

  // Group by statement type
  const groups: Record<string, typeof result.metrics> = {
    'Income Statement': [],
    'Cash Flow': [],
    'Balance Sheet': [],
  };

  for (const m of result.metrics) {
    const group = m.metric.statement_type === 'income_statement' ? 'Income Statement'
      : m.metric.statement_type === 'cash_flow' ? 'Cash Flow'
      : 'Balance Sheet';
    groups[group].push(m);
  }

  for (const [groupName, metrics] of Object.entries(groups)) {
    if (metrics.length === 0) continue;

    lines.push(chalk.bold.underline(`  ${groupName}`));

    for (const m of metrics) {
      const formatValue = m.metric.unit_type === 'ratio'
        ? `$${m.value.toFixed(2)}`
        : m.metric.unit_type === 'shares'
        ? formatShareCount(m.value)
        : formatCurrency(m.value);

      let changeStr = '';
      if (m.yoy_change !== undefined) {
        const pct = m.yoy_change;
        const pctStr = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
        changeStr = pct > 0 ? chalk.green(pctStr) : pct < 0 ? chalk.red(pctStr) : pctStr;
      }

      lines.push(`  ${padRight(m.metric.display_name, 30)}${padRight(formatValue, 16)}${changeStr}`);
    }

    lines.push('');
  }

  // Derived ratios
  if (result.derived.length > 0) {
    lines.push(chalk.bold.underline('  Key Ratios'));

    for (const d of result.derived) {
      let valueStr: string;
      if (d.format === 'percentage') {
        valueStr = `${d.value.toFixed(1)}%`;
      } else if (d.format === 'multiple') {
        valueStr = `${d.value.toFixed(2)}x`;
      } else {
        valueStr = formatCurrency(d.value);
      }

      lines.push(`  ${padRight(d.name, 30)}${valueStr}`);
    }

    lines.push('');
  }

  lines.push(chalk.dim('  Source: SEC EDGAR XBRL filings'));

  return lines.join('\n');
}

export function renderSummaryJson(result: SummaryResult): string {
  return JSON.stringify({
    company: { cik: result.company.cik, ticker: result.company.ticker, name: result.company.name },
    fiscal_year: result.fiscal_year,
    metrics: result.metrics.map(m => ({
      id: m.metric.id,
      display_name: m.metric.display_name,
      value: m.value,
      yoy_change_pct: m.yoy_change ?? null,
    })),
    derived_ratios: result.derived.map(d => ({
      name: d.name,
      value: d.value,
      format: d.format,
    })),
  }, null, 2);
}

/**
 * Render financial summary as CSV.
 * For single-year: section, metric_id, display_name, value, yoy_change_pct
 * For multi-year trend: section, metric_id, display_name, FY2020, FY2021, ...
 */
export function renderSummaryCsv(result: SummaryResult): string {
  const lines: string[] = [];

  // Detect if we have multi-year data
  const hasYearValues = result.metrics.some(m => m.year_values && m.year_values.length > 0);

  if (hasYearValues) {
    // Collect all years
    const allYears = new Set<number>();
    for (const m of result.metrics) {
      if (m.year_values) {
        for (const yv of m.year_values) allYears.add(yv.fiscal_year);
      }
    }
    const years = [...allYears].sort((a, b) => a - b);

    // Header
    const yearHeaders = years.map(y => `FY${y}`);
    lines.push(['section', 'metric_id', 'display_name', ...yearHeaders].join(','));

    // Metric rows
    for (const m of result.metrics) {
      const section = m.metric.statement_type === 'income_statement' ? 'Income Statement'
        : m.metric.statement_type === 'cash_flow' ? 'Cash Flow'
        : 'Balance Sheet';
      const yearMap = new Map(m.year_values?.map(yv => [yv.fiscal_year, yv.value]) ?? []);
      const values = years.map(y => {
        const val = yearMap.get(y);
        return val !== undefined ? String(val) : '';
      });
      lines.push([csvEscape(section), m.metric.id, csvEscape(m.metric.display_name), ...values].join(','));
    }

    // Derived ratios (single year only)
    for (const d of result.derived) {
      const values = years.map(y => y === result.fiscal_year ? String(d.value) : '');
      lines.push(['Derived Ratio', d.name.toLowerCase().replace(/\s+/g, '_'), csvEscape(d.name), ...values].join(','));
    }
  } else {
    // Single-year summary
    lines.push('section,metric_id,display_name,value,yoy_change_pct');

    for (const m of result.metrics) {
      const section = m.metric.statement_type === 'income_statement' ? 'Income Statement'
        : m.metric.statement_type === 'cash_flow' ? 'Cash Flow'
        : 'Balance Sheet';
      lines.push([
        csvEscape(section),
        m.metric.id,
        csvEscape(m.metric.display_name),
        String(m.value),
        m.yoy_change !== undefined ? String(m.yoy_change) : '',
      ].join(','));
    }

    for (const d of result.derived) {
      lines.push([
        'Derived Ratio',
        d.name.toLowerCase().replace(/\s+/g, '_'),
        csvEscape(d.name),
        String(d.value),
        '',
      ].join(','));
    }
  }

  return lines.join('\n');
}

/**
 * Render a multi-year trend view: metrics as rows, years as columns.
 */
export function renderSummaryTrendTable(result: SummaryResult): string {
  const lines: string[] = [];

  // Collect all years from the data
  const allYears = new Set<number>();
  for (const m of result.metrics) {
    if (m.year_values) {
      for (const yv of m.year_values) allYears.add(yv.fiscal_year);
    }
  }
  const years = [...allYears].sort((a, b) => a - b);
  if (years.length === 0) return renderSummaryTable(result);

  const header = `${result.company.name} (${result.company.ticker}) — Financial Trend FY${years[0]}-${years[years.length - 1]}`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push('');

  const COL_WIDTH = 14;
  const LABEL_WIDTH = 28;

  // Column headers
  const yearHeader = padRight('', LABEL_WIDTH) + years.map(y => padRight(`FY${y}`, COL_WIDTH)).join('');
  lines.push(chalk.dim(yearHeader));
  lines.push(chalk.dim('-'.repeat(LABEL_WIDTH + years.length * COL_WIDTH)));

  // Group by statement type
  const groups: Record<string, typeof result.metrics> = {
    'Income Statement': [],
    'Cash Flow': [],
    'Balance Sheet': [],
  };

  for (const m of result.metrics) {
    const group = m.metric.statement_type === 'income_statement' ? 'Income Statement'
      : m.metric.statement_type === 'cash_flow' ? 'Cash Flow'
      : 'Balance Sheet';
    groups[group].push(m);
  }

  for (const [groupName, metrics] of Object.entries(groups)) {
    if (metrics.length === 0) continue;

    lines.push(chalk.bold.underline(`  ${groupName}`));

    for (const m of metrics) {
      const yearMap = new Map(m.year_values?.map(yv => [yv.fiscal_year, yv.value]) ?? []);

      const formatFn = m.metric.unit_type === 'ratio'
        ? (v: number) => `$${v.toFixed(2)}`
        : m.metric.unit_type === 'shares'
        ? formatShareCount
        : formatCurrency;

      const cells = years.map(y => {
        const val = yearMap.get(y);
        return padRight(val !== undefined ? formatFn(val) : chalk.dim('—'), COL_WIDTH);
      }).join('');

      lines.push(`  ${padRight(m.metric.display_name, LABEL_WIDTH)}${cells}`);
    }

    lines.push('');
  }

  // Derived ratios (single year — most recent)
  if (result.derived.length > 0) {
    lines.push(chalk.bold.underline(`  Key Ratios (FY${result.fiscal_year})`));

    for (const d of result.derived) {
      let valueStr: string;
      if (d.format === 'percentage') {
        valueStr = `${d.value.toFixed(1)}%`;
      } else if (d.format === 'multiple') {
        valueStr = `${d.value.toFixed(2)}x`;
      } else {
        valueStr = formatCurrency(d.value);
      }

      lines.push(`  ${padRight(d.name, LABEL_WIDTH)}${valueStr}`);
    }

    lines.push('');
  }

  lines.push(chalk.dim('  Source: SEC EDGAR XBRL filings'));

  return lines.join('\n');
}
