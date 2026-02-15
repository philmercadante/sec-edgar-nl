import type { MetricDefinition } from '../core/types.js';

/**
 * The 7 launch metrics.
 *
 * Selection criteria:
 * - Used by real analysts
 * - Appears consistently across companies
 * - Stresses XBRL correctness
 * - Has interpretive value
 *
 * XBRL concepts are ordered by priority (try first = priority 1).
 * Multiple concepts exist because SEC taxonomy evolves and companies
 * sometimes use different tags for the same economic meaning.
 */

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: 'revenue',
    display_name: 'Revenue',
    description: 'Total revenue / net sales for the period',
    accounting_framework: 'US-GAAP',
    statement_type: 'income_statement',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'RevenueFromContractWithCustomerExcludingAssessedTax', valid_from: '2018-01-01', valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'Revenues', valid_from: null, valid_to: null, priority: 2 },
      { taxonomy: 'us-gaap', concept: 'SalesRevenueNet', valid_from: null, valid_to: '2018-12-31', priority: 3 },
      { taxonomy: 'us-gaap', concept: 'RevenueFromContractWithCustomerIncludingAssessedTax', valid_from: '2018-01-01', valid_to: null, priority: 4 },
    ],
    unit_type: 'currency',
    aggregation: 'sum',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'net_income',
    display_name: 'Net Income',
    description: 'Net income attributable to the company (GAAP)',
    accounting_framework: 'US-GAAP',
    statement_type: 'income_statement',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'NetIncomeLoss', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'ProfitLoss', valid_from: null, valid_to: null, priority: 2 },
      { taxonomy: 'us-gaap', concept: 'NetIncomeLossAvailableToCommonStockholdersBasic', valid_from: null, valid_to: null, priority: 3 },
    ],
    unit_type: 'currency',
    aggregation: 'sum',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'operating_cash_flow',
    display_name: 'Operating Cash Flow',
    description: 'Net cash provided by operating activities',
    accounting_framework: 'US-GAAP',
    statement_type: 'cash_flow',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'NetCashProvidedByUsedInOperatingActivities', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations', valid_from: null, valid_to: null, priority: 2 },
    ],
    unit_type: 'currency',
    aggregation: 'sum',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'capex',
    display_name: 'Capital Expenditures',
    description: 'Payments for acquisition of property, plant, and equipment',
    accounting_framework: 'US-GAAP',
    statement_type: 'cash_flow',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'PaymentsToAcquirePropertyPlantAndEquipment', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'PaymentsToAcquireProductiveAssets', valid_from: null, valid_to: null, priority: 2 },
      { taxonomy: 'us-gaap', concept: 'CapitalExpendituresIncurredButNotYetPaid', valid_from: null, valid_to: null, priority: 3 },
    ],
    unit_type: 'currency',
    aggregation: 'sum',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'rd_expense',
    display_name: 'Research & Development Expense',
    description: 'Total research and development costs for the period',
    accounting_framework: 'US-GAAP',
    statement_type: 'income_statement',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'ResearchAndDevelopmentExpense', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost', valid_from: null, valid_to: null, priority: 2 },
    ],
    unit_type: 'currency',
    aggregation: 'sum',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'sbc',
    display_name: 'Stock-Based Compensation',
    description: 'Share-based / stock-based compensation expense',
    accounting_framework: 'US-GAAP',
    statement_type: 'cash_flow',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'ShareBasedCompensation', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'AllocatedShareBasedCompensationExpense', valid_from: null, valid_to: null, priority: 2 },
      { taxonomy: 'us-gaap', concept: 'EmployeeBenefitsAndShareBasedCompensation', valid_from: null, valid_to: null, priority: 3 },
    ],
    unit_type: 'currency',
    aggregation: 'sum',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'total_debt',
    display_name: 'Total Debt',
    description: 'Total short-term and long-term debt',
    accounting_framework: 'US-GAAP',
    statement_type: 'balance_sheet',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'LongTermDebtAndCapitalLeaseObligations', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'LongTermDebt', valid_from: null, valid_to: null, priority: 2 },
      { taxonomy: 'us-gaap', concept: 'DebtAndCapitalLeaseObligations', valid_from: null, valid_to: null, priority: 3 },
      { taxonomy: 'us-gaap', concept: 'LongTermDebtNoncurrent', valid_from: null, valid_to: null, priority: 4 },
    ],
    unit_type: 'currency',
    aggregation: 'end_of_period',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'operating_income',
    display_name: 'Operating Income',
    description: 'Income from operations before interest and taxes',
    accounting_framework: 'US-GAAP',
    statement_type: 'income_statement',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'OperatingIncomeLoss', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', valid_from: null, valid_to: null, priority: 2 },
    ],
    unit_type: 'currency',
    aggregation: 'sum',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'gross_profit',
    display_name: 'Gross Profit',
    description: 'Revenue minus cost of goods sold',
    accounting_framework: 'US-GAAP',
    statement_type: 'income_statement',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'GrossProfit', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'CostOfRevenue', valid_from: null, valid_to: null, priority: 2 },
    ],
    unit_type: 'currency',
    aggregation: 'sum',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'eps',
    display_name: 'Earnings Per Share (Diluted)',
    description: 'Diluted earnings per share',
    accounting_framework: 'US-GAAP',
    statement_type: 'income_statement',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'EarningsPerShareDiluted', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'EarningsPerShareBasic', valid_from: null, valid_to: null, priority: 2 },
    ],
    unit_type: 'ratio',
    aggregation: 'sum',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'total_assets',
    display_name: 'Total Assets',
    description: 'Total assets on the balance sheet',
    accounting_framework: 'US-GAAP',
    statement_type: 'balance_sheet',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'Assets', valid_from: null, valid_to: null, priority: 1 },
    ],
    unit_type: 'currency',
    aggregation: 'end_of_period',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'total_equity',
    display_name: "Shareholders' Equity",
    description: 'Total stockholders equity',
    accounting_framework: 'US-GAAP',
    statement_type: 'balance_sheet',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'StockholdersEquity', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', valid_from: null, valid_to: null, priority: 2 },
    ],
    unit_type: 'currency',
    aggregation: 'end_of_period',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
  {
    id: 'shares_outstanding',
    display_name: 'Shares Outstanding',
    description: 'Common shares outstanding (diluted)',
    accounting_framework: 'US-GAAP',
    statement_type: 'balance_sheet',
    xbrl_concepts: [
      { taxonomy: 'us-gaap', concept: 'CommonStockSharesOutstanding', valid_from: null, valid_to: null, priority: 1 },
      { taxonomy: 'us-gaap', concept: 'WeightedAverageNumberOfDilutedSharesOutstanding', valid_from: null, valid_to: null, priority: 2 },
      { taxonomy: 'us-gaap', concept: 'EntityCommonStockSharesOutstanding', valid_from: 'dei', valid_to: null, priority: 3 },
    ],
    unit_type: 'shares',
    aggregation: 'end_of_period',
    version: 1,
    introduced_on: '2025-01-01',
    deprecated_on: null,
  },
];

/** Lookup a metric by ID */
export function getMetricDefinition(id: string): MetricDefinition | undefined {
  return METRIC_DEFINITIONS.find(m => m.id === id);
}

/** Lookup a metric by display name (case-insensitive, fuzzy) */
export function findMetricByName(name: string): MetricDefinition | undefined {
  const lower = name.toLowerCase();

  // Exact match on ID
  const byId = METRIC_DEFINITIONS.find(m => m.id === lower);
  if (byId) return byId;

  // Exact match on display name
  const byName = METRIC_DEFINITIONS.find(m => m.display_name.toLowerCase() === lower);
  if (byName) return byName;

  // Keyword matching
  const keywords: Record<string, string> = {
    'revenue': 'revenue',
    'sales': 'revenue',
    'top line': 'revenue',
    'net income': 'net_income',
    'profit': 'net_income',
    'earnings': 'net_income',
    'bottom line': 'net_income',
    'operating cash flow': 'operating_cash_flow',
    'cash from operations': 'operating_cash_flow',
    'ocf': 'operating_cash_flow',
    'capex': 'capex',
    'capital expenditure': 'capex',
    'capital spending': 'capex',
    'r&d': 'rd_expense',
    'r and d': 'rd_expense',
    'research and development': 'rd_expense',
    'research & development': 'rd_expense',
    'rd': 'rd_expense',
    'stock based compensation': 'sbc',
    'stock-based compensation': 'sbc',
    'share based compensation': 'sbc',
    'sbc': 'sbc',
    'total debt': 'total_debt',
    'debt': 'total_debt',
    'long term debt': 'total_debt',
    'operating income': 'operating_income',
    'operating profit': 'operating_income',
    'ebit': 'operating_income',
    'income from operations': 'operating_income',
    'gross profit': 'gross_profit',
    'gross margin': 'gross_profit',
    'cogs': 'gross_profit',
    'eps': 'eps',
    'earnings per share': 'eps',
    'diluted eps': 'eps',
    'total assets': 'total_assets',
    'assets': 'total_assets',
    'equity': 'total_equity',
    'stockholders equity': 'total_equity',
    'shareholders equity': 'total_equity',
    'book value': 'total_equity',
    'shares outstanding': 'shares_outstanding',
    'share count': 'shares_outstanding',
    'diluted shares': 'shares_outstanding',
  };

  // Sort by keyword length descending so longer matches take precedence
  // (e.g., "gross profit" matches before "profit")
  const sortedKeywords = Object.entries(keywords).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, metricId] of sortedKeywords) {
    if (lower.includes(keyword)) {
      return METRIC_DEFINITIONS.find(m => m.id === metricId);
    }
  }

  return undefined;
}
