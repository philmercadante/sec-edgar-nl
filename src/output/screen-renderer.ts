import chalk from 'chalk';
import { formatCurrency, formatShareCount } from './table-renderer.js';
import type { ScreenResult } from '../core/query-engine.js';

export function renderScreenTable(result: ScreenResult): string {
  const lines: string[] = [];

  const header = `${result.metric.display_name} — ${result.period} (${result.filtered_companies} of ${result.total_companies} companies)`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push('');

  const formatValue = result.metric.unit_type === 'ratio'
    ? (v: number) => `$${v.toFixed(2)}`
    : result.metric.unit_type === 'shares'
    ? formatShareCount
    : formatCurrency;

  // Column headers
  lines.push(
    chalk.dim(
      `  ${padRight('#', 5)}${padRight('Company', 42)}${padRight('Value', 16)}${padRight('Location', 8)}`
    )
  );
  lines.push(chalk.dim('  ' + '-'.repeat(71)));

  for (let i = 0; i < result.companies.length; i++) {
    const c = result.companies[i];
    const rank = chalk.dim(`${(i + 1).toString()}.`);
    const name = c.entity_name.length > 38 ? c.entity_name.slice(0, 35) + '...' : c.entity_name;
    const value = formatValue(c.value);
    const loc = c.location || '';

    lines.push(`  ${padRight(rank, 5)}${padRight(name, 42)}${padRight(value, 16)}${loc}`);
  }

  lines.push('');
  lines.push(chalk.dim(`  Source: SEC EDGAR Frames API (${result.period})`));

  return lines.join('\n');
}

export function renderScreenJson(result: ScreenResult): string {
  return JSON.stringify({
    metric: { id: result.metric.id, display_name: result.metric.display_name },
    period: result.period,
    total_companies: result.total_companies,
    filtered_companies: result.filtered_companies,
    companies: result.companies.map(c => ({
      cik: c.cik,
      entity_name: c.entity_name,
      location: c.location,
      value: c.value,
      period_start: c.period_start,
      period_end: c.period_end,
      accession_number: c.accession_number,
    })),
  }, null, 2);
}

export function renderScreenCsv(result: ScreenResult): string {
  const lines: string[] = [];
  lines.push('rank,cik,entity_name,location,value,period_start,period_end,accession_number');

  for (let i = 0; i < result.companies.length; i++) {
    const c = result.companies[i];
    const name = c.entity_name.includes(',') ? `"${c.entity_name}"` : c.entity_name;
    lines.push(`${i + 1},${c.cik},${name},${c.location},${c.value},${c.period_start},${c.period_end},${c.accession_number}`);
  }

  return lines.join('\n');
}

function padRight(str: string, len: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - stripped.length);
  return str + ' '.repeat(padding);
}
