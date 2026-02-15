#!/usr/bin/env node

/**
 * MCP (Model Context Protocol) server entry point for sec-edgar-nl.
 *
 * Exposes SEC EDGAR financial data as MCP tools that Claude Desktop,
 * Claude Code, and other MCP clients can use directly.
 *
 * Tools (16):
 *   - query_financial_metric: fetch a metric for one company
 *   - compare_companies: compare a metric across multiple companies
 *   - compare_metrics: compare multiple metrics for one company
 *   - financial_matrix: multi-company x multi-metric matrix view
 *   - compare_ratios: compare a ratio across multiple companies
 *   - query_financial_ratio: compute a derived financial ratio
 *   - trend_analysis: growth trend with CAGRs and acceleration signal
 *   - company_financial_summary: all metrics for one company
 *   - screen_companies: screen all companies by a metric
 *   - query_insider_trading: get insider buy/sell activity
 *   - list_company_filings: recent SEC filings for a company
 *   - search_filings: full-text search across EDGAR filings
 *   - explore_xbrl_concepts: discover available XBRL data
 *   - company_info: company profile information
 *   - list_metrics: list all supported metrics
 *   - list_ratios: list all supported financial ratios
 *
 * Resources:
 *   - sec-edgar-nl://metrics: full metric definitions
 *   - sec-edgar-nl://cache/stats: cache statistics
 *
 * Prompts:
 *   - analyze_company: comprehensive single-company analysis
 *   - compare_financials: side-by-side financial comparison
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { executeQueryCore, executeCompareCore, executeRatioCore, executeSummaryCore, executeScreenCore, executeMultiMetricCore, executeMatrixCore } from './core/query-engine.js';
import { calculateCAGR, computeGrowthSignal } from './processing/calculations.js';
import { METRIC_DEFINITIONS } from './processing/metric-definitions.js';
import { RATIO_DEFINITIONS } from './processing/ratio-definitions.js';
import { getCacheStats } from './core/cache.js';
import { resolveCompanyWithSuggestions } from './core/resolver.js';
import { fetchInsiderActivity } from './processing/insider-processor.js';
import { TRANSACTION_CODE_LABELS } from './processing/insider-processor.js';

const METRIC_IDS = METRIC_DEFINITIONS.map(m => m.id) as [string, ...string[]];

const server = new McpServer(
  { name: 'sec-edgar-nl', version: '0.6.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// ── Tools ──────────────────────────────────────────────────────────────

server.tool(
  'query_financial_metric',
  'Fetch a financial metric (revenue, net income, operating cash flow, capex, R&D expense, stock-based compensation, total debt) for a public company from SEC EDGAR XBRL filings. Returns data with full provenance including accession numbers and filing dates.',
  {
    company: z.string().describe('Company ticker symbol (e.g., AAPL) or name (e.g., Apple)'),
    metric: z.enum(METRIC_IDS).describe('Financial metric to retrieve'),
    years: z.number().min(1).max(20).optional().default(5).describe('Number of fiscal years of data (1-20, default 5)'),
    period_type: z.enum(['annual', 'quarterly']).optional().default('annual').describe('Annual or quarterly data'),
    quarters: z.number().min(1).max(40).optional().default(8).describe('Number of quarters if quarterly (1-40, default 8)'),
    target_year: z.number().min(1993).max(2030).optional().describe('Specific fiscal year to retrieve (e.g., 2023)'),
  },
  async ({ company, metric, years, period_type, quarters, target_year }) => {
    const result = await executeQueryCore({
      company,
      metric,
      years,
      periodType: period_type,
      quarters,
      targetYear: target_year,
    });

    if (!result.success) {
      let errorText = result.error!.message;

      if (result.error!.suggestions?.length) {
        errorText += '\n\nDid you mean:\n' +
          result.error!.suggestions.map(s => `  ${s.ticker} — ${s.name}`).join('\n');
      }

      if (result.error!.availableMetrics) {
        errorText += '\n\nAvailable metrics:\n' +
          result.error!.availableMetrics.map(m => `  ${m.id} — ${m.display_name}`).join('\n');
      }

      return { content: [{ type: 'text', text: errorText }], isError: true };
    }

    const r = result.result!;
    const output = {
      company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
      metric: { id: r.metric.id, display_name: r.metric.display_name },
      data: r.data_points.map(dp => ({
        fiscal_year: dp.fiscal_year,
        fiscal_period: dp.fiscal_period,
        value: dp.value,
        period_end: dp.period_end,
        source: {
          accession_number: dp.source.accession_number,
          form_type: dp.source.form_type,
          filing_date: dp.source.filing_date,
          xbrl_concept: dp.source.xbrl_concept,
        },
      })),
      calculations: {
        yoy_changes: r.calculations.yoy_changes,
        cagr: r.calculations.cagr,
        cagr_years: r.calculations.cagr_years,
      },
      provenance: r.provenance,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'compare_companies',
  'Compare a financial metric across 2-10 public companies side by side. Returns data for all companies with CAGRs and provenance.',
  {
    tickers: z.array(z.string()).min(2).max(10).describe('Array of ticker symbols to compare'),
    metric: z.enum(METRIC_IDS).describe('Financial metric to compare'),
    years: z.number().min(1).max(20).optional().default(5).describe('Number of fiscal years (default 5)'),
  },
  async ({ tickers, metric, years }) => {
    const { results, errors } = await executeCompareCore({ tickers, metric, years });

    if (results.length === 0 && errors.length > 0) {
      return {
        content: [{ type: 'text', text: 'No data found.\n\nErrors:\n' + errors.map(e => `  ${e.ticker}: ${e.message}`).join('\n') }],
        isError: true,
      };
    }

    const output = {
      comparison: results.map(r => ({
        company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
        metric: r.metric.id,
        data: r.data_points.map(dp => ({
          fiscal_year: dp.fiscal_year,
          value: dp.value,
          period_end: dp.period_end,
        })),
        cagr: r.calculations.cagr,
        provenance: r.provenance,
      })),
      errors: errors.length > 0 ? errors : undefined,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'list_metrics',
  'List all supported financial metrics with their descriptions and XBRL concept mappings.',
  {},
  async () => {
    const metrics = METRIC_DEFINITIONS.map(m => ({
      id: m.id,
      display_name: m.display_name,
      description: m.description,
      unit_type: m.unit_type,
      statement_type: m.statement_type,
      xbrl_concepts: m.xbrl_concepts.map(c => ({
        taxonomy: c.taxonomy,
        concept: c.concept,
        priority: c.priority,
      })),
    }));

    return { content: [{ type: 'text', text: JSON.stringify({ metrics }, null, 2) }] };
  }
);

server.tool(
  'list_ratios',
  'List all supported derived financial ratios with their formulas and descriptions.',
  {},
  async () => {
    const ratios = RATIO_DEFINITIONS.map(r => ({
      id: r.id,
      display_name: r.display_name,
      description: r.description,
      numerator: r.numerator,
      denominator: r.denominator,
      operation: r.operation || 'divide',
      format: r.format,
    }));

    return { content: [{ type: 'text', text: JSON.stringify({ ratios }, null, 2) }] };
  }
);

server.tool(
  'query_insider_trading',
  'Get recent insider trading activity (buys/sells by officers, directors, and 10%+ owners) for a public company from SEC Form 4 filings. Returns transactions with dates, prices, and a bullish/bearish signal classification.',
  {
    company: z.string().describe('Company ticker symbol (e.g., AAPL) or name (e.g., Apple)'),
    days: z.number().min(1).max(365).optional().default(90).describe('Look-back period in days (default 90)'),
  },
  async ({ company, days }) => {
    // Resolve company
    const resolved = await resolveCompanyWithSuggestions(company);
    if (!resolved.company) {
      let errorText = `Could not find company: "${company}"`;
      if (resolved.suggestions.length > 0) {
        errorText = `Ambiguous company: "${company}"\n\nDid you mean:\n` +
          resolved.suggestions.map(s => `  ${s.ticker} — ${s.name}`).join('\n');
      }
      return { content: [{ type: 'text', text: errorText }], isError: true };
    }

    const result = await fetchInsiderActivity(resolved.company, { days });

    const output = {
      company: { cik: result.company.cik, ticker: result.company.ticker, name: result.company.name },
      period_days: result.period_days,
      summary: result.summary,
      transactions: result.transactions.map(t => ({
        date: t.transaction_date,
        insider: { name: t.insider.name, title: t.insider.officer_title || (t.insider.is_director ? 'Director' : '') },
        type: t.transaction_code,
        type_label: TRANSACTION_CODE_LABELS[t.transaction_code] || t.transaction_code,
        direction: t.transaction_type,
        shares: t.shares,
        price: t.price_per_share,
        value: t.total_value,
        shares_after: t.shares_owned_after,
        filing: { accession: t.filing_accession, date: t.filing_date },
      })),
      provenance: result.provenance,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'company_financial_summary',
  'Get a comprehensive financial summary of a company — all 23 metrics plus derived ratios for a fiscal year. Efficiently uses a single SEC API call.',
  {
    company: z.string().describe('Company ticker symbol (e.g., AAPL) or name'),
    year: z.number().min(2000).max(2030).optional().describe('Specific fiscal year (default: most recent)'),
  },
  async ({ company, year }) => {
    const result = await executeSummaryCore({ company, year });

    if (!result.success) {
      let errorText = result.error!.message;
      if (result.error!.suggestions?.length) {
        errorText += '\n\nDid you mean:\n' +
          result.error!.suggestions.map(s => `  ${s.ticker} — ${s.name}`).join('\n');
      }
      return { content: [{ type: 'text', text: errorText }], isError: true };
    }

    const r = result.result!;
    const output = {
      company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
      fiscal_year: r.fiscal_year,
      metrics: r.metrics.map(m => ({
        id: m.metric.id,
        display_name: m.metric.display_name,
        value: m.value,
        yoy_change_pct: m.yoy_change ?? null,
      })),
      derived_ratios: r.derived.map(d => ({
        name: d.name,
        value: d.value,
        format: d.format,
      })),
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

const RATIO_IDS = RATIO_DEFINITIONS.map(r => r.id) as [string, ...string[]];

server.tool(
  'query_financial_ratio',
  'Compute a derived financial ratio (net margin, gross margin, operating margin, R&D intensity, SBC/revenue, debt-to-equity, free cash flow, capex/OCF) for a company using SEC EDGAR data.',
  {
    company: z.string().describe('Company ticker symbol (e.g., AAPL) or name'),
    ratio: z.enum(RATIO_IDS).describe('Financial ratio to compute'),
    years: z.number().min(1).max(20).optional().default(5).describe('Number of fiscal years (default 5)'),
  },
  async ({ company, ratio, years }) => {
    const result = await executeRatioCore({ company, ratio, years });

    if (!result.success) {
      let errorText = result.error!.message;
      if (result.error!.availableRatios) {
        errorText += '\n\nAvailable ratios:\n' +
          result.error!.availableRatios.map(r => `  ${r.id} — ${r.display_name}`).join('\n');
      }
      return { content: [{ type: 'text', text: errorText }], isError: true };
    }

    const r = result.result!;
    const output = {
      company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
      ratio: { id: r.ratio.id, display_name: r.ratio.display_name, description: r.ratio.description },
      formula: {
        numerator: r.numerator_metric,
        denominator: r.denominator_metric,
        operation: r.ratio.operation || 'divide',
      },
      data: r.data_points,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'compare_ratios',
  'Compare a derived financial ratio across multiple companies. Compares ratios like net margin, ROE, or debt-to-equity across 2+ companies side-by-side.',
  {
    tickers: z.array(z.string()).min(2).max(10).describe('Array of ticker symbols (e.g., ["AAPL", "MSFT", "GOOGL"])'),
    ratio: z.enum(RATIO_IDS).describe('Financial ratio to compare'),
    years: z.number().min(1).max(20).optional().default(5).describe('Number of fiscal years (default 5)'),
  },
  async ({ tickers, ratio, years }) => {
    const { executeCompareRatioCore } = await import('./core/query-engine.js');
    const { results, errors } = await executeCompareRatioCore({ tickers, ratio, years });

    const output: Record<string, unknown> = {};

    if (errors.length > 0) {
      output.warnings = errors.map(e => `${e.ticker}: ${e.message}`);
    }

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No data found. ${errors.map(e => e.message).join('; ')}` }], isError: true };
    }

    output.comparison = results.map(r => ({
      company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
      ratio: { id: r.ratio.id, display_name: r.ratio.display_name },
      data: r.data_points.map(dp => ({
        fiscal_year: dp.fiscal_year,
        value: dp.value,
      })),
    }));

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'list_company_filings',
  'List recent SEC filings for a company with dates, form types, descriptions, and direct EDGAR links.',
  {
    company: z.string().describe('Company ticker symbol (e.g., AAPL) or name'),
    form_type: z.string().optional().describe('Filter by form type (e.g., 10-K, 10-Q, 8-K, 4)'),
    limit: z.number().min(1).max(100).optional().default(20).describe('Max filings to return (default 20)'),
  },
  async ({ company, form_type, limit }) => {
    const resolved = await resolveCompanyWithSuggestions(company);
    if (!resolved.company) {
      let errorText = `Could not find company: "${company}"`;
      if (resolved.suggestions.length > 0) {
        errorText = `Ambiguous company: "${company}"\n\nDid you mean:\n` +
          resolved.suggestions.map(s => `  ${s.ticker} — ${s.name}`).join('\n');
      }
      return { content: [{ type: 'text', text: errorText }], isError: true };
    }

    const { getCompanySubmissions } = await import('./core/sec-client.js');
    const submissions = await getCompanySubmissions(resolved.company.cik);
    const { recent } = submissions.filings;

    const paddedCik = resolved.company.cik.padStart(10, '0');
    const filings: Array<{
      form_type: string; filing_date: string; description: string;
      accession_number: string; edgar_url: string;
    }> = [];

    for (let i = 0; i < recent.form.length && filings.length < limit; i++) {
      if (form_type && !recent.form[i].startsWith(form_type.toUpperCase())) continue;

      const accessionNoDashes = recent.accessionNumber[i].replace(/-/g, '');
      filings.push({
        form_type: recent.form[i],
        filing_date: recent.filingDate[i],
        description: recent.primaryDocDescription[i] || recent.form[i],
        accession_number: recent.accessionNumber[i],
        edgar_url: `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${accessionNoDashes}/${recent.primaryDocument[i]}`,
      });
    }

    const output = {
      company: { cik: resolved.company.cik, ticker: resolved.company.ticker, name: resolved.company.name },
      filings,
      total_available: recent.form.length,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'explore_xbrl_concepts',
  'Explore all available XBRL concepts for a company from SEC EDGAR. Useful for discovering what financial data exists beyond the predefined metrics.',
  {
    company: z.string().describe('Company ticker symbol (e.g., AAPL) or name'),
    search: z.string().optional().describe('Filter concepts by name, label, or description'),
    limit: z.number().min(1).max(200).optional().default(30).describe('Max concepts to return (default 30)'),
  },
  async ({ company, search, limit }) => {
    const resolved = await resolveCompanyWithSuggestions(company);
    if (!resolved.company) {
      let errorText = `Could not find company: "${company}"`;
      if (resolved.suggestions.length > 0) {
        errorText = `Ambiguous company: "${company}"\n\nDid you mean:\n` +
          resolved.suggestions.map(s => `  ${s.ticker} — ${s.name}`).join('\n');
      }
      return { content: [{ type: 'text', text: errorText }], isError: true };
    }

    const { getCompanyFacts } = await import('./core/sec-client.js');
    const facts = await getCompanyFacts(resolved.company.cik);
    const searchLower = search?.toLowerCase();

    const concepts: Array<{
      taxonomy: string; concept: string; label: string;
      units: string[]; fact_count: number; year_range: string;
    }> = [];

    for (const [taxonomy, taxConcepts] of Object.entries(facts.facts)) {
      for (const [concept, data] of Object.entries(taxConcepts)) {
        if (searchLower) {
          const matchable = `${concept} ${data.label} ${data.description}`.toLowerCase();
          if (!matchable.includes(searchLower)) continue;
        }

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

        concepts.push({
          taxonomy, concept, label: data.label,
          units: Object.keys(data.units), fact_count: factCount,
          year_range: minYear && maxYear ? `FY${minYear}-${maxYear}` : '',
        });
      }
    }

    concepts.sort((a, b) => b.fact_count - a.fact_count);
    const shown = concepts.slice(0, limit);

    const output = {
      company: { cik: resolved.company.cik, ticker: resolved.company.ticker, name: resolved.company.name },
      total_concepts: concepts.length,
      concepts: shown,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'search_filings',
  'Search SEC EDGAR filings by text content using full-text search. Find filings mentioning specific terms like "artificial intelligence", "supply chain risk", "CEO departure", etc.',
  {
    query: z.string().describe('Search query (e.g., "artificial intelligence", "tariff impact")'),
    forms: z.array(z.string()).optional().describe('Filter by form types (e.g., ["10-K", "8-K"])'),
    start_date: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
    end_date: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
    limit: z.number().min(1).max(100).optional().default(20).describe('Max results (default 20)'),
  },
  async ({ query, forms, start_date, end_date, limit }) => {
    const { searchFilings } = await import('./core/sec-client.js');
    const result = await searchFilings({
      query,
      forms,
      startDate: start_date,
      endDate: end_date,
      limit,
    });

    const output = {
      query,
      total_results: result.total,
      results: result.hits.map(h => ({
        company: h.display_name,
        cik: h.cik,
        form_type: h.form_type,
        filing_date: h.filing_date,
        period_ending: h.period_ending,
        accession_number: h.accession_number,
        location: h.location,
      })),
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'screen_companies',
  'Screen all public companies by a financial metric using SEC EDGAR Frames API. Returns companies ranked by the metric value for a given calendar year. Supports filtering by min/max value.',
  {
    metric: z.enum(METRIC_IDS).describe('Financial metric to screen by'),
    year: z.number().min(2009).max(2030).optional().describe('Calendar year (default: previous year)'),
    min_value: z.number().optional().describe('Minimum metric value filter'),
    max_value: z.number().optional().describe('Maximum metric value filter'),
    sort: z.enum(['value_desc', 'value_asc', 'name']).optional().default('value_desc').describe('Sort order'),
    limit: z.number().min(1).max(500).optional().default(50).describe('Max companies to return'),
  },
  async ({ metric, year, min_value, max_value, sort, limit }) => {
    const result = await executeScreenCore({
      metric,
      year,
      minValue: min_value,
      maxValue: max_value,
      sortBy: sort,
      limit,
    });

    if (!result.success) {
      return { content: [{ type: 'text', text: result.error!.message }], isError: true };
    }

    const r = result.result!;
    const output = {
      metric: { id: r.metric.id, display_name: r.metric.display_name },
      period: r.period,
      total_companies: r.total_companies,
      filtered_companies: r.filtered_companies,
      companies: r.companies.map(c => ({
        cik: c.cik,
        entity_name: c.entity_name,
        location: c.location,
        value: c.value,
        period_end: c.period_end,
      })),
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'compare_metrics',
  'Compare multiple financial metrics for one company side-by-side across fiscal years. Useful for seeing revenue, net income, cash flow, etc. together for one company. Efficiently uses a single SEC API call.',
  {
    company: z.string().describe('Company ticker symbol (e.g., AAPL) or name'),
    metrics: z.array(z.enum(METRIC_IDS)).min(2).max(10).describe('Array of metric IDs to compare (e.g., ["revenue", "net_income", "operating_cash_flow"])'),
    years: z.number().min(1).max(20).optional().default(5).describe('Number of fiscal years (default 5)'),
  },
  async ({ company, metrics, years }) => {
    const result = await executeMultiMetricCore({ company, metrics, years });

    if (!result.success) {
      let errorText = result.error!.message;
      if (result.error!.suggestions?.length) {
        errorText += '\n\nDid you mean:\n' +
          result.error!.suggestions.map(s => `  ${s.ticker} — ${s.name}`).join('\n');
      }
      if (result.error!.availableMetrics) {
        errorText += '\n\nAvailable metrics:\n' +
          result.error!.availableMetrics.map(m => `  ${m.id} — ${m.display_name}`).join('\n');
      }
      return { content: [{ type: 'text', text: errorText }], isError: true };
    }

    const r = result.result!;
    const data: Record<string, Record<string, number>> = {};
    for (const metric of r.metrics) {
      const yearMap = r.data.get(metric.id);
      if (yearMap) {
        const yearData: Record<string, number> = {};
        for (const [yr, value] of yearMap) {
          yearData[`FY${yr}`] = value;
        }
        data[metric.id] = yearData;
      }
    }

    const output = {
      company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
      metrics: r.metrics,
      years: r.years,
      data,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'financial_matrix',
  'Compare multiple financial metrics across multiple companies in a single view. Shows a matrix with companies as columns and metrics as rows for the most recent fiscal year.',
  {
    tickers: z.array(z.string()).min(2).max(10).describe('Array of ticker symbols (e.g., ["AAPL", "MSFT", "GOOGL"])'),
    metrics: z.array(z.enum(METRIC_IDS)).min(1).max(10).describe('Array of metric IDs (e.g., ["revenue", "net_income", "operating_cash_flow"])'),
    year: z.number().min(2000).max(2030).optional().describe('Specific fiscal year (default: most recent)'),
  },
  async ({ tickers, metrics, year }) => {
    const result = await executeMatrixCore({ tickers, metrics, year });

    if (!result.success) {
      let errorText = result.error!.message;
      if (result.error!.availableMetrics) {
        errorText += '\n\nAvailable metrics:\n' +
          result.error!.availableMetrics.map(m => `  ${m.id} — ${m.display_name}`).join('\n');
      }
      return { content: [{ type: 'text', text: errorText }], isError: true };
    }

    const r = result.result!;
    const companies = r.companies.map(c => {
      const values: Record<string, number> = {};
      for (const [k, v] of c.values) values[k] = v;
      return {
        company: { cik: c.company.cik, ticker: c.company.ticker, name: c.company.name },
        values,
      };
    });

    const output = {
      fiscal_year: r.fiscal_year,
      metrics: r.metrics,
      companies,
      warnings: result.errors.length > 0 ? result.errors.map(e => `${e.ticker}: ${e.message}`) : undefined,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'trend_analysis',
  'Analyze the growth trend of a financial metric over time. Returns multi-period CAGRs (1Y/3Y/5Y/10Y), min/max values, and a growth acceleration/deceleration signal. Ideal for understanding if a company\'s growth is accelerating, decelerating, or stable.',
  {
    company: z.string().describe('Company ticker symbol (e.g., AAPL) or name'),
    metric: z.enum(METRIC_IDS).describe('Financial metric to analyze'),
    years: z.number().min(3).max(20).optional().default(10).describe('Number of years of history (default 10)'),
  },
  async ({ company, metric, years }) => {
    const result = await executeQueryCore({ company, metric, years });

    if (!result.success) {
      let errorText = result.error!.message;
      if (result.error!.suggestions?.length) {
        errorText += '\n\nDid you mean:\n' +
          result.error!.suggestions.map(s => `  ${s.ticker} — ${s.name}`).join('\n');
      }
      return { content: [{ type: 'text', text: errorText }], isError: true };
    }

    const r = result.result!;
    const values = r.data_points.map(dp => dp.value);
    const n = values.length;

    // Compute multi-period CAGRs
    const cagrs: Record<string, number | null> = {};
    for (const lookback of [1, 3, 5, 10]) {
      if (n > lookback) {
        cagrs[`${lookback}y`] = calculateCAGR(values[n - 1 - lookback], values[n - 1], lookback);
      }
    }

    // Statistics
    const avg = n > 0 ? values.reduce((a, b) => a + b, 0) / n : null;
    const maxVal = n > 0 ? Math.max(...values) : null;
    const minVal = n > 0 ? Math.min(...values) : null;
    const maxYear = maxVal !== null ? r.data_points[values.indexOf(maxVal)].fiscal_year : null;
    const minYear = minVal !== null ? r.data_points[values.indexOf(minVal)].fiscal_year : null;

    // Growth signal
    const growthResult = computeGrowthSignal(values);

    const output = {
      company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
      metric: { id: r.metric.id, display_name: r.metric.display_name },
      data: r.data_points.map(dp => ({
        fiscal_year: dp.fiscal_year,
        value: dp.value,
      })),
      analysis: {
        cagr: cagrs,
        statistics: {
          average: avg,
          high: maxVal,
          high_year: maxYear,
          low: minVal,
          low_year: minYear,
        },
        growth_signal: growthResult ? {
          signal: growthResult.signal,
          first_half_avg_growth: Math.round(growthResult.firstHalfAvg * 10) / 10,
          second_half_avg_growth: Math.round(growthResult.secondHalfAvg * 10) / 10,
        } : null,
      },
      provenance: r.provenance,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }
);

server.tool(
  'company_info',
  'Get company profile information from SEC EDGAR: CIK, SIC code, industry, state of incorporation, fiscal year end, and filing history.',
  {
    company: z.string().describe('Company ticker symbol (e.g., AAPL) or name'),
  },
  async ({ company }) => {
    const resolved = await resolveCompanyWithSuggestions(company);
    if (!resolved.company) {
      let errorText = `Could not find company: "${company}"`;
      if (resolved.suggestions.length > 0) {
        errorText = `Ambiguous company: "${company}"\n\nDid you mean:\n` +
          resolved.suggestions.map(s => `  ${s.ticker} — ${s.name}`).join('\n');
      }
      return { content: [{ type: 'text', text: errorText }], isError: true };
    }

    const { getCompanySubmissions } = await import('./core/sec-client.js');
    const submissions = await getCompanySubmissions(resolved.company.cik);

    const profile = {
      name: submissions.name,
      cik: resolved.company.cik,
      ticker: resolved.company.ticker,
      entity_type: submissions.entityType || null,
      sic: submissions.sic || null,
      sic_description: submissions.sicDescription || null,
      state_of_incorporation: submissions.stateOfIncorporation || null,
      fiscal_year_end: submissions.fiscalYearEnd || null,
      tickers: submissions.tickers || [],
      exchanges: submissions.exchanges || [],
      total_filings: submissions.filings.recent.form.length,
    };

    return { content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }] };
  }
);

// ── Resources ──────────────────────────────────────────────────────────

server.resource(
  'metrics',
  'sec-edgar-nl://metrics',
  { description: 'Complete list of financial metrics, their XBRL concept mappings, and unit types', mimeType: 'application/json' },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify(METRIC_DEFINITIONS.map(m => ({
        id: m.id,
        display_name: m.display_name,
        description: m.description,
        accounting_framework: m.accounting_framework,
        statement_type: m.statement_type,
        unit_type: m.unit_type,
        aggregation: m.aggregation,
        xbrl_concepts: m.xbrl_concepts.map(c => ({
          taxonomy: c.taxonomy,
          concept: c.concept,
          priority: c.priority,
        })),
      })), null, 2),
    }],
  })
);

server.resource(
  'cache-stats',
  'sec-edgar-nl://cache/stats',
  { description: 'Current cache size, entry count, and location', mimeType: 'application/json' },
  async (uri) => {
    let stats;
    try {
      stats = getCacheStats();
    } catch {
      stats = { entries: 0, sizeBytes: 0 };
    }
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({
          entries: stats.entries,
          size_bytes: stats.sizeBytes,
          size_mb: (stats.sizeBytes / 1024 / 1024).toFixed(1),
          location: '~/.sec-edgar-nl/cache.db',
        }, null, 2),
      }],
    };
  }
);

// ── Prompts ────────────────────────────────────────────────────────────

server.prompt(
  'analyze_company',
  'Comprehensive financial analysis of a public company using SEC EDGAR data',
  { company: z.string().describe('Company ticker or name (e.g., AAPL or Apple)') },
  async ({ company }) => ({
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Perform a comprehensive financial analysis of ${company} using SEC EDGAR data. Follow these steps:

1. **Revenue & Growth**: Query revenue for the last 5 years. Note the CAGR and any acceleration/deceleration in growth.

2. **Profitability**: Query net income for the last 5 years. Calculate the net margin trend (net income / revenue).

3. **Cash Flow**: Query operating cash flow and compare to net income. Strong companies typically have OCF > net income.

4. **Capital Allocation**: Query capex and R&D spending. Calculate:
   - R&D as a % of revenue (innovation intensity)
   - Capex as a % of OCF (capital intensity)

5. **Compensation**: Query stock-based compensation. Calculate SBC as % of revenue and % of net income.

6. **Balance Sheet**: Query total debt. Compare debt to annual operating cash flow (debt/OCF ratio).

7. **Summary**: Provide a concise summary covering:
   - Growth trajectory (accelerating/decelerating/stable)
   - Profitability quality (margins, cash conversion)
   - Capital allocation efficiency
   - Key risks or concerns

Always cite the specific SEC filings (accession numbers) that back your analysis.`,
      },
    }],
  })
);

server.prompt(
  'compare_financials',
  'Side-by-side financial comparison of multiple companies',
  {
    companies: z.string().describe('Comma-separated tickers (e.g., AAPL,MSFT,GOOGL)'),
    focus: z.string().optional().describe('Focus area: growth, profitability, efficiency, or all'),
  },
  async ({ companies, focus }) => {
    const tickers = companies.split(',').map(t => t.trim()).filter(Boolean);
    let focusInstructions: string;
    switch (focus) {
      case 'growth':
        focusInstructions = 'Focus on revenue and net income growth rates. Which company is growing fastest?';
        break;
      case 'profitability':
        focusInstructions = 'Focus on net income margins, cash flow quality (OCF vs net income), and SBC dilution.';
        break;
      case 'efficiency':
        focusInstructions = 'Focus on R&D efficiency (R&D/revenue), capital efficiency (capex/OCF), and debt management.';
        break;
      default:
        focusInstructions = 'Compare across all dimensions: growth, profitability, cash flow, and capital allocation.';
    }

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Compare the following companies using SEC EDGAR data: ${tickers.join(', ')}

For each company, query these metrics for the last 5 years:
- Revenue
- Net Income
- Operating Cash Flow
- R&D Expense
- Capex

${focusInstructions}

Present your findings with:
1. Side-by-side data tables
2. Key ratio comparisons
3. A ranking for each dimension
4. An overall summary of which company appears strongest and why

Cite specific SEC filings that back your analysis.`,
        },
      }],
    };
  }
);

// ── Start Server ───────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
