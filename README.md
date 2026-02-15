# sec-edgar-nl

Trustworthy financial answers from SEC EDGAR filings with full provenance.

A TypeScript CLI tool and MCP server that fetches XBRL data directly from SEC EDGAR, giving you verified financial metrics for any public US company — with source citations pointing back to the exact SEC filings.

## Quick Start

```bash
# Clone and build
git clone https://github.com/philmercadante/sec-edgar-nl.git
cd sec-edgar-nl
npm install
npm run build

# Query a metric
node dist/index.js query "Apple revenue 5 years"

# Or link globally
npm link
sec-edgar-nl query "MSFT net income"
```

## Features

### Financial Metrics (23 metrics)

Query any of these metrics for any SEC-reporting company:

| Metric | ID | Statement |
|--------|----|-----------|
| Revenue | `revenue` | Income Statement |
| Net Income | `net_income` | Income Statement |
| Operating Income | `operating_income` | Income Statement |
| Gross Profit | `gross_profit` | Income Statement |
| R&D Expense | `rd_expense` | Income Statement |
| EPS (Diluted) | `eps` | Income Statement |
| Cost of Revenue | `cost_of_revenue` | Income Statement |
| SG&A Expense | `sga_expense` | Income Statement |
| Interest Expense | `interest_expense` | Income Statement |
| Income Tax Expense | `income_tax` | Income Statement |
| Dividends Per Share | `dividends_per_share` | Income Statement |
| Operating Cash Flow | `operating_cash_flow` | Cash Flow |
| Capital Expenditures | `capex` | Cash Flow |
| Stock-Based Compensation | `sbc` | Cash Flow |
| Total Debt | `total_debt` | Balance Sheet |
| Total Assets | `total_assets` | Balance Sheet |
| Shareholders' Equity | `total_equity` | Balance Sheet |
| Shares Outstanding | `shares_outstanding` | Balance Sheet |
| Cash & Equivalents | `cash_and_equivalents` | Balance Sheet |
| Current Assets | `current_assets` | Balance Sheet |
| Current Liabilities | `current_liabilities` | Balance Sheet |
| Goodwill | `goodwill` | Balance Sheet |
| Total Liabilities | `total_liabilities` | Balance Sheet |

### Derived Financial Ratios (14 ratios)

Computed from the base metrics — no additional API calls:

| Ratio | ID | Formula |
|-------|----|---------|
| Net Profit Margin | `net_margin` | Net Income / Revenue |
| Gross Margin | `gross_margin` | Gross Profit / Revenue |
| Operating Margin | `operating_margin` | Operating Income / Revenue |
| R&D Intensity | `rd_intensity` | R&D / Revenue |
| SBC / Revenue | `sbc_ratio` | SBC / Revenue |
| Debt-to-Equity | `debt_to_equity` | Total Debt / Equity |
| Free Cash Flow | `free_cash_flow` | OCF - Capex |
| Capex / OCF | `capex_to_ocf` | Capex / OCF |
| Current Ratio | `current_ratio` | Current Assets / Current Liabilities |
| Return on Assets | `return_on_assets` | Net Income / Total Assets |
| Return on Equity | `return_on_equity` | Net Income / Equity |
| Asset Turnover | `asset_turnover` | Revenue / Total Assets |
| Interest Coverage | `interest_coverage` | Operating Income / Interest Expense |
| Effective Tax Rate | `effective_tax_rate` | Income Tax / Operating Income |

### Other Features

- **Natural language queries** — "Apple's R&D spending over the last 5 years"
- **Company screening** — Find all companies with revenue > $100B using Frames API
- **Multi-company comparison** — Compare revenue across AAPL, MSFT, GOOGL
- **Company profile** — SIC code, industry, fiscal year end, filing history
- **Insider trading** — Form 4 buy/sell activity with bullish/bearish signals
- **Filing timeline** — List recent SEC filings with direct EDGAR links
- **Financial summary** — All metrics + derived ratios in one command
- **Multi-year trend** — See all metrics across 5+ years side-by-side
- **Period-specific queries** — "AAPL revenue FY2023" or "in 2023"
- **Full history export** — `--all` flag for complete available history
- **Annual and quarterly data** — Switch with `quarterly` keyword or `-q` flag
- **Multiple output formats** — Table (default), JSON (`-j`), CSV (`-c`)
- **XBRL concept explorer** — Discover all available data for any company
- **Watchlist** — Monitor metrics for changes across sessions
- **MCP server** — Integrate with Claude Desktop/Code as an MCP tool
- **SQLite cache** — Respects SEC rate limits, caches responses locally
- **Full provenance** — Every data point cites its exact SEC filing

## CLI Commands

### Query a metric

```bash
# Natural language
sec-edgar-nl query "Apple revenue 5 years"
sec-edgar-nl query "NVDA R&D spending"
sec-edgar-nl query "Tesla net income quarterly 8 quarters"

# Specific fiscal year
sec-edgar-nl query "AAPL revenue FY2023"
sec-edgar-nl query "MSFT earnings in 2024"

# Full history
sec-edgar-nl query "AAPL revenue" --all --csv

# Output formats
sec-edgar-nl query "AAPL revenue" --json
sec-edgar-nl query "AAPL revenue" --csv
```

### Screen companies

```bash
# Top companies by revenue
sec-edgar-nl screen revenue --year 2024 --limit 20

# Large-cap companies by total assets
sec-edgar-nl screen total_assets --min 100B

# Filter by range with human-readable values
sec-edgar-nl screen net_income --year 2024 --min 1B --max 10B --csv

# Sort by name instead of value
sec-edgar-nl screen revenue --sort name --json
```

### Compare companies

```bash
sec-edgar-nl compare AAPL MSFT GOOGL revenue
sec-edgar-nl compare AAPL MSFT GOOGL revenue --json
sec-edgar-nl compare NVDA AMD INTC rd_expense --years 10
```

### Financial ratios

```bash
sec-edgar-nl ratio AAPL net_margin
sec-edgar-nl ratio MSFT gross_margin --years 10
sec-edgar-nl ratio TSLA free_cash_flow --json
sec-edgar-nl ratio AAPL return_on_equity
sec-edgar-nl ratios  # List all available ratios
```

### Financial summary

```bash
sec-edgar-nl summary AAPL
sec-edgar-nl summary MSFT --year 2023 --json
sec-edgar-nl summary AAPL --years 5     # Multi-year trend view
```

### Company profile

```bash
sec-edgar-nl info AAPL
sec-edgar-nl info MSFT --json
```

### Insider trading

```bash
sec-edgar-nl insiders AAPL
sec-edgar-nl insiders NVDA --days 180 --json
```

### Filing timeline

```bash
sec-edgar-nl filings AAPL
sec-edgar-nl filings MSFT --form 10-K --limit 5
sec-edgar-nl filings TSLA --json
```

### Explore XBRL concepts

```bash
sec-edgar-nl concepts AAPL                    # All concepts
sec-edgar-nl concepts AAPL --search revenue   # Filter by keyword
sec-edgar-nl concepts MSFT --search debt --json
```

### Watchlist

```bash
sec-edgar-nl watch add AAPL revenue        # Add to watchlist
sec-edgar-nl watch add MSFT net_income     # Add another
sec-edgar-nl watch list                     # View watchlist
sec-edgar-nl watch check                    # Check for changes
sec-edgar-nl watch remove AAPL revenue     # Remove item
sec-edgar-nl watch clear                    # Clear all
```

### Other commands

```bash
sec-edgar-nl metrics    # List all supported metrics
sec-edgar-nl ratios     # List all supported ratios
sec-edgar-nl cache --stats   # Show cache statistics
sec-edgar-nl cache --clear   # Clear cached data
```

## MCP Server

sec-edgar-nl includes an MCP (Model Context Protocol) server that lets Claude Desktop, Claude Code, and other MCP clients query SEC EDGAR data directly.

### Setup with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sec-edgar-nl": {
      "command": "node",
      "args": ["/path/to/sec-edgar-nl/dist/mcp-server.js"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `query_financial_metric` | Fetch a metric for a company |
| `compare_companies` | Compare a metric across companies |
| `screen_companies` | Screen all companies by a metric (Frames API) |
| `query_financial_ratio` | Compute a derived ratio |
| `company_financial_summary` | All metrics for one company |
| `company_info` | Company profile (SIC, industry, filing history) |
| `query_insider_trading` | Insider buy/sell activity |
| `list_company_filings` | Recent SEC filing list |
| `explore_xbrl_concepts` | Discover available XBRL data |
| `list_metrics` | List all supported metrics |

### MCP Resources

- `sec-edgar-nl://metrics` — Full metric definitions with XBRL mappings
- `sec-edgar-nl://cache/stats` — Cache statistics

### MCP Prompts

- `analyze_company` — Comprehensive single-company analysis workflow
- `compare_financials` — Multi-company comparison workflow

## Architecture

```
sec-edgar-nl/
  src/
    index.ts                 # CLI entry point (Commander.js)
    mcp-server.ts            # MCP server entry point
    core/
      sec-client.ts          # SEC EDGAR API client (CompanyFacts, Submissions, Frames)
      resolver.ts            # Company name/ticker -> CIK resolution
      query-engine.ts        # Core query, compare, ratio, summary, screen execution
      cache.ts               # SQLite HTTP-level cache with watchlist
      types.ts               # TypeScript data model
    processing/
      xbrl-processor.ts      # XBRL fact extraction and deduplication
      metric-definitions.ts  # 23 metric definitions with XBRL concept chains
      ratio-definitions.ts   # 14 derived ratio definitions
      calculations.ts        # YoY growth, CAGR calculations
      insider-processor.ts   # Form 4 XML parser
    analysis/
      query-parser.ts        # Natural language query parser
      provenance.ts          # Provenance builder
    output/
      table-renderer.ts      # Terminal table output
      json-renderer.ts       # JSON output
      csv-renderer.ts        # CSV output
      comparison-renderer.ts # Multi-company comparison tables
      ratio-renderer.ts      # Ratio table/JSON/CSV output
      summary-renderer.ts    # Financial summary + trend output
      filing-renderer.ts     # Filing timeline output
      insider-renderer.ts    # Insider trading output
      screen-renderer.ts     # Company screening output
```

### Key Design Decisions

- **XBRL concept fallback chains** — Each metric tries multiple XBRL concepts in priority order, since companies use different tags
- **"Most recently filed wins" deduplication** — When the same period appears in multiple filings, the latest filing's value is used (handles restatements)
- **Fiscal year from period end date** — Works correctly for any fiscal year-end (Dec, Sep, Jan, etc.)
- **Frames API for screening** — Cross-company queries via `data.sec.gov/api/xbrl/frames/` for O(1) lookups across all filers
- **Rate limiting** — Token bucket at 10 req/s to respect SEC's Fair Access policy
- **HTTP-level caching** — CompanyFacts cached 7 days, submissions 1 day, filings 30 days, frames 1 day

## Testing

```bash
npm test           # Run all tests (131 tests)
npm run test:watch # Watch mode
```

## Data Source

All data comes directly from the [SEC EDGAR API](https://www.sec.gov/edgar/sec-api-documentation) — no third-party data providers. Every data point includes:

- Accession number (links to the exact SEC filing)
- Filing date and form type
- XBRL concept used
- Deduplication strategy applied

## License

MIT
