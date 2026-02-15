import { describe, it, expect } from 'vitest';
import { calculateGrowth } from '../src/processing/calculations.js';
import type { DataPoint } from '../src/core/types.js';

function makeDataPoint(fiscal_year: number, value: number): DataPoint {
  return {
    metric_id: 'test',
    cik: '123',
    company_name: 'Test Corp',
    fiscal_year,
    fiscal_period: 'FY',
    period_start: `${fiscal_year - 1}-01-01`,
    period_end: `${fiscal_year}-12-31`,
    value,
    unit: 'USD',
    source: {
      accession_number: 'test-accn',
      filing_date: `${fiscal_year + 1}-02-01`,
      form_type: '10-K',
      xbrl_concept: 'us-gaap:Test',
    },
    restated_in: null,
    is_latest: true,
    extracted_at: new Date().toISOString(),
    checksum: 'test',
  };
}

describe('calculateGrowth', () => {
  it('returns empty results for no data', () => {
    const result = calculateGrowth([]);
    expect(result.yoy_changes).toEqual([]);
    expect(result.cagr).toBeNull();
    expect(result.cagr_years).toBe(0);
  });

  it('calculates YoY changes correctly', () => {
    const data = [
      makeDataPoint(2021, 100_000_000),
      makeDataPoint(2022, 120_000_000),
      makeDataPoint(2023, 150_000_000),
    ];
    const result = calculateGrowth(data);

    expect(result.yoy_changes).toHaveLength(3);
    expect(result.yoy_changes[0].change_pct).toBeNull(); // first year
    expect(result.yoy_changes[1].change_pct).toBe(20.0);
    expect(result.yoy_changes[2].change_pct).toBe(25.0);
  });

  it('returns null YoY for sign changes (loss to profit)', () => {
    const data = [
      makeDataPoint(2021, -50_000_000),
      makeDataPoint(2022, 100_000_000),
    ];
    const result = calculateGrowth(data);
    expect(result.yoy_changes[1].change_pct).toBeNull();
  });

  it('returns null YoY for sign changes (profit to loss)', () => {
    const data = [
      makeDataPoint(2021, 100_000_000),
      makeDataPoint(2022, -50_000_000),
    ];
    const result = calculateGrowth(data);
    expect(result.yoy_changes[1].change_pct).toBeNull();
  });

  it('returns null YoY when previous value is zero', () => {
    const data = [
      makeDataPoint(2021, 0),
      makeDataPoint(2022, 100_000_000),
    ];
    const result = calculateGrowth(data);
    expect(result.yoy_changes[1].change_pct).toBeNull();
  });

  it('calculates CAGR correctly', () => {
    // $100M growing to $200M over 4 years = ~18.9% CAGR
    const data = [
      makeDataPoint(2020, 100_000_000),
      makeDataPoint(2021, 120_000_000),
      makeDataPoint(2022, 140_000_000),
      makeDataPoint(2023, 170_000_000),
      makeDataPoint(2024, 200_000_000),
    ];
    const result = calculateGrowth(data);
    expect(result.cagr).toBe(18.9);
    expect(result.cagr_years).toBe(4);
  });

  it('returns null CAGR when first or last value is negative', () => {
    const data = [
      makeDataPoint(2021, -100_000_000),
      makeDataPoint(2022, 50_000_000),
    ];
    const result = calculateGrowth(data);
    expect(result.cagr).toBeNull();
  });

  it('handles negative YoY change correctly', () => {
    const data = [
      makeDataPoint(2021, 200_000_000),
      makeDataPoint(2022, 150_000_000),
    ];
    const result = calculateGrowth(data);
    expect(result.yoy_changes[1].change_pct).toBe(-25.0);
  });

  it('handles single data point', () => {
    const data = [makeDataPoint(2024, 500_000_000)];
    const result = calculateGrowth(data);
    expect(result.yoy_changes).toHaveLength(1);
    expect(result.yoy_changes[0].change_pct).toBeNull();
    expect(result.cagr).toBeNull();
    expect(result.cagr_years).toBe(0);
  });

  it('returns null CAGR for extreme values that produce Infinity', () => {
    // Extremely small first value could produce Infinity CAGR
    const data = [
      makeDataPoint(2020, 1e-300),
      makeDataPoint(2024, 1e300),
    ];
    const result = calculateGrowth(data);
    expect(result.cagr).toBeNull();
  });
});
