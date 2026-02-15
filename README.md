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

### Financial Metrics (13 metrics)

Query any of these metrics for any SEC-reporting company:

| Metric | ID | Statement |
|--------|----|-----------|
| Revenue | `revenue` | Income Statement |
| Net Income | `net_income` | Income Statement |
| Operating Income | `operating_income` | Income Statement |
| Gross Profit | `gross_profit` | Income Statement |
| R&D Expense | `rd_expense` | Income Statement |
| EPS (Diluted) | `eps` | Income Statement |
| Operating Cash Flow | `operating_cash_flow` | Cash Flow |
| Capital Expenditures | `capex` | Cash Flow |
| Stock-Based Compensation | `sbc` | Cash Flow |
| Total Debt | `total_debt` | Balance Sheet |
| Total Assets | `total_assets` | Balance Sheet |
| Shareholders' Equity | `total_equity` | Balance Sheet |
| Shares Outstanding | `shares_outstanding` | Balance Sheet |

### Derived Financial Ratios (8 ratios)

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

### Other Features

- **Natural language queries** — "Apple's R&D spending over the last 5 years"
- **Multi-company comparison** — Compare revenue across AAPL, MSFT, GOOGL
- **Insider trading** — Form 4 buy/sell activity with bullish/bearish signals
- **Filing timeline** — List recent SEC filings with direct EDGAR links
- **Financial summary** — All 13 metrics + derived ratios in one command
- **Period-specific queries** — "AAPL revenue FY2023" or "in 2023"
- **Full history export** — `--all` flag for complete available history
- **Annual and quarterly data** — Switch with `quarterly` keyword or `-q` flag
- **Multiple output formats** — Table (default), JSON (`-j`), CSV (`-c`)
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
sec-edgar-nl ratios  # List all available ratios
```

### Financial summary

```bash
sec-edgar-nl summary AAPL
sec-edgar-nl summary MSFT --year 2023 --json
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
| `query_financial_ratio` | Compute a derived ratio |
| `company_financial_summary` | All metrics for one company |
| `query_insider_trading` | Insider buy/sell activity |
| `list_company_filings` | Recent SEC filing list |
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
      sec-client.ts          # SEC EDGAR API client with rate limiting
      resolver.ts            # Company name/ticker -> CIK resolution
      query-engine.ts        # Core query, compare, ratio, summary execution
      cache.ts               # SQLite HTTP-level cache
      types.ts               # TypeScript data model
    processing/
      xbrl-processor.ts      # XBRL fact extraction and deduplication
      metric-definitions.ts  # 13 metric definitions with XBRL concept chains
      ratio-definitions.ts   # 8 derived ratio definitions
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
      summary-renderer.ts    # Financial summary output
      filing-renderer.ts     # Filing timeline output
      insider-renderer.ts    # Insider trading output
```

### Key Design Decisions

- **XBRL concept fallback chains** — Each metric tries multiple XBRL concepts in priority order, since companies use different tags
- **"Most recently filed wins" deduplication** — When the same period appears in multiple filings, the latest filing's value is used (handles restatements)
- **Fiscal year from period end date** — Works correctly for any fiscal year-end (Dec, Sep, Jan, etc.)
- **Rate limiting** — Token bucket at 10 req/s to respect SEC's Fair Access policy
- **HTTP-level caching** — CompanyFacts cached 7 days, submissions 1 day, filings 30 days

## Testing

```bash
npm test           # Run all tests (113 tests)
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
