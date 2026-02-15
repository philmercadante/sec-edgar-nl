import { describe, it, expect } from 'vitest';
import { buildProvenance } from '../src/analysis/provenance.js';
import type { DataPoint, MetricDefinition } from '../src/core/types.js';
import type { RestatementInfo } from '../src/processing/xbrl-processor.js';

const mockMetric: MetricDefinition = {
  id: 'revenue',
  display_name: 'Revenue',
  description: 'Total revenue',
  accounting_framework: 'US-GAAP',
  statement_type: 'income_statement',
  xbrl_concepts: [],
  unit_type: 'currency',
  aggregation: 'sum',
  version: 1,
  introduced_on: '2024-01-01',
  deprecated_on: null,
};

function makeDP(fy: number, value: number, accn: string = 'test-accn'): DataPoint {
  return {
    metric_id: 'revenue',
    cik: '123',
    company_name: 'Test Corp',
    fiscal_year: fy,
    fiscal_period: 'FY',
    period_start: `${fy - 1}-01-01`,
    period_end: `${fy}-12-31`,
    value,
    unit: 'USD',
    source: {
      accession_number: accn,
      filing_date: `${fy + 1}-02-01`,
      form_type: '10-K',
      xbrl_concept: 'us-gaap:Revenues',
    },
    restated_in: null,
    is_latest: true,
    extracted_at: new Date().toISOString(),
    checksum: 'test',
  };
}

describe('Restatement detection in provenance', () => {
  it('includes no restatement notes when none exist', () => {
    const dataPoints = [makeDP(2023, 100e9), makeDP(2024, 120e9)];
    const provenance = buildProvenance(dataPoints, mockMetric, 'us-gaap:Revenues', undefined, []);
    const restatementNotes = provenance.notes.filter(n => n.includes('restated'));
    expect(restatementNotes).toHaveLength(0);
  });

  it('includes restatement note with original and restated values', () => {
    const dataPoints = [makeDP(2023, 100e9), makeDP(2024, 120e9)];
    const restatements: RestatementInfo[] = [{
      fiscal_year: 2023,
      period_end: '2023-12-31',
      original_value: 98e9,
      original_filing: '0000123456-24-000001',
      original_filing_date: '2024-02-15',
      restated_value: 100e9,
      restated_filing: '0000123456-24-000050',
      restated_filing_date: '2024-08-10',
      change_pct: 2.0,
    }];

    const provenance = buildProvenance(dataPoints, mockMetric, 'us-gaap:Revenues', undefined, restatements);
    const restatementNotes = provenance.notes.filter(n => n.includes('restated'));

    expect(restatementNotes).toHaveLength(1);
    expect(restatementNotes[0]).toContain('FY2023');
    expect(restatementNotes[0]).toContain('$98.0B');
    expect(restatementNotes[0]).toContain('$100.0B');
    expect(restatementNotes[0]).toContain('+2%');
  });

  it('handles multiple restatements', () => {
    const dataPoints = [makeDP(2022, 80e9), makeDP(2023, 100e9), makeDP(2024, 120e9)];
    const restatements: RestatementInfo[] = [
      {
        fiscal_year: 2022,
        period_end: '2022-12-31',
        original_value: 78e9,
        original_filing: 'accn1',
        original_filing_date: '2023-02-01',
        restated_value: 80e9,
        restated_filing: 'accn2',
        restated_filing_date: '2023-08-01',
        change_pct: 2.6,
      },
      {
        fiscal_year: 2023,
        period_end: '2023-12-31',
        original_value: 95e9,
        original_filing: 'accn3',
        original_filing_date: '2024-02-01',
        restated_value: 100e9,
        restated_filing: 'accn4',
        restated_filing_date: '2024-08-01',
        change_pct: 5.3,
      },
    ];

    const provenance = buildProvenance(dataPoints, mockMetric, 'us-gaap:Revenues', undefined, restatements);
    const restatementNotes = provenance.notes.filter(n => n.includes('restated'));

    expect(restatementNotes).toHaveLength(2);
    expect(restatementNotes[0]).toContain('FY2022');
    expect(restatementNotes[1]).toContain('FY2023');
  });

  it('shows negative change for downward restatements', () => {
    const dataPoints = [makeDP(2024, 90e9)];
    const restatements: RestatementInfo[] = [{
      fiscal_year: 2024,
      period_end: '2024-12-31',
      original_value: 100e9,
      original_filing: 'accn1',
      original_filing_date: '2025-02-01',
      restated_value: 90e9,
      restated_filing: 'accn2',
      restated_filing_date: '2025-06-01',
      change_pct: -10.0,
    }];

    const provenance = buildProvenance(dataPoints, mockMetric, 'us-gaap:Revenues', undefined, restatements);
    const restatementNotes = provenance.notes.filter(n => n.includes('restated'));

    expect(restatementNotes).toHaveLength(1);
    expect(restatementNotes[0]).toContain('-10%');
  });
});
