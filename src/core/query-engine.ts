/**
 * Core query execution engine.
 *
 * Extracts the business logic from the CLI into reusable functions
 * that return data (not print to console). Used by both the CLI
 * and the MCP server.
 */

import { resolveCompanyWithSuggestions, type ResolveResult } from './resolver.js';
import { fetchMetricData, fetchQuarterlyData } from '../processing/xbrl-processor.js';
import { calculateGrowth } from '../processing/calculations.js';
import { buildProvenance } from '../analysis/provenance.js';
import { METRIC_DEFINITIONS, findMetricByName, getMetricDefinition } from '../processing/metric-definitions.js';
import type { QueryResult, CompanyInfo, MetricDefinition } from './types.js';

export interface QueryParams {
  company: string;
  metric: string;
  years?: number;
  periodType?: 'annual' | 'quarterly';
  quarters?: number;
  targetYear?: number;
}

export interface QueryEngineResult {
  success: boolean;
  result?: QueryResult;
  error?: {
    type: 'company_not_found' | 'company_ambiguous' | 'metric_not_found' | 'no_data' | 'rate_limited' | 'api_error';
    message: string;
    suggestions?: Array<{ ticker: string; name: string }>;
    availableMetrics?: Array<{ id: string; display_name: string }>;
    conceptsTried?: Array<{
      taxonomy: string;
      concept: string;
      found: boolean;
      annual_count: number;
      max_fiscal_year: number | null;
    }>;
  };
}

export interface CompareParams {
  tickers: string[];
  metric: string;
  years?: number;
}

export interface CompareEngineResult {
  results: QueryResult[];
  errors: Array<{ ticker: string; message: string }>;
}

/**
 * Execute a single-company metric query.
 * Returns structured data — never prints to console.
 */
export async function executeQueryCore(params: QueryParams): Promise<QueryEngineResult> {
  const { company: companyQuery, metric: metricQuery, years = 5, periodType = 'annual', quarters = 8, targetYear } = params;

  // Resolve metric
  const metric = getMetricDefinition(metricQuery) ?? findMetricByName(metricQuery);
  if (!metric) {
    return {
      success: false,
      error: {
        type: 'metric_not_found',
        message: `Could not identify metric: "${metricQuery}"`,
        availableMetrics: METRIC_DEFINITIONS.map(m => ({ id: m.id, display_name: m.display_name })),
      },
    };
  }

  // Resolve company
  const resolved = await resolveCompanyWithSuggestions(companyQuery);
  if (!resolved.company) {
    if (resolved.suggestions.length > 0) {
      return {
        success: false,
        error: {
          type: 'company_ambiguous',
          message: `Ambiguous company: "${companyQuery}"`,
          suggestions: resolved.suggestions.map(s => ({ ticker: s.ticker, name: s.name })),
        },
      };
    }
    return {
      success: false,
      error: {
        type: 'company_not_found',
        message: `Could not find company: "${companyQuery}". Try using a ticker symbol (e.g., AAPL) or exact company name.`,
      },
    };
  }

  const company = resolved.company;

  // Fetch data — for target year lookups, fetch extra history to ensure we have it
  const fetchYears = targetYear ? 50 : years;
  let { dataPoints, conceptUsed, conceptSelection } = periodType === 'quarterly'
    ? await fetchQuarterlyData(company, metric, quarters)
    : await fetchMetricData(company, metric, fetchYears);

  // Filter for specific year if requested
  if (targetYear && dataPoints.length > 0) {
    dataPoints = dataPoints.filter(dp => dp.fiscal_year === targetYear);
  }

  if (dataPoints.length === 0) {
    return {
      success: false,
      error: {
        type: 'no_data',
        message: `No data found for ${company.name} — ${metric.display_name}`,
        conceptsTried: conceptSelection.concepts_tried,
      },
    };
  }

  // Build result
  const companyInfo: CompanyInfo = {
    cik: company.cik,
    ticker: company.ticker,
    name: company.name,
    fiscal_year_end_month: 0,
  };

  const calculations = calculateGrowth(dataPoints);
  const provenance = buildProvenance(dataPoints, metric, conceptUsed, conceptSelection);

  return {
    success: true,
    result: {
      company: companyInfo,
      metric,
      data_points: dataPoints,
      calculations,
      provenance,
    },
  };
}

/**
 * Execute a multi-company comparison query.
 * Returns structured data — never prints to console.
 */
export async function executeCompareCore(params: CompareParams): Promise<CompareEngineResult> {
  const { tickers, metric: metricQuery, years = 5 } = params;

  const metric = getMetricDefinition(metricQuery) ?? findMetricByName(metricQuery);
  if (!metric) {
    return {
      results: [],
      errors: [{ ticker: '*', message: `Could not identify metric: "${metricQuery}"` }],
    };
  }

  // Resolve all companies in parallel
  const resolutions = await Promise.all(
    tickers.map(t => resolveCompanyWithSuggestions(t))
  );

  const results: QueryResult[] = [];
  const errors: Array<{ ticker: string; message: string }> = [];

  for (let i = 0; i < tickers.length; i++) {
    const resolved = resolutions[i];
    if (!resolved.company) {
      errors.push({ ticker: tickers[i], message: `Could not resolve company: ${tickers[i]}` });
      continue;
    }

    const company = resolved.company;

    try {
      const { dataPoints, conceptUsed, conceptSelection } = await fetchMetricData(
        company,
        metric,
        years
      );

      if (dataPoints.length === 0) {
        errors.push({ ticker: tickers[i], message: `No data for ${company.ticker} — ${metric.display_name}` });
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
    } catch (err) {
      errors.push({ ticker: tickers[i], message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { results, errors };
}
