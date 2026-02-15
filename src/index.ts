#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { parseQuery } from './analysis/query-parser.js';
import { executeQueryCore, executeCompareCore, executeRatioCore } from './core/query-engine.js';
import { renderTable } from './output/table-renderer.js';
import { renderJson } from './output/json-renderer.js';
import { renderComparison, renderComparisonJson } from './output/comparison-renderer.js';
import { renderCsv, renderComparisonCsv } from './output/csv-renderer.js';
import { closeCache, clearCache, getCacheStats } from './core/cache.js';
import { METRIC_DEFINITIONS, findMetricByName } from './processing/metric-definitions.js';
import { fetchInsiderActivity } from './processing/insider-processor.js';
import { renderInsiderTable, renderInsiderJson } from './output/insider-renderer.js';
import { resolveCompanyWithSuggestions } from './core/resolver.js';
import { getCompanySubmissions } from './core/sec-client.js';
import { renderFilingTable, renderFilingJson, type Filing, type FilingListResult } from './output/filing-renderer.js';
import { RATIO_DEFINITIONS, findRatioByName } from './processing/ratio-definitions.js';
import { renderRatioTable, renderRatioJson, renderRatioCsv } from './output/ratio-renderer.js';

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
  .version('0.2.0');

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
