#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { parseQuery } from './analysis/query-parser.js';
import { executeQueryCore, executeCompareCore } from './core/query-engine.js';
import { renderTable } from './output/table-renderer.js';
import { renderJson } from './output/json-renderer.js';
import { renderComparison, renderComparisonJson } from './output/comparison-renderer.js';
import { closeCache, clearCache, getCacheStats } from './core/cache.js';
import { METRIC_DEFINITIONS, findMetricByName } from './processing/metric-definitions.js';
import { fetchInsiderActivity } from './processing/insider-processor.js';
import { renderInsiderTable, renderInsiderJson } from './output/insider-renderer.js';
import { resolveCompanyWithSuggestions } from './core/resolver.js';

async function executeQuery(queryStr: string, options: { json?: boolean; years?: string }): Promise<void> {
  try {
    const parsed = parseQuery(queryStr);

    // Override years from explicit flag only
    if (options.years) {
      parsed.years = parseInt(options.years, 10);
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
  .option('-y, --years <n>', 'Number of years to show')
  .action(async (queryParts: string[], options: { json?: boolean; years?: string }) => {
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
  .option('-y, --years <n>', 'Number of years', '5')
  .action(async (args: string[], options: { json?: boolean; years?: string }) => {
    try {
      const years = parseInt(options.years || '5', 10);

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
  .command('insiders')
  .alias('insider')
  .description('Show insider trading activity for a company (e.g., insiders AAPL)')
  .argument('<company>', 'Company ticker or name')
  .option('-d, --days <n>', 'Number of days to look back', '90')
  .option('-j, --json', 'Output as JSON')
  .action(async (companyArg: string, options: { days?: string; json?: boolean }) => {
    try {
      const days = parseInt(options.days || '90', 10);

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

// If no subcommand matches, treat all args as a query
program.on('command:*', async (args) => {
  const allArgs = program.args;
  let json = false;
  let years: string | undefined;
  const queryParts: string[] = [];

  for (let i = 0; i < allArgs.length; i++) {
    if (allArgs[i] === '--json' || allArgs[i] === '-j') {
      json = true;
    } else if ((allArgs[i] === '--years' || allArgs[i] === '-y') && i + 1 < allArgs.length) {
      years = allArgs[++i];
    } else {
      queryParts.push(allArgs[i]);
    }
  }

  if (queryParts.length > 0) {
    await executeQuery(queryParts.join(' '), { json, years });
  }
});

program.parse();

// If no args at all, show help
if (process.argv.length <= 2) {
  program.help();
}
