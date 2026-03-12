/**
 * Quinnevic Dashboard — app.js
 * Fetches campaign data from Google Apps Script API, renders cards + chart.
 * 
 * SETUP: Replace APPS_SCRIPT_URL with your deployed Apps Script web app URL.
 */

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════

const CONFIG = {
  // Apps Script deployment URL
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbywEHd6wtRIydcA7xW_lWP_X-45G11kYw272SPNq_tIFseomrIdGUACc13bCMCYOI5e/exec',
  DEFAULT_DAYS: 30,
  CURRENCY: 'NZD',
  LOCALE: 'en-NZ',
};

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════

let rawData = [];
let trendChart = null;

// ═══════════════════════════════════════════════════
// DATE UTILITIES
// ═══════════════════════════════════════════════════

function formatDateParam(date) {
  return date.toISOString().split('T')[0];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function getDateRange() {
  const start = document.getElementById('date-start').value;
  const end = document.getElementById('date-end').value;
  return { start, end };
}

function setDateInputs(start, end) {
  document.getElementById('date-start').value = formatDateParam(start);
  document.getElementById('date-end').value = formatDateParam(end);
}

// ═══════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════

async function fetchData(startDate, endDate) {
  const url = new URL(CONFIG.APPS_SCRIPT_URL);
  if (startDate) url.searchParams.set('start', startDate);
  if (endDate) url.searchParams.set('end', endDate);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API returned error');

  return json;
}

// ═══════════════════════════════════════════════════
// DATA AGGREGATION
// ═══════════════════════════════════════════════════

function aggregateByCampaign(rows) {
  const map = {};

  rows.forEach(row => {
    const name = row.campaignName || row['Campaign Name'] || 'Unknown';
    if (!map[name]) {
      map[name] = {
        campaignName: name,
        region: row.region || row['Region'] || '—',
        clicks: 0,
        impressions: 0,
        cost: 0,
        totalCpc: 0,
        cpcCount: 0,
        days: 0,
        searchImprShare: [],
        imprShareTop: [],
        imprShareAbsTop: [],
      };
    }

    const c = map[name];
    c.clicks += toNum(row.clicks || row['Clicks']);
    c.impressions += toNum(row.impressions || row['Impressions']);
    c.cost += toNum(row.cost || row['Cost']);

    const cpc = toNum(row.avgCpc || row['Avg CPC']);
    if (cpc > 0) { c.totalCpc += cpc; c.cpcCount++; }

    pushPct(c.searchImprShare, row.searchImprShare || row['Search Impr Share']);
    pushPct(c.imprShareTop, row.imprShareTop || row['Impr Share (Top)']);
    pushPct(c.imprShareAbsTop, row.imprShareAbsTop || row['Impr Share (Abs Top)']);

    c.days++;
  });

  return Object.values(map).map(c => ({
    campaignName: c.campaignName,
    region: c.region,
    clicks: c.clicks,
    impressions: c.impressions,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) : 0,
    avgCpc: c.cpcCount > 0 ? (c.totalCpc / c.cpcCount) : 0,
    cost: c.cost,
    searchImprShare: avgPct(c.searchImprShare),
    imprShareTop: avgPct(c.imprShareTop),
    imprShareAbsTop: avgPct(c.imprShareAbsTop),
    days: c.days,
  }));
}

function aggregateByDate(rows) {
  const map = {};
  rows.forEach(row => {
    const date = row.date || row['Date'] || '';
    const dateStr = date instanceof Date ? formatDateParam(date) : String(date).split('T')[0];
    if (!map[dateStr]) map[dateStr] = { date: dateStr, clicks: 0, impressions: 0, cost: 0 };
    map[dateStr].clicks += toNum(row.clicks || row['Clicks']);
    map[dateStr].impressions += toNum(row.impressions || row['Impressions']);
    map[dateStr].cost += toNum(row.cost || row['Cost']);
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

// ═══════════════════════════════════════════════════
// NUMBER HELPERS
// ═══════════════════════════════════════════════════

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function pushPct(arr, val) {
  if (val === '--' || val === '' || val == null) return;
  const n = toNum(val);
  if (n > 0) arr.push(n > 1 ? n / 100 : n); // normalise to 0–1
}

function avgPct(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function fmtNum(n) {
  return n.toLocaleString(CONFIG.LOCALE, { maximumFractionDigits: 0 });
}

function fmtCurrency(n) {
  return new Intl.NumberFormat(CONFIG.LOCALE, { style: 'currency', currency: CONFIG.CURRENCY, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n) {
  if (n == null) return '—';
  return (n * 100).toFixed(1) + '%';
}

function fmtPctWhole(n) {
  if (n == null) return '—';
  return (n * 100).toFixed(0) + '%';
}

// ═══════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════

function renderSummary(campaigns) {
  const totals = campaigns.reduce((acc, c) => {
    acc.clicks += c.clicks;
    acc.impressions += c.impressions;
    acc.cost += c.cost;
    return acc;
  }, { clicks: 0, impressions: 0, cost: 0 });

  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;

  document.getElementById('total-clicks').textContent = fmtNum(totals.clicks);
  document.getElementById('total-impressions').textContent = fmtNum(totals.impressions);
  document.getElementById('total-cost').textContent = fmtCurrency(totals.cost);
  document.getElementById('avg-ctr').textContent = fmtPct(ctr);

  show('summary');
}

function renderCampaigns(campaigns) {
  const grid = document.getElementById('campaign-grid');
  grid.innerHTML = '';

  // Sort by cost descending
  campaigns.sort((a, b) => b.cost - a.cost);

  campaigns.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'campaign-card bg-white rounded-xl border border-gray-100 shadow-sm p-5 fade-in';
    card.style.animationDelay = `${i * 0.05}s`;

    const imprBarColor = getImprShareColor(c.searchImprShare);

    card.innerHTML = `
      <div class="flex items-start justify-between mb-3">
        <div>
          <h3 class="font-semibold text-gray-800 text-sm leading-tight">${esc(c.campaignName)}</h3>
          <span class="region-badge mt-1">${esc(c.region)}</span>
        </div>
        <span class="text-xs text-gray-300">${c.days}d</span>
      </div>
      
      <div class="space-y-0">
        <div class="metric-row">
          <span class="metric-label">Clicks</span>
          <span class="metric-value text-brand-600">${fmtNum(c.clicks)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Impressions</span>
          <span class="metric-value">${fmtNum(c.impressions)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">CTR</span>
          <span class="metric-value text-amber-600">${fmtPct(c.ctr)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Avg CPC</span>
          <span class="metric-value">${fmtCurrency(c.avgCpc)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Cost</span>
          <span class="metric-value text-emerald-600">${fmtCurrency(c.cost)}</span>
        </div>
      </div>

      <div class="mt-3 pt-3 border-t border-gray-50">
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-xs text-gray-400">Search Impr Share</span>
          <span class="text-xs font-semibold ${imprBarColor.text}">${fmtPctWhole(c.searchImprShare)}</span>
        </div>
        <div class="impr-bar-track">
          <div class="impr-bar-fill ${imprBarColor.bg}" style="width: ${c.searchImprShare != null ? (c.searchImprShare * 100) : 0}%"></div>
        </div>
        <div class="flex justify-between mt-2 text-xs text-gray-300">
          <span>Top: ${fmtPctWhole(c.imprShareTop)}</span>
          <span>Abs Top: ${fmtPctWhole(c.imprShareAbsTop)}</span>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  show('campaigns');
}

function getImprShareColor(val) {
  if (val == null) return { bg: 'bg-gray-300', text: 'text-gray-400' };
  if (val >= 0.7) return { bg: 'bg-emerald-400', text: 'text-emerald-600' };
  if (val >= 0.4) return { bg: 'bg-amber-400', text: 'text-amber-600' };
  return { bg: 'bg-red-400', text: 'text-red-500' };
}

function renderChart(dailyData) {
  if (dailyData.length < 2) {
    hide('chart-section');
    return;
  }

  const ctx = document.getElementById('trend-chart').getContext('2d');

  if (trendChart) trendChart.destroy();

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dailyData.map(d => {
        const parts = d.date.split('-');
        return `${parts[2]}/${parts[1]}`;
      }),
      datasets: [{
        label: 'Clicks',
        data: dailyData.map(d => d.clicks),
        borderColor: '#3379fc',
        backgroundColor: 'rgba(51, 121, 252, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: dailyData.length > 60 ? 0 : 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a338e',
          titleFont: { size: 11 },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: ctx => `${fmtNum(ctx.parsed.y)} clicks`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 12 }
        },
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { font: { size: 10 }, color: '#94a3b8' }
        }
      }
    }
  });

  show('chart-section');
}

// ═══════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ═══════════════════════════════════════════════════
// MAIN LOAD
// ═══════════════════════════════════════════════════

async function loadData() {
  const { start, end } = getDateRange();

  show('loading');
  hide('error');
  hide('summary');
  hide('campaigns');
  hide('chart-section');

  try {
    const response = await fetchData(start, end);
    rawData = response.data || [];

    if (rawData.length === 0) {
      hide('loading');
      document.getElementById('error-msg').textContent = 'No data found for the selected date range.';
      show('error');
      return;
    }

    const campaigns = aggregateByCampaign(rawData);
    const daily = aggregateByDate(rawData);

    renderSummary(campaigns);
    renderCampaigns(campaigns);
    renderChart(daily);

    // Update header timestamp
    document.getElementById('last-updated').textContent =
      `Data as of ${end || formatDateParam(new Date())} · ${rawData.length} rows`;

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
  // Set default date range: last 30 days
  setDateInputs(daysAgo(CONFIG.DEFAULT_DAYS), new Date());

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      document.querySelectorAll('.preset-btn').forEach(b => {
        b.className = 'preset-btn px-3 py-1.5 rounded-full text-xs font-medium border border-gray-300 text-gray-600 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors';
      });
      btn.className = 'preset-btn px-3 py-1.5 rounded-full text-xs font-medium border border-brand-500 bg-brand-50 text-brand-700';

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
    // Clear preset active states
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.className = 'preset-btn px-3 py-1.5 rounded-full text-xs font-medium border border-gray-300 text-gray-600 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors';
    });
    loadData();
  });

  // Initial load
  loadData();
});

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
