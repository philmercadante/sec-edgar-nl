import type { DataPoint, Calculations } from '../core/types.js';

/**
 * Compute CAGR between two values over a number of years.
 * Returns null if inputs are invalid (zero/negative values, non-positive years).
 */
export function calculateCAGR(startValue: number, endValue: number, years: number): number | null {
  if (years <= 0 || startValue <= 0 || endValue <= 0) return null;
  const raw = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
  return isFinite(raw) ? Math.round(raw * 10) / 10 : null;
}

/**
 * Calculate YoY percentage change, handling sign flips and zero denominators.
 * Returns null for sign flips or zero denominators.
 */
export function calculateYoYChangePct(current: number, prior: number): number | null {
  if (prior === 0) return null;
  if ((prior > 0 && current < 0) || (prior < 0 && current > 0)) return null;
  const change = ((current - prior) / Math.abs(prior)) * 100;
  return Math.round(change * 10) / 10;
}

/**
 * Compute growth acceleration signal by comparing first-half vs second-half growth rates.
 * Requires at least 4 data points with positive values.
 */
export function computeGrowthSignal(values: number[]): {
  signal: 'accelerating' | 'decelerating' | 'stable';
  firstHalfAvg: number;
  secondHalfAvg: number;
} | null {
  const n = values.length;
  if (n < 4) return null;

  const mid = Math.floor(n / 2);
  const firstHalfGrowths: number[] = [];
  const secondHalfGrowths: number[] = [];

  for (let i = 1; i < n; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev > 0 && curr > 0) {
      const growth = ((curr - prev) / prev) * 100;
      if (i <= mid) firstHalfGrowths.push(growth);
      else secondHalfGrowths.push(growth);
    }
  }

  if (firstHalfGrowths.length === 0 || secondHalfGrowths.length === 0) return null;

  const firstAvg = firstHalfGrowths.reduce((a, b) => a + b, 0) / firstHalfGrowths.length;
  const secondAvg = secondHalfGrowths.reduce((a, b) => a + b, 0) / secondHalfGrowths.length;

  const signal = secondAvg > firstAvg + 2 ? 'accelerating'
    : secondAvg < firstAvg - 2 ? 'decelerating'
    : 'stable';

  return { signal, firstHalfAvg: firstAvg, secondHalfAvg: secondAvg };
}

/**
 * Calculate YoY changes and CAGR from a sorted array of DataPoints.
 * DataPoints must be in chronological order (oldest first).
 */
export function calculateGrowth(dataPoints: DataPoint[]): Calculations {
  if (dataPoints.length === 0) {
    return { yoy_changes: [], cagr: null, cagr_years: 0 };
  }

  const yoy_changes = dataPoints.map((dp, i) => {
    if (i === 0) return { year: dp.fiscal_year, change_pct: null };
    return { year: dp.fiscal_year, change_pct: calculateYoYChangePct(dp.value, dataPoints[i - 1].value) };
  });

  const cagr_years = dataPoints.length - 1;
  const cagr = cagr_years >= 2
    ? calculateCAGR(dataPoints[0].value, dataPoints[dataPoints.length - 1].value, cagr_years)
    : null;

  return { yoy_changes, cagr, cagr_years };
}
