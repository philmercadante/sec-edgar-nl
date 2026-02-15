import { describe, it, expect } from 'vitest';
import {
  RATIO_DEFINITIONS,
  getRatioDefinition,
  findRatioByName,
} from '../src/processing/ratio-definitions.js';
import { getMetricDefinition } from '../src/processing/metric-definitions.js';

describe('RATIO_DEFINITIONS', () => {
  it('has 8 ratios', () => {
    expect(RATIO_DEFINITIONS).toHaveLength(8);
  });

  it('all ratios have unique IDs', () => {
    const ids = RATIO_DEFINITIONS.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all ratios reference valid metric IDs', () => {
    for (const r of RATIO_DEFINITIONS) {
      expect(getMetricDefinition(r.numerator)).toBeDefined();
      expect(getMetricDefinition(r.denominator)).toBeDefined();
    }
  });
});

describe('getRatioDefinition', () => {
  it('finds net_margin by ID', () => {
    expect(getRatioDefinition('net_margin')?.display_name).toBe('Net Profit Margin');
  });

  it('returns undefined for unknown ID', () => {
    expect(getRatioDefinition('unknown')).toBeUndefined();
  });
});

describe('findRatioByName', () => {
  it('finds by "net margin"', () => {
    expect(findRatioByName('net margin')?.id).toBe('net_margin');
  });

  it('finds by "fcf"', () => {
    expect(findRatioByName('fcf')?.id).toBe('free_cash_flow');
  });

  it('finds by "debt to equity"', () => {
    expect(findRatioByName('debt to equity')?.id).toBe('debt_to_equity');
  });

  it('finds by "gross margin"', () => {
    expect(findRatioByName('gross margin')?.id).toBe('gross_margin');
  });

  it('finds by "r&d intensity"', () => {
    expect(findRatioByName('r&d intensity')?.id).toBe('rd_intensity');
  });

  it('returns undefined for unrecognized name', () => {
    expect(findRatioByName('price to earnings')).toBeUndefined();
  });
});
