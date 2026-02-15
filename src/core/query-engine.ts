/**
 * Core query execution engine.
 *
 * Extracts the business logic from the CLI into reusable functions
 * that return data (not print to console). Used by both the CLI
 * and the MCP server.
 */

import { resolveCompanyWithSuggestions, type ResolveResult } from './resolver.js';
import { getFrameData, type FrameDataPoint } from './sec-client.js';
import { fetchMetricData, fetchQuarterlyData } from '../processing/xbrl-processor.js';
import { calculateGrowth } from '../processing/calculations.js';
import { buildProvenance } from '../analysis/provenance.js';
import { METRIC_DEFINITIONS, findMetricByName, getMetricDefinition } from '../processing/metric-definitions.js';
import { RATIO_DEFINITIONS, findRatioByName, type RatioDefinition } from '../processing/ratio-definitions.js';
import type { SummaryResult } from '../output/summary-renderer.js';
import type { QueryResult, CompanyInfo, MetricDefinition, DataPoint } from './types.js';

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

// ── Ratio Execution ──────────────────────────────────────────────────

export interface RatioParams {
  company: string;
  ratio: string;
  years?: number;
}

export interface RatioDataPoint {
  fiscal_year: number;
  value: number;
  numerator_value: number;
  denominator_value: number;
}

export interface RatioResult {
  company: CompanyInfo;
  ratio: RatioDefinition;
  data_points: RatioDataPoint[];
  numerator_metric: string;
  denominator_metric: string;
}

export interface RatioEngineResult {
  success: boolean;
  result?: RatioResult;
  error?: {
    type: 'company_not_found' | 'company_ambiguous' | 'ratio_not_found' | 'no_data' | 'api_error';
    message: string;
    suggestions?: Array<{ ticker: string; name: string }>;
    availableRatios?: Array<{ id: string; display_name: string }>;
  };
}

/**
 * Execute a derived ratio query.
 * Fetches both component metrics and computes the ratio per fiscal year.
 */
export async function executeRatioCore(params: RatioParams): Promise<RatioEngineResult> {
  const { company: companyQuery, ratio: ratioQuery, years = 5 } = params;

  // Resolve ratio
  const ratio = RATIO_DEFINITIONS.find(r => r.id === ratioQuery) ?? findRatioByName(ratioQuery);
  if (!ratio) {
    return {
      success: false,
      error: {
        type: 'ratio_not_found',
        message: `Could not identify ratio: "${ratioQuery}"`,
        availableRatios: RATIO_DEFINITIONS.map(r => ({ id: r.id, display_name: r.display_name })),
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
        message: `Could not find company: "${companyQuery}". Try using a ticker symbol.`,
      },
    };
  }

  const company = resolved.company;
  const numMetric = getMetricDefinition(ratio.numerator);
  const denMetric = getMetricDefinition(ratio.denominator);

  if (!numMetric || !denMetric) {
    return {
      success: false,
      error: {
        type: 'api_error',
        message: `Internal error: metric ${ratio.numerator} or ${ratio.denominator} not found`,
      },
    };
  }

  // Fetch both metrics (cache means second call is instant)
  const [numResult, denResult] = await Promise.all([
    fetchMetricData(company, numMetric, years),
    fetchMetricData(company, denMetric, years),
  ]);

  if (numResult.dataPoints.length === 0 || denResult.dataPoints.length === 0) {
    const missing = numResult.dataPoints.length === 0 ? numMetric.display_name : denMetric.display_name;
    return {
      success: false,
      error: {
        type: 'no_data',
        message: `No ${missing} data found for ${company.name}. Cannot compute ${ratio.display_name}.`,
      },
    };
  }

  // Build lookup maps by fiscal year
  const numByYear = new Map(numResult.dataPoints.map(dp => [dp.fiscal_year, dp.value]));
  const denByYear = new Map(denResult.dataPoints.map(dp => [dp.fiscal_year, dp.value]));

  // Find overlapping years
  const allYears = [...new Set([...numByYear.keys(), ...denByYear.keys()])].sort((a, b) => a - b);
  const dataPoints: RatioDataPoint[] = [];
  let divByZeroCount = 0;

  for (const year of allYears) {
    const numVal = numByYear.get(year);
    const denVal = denByYear.get(year);
    if (numVal === undefined || denVal === undefined) continue;

    let value: number;
    if (ratio.operation === 'subtract') {
      value = numVal - denVal;
    } else {
      if (denVal === 0) {
        divByZeroCount++;
        continue;
      }
      value = numVal / denVal;
    }

    dataPoints.push({
      fiscal_year: year,
      value: ratio.format === 'percentage' ? Math.round(value * 1000) / 10 : Math.round(value * 100) / 100,
      numerator_value: numVal,
      denominator_value: denVal,
    });
  }

  if (dataPoints.length === 0) {
    const reason = divByZeroCount > 0
      ? `${denMetric.display_name} was zero in all available years — cannot compute ${ratio.display_name}.`
      : `No overlapping data found for ${ratio.display_name}`;
    return {
      success: false,
      error: {
        type: 'no_data',
        message: reason,
      },
    };
  }

  const companyInfo: CompanyInfo = {
    cik: company.cik,
    ticker: company.ticker,
    name: company.name,
    fiscal_year_end_month: 0,
  };

  return {
    success: true,
    result: {
      company: companyInfo,
      ratio,
      data_points: dataPoints,
      numerator_metric: numMetric.display_name,
      denominator_metric: denMetric.display_name,
    },
  };
}

// ── Summary Execution ──────────────────────────────────────────────────

export interface SummaryParams {
  company: string;
  year?: number; // Specific FY; default = most recent
  years?: number; // Multi-year trend (e.g., 5 for FY2020-2024)
}

export interface SummaryEngineResult {
  success: boolean;
  result?: SummaryResult;
  error?: {
    type: 'company_not_found' | 'company_ambiguous' | 'no_data' | 'api_error';
    message: string;
    suggestions?: Array<{ ticker: string; name: string }>;
  };
}

/**
 * Fetch all metrics for one company and build a financial summary.
 * Uses a single CompanyFacts API call (subsequent metrics are cache hits).
 */
export async function executeSummaryCore(params: SummaryParams): Promise<SummaryEngineResult> {
  const { company: companyQuery, year: targetYear, years: trendYears } = params;

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
        message: `Could not find company: "${companyQuery}". Try using a ticker symbol.`,
      },
    };
  }

  const company = resolved.company;
  const fetchYears = trendYears ?? 2; // Fetch extra for YoY or multi-year trend

  // Fetch all metrics (first call hits SEC API, rest are cache hits)
  const metricResults = await Promise.all(
    METRIC_DEFINITIONS.map(async (metric) => {
      try {
        const result = await fetchMetricData(company, metric, fetchYears);
        return { metric, dataPoints: result.dataPoints };
      } catch {
        return { metric, dataPoints: [] };
      }
    })
  );

  // Determine the target fiscal year
  let fiscalYear = targetYear;
  if (!fiscalYear) {
    const allYears = metricResults
      .flatMap(r => r.dataPoints.map(dp => dp.fiscal_year))
      .filter(y => y > 0);
    if (allYears.length === 0) {
      return {
        success: false,
        error: { type: 'no_data', message: `No financial data found for ${company.name}` },
      };
    }
    fiscalYear = Math.max(...allYears);
  }

  // Build summary metrics
  const metrics: SummaryResult['metrics'] = [];
  const valuesByMetric = new Map<string, number>();

  for (const { metric, dataPoints } of metricResults) {
    const current = dataPoints.find(dp => dp.fiscal_year === fiscalYear);
    if (!current) continue;

    const prior = dataPoints.find(dp => dp.fiscal_year === fiscalYear - 1);
    let yoyChange: number | undefined;
    if (prior && prior.value !== 0) {
      // Skip sign flips (profit to loss) — percentage change is meaningless
      const signFlip = (prior.value > 0 && current.value < 0) || (prior.value < 0 && current.value > 0);
      if (!signFlip) {
        yoyChange = Math.round(((current.value - prior.value) / Math.abs(prior.value)) * 1000) / 10;
      }
    }

    // For multi-year trend, include all years' values
    const yearValues = trendYears
      ? dataPoints.map(dp => ({ fiscal_year: dp.fiscal_year, value: dp.value }))
      : undefined;

    metrics.push({
      metric,
      value: current.value,
      prior_year_value: prior?.value,
      yoy_change: yoyChange,
      year_values: yearValues,
    });

    valuesByMetric.set(metric.id, current.value);
  }

  if (metrics.length === 0) {
    return {
      success: false,
      error: { type: 'no_data', message: `No data found for ${company.name} in FY${fiscalYear}` },
    };
  }

  // Compute derived ratios
  const derived: SummaryResult['derived'] = [];
  const revenue = valuesByMetric.get('revenue');
  const netIncome = valuesByMetric.get('net_income');
  const grossProfit = valuesByMetric.get('gross_profit');
  const operatingIncome = valuesByMetric.get('operating_income');
  const ocf = valuesByMetric.get('operating_cash_flow');
  const capex = valuesByMetric.get('capex');
  const totalDebt = valuesByMetric.get('total_debt');
  const totalEquity = valuesByMetric.get('total_equity');
  const currentAssets = valuesByMetric.get('current_assets');
  const currentLiabilities = valuesByMetric.get('current_liabilities');
  const totalAssets = valuesByMetric.get('total_assets');
  const interestExpense = valuesByMetric.get('interest_expense');

  if (revenue && netIncome && revenue !== 0) {
    derived.push({ name: 'Net Margin', value: Math.round((netIncome / revenue) * 1000) / 10, format: 'percentage' });
  }
  if (revenue && grossProfit && revenue !== 0) {
    derived.push({ name: 'Gross Margin', value: Math.round((grossProfit / revenue) * 1000) / 10, format: 'percentage' });
  }
  if (revenue && operatingIncome && revenue !== 0) {
    derived.push({ name: 'Operating Margin', value: Math.round((operatingIncome / revenue) * 1000) / 10, format: 'percentage' });
  }
  if (ocf && capex) {
    derived.push({ name: 'Free Cash Flow', value: ocf - capex, format: 'currency' });
  }
  if (totalDebt && totalEquity && totalEquity !== 0) {
    derived.push({ name: 'Debt-to-Equity', value: Math.round((totalDebt / totalEquity) * 100) / 100, format: 'multiple' });
  }
  if (currentAssets && currentLiabilities && currentLiabilities !== 0) {
    derived.push({ name: 'Current Ratio', value: Math.round((currentAssets / currentLiabilities) * 100) / 100, format: 'multiple' });
  }
  if (netIncome && totalAssets && totalAssets !== 0) {
    derived.push({ name: 'Return on Assets', value: Math.round((netIncome / totalAssets) * 1000) / 10, format: 'percentage' });
  }
  if (netIncome && totalEquity && totalEquity !== 0) {
    derived.push({ name: 'Return on Equity', value: Math.round((netIncome / totalEquity) * 1000) / 10, format: 'percentage' });
  }
  if (operatingIncome && interestExpense && interestExpense !== 0) {
    derived.push({ name: 'Interest Coverage', value: Math.round((operatingIncome / interestExpense) * 100) / 100, format: 'multiple' });
  }

  const companyInfo: CompanyInfo = {
    cik: company.cik,
    ticker: company.ticker,
    name: company.name,
    fiscal_year_end_month: 0,
  };

  return {
    success: true,
    result: {
      company: companyInfo,
      fiscal_year: fiscalYear,
      metrics,
      derived,
    },
  };
}

// ── Screen Execution ──────────────────────────────────────────────────

export interface ScreenParams {
  metric: string;
  year?: number;
  minValue?: number;
  maxValue?: number;
  sortBy?: 'value_desc' | 'value_asc' | 'name';
  limit?: number;
}

export interface ScreenCompany {
  cik: number;
  entity_name: string;
  location: string;
  value: number;
  period_start: string;
  period_end: string;
  accession_number: string;
}

export interface ScreenResult {
  metric: MetricDefinition;
  period: string;
  total_companies: number;
  filtered_companies: number;
  companies: ScreenCompany[];
}

export interface ScreenEngineResult {
  success: boolean;
  result?: ScreenResult;
  error?: {
    type: 'metric_not_found' | 'no_data' | 'api_error';
    message: string;
    availableMetrics?: Array<{ id: string; display_name: string }>;
  };
}

/**
 * Screen companies using the SEC EDGAR Frames API.
 * Returns all companies that reported a specific metric in a given year.
 */
export async function executeScreenCore(params: ScreenParams): Promise<ScreenEngineResult> {
  const {
    metric: metricQuery,
    year = new Date().getFullYear() - 1,
    minValue,
    maxValue,
    sortBy = 'value_desc',
    limit = 50,
  } = params;

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

  // Determine unit for frames API
  const unit = metric.unit_type === 'currency' ? 'USD'
    : metric.unit_type === 'shares' ? 'shares'
    : 'USD/shares';

  // Try each XBRL concept in priority order
  const period = `CY${year}`;
  let frameData: Awaited<ReturnType<typeof getFrameData>> | null = null;
  let usedConcept = '';

  for (const concept of metric.xbrl_concepts.sort((a, b) => a.priority - b.priority)) {
    try {
      frameData = await getFrameData(concept.taxonomy, concept.concept, unit, period);
      usedConcept = `${concept.taxonomy}:${concept.concept}`;
      if (frameData.data.length > 0) break;
    } catch {
      continue;
    }
  }

  if (!frameData || frameData.data.length === 0) {
    return {
      success: false,
      error: {
        type: 'no_data',
        message: `No data found for ${metric.display_name} in ${period}. Try a different year.`,
      },
    };
  }

  // Apply filters
  let companies: ScreenCompany[] = frameData.data.map(dp => ({
    cik: dp.cik,
    entity_name: dp.entityName,
    location: dp.loc,
    value: dp.val,
    period_start: dp.start,
    period_end: dp.end,
    accession_number: dp.accn,
  }));

  const totalCompanies = companies.length;

  if (minValue !== undefined) {
    companies = companies.filter(c => c.value >= minValue);
  }
  if (maxValue !== undefined) {
    companies = companies.filter(c => c.value <= maxValue);
  }

  // Sort
  switch (sortBy) {
    case 'value_desc':
      companies.sort((a, b) => b.value - a.value);
      break;
    case 'value_asc':
      companies.sort((a, b) => a.value - b.value);
      break;
    case 'name':
      companies.sort((a, b) => a.entity_name.localeCompare(b.entity_name));
      break;
  }

  const filteredCount = companies.length;
  companies = companies.slice(0, limit);

  return {
    success: true,
    result: {
      metric,
      period: `CY${year}`,
      total_companies: totalCompanies,
      filtered_companies: filteredCount,
      companies,
    },
  };
}
