/**
 * Core data model for SEC EDGAR NL.
 *
 * Design principles:
 * - DataPoints are immutable and append-only
 * - "Latest" is derived, never overwritten
 * - Calculations reference DataPoints, never mutate them
 * - Provenance is always included
 */

export interface MetricDefinition {
  id: string;
  display_name: string;
  description: string;
  accounting_framework: 'US-GAAP' | 'IFRS';
  statement_type: 'income_statement' | 'balance_sheet' | 'cash_flow';
  xbrl_concepts: XbrlConcept[];
  unit_type: 'currency' | 'shares' | 'ratio';
  aggregation: 'sum' | 'end_of_period' | 'average';
  version: number;
  introduced_on: string;
  deprecated_on: string | null;
}

export interface XbrlConcept {
  taxonomy: string;
  concept: string;
  valid_from: string | null;
  valid_to: string | null;
  priority: number;
}

export interface DataPoint {
  metric_id: string;
  cik: string;
  company_name: string;
  fiscal_year: number;
  fiscal_period: 'FY' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
  period_start: string;
  period_end: string;
  value: number;
  unit: string;
  source: FilingSource;
  restated_in: string | null;
  is_latest: boolean;
  extracted_at: string;
  checksum: string;
}

export interface FilingSource {
  accession_number: string;
  filing_date: string;
  form_type: string;
  xbrl_concept: string;
}

export interface QueryResult {
  company: CompanyInfo;
  metric: MetricDefinition;
  data_points: DataPoint[];
  calculations: Calculations;
  provenance: ProvenanceInfo;
}

export interface CompanyInfo {
  cik: string;
  ticker: string;
  name: string;
  fiscal_year_end_month: number;
}

export interface Calculations {
  yoy_changes: Array<{ year: number; change_pct: number | null }>;
  cagr: number | null;
  cagr_years: number;
}

export interface ProvenanceInfo {
  metric_concept: string;
  filings_used: Array<{
    accession_number: string;
    form_type: string;
    filing_date: string;
    fiscal_year: number;
  }>;
  dedup_strategy: string;
  period_type: string;
  notes: string[];
}

/** Raw XBRL fact from SEC companyfacts API */
export interface SecFact {
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  start?: string;
  frame?: string;
}

/** SEC companyfacts API response shape */
export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    [taxonomy: string]: {
      [concept: string]: {
        label: string;
        description: string;
        units: {
          [unit: string]: SecFact[];
        };
      };
    };
  };
}

/** CIK lookup result */
export interface CikLookup {
  cik: string;
  ticker: string;
  name: string;
}

// ── Form 4 Insider Trading Types ──────────────────────────────────────

/** SEC Form 4 transaction codes */
export type TransactionCode =
  | 'P'  // Open market purchase
  | 'S'  // Open market sale
  | 'A'  // Grant/award
  | 'D'  // Disposition to issuer
  | 'F'  // Tax withholding
  | 'M'  // Option exercise
  | 'G'  // Gift
  | 'C'  // Conversion
  | 'X'  // Option expiration
  | 'J'  // Other
  ;

export interface InsiderInfo {
  cik: string;
  name: string;
  is_director: boolean;
  is_officer: boolean;
  is_ten_percent_owner: boolean;
  officer_title: string;
}

export interface InsiderTransaction {
  insider: InsiderInfo;
  transaction_date: string;
  transaction_code: TransactionCode;
  transaction_type: 'acquisition' | 'disposition';
  shares: number;
  price_per_share: number | null;
  total_value: number | null;
  shares_owned_after: number;
  filing_date: string;
  filing_accession: string;
}

export type InsiderSignal = 'bullish' | 'bearish' | 'neutral' | 'mixed';

export interface InsiderActivityResult {
  company: CompanyInfo;
  period_days: number;
  transactions: InsiderTransaction[];
  summary: {
    total_buys: number;
    total_sells: number;
    buy_shares: number;
    sell_shares: number;
    buy_value: number;
    sell_value: number;
    net_shares: number;
    unique_insiders: number;
    signal: InsiderSignal;
  };
  provenance: {
    filing_count: number;
    filing_date_range: [string, string];
    accession_numbers: string[];
  };
}
