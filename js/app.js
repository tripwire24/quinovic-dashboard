/**
 * Quinovic Dashboard — app.js
 * Fetches campaign data, renders cards + multi-metric chart + expandable modals.
 */

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════

const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbywEHd6wtRIydcA7xW_lWP_X-45G11kYw272SPNq_tIFseomrIdGUACc13bCMCYOI5e/exec',
  DEFAULT_DAYS: 30,
  CURRENCY: 'NZD',
  LOCALE: 'en-NZ',
  MAX_CHART_METRICS: 4,
};

// Chart metric definitions
const METRIC_CONFIG = {
  clicks:      { label: 'Clicks',      color: '#1B2A4A', yAxis: 'yLeft',  format: v => fmtNum(v) },
  impressions: { label: 'Impressions', color: '#829ab1', yAxis: 'yLeft',  format: v => fmtNum(v) },
  cost:        { label: 'Spend',       color: '#00B4A6', yAxis: 'yLeft',  format: v => fmtCurrency(v) },
  ctr:         { label: 'CTR',         color: '#F59E0B', yAxis: 'yRight', format: v => fmtPct(v) },
};

// Metric tooltips for campaign cards
const METRIC_TIPS = {
  clicks:          'Number of times users clicked your ad.',
  impressions:     'Number of times your ad was shown.',
  ctr:             'Click-Through Rate — clicks divided by impressions.',
  avgCpc:          'Average Cost Per Click — the average amount you paid per click.',
  cost:            'Total spend for this campaign in the selected period.',
  searchImprShare: 'Search Impression Share — percentage of eligible impressions your ads received.',
  imprShareTop:    'Impression Share (Top) — percentage showing in top results.',
  imprShareAbsTop: 'Impression Share (Abs Top) — percentage showing as the very first ad.',
};

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════

let rawData = [];
let campaignData = [];
let dailyData = [];
let trendChart = null;
let miniCharts = {};
let modalChart = null;
let activeMetrics = ['clicks'];

// ═══════════════════════════════════════════════════
// DATE UTILITIES
// ═══════════════════════════════════════════════════

function formatDateParam(d) { return d.toISOString().split('T')[0]; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function getDateRange() {
  return { start: document.getElementById('date-start').value, end: document.getElementById('date-end').value };
}
function setDateInputs(s, e) {
  document.getElementById('date-start').value = formatDateParam(s);
  document.getElementById('date-end').value = formatDateParam(e);
}

// ═══════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════

async function fetchData(start, end) {
  const url = new URL(CONFIG.APPS_SCRIPT_URL);
  if (start) url.searchParams.set('start', start);
  if (end) url.searchParams.set('end', end);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json;
}

// ═══════════════════════════════════════════════════
// AGGREGATION
// ═══════════════════════════════════════════════════

function aggregateByCampaign(rows) {
  const map = {};
  rows.forEach(row => {
    const name = row.campaignName || row['Campaign Name'] || 'Unknown';
    if (!map[name]) {
      map[name] = {
        campaignName: name,
        region: row.region || row['Region'] || '—',
        clicks: 0, impressions: 0, cost: 0,
        totalCpc: 0, cpcCount: 0, days: 0,
        searchImprShare: [], imprShareTop: [], imprShareAbsTop: [],
        daily: {},
      };
    }
    const c = map[name];
    c.clicks += toNum(row.clicks ?? row['Clicks']);
    c.impressions += toNum(row.impressions ?? row['Impressions']);
    c.cost += toNum(row.cost ?? row['Cost']);
    const cpc = toNum(row.avgCpc ?? row['Avg CPC']);
    if (cpc > 0) { c.totalCpc += cpc; c.cpcCount++; }
    pushPct(c.searchImprShare, row.searchImprShare ?? row['Search Impr Share']);
    pushPct(c.imprShareTop, row.imprShareTop ?? row['Impr Share (Top)']);
    pushPct(c.imprShareAbsTop, row.imprShareAbsTop ?? row['Impr Share (Abs Top)']);
    // Daily breakdown per campaign
    const dateStr = getRowDate(row);
    if (!c.daily[dateStr]) c.daily[dateStr] = { clicks: 0, impressions: 0, cost: 0 };
    c.daily[dateStr].clicks += toNum(row.clicks ?? row['Clicks']);
    c.daily[dateStr].impressions += toNum(row.impressions ?? row['Impressions']);
    c.daily[dateStr].cost += toNum(row.cost ?? row['Cost']);
    c.days++;
  });

  return Object.values(map).map(c => ({
    ...c,
    ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
    avgCpc: c.cpcCount > 0 ? c.totalCpc / c.cpcCount : 0,
    searchImprShare: avgPct(c.searchImprShare),
    imprShareTop: avgPct(c.imprShareTop),
    imprShareAbsTop: avgPct(c.imprShareAbsTop),
    dailySorted: Object.entries(c.daily).sort((a, b) => a[0].localeCompare(b[0])),
  }));
}

function aggregateByDate(rows) {
  const map = {};
  rows.forEach(row => {
    const dateStr = getRowDate(row);
    if (!map[dateStr]) map[dateStr] = { date: dateStr, clicks: 0, impressions: 0, cost: 0 };
    map[dateStr].clicks += toNum(row.clicks ?? row['Clicks']);
    map[dateStr].impressions += toNum(row.impressions ?? row['Impressions']);
    map[dateStr].cost += toNum(row.cost ?? row['Cost']);
  });
  const arr = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  // Calculate CTR per day
  arr.forEach(d => { d.ctr = d.impressions > 0 ? d.clicks / d.impressions : 0; });
  return arr;
}

function getRowDate(row) {
  const d = row.date || row['Date'] || '';
  if (d instanceof Date) return formatDateParam(d);
  return String(d).split('T')[0];
}

// ═══════════════════════════════════════════════════
// NUMBER HELPERS
// ═══════════════════════════════════════════════════

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  return 0;
}
function pushPct(arr, val) {
  if (val === '--' || val === '' || val == null) return;
  const n = toNum(val);
  if (n > 0) arr.push(n > 1 ? n / 100 : n);
}
function avgPct(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function fmtNum(n) { return n.toLocaleString(CONFIG.LOCALE, { maximumFractionDigits: 0 }); }
function fmtCurrency(n) { return new Intl.NumberFormat(CONFIG.LOCALE, { style: 'currency', currency: CONFIG.CURRENCY, maximumFractionDigits: 2 }).format(n); }
function fmtPct(n) { if (n == null) return '—'; return (n * 100).toFixed(1) + '%'; }
function fmtPctWhole(n) { if (n == null) return '—'; return (n * 100).toFixed(0) + '%'; }

// ═══════════════════════════════════════════════════
// RENDERING — SUMMARY
// ═══════════════════════════════════════════════════

function renderSummary(campaigns) {
  const t = campaigns.reduce((a, c) => {
    a.clicks += c.clicks; a.impressions += c.impressions; a.cost += c.cost; return a;
  }, { clicks: 0, impressions: 0, cost: 0 });
  document.getElementById('total-cost').textContent = fmtCurrency(t.cost);
  document.getElementById('total-impressions').textContent = fmtNum(t.impressions);
  document.getElementById('total-clicks').textContent = fmtNum(t.clicks);
  document.getElementById('avg-ctr').textContent = fmtPct(t.impressions > 0 ? t.clicks / t.impressions : 0);
  show('summary');
}

// ═══════════════════════════════════════════════════
// RENDERING — MAIN CHART (multi-metric)
// ═══════════════════════════════════════════════════

function renderChart(daily) {
  if (daily.length < 2) { hide('chart-section'); return; }
  const ctx = document.getElementById('trend-chart').getContext('2d');
  if (trendChart) trendChart.destroy();

  const labels = daily.map(d => { const p = d.date.split('-'); return `${p[2]}/${p[1]}`; });
  const datasets = [];
  const needsRight = activeMetrics.includes('ctr');

  activeMetrics.forEach(key => {
    const mc = METRIC_CONFIG[key];
    datasets.push({
      label: mc.label,
      data: daily.map(d => key === 'ctr' ? d.ctr * 100 : d[key]),
      borderColor: mc.color,
      backgroundColor: mc.color + '14',
      fill: activeMetrics.length === 1,
      tension: 0.3,
      pointRadius: daily.length > 60 ? 0 : 2.5,
      pointHoverRadius: 5,
      borderWidth: 2,
      yAxisID: mc.yAxis,
    });
  });

  trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: activeMetrics.length > 1, position: 'top', labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#1B2A4A', titleFont: { size: 11 }, bodyFont: { size: 12 },
          padding: 10, cornerRadius: 8,
          callbacks: {
            label: ctx => {
              const key = Object.keys(METRIC_CONFIG).find(k => METRIC_CONFIG[k].label === ctx.dataset.label);
              if (key === 'ctr') return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`;
              if (key === 'cost') return `${ctx.dataset.label}: ${fmtCurrency(ctx.parsed.y)}`;
              return `${ctx.dataset.label}: ${fmtNum(ctx.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 12 } },
        yLeft: {
          position: 'left', beginAtZero: true,
          display: activeMetrics.some(m => METRIC_CONFIG[m].yAxis === 'yLeft'),
          grid: { color: '#f1f5f9' },
          ticks: { font: { size: 10 }, color: '#94a3b8' },
        },
        yRight: {
          position: 'right', beginAtZero: true,
          display: needsRight,
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 10 }, color: '#F59E0B', callback: v => v + '%' },
        },
      }
    }
  });
  show('chart-section');
}

// ═══════════════════════════════════════════════════
// RENDERING — CAMPAIGN CARDS
// ═══════════════════════════════════════════════════

function renderCampaigns(campaigns) {
  const grid = document.getElementById('campaign-grid');
  grid.innerHTML = '';
  miniCharts = {};
  campaigns.sort((a, b) => b.cost - a.cost);

  campaigns.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'campaign-card fade-in';
    card.style.animationDelay = `${i * 0.05}s`;
    card.onclick = () => expandCampaign(c);

    const barColor = getBarColor(c.searchImprShare);

    card.innerHTML = `
      <div class="flex items-start justify-between mb-2">
        <div>
          <h3 class="font-semibold text-gray-800 text-sm leading-tight">${esc(c.campaignName)}</h3>
          <span class="region-badge mt-1">${esc(c.region)}</span>
        </div>
        <span class="text-[0.6rem] text-gray-300 font-medium">${c.days}d</span>
      </div>

      <div class="grid grid-cols-2 gap-x-4">
        <div class="metric-row" data-tip="${METRIC_TIPS.clicks}">
          <span class="metric-label">Clicks</span>
          <span class="metric-value text-qnav-900">${fmtNum(c.clicks)}</span>
        </div>
        <div class="metric-row" data-tip="${METRIC_TIPS.impressions}">
          <span class="metric-label">Impressions</span>
          <span class="metric-value">${fmtNum(c.impressions)}</span>
        </div>
        <div class="metric-row" data-tip="${METRIC_TIPS.ctr}">
          <span class="metric-label">CTR</span>
          <span class="metric-value text-amber-600">${fmtPct(c.ctr)}</span>
        </div>
        <div class="metric-row" data-tip="${METRIC_TIPS.avgCpc}">
          <span class="metric-label">Avg CPC</span>
          <span class="metric-value">${fmtCurrency(c.avgCpc)}</span>
        </div>
        <div class="metric-row col-span-2" data-tip="${METRIC_TIPS.cost}">
          <span class="metric-label">Total Spend</span>
          <span class="metric-value text-qteal-600">${fmtCurrency(c.cost)}</span>
        </div>
      </div>

      <div class="mt-2.5 pt-2.5 border-t border-gray-50">
        <div class="flex justify-between items-center mb-1">
          <span class="text-[0.65rem] text-gray-400" data-tip="${METRIC_TIPS.searchImprShare}">Search Impr Share</span>
          <span class="text-[0.65rem] font-semibold ${barColor.text}">${fmtPctWhole(c.searchImprShare)}</span>
        </div>
        <div class="impr-bar-track">
          <div class="impr-bar-fill ${barColor.bg}" style="width:${c.searchImprShare != null ? (c.searchImprShare * 100) : 0}%"></div>
        </div>
        <div class="flex justify-between mt-1.5 text-[0.6rem] text-gray-300">
          <span>Top: ${fmtPctWhole(c.imprShareTop)}</span>
          <span>Abs Top: ${fmtPctWhole(c.imprShareAbsTop)}</span>
        </div>
      </div>

      <div class="mini-chart-wrap">
        <canvas id="mini-${i}"></canvas>
      </div>

      <div class="mt-2 text-center">
        <span class="text-[0.6rem] text-qteal-500 font-medium">Click to expand →</span>
      </div>
    `;

    grid.appendChild(card);

    // Render mini chart after DOM insert
    requestAnimationFrame(() => renderMiniChart(i, c));
  });

  show('campaigns');
}

function renderMiniChart(idx, campaign) {
  const canvas = document.getElementById(`mini-${idx}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const daily = campaign.dailySorted;
  if (daily.length < 2) return;

  miniCharts[idx] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: daily.map(d => { const p = d[0].split('-'); return `${p[2]}/${p[1]}`; }),
      datasets: [{
        data: daily.map(d => d[1].clicks),
        borderColor: '#00B4A6',
        backgroundColor: 'rgba(0,180,166,0.08)',
        fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false, beginAtZero: true },
      },
    }
  });
}

function getBarColor(val) {
  if (val == null) return { bg: 'bg-gray-300', text: 'text-gray-400' };
  if (val >= 0.7) return { bg: 'bg-emerald-400', text: 'text-emerald-600' };
  if (val >= 0.4) return { bg: 'bg-amber-400', text: 'text-amber-600' };
  return { bg: 'bg-red-400', text: 'text-red-500' };
}

// ═══════════════════════════════════════════════════
// EXPAND MODAL
// ═══════════════════════════════════════════════════

function expandCampaign(c) {
  const body = document.getElementById('modal-body');
  const daily = c.dailySorted;
  const barColor = getBarColor(c.searchImprShare);

  body.innerHTML = `
    <div class="flex items-start justify-between mb-4">
      <div>
        <h2 class="text-lg font-bold text-gray-800">${esc(c.campaignName)}</h2>
        <span class="region-badge">${esc(c.region)}</span>
        <span class="text-xs text-gray-400 ml-2">${c.days} days of data</span>
      </div>
    </div>

    <div class="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
      <div class="text-center p-3 bg-gray-50 rounded-lg">
        <p class="text-[0.6rem] uppercase text-gray-400 font-semibold">Clicks</p>
        <p class="text-lg font-bold text-qnav-900">${fmtNum(c.clicks)}</p>
      </div>
      <div class="text-center p-3 bg-gray-50 rounded-lg">
        <p class="text-[0.6rem] uppercase text-gray-400 font-semibold">Impressions</p>
        <p class="text-lg font-bold text-qnav-700">${fmtNum(c.impressions)}</p>
      </div>
      <div class="text-center p-3 bg-gray-50 rounded-lg">
        <p class="text-[0.6rem] uppercase text-gray-400 font-semibold">CTR</p>
        <p class="text-lg font-bold text-amber-600">${fmtPct(c.ctr)}</p>
      </div>
      <div class="text-center p-3 bg-gray-50 rounded-lg">
        <p class="text-[0.6rem] uppercase text-gray-400 font-semibold">Avg CPC</p>
        <p class="text-lg font-bold text-gray-700">${fmtCurrency(c.avgCpc)}</p>
      </div>
      <div class="text-center p-3 bg-gray-50 rounded-lg">
        <p class="text-[0.6rem] uppercase text-gray-400 font-semibold">Spend</p>
        <p class="text-lg font-bold text-qteal-600">${fmtCurrency(c.cost)}</p>
      </div>
    </div>

    <div class="mb-4">
      <div class="flex justify-between items-center mb-1.5">
        <span class="text-xs text-gray-500">Search Impression Share</span>
        <span class="text-xs font-bold ${barColor.text}">${fmtPctWhole(c.searchImprShare)}</span>
      </div>
      <div class="impr-bar-track" style="height:8px">
        <div class="impr-bar-fill ${barColor.bg}" style="width:${c.searchImprShare != null ? (c.searchImprShare * 100) : 0}%"></div>
      </div>
      <div class="flex justify-between mt-1 text-[0.65rem] text-gray-400">
        <span>Top: ${fmtPctWhole(c.imprShareTop)}</span>
        <span>Abs Top: ${fmtPctWhole(c.imprShareAbsTop)}</span>
      </div>
    </div>

    <h3 class="text-xs font-semibold text-gray-600 mb-2">Daily Clicks Trend</h3>
    <div class="modal-chart-wrap">
      <canvas id="modal-chart"></canvas>
    </div>
  `;

  document.getElementById('modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Render modal chart
  requestAnimationFrame(() => {
    if (modalChart) modalChart.destroy();
    const mCtx = document.getElementById('modal-chart').getContext('2d');
    modalChart = new Chart(mCtx, {
      type: 'line',
      data: {
        labels: daily.map(d => { const p = d[0].split('-'); return `${p[2]}/${p[1]}`; }),
        datasets: [
          {
            label: 'Clicks', data: daily.map(d => d[1].clicks),
            borderColor: '#1B2A4A', backgroundColor: 'rgba(27,42,74,0.06)',
            fill: true, tension: 0.3, pointRadius: daily.length > 30 ? 0 : 3, borderWidth: 2,
          },
          {
            label: 'Spend', data: daily.map(d => d[1].cost),
            borderColor: '#00B4A6', backgroundColor: 'transparent',
            fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 2],
            yAxisID: 'yRight',
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { backgroundColor: '#1B2A4A', padding: 10, cornerRadius: 8 }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 15 } },
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
          yRight: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, color: '#00B4A6' } },
        }
      }
    });
  });
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  if (modalChart) { modalChart.destroy(); modalChart = null; }
}

// ═══════════════════════════════════════════════════
// PDF DOWNLOAD
// ═══════════════════════════════════════════════════

function downloadPDF() {
  window.print();
}

// ═══════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function esc(s) { const el = document.createElement('span'); el.textContent = s; return el.innerHTML; }

// ═══════════════════════════════════════════════════
// MAIN LOAD
// ═══════════════════════════════════════════════════

async function loadData() {
  const { start, end } = getDateRange();
  show('loading'); hide('error'); hide('summary'); hide('campaigns'); hide('chart-section');

  try {
    const response = await fetchData(start, end);
    rawData = response.data || [];

    if (rawData.length === 0) {
      hide('loading');
      document.getElementById('error-msg').textContent = 'No data found for the selected date range.';
      show('error');
      return;
    }

    campaignData = aggregateByCampaign(rawData);
    dailyData = aggregateByDate(rawData);

    renderSummary(campaignData);
    renderChart(dailyData);
    renderCampaigns(campaignData);

    document.getElementById('last-updated').textContent =
      `${start || '—'} to ${end || formatDateParam(new Date())} · ${rawData.length} rows`;

    hide('loading');
  } catch (err) {
    console.error('Load failed:', err);
    hide('loading');
    document.getElementById('error-msg').textContent = err.message;
    show('error');
  }
}

// ═══════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  setDateInputs(daysAgo(CONFIG.DEFAULT_DAYS), new Date());

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = btn.dataset.days;
      if (days === 'all') {
        setDateInputs(new Date('2025-10-01'), new Date());
      } else {
        setDateInputs(daysAgo(parseInt(days)), new Date());
      }
      loadData();
    });
  });

  // Apply button
  document.getElementById('btn-apply').addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    loadData();
  });

  // Chart metric toggles (max 3 active)
  document.querySelectorAll('.chart-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const metric = btn.dataset.metric;
      if (btn.classList.contains('active')) {
        if (activeMetrics.length <= 1) return; // must keep at least one
        activeMetrics = activeMetrics.filter(m => m !== metric);
        btn.classList.remove('active');
      } else {
        if (activeMetrics.length >= CONFIG.MAX_CHART_METRICS) {
          // Deactivate oldest
          const removed = activeMetrics.shift();
          document.querySelector(`.chart-toggle[data-metric="${removed}"]`).classList.remove('active');
        }
        activeMetrics.push(metric);
        btn.classList.add('active');
      }
      renderChart(dailyData);
    });
  });

  // PDF download
  document.getElementById('btn-download').addEventListener('click', downloadPDF);

  // Keyboard close modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Load
  loadData();
});

// Service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
