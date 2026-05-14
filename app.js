// Church Financial Dashboard - Simplified App.js
console.log('✓ App.js started loading');

const FORMAT = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

let dashboardData = null;
let charts = {};

// Simple format number
function formatMoney(num) {
    return FORMAT.format(num || 0);
}

// Load Dashboard
async function loadDashboard() {
    console.log('Loading dashboard...');
    try {
        const response = await fetch('data/board_packets_data.json');
        console.log('Fetch response:', response.status);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
        }
        
        dashboardData = await response.json();
        console.log('✓ Data loaded:', dashboardData);

        // Update data date
        if (dashboardData.generated_at) {
            const date = new Date(dashboardData.generated_at);
            const dateEl = document.getElementById('dataDate');
            if (dateEl) dateEl.textContent = date.toLocaleDateString();
        }

        // Populate KPIs
        populateKpis();
        console.log('✓ KPIs populated');

        // Render Charts
        setTimeout(() => {
            renderCharts();
            console.log('✓ Charts rendered');
        }, 100);

        // Populate Tables
        setTimeout(() => {
            populateTables();
            console.log('✓ Tables populated');
        }, 200);

        // Attach Events
        attachTabEvents();
        console.log('✓ Events attached');

    } catch (error) {
        console.error('❌ Error loading dashboard:', error);
        showError(error.message);
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position: fixed; top: 20px; left: 20px; background: #ef4444; color: white; padding: 20px; border-radius: 8px; z-index: 10000; font-family: monospace; font-size: 12px;';
    errorDiv.textContent = '❌ ' + message;
    document.body.appendChild(errorDiv);
}

// Populate KPIs
function populateKpis() {
    if (!dashboardData || !dashboardData.financial_summary) {
        console.warn('No financial summary data');
        return;
    }

    const summary = dashboardData.financial_summary;

    // Helper to set KPI
    const setKpi = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatMoney(value || 0);
    };

    // Overview tab
    setKpi('kpi-giving', summary.total_giving_ytd);
    setKpi('kpi-budget', summary.total_budget_ytd);
    setKpi('kpi-actual', summary.total_actual_ytd);
    setKpi('kpi-variance', summary.average_variance_ytd);

    // Budget vs Actual
    setKpi('bva-budget', summary.total_budget_ytd);
    setKpi('bva-actual', summary.total_actual_ytd);
    setKpi('bva-variance', Math.abs(summary.average_variance_ytd || 0));

    const pctSpent = summary.total_budget_ytd > 0 
        ? (summary.total_actual_ytd / summary.total_budget_ytd * 100).toFixed(1)
        : 0;
    const el = document.getElementById('bva-spent');
    if (el) el.textContent = pctSpent + '%';

    // Balance Sheet
    const bs = dashboardData.packets?.[0]?.financial_data?.balance_sheet;
    if (bs) {
        setKpi('kpi-assets', bs.total_assets);
        setKpi('kpi-liabilities', bs.total_liabilities);
        setKpi('kpi-equity', bs.total_equity);
        setKpi('kpi-debt', bs.long_term_debt);
        
        setKpi('bs-current-assets', bs.current_assets);
        setKpi('bs-fixed-assets', bs.fixed_assets);
        setKpi('bs-total-assets', bs.total_assets);
        setKpi('bs-unrestricted', bs.unrestricted_funds);
        setKpi('bs-restricted', bs.restricted_funds);
        setKpi('bs-total-equity', bs.total_equity);
    }

    console.log('KPIs populated successfully');
}

// Render Charts
function renderCharts() {
    try {
        renderTrendChart();
        renderExpenseChart();
        renderBudgetTrendChart();
    } catch (e) {
        console.error('Chart error:', e);
    }
}

function renderTrendChart() {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const trend = dashboardData.trend || [];
    const labels = trend.map((t, i) => `Packet ${i + 1}`);
    const data = trend.map(t => t.giving_ytd || 0);

    if (charts.trendChart) charts.trendChart.destroy();
    charts.trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'YTD Giving',
                data,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } }
        }
    });
}

function renderExpenseChart() {
    const canvas = document.getElementById('expenseChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const expenses = dashboardData.top_expense_categories || {};
    const labels = Object.keys(expenses).slice(0, 5);
    const data = labels.map(k => expenses[k]);

    if (charts.expenseChart) charts.expenseChart.destroy();
    charts.expenseChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Amount',
                data,
                backgroundColor: '#f59e0b'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y'
        }
    });
}

function renderBudgetTrendChart() {
    const canvas = document.getElementById('budgetTrendChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const trend = dashboardData.trend || [];
    const labels = trend.map((t, i) => `Packet ${i + 1}`);

    if (charts.budgetTrendChart) charts.budgetTrendChart.destroy();
    charts.budgetTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Budget',
                    data: trend.map(t => t.budget_ytd || 0),
                    borderColor: '#2563eb'
                },
                {
                    label: 'Actual',
                    data: trend.map(t => t.actual_ytd || 0),
                    borderColor: '#ef4444'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Populate Tables
function populateTables() {
    populateRecentPackets();
    populatePacketsTable();
}

function populateRecentPackets() {
    const tbody = document.getElementById('recentPacketsTable')?.querySelector('tbody');
    if (!tbody || !dashboardData.packets) return;

    const packets = dashboardData.packets.slice(-5);
    tbody.innerHTML = packets.map(p => `
        <tr>
            <td>${p.display_date || p.sent_date || 'N/A'}</td>
            <td>${p.title}</td>
            <td>${p.page_count}</td>
            <td>${p.currency_mentions}</td>
            <td>${p.finance_score}</td>
        </tr>
    `).join('');
}

function populatePacketsTable() {
    const tbody = document.getElementById('packetsTable')?.querySelector('tbody');
    if (!tbody || !dashboardData.packets) return;

    tbody.innerHTML = dashboardData.packets.map(p => `
        <tr>
            <td>${p.display_date || p.sent_date || 'N/A'}</td>
            <td>${p.title}</td>
            <td>${p.page_count}</td>
            <td>${p.currency_mentions}</td>
            <td>${p.finance_score}</td>
        </tr>
    `).join('');
}

// Tab Events
function attachTabEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    console.log('Tab events attached');
}

function switchTab(tabName) {
    // Hide all
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected
    const tab = document.getElementById(tabName);
    if (tab) tab.classList.add('active');

    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');

    // Refresh charts
    setTimeout(() => {
        Object.values(charts).forEach(chart => {
            if (chart?.resize) chart.resize();
        });
    }, 100);
}

// Initialize
console.log('Registering DOMContentLoaded listener');
document.addEventListener('DOMContentLoaded', () => {
    console.log('✓ DOMContentLoaded fired');
    loadDashboard();
});

console.log('✓ App.js fully loaded');
