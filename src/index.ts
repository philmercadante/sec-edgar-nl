#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { parseQuery } from './analysis/query-parser.js';
import { resolveCompany } from './core/resolver.js';
import { fetchMetricData } from './processing/xbrl-processor.js';
import { calculateGrowth } from './processing/calculations.js';
import { buildProvenance } from './analysis/provenance.js';
import { renderTable } from './output/table-renderer.js';
import { renderJson } from './output/json-renderer.js';
import { closeCache } from './core/cache.js';
import { METRIC_DEFINITIONS } from './processing/metric-definitions.js';
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
        console.error(`  - ${m.display_name} (${m.id})`);
      }
      process.exit(1);
    }

    // Resolve company
    const company = await resolveCompany(parsed.company);
    if (!company) {
      console.error(chalk.red(`Could not find company: "${parsed.company}"`));
      console.error('Try using a ticker symbol (e.g., AAPL) or exact company name.');
      process.exit(1);
    }

    // Fetch data
    const { dataPoints, conceptUsed } = await fetchMetricData(company, parsed.metric, parsed.years);

    if (dataPoints.length === 0) {
      console.error(chalk.red(`No data found for ${company.name} — ${parsed.metric.display_name}`));
      console.error(chalk.dim(`Tried XBRL concepts: ${parsed.metric.xbrl_concepts.map(c => `${c.taxonomy}:${c.concept}`).join(', ')}`));
      process.exit(1);
    }

    // Build result
    const companyInfo: CompanyInfo = {
      cik: company.cik,
      ticker: company.ticker,
      name: company.name,
      fiscal_year_end_month: 0,
    };

    const calculations = calculateGrowth(dataPoints);
    const provenance = buildProvenance(dataPoints, parsed.metric, conceptUsed);

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

// If no subcommand matches, treat all args as a query
program.on('command:*', async (args) => {
  // Reconstruct: check for flags
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
