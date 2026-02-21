/**
 * Shared serialization helpers for the web API layer.
 * Converts core engine results to JSON-safe objects and maps error types to HTTP status codes.
 */

import type { QueryResult, InsiderActivityResult } from '../core/types.js';
import type { RatioResult, MultiMetricResult, MatrixResult, ScreenResult } from '../core/query-engine.js';
import type { SummaryResult } from '../output/summary-renderer.js';
import { calculateCAGR, computeGrowthSignal } from '../processing/calculations.js';

// ── Error Mapping ─────────────────────────────────────────────────────

const ERROR_STATUS_MAP: Record<string, number> = {
  company_not_found: 404,
  no_data: 404,
  company_ambiguous: 400,
  metric_not_found: 400,
  ratio_not_found: 400,
  rate_limited: 429,
  api_error: 502,
};

export function errorToHttpStatus(errorType: string): number {
  return ERROR_STATUS_MAP[errorType] ?? 500;
}

// ── Result Serializers ────────────────────────────────────────────────

export function serializeQueryResult(r: QueryResult) {
  return {
    company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
    metric: { id: r.metric.id, display_name: r.metric.display_name, unit_type: r.metric.unit_type },
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
}

export function serializeTrendResult(r: QueryResult) {
  const values = r.data_points.map(dp => dp.value);
  const n = values.length;

  const cagrs: Record<string, number | null> = {};
  for (const lookback of [1, 3, 5, 10]) {
    if (n > lookback) {
      cagrs[`${lookback}y`] = calculateCAGR(values[n - 1 - lookback], values[n - 1], lookback);
    }
  }

  const avg = n > 0 ? values.reduce((a, b) => a + b, 0) / n : null;
  const maxVal = n > 0 ? Math.max(...values) : null;
  const minVal = n > 0 ? Math.min(...values) : null;
  const maxYear = maxVal !== null ? r.data_points[values.indexOf(maxVal)].fiscal_year : null;
  const minYear = minVal !== null ? r.data_points[values.indexOf(minVal)].fiscal_year : null;

  const growthResult = computeGrowthSignal(values);

  return {
    company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
    metric: { id: r.metric.id, display_name: r.metric.display_name, unit_type: r.metric.unit_type },
    data: r.data_points.map(dp => ({
      fiscal_year: dp.fiscal_year,
      value: dp.value,
    })),
    analysis: {
      cagr: cagrs,
      statistics: { average: avg, high: maxVal, high_year: maxYear, low: minVal, low_year: minYear },
      growth_signal: growthResult ? {
        signal: growthResult.signal,
        first_half_avg_growth: Math.round(growthResult.firstHalfAvg * 10) / 10,
        second_half_avg_growth: Math.round(growthResult.secondHalfAvg * 10) / 10,
      } : null,
    },
    provenance: r.provenance,
  };
}

export function serializeCompareResult(results: QueryResult[], errors: Array<{ ticker: string; message: string }>) {
  return {
    comparison: results.map(r => ({
      company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
      metric: { id: r.metric.id, display_name: r.metric.display_name, unit_type: r.metric.unit_type },
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
}

export function serializeRatioResult(r: RatioResult) {
  return {
    company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
    ratio: { id: r.ratio.id, display_name: r.ratio.display_name, description: r.ratio.description, format: r.ratio.format },
    formula: { numerator: r.numerator_metric, denominator: r.denominator_metric, operation: r.ratio.operation || 'divide' },
    data: r.data_points,
  };
}

export function serializeCompareRatioResult(results: RatioResult[], errors: Array<{ ticker: string; message: string }>) {
  return {
    comparison: results.map(r => ({
      company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
      ratio: { id: r.ratio.id, display_name: r.ratio.display_name, format: r.ratio.format },
      data: r.data_points.map(dp => ({
        fiscal_year: dp.fiscal_year,
        value: dp.value,
      })),
    })),
    errors: errors.length > 0 ? errors : undefined,
  };
}

export function serializeSummaryResult(r: SummaryResult) {
  return {
    company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
    fiscal_year: r.fiscal_year,
    metrics: r.metrics.map(m => ({
      id: m.metric.id,
      display_name: m.metric.display_name,
      statement_type: m.metric.statement_type,
      unit_type: m.metric.unit_type,
      value: m.value,
      yoy_change_pct: m.yoy_change ?? null,
    })),
    derived_ratios: r.derived.map(d => ({
      name: d.name,
      value: d.value,
      format: d.format,
    })),
  };
}

export function serializeMultiMetricResult(r: MultiMetricResult) {
  const data: Record<string, Record<number, number>> = {};
  for (const metric of r.metrics) {
    const yearMap = r.data.get(metric.id);
    if (yearMap) {
      const years: Record<number, number> = {};
      for (const [year, value] of yearMap) {
        years[year] = value;
      }
      data[metric.id] = years;
    }
  }

  return {
    company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
    metrics: r.metrics.map(m => ({ id: m.id, display_name: m.display_name, unit_type: m.unit_type })),
    years: r.years,
    data,
    warnings: r.warnings?.length ? r.warnings : undefined,
  };
}

export function serializeMatrixResult(r: MatrixResult, errors: Array<{ ticker: string; message: string }>) {
  return {
    fiscal_year: r.fiscal_year,
    metrics: r.metrics.map(m => ({ id: m.id, display_name: m.display_name, unit_type: m.unit_type })),
    companies: r.companies.map(c => {
      const values: Record<string, number> = {};
      for (const [k, v] of c.values) {
        values[k] = v;
      }
      return { company: { cik: c.company.cik, ticker: c.company.ticker, name: c.company.name }, values };
    }),
    warnings: errors.length > 0 ? errors.map(e => `${e.ticker}: ${e.message}`) : undefined,
  };
}

export function serializeScreenResult(r: ScreenResult) {
  return {
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
}

export function serializeInsiderResult(r: InsiderActivityResult) {
  return {
    company: { cik: r.company.cik, ticker: r.company.ticker, name: r.company.name },
    period_days: r.period_days,
    summary: r.summary,
    transactions: r.transactions.map(t => ({
      date: t.transaction_date,
      insider: { name: t.insider.name, title: t.insider.officer_title || (t.insider.is_director ? 'Director' : '') },
      type: t.transaction_code,
      direction: t.transaction_type,
      shares: t.shares,
      price: t.price_per_share,
      value: t.total_value,
      shares_after: t.shares_owned_after,
      filing: { accession: t.filing_accession, date: t.filing_date },
    })),
    provenance: r.provenance,
  };
}
