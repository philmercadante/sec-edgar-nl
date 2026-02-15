#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { parseQuery } from './analysis/query-parser.js';
import { executeQueryCore, executeCompareCore, executeRatioCore, executeSummaryCore } from './core/query-engine.js';
import { renderTable } from './output/table-renderer.js';
import { renderJson } from './output/json-renderer.js';
import { renderComparison, renderComparisonJson } from './output/comparison-renderer.js';
import { renderCsv, renderComparisonCsv } from './output/csv-renderer.js';
import { closeCache, clearCache, getCacheStats, addToWatchlist, removeFromWatchlist, getWatchlist, updateWatchlistEntry, clearWatchlist } from './core/cache.js';
import { METRIC_DEFINITIONS, findMetricByName, getMetricDefinition } from './processing/metric-definitions.js';
import { fetchInsiderActivity } from './processing/insider-processor.js';
import { renderInsiderTable, renderInsiderJson } from './output/insider-renderer.js';
import { resolveCompanyWithSuggestions } from './core/resolver.js';
import { getCompanySubmissions, getCompanyFacts } from './core/sec-client.js';
import { renderFilingTable, renderFilingJson, type Filing, type FilingListResult } from './output/filing-renderer.js';
import { RATIO_DEFINITIONS, findRatioByName } from './processing/ratio-definitions.js';
import { renderRatioTable, renderRatioJson, renderRatioCsv } from './output/ratio-renderer.js';
import { renderSummaryTable, renderSummaryJson, renderSummaryTrendTable } from './output/summary-renderer.js';

function formatWatchValue(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function validatePositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) {
    console.error(chalk.red(`Invalid ${name}: "${value}". Must be a positive integer.`));
    process.exit(1);
  }
  return n;
}

async function executeQuery(queryStr: string, options: { json?: boolean; csv?: boolean; years?: string; all?: boolean; year?: string }): Promise<void> {
  try {
    const parsed = parseQuery(queryStr);

    // Override years from explicit flag only
    if (options.all) {
      parsed.years = 100; // Effectively unlimited
    } else if (options.years) {
      const years = validatePositiveInt(options.years, '--years')!;
      parsed.years = years;
    }

    // Override target year from explicit flag
    if (options.year) {
      const yr = validatePositiveInt(options.year, '--year')!;
      parsed.targetYear = yr;
    }

    if (!parsed.company) {
      console.error(chalk.red('Could not identify a company in your query.'));
      console.error('Try: sec-edgar-nl query "Apple R&D spending 5 years"');
      process.exit(1);
    }

    if (!parsed.metric) {
      console.error(chalk.red(`Could not identify a metric in your query: "${queryStr}"`));
      console.error('\nSupported metrics:');
      for (const m of METRIC_DEFINITIONS) {
        console.error(`  ${chalk.cyan(m.id.padEnd(22))} ${m.display_name}`);
      }
      process.exit(1);
    }

    const result = await executeQueryCore({
      company: parsed.company,
      metric: parsed.metric.id,
      years: parsed.years,
      periodType: parsed.periodType,
      quarters: parsed.quarters,
      targetYear: parsed.targetYear,
    });

    if (!result.success) {
      const err = result.error!;
      switch (err.type) {
        case 'company_ambiguous':
          console.error(chalk.red(`Ambiguous company: "${parsed.company}". Did you mean:`));
          for (const s of err.suggestions!) {
            console.error(`  ${chalk.cyan(s.ticker.padEnd(8))} ${s.name}`);
          }
          break;
        case 'company_not_found':
          console.error(chalk.red(err.message));
          break;
        case 'no_data':
          console.error(chalk.red(err.message));
          if (err.conceptsTried) {
            console.error(chalk.dim('Tried XBRL concepts:'));
            for (const c of err.conceptsTried) {
              const status = c.found
                ? (c.annual_count > 0 ? chalk.yellow(`${c.annual_count} facts, max FY${c.max_fiscal_year}`) : chalk.dim('found but no data'))
                : chalk.red('not found');
              console.error(chalk.dim(`  ${c.taxonomy}:${c.concept} — ${status}`));
            }
          }
          break;
        default:
          console.error(chalk.red(err.message));
      }
      process.exit(1);
    }

    const r = result.result!;

    // Note if fewer years than requested
    if (r.data_points.length < parsed.years && parsed.periodType === 'annual') {
      console.error(chalk.yellow(
        `Note: Only ${r.data_points.length} years of data available (requested ${parsed.years})`
      ));
    }

    // Render
    if (options.json) {
      console.log(renderJson(r));
    } else if (options.csv) {
      console.log(renderCsv(r));
    } else {
      console.log('');
      console.log(renderTable(r));
      console.log('');
    }
  } catch (err) {
    console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  } finally {
    closeCache();
  }
}

const program = new Command();

program
  .name('sec-edgar-nl')
  .description('Trustworthy financial answers from SEC EDGAR filings with full provenance')
  .version('0.3.0');

program
  .command('query')
  .alias('q')
  .description('Query a financial metric for a company')
  .argument('<query...>', 'Natural language query (e.g., "Apple R&D spending 5 years")')
  .option('-j, --json', 'Output as JSON instead of table')
  .option('-c, --csv', 'Output as CSV')
  .option('-y, --years <n>', 'Number of years to show')
  .option('-a, --all', 'Show full available history')
  .option('--year <yyyy>', 'Show a specific fiscal year')
  .action(async (queryParts: string[], options: { json?: boolean; csv?: boolean; years?: string; all?: boolean; year?: string }) => {
    await executeQuery(queryParts.join(' '), options);
  });

program
  .command('metrics')
  .description('List all supported metrics')
  .action(() => {
    console.log(chalk.bold('\nSupported Metrics\n'));
    for (const m of METRIC_DEFINITIONS) {
      console.log(`  ${chalk.cyan(m.id.padEnd(22))} ${m.display_name}`);
      console.log(`  ${''.padEnd(22)} ${chalk.dim(m.description)}`);
      console.log(`  ${''.padEnd(22)} ${chalk.dim('XBRL: ' + m.xbrl_concepts.map(c => c.concept).join(', '))}`);
      console.log('');
    }
  });

program
  .command('cache')
  .description('Manage the local cache')
  .option('--clear', 'Clear all cached data')
  .option('--stats', 'Show cache statistics')
  .action((options: { clear?: boolean; stats?: boolean }) => {
    if (options.clear) {
      clearCache();
      console.log(chalk.green('Cache cleared.'));
    } else if (options.stats) {
      const stats = getCacheStats();
      const sizeMb = (stats.sizeBytes / 1024 / 1024).toFixed(1);
      console.log(`\n  Cache entries: ${stats.entries}`);
      console.log(`  Cache size:    ${sizeMb} MB`);
      console.log(`  Location:      ~/.sec-edgar-nl/cache.db\n`);
    } else {
      const stats = getCacheStats();
      const sizeMb = (stats.sizeBytes / 1024 / 1024).toFixed(1);
      console.log(`\n  Cache: ${stats.entries} entries, ${sizeMb} MB`);
      console.log(`  Use --clear to reset, --stats for details\n`);
    }
    closeCache();
  });

program
  .command('compare')
  .alias('cmp')
  .description('Compare a metric across multiple companies (e.g., compare AAPL MSFT GOOGL revenue)')
  .argument('<args...>', 'Tickers and metric name')
  .option('-j, --json', 'Output as JSON')
  .option('-c, --csv', 'Output as CSV')
  .option('-y, --years <n>', 'Number of years', '5')
  .action(async (args: string[], options: { json?: boolean; csv?: boolean; years?: string }) => {
    try {
      const years = validatePositiveInt(options.years || '5', '--years')!;

      // Separate tickers from metric name
      const tickers: string[] = [];
      const metricWords: string[] = [];

      for (const arg of args) {
        if (/^[A-Z]{1,5}(-[A-Z])?$/.test(arg.toUpperCase()) && arg.length <= 6) {
          tickers.push(arg.toUpperCase());
        } else {
          metricWords.push(arg);
        }
      }

      if (tickers.length < 2) {
        console.error(chalk.red('Compare requires at least 2 company tickers.'));
        console.error('Usage: sec-edgar-nl compare AAPL MSFT GOOGL revenue');
        process.exit(1);
      }

      const metricStr = metricWords.join(' ');
      const metric = findMetricByName(metricStr);
      if (!metric) {
        console.error(chalk.red(`Could not identify metric: "${metricStr}"`));
        console.error('\nSupported metrics:');
        for (const m of METRIC_DEFINITIONS) {
          console.error(`  ${chalk.cyan(m.id.padEnd(22))} ${m.display_name}`);
        }
        process.exit(1);
      }

      const { results, errors } = await executeCompareCore({
        tickers,
        metric: metric.id,
        years,
      });

      for (const err of errors) {
        console.error(chalk.yellow(`${err.ticker}: ${err.message}`));
      }

      if (results.length === 0) {
        console.error(chalk.red('No data found for any company.'));
        process.exit(1);
      }

      if (options.json) {
        console.log(renderComparisonJson(results));
      } else if (options.csv) {
        console.log(renderComparisonCsv(results));
      } else {
        console.log('');
        console.log(renderComparison(results));
        console.log('');
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    } finally {
      closeCache();
    }
  });

program
  .command('ratio')
  .description('Compute a derived financial ratio (e.g., ratio AAPL net_margin)')
  .argument('<company>', 'Company ticker or name')
  .argument('<ratio>', 'Ratio name (e.g., net_margin, gross_margin, fcf, debt_to_equity)')
  .option('-y, --years <n>', 'Number of years', '5')
  .option('-j, --json', 'Output as JSON')
  .option('-c, --csv', 'Output as CSV')
  .action(async (companyArg: string, ratioArg: string, options: { years?: string; json?: boolean; csv?: boolean }) => {
    try {
      const years = validatePositiveInt(options.years || '5', '--years')!;

      const result = await executeRatioCore({
        company: companyArg,
        ratio: ratioArg,
        years,
      });

      if (!result.success) {
        const err = result.error!;
        if (err.type === 'ratio_not_found') {
          console.error(chalk.red(err.message));
          console.error('\nAvailable ratios:');
          for (const r of RATIO_DEFINITIONS) {
            console.error(`  ${chalk.cyan(r.id.padEnd(22))} ${r.display_name}`);
          }
        } else if (err.type === 'company_ambiguous') {
          console.error(chalk.red(`Ambiguous company: "${companyArg}". Did you mean:`));
          for (const s of err.suggestions!) {
            console.error(`  ${chalk.cyan(s.ticker.padEnd(8))} ${s.name}`);
          }
        } else {
          console.error(chalk.red(err.message));
        }
        process.exit(1);
      }

      const r = result.result!;
      if (options.json) {
        console.log(renderRatioJson(r));
      } else if (options.csv) {
        console.log(renderRatioCsv(r));
      } else {
        console.log('');
        console.log(renderRatioTable(r));
        console.log('');
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    } finally {
      closeCache();
    }
  });

program
  .command('ratios')
  .description('List all supported financial ratios')
  .action(() => {
    console.log(chalk.bold('\nSupported Financial Ratios\n'));
    for (const r of RATIO_DEFINITIONS) {
      console.log(`  ${chalk.cyan(r.id.padEnd(22))} ${r.display_name}`);
      console.log(`  ${''.padEnd(22)} ${chalk.dim(r.description)}`);
      console.log('');
    }
  });

program
  .command('summary')
  .description('Financial summary of a company — all metrics at a glance')
  .argument('<company>', 'Company ticker or name')
  .option('--year <yyyy>', 'Specific fiscal year (default: most recent)')
  .option('-y, --years <n>', 'Show multi-year trend (e.g., 5 for last 5 years)')
  .option('-j, --json', 'Output as JSON')
  .action(async (companyArg: string, options: { year?: string; years?: string; json?: boolean }) => {
    try {
      const year = options.year ? validatePositiveInt(options.year, '--year') : undefined;
      const years = options.years ? validatePositiveInt(options.years, '--years') : undefined;

      const result = await executeSummaryCore({
        company: companyArg,
        year,
        years,
      });

      if (!result.success) {
        const err = result.error!;
        if (err.type === 'company_ambiguous') {
          console.error(chalk.red(`Ambiguous company: "${companyArg}". Did you mean:`));
          for (const s of err.suggestions!) {
            console.error(`  ${chalk.cyan(s.ticker.padEnd(8))} ${s.name}`);
          }
        } else {
          console.error(chalk.red(err.message));
        }
        process.exit(1);
      }

      if (options.json) {
        console.log(renderSummaryJson(result.result!));
      } else if (years) {
        console.log('');
        console.log(renderSummaryTrendTable(result.result!));
        console.log('');
      } else {
        console.log('');
        console.log(renderSummaryTable(result.result!));
        console.log('');
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    } finally {
      closeCache();
    }
  });

program
  .command('insiders')
  .alias('insider')
  .description('Show insider trading activity for a company (e.g., insiders AAPL)')
  .argument('<company>', 'Company ticker or name')
  .option('-d, --days <n>', 'Number of days to look back', '90')
  .option('-j, --json', 'Output as JSON')
  .action(async (companyArg: string, options: { days?: string; json?: boolean }) => {
    try {
      const days = validatePositiveInt(options.days || '90', '--days')!;

      const resolved = await resolveCompanyWithSuggestions(companyArg);
      if (!resolved.company) {
        if (resolved.suggestions.length > 0) {
          console.error(chalk.red(`Ambiguous company: "${companyArg}". Did you mean:`));
          for (const s of resolved.suggestions) {
            console.error(`  ${chalk.cyan(s.ticker.padEnd(8))} ${s.name}`);
          }
        } else {
          console.error(chalk.red(`Could not find company: "${companyArg}"`));
        }
        process.exit(1);
      }

      const result = await fetchInsiderActivity(resolved.company, { days });

      if (options.json) {
        console.log(renderInsiderJson(result));
      } else {
        console.log('');
        console.log(renderInsiderTable(result));
        console.log('');
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    } finally {
      closeCache();
    }
  });

program
  .command('filings')
  .alias('filing')
  .description('List recent SEC filings for a company (e.g., filings AAPL)')
  .argument('<company>', 'Company ticker or name')
  .option('-f, --form <type>', 'Filter by form type (e.g., 10-K, 10-Q, 8-K, 4)')
  .option('-n, --limit <n>', 'Number of filings to show', '20')
  .option('-j, --json', 'Output as JSON')
  .action(async (companyArg: string, options: { form?: string; limit?: string; json?: boolean }) => {
    try {
      const limit = validatePositiveInt(options.limit || '20', '--limit')!;

      const resolved = await resolveCompanyWithSuggestions(companyArg);
      if (!resolved.company) {
        if (resolved.suggestions.length > 0) {
          console.error(chalk.red(`Ambiguous company: "${companyArg}". Did you mean:`));
          for (const s of resolved.suggestions) {
            console.error(`  ${chalk.cyan(s.ticker.padEnd(8))} ${s.name}`);
          }
        } else {
          console.error(chalk.red(`Could not find company: "${companyArg}"`));
        }
        process.exit(1);
      }

      const submissions = await getCompanySubmissions(resolved.company.cik);
      const { recent } = submissions.filings;

      const filings: Filing[] = [];
      const paddedCik = resolved.company.cik.padStart(10, '0');

      for (let i = 0; i < recent.form.length && filings.length < limit; i++) {
        if (options.form && !recent.form[i].startsWith(options.form.toUpperCase())) continue;

        const accessionNoDashes = recent.accessionNumber[i].replace(/-/g, '');
        filings.push({
          form_type: recent.form[i],
          filing_date: recent.filingDate[i],
          description: recent.primaryDocDescription[i] || recent.form[i],
          accession_number: recent.accessionNumber[i],
          edgar_url: `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${accessionNoDashes}/${recent.primaryDocument[i]}`,
        });
      }

      const result: FilingListResult = {
        company: {
          cik: resolved.company.cik,
          ticker: resolved.company.ticker,
          name: resolved.company.name,
          fiscal_year_end_month: 0,
        },
        filings,
        total_available: recent.form.length,
      };

      if (options.json) {
        console.log(renderFilingJson(result));
      } else {
        console.log('');
        console.log(renderFilingTable(result));
        console.log('');
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    } finally {
      closeCache();
    }
  });

program
  .command('concepts')
  .description('Explore XBRL concepts available for a company from SEC EDGAR')
  .argument('<company>', 'Company ticker or name')
  .option('-s, --search <term>', 'Filter concepts by name or label')
  .option('-n, --limit <n>', 'Maximum concepts to show', '50')
  .option('-j, --json', 'Output as JSON')
  .action(async (companyArg: string, options: { search?: string; limit?: string; json?: boolean }) => {
    try {
      const limit = validatePositiveInt(options.limit || '50', '--limit')!;

      const resolved = await resolveCompanyWithSuggestions(companyArg);
      if (!resolved.company) {
        if (resolved.suggestions.length > 0) {
          console.error(chalk.red(`Ambiguous company: "${companyArg}". Did you mean:`));
          for (const s of resolved.suggestions) {
            console.error(`  ${chalk.cyan(s.ticker.padEnd(8))} ${s.name}`);
          }
        } else {
          console.error(chalk.red(`Could not find company: "${companyArg}"`));
        }
        process.exit(1);
      }

      const facts = await getCompanyFacts(resolved.company.cik);
      const searchLower = options.search?.toLowerCase();

      interface ConceptInfo {
        taxonomy: string;
        concept: string;
        label: string;
        units: string[];
        fact_count: number;
        min_year: number | null;
        max_year: number | null;
      }

      const concepts: ConceptInfo[] = [];

      for (const [taxonomy, taxConcepts] of Object.entries(facts.facts)) {
        for (const [concept, data] of Object.entries(taxConcepts)) {
          // Apply search filter
          if (searchLower) {
            const matchable = `${concept} ${data.label} ${data.description}`.toLowerCase();
            if (!matchable.includes(searchLower)) continue;
          }

          const units = Object.keys(data.units);
          let factCount = 0;
          let minYear: number | null = null;
          let maxYear: number | null = null;

          for (const unitFacts of Object.values(data.units)) {
            factCount += unitFacts.length;
            for (const f of unitFacts) {
              if (f.fy) {
                if (minYear === null || f.fy < minYear) minYear = f.fy;
                if (maxYear === null || f.fy > maxYear) maxYear = f.fy;
              }
            }
          }

          concepts.push({ taxonomy, concept, label: data.label, units, fact_count: factCount, min_year: minYear, max_year: maxYear });
        }
      }

      // Sort by fact count descending (most data first)
      concepts.sort((a, b) => b.fact_count - a.fact_count);
      const shown = concepts.slice(0, limit);

      if (options.json) {
        console.log(JSON.stringify({
          company: { cik: resolved.company.cik, ticker: resolved.company.ticker, name: resolved.company.name },
          total_concepts: concepts.length,
          concepts: shown,
        }, null, 2));
      } else {
        const header = `${resolved.company.name} (${resolved.company.ticker}) — XBRL Concepts`;
        console.log('');
        console.log(chalk.bold(header));
        console.log(chalk.dim('='.repeat(header.length)));
        if (searchLower) console.log(chalk.dim(`  Filter: "${options.search}"`));
        console.log(chalk.dim(`  ${concepts.length} concepts found${shown.length < concepts.length ? `, showing top ${shown.length}` : ''}`));
        console.log('');

        for (const c of shown) {
          const yearRange = c.min_year && c.max_year ? `FY${c.min_year}-${c.max_year}` : '';
          console.log(`  ${chalk.cyan(c.concept)}`);
          console.log(`    ${chalk.dim(c.label)} | ${c.taxonomy} | ${c.units.join(', ')} | ${c.fact_count} facts | ${yearRange}`);
        }
        console.log('');
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    } finally {
      closeCache();
    }
  });

program
  .command('info')
  .description('Show company profile and filing information')
  .argument('<company>', 'Company ticker or name')
  .option('-j, --json', 'Output as JSON')
  .action(async (companyArg: string, options: { json?: boolean }) => {
    try {
      const resolved = await resolveCompanyWithSuggestions(companyArg);
      if (!resolved.company) {
        if (resolved.suggestions.length > 0) {
          console.error(chalk.red(`Ambiguous company: "${companyArg}". Did you mean:`));
          for (const s of resolved.suggestions) {
            console.error(`  ${chalk.cyan(s.ticker.padEnd(8))} ${s.name}`);
          }
        } else {
          console.error(chalk.red(`Could not find company: "${companyArg}"`));
        }
        process.exit(1);
      }

      const submissions = await getCompanySubmissions(resolved.company.cik);

      const profile = {
        name: submissions.name,
        cik: resolved.company.cik,
        ticker: resolved.company.ticker,
        entity_type: submissions.entityType || 'N/A',
        sic: submissions.sic || 'N/A',
        sic_description: submissions.sicDescription || 'N/A',
        state_of_incorporation: submissions.stateOfIncorporation || 'N/A',
        fiscal_year_end: submissions.fiscalYearEnd || 'N/A',
        tickers: submissions.tickers || [],
        exchanges: submissions.exchanges || [],
        total_filings: submissions.filings.recent.form.length,
        recent_10k: '',
        recent_10q: '',
      };

      // Find most recent 10-K and 10-Q
      for (let i = 0; i < submissions.filings.recent.form.length; i++) {
        if (!profile.recent_10k && submissions.filings.recent.form[i] === '10-K') {
          profile.recent_10k = submissions.filings.recent.filingDate[i];
        }
        if (!profile.recent_10q && submissions.filings.recent.form[i] === '10-Q') {
          profile.recent_10q = submissions.filings.recent.filingDate[i];
        }
        if (profile.recent_10k && profile.recent_10q) break;
      }

      if (options.json) {
        console.log(JSON.stringify(profile, null, 2));
      } else {
        const header = `${profile.name} (${profile.ticker})`;
        console.log('');
        console.log(chalk.bold(header));
        console.log(chalk.dim('='.repeat(header.length)));
        console.log('');
        console.log(`  ${chalk.dim('CIK:')}               ${profile.cik}`);
        console.log(`  ${chalk.dim('Entity Type:')}        ${profile.entity_type}`);
        console.log(`  ${chalk.dim('SIC Code:')}           ${profile.sic} — ${profile.sic_description}`);
        console.log(`  ${chalk.dim('State:')}              ${profile.state_of_incorporation}`);
        console.log(`  ${chalk.dim('Fiscal Year End:')}    ${profile.fiscal_year_end}`);
        if (profile.tickers.length > 0) {
          console.log(`  ${chalk.dim('Tickers:')}            ${profile.tickers.join(', ')}`);
        }
        if (profile.exchanges.length > 0) {
          console.log(`  ${chalk.dim('Exchanges:')}          ${profile.exchanges.join(', ')}`);
        }
        console.log('');
        console.log(chalk.bold('  Filing History'));
        console.log(`  ${chalk.dim('Total Filings:')}      ${profile.total_filings}`);
        if (profile.recent_10k) console.log(`  ${chalk.dim('Latest 10-K:')}        ${profile.recent_10k}`);
        if (profile.recent_10q) console.log(`  ${chalk.dim('Latest 10-Q:')}        ${profile.recent_10q}`);
        console.log('');
        console.log(chalk.dim(`  EDGAR: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${profile.cik}`));
        console.log('');
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    } finally {
      closeCache();
    }
  });

program
  .command('watch')
  .description('Manage a watchlist of company metrics to monitor for changes')
  .argument('<action>', 'Action: add, remove, list, check, clear')
  .argument('[ticker]', 'Company ticker (for add/remove)')
  .argument('[metric]', 'Metric ID (for add/remove)')
  .action(async (action: string, ticker?: string, metric?: string) => {
    try {
      switch (action) {
        case 'add': {
          if (!ticker || !metric) {
            console.error(chalk.red('Usage: sec-edgar-nl watch add <ticker> <metric>'));
            console.error('Example: sec-edgar-nl watch add AAPL revenue');
            process.exit(1);
          }
          const metricDef = getMetricDefinition(metric) ?? findMetricByName(metric);
          if (!metricDef) {
            console.error(chalk.red(`Unknown metric: "${metric}"`));
            console.error('Run "sec-edgar-nl metrics" to see available metrics.');
            process.exit(1);
          }
          addToWatchlist(ticker.toUpperCase(), metricDef.id);
          console.log(chalk.green(`Added ${ticker.toUpperCase()} ${metricDef.display_name} to watchlist.`));
          break;
        }
        case 'remove': {
          if (!ticker || !metric) {
            console.error(chalk.red('Usage: sec-edgar-nl watch remove <ticker> <metric>'));
            process.exit(1);
          }
          const removed = removeFromWatchlist(ticker.toUpperCase(), metric);
          if (removed) {
            console.log(chalk.green(`Removed ${ticker.toUpperCase()} ${metric} from watchlist.`));
          } else {
            console.error(chalk.yellow(`${ticker.toUpperCase()} ${metric} not found in watchlist.`));
          }
          break;
        }
        case 'list': {
          const entries = getWatchlist();
          if (entries.length === 0) {
            console.log(chalk.dim('\n  Watchlist is empty. Add items with: sec-edgar-nl watch add AAPL revenue\n'));
            break;
          }
          console.log(chalk.bold('\n  Watchlist\n'));
          for (const e of entries) {
            const lastInfo = e.last_value !== null
              ? chalk.dim(` (FY${e.last_fiscal_year}: ${formatWatchValue(e.last_value)}, checked ${e.last_checked?.split('T')[0]})`)
              : chalk.dim(' (not yet checked)');
            console.log(`  ${chalk.cyan(e.ticker.padEnd(8))} ${e.metric_id.padEnd(22)}${lastInfo}`);
          }
          console.log('');
          break;
        }
        case 'check': {
          const entries = getWatchlist();
          if (entries.length === 0) {
            console.log(chalk.dim('\n  Watchlist is empty.\n'));
            break;
          }
          console.log(chalk.bold('\n  Watchlist Check\n'));
          for (const entry of entries) {
            try {
              const result = await executeQueryCore({
                company: entry.ticker,
                metric: entry.metric_id,
                years: 1,
              });
              if (!result.success || !result.result || result.result.data_points.length === 0) {
                console.log(`  ${chalk.cyan(entry.ticker.padEnd(8))} ${entry.metric_id.padEnd(22)} ${chalk.red('No data')}`);
                continue;
              }
              const dp = result.result.data_points[result.result.data_points.length - 1];
              const newValue = dp.value;
              const newYear = dp.fiscal_year;
              const newPeriodEnd = dp.period_end;

              let status: string;
              if (entry.last_value === null) {
                status = chalk.cyan(`NEW: FY${newYear} ${formatWatchValue(newValue)}`);
              } else if (newYear > (entry.last_fiscal_year ?? 0)) {
                const change = entry.last_value !== 0
                  ? ((newValue - entry.last_value) / Math.abs(entry.last_value)) * 100
                  : 0;
                const changeStr = change >= 0 ? chalk.green(`+${change.toFixed(1)}%`) : chalk.red(`${change.toFixed(1)}%`);
                status = chalk.yellow(`NEW PERIOD: FY${newYear} ${formatWatchValue(newValue)} (${changeStr} vs FY${entry.last_fiscal_year})`);
              } else if (newValue !== entry.last_value) {
                const change = entry.last_value !== 0
                  ? ((newValue - entry.last_value) / Math.abs(entry.last_value)) * 100
                  : 0;
                const changeStr = change >= 0 ? chalk.green(`+${change.toFixed(1)}%`) : chalk.red(`${change.toFixed(1)}%`);
                status = chalk.yellow(`RESTATED: FY${newYear} ${formatWatchValue(newValue)} (was ${formatWatchValue(entry.last_value)}, ${changeStr})`);
              } else {
                status = chalk.dim(`FY${newYear} ${formatWatchValue(newValue)} (unchanged)`);
              }

              console.log(`  ${chalk.cyan(entry.ticker.padEnd(8))} ${entry.metric_id.padEnd(22)} ${status}`);

              updateWatchlistEntry(entry.ticker, entry.metric_id, newValue, newYear, newPeriodEnd);
            } catch (err) {
              console.log(`  ${chalk.cyan(entry.ticker.padEnd(8))} ${entry.metric_id.padEnd(22)} ${chalk.red('Error: ' + (err instanceof Error ? err.message : String(err)))}`);
            }
          }
          console.log('');
          break;
        }
        case 'clear': {
          clearWatchlist();
          console.log(chalk.green('Watchlist cleared.'));
          break;
        }
        default:
          console.error(chalk.red(`Unknown action: "${action}". Use: add, remove, list, check, clear`));
          process.exit(1);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    } finally {
      closeCache();
    }
  });

// If no subcommand matches, treat all args as a query
program.on('command:*', async (args) => {
  const allArgs = program.args;
  let json = false;
  let csv = false;
  let all = false;
  let years: string | undefined;
  let year: string | undefined;
  const queryParts: string[] = [];

  for (let i = 0; i < allArgs.length; i++) {
    if (allArgs[i] === '--json' || allArgs[i] === '-j') {
      json = true;
    } else if (allArgs[i] === '--csv' || allArgs[i] === '-c') {
      csv = true;
    } else if (allArgs[i] === '--all' || allArgs[i] === '-a') {
      all = true;
    } else if ((allArgs[i] === '--years' || allArgs[i] === '-y') && i + 1 < allArgs.length) {
      years = allArgs[++i];
    } else if (allArgs[i] === '--year' && i + 1 < allArgs.length) {
      year = allArgs[++i];
    } else {
      queryParts.push(allArgs[i]);
    }
  }

  if (queryParts.length > 0) {
    await executeQuery(queryParts.join(' '), { json, csv, years, all, year });
  }
});

program.parse();

// If no args at all, show help
if (process.argv.length <= 2) {
  program.help();
}
