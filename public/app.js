/**
 * sec-edgar-nl Web UI — Single-page application
 * Hash-based routing, API client, view renderers
 */

const $ = (sel) => document.querySelector(sel);
const $app = () => $('#app');

// ── API Client ────────────────────────────────────────

async function api(path, params = {}) {
  const url = new URL(path, location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

// ── Metric/Ratio Caches ──────────────────────────────

let metricsCache = null;
let ratiosCache = null;

async function getMetrics() {
  if (!metricsCache) metricsCache = (await api('/api/metrics')).metrics;
  return metricsCache;
}

async function getRatios() {
  if (!ratiosCache) ratiosCache = (await api('/api/ratios')).ratios;
  return ratiosCache;
}

function metricOptions(metrics) {
  return metrics.map(m => `<option value="${m.id}">${m.display_name}</option>`).join('');
}

function ratioOptions(ratios) {
  return ratios.map(r => `<option value="${r.id}">${r.display_name}</option>`).join('');
}

// ── Shared UI Helpers ─────────────────────────────────

function showLoading(el) {
  el.innerHTML = '<div class="loading">Loading...</div>';
}

function showError(el, err) {
  const error = err?.error || err;
  let html = `<div class="error-box">${error?.message || 'Something went wrong'}`;
  if (error?.suggestions?.length) {
    html += '<div class="suggestions">Did you mean: ';
    html += error.suggestions.map(s =>
      `<a href="#" onclick="return false" data-ticker="${s.ticker}">${s.ticker} (${s.name})</a>`
    ).join(' ');
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function changeClass(v) {
  if (v === null || v === undefined) return '';
  return v >= 0 ? 'positive' : 'negative';
}

function provenanceHtml(prov) {
  if (!prov) return '';
  return `<details class="provenance"><summary>Provenance</summary>
    <p>Concept: ${prov.metric_concept || '--'}</p>
    <p>Dedup: ${prov.dedup_strategy || '--'}</p>
    <p>Period: ${prov.period_type || '--'}</p>
    ${prov.filings_used ? '<p>Filings: ' + prov.filings_used.map(f => f.accession_number + ' (' + f.form_type + ')').join(', ') + '</p>' : ''}
    ${prov.notes?.length ? '<p>Notes: ' + prov.notes.join('; ') + '</p>' : ''}
  </details>`;
}

// ── Router ────────────────────────────────────────────

const views = {
  home: renderHome,
  query: renderQuery,
  trend: renderTrend,
  compare: renderCompare,
  summary: renderSummary,
  ratio: renderRatio,
  'multi-metric': renderMultiMetric,
  matrix: renderMatrix,
  screen: renderScreen,
  insider: renderInsider,
};

function route() {
  const hash = location.hash.slice(1) || 'home';
  const render = views[hash] || renderHome;

  // Update nav active state
  document.querySelectorAll('nav .links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + hash);
  });

  render();
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

// ── Home ──────────────────────────────────────────────

function renderHome() {
  $app().innerHTML = `
    <div class="home-hero">
      <h1>sec-edgar-nl</h1>
      <p>Trustworthy financial answers from SEC EDGAR filings</p>
    </div>
    <div class="form-row" style="justify-content: center;">
      <div class="form-group">
        <label>Company</label>
        <input id="home-company" placeholder="AAPL, MSFT, NVDA..." value="AAPL">
      </div>
      <button id="home-go">Summary</button>
    </div>
    <div id="home-result"></div>
    <div class="quick-cards">
      <div class="quick-card" onclick="location.hash='query'">
        <h4>Query</h4><p>Natural language financial metric queries</p>
      </div>
      <div class="quick-card" onclick="location.hash='trend'">
        <h4>Trend</h4><p>Growth analysis with CAGRs and signals</p>
      </div>
      <div class="quick-card" onclick="location.hash='compare'">
        <h4>Compare</h4><p>Same metric across multiple companies</p>
      </div>
      <div class="quick-card" onclick="location.hash='summary'">
        <h4>Summary</h4><p>Full financial snapshot — all metrics + ratios</p>
      </div>
      <div class="quick-card" onclick="location.hash='ratio'">
        <h4>Ratios</h4><p>Net margin, ROE, debt-to-equity, and more</p>
      </div>
      <div class="quick-card" onclick="location.hash='screen'">
        <h4>Screen</h4><p>Rank all public companies by a metric</p>
      </div>
      <div class="quick-card" onclick="location.hash='matrix'">
        <h4>Matrix</h4><p>Multi-company x multi-metric grid</p>
      </div>
      <div class="quick-card" onclick="location.hash='insider'">
        <h4>Insider</h4><p>Form 4 insider trading activity</p>
      </div>
    </div>
  `;

  $('#home-go').addEventListener('click', async () => {
    const company = $('#home-company').value.trim();
    if (!company) return;
    const el = $('#home-result');
    showLoading(el);
    try {
      const data = await api('/api/summary', { company });
      renderSummaryCards(el, data);
    } catch (err) {
      showError(el, err);
    }
  });

  $('#home-company').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#home-go').click();
  });
}

// ── Query View ────────────────────────────────────────

async function renderQuery() {
  const metrics = await getMetrics();
  $app().innerHTML = `
    <h2>Query a Financial Metric</h2>
    <div class="form-row">
      <div class="form-group"><label>Company</label><input id="q-company" placeholder="AAPL" value="AAPL"></div>
      <div class="form-group"><label>Metric</label><select id="q-metric">${metricOptions(metrics)}</select></div>
      <div class="form-group"><label>Years</label><input id="q-years" type="number" value="5" min="1" max="20" style="width:70px"></div>
      <button id="q-go">Query</button>
    </div>
    <div id="q-result"></div>
  `;

  $('#q-go').addEventListener('click', async () => {
    const el = $('#q-result');
    showLoading(el);
    try {
      const data = await api('/api/query', {
        company: $('#q-company').value.trim(),
        metric: $('#q-metric').value,
        years: $('#q-years').value,
      });
      renderQueryResult(el, data);
    } catch (err) {
      showError(el, err);
    }
  });
}

function renderQueryResult(el, data) {
  const labels = data.data.map(d => 'FY' + d.fiscal_year);
  const values = data.data.map(d => d.value);

  el.innerHTML = `
    <h3>${data.company.name} (${data.company.ticker}) — ${data.metric.display_name}</h3>
    ${data.calculations.cagr !== null ? `<span class="badge blue">${data.calculations.cagr_years}Y CAGR: ${fmtPct(data.calculations.cagr)}</span>` : ''}
    <div class="chart-container"><canvas id="query-chart"></canvas></div>
    <table class="data-table">
      <thead><tr><th>Fiscal Year</th><th class="text-right">Value</th><th class="text-right">YoY</th><th>Source</th></tr></thead>
      <tbody>${data.data.map((d, i) => {
        const yoy = data.calculations.yoy_changes.find(c => c.year === d.fiscal_year);
        const yoyStr = yoy ? fmtPct(yoy.change_pct) : '--';
        const yoyClass = yoy?.change_pct != null ? changeClass(yoy.change_pct) : '';
        return `<tr>
          <td>FY${d.fiscal_year}</td>
          <td class="text-right">${fmtValue(d.value, data.metric.unit_type)}</td>
          <td class="text-right ${yoyClass}">${yoyStr}</td>
          <td class="text-dim">${d.source.form_type} ${d.source.filing_date}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    ${provenanceHtml(data.provenance)}
  `;

  createLineChart('query-chart', labels, [{ label: data.metric.display_name, data: values }],
    (v) => fmtValue(v, data.metric.unit_type));
}

// ── Trend View ────────────────────────────────────────

async function renderTrend() {
  const metrics = await getMetrics();
  $app().innerHTML = `
    <h2>Trend Analysis</h2>
    <div class="form-row">
      <div class="form-group"><label>Company</label><input id="t-company" placeholder="AAPL" value="AAPL"></div>
      <div class="form-group"><label>Metric</label><select id="t-metric">${metricOptions(metrics)}</select></div>
      <div class="form-group"><label>Years</label><input id="t-years" type="number" value="10" min="3" max="20" style="width:70px"></div>
      <button id="t-go">Analyze</button>
    </div>
    <div id="t-result"></div>
  `;

  $('#t-go').addEventListener('click', async () => {
    const el = $('#t-result');
    showLoading(el);
    try {
      const data = await api('/api/trend', {
        company: $('#t-company').value.trim(),
        metric: $('#t-metric').value,
        years: $('#t-years').value,
      });
      renderTrendResult(el, data);
    } catch (err) {
      showError(el, err);
    }
  });
}

function renderTrendResult(el, data) {
  const labels = data.data.map(d => 'FY' + d.fiscal_year);
  const values = data.data.map(d => d.value);
  const cagr = data.analysis.cagr;
  const signal = data.analysis.growth_signal;
  const stats = data.analysis.statistics;

  const signalBadge = signal ? {
    accelerating: '<span class="badge green">Accelerating</span>',
    decelerating: '<span class="badge red">Decelerating</span>',
    stable: '<span class="badge yellow">Stable</span>',
  }[signal.signal] || '' : '';

  el.innerHTML = `
    <h3>${data.company.name} (${data.company.ticker}) — ${data.metric.display_name} Trend</h3>
    ${signalBadge}
    <div class="stats-grid">
      ${cagr['1y'] != null ? `<div class="stat-card"><div class="label">1Y CAGR</div><div class="value ${changeClass(cagr['1y'])}">${fmtPct(cagr['1y'])}</div></div>` : ''}
      ${cagr['3y'] != null ? `<div class="stat-card"><div class="label">3Y CAGR</div><div class="value ${changeClass(cagr['3y'])}">${fmtPct(cagr['3y'])}</div></div>` : ''}
      ${cagr['5y'] != null ? `<div class="stat-card"><div class="label">5Y CAGR</div><div class="value ${changeClass(cagr['5y'])}">${fmtPct(cagr['5y'])}</div></div>` : ''}
      ${cagr['10y'] != null ? `<div class="stat-card"><div class="label">10Y CAGR</div><div class="value ${changeClass(cagr['10y'])}">${fmtPct(cagr['10y'])}</div></div>` : ''}
      ${stats.high != null ? `<div class="stat-card"><div class="label">High (FY${stats.high_year})</div><div class="value">${fmtValue(stats.high, data.metric.unit_type)}</div></div>` : ''}
      ${stats.low != null ? `<div class="stat-card"><div class="label">Low (FY${stats.low_year})</div><div class="value">${fmtValue(stats.low, data.metric.unit_type)}</div></div>` : ''}
    </div>
    <div class="chart-container"><canvas id="trend-chart"></canvas></div>
    ${provenanceHtml(data.provenance)}
  `;

  createLineChart('trend-chart', labels, [{ label: data.metric.display_name, data: values }],
    (v) => fmtValue(v, data.metric.unit_type));
}

// ── Compare View ──────────────────────────────────────

async function renderCompare() {
  const metrics = await getMetrics();
  $app().innerHTML = `
    <h2>Compare Companies</h2>
    <div class="form-row">
      <div class="form-group"><label>Tickers (comma-separated)</label><input id="c-tickers" placeholder="AAPL, MSFT, GOOGL" value="AAPL, MSFT, GOOGL"></div>
      <div class="form-group"><label>Metric</label><select id="c-metric">${metricOptions(metrics)}</select></div>
      <div class="form-group"><label>Years</label><input id="c-years" type="number" value="5" min="1" max="20" style="width:70px"></div>
      <button id="c-go">Compare</button>
    </div>
    <div id="c-result"></div>
  `;

  $('#c-go').addEventListener('click', async () => {
    const el = $('#c-result');
    showLoading(el);
    try {
      const data = await api('/api/compare', {
        tickers: $('#c-tickers').value.trim(),
        metric: $('#c-metric').value,
        years: $('#c-years').value,
      });
      renderCompareResult(el, data);
    } catch (err) {
      showError(el, err);
    }
  });
}

function renderCompareResult(el, data) {
  // Collect all years
  const allYears = [...new Set(data.comparison.flatMap(c => c.data.map(d => d.fiscal_year)))].sort();
  const labels = allYears.map(y => 'FY' + y);
  const unitType = data.comparison[0]?.metric?.unit_type || 'currency';

  const datasets = data.comparison.map(c => ({
    label: c.company.ticker,
    data: allYears.map(y => {
      const dp = c.data.find(d => d.fiscal_year === y);
      return dp ? dp.value : null;
    }),
  }));

  el.innerHTML = `
    <h3>${data.comparison[0]?.metric?.display_name || 'Comparison'}</h3>
    <div class="chart-container"><canvas id="compare-chart"></canvas></div>
    <table class="data-table">
      <thead><tr><th>FY</th>${data.comparison.map(c => `<th class="text-right">${c.company.ticker}</th>`).join('')}</tr></thead>
      <tbody>${allYears.map(y => `<tr>
        <td>FY${y}</td>
        ${data.comparison.map(c => {
          const dp = c.data.find(d => d.fiscal_year === y);
          return `<td class="text-right">${dp ? fmtValue(dp.value, unitType) : '--'}</td>`;
        }).join('')}
      </tr>`).join('')}</tbody>
    </table>
  `;

  createLineChart('compare-chart', labels, datasets, (v) => fmtValue(v, unitType));
}

// ── Summary View ──────────────────────────────────────

async function renderSummary() {
  $app().innerHTML = `
    <h2>Financial Summary</h2>
    <div class="form-row">
      <div class="form-group"><label>Company</label><input id="s-company" placeholder="AAPL" value="AAPL"></div>
      <div class="form-group"><label>Year (optional)</label><input id="s-year" placeholder="latest" style="width:80px"></div>
      <button id="s-go">Summary</button>
    </div>
    <div id="s-result"></div>
  `;

  $('#s-go').addEventListener('click', async () => {
    const el = $('#s-result');
    showLoading(el);
    try {
      const data = await api('/api/summary', {
        company: $('#s-company').value.trim(),
        year: $('#s-year').value.trim() || undefined,
      });
      renderSummaryCards(el, data);
    } catch (err) {
      showError(el, err);
    }
  });
}

function renderSummaryCards(el, data) {
  const groups = {
    'Income Statement': data.metrics.filter(m => m.statement_type === 'income_statement'),
    'Cash Flow': data.metrics.filter(m => m.statement_type === 'cash_flow'),
    'Balance Sheet': data.metrics.filter(m => m.statement_type === 'balance_sheet'),
  };

  let html = `<h3>${data.company.name} (${data.company.ticker}) — FY${data.fiscal_year}</h3>`;

  for (const [group, metrics] of Object.entries(groups)) {
    if (metrics.length === 0) continue;
    html += `<h3>${group}</h3><div class="stats-grid">`;
    for (const m of metrics) {
      const yoyHtml = m.yoy_change_pct != null
        ? `<div class="change ${changeClass(m.yoy_change_pct)}">${fmtPct(m.yoy_change_pct)} YoY</div>`
        : '';
      html += `<div class="stat-card">
        <div class="label">${m.display_name}</div>
        <div class="value">${fmtValue(m.value, m.unit_type)}</div>
        ${yoyHtml}
      </div>`;
    }
    html += '</div>';
  }

  if (data.derived_ratios?.length) {
    html += '<h3>Key Ratios</h3><div class="stats-grid">';
    for (const r of data.derived_ratios) {
      // Summary returns pre-computed values (26.9 = 26.9%, not 0.269)
      const display = r.format === 'percentage' ? r.value.toFixed(1) + '%'
        : r.format === 'currency' ? fmtCurrency(r.value)
        : r.value.toFixed(2) + 'x';
      html += `<div class="stat-card">
        <div class="label">${r.name}</div>
        <div class="value">${display}</div>
      </div>`;
    }
    html += '</div>';
  }

  el.innerHTML = html;
}

// ── Ratio View ────────────────────────────────────────

async function renderRatio() {
  const ratios = await getRatios();
  $app().innerHTML = `
    <h2>Financial Ratio</h2>
    <div class="form-row">
      <div class="form-group"><label>Company</label><input id="r-company" placeholder="AAPL" value="AAPL"></div>
      <div class="form-group"><label>Ratio</label><select id="r-ratio">${ratioOptions(ratios)}</select></div>
      <div class="form-group"><label>Years</label><input id="r-years" type="number" value="5" min="1" max="20" style="width:70px"></div>
      <button id="r-go">Compute</button>
    </div>
    <div id="r-result"></div>
  `;

  $('#r-go').addEventListener('click', async () => {
    const el = $('#r-result');
    showLoading(el);
    try {
      const data = await api('/api/ratio', {
        company: $('#r-company').value.trim(),
        ratio: $('#r-ratio').value,
        years: $('#r-years').value,
      });
      renderRatioResult(el, data);
    } catch (err) {
      showError(el, err);
    }
  });
}

function renderRatioResult(el, data) {
  const labels = data.data.map(d => 'FY' + d.fiscal_year);
  const values = data.data.map(d => d.value);
  const fmt = data.ratio.format;

  el.innerHTML = `
    <h3>${data.company.name} (${data.company.ticker}) — ${data.ratio.display_name}</h3>
    <p class="text-dim" style="margin-bottom:16px">${data.ratio.description}</p>
    <div class="chart-container"><canvas id="ratio-chart"></canvas></div>
    <table class="data-table">
      <thead><tr><th>FY</th><th class="text-right">${data.ratio.display_name}</th><th class="text-right">Numerator</th><th class="text-right">Denominator</th></tr></thead>
      <tbody>${data.data.map(d => `<tr>
        <td>FY${d.fiscal_year}</td>
        <td class="text-right">${fmtRatio(d.value, fmt)}</td>
        <td class="text-right">${fmtCurrency(d.numerator_value)}</td>
        <td class="text-right">${fmtCurrency(d.denominator_value)}</td>
      </tr>`).join('')}</tbody>
    </table>
  `;

  const yCallback = fmt === 'percentage'
    ? (v) => v.toFixed(0) + '%'
    : fmt === 'currency'
    ? (v) => fmtCurrency(v)
    : (v) => v.toFixed(2) + 'x';

  createLineChart('ratio-chart', labels, [{ label: data.ratio.display_name, data: values }], yCallback);
}

// ── Multi-Metric View ─────────────────────────────────

async function renderMultiMetric() {
  const metrics = await getMetrics();
  $app().innerHTML = `
    <h2>Multi-Metric Comparison</h2>
    <div class="form-row">
      <div class="form-group"><label>Company</label><input id="mm-company" placeholder="AAPL" value="AAPL"></div>
      <div class="form-group"><label>Metrics (comma-separated IDs)</label><input id="mm-metrics" placeholder="revenue,net_income,capex" value="revenue,net_income,operating_cash_flow" style="min-width:280px"></div>
      <div class="form-group"><label>Years</label><input id="mm-years" type="number" value="5" min="1" max="20" style="width:70px"></div>
      <button id="mm-go">Compare</button>
    </div>
    <p class="text-dim" style="margin-bottom:16px">Available: ${metrics.map(m => m.id).join(', ')}</p>
    <div id="mm-result"></div>
  `;

  $('#mm-go').addEventListener('click', async () => {
    const el = $('#mm-result');
    showLoading(el);
    try {
      const data = await api('/api/multi-metric', {
        company: $('#mm-company').value.trim(),
        metrics: $('#mm-metrics').value.trim(),
        years: $('#mm-years').value,
      });
      renderMultiMetricResult(el, data);
    } catch (err) {
      showError(el, err);
    }
  });
}

function renderMultiMetricResult(el, data) {
  const years = data.years.sort();
  const labels = years.map(y => 'FY' + y);

  // One mini chart per metric
  let html = `<h3>${data.company.name} (${data.company.ticker})</h3>`;

  for (const m of data.metrics) {
    const metricData = data.data[m.id] || {};
    const values = years.map(y => metricData[y] ?? null);
    html += `
      <h3>${m.display_name}</h3>
      <div class="chart-container" style="height:250px"><canvas id="mm-chart-${m.id}"></canvas></div>
    `;
  }

  // Table
  html += `<table class="data-table">
    <thead><tr><th>Metric</th>${years.map(y => `<th class="text-right">FY${y}</th>`).join('')}</tr></thead>
    <tbody>${data.metrics.map(m => {
      const metricData = data.data[m.id] || {};
      return `<tr><td>${m.display_name}</td>${years.map(y =>
        `<td class="text-right">${metricData[y] != null ? fmtValue(metricData[y], m.unit_type) : '--'}</td>`
      ).join('')}</tr>`;
    }).join('')}</tbody>
  </table>`;

  el.innerHTML = html;

  // Create charts after DOM is ready
  for (const m of data.metrics) {
    const metricData = data.data[m.id] || {};
    const values = years.map(y => metricData[y] ?? null);
    createLineChart(`mm-chart-${m.id}`, labels, [{ label: m.display_name, data: values }],
      (v) => fmtValue(v, m.unit_type));
  }
}

// ── Matrix View ───────────────────────────────────────

async function renderMatrix() {
  const metrics = await getMetrics();
  $app().innerHTML = `
    <h2>Financial Matrix</h2>
    <div class="form-row">
      <div class="form-group"><label>Tickers (comma-separated)</label><input id="mx-tickers" placeholder="AAPL, MSFT, GOOGL" value="AAPL, MSFT, GOOGL"></div>
      <div class="form-group"><label>Metrics (comma-separated IDs)</label><input id="mx-metrics" placeholder="revenue,net_income" value="revenue,net_income,capex" style="min-width:220px"></div>
      <div class="form-group"><label>Year</label><input id="mx-year" placeholder="latest" style="width:80px"></div>
      <button id="mx-go">Build</button>
    </div>
    <p class="text-dim" style="margin-bottom:16px">Available: ${metrics.map(m => m.id).join(', ')}</p>
    <div id="mx-result"></div>
  `;

  $('#mx-go').addEventListener('click', async () => {
    const el = $('#mx-result');
    showLoading(el);
    try {
      const data = await api('/api/matrix', {
        tickers: $('#mx-tickers').value.trim(),
        metrics: $('#mx-metrics').value.trim(),
        year: $('#mx-year').value.trim() || undefined,
      });
      renderMatrixResult(el, data);
    } catch (err) {
      showError(el, err);
    }
  });
}

function renderMatrixResult(el, data) {
  const companies = data.companies;
  const metrics = data.metrics;

  // For each metric, find min/max to color-code
  const ranges = {};
  for (const m of metrics) {
    const vals = companies.map(c => c.values[m.id]).filter(v => v != null);
    ranges[m.id] = { min: Math.min(...vals), max: Math.max(...vals) };
  }

  let html = `<h3>Financial Matrix — FY${data.fiscal_year}</h3>`;
  html += `<table class="data-table">
    <thead><tr><th>Metric</th>${companies.map(c => `<th class="text-right">${c.company.ticker}</th>`).join('')}</tr></thead>
    <tbody>${metrics.map(m => {
      const r = ranges[m.id];
      return `<tr><td>${m.display_name}</td>${companies.map(c => {
        const v = c.values[m.id];
        if (v == null) return '<td class="text-right text-dim">--</td>';
        const isHigh = r.max !== r.min && v === r.max;
        const isLow = r.max !== r.min && v === r.min;
        const cls = isHigh ? 'matrix-cell high' : isLow ? 'matrix-cell low' : 'matrix-cell';
        return `<td class="text-right ${cls}">${fmtValue(v, m.unit_type)}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody>
  </table>`;

  if (data.warnings?.length) {
    html += `<p class="text-dim" style="margin-top:12px">Warnings: ${data.warnings.join('; ')}</p>`;
  }

  el.innerHTML = html;
}

// ── Screen View ───────────────────────────────────────

async function renderScreen() {
  const metrics = await getMetrics();
  $app().innerHTML = `
    <h2>Company Screener</h2>
    <div class="form-row">
      <div class="form-group"><label>Metric</label><select id="sc-metric">${metricOptions(metrics)}</select></div>
      <div class="form-group"><label>Year</label><input id="sc-year" placeholder="latest" style="width:80px"></div>
      <div class="form-group"><label>Min</label><input id="sc-min" placeholder="e.g. 1000000000" style="width:130px"></div>
      <div class="form-group"><label>Limit</label><input id="sc-limit" type="number" value="25" min="1" max="500" style="width:70px"></div>
      <button id="sc-go">Screen</button>
    </div>
    <div id="sc-result"></div>
  `;

  $('#sc-go').addEventListener('click', async () => {
    const el = $('#sc-result');
    showLoading(el);
    try {
      const data = await api('/api/screen', {
        metric: $('#sc-metric').value,
        year: $('#sc-year').value.trim() || undefined,
        min: $('#sc-min').value.trim() || undefined,
        limit: $('#sc-limit').value,
      });
      renderScreenResult(el, data);
    } catch (err) {
      showError(el, err);
    }
  });
}

function renderScreenResult(el, data) {
  const top20 = data.companies.slice(0, 20);
  const labels = top20.map(c => c.entity_name.length > 30 ? c.entity_name.slice(0, 27) + '...' : c.entity_name);
  const values = top20.map(c => c.value);

  el.innerHTML = `
    <h3>${data.metric.display_name} — ${data.period}</h3>
    <p class="text-dim" style="margin-bottom:16px">${data.filtered_companies} of ${data.total_companies} companies</p>
    <div class="chart-container" style="height:${Math.max(400, top20.length * 28)}px"><canvas id="screen-chart"></canvas></div>
    <table class="data-table">
      <thead><tr><th>#</th><th>Company</th><th class="text-right">Value</th><th>Location</th></tr></thead>
      <tbody>${data.companies.map((c, i) => `<tr>
        <td class="text-dim">${i + 1}</td>
        <td>${c.entity_name}</td>
        <td class="text-right">${fmtCurrency(c.value)}</td>
        <td class="text-dim">${c.location || ''}</td>
      </tr>`).join('')}</tbody>
    </table>
  `;

  createBarChart('screen-chart', labels, [{ label: data.metric.display_name, data: values }], true);
}

// ── Insider View ──────────────────────────────────────

async function renderInsider() {
  $app().innerHTML = `
    <h2>Insider Trading</h2>
    <div class="form-row">
      <div class="form-group"><label>Company</label><input id="in-company" placeholder="AAPL" value="AAPL"></div>
      <div class="form-group"><label>Days</label><input id="in-days" type="number" value="90" min="1" max="365" style="width:70px"></div>
      <button id="in-go">Fetch</button>
    </div>
    <div id="in-result"></div>
  `;

  $('#in-go').addEventListener('click', async () => {
    const el = $('#in-result');
    showLoading(el);
    try {
      const data = await api('/api/insider', {
        company: $('#in-company').value.trim(),
        days: $('#in-days').value,
      });
      renderInsiderResult(el, data);
    } catch (err) {
      showError(el, err);
    }
  });
}

function renderInsiderResult(el, data) {
  const s = data.summary;
  const signalMap = {
    bullish: { badge: 'green', label: 'Bullish' },
    bearish: { badge: 'red', label: 'Bearish' },
    mixed: { badge: 'yellow', label: 'Mixed' },
    neutral: { badge: 'blue', label: 'Neutral' },
  };
  const sig = signalMap[s.signal] || signalMap.neutral;

  el.innerHTML = `
    <h3>${data.company.name} (${data.company.ticker}) — Last ${data.period_days} Days</h3>
    <span class="badge ${sig.badge}">${sig.label}</span>
    <div class="stats-grid" style="margin-top:16px">
      <div class="stat-card"><div class="label">Total Buys</div><div class="value positive">${s.total_buys}</div></div>
      <div class="stat-card"><div class="label">Total Sells</div><div class="value negative">${s.total_sells}</div></div>
      <div class="stat-card"><div class="label">Buy Value</div><div class="value">${fmtCurrency(s.buy_value)}</div></div>
      <div class="stat-card"><div class="label">Sell Value</div><div class="value">${fmtCurrency(s.sell_value)}</div></div>
      <div class="stat-card"><div class="label">Net Shares</div><div class="value ${s.net_shares >= 0 ? 'positive' : 'negative'}">${s.net_shares >= 0 ? '+' : ''}${s.net_shares.toLocaleString()}</div></div>
      <div class="stat-card"><div class="label">Unique Insiders</div><div class="value">${s.unique_insiders}</div></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Date</th><th>Insider</th><th>Type</th><th class="text-right">Shares</th><th class="text-right">Price</th><th class="text-right">Value</th></tr></thead>
      <tbody>${data.transactions.map(t => {
        const isAcq = t.direction === 'acquisition';
        return `<tr>
          <td>${t.date}</td>
          <td>${t.insider.name}${t.insider.title ? ' <span class="text-dim">(' + t.insider.title + ')</span>' : ''}</td>
          <td><span class="badge ${isAcq ? 'green' : 'red'}">${isAcq ? 'Buy' : 'Sell'}</span></td>
          <td class="text-right">${t.shares?.toLocaleString() || '--'}</td>
          <td class="text-right">${t.price ? '$' + t.price.toFixed(2) : '--'}</td>
          <td class="text-right">${t.value ? fmtCurrency(t.value) : '--'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  `;
}
