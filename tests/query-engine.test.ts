import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CikLookup, DataPoint, MetricDefinition } from '../src/core/types.js';
import type { FetchResult, ConceptSelectionInfo, RestatementInfo } from '../src/processing/xbrl-processor.js';
import type { RatioDefinition } from '../src/processing/ratio-definitions.js';

// Mock the external dependencies
vi.mock('../src/core/resolver.js', () => ({
  resolveCompanyWithSuggestions: vi.fn(),
}));

vi.mock('../src/processing/xbrl-processor.js', () => ({
  fetchMetricData: vi.fn(),
  fetchQuarterlyData: vi.fn(),
}));

vi.mock('../src/core/sec-client.js', () => ({
  getFrameData: vi.fn(),
}));

// Import after mocking
import { resolveCompanyWithSuggestions } from '../src/core/resolver.js';
import { fetchMetricData, fetchQuarterlyData } from '../src/processing/xbrl-processor.js';
import { getFrameData } from '../src/core/sec-client.js';
import {
  executeQueryCore,
  executeCompareCore,
  executeRatioCore,
  executeCompareRatioCore,
  executeSummaryCore,
  executeMultiMetricCore,
  executeMatrixCore,
  executeScreenCore,
} from '../src/core/query-engine.js';

const mockResolve = resolveCompanyWithSuggestions as ReturnType<typeof vi.fn>;
const mockFetchMetric = fetchMetricData as ReturnType<typeof vi.fn>;
const mockFetchQuarterly = fetchQuarterlyData as ReturnType<typeof vi.fn>;
const mockGetFrameData = getFrameData as ReturnType<typeof vi.fn>;

// ── Test Helpers ──────────────────────────────────────────────────────

const mockCompany: CikLookup = { cik: '0000320193', ticker: 'AAPL', name: 'Apple Inc.' };
const mockCompany2: CikLookup = { cik: '0000789019', ticker: 'MSFT', name: 'Microsoft Corporation' };

function makeDataPoint(year: number, value: number, metricId = 'revenue'): DataPoint {
  return {
    metric_id: metricId,
    cik: '0000320193',
    company_name: 'Apple Inc.',
    fiscal_year: year,
    fiscal_period: 'FY',
    period_start: `${year - 1}-10-01`,
    period_end: `${year}-09-30`,
    value,
    unit: 'USD',
    source: {
      accession_number: `0000320193-${year}-test`,
      filing_date: `${year}-11-01`,
      form_type: '10-K',
      xbrl_concept: 'us-gaap:Revenues',
    },
    restated_in: null,
    is_latest: true,
    extracted_at: new Date().toISOString(),
    checksum: `test-${year}`,
  };
}

function makeFetchResult(dataPoints: DataPoint[]): FetchResult {
  return {
    dataPoints,
    conceptUsed: 'us-gaap:Revenues',
    conceptSelection: {
      concepts_tried: [{ taxonomy: 'us-gaap', concept: 'Revenues', priority: 1, found: true, annual_count: dataPoints.length, max_fiscal_year: dataPoints.length > 0 ? Math.max(...dataPoints.map(d => d.fiscal_year)) : null }],
      selected_reason: 'highest priority with data',
    },
    restatements: [],
  };
}

function setupCompanyResolution(company?: CikLookup | null, suggestions: CikLookup[] = []) {
  mockResolve.mockResolvedValue({
    company: company ?? null,
    suggestions,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── executeQueryCore ──────────────────────────────────────────────────

describe('executeQueryCore', () => {
  it('returns metric_not_found for unknown metric', async () => {
    const result = await executeQueryCore({ company: 'AAPL', metric: 'employees' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('metric_not_found');
    expect(result.error?.availableMetrics).toBeDefined();
    expect(result.error!.availableMetrics!.length).toBeGreaterThan(0);
  });

  it('returns company_not_found when company cannot be resolved', async () => {
    setupCompanyResolution(null);
    const result = await executeQueryCore({ company: 'NONEXISTENT', metric: 'revenue' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('company_not_found');
  });

  it('returns company_ambiguous with suggestions', async () => {
    setupCompanyResolution(null, [mockCompany, mockCompany2]);
    const result = await executeQueryCore({ company: 'App', metric: 'revenue' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('company_ambiguous');
    expect(result.error?.suggestions).toHaveLength(2);
  });

  it('returns no_data when metric has no data points', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric.mockResolvedValue(makeFetchResult([]));
    const result = await executeQueryCore({ company: 'AAPL', metric: 'revenue' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('no_data');
  });

  it('returns successful result with data points and calculations', async () => {
    setupCompanyResolution(mockCompany);
    const dps = [makeDataPoint(2022, 394e9), makeDataPoint(2023, 383e9), makeDataPoint(2024, 391e9)];
    mockFetchMetric.mockResolvedValue(makeFetchResult(dps));

    const result = await executeQueryCore({ company: 'AAPL', metric: 'revenue', years: 3 });
    expect(result.success).toBe(true);
    expect(result.result!.company.ticker).toBe('AAPL');
    expect(result.result!.metric.id).toBe('revenue');
    expect(result.result!.data_points).toHaveLength(3);
    expect(result.result!.calculations.yoy_changes).toHaveLength(3);
  });

  it('filters by target year', async () => {
    setupCompanyResolution(mockCompany);
    const dps = [makeDataPoint(2022, 394e9), makeDataPoint(2023, 383e9), makeDataPoint(2024, 391e9)];
    mockFetchMetric.mockResolvedValue(makeFetchResult(dps));

    const result = await executeQueryCore({ company: 'AAPL', metric: 'revenue', targetYear: 2023 });
    expect(result.success).toBe(true);
    expect(result.result!.data_points).toHaveLength(1);
    expect(result.result!.data_points[0].fiscal_year).toBe(2023);
  });

  it('resolves metric by display name', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric.mockResolvedValue(makeFetchResult([makeDataPoint(2024, 391e9)]));

    const result = await executeQueryCore({ company: 'AAPL', metric: 'revenue' });
    expect(result.success).toBe(true);
    expect(result.result!.metric.id).toBe('revenue');
  });
});

// ── executeCompareCore ────────────────────────────────────────────────

describe('executeCompareCore', () => {
  it('returns metric error for unknown metric', async () => {
    const result = await executeCompareCore({ tickers: ['AAPL', 'MSFT'], metric: 'unknown_metric' });
    expect(result.results).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns results for multiple companies', async () => {
    mockResolve
      .mockResolvedValueOnce({ company: mockCompany, suggestions: [] })
      .mockResolvedValueOnce({ company: mockCompany2, suggestions: [] });
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 391e9)]))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 245e9)]));

    const result = await executeCompareCore({ tickers: ['AAPL', 'MSFT'], metric: 'revenue', years: 1 });
    expect(result.results).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('collects errors for unresolvable companies', async () => {
    mockResolve
      .mockResolvedValueOnce({ company: mockCompany, suggestions: [] })
      .mockResolvedValueOnce({ company: null, suggestions: [] });
    mockFetchMetric.mockResolvedValue(makeFetchResult([makeDataPoint(2024, 391e9)]));

    const result = await executeCompareCore({ tickers: ['AAPL', 'BADTICKER'], metric: 'revenue' });
    expect(result.results).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].ticker).toBe('BADTICKER');
  });

  it('handles fetch errors gracefully', async () => {
    mockResolve
      .mockResolvedValueOnce({ company: mockCompany, suggestions: [] })
      .mockResolvedValueOnce({ company: mockCompany2, suggestions: [] });
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 391e9)]))
      .mockRejectedValueOnce(new Error('Network error'));

    const result = await executeCompareCore({ tickers: ['AAPL', 'MSFT'], metric: 'revenue' });
    expect(result.results).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Network error');
  });
});

// ── executeRatioCore ──────────────────────────────────────────────────

describe('executeRatioCore', () => {
  it('returns ratio_not_found for unknown ratio', async () => {
    const result = await executeRatioCore({ company: 'AAPL', ratio: 'unknown_ratio' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('ratio_not_found');
    expect(result.error?.availableRatios).toBeDefined();
  });

  it('returns company_not_found when company cannot be resolved', async () => {
    setupCompanyResolution(null);
    const result = await executeRatioCore({ company: 'NONEXISTENT', ratio: 'net_margin' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('company_not_found');
  });

  it('returns company_ambiguous with suggestions', async () => {
    setupCompanyResolution(null, [mockCompany]);
    const result = await executeRatioCore({ company: 'App', ratio: 'net_margin' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('company_ambiguous');
  });

  it('computes net margin correctly', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 94e9, 'net_income')])) // numerator
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 391e9, 'revenue')])); // denominator

    const result = await executeRatioCore({ company: 'AAPL', ratio: 'net_margin' });
    expect(result.success).toBe(true);
    expect(result.result!.data_points).toHaveLength(1);
    // net_margin = net_income / revenue = 94/391 ≈ 24.0%
    expect(result.result!.data_points[0].value).toBeCloseTo(24.0, 0);
    expect(result.result!.ratio.id).toBe('net_margin');
  });

  it('handles division by zero', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 94e9, 'net_income')]))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 0, 'revenue')]));

    const result = await executeRatioCore({ company: 'AAPL', ratio: 'net_margin' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('no_data');
  });

  it('returns no_data when numerator metric is empty', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([]))  // no numerator data
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 391e9, 'revenue')]));

    const result = await executeRatioCore({ company: 'AAPL', ratio: 'net_margin' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('no_data');
  });

  it('computes free cash flow as subtraction', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 110e9, 'operating_cash_flow')]))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 11e9, 'capex')]));

    const result = await executeRatioCore({ company: 'AAPL', ratio: 'free_cash_flow' });
    expect(result.success).toBe(true);
    // Free cash flow = OCF - capex
    expect(result.result!.data_points[0].value).toBe(99e9);
  });

  it('aligns data by fiscal year (only overlapping years)', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([
        makeDataPoint(2023, 90e9, 'net_income'),
        makeDataPoint(2024, 94e9, 'net_income'),
      ]))
      .mockResolvedValueOnce(makeFetchResult([
        makeDataPoint(2022, 365e9, 'revenue'),
        makeDataPoint(2023, 383e9, 'revenue'),
        makeDataPoint(2024, 391e9, 'revenue'),
      ]));

    const result = await executeRatioCore({ company: 'AAPL', ratio: 'net_margin' });
    expect(result.success).toBe(true);
    // Only 2023 and 2024 overlap
    expect(result.result!.data_points).toHaveLength(2);
    expect(result.result!.data_points[0].fiscal_year).toBe(2023);
    expect(result.result!.data_points[1].fiscal_year).toBe(2024);
  });
});

// ── executeCompareRatioCore ───────────────────────────────────────────

describe('executeCompareRatioCore', () => {
  it('returns error for unknown ratio', async () => {
    const result = await executeCompareRatioCore({ tickers: ['AAPL', 'MSFT'], ratio: 'unknown' });
    expect(result.results).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('compares a ratio across companies', async () => {
    mockResolve
      .mockResolvedValueOnce({ company: mockCompany, suggestions: [] })
      .mockResolvedValueOnce({ company: mockCompany2, suggestions: [] });
    // AAPL: net_income then revenue
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 94e9, 'net_income')]))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 391e9, 'revenue')]))
    // MSFT: net_income then revenue
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 88e9, 'net_income')]))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 245e9, 'revenue')]));

    const result = await executeCompareRatioCore({ tickers: ['AAPL', 'MSFT'], ratio: 'net_margin' });
    expect(result.results).toHaveLength(2);
    expect(result.ratio_display_name).toBe('Net Profit Margin');
  });

  it('handles partial failures gracefully', async () => {
    mockResolve
      .mockResolvedValueOnce({ company: mockCompany, suggestions: [] })
      .mockResolvedValueOnce({ company: null, suggestions: [] });
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 94e9, 'net_income')]))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 391e9, 'revenue')]));

    const result = await executeCompareRatioCore({ tickers: ['AAPL', 'BADTICKER'], ratio: 'net_margin' });
    expect(result.results).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });
});

// ── executeSummaryCore ────────────────────────────────────────────────

describe('executeSummaryCore', () => {
  it('returns company_not_found when company cannot be resolved', async () => {
    setupCompanyResolution(null);
    const result = await executeSummaryCore({ company: 'NONEXISTENT' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('company_not_found');
  });

  it('returns company_ambiguous with suggestions', async () => {
    setupCompanyResolution(null, [mockCompany, mockCompany2]);
    const result = await executeSummaryCore({ company: 'App' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('company_ambiguous');
    expect(result.error?.suggestions).toHaveLength(2);
  });

  it('returns no_data when all metrics are empty', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric.mockResolvedValue(makeFetchResult([]));
    const result = await executeSummaryCore({ company: 'AAPL' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('no_data');
  });

  it('returns summary with metrics and derived ratios', async () => {
    setupCompanyResolution(mockCompany);
    // Mock that each metric returns data for 2024 and 2023
    mockFetchMetric.mockImplementation(async (_company: CikLookup, metric: MetricDefinition) => {
      const values: Record<string, [number, number]> = {
        revenue: [383e9, 391e9],
        net_income: [90e9, 94e9],
        gross_profit: [170e9, 178e9],
        operating_income: [114e9, 120e9],
        operating_cash_flow: [100e9, 110e9],
        capex: [10e9, 11e9],
        total_debt: [110e9, 105e9],
        total_equity: [60e9, 65e9],
        total_assets: [350e9, 360e9],
        current_assets: [130e9, 135e9],
        current_liabilities: [145e9, 150e9],
        interest_expense: [3.5e9, 3.6e9],
      };
      const pair = values[metric.id];
      if (pair) {
        return makeFetchResult([
          makeDataPoint(2023, pair[0], metric.id),
          makeDataPoint(2024, pair[1], metric.id),
        ]);
      }
      return makeFetchResult([]);
    });

    const result = await executeSummaryCore({ company: 'AAPL' });
    expect(result.success).toBe(true);
    const summary = result.result!;
    expect(summary.company.ticker).toBe('AAPL');
    expect(summary.fiscal_year).toBe(2024);
    expect(summary.metrics.length).toBeGreaterThan(0);

    // Check that YoY changes are computed
    const revMetric = summary.metrics.find(m => m.metric.id === 'revenue');
    expect(revMetric).toBeDefined();
    expect(revMetric!.yoy_change).toBeCloseTo(2.1, 0);

    // Check derived ratios
    expect(summary.derived.length).toBeGreaterThan(0);
    const netMargin = summary.derived.find(d => d.name === 'Net Margin');
    expect(netMargin).toBeDefined();
    expect(netMargin!.format).toBe('percentage');
  });

  it('handles a specific target year', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric.mockImplementation(async (_company: CikLookup, metric: MetricDefinition) => {
      return makeFetchResult([
        makeDataPoint(2022, 394e9, metric.id),
        makeDataPoint(2023, 383e9, metric.id),
      ]);
    });

    const result = await executeSummaryCore({ company: 'AAPL', year: 2022 });
    expect(result.success).toBe(true);
    expect(result.result!.fiscal_year).toBe(2022);
  });

  it('handles sign flip in YoY change', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric.mockImplementation(async (_company: CikLookup, metric: MetricDefinition) => {
      if (metric.id === 'net_income') {
        return makeFetchResult([
          makeDataPoint(2023, -50e9, metric.id), // loss
          makeDataPoint(2024, 94e9, metric.id),  // profit
        ]);
      }
      return makeFetchResult([]);
    });

    const result = await executeSummaryCore({ company: 'AAPL' });
    expect(result.success).toBe(true);
    const ni = result.result!.metrics.find(m => m.metric.id === 'net_income');
    expect(ni).toBeDefined();
    // Sign flip should result in undefined YoY change
    expect(ni!.yoy_change).toBeUndefined();
  });

  it('catches fetch errors and continues with other metrics', async () => {
    setupCompanyResolution(mockCompany);
    let callCount = 0;
    mockFetchMetric.mockImplementation(async (_company: CikLookup, metric: MetricDefinition) => {
      callCount++;
      if (callCount === 1) throw new Error('API error');
      return makeFetchResult([makeDataPoint(2024, 391e9, metric.id)]);
    });

    const result = await executeSummaryCore({ company: 'AAPL' });
    expect(result.success).toBe(true);
    // Should still have results from the metrics that didn't fail
    expect(result.result!.metrics.length).toBeGreaterThan(0);
  });
});

// ── executeMultiMetricCore ────────────────────────────────────────────

describe('executeMultiMetricCore', () => {
  it('returns metric_not_found for unknown metric', async () => {
    const result = await executeMultiMetricCore({ company: 'AAPL', metrics: ['revenue', 'unknown_metric'] });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('metric_not_found');
  });

  it('returns company_not_found when company cannot be resolved', async () => {
    setupCompanyResolution(null);
    const result = await executeMultiMetricCore({ company: 'NONEXISTENT', metrics: ['revenue', 'net_income'] });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('company_not_found');
  });

  it('returns no_data when all metrics have no data', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric.mockResolvedValue(makeFetchResult([]));
    const result = await executeMultiMetricCore({ company: 'AAPL', metrics: ['revenue', 'net_income'] });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('no_data');
  });

  it('returns data for multiple metrics', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2023, 383e9), makeDataPoint(2024, 391e9)]))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2023, 90e9), makeDataPoint(2024, 94e9)]));

    const result = await executeMultiMetricCore({ company: 'AAPL', metrics: ['revenue', 'net_income'] });
    expect(result.success).toBe(true);
    expect(result.result!.metrics).toHaveLength(2);
    expect(result.result!.years).toEqual([2023, 2024]);
    expect(result.result!.data.size).toBe(2);
  });

  it('handles sparse data (different years for different metrics)', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2022, 394e9), makeDataPoint(2024, 391e9)]))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2023, 90e9), makeDataPoint(2024, 94e9)]));

    const result = await executeMultiMetricCore({ company: 'AAPL', metrics: ['revenue', 'net_income'] });
    expect(result.success).toBe(true);
    expect(result.result!.years).toEqual([2022, 2023, 2024]);
  });

  it('catches fetch errors and still includes other metrics', async () => {
    setupCompanyResolution(mockCompany);
    mockFetchMetric
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 94e9)]));

    const result = await executeMultiMetricCore({ company: 'AAPL', metrics: ['revenue', 'net_income'] });
    expect(result.success).toBe(true);
    // Both metrics get entries in the map, but the errored one has empty data
    expect(result.result!.data.size).toBe(2);
    expect(result.result!.data.get('revenue')!.size).toBe(0);
    expect(result.result!.data.get('net_income')!.size).toBe(1);
  });
});

// ── executeMatrixCore ─────────────────────────────────────────────────

describe('executeMatrixCore', () => {
  it('returns metric_not_found for unknown metric', async () => {
    const result = await executeMatrixCore({ tickers: ['AAPL', 'MSFT'], metrics: ['unknown_metric'] });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('metric_not_found');
  });

  it('returns no_data when no companies can be resolved', async () => {
    mockResolve.mockResolvedValue({ company: null, suggestions: [] });
    const result = await executeMatrixCore({ tickers: ['BAD1', 'BAD2'], metrics: ['revenue'] });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('no_data');
    expect(result.errors).toHaveLength(2);
  });

  it('returns matrix data for multiple companies and metrics', async () => {
    mockResolve
      .mockResolvedValueOnce({ company: mockCompany, suggestions: [] })
      .mockResolvedValueOnce({ company: mockCompany2, suggestions: [] });
    mockFetchMetric
      // AAPL revenue, net_income
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 391e9)]))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 94e9)]))
      // MSFT revenue, net_income
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 245e9)]))
      .mockResolvedValueOnce(makeFetchResult([makeDataPoint(2024, 88e9)]));

    const result = await executeMatrixCore({ tickers: ['AAPL', 'MSFT'], metrics: ['revenue', 'net_income'] });
    expect(result.success).toBe(true);
    expect(result.result!.companies).toHaveLength(2);
    expect(result.result!.metrics).toHaveLength(2);
    expect(result.result!.fiscal_year).toBe(2024);
  });

  it('preserves ticker ordering in results', async () => {
    mockResolve
      .mockResolvedValueOnce({ company: mockCompany2, suggestions: [] })
      .mockResolvedValueOnce({ company: mockCompany, suggestions: [] });
    mockFetchMetric.mockResolvedValue(makeFetchResult([makeDataPoint(2024, 100e9)]));

    const result = await executeMatrixCore({ tickers: ['MSFT', 'AAPL'], metrics: ['revenue'] });
    expect(result.success).toBe(true);
    // Should be in input order: MSFT first, then AAPL
    expect(result.result!.companies[0].company.ticker).toBe('MSFT');
    expect(result.result!.companies[1].company.ticker).toBe('AAPL');
  });

  it('uses specific target year when provided', async () => {
    mockResolve.mockResolvedValue({ company: mockCompany, suggestions: [] });
    mockFetchMetric.mockResolvedValue(makeFetchResult([
      makeDataPoint(2023, 383e9),
      makeDataPoint(2024, 391e9),
    ]));

    const result = await executeMatrixCore({ tickers: ['AAPL', 'AAPL'], metrics: ['revenue'], year: 2023 });
    expect(result.success).toBe(true);
    expect(result.result!.fiscal_year).toBe(2023);
  });

  it('collects errors for partially failed companies', async () => {
    mockResolve
      .mockResolvedValueOnce({ company: mockCompany, suggestions: [] })
      .mockResolvedValueOnce({ company: null, suggestions: [] });
    mockFetchMetric.mockResolvedValue(makeFetchResult([makeDataPoint(2024, 391e9)]));

    const result = await executeMatrixCore({ tickers: ['AAPL', 'BAD'], metrics: ['revenue'] });
    expect(result.success).toBe(true);
    expect(result.result!.companies).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });
});

// ── executeScreenCore ─────────────────────────────────────────────────

describe('executeScreenCore', () => {
  it('returns metric_not_found for unknown metric', async () => {
    const result = await executeScreenCore({ metric: 'unknown_metric' });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('metric_not_found');
  });

  it('returns no_data when frames API returns empty', async () => {
    mockGetFrameData.mockResolvedValue({ data: [] });
    const result = await executeScreenCore({ metric: 'revenue', year: 2024 });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('no_data');
  });

  it('returns screened companies sorted by value', async () => {
    mockGetFrameData.mockResolvedValue({
      data: [
        { cik: 1, entityName: 'Company A', val: 100e9, start: '2023-01-01', end: '2023-12-31', accn: 'a-1', loc: 'CA' },
        { cik: 2, entityName: 'Company B', val: 200e9, start: '2023-01-01', end: '2023-12-31', accn: 'a-2', loc: 'NY' },
        { cik: 3, entityName: 'Company C', val: 50e9, start: '2023-01-01', end: '2023-12-31', accn: 'a-3', loc: 'TX' },
      ],
    });

    const result = await executeScreenCore({ metric: 'revenue', year: 2023 });
    expect(result.success).toBe(true);
    expect(result.result!.companies).toHaveLength(3);
    // Default sort is value_desc
    expect(result.result!.companies[0].entity_name).toBe('Company B');
    expect(result.result!.companies[2].entity_name).toBe('Company C');
  });

  it('applies min/max value filters', async () => {
    mockGetFrameData.mockResolvedValue({
      data: [
        { cik: 1, entityName: 'Small', val: 1e9, start: '2023-01-01', end: '2023-12-31', accn: 'a-1', loc: '' },
        { cik: 2, entityName: 'Medium', val: 50e9, start: '2023-01-01', end: '2023-12-31', accn: 'a-2', loc: '' },
        { cik: 3, entityName: 'Large', val: 200e9, start: '2023-01-01', end: '2023-12-31', accn: 'a-3', loc: '' },
      ],
    });

    const result = await executeScreenCore({ metric: 'revenue', minValue: 10e9, maxValue: 100e9 });
    expect(result.success).toBe(true);
    expect(result.result!.companies).toHaveLength(1);
    expect(result.result!.companies[0].entity_name).toBe('Medium');
    expect(result.result!.total_companies).toBe(3);
    expect(result.result!.filtered_companies).toBe(1);
  });

  it('sorts by name when requested', async () => {
    mockGetFrameData.mockResolvedValue({
      data: [
        { cik: 1, entityName: 'Zebra Inc', val: 100e9, start: '2023-01-01', end: '2023-12-31', accn: 'a-1', loc: '' },
        { cik: 2, entityName: 'Apple Inc', val: 200e9, start: '2023-01-01', end: '2023-12-31', accn: 'a-2', loc: '' },
      ],
    });

    const result = await executeScreenCore({ metric: 'revenue', sortBy: 'name' });
    expect(result.success).toBe(true);
    expect(result.result!.companies[0].entity_name).toBe('Apple Inc');
  });

  it('respects limit parameter', async () => {
    mockGetFrameData.mockResolvedValue({
      data: Array.from({ length: 100 }, (_, i) => ({
        cik: i, entityName: `Company ${i}`, val: (100 - i) * 1e9,
        start: '2023-01-01', end: '2023-12-31', accn: `a-${i}`, loc: '',
      })),
    });

    const result = await executeScreenCore({ metric: 'revenue', limit: 5 });
    expect(result.success).toBe(true);
    expect(result.result!.companies).toHaveLength(5);
    expect(result.result!.filtered_companies).toBe(100);
  });

  it('tries fallback XBRL concepts', async () => {
    // First concept returns empty, second returns data
    mockGetFrameData
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          { cik: 1, entityName: 'Test', val: 100e9, start: '2023-01-01', end: '2023-12-31', accn: 'a-1', loc: '' },
        ],
      });

    const result = await executeScreenCore({ metric: 'revenue', year: 2023 });
    expect(result.success).toBe(true);
    expect(mockGetFrameData).toHaveBeenCalledTimes(2);
  });
});
