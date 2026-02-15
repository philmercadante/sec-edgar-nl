import type { DataPoint, Calculations } from '../core/types.js';

/**
 * Calculate YoY changes and CAGR from a sorted array of DataPoints.
 * DataPoints must be in chronological order (oldest first).
 */
export function calculateGrowth(dataPoints: DataPoint[]): Calculations {
  if (dataPoints.length === 0) {
    return { yoy_changes: [], cagr: null, cagr_years: 0 };
  }

  // YoY changes
  const yoy_changes = dataPoints.map((dp, i) => {
    if (i === 0) {
      return { year: dp.fiscal_year, change_pct: null };
    }
    const prev = dataPoints[i - 1].value;
    if (prev === 0) {
      return { year: dp.fiscal_year, change_pct: null };
    }
    // Return null for sign changes — YoY % is meaningless across sign flips
    if ((prev > 0 && dp.value < 0) || (prev < 0 && dp.value > 0)) {
      return { year: dp.fiscal_year, change_pct: null };
    }
    const change = ((dp.value - prev) / Math.abs(prev)) * 100;
    return { year: dp.fiscal_year, change_pct: Math.round(change * 10) / 10 };
  });

  // CAGR
  let cagr: number | null = null;
  const cagr_years = dataPoints.length - 1;

  if (cagr_years > 0) {
    const first = dataPoints[0].value;
    const last = dataPoints[dataPoints.length - 1].value;

    if (first > 0 && last > 0) {
      cagr = (Math.pow(last / first, 1 / cagr_years) - 1) * 100;
      cagr = Math.round(cagr * 10) / 10;
    }
  }

  return { yoy_changes, cagr, cagr_years };
}
