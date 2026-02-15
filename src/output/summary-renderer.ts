import chalk from 'chalk';
import { formatCurrency, formatShareCount } from './table-renderer.js';
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

function padRight(str: string, len: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - stripped.length);
  return str + ' '.repeat(padding);
}
