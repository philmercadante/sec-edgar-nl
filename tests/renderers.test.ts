import { describe, it, expect } from 'vitest';
import { formatCurrency, formatShareCount, sparkline, renderTable } from '../src/output/table-renderer.js';
import { renderRatioJson, renderRatioCsv, renderRatioTable, renderCompareRatioTable, renderCompareRatioCsv } from '../src/output/ratio-renderer.js';
import { renderFilingJson, type FilingListResult } from '../src/output/filing-renderer.js';
import { renderSummaryJson, type SummaryResult } from '../src/output/summary-renderer.js';
import { renderCsv, renderComparisonCsv } from '../src/output/csv-renderer.js';
import { renderJson } from '../src/output/json-renderer.js';
import type { RatioResult } from '../src/core/query-engine.js';
import type { QueryResult, MetricDefinition } from '../src/core/types.js';

const mockMetric: MetricDefinition = {
  id: 'revenue',
  display_name: 'Revenue',
  description: 'Total revenue',
  accounting_framework: 'US-GAAP',
  statement_type: 'income_statement',
  xbrl_concepts: [{ taxonomy: 'us-gaap', concept: 'Revenues', valid_from: null, valid_to: null, priority: 1 }],
  unit_type: 'currency',
  aggregation: 'sum',
  version: 1,
  introduced_on: '2025-01-01',
  deprecated_on: null,
};

describe('formatCurrency', () => {
  it('formats trillions', () => {
    expect(formatCurrency(1.5e12)).toBe('$1.50T');
  });

  it('formats billions', () => {
    expect(formatCurrency(394328000000)).toBe('$394.33B');
  });

  it('formats millions', () => {
    expect(formatCurrency(34550000000)).toBe('$34.55B');
    expect(formatCurrency(5000000)).toBe('$5.00M');
  });

  it('formats thousands', () => {
    expect(formatCurrency(5000)).toBe('$5.00K');
  });

  it('formats small values', () => {
    expect(formatCurrency(42)).toBe('$42');
  });

  it('handles negative values', () => {
    expect(formatCurrency(-1e9)).toBe('-$1.00B');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('$0');
  });
});

describe('formatShareCount', () => {
  it('formats billions', () => {
    expect(formatShareCount(15e9)).toBe('15.00B');
  });

  it('formats millions', () => {
    expect(formatShareCount(150e6)).toBe('150.00M');
  });

  it('formats thousands', () => {
    expect(formatShareCount(50e3)).toBe('50.0K');
  });

  it('handles small counts', () => {
    expect(formatShareCount(500)).toBe('500');
  });
});

describe('renderRatioJson', () => {
  const mockRatio: RatioResult = {
    company: { cik: '320193', ticker: 'AAPL', name: 'Apple Inc.', fiscal_year_end_month: 0 },
    ratio: { id: 'net_margin', display_name: 'Net Profit Margin', description: 'Net income / revenue', numerator: 'net_income', denominator: 'revenue', format: 'percentage' },
    data_points: [
      { fiscal_year: 2023, value: 25.3, numerator_value: 99803e6, denominator_value: 394328e6 },
      { fiscal_year: 2024, value: 26.4, numerator_value: 93736e6, denominator_value: 391035e6 },
    ],
    numerator_metric: 'Net Income',
    denominator_metric: 'Revenue',
  };

  it('produces valid JSON', () => {
    const json = JSON.parse(renderRatioJson(mockRatio));
    expect(json.company.ticker).toBe('AAPL');
    expect(json.ratio.id).toBe('net_margin');
    expect(json.data).toHaveLength(2);
  });

  it('includes formula info', () => {
    const json = JSON.parse(renderRatioJson(mockRatio));
    expect(json.formula.numerator).toBe('Net Income');
    expect(json.formula.denominator).toBe('Revenue');
    expect(json.formula.operation).toBe('divide');
  });
});

describe('renderRatioCsv', () => {
  const mockRatio: RatioResult = {
    company: { cik: '320193', ticker: 'AAPL', name: 'Apple Inc.', fiscal_year_end_month: 0 },
    ratio: { id: 'net_margin', display_name: 'Net Profit Margin', description: 'test', numerator: 'net_income', denominator: 'revenue', format: 'percentage' },
    data_points: [
      { fiscal_year: 2023, value: 25.3, numerator_value: 100e6, denominator_value: 400e6 },
    ],
    numerator_metric: 'Net Income',
    denominator_metric: 'Revenue',
  };

  it('outputs CSV header and data', () => {
    const csv = renderRatioCsv(mockRatio);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Period,Net Profit Margin,Net Income,Revenue');
    expect(lines[1]).toBe('FY2023,25.3,100000000,400000000');
  });
});

describe('renderFilingJson', () => {
  const mockFilings: FilingListResult = {
    company: { cik: '320193', ticker: 'AAPL', name: 'Apple Inc.', fiscal_year_end_month: 0 },
    filings: [
      {
        form_type: '10-K',
        filing_date: '2024-11-01',
        description: 'Annual Report',
        accession_number: '0000320193-24-000001',
        edgar_url: 'https://example.com',
      },
    ],
    total_available: 100,
  };

  it('produces valid JSON', () => {
    const json = JSON.parse(renderFilingJson(mockFilings));
    expect(json.company.ticker).toBe('AAPL');
    expect(json.filings).toHaveLength(1);
    expect(json.filings[0].form_type).toBe('10-K');
    expect(json.total_available).toBe(100);
  });

  it('handles empty filings', () => {
    const empty = { ...mockFilings, filings: [] };
    const json = JSON.parse(renderFilingJson(empty));
    expect(json.filings).toHaveLength(0);
  });
});

describe('renderSummaryJson', () => {
  const mockSummary: SummaryResult = {
    company: { cik: '320193', ticker: 'AAPL', name: 'Apple Inc.', fiscal_year_end_month: 0 },
    fiscal_year: 2024,
    metrics: [
      {
        metric: mockMetric,
        value: 394328e6,
        prior_year_value: 365817e6,
        yoy_change: 7.8,
      },
    ],
    derived: [
      { name: 'Net Margin', value: 25.3, format: 'percentage' },
      { name: 'Free Cash Flow', value: 100e9, format: 'currency' },
    ],
  };

  it('produces valid JSON', () => {
    const json = JSON.parse(renderSummaryJson(mockSummary));
    expect(json.company.ticker).toBe('AAPL');
    expect(json.fiscal_year).toBe(2024);
    expect(json.metrics).toHaveLength(1);
    expect(json.metrics[0].yoy_change_pct).toBe(7.8);
  });

  it('includes derived ratios', () => {
    const json = JSON.parse(renderSummaryJson(mockSummary));
    expect(json.derived_ratios).toHaveLength(2);
    expect(json.derived_ratios[0].name).toBe('Net Margin');
    expect(json.derived_ratios[0].value).toBe(25.3);
  });
});

describe('renderCsv', () => {
  const mockResult: QueryResult = {
    company: { cik: '320193', ticker: 'AAPL', name: 'Apple Inc.', fiscal_year_end_month: 0 },
    metric: mockMetric,
    data_points: [
      {
        metric_id: 'revenue', cik: '320193', company_name: 'Apple Inc.',
        fiscal_year: 2023, fiscal_period: 'FY', period_start: '2022-10-01', period_end: '2023-09-30',
        value: 383285e6, unit: 'USD',
        source: { accession_number: '0000320193-23-000077', filing_date: '2023-11-03', form_type: '10-K', xbrl_concept: 'us-gaap:Revenues' },
        restated_in: null, is_latest: true, extracted_at: '2024-01-01T00:00:00Z', checksum: 'abc',
      },
      {
        metric_id: 'revenue', cik: '320193', company_name: 'Apple Inc.',
        fiscal_year: 2024, fiscal_period: 'FY', period_start: '2023-10-01', period_end: '2024-09-28',
        value: 391035e6, unit: 'USD',
        source: { accession_number: '0000320193-24-000081', filing_date: '2024-11-01', form_type: '10-K', xbrl_concept: 'us-gaap:Revenues' },
        restated_in: null, is_latest: true, extracted_at: '2024-01-01T00:00:00Z', checksum: 'def',
      },
    ],
    calculations: {
      yoy_changes: [{ year: 2024, change_pct: 2.0 }],
      cagr: 2.0,
      cagr_years: 1,
    },
    provenance: {
      metric_concept: 'us-gaap:Revenues',
      filings_used: [],
      dedup_strategy: 'most-recently-filed',
      period_type: 'annual',
      notes: [],
    },
  };

  it('outputs CSV with header and data rows', () => {
    const csv = renderCsv(mockResult);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Period,Value,YoY_Change_Pct,Period_End,Form_Type,Accession_Number,XBRL_Concept');
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it('includes provenance columns', () => {
    const csv = renderCsv(mockResult);
    const lines = csv.split('\n');
    const row = lines[1].split(',');
    expect(row[0]).toBe('FY2023');
    expect(row[4]).toBe('10-K');
    expect(row[5]).toBe('0000320193-23-000077');
  });

  it('computes YoY change for second row', () => {
    const csv = renderCsv(mockResult);
    const lines = csv.split('\n');
    const row2 = lines[2].split(',');
    expect(row2[2]).toBe('2.0'); // YoY change pct
  });
});

describe('sparkline', () => {
  it('returns empty string for single value', () => {
    expect(sparkline([100])).toBe('');
  });

  it('generates 2-character sparkline for 2 values', () => {
    const result = sparkline([10, 100]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('▁');
    expect(result[1]).toBe('█');
  });

  it('generates correct length for N values', () => {
    const values = [10, 20, 30, 40, 50];
    expect(sparkline(values)).toHaveLength(5);
  });

  it('shows flat line for equal values', () => {
    const result = sparkline([100, 100, 100, 100]);
    expect(result).toBe('▅▅▅▅');
  });

  it('shows ascending pattern for increasing values', () => {
    const result = sparkline([0, 50, 100]);
    expect(result[0]).toBe('▁');
    expect(result[2]).toBe('█');
  });

  it('shows descending pattern for decreasing values', () => {
    const result = sparkline([100, 50, 0]);
    expect(result[0]).toBe('█');
    expect(result[2]).toBe('▁');
  });

  it('handles negative values', () => {
    const result = sparkline([-100, -50, 0, 50, 100]);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe('▁');
    expect(result[4]).toBe('█');
  });
});

describe('renderTable with sparkline', () => {
  function makeDataPoint(fy: number, value: number) {
    return {
      metric_id: 'revenue', cik: '320193', company_name: 'Apple Inc.',
      fiscal_year: fy, fiscal_period: 'FY' as const, period_start: `${fy - 1}-10-01`, period_end: `${fy}-09-30`,
      value, unit: 'USD',
      source: { accession_number: `accn-${fy}`, filing_date: `${fy + 1}-11-01`, form_type: '10-K', xbrl_concept: 'us-gaap:Revenues' },
      restated_in: null, is_latest: true, extracted_at: '2025-01-01T00:00:00Z', checksum: 'test',
    };
  }

  it('includes sparkline when 3+ data points', () => {
    const result: QueryResult = {
      company: { cik: '320193', ticker: 'AAPL', name: 'Apple Inc.', fiscal_year_end_month: 0 },
      metric: mockMetric,
      data_points: [makeDataPoint(2022, 300e9), makeDataPoint(2023, 350e9), makeDataPoint(2024, 400e9)],
      calculations: { yoy_changes: [], cagr: null, cagr_years: 0 },
      provenance: { metric_concept: 'test', filings_used: [], dedup_strategy: 'test', period_type: 'annual', notes: [] },
    };
    const output = renderTable(result);
    expect(output).toContain('Trend:');
  });

  it('omits sparkline when fewer than 3 data points', () => {
    const result: QueryResult = {
      company: { cik: '320193', ticker: 'AAPL', name: 'Apple Inc.', fiscal_year_end_month: 0 },
      metric: mockMetric,
      data_points: [makeDataPoint(2023, 350e9), makeDataPoint(2024, 400e9)],
      calculations: { yoy_changes: [], cagr: null, cagr_years: 0 },
      provenance: { metric_concept: 'test', filings_used: [], dedup_strategy: 'test', period_type: 'annual', notes: [] },
    };
    const output = renderTable(result);
    expect(output).not.toContain('Trend:');
  });
});

describe('renderRatioTable with sparkline', () => {
  const mockRatio: RatioResult = {
    company: { cik: '320193', ticker: 'AAPL', name: 'Apple Inc.', fiscal_year_end_month: 0 },
    ratio: { id: 'net_margin', display_name: 'Net Profit Margin', description: 'Net income / revenue', numerator: 'net_income', denominator: 'revenue', format: 'percentage' },
    data_points: [
      { fiscal_year: 2022, value: 23.5, numerator_value: 85e9, denominator_value: 362e9 },
      { fiscal_year: 2023, value: 25.3, numerator_value: 100e9, denominator_value: 394e9 },
      { fiscal_year: 2024, value: 26.4, numerator_value: 103e9, denominator_value: 391e9 },
    ],
    numerator_metric: 'Net Income',
    denominator_metric: 'Revenue',
  };

  it('includes sparkline when 3+ data points', () => {
    const output = renderRatioTable(mockRatio);
    expect(output).toContain('Trend:');
  });

  it('includes change direction', () => {
    const output = renderRatioTable(mockRatio);
    expect(output).toContain('Change (FY2022→FY2024):');
  });

  it('omits sparkline with 2 data points', () => {
    const twoPoints = { ...mockRatio, data_points: mockRatio.data_points.slice(1) };
    const output = renderRatioTable(twoPoints);
    expect(output).not.toContain('Trend:');
    expect(output).toContain('Change (FY2023→FY2024):');
  });
});

describe('renderCompareRatioCsv', () => {
  const results: RatioResult[] = [
    {
      company: { cik: '320193', ticker: 'AAPL', name: 'Apple Inc.', fiscal_year_end_month: 0 },
      ratio: { id: 'net_margin', display_name: 'Net Profit Margin', description: 'test', numerator: 'net_income', denominator: 'revenue', format: 'percentage' },
      data_points: [{ fiscal_year: 2023, value: 25.3, numerator_value: 100e9, denominator_value: 394e9 }],
      numerator_metric: 'Net Income',
      denominator_metric: 'Revenue',
    },
    {
      company: { cik: '789019', ticker: 'MSFT', name: 'Microsoft Corp', fiscal_year_end_month: 0 },
      ratio: { id: 'net_margin', display_name: 'Net Profit Margin', description: 'test', numerator: 'net_income', denominator: 'revenue', format: 'percentage' },
      data_points: [{ fiscal_year: 2023, value: 34.1, numerator_value: 72e9, denominator_value: 211e9 }],
      numerator_metric: 'Net Income',
      denominator_metric: 'Revenue',
    },
  ];

  it('outputs CSV with company columns', () => {
    const csv = renderCompareRatioCsv(results);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('FY,AAPL,MSFT');
    expect(lines[1]).toBe('2023,25.3,34.1');
  });

  it('returns empty string for no results', () => {
    expect(renderCompareRatioCsv([])).toBe('');
  });
});

describe('formatCurrency edge cases', () => {
  it('formats negative trillions', () => {
    expect(formatCurrency(-2.5e12)).toBe('-$2.50T');
  });

  it('formats exactly at threshold boundaries', () => {
    expect(formatCurrency(1e12)).toBe('$1.00T');
    expect(formatCurrency(1e9)).toBe('$1.00B');
    expect(formatCurrency(1e6)).toBe('$1.00M');
    expect(formatCurrency(1e3)).toBe('$1.00K');
  });

  it('formats sub-dollar amounts', () => {
    expect(formatCurrency(0.5)).toBe('$1');  // rounds to nearest integer
  });
});

describe('formatShareCount edge cases', () => {
  it('formats negative values', () => {
    expect(formatShareCount(-500e6)).toBe('-500.00M');
  });

  it('formats zero', () => {
    expect(formatShareCount(0)).toBe('0');
  });

  it('formats exactly at thresholds', () => {
    expect(formatShareCount(1e9)).toBe('1.00B');
    expect(formatShareCount(1e6)).toBe('1.00M');
    expect(formatShareCount(1e3)).toBe('1.0K');
  });
});
