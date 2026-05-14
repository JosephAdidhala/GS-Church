// SIMPLE WORKING DASHBOARD
let data = null;
let charts = {};
const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const moneyOrNA = (v) => isNum(v) ? fmt(v) : 'N/A';
const textOrNA = (v) => (v === null || v === undefined || v === '') ? 'N/A' : String(v);

// Load and render dashboard
async function loadDashboard() {
    try {
        const r = await fetch('data/board_packets_data.json');
        if (!r.ok) throw new Error(`Failed to load data (${r.status})`);
        data = await r.json();
        render();
    } catch(e) {
        console.error('Error:', e);
        alert('Error loading data: ' + e.message);
    }
}

function render() {
    if (!data || !data.financial_summary) return;
    
    const s = data.financial_summary;
    const pkts = data.packets || [];
    
    // KPI Cards - Overview
    setMoney('kpi-giving', s.total_giving_ytd);
    setMoney('kpi-budget', s.total_budget_ytd);
    setMoney('kpi-actual', s.total_actual_ytd);
    setMoney('kpi-variance', s.average_variance_ytd);
    
    // Budget vs Actual
    setMoney('bva-budget', s.total_budget_ytd);
    setMoney('bva-actual', s.total_actual_ytd);
    setMoney('bva-variance', isNum(s.average_variance_ytd) ? Math.abs(s.average_variance_ytd) : null);
    setPercent('bva-spent', s.total_actual_ytd, s.total_budget_ytd, 1);
    
    // Financial Tracking
    setMoney('ft-giving', s.total_giving_ytd);
    setMoney('ft-budget', s.total_budget_ytd);
    setMoney('ft-actual', s.total_actual_ytd);
    setMoney('ft-variance', s.average_variance_ytd);
    
    // Giving
    setMoney('gd-ytd', s.total_giving_ytd);
    setMoney('gd-monthly', isNum(s.total_giving_ytd) ? (s.total_giving_ytd / 12) : null);
    setPercent('gd-pct', s.total_giving_ytd, s.total_budget_ytd, 0);
    
    // Recent packets
    const t1 = el('recentPacketsTable')?.querySelector('tbody');
    if (t1) {
        t1.innerHTML = pkts.slice(-5).map(p =>
            `<tr><td>${textOrNA(p.display_date)}</td><td>${textOrNA(p.title)}</td><td>${textOrNA(p.page_count)}</td><td>${textOrNA(p.currency_mentions)}</td><td>${textOrNA(p.finance_score)}</td></tr>`
        ).join('');
    }
    
    // All packets
    const t2 = el('packetsTable')?.querySelector('tbody');
    if (t2) {
        t2.innerHTML = pkts.map(p =>
            `<tr><td>${textOrNA(p.display_date)}</td><td>${textOrNA(p.title)}</td><td>${textOrNA(p.page_count)}</td><td>${textOrNA(p.currency_mentions)}</td><td>${textOrNA(p.finance_score)}</td></tr>`
        ).join('');
    }
    
    // Budget summary
    const t3 = el('budgetSummaryTable')?.querySelector('tbody');
    if (t3) {
        const budget = isNum(s.total_budget_ytd) ? s.total_budget_ytd : null;
        const actual = isNum(s.total_actual_ytd) ? s.total_actual_ytd : null;
        const variance = (isNum(actual) && isNum(budget)) ? (actual - budget) : null;
        t3.innerHTML = `<tr><td>Total</td><td class="amount">${moneyOrNA(budget)}</td><td class="amount">${moneyOrNA(actual)}</td><td class="amount">${moneyOrNA(variance)}</td><td>${isNum(variance) ? (variance >= 0 ? 'Over' : 'Under') : 'N/A'}</td></tr>`;
    }
    
    // Giving report
    const giving = data.giving_monthly_averages || {};
    const t4 = el('givingReportBody');
    if (t4) {
        t4.innerHTML = MONTHS_SHORT.map((m, i) => {
            const pct = giving[MONTHS_FULL[i]];
            return `<tr><td>${m}</td><td>${isNum(pct) ? `${pct.toFixed(1)}%` : 'N/A'}</td><td>${isNum(pct) ? (pct >= 100 ? '✓' : '−') : 'N/A'}</td></tr>`;
        }).join('');
    }
    
    // Charts
    setTimeout(renderCharts, 50);
}

function setMoney(id, val) {
    const e = el(id);
    if (e) e.textContent = moneyOrNA(val);
}

function setPercent(id, numerator, denominator, decimals = 1) {
    const e = el(id);
    if (!e) return;
    if (!isNum(numerator) || !isNum(denominator) || denominator <= 0) {
        e.textContent = 'N/A';
        return;
    }
    e.textContent = `${((numerator / denominator) * 100).toFixed(decimals)}%`;
}

function el(id) {
    return document.getElementById(id);
}

function renderCharts() {
    if (!data.trend) return;
    
    const trend = data.trend;
    const givingSeries = trend
        .map((x, i) => ({ label: x.display_date || `P${i + 1}`, value: x.giving_ytd }))
        .filter(x => isNum(x.value));
    const budgetSeries = trend
        .map((x, i) => ({ label: x.display_date || `P${i + 1}`, budget: x.budget_ytd, actual: x.actual_ytd }))
        .filter(x => isNum(x.budget) && isNum(x.actual));
    
    // Trend
    const t = el('trendChart');
    if (t && typeof Chart !== 'undefined') {
        if (charts.trend) charts.trend.destroy();
        try {
            if (givingSeries.length === 0) return;
            charts.trend = new Chart(t, {
                type: 'line',
                data: {
                    labels: givingSeries.map(x => x.label),
                    datasets: [{
                        label: 'Giving',
                        data: givingSeries.map(x => x.value),
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } } }
            });
        } catch(e) { console.log('Chart error:', e); }
    }
    
    // Expenses
    const exp = el('expenseChart');
    if (exp && data.top_expense_categories && typeof Chart !== 'undefined') {
        if (charts.exp) charts.exp.destroy();
        const exp_labels = Object.keys(data.top_expense_categories)
            .filter(k => isNum(data.top_expense_categories[k]))
            .slice(0, 5);
        try {
            if (exp_labels.length === 0) return;
            charts.exp = new Chart(exp, {
                type: 'bar',
                data: {
                    labels: exp_labels,
                    datasets: [{ label: 'Amount', data: exp_labels.map(k => data.top_expense_categories[k]), backgroundColor: '#f59e0b' }]
                },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
            });
        } catch(e) { console.log('Chart error:', e); }
    }
    
    // Budget
    const bud = el('budgetTrendChart');
    if (bud && typeof Chart !== 'undefined') {
        if (charts.bud) charts.bud.destroy();
        try {
            if (budgetSeries.length === 0) return;
            charts.bud = new Chart(bud, {
                type: 'line',
                data: {
                    labels: budgetSeries.map(x => x.label),
                    datasets: [
                        { label: 'Budget', data: budgetSeries.map(x => x.budget), borderColor: '#2563eb', tension: 0.3 },
                        { label: 'Actual', data: budgetSeries.map(x => x.actual), borderColor: '#ef4444', tension: 0.3 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        } catch(e) { console.log('Chart error:', e); }
    }
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const tab = btn.getAttribute('data-tab');
        const t = el(tab);
        if (t) t.classList.add('active');
        btn.classList.add('active');
        setTimeout(() => {
            Object.values(charts).forEach(c => c?.resize?.());
        }, 100);
    });
});

// Start
window.addEventListener('DOMContentLoaded', loadDashboard);
if (document.readyState !== 'loading') loadDashboard();
