/**
 * Renders insider trading activity as formatted terminal tables and JSON.
 */

import chalk from 'chalk';
import type { InsiderActivityResult, InsiderTransaction } from '../core/types.js';
import { TRANSACTION_CODE_LABELS } from '../processing/insider-processor.js';

export function renderInsiderTable(result: InsiderActivityResult): string {
  const { company, period_days, transactions, summary, provenance } = result;
  const lines: string[] = [];

  // Header
  const header = `Insider Transactions — ${company.name} (${company.ticker}) — Last ${period_days} Days`;
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('='.repeat(header.length)));
  lines.push('');

  // Signal summary
  const signalColor = summary.signal === 'bullish' ? chalk.green
    : summary.signal === 'bearish' ? chalk.red
    : summary.signal === 'mixed' ? chalk.yellow
    : chalk.dim;
  lines.push(`  Signal: ${signalColor(summary.signal.toUpperCase())}`);
  lines.push(`  Buys: ${summary.total_buys} txns (${formatValue(summary.buy_value)})  |  Sells: ${summary.total_sells} txns (${formatValue(summary.sell_value)})`);
  lines.push(`  Net shares: ${formatShares(summary.net_shares)}  |  ${summary.unique_insiders} unique insider(s)`);
  lines.push('');

  if (transactions.length === 0) {
    lines.push(chalk.dim('  No insider transactions in this period.'));
    lines.push('');
    return lines.join('\n');
  }

  // Table header
  const cols = {
    date: 12,
    insider: 24,
    title: 20,
    type: 10,
    shares: 14,
    price: 12,
    value: 12,
  };

  lines.push('  ' + chalk.underline(
    padRight('Date', cols.date) +
    padRight('Insider', cols.insider) +
    padRight('Title', cols.title) +
    padRight('Type', cols.type) +
    padRight('Shares', cols.shares) +
    padRight('Price', cols.price) +
    padRight('Value', cols.value)
  ));

  // Transaction rows
  for (const txn of transactions) {
    const typeLabel = TRANSACTION_CODE_LABELS[txn.transaction_code] || txn.transaction_code;
    const typeColored = txn.transaction_code === 'P' ? chalk.green(typeLabel)
      : txn.transaction_code === 'S' ? chalk.red(typeLabel)
      : chalk.dim(typeLabel);

    const sharesStr = txn.transaction_type === 'disposition'
      ? `-${formatNumber(txn.shares)}`
      : `+${formatNumber(txn.shares)}`;
    const sharesColored = txn.transaction_type === 'disposition' ? chalk.red(sharesStr) : chalk.green(sharesStr);

    const priceStr = txn.price_per_share != null ? `$${txn.price_per_share.toFixed(2)}` : '--';
    const valueStr = txn.total_value != null ? formatValue(txn.total_value) : '--';

    const title = truncate(txn.insider.officer_title || (txn.insider.is_director ? 'Director' : '10% Owner'), cols.title - 2);
    const insiderName = truncate(txn.insider.name, cols.insider - 2);

    lines.push('  ' +
      padRight(txn.transaction_date, cols.date) +
      padRight(insiderName, cols.insider) +
      padRight(title, cols.title) +
      padRight(typeColored, cols.type) +
      padRight(sharesColored, cols.shares) +
      padRight(priceStr, cols.price) +
      padRight(valueStr, cols.value)
    );
  }

  lines.push('');

  // Provenance
  lines.push(chalk.dim('  -- Provenance ' + '-'.repeat(45)));
  lines.push(chalk.dim(`  Source:   SEC EDGAR Form 4 filings`));
  lines.push(chalk.dim(`  Company:  CIK ${company.cik}`));
  lines.push(chalk.dim(`  Filings:  ${provenance.filing_count} Form 4 filings`));
  if (provenance.filing_date_range[0]) {
    lines.push(chalk.dim(`  Period:   ${provenance.filing_date_range[0]} to ${provenance.filing_date_range[1]}`));
  }

  return lines.join('\n');
}

export function renderInsiderJson(result: InsiderActivityResult): string {
  return JSON.stringify({
    company: {
      cik: result.company.cik,
      ticker: result.company.ticker,
      name: result.company.name,
    },
    period_days: result.period_days,
    summary: result.summary,
    transactions: result.transactions.map(t => ({
      date: t.transaction_date,
      insider: {
        name: t.insider.name,
        title: t.insider.officer_title || (t.insider.is_director ? 'Director' : ''),
      },
      type: t.transaction_code,
      type_label: TRANSACTION_CODE_LABELS[t.transaction_code] || t.transaction_code,
      direction: t.transaction_type,
      shares: t.shares,
      price: t.price_per_share,
      value: t.total_value,
      shares_after: t.shares_owned_after,
      filing: {
        accession: t.filing_accession,
        date: t.filing_date,
      },
    })),
    provenance: result.provenance,
  }, null, 2);
}

function formatValue(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatShares(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toLocaleString('en-US')}`;
}

function padRight(str: string, len: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - stripped.length);
  return str + ' '.repeat(padding);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}
