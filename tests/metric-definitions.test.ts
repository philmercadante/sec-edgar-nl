import { describe, it, expect } from 'vitest';
import {
  METRIC_DEFINITIONS,
  getMetricDefinition,
  findMetricByName,
} from '../src/processing/metric-definitions.js';

describe('METRIC_DEFINITIONS', () => {
  it('has exactly 7 launch metrics', () => {
    expect(METRIC_DEFINITIONS).toHaveLength(7);
  });

  it('all metrics have unique IDs', () => {
    const ids = METRIC_DEFINITIONS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all metrics have at least one XBRL concept', () => {
    for (const m of METRIC_DEFINITIONS) {
      expect(m.xbrl_concepts.length).toBeGreaterThan(0);
    }
  });

  it('all XBRL concepts have unique priorities within a metric', () => {
    for (const m of METRIC_DEFINITIONS) {
      const priorities = m.xbrl_concepts.map(c => c.priority);
      expect(new Set(priorities).size).toBe(priorities.length);
    }
  });

  it('all metrics are US-GAAP', () => {
    for (const m of METRIC_DEFINITIONS) {
      expect(m.accounting_framework).toBe('US-GAAP');
    }
  });
});

describe('getMetricDefinition', () => {
  it('finds revenue by ID', () => {
    expect(getMetricDefinition('revenue')?.display_name).toBe('Revenue');
  });

  it('returns undefined for unknown ID', () => {
    expect(getMetricDefinition('unknown')).toBeUndefined();
  });
});

describe('findMetricByName', () => {
  it('finds by exact ID', () => {
    expect(findMetricByName('revenue')?.id).toBe('revenue');
  });

  it('finds by display name', () => {
    expect(findMetricByName('Net Income')?.id).toBe('net_income');
  });

  it('finds by keyword "top line"', () => {
    expect(findMetricByName('top line')?.id).toBe('revenue');
  });

  it('finds by keyword "bottom line"', () => {
    expect(findMetricByName('bottom line')?.id).toBe('net_income');
  });

  it('finds R&D by "r&d"', () => {
    expect(findMetricByName('r&d')?.id).toBe('rd_expense');
  });

  it('finds SBC by "stock based compensation"', () => {
    expect(findMetricByName('stock based compensation')?.id).toBe('sbc');
  });

  it('finds OCF by "cash from operations"', () => {
    expect(findMetricByName('cash from operations')?.id).toBe('operating_cash_flow');
  });

  it('returns undefined for unrecognized name', () => {
    expect(findMetricByName('employee count')).toBeUndefined();
  });
});
