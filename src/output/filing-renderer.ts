import chalk from 'chalk';
import type { CompanyInfo } from '../core/types.js';
import { padRight, csvEscape } from './format-utils.js';

export interface Filing {
  form_type: string;
  filing_date: string;
  description: string;
  accession_number: string;
  edgar_url: string;
}

export interface FilingListResult {
  company: CompanyInfo;
  filings: Filing[];
  total_available: number;
}

export function renderFilingTable(result: FilingListResult): string {
  const lines: string[] = [];

  const header = `${result.company.name} (${result.company.ticker}) — Recent Filings`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push('');

  if (result.filings.length === 0) {
    lines.push(chalk.dim('  No filings found.'));
    return lines.join('\n');
  }

  // Table header
  lines.push(`  ${chalk.underline(padRight('Date', 14))}${chalk.underline(padRight('Form', 10))}${chalk.underline(padRight('Description', 40))}${chalk.underline('Accession')}`);

  for (const f of result.filings) {
    const formStr = colorForm(f.form_type);
    const desc = f.description.length > 38 ? f.description.slice(0, 35) + '...' : f.description;
    lines.push(`  ${padRight(f.filing_date, 14)}${padRight(formStr, 10)}${padRight(desc, 40)}${chalk.dim(f.accession_number)}`);
  }

  lines.push('');
  if (result.filings.length < result.total_available) {
    lines.push(chalk.dim(`  Showing ${result.filings.length} of ${result.total_available} filings`));
  }
  lines.push(chalk.dim(`  View on EDGAR: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${result.company.cik}&type=&dateb=&owner=include&count=40`));

  return lines.join('\n');
}

export function renderFilingCsv(result: FilingListResult): string {
  const lines: string[] = [];
  lines.push('form_type,filing_date,description,accession_number,edgar_url');

  for (const f of result.filings) {
    lines.push([
      f.form_type,
      f.filing_date,
      csvEscape(f.description),
      f.accession_number,
      f.edgar_url,
    ].join(','));
  }

  return lines.join('\n');
}

export function renderFilingJson(result: FilingListResult): string {
  return JSON.stringify({
    company: {
      cik: result.company.cik,
      ticker: result.company.ticker,
      name: result.company.name,
    },
    filings: result.filings,
    total_available: result.total_available,
  }, null, 2);
}

function colorForm(form: string): string {
  if (form.startsWith('10-K')) return chalk.green(form);
  if (form.startsWith('10-Q')) return chalk.cyan(form);
  if (form === '8-K') return chalk.yellow(form);
  if (form === '4' || form === '4/A') return chalk.magenta(form);
  if (form.startsWith('S-')) return chalk.red(form);
  return form;
}

