const state = {
  data: null,
  filteredPackets: [],
  activeFileName: null,
  activeTab: 'overview',
  charts: {}
};

const el = {
  kpiPackets: document.getElementById('kpi-packets'),
  kpiPages: document.getElementById('kpi-pages'),
  kpiCurrency: document.getElementById('kpi-currency'),
  kpiAvgPages: document.getElementById('kpi-avg-pages'),
  kpiGiving: document.getElementById('kpi-giving'),
  kpiBudget: document.getElementById('kpi-budget'),
  kpiActual: document.getElementById('kpi-actual'),
  kpiVariance: document.getElementById('kpi-variance'),
  kpiTotalGiving: document.getElementById('kpi-total-giving'),
  kpiMonthlyAvg: document.getElementById('kpi-monthly-avg'),
  kpiGivingPerf: document.getElementById('kpi-giving-perf'),
  reportGiving: document.getElementById('report-giving'),
  reportBudget: document.getElementById('report-budget'),
  reportActual: document.getElementById('report-actual'),
  reportVariance: document.getElementById('report-variance'),
  reportVarianceStatus: document.getElementById('report-variance-status'),
  givingReportTable: document.getElementById('giving-report-table'),
  tableBody: document.getElementById('packet-table-body'),
  budgetDetail: document.getElementById('budget-detail'),
  filterInput: document.getElementById('filter-input'),
  refreshBtn: document.getElementById('refresh-btn'),
  tabs: document.querySelectorAll('.tab'),
  tabPages: document.querySelectorAll('.tab-page')
};

const numberFmt = new Intl.NumberFormat('en-US');
const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.valueOf()) ? value : d.toLocaleDateString();
}

function setKpis(summary, financial) {
  el.kpiPackets.textContent = numberFmt.format(summary.packet_count || 0);
  el.kpiPages.textContent = numberFmt.format(summary.total_pages || 0);
  el.kpiCurrency.textContent = numberFmt.format(summary.currency_mentions || 0);
  el.kpiAvgPages.textContent = numberFmt.format(summary.average_pages || 0);

  el.kpiGiving.textContent = moneyFmt.format(financial.total_giving_ytd || 0);
  el.kpiBudget.textContent = moneyFmt.format(financial.total_budget_ytd || 0);
  el.kpiActual.textContent = moneyFmt.format(financial.total_actual_ytd || 0);
  el.kpiVariance.textContent = numberFmt.format(Math.abs(financial.average_variance_ytd || 0)) + '%';
  el.kpiTotalGiving.textContent = moneyFmt.format(financial.total_giving_ytd || 0);
  
  const monthCount = Object.keys(financial.giving_monthly_averages || {}).length;
  const avgMonthly = monthCount > 0 
    ? Object.values(financial.giving_monthly_averages || {}).reduce((a, b) => a + b, 0) / monthCount 
    : 0;
  el.kpiMonthlyAvg.textContent = numberFmt.format(Math.round(avgMonthly)) + '%';
  
  const givingPerf = financial.total_giving_ytd >= financial.total_budget_ytd ? 'Above' : 'Below';
  el.kpiGivingPerf.textContent = givingPerf + ' Budget';

  // Report table
  el.reportGiving.textContent = moneyFmt.format(financial.total_giving_ytd || 0);
  el.reportBudget.textContent = moneyFmt.format(financial.total_budget_ytd || 0);
  el.reportActual.textContent = moneyFmt.format(financial.total_actual_ytd || 0);
  
  const variance = (financial.total_actual_ytd || 0) - (financial.total_budget_ytd || 0);
  const varColor = variance > 0 ? '#ef4444' : '#10b981';
  const varStatus = variance > 0 ? 'Over' : 'Under';
  el.reportVariance.textContent = moneyFmt.format(Math.abs(variance));
  el.reportVariance.style.color = varColor;
  el.reportVarianceStatus.textContent = varStatus;
  el.reportVarianceStatus.style.color = varColor;
}

function destroyCharts() {
  Object.values(state.charts).forEach((chart) => chart?.destroy());
  state.charts = {};
}

function createTrendChart(trend) {
  const ctx = document.getElementById('trend-chart');
  if (!ctx) return;

  state.charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map((t) => formatDate(t.display_date || t.meeting_date || t.sent_date)),
      datasets: [
        {
          label: 'Finance Score',
          data: trend.map((t) => t.finance_score),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.2)',
          tension: 0.25,
          fill: true
        },
        {
          label: 'Currency Mentions',
          data: trend.map((t) => t.currency_mentions),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15,118,110,0.12)',
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function createKeywordChart(keywordTotals) {
  const ctx = document.getElementById('keyword-chart');
  if (!ctx) return;

  const entries = Object.entries(keywordTotals || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  state.charts.keyword = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map((entry) => entry[0]),
      datasets: [{
        label: 'Mentions',
        data: entries.map((entry) => entry[1]),
        backgroundColor: '#1d4ed8'
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function createScatterChart(packets) {
  const ctx = document.getElementById('scatter-chart');
  if (!ctx) return;

  state.charts.scatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Packet',
        data: packets.map((p) => ({ x: p.page_count, y: p.currency_mentions, title: p.title })),
        backgroundColor: 'rgba(14,116,144,0.7)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: 'Page Count' } },
        y: { title: { display: true, text: 'Currency Mentions' } }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label(context) {
              const title = context.raw.title || 'Packet';
              return `${title}: ${context.raw.x} pages, ${context.raw.y} mentions`;
            }
          }
        }
      }
    }
  });
}

function createBudgetTrendChart(trend) {
  const ctx = document.getElementById('budget-trend-chart');
  if (!ctx) return;

  state.charts.budgetTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map((t) => formatDate(t.display_date || t.meeting_date || t.sent_date)),
      datasets: [
        {
          label: 'Budget YTD',
          data: trend.map((t) => t.budget_ytd),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.25
        },
        {
          label: 'Actual YTD',
          data: trend.map((t) => t.actual_ytd),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function createExpenseChart(expenseCategories) {
  const ctx = document.getElementById('expense-chart');
  if (!ctx) return;

  const entries = Object.entries(expenseCategories || {}).slice(0, 8);

  state.charts.expense = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map((entry) => entry[0]),
      datasets: [{
        data: entries.map((entry) => entry[1]),
        backgroundColor: [
          '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
          '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right' } }
    }
  });
}

function createGivingMonthlyChart(givingMonthly) {
  const ctx = document.getElementById('giving-monthly-chart');
  if (!ctx) return;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const entries = Object.entries(givingMonthly || {});
  const data = months.map(m => {
    const match = entries.find(e => e[0].toLowerCase().startsWith(m.toLowerCase()));
    return match ? match[1] : 0;
  });

  state.charts.givingMonthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: '% of Budget',
        data,
        backgroundColor: '#06b6d4'
      }]
    },
    options: {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, max: 120 } },
      plugins: { legend: { display: false } }
    }
  });
}

function renderPacketDetail(packet) {
  if (!packet) {
    el.detail.innerHTML = '<h2>Packet Detail</h2><p>Select a row below to inspect a packet.</p>';
    return;
  }

  const topAmounts = (packet.top_amounts || []).slice(0, 5)
    .map((v) => `<li>${moneyFmt.format(v)}</li>`)
    .join('');

  const topKeywords = Object.entries(packet.keyword_counts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => `<li>${key}: ${count}</li>`)
    .join('');

  el.detail.innerHTML = `
    <h2>Packet Detail</h2>
    <p><strong>Title:</strong> ${packet.title}</p>
    <p><strong>Date:</strong> ${formatDate(packet.display_date || packet.meeting_date || packet.sent_date)}</p>
    <p><strong>Pages:</strong> ${numberFmt.format(packet.page_count)}</p>
    <p><strong>Currency Mentions:</strong> ${numberFmt.format(packet.currency_mentions)}</p>
    <p><strong>Finance Score:</strong> ${numberFmt.format(packet.finance_score)}</p>
    <p><strong>Top Amounts Detected:</strong></p>
    <ul>${topAmounts || '<li>None detected</li>'}</ul>
    <p><strong>Top Keywords:</strong></p>
    <ul>${topKeywords || '<li>No keywords detected</li>'}</ul>
  `;
}

function renderTableRows() {
  if (!el.tableBody) return;

  const rows = state.filteredPackets.map((packet) => {
    const active = state.activeFileName === packet.file_name ? 'active' : '';
    return `
      <tr data-file="${packet.file_name}" class="${active}">
        <td>${formatDate(packet.display_date || packet.meeting_date || packet.sent_date)}</td>
        <td>${packet.title}</td>
        <td>${numberFmt.format(packet.page_count)}</td>
        <td>${numberFmt.format(packet.currency_mentions)}</td>
        <td>${numberFmt.format(packet.finance_score)}</td>
        <td>${packet.financial_data?.giving_ytd ? moneyFmt.format(packet.financial_data.giving_ytd) : '-'}</td>
      </tr>
    `;
  }).join('');

  el.tableBody.innerHTML = rows || '<tr><td colspan="6">No packets match filter.</td></tr>';

  el.tableBody.querySelectorAll('tr[data-file]').forEach((row) => {
    row.addEventListener('click', () => {
      state.activeFileName = row.getAttribute('data-file');
      renderTableRows();
      const packet = state.filteredPackets.find((p) => p.file_name === state.activeFileName);
      renderPacketDetail(packet || null);
    });
  });
}

function applyFilter() {
  const q = (el.filterInput?.value || '').trim().toLowerCase();
  const packets = state.data?.packets || [];

  state.filteredPackets = packets.filter((p) => {
    if (!q) return true;
    const text = `${p.title} ${p.display_date || p.meeting_date || ''}`.toLowerCase();
    return text.includes(q);
  });

  if (!state.filteredPackets.find((p) => p.file_name === state.activeFileName)) {
    state.activeFileName = state.filteredPackets[0]?.file_name || null;
  }

  renderTableRows();
  renderPacketDetail(state.filteredPackets.find((p) => p.file_name === state.activeFileName) || null);
}

async function loadDashboard() {
  const response = await fetch('data/board_packets_data.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load board packet dataset.');
  }

  state.data = await response.json();
  state.filteredPackets = state.data.packets || [];
  state.activeFileName = state.filteredPackets[0]?.file_name || null;

  setKpis(state.data.summary || {}, state.data.financial_summary || {});
  destroyCharts();
  createTrendChart(state.data.trend || []);
  createKeywordChart(state.data.finance_keyword_totals || {});
  createScatterChart(state.data.packets || []);
  createBudgetTrendChart(state.data.trend || []);
  createExpenseChart(state.data.top_expense_categories || {});
  createGivingMonthlyChart(state.data.giving_monthly_averages || {});

  renderBudgetDetail();
  renderGivingReport();
  applyFilter();
}

function renderBudgetDetail() {
  if (!el.budgetDetail || !state.data) return;

  const fin = state.data.financial_summary || {};
  const variance = (fin.total_actual_ytd || 0) - (fin.total_budget_ytd || 0);
  const status = variance > 0 ? 'Over Budget' : 'Under Budget';
  const color = variance > 0 ? '#ef4444' : '#10b981';

  el.budgetDetail.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
      <div>
        <p><strong>Budget YTD:</strong> ${moneyFmt.format(fin.total_budget_ytd || 0)}</p>
        <p><strong>Actual YTD:</strong> ${moneyFmt.format(fin.total_actual_ytd || 0)}</p>
        <p><strong>Variance:</strong> <span style="color: ${color}; font-weight: bold;">${moneyFmt.format(Math.abs(variance))} (${status})</span></p>
      </div>
      <div>
        <p><strong>Average Variance %:</strong> ${numberFmt.format(Math.abs(fin.average_variance_ytd || 0))}%</p>
      </div>
    </div>
  `;
}

function renderGivingReport() {
  if (!el.givingReportTable || !state.data) return;

  const giving = state.data.giving_monthly_averages || {};
  const months = Object.keys(giving).sort();

  if (months.length === 0) {
    el.givingReportTable.innerHTML = '<tr><td colspan="3" style="padding: 0.8rem; text-align: center; color: var(--muted);">No monthly data</td></tr>';
    return;
  }

  const rows = months.map((month) => {
    const pct = giving[month];
    const status = pct >= 100 ? '✓' : '—';
    const color = pct >= 100 ? '#10b981' : '#f59e0b';
    return `
      <tr style="border-bottom: 1px solid var(--line);">
        <td style="padding: 0.8rem;">${month}</td>
        <td style="text-align: right; padding: 0.8rem; font-weight: bold;">${numberFmt.format(Math.round(pct))}%</td>
        <td style="text-align: center; padding: 0.8rem; color: ${color}; font-weight: bold;">${status}</td>
      </tr>
    `;
  }).join('');

  el.givingReportTable.innerHTML = rows;
}

function attachEvents() {
  el.filterInput?.addEventListener('input', applyFilter);
  el.refreshBtn?.addEventListener('click', () => {
    loadDashboard().catch((err) => {
      console.error(err);
      alert('Could not refresh dashboard data.');
    });
  });

  el.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const newTab = tab.getAttribute('data-tab');
      state.activeTab = newTab;
      
      el.tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      el.tabPages.forEach((page) => page.classList.remove('active'));
      document.querySelector(`[data-page="${newTab}"]`)?.classList.add('active');

      // Redraw charts on tab change to fix canvas sizing
      setTimeout(() => {
        Object.values(state.charts).forEach(chart => chart?.resize?.());
      }, 100);
    });
  });
}

attachEvents();
loadDashboard().catch((err) => {
  console.error(err);
  if (el.detail) {
    el.detail.innerHTML = '<h2>Packet Detail</h2><p>Unable to load dashboard data.</p>';
  }
});
