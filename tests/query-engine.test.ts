import { describe, it, expect } from 'vitest';
import { executeQueryCore, executeCompareCore } from '../src/core/query-engine.js';

describe('executeQueryCore', () => {
  it('returns metric_not_found for unknown metric', async () => {
    const result = await executeQueryCore({
      company: 'AAPL',
      metric: 'employees',
    });
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('metric_not_found');
    expect(result.error?.availableMetrics).toBeDefined();
    expect(result.error!.availableMetrics!.length).toBeGreaterThan(0);
  });

  it('resolves a metric by display name', async () => {
    const result = await executeQueryCore({
      company: 'AAPL',
      metric: 'revenue',
      years: 1,
    });
    // This will actually hit the SEC API, so it depends on network.
    // If offline, the company resolution may fail. Either way, it
    // should not error on metric resolution.
    if (result.success) {
      expect(result.result!.metric.id).toBe('revenue');
    } else {
      // Acceptable offline failures
      expect(['company_not_found', 'no_data', 'rate_limited', 'api_error']).toContain(result.error?.type);
    }
  });
});

describe('executeCompareCore', () => {
  it('returns metric error for unknown metric', async () => {
    const result = await executeCompareCore({
      tickers: ['AAPL', 'MSFT'],
      metric: 'unknown_metric',
    });
    expect(result.results).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
