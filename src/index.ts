#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { parseQuery } from './analysis/query-parser.js';
import { resolveCompanyWithSuggestions } from './core/resolver.js';
import { fetchMetricData, fetchQuarterlyData } from './processing/xbrl-processor.js';
import { calculateGrowth } from './processing/calculations.js';
import { buildProvenance } from './analysis/provenance.js';
import { renderTable } from './output/table-renderer.js';
import { renderJson } from './output/json-renderer.js';
import { renderComparison, renderComparisonJson } from './output/comparison-renderer.js';
import { closeCache, clearCache, getCacheStats } from './core/cache.js';
import { METRIC_DEFINITIONS, findMetricByName } from './processing/metric-definitions.js';
import { NotFoundError, RateLimitError, SecApiError, DataParseError } from './core/errors.js';
import type { QueryResult, CompanyInfo } from './core/types.js';

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

    // Resolve company with suggestions
    const resolved = await resolveCompanyWithSuggestions(parsed.company);
    if (!resolved.company) {
      if (resolved.suggestions.length > 0) {
        console.error(chalk.red(`Ambiguous company: "${parsed.company}". Did you mean:`));
        for (const s of resolved.suggestions) {
          console.error(`  ${chalk.cyan(s.ticker.padEnd(8))} ${s.name}`);
        }
      } else {
        console.error(chalk.red(`Could not find company: "${parsed.company}"`));
        console.error('Try using a ticker symbol (e.g., AAPL) or exact company name.');
      }
      process.exit(1);
    }

    const company = resolved.company;

    // Fetch data (annual or quarterly)
    const { dataPoints, conceptUsed, conceptSelection } = parsed.periodType === 'quarterly'
      ? await fetchQuarterlyData(company, parsed.metric, parsed.quarters)
      : await fetchMetricData(company, parsed.metric, parsed.years);

    if (dataPoints.length === 0) {
      console.error(chalk.red(`No data found for ${company.name} — ${parsed.metric.display_name}`));
      console.error(chalk.dim(`Tried XBRL concepts:`));
      for (const c of conceptSelection.concepts_tried) {
        const status = c.found
          ? (c.annual_count > 0 ? chalk.yellow(`${c.annual_count} annual facts, max FY${c.max_fiscal_year}`) : chalk.dim('found but no annual data'))
          : chalk.red('not found');
        console.error(chalk.dim(`  ${c.taxonomy}:${c.concept} — ${status}`));
      }
      process.exit(1);
    }

    // Note if fewer years than requested
    if (dataPoints.length < parsed.years) {
      console.error(chalk.yellow(
        `Note: Only ${dataPoints.length} years of data available (requested ${parsed.years})`
      ));
    }

    // Build result
    const companyInfo: CompanyInfo = {
      cik: company.cik,
      ticker: company.ticker,
      name: company.name,
      fiscal_year_end_month: 0,
    };

    const calculations = calculateGrowth(dataPoints);
    const provenance = buildProvenance(dataPoints, parsed.metric, conceptUsed, conceptSelection);

    const result: QueryResult = {
      company: companyInfo,
      metric: parsed.metric,
      data_points: dataPoints,
      calculations,
      provenance,
    };

    // Render
    if (options.json) {
      console.log(renderJson(result));
    } else {
      console.log('');
      console.log(renderTable(result));
      console.log('');
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      console.error(chalk.red(`Company not found in SEC EDGAR. It may not file with the SEC.`));
    } else if (err instanceof RateLimitError) {
      console.error(chalk.red(err.message));
    } else if (err instanceof SecApiError) {
      console.error(chalk.red(`SEC API error (${err.statusCode}): ${err.message}`));
    } else if (err instanceof DataParseError) {
      console.error(chalk.red(err.message));
    } else {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
    }
    process.exit(1);
  } finally {
    closeCache();
  }
}

const program = new Command();

program
  .name('sec-edgar-nl')
  .description('Trustworthy financial answers from SEC EDGAR filings with full provenance')
  .version('0.1.0');

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
      // Strategy: try each arg as a ticker, remaining words form the metric
      const tickers: string[] = [];
      const metricWords: string[] = [];

      for (const arg of args) {
        // All-caps 1-5 chars = likely ticker
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

      // Resolve all companies in parallel
      const resolutions = await Promise.all(
        tickers.map(t => resolveCompanyWithSuggestions(t))
      );

      const results: QueryResult[] = [];

      for (let i = 0; i < tickers.length; i++) {
        const resolved = resolutions[i];
        if (!resolved.company) {
          console.error(chalk.red(`Could not resolve: ${tickers[i]}`));
          continue;
        }

        const company = resolved.company;
        const { dataPoints, conceptUsed, conceptSelection } = await fetchMetricData(
          company,
          metric,
          years
        );

        if (dataPoints.length === 0) {
          console.error(chalk.yellow(`No data for ${company.ticker} — ${metric.display_name}`));
          continue;
        }

        const companyInfo: CompanyInfo = {
          cik: company.cik,
          ticker: company.ticker,
          name: company.name,
          fiscal_year_end_month: 0,
        };

        results.push({
          company: companyInfo,
          metric,
          data_points: dataPoints,
          calculations: calculateGrowth(dataPoints),
          provenance: buildProvenance(dataPoints, metric, conceptUsed, conceptSelection),
        });
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
