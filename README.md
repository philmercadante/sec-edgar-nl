# sec-edgar-nl

Trustworthy financial answers from SEC EDGAR filings — with full provenance.

Query any financial metric for any US public company, straight from the source. Every number links back to the exact SEC filing it came from. No third-party data providers, no stale databases, no black boxes.

```bash
$ sec-edgar-nl query "Apple revenue 5 years"

Apple Inc. (AAPL) — Revenue (Last 5 Fiscal Years)
=================================================
  Fiscal Year   Revenue         YoY Change
  FY2021        $365.82B        --
  FY2022        $394.33B        +7.8%
  FY2023        $383.29B        -2.8%
  FY2024        $391.04B        +2.0%
  FY2025        $416.16B        +6.4%

  Trend: ▁▅▃▅█
  4-Year CAGR: 3.3%
```

## Quick Start

```bash
git clone https://github.com/philmercadante/sec-edgar-nl.git
cd sec-edgar-nl
npm install
npm run build

# Run a query
node dist/index.js query "Apple revenue 5 years"

# Or link globally for shorter commands
npm link
sec-edgar-nl query "MSFT net income"
```

No API keys needed. All data comes from the public [SEC EDGAR API](https://www.sec.gov/edgar/sec-api-documentation).

## What You Can Do

### Ask questions in plain English

```bash
sec-edgar-nl query "Apple revenue 5 years"
sec-edgar-nl query "Tesla net income quarterly"
sec-edgar-nl query "NVDA R&D spending" --all
sec-edgar-nl query "MSFT earnings in 2023"
```

### Get a full financial snapshot

```bash
sec-edgar-nl summary AAPL           # all 23 metrics + 14 ratios
sec-edgar-nl summary NVDA --years 5 # multi-year trend view
```

### Compare companies head-to-head

```bash
sec-edgar-nl compare AAPL MSFT GOOGL revenue
sec-edgar-nl compare-ratio AAPL MSFT GOOGL net_margin
sec-edgar-nl matrix AAPL MSFT GOOGL AMZN revenue net_income capex
```

### Analyze growth trends

```bash
sec-edgar-nl trend AAPL revenue            # CAGRs, min/max, acceleration signal
sec-edgar-nl trend MSFT net_income --years 15
```

### Screen the entire market

```bash
sec-edgar-nl screen revenue --year 2024 --limit 20
sec-edgar-nl screen total_assets --min 100B --max 1T
```

### Track insider trading

```bash
sec-edgar-nl insiders AAPL
sec-edgar-nl insiders NVDA --days 180
```

### Search SEC filings by content

```bash
sec-edgar-nl search "artificial intelligence" --form 10-K
sec-edgar-nl search "tariff impact" --since 2024-01-01
```

### Explore and monitor

```bash
sec-edgar-nl info AAPL                       # company profile
sec-edgar-nl filings TSLA --form 10-K        # filing history
sec-edgar-nl concepts AAPL --search inventory # raw XBRL data
sec-edgar-nl watch add AAPL revenue          # watchlist
sec-edgar-nl watch check                     # check for changes
```

Run `sec-edgar-nl quickstart` for a complete cheat sheet with examples for every command.

## All Commands

| Command | Alias | What it does |
|---------|-------|-------------|
| `query` | `q` | Natural language financial queries |
| `summary` | | All metrics + ratios for one company |
| `trend` | `t` | Growth trend with CAGRs and signals |
| `compare` | `cmp` | Compare a metric across companies |
| `compare-metrics` | `cmpm` | Compare metrics for one company |
| `compare-ratio` | `cmpr` | Compare a ratio across companies |
| `matrix` | `mx` | Multi-company x multi-metric grid |
| `ratio` | | Compute a derived financial ratio |
| `screen` | | Rank all companies by a metric |
| `insiders` | `insider` | Insider trading from Form 4 |
| `filings` | `filing` | SEC filing history |
| `search` | | Full-text search across EDGAR |
| `info` | | Company profile and SIC code |
| `concepts` | | Explore raw XBRL data |
| `watch` | | Monitor metrics for changes |
| `metrics` | | List all 23 supported metrics |
| `ratios` | | List all 14 supported ratios |
| `quickstart` | `examples` | Cheat sheet with examples |
| `cache` | | Cache stats and management |

Every data command supports `--json` and `--csv` output formats.

## Supported Metrics (23)

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

## Derived Ratios (14)

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

## Output Formats

```bash
sec-edgar-nl summary AAPL              # table (default, with colors and sparklines)
sec-edgar-nl summary AAPL --json       # JSON (for piping to jq or other tools)
sec-edgar-nl summary AAPL --csv        # CSV (pipe to file: > aapl.csv)
```

## MCP Server

sec-edgar-nl also runs as an [MCP](https://modelcontextprotocol.io/) server, giving Claude Desktop, Claude Code, and other MCP clients direct access to SEC EDGAR data.

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

### MCP Tools (16)

| Tool | Description |
|------|-------------|
| `query_financial_metric` | Fetch a metric for a company |
| `compare_companies` | Compare a metric across companies |
| `compare_metrics` | Compare multiple metrics for one company |
| `financial_matrix` | Multi-company x multi-metric matrix |
| `compare_ratios` | Compare a ratio across companies |
| `query_financial_ratio` | Compute a derived ratio |
| `trend_analysis` | Growth trend with CAGRs and acceleration signal |
| `company_financial_summary` | All metrics + ratios for one company |
| `screen_companies` | Screen all companies by a metric |
| `query_insider_trading` | Insider buy/sell activity |
| `list_company_filings` | Recent SEC filings |
| `search_filings` | Full-text search across EDGAR |
| `explore_xbrl_concepts` | Discover available XBRL data |
| `company_info` | Company profile |
| `list_metrics` | List supported metrics |
| `list_ratios` | List supported ratios |

### MCP Resources

- `sec-edgar-nl://metrics` — Full metric definitions with XBRL mappings
- `sec-edgar-nl://cache/stats` — Cache statistics

### MCP Prompts

| Prompt | Description |
|--------|-------------|
| `analyze_company` | Comprehensive single-company analysis workflow |
| `compare_financials` | Side-by-side financial comparison |

## How It Works

All data comes from the [SEC EDGAR API](https://www.sec.gov/edgar/sec-api-documentation):

- **CompanyFacts API** — XBRL financial data for individual companies
- **Submissions API** — Filing history, company metadata
- **Frames API** — Cross-company screening (all filers for a given metric/year)
- **EFTS** — Full-text search across filing documents

Every data point includes provenance: the accession number, filing date, form type, and XBRL concept used. When a company restates numbers, the most recently filed value wins.

### Architecture

```
src/
  index.ts                 # CLI (Commander.js)
  mcp-server.ts            # MCP server (stdio transport)
  core/
    sec-client.ts          # SEC EDGAR API client
    resolver.ts            # Company name/ticker -> CIK
    query-engine.ts        # Query, compare, ratio, summary, screen logic
    cache.ts               # SQLite cache with watchlist
  processing/
    xbrl-processor.ts      # XBRL fact extraction and dedup
    metric-definitions.ts  # 23 metrics with XBRL concept chains
    ratio-definitions.ts   # 14 derived ratios
    calculations.ts        # YoY growth, CAGR
    insider-processor.ts   # Form 4 XML parser
  analysis/
    query-parser.ts        # Natural language parser
    provenance.ts          # Provenance builder
  output/
    table-renderer.ts      # Terminal tables with sparklines
    json-renderer.ts       # JSON output
    csv-renderer.ts        # CSV output
    (+ comparison, ratio, summary, filing, insider,
       screen, multi-metric, matrix, trend, search renderers)
```

### Design Decisions

- **XBRL concept fallback chains** — Each metric tries multiple XBRL concepts in priority order, since companies use different tags
- **"Most recently filed wins" dedup** — When the same period appears in multiple filings, the latest value is used (handles restatements correctly)
- **Fiscal year from period end date** — Works for any fiscal year-end month (Dec, Sep, Jan, etc.)
- **Frames API for screening** — O(1) cross-company lookups across all filers
- **Rate limiting** — Token bucket at 10 req/s to respect SEC's Fair Access policy
- **HTTP-level caching** — CompanyFacts cached 7 days, submissions 1 day, frames 1 day

## Testing

```bash
npm test              # 245 tests
npm run test:watch    # watch mode
```

## License

MIT
