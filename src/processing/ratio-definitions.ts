/**
 * Derived financial ratio definitions.
 *
 * Each ratio is computed from two existing metrics by dividing
 * the numerator by the denominator, matched by fiscal year.
 */

export interface RatioDefinition {
  id: string;
  display_name: string;
  description: string;
  numerator: string;   // metric ID
  denominator: string; // metric ID
  format: 'percentage' | 'multiple' | 'currency';
  /** For subtraction-based ratios (e.g., FCF = OCF - Capex) */
  operation?: 'divide' | 'subtract';
}

export const RATIO_DEFINITIONS: RatioDefinition[] = [
  {
    id: 'net_margin',
    display_name: 'Net Profit Margin',
    description: 'Net income as a percentage of revenue',
    numerator: 'net_income',
    denominator: 'revenue',
    format: 'percentage',
  },
  {
    id: 'gross_margin',
    display_name: 'Gross Margin',
    description: 'Gross profit as a percentage of revenue',
    numerator: 'gross_profit',
    denominator: 'revenue',
    format: 'percentage',
  },
  {
    id: 'operating_margin',
    display_name: 'Operating Margin',
    description: 'Operating income as a percentage of revenue',
    numerator: 'operating_income',
    denominator: 'revenue',
    format: 'percentage',
  },
  {
    id: 'rd_intensity',
    display_name: 'R&D Intensity',
    description: 'R&D spending as a percentage of revenue',
    numerator: 'rd_expense',
    denominator: 'revenue',
    format: 'percentage',
  },
  {
    id: 'sbc_ratio',
    display_name: 'SBC / Revenue',
    description: 'Stock-based compensation as a percentage of revenue',
    numerator: 'sbc',
    denominator: 'revenue',
    format: 'percentage',
  },
  {
    id: 'debt_to_equity',
    display_name: 'Debt-to-Equity',
    description: 'Total debt divided by shareholders equity',
    numerator: 'total_debt',
    denominator: 'total_equity',
    format: 'multiple',
  },
  {
    id: 'free_cash_flow',
    display_name: 'Free Cash Flow',
    description: 'Operating cash flow minus capital expenditures',
    numerator: 'operating_cash_flow',
    denominator: 'capex',
    format: 'currency',
    operation: 'subtract',
  },
  {
    id: 'capex_to_ocf',
    display_name: 'Capex / OCF',
    description: 'Capital expenditures as a percentage of operating cash flow',
    numerator: 'capex',
    denominator: 'operating_cash_flow',
    format: 'percentage',
  },
  // ── Phase 3 ratios ──────────────────────────────────────────────────
  {
    id: 'current_ratio',
    display_name: 'Current Ratio',
    description: 'Current assets divided by current liabilities',
    numerator: 'current_assets',
    denominator: 'current_liabilities',
    format: 'multiple',
  },
  {
    id: 'return_on_assets',
    display_name: 'Return on Assets',
    description: 'Net income divided by total assets',
    numerator: 'net_income',
    denominator: 'total_assets',
    format: 'percentage',
  },
  {
    id: 'return_on_equity',
    display_name: 'Return on Equity',
    description: 'Net income divided by shareholders equity',
    numerator: 'net_income',
    denominator: 'total_equity',
    format: 'percentage',
  },
  {
    id: 'asset_turnover',
    display_name: 'Asset Turnover',
    description: 'Revenue divided by total assets',
    numerator: 'revenue',
    denominator: 'total_assets',
    format: 'multiple',
  },
  {
    id: 'interest_coverage',
    display_name: 'Interest Coverage',
    description: 'Operating income divided by interest expense',
    numerator: 'operating_income',
    denominator: 'interest_expense',
    format: 'multiple',
  },
  {
    id: 'effective_tax_rate',
    display_name: 'Effective Tax Rate',
    description: 'Income tax expense divided by pre-tax income (operating income)',
    numerator: 'income_tax',
    denominator: 'operating_income',
    format: 'percentage',
  },
];

export function getRatioDefinition(id: string): RatioDefinition | undefined {
  return RATIO_DEFINITIONS.find(r => r.id === id);
}

export function findRatioByName(name: string): RatioDefinition | undefined {
  const lower = name.toLowerCase();

  // Exact ID match
  const byId = RATIO_DEFINITIONS.find(r => r.id === lower);
  if (byId) return byId;

  // Display name match
  const byName = RATIO_DEFINITIONS.find(r => r.display_name.toLowerCase() === lower);
  if (byName) return byName;

  // Keyword matching
  const keywords: Record<string, string> = {
    'net margin': 'net_margin',
    'net profit margin': 'net_margin',
    'profit margin': 'net_margin',
    'gross margin': 'gross_margin',
    'gross margin %': 'gross_margin',
    'operating margin': 'operating_margin',
    'op margin': 'operating_margin',
    'ebit margin': 'operating_margin',
    'r&d intensity': 'rd_intensity',
    'r&d ratio': 'rd_intensity',
    'research intensity': 'rd_intensity',
    'sbc ratio': 'sbc_ratio',
    'sbc %': 'sbc_ratio',
    'stock comp ratio': 'sbc_ratio',
    'debt to equity': 'debt_to_equity',
    'debt/equity': 'debt_to_equity',
    'd/e': 'debt_to_equity',
    'leverage': 'debt_to_equity',
    'free cash flow': 'free_cash_flow',
    'fcf': 'free_cash_flow',
    'capex ratio': 'capex_to_ocf',
    'capex to ocf': 'capex_to_ocf',
    'capital intensity': 'capex_to_ocf',
    // Phase 3 ratios
    'current ratio': 'current_ratio',
    'liquidity ratio': 'current_ratio',
    'return on assets': 'return_on_assets',
    'roa': 'return_on_assets',
    'return on equity': 'return_on_equity',
    'roe': 'return_on_equity',
    'asset turnover': 'asset_turnover',
    'interest coverage': 'interest_coverage',
    'times interest earned': 'interest_coverage',
    'effective tax rate': 'effective_tax_rate',
    'tax rate': 'effective_tax_rate',
  };

  const sortedKeywords = Object.entries(keywords).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, ratioId] of sortedKeywords) {
    if (lower.includes(keyword)) {
      return RATIO_DEFINITIONS.find(r => r.id === ratioId);
    }
  }

  return undefined;
}
