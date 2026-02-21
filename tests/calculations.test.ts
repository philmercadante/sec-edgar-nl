import { describe, it, expect } from 'vitest';
import { calculateGrowth, calculateCAGR, calculateYoYChangePct, computeGrowthSignal } from '../src/processing/calculations.js';
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

  it('returns null CAGR for only 2 data points (1 year span)', () => {
    // CAGR requires at least 2 years span (3 data points) to be meaningful
    const data = [
      makeDataPoint(2023, 100_000_000),
      makeDataPoint(2024, 150_000_000),
    ];
    const result = calculateGrowth(data);
    expect(result.cagr).toBeNull();
    expect(result.cagr_years).toBe(1);
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

describe('calculateCAGR', () => {
  it('computes CAGR correctly for positive values', () => {
    // $100 to $200 over 4 years ≈ 18.9%
    expect(calculateCAGR(100, 200, 4)).toBe(18.9);
  });

  it('returns null for zero start value', () => {
    expect(calculateCAGR(0, 200, 4)).toBeNull();
  });

  it('returns null for negative values', () => {
    expect(calculateCAGR(-100, 200, 4)).toBeNull();
    expect(calculateCAGR(100, -200, 4)).toBeNull();
  });

  it('returns null for zero or negative years', () => {
    expect(calculateCAGR(100, 200, 0)).toBeNull();
    expect(calculateCAGR(100, 200, -1)).toBeNull();
  });

  it('returns 0 for unchanged values', () => {
    expect(calculateCAGR(100, 100, 5)).toBe(0);
  });

  it('computes 1-year CAGR as simple growth rate', () => {
    // $100 to $150 over 1 year = 50%
    expect(calculateCAGR(100, 150, 1)).toBe(50);
  });

  it('returns null for Infinity result', () => {
    expect(calculateCAGR(1e-300, 1e300, 1)).toBeNull();
  });
});

describe('calculateYoYChangePct', () => {
  it('computes positive YoY change', () => {
    expect(calculateYoYChangePct(150, 100)).toBe(50);
  });

  it('computes negative YoY change', () => {
    expect(calculateYoYChangePct(75, 100)).toBe(-25);
  });

  it('returns null for zero prior value', () => {
    expect(calculateYoYChangePct(100, 0)).toBeNull();
  });

  it('returns null for sign flip (positive to negative)', () => {
    expect(calculateYoYChangePct(-50, 100)).toBeNull();
  });

  it('returns null for sign flip (negative to positive)', () => {
    expect(calculateYoYChangePct(50, -100)).toBeNull();
  });

  it('handles both negative values correctly', () => {
    // -100 to -50 = 50% improvement
    expect(calculateYoYChangePct(-50, -100)).toBe(50);
  });

  it('returns 0 for unchanged values', () => {
    expect(calculateYoYChangePct(100, 100)).toBe(0);
  });
});

describe('computeGrowthSignal', () => {
  it('returns null for fewer than 4 data points', () => {
    expect(computeGrowthSignal([100, 110, 120])).toBeNull();
  });

  it('detects accelerating growth', () => {
    // First half: 10% growth, second half: 50% growth
    const values = [100, 110, 121, 182, 273];
    const result = computeGrowthSignal(values);
    expect(result).not.toBeNull();
    expect(result!.signal).toBe('accelerating');
  });

  it('detects decelerating growth', () => {
    // First half: 50% growth, second half: 5% growth
    const values = [100, 150, 225, 236, 248];
    const result = computeGrowthSignal(values);
    expect(result).not.toBeNull();
    expect(result!.signal).toBe('decelerating');
  });

  it('detects stable growth', () => {
    // Consistent ~10% growth
    const values = [100, 110, 121, 133, 146];
    const result = computeGrowthSignal(values);
    expect(result).not.toBeNull();
    expect(result!.signal).toBe('stable');
  });

  it('returns null when no valid growth rates (negative/zero values)', () => {
    const values = [-100, -200, -300, -400];
    expect(computeGrowthSignal(values)).toBeNull();
  });

  it('provides firstHalfAvg and secondHalfAvg', () => {
    const values = [100, 110, 121, 133, 146];
    const result = computeGrowthSignal(values);
    expect(result).not.toBeNull();
    expect(result!.firstHalfAvg).toBeCloseTo(10, 0);
    expect(result!.secondHalfAvg).toBeCloseTo(10, 0);
  });
});
