/**
 * Chart.js wrapper functions for sec-edgar-nl web UI.
 * Each function creates a specific chart type in a canvas element.
 */

// Shared color palette
const COLORS = [
  '#58a6ff', '#3fb950', '#f85149', '#d29922', '#bc8cff',
  '#f778ba', '#79c0ff', '#56d364', '#ff7b72', '#e3b341',
];

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#e6edf3', font: { family: "'SF Mono', monospace", size: 11 } },
    },
    tooltip: {
      backgroundColor: '#161b22',
      borderColor: '#30363d',
      borderWidth: 1,
      titleFont: { family: "'SF Mono', monospace" },
      bodyFont: { family: "'SF Mono', monospace" },
    },
  },
  scales: {
    x: {
      ticks: { color: '#8b949e', font: { family: "'SF Mono', monospace", size: 11 } },
      grid: { color: 'rgba(48, 54, 61, 0.5)' },
    },
    y: {
      ticks: { color: '#8b949e', font: { family: "'SF Mono', monospace", size: 11 } },
      grid: { color: 'rgba(48, 54, 61, 0.5)' },
    },
  },
};

// Track active charts for cleanup
const activeCharts = {};

function destroyChart(id) {
  if (activeCharts[id]) {
    activeCharts[id].destroy();
    delete activeCharts[id];
  }
}

// ── Format Helpers ────────────────────────────────────

function fmtCurrency(v) {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + 'K';
  return sign + '$' + abs.toFixed(2);
}

function fmtValue(v, unitType) {
  if (unitType === 'ratio') return '$' + v.toFixed(2);
  if (unitType === 'shares') {
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    return v.toLocaleString();
  }
  return fmtCurrency(v);
}

function fmtPct(v) {
  if (v === null || v === undefined) return '--';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

function fmtRatio(v, format) {
  if (format === 'percentage') return v.toFixed(1) + '%';
  if (format === 'currency') return fmtCurrency(v);
  return v.toFixed(2) + 'x';
}

// ── Chart Creators ────────────────────────────────────

function createLineChart(canvasId, labels, datasets, yCallback) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color || COLORS[i % COLORS.length],
        backgroundColor: (ds.color || COLORS[i % COLORS.length]) + '20',
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.1,
        fill: datasets.length === 1,
      })),
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: yCallback || function(v) { return fmtCurrency(v); },
          },
        },
      },
    },
  };

  activeCharts[canvasId] = new Chart(ctx, config);
  return activeCharts[canvasId];
}

function createBarChart(canvasId, labels, datasets, horizontal, yCallback) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color || COLORS[i % COLORS.length],
        borderRadius: 4,
      })),
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: horizontal ? 'y' : 'x',
      scales: {
        ...CHART_DEFAULTS.scales,
        [horizontal ? 'x' : 'y']: {
          ...CHART_DEFAULTS.scales.y,
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: yCallback || function(v) { return fmtCurrency(v); },
          },
        },
      },
    },
  };

  activeCharts[canvasId] = new Chart(ctx, config);
  return activeCharts[canvasId];
}

function createScatterChart(canvasId, datasets) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const config = {
    type: 'scatter',
    data: {
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color || COLORS[i % COLORS.length],
        pointRadius: 6,
        pointHoverRadius: 8,
      })),
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          type: 'time',
          time: { unit: 'month' },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: function(v) { return fmtCurrency(v); },
          },
        },
      },
    },
  };

  activeCharts[canvasId] = new Chart(ctx, config);
  return activeCharts[canvasId];
}
