// Church Financial Dashboard - App.js

const FORMAT = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

const FORMAT_DECIMAL = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

let dashboardData = null;
let charts = {};

// Load and initialize dashboard
async function loadDashboard() {
    try {
        const response = await fetch('data/board_packets_data.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        dashboardData = await response.json();

        console.log('Dashboard data loaded:', dashboardData);

        // Update data date
        const date = new Date(dashboardData.generated_at);
        document.getElementById('dataDate').textContent = date.toLocaleDateString();

        // Initialize all data
        populateKpis();
        renderCharts();
        populateTables();
        attachTabEvents();
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

// Populate KPI Cards
function populateKpis() {
    const summary = dashboardData.financial_summary;

    // Overview tab
    document.getElementById('kpi-giving').textContent = FORMAT.format(summary.total_giving_ytd || 0);
    document.getElementById('kpi-budget').textContent = FORMAT.format(summary.total_budget_ytd || 0);
    document.getElementById('kpi-actual').textContent = FORMAT.format(summary.total_actual_ytd || 0);
    document.getElementById('kpi-variance').textContent = FORMAT.format(summary.average_variance_ytd || 0);

    // Weekly Offerings tab
    const weeklyOfferings = dashboardData.packets
        .flatMap(p => p.financial_data.weekly_offerings || [])
        .filter(w => w.offering_amount);
    const avgWeekly = weeklyOfferings.length > 0
        ? weeklyOfferings.reduce((sum, w) => sum + (w.offering_amount || 0), 0) / weeklyOfferings.length
        : 0;
    const weeksOnTarget = weeklyOfferings.filter(w => (w.percent_of_budget || 0) >= 100).length;

    document.getElementById('kpi-avg-weekly').textContent = FORMAT.format(avgWeekly);
    document.getElementById('kpi-weekly-budget').textContent = weeklyOfferings.length > 0
        ? FORMAT.format(weeklyOfferings[0].budget_amount || 0)
        : '$0';
    document.getElementById('kpi-weeks-target').textContent = weeksOnTarget;

    // Balance Sheet tab
    const balanceSheets = dashboardData.packets.map(p => p.financial_data.balance_sheet).filter(b => b);
    const latestBS = balanceSheets.length > 0 ? balanceSheets[balanceSheets.length - 1] : null;
    if (latestBS) {
        document.getElementById('kpi-assets').textContent = FORMAT.format(latestBS.total_assets || 0);
        document.getElementById('kpi-liabilities').textContent = FORMAT.format(latestBS.total_liabilities || 0);
        document.getElementById('kpi-equity').textContent = FORMAT.format(latestBS.total_equity || 0);
        document.getElementById('kpi-debt').textContent = FORMAT.format(latestBS.long_term_debt || 0);

        document.getElementById('bs-current-assets').textContent = FORMAT.format(latestBS.current_assets || 0);
        document.getElementById('bs-fixed-assets').textContent = FORMAT.format(latestBS.fixed_assets || 0);
        document.getElementById('bs-total-assets').textContent = FORMAT.format(latestBS.total_assets || 0);
        document.getElementById('bs-unrestricted').textContent = FORMAT.format(latestBS.unrestricted_funds || 0);
        document.getElementById('bs-restricted').textContent = FORMAT.format(latestBS.restricted_funds || 0);
        document.getElementById('bs-total-equity').textContent = FORMAT.format(latestBS.total_equity || 0);
    }

    // Budget vs Actual tab
    document.getElementById('bva-budget').textContent = FORMAT.format(summary.total_budget_ytd || 0);
    document.getElementById('bva-actual').textContent = FORMAT.format(summary.total_actual_ytd || 0);
    document.getElementById('bva-variance').textContent = FORMAT.format(Math.abs(summary.average_variance_ytd || 0));
    const pctSpent = summary.total_budget_ytd > 0 ? (summary.total_actual_ytd / summary.total_budget_ytd * 100) : 0;
    document.getElementById('bva-spent').textContent = pctSpent.toFixed(1) + '%';

    // Budget Detail tab
    const budgetDetails = dashboardData.packets.map(p => p.financial_data.budget_detail).filter(b => b);
    const latestBD = budgetDetails.length > 0 ? budgetDetails[budgetDetails.length - 1] : null;
    if (latestBD) {
        document.getElementById('bd-total-budget').textContent = FORMAT.format(latestBD.ytd_budget || 0);
        document.getElementById('bd-total-actual').textContent = FORMAT.format(latestBD.ytd_actual || 0);
        document.getElementById('bd-remaining').textContent = FORMAT.format(Math.max(0, (latestBD.ytd_budget || 0) - (latestBD.ytd_actual || 0)));
        const monthlyAvg = (latestBD.ytd_actual || 0) / 12;
        document.getElementById('bd-monthly-avg').textContent = FORMAT.format(monthlyAvg);
    }

    // Financial Tracking tab
    document.getElementById('ft-giving').textContent = FORMAT.format(summary.total_giving_ytd || 0);
    document.getElementById('ft-budget').textContent = FORMAT.format(summary.total_budget_ytd || 0);
    document.getElementById('ft-actual').textContent = FORMAT.format(summary.total_actual_ytd || 0);
    document.getElementById('ft-variance').textContent = FORMAT.format(summary.average_variance_ytd || 0);

    // Giving & Donations tab
    document.getElementById('gd-ytd').textContent = FORMAT.format(summary.total_giving_ytd || 0);
    const monthCount = Object.keys(dashboardData.giving_monthly_averages || {}).length || 12;
    document.getElementById('gd-monthly').textContent = FORMAT.format((summary.total_giving_ytd || 0) / monthCount);
    const givingPct = summary.total_budget_ytd > 0 ? (summary.total_giving_ytd / summary.total_budget_ytd * 100) : 0;
    document.getElementById('gd-pct').textContent = givingPct.toFixed(0) + '%';
}

// Render all charts
function renderCharts() {
    renderTrendChart();
    renderExpenseChart();
    renderMonthlyChart();
    renderBudgetPieChart();
    renderWeeklyOfferingChart();
    renderWeeklyBudgetChart();
    renderAssetsChart();
    renderLiabilitiesChart();
    renderBudgetTrendChart();
    renderBudgetUtilChart();
    renderLineItemChart();
    renderKeywordChart();
    renderScatterChart();
    renderGivingTrendChart();
    renderGivingBarChart();
}

function renderTrendChart() {
    const ctx = document.getElementById('trendChart')?.getContext('2d');
    if (!ctx) return;

    const trend = dashboardData.trend || [];
    const labels = trend.map(t => t.display_date || t.sent_date || 'Unknown');
    const givingData = trend.map(t => t.giving_ytd || 0);

    if (charts.trendChart) charts.trendChart.destroy();
    charts.trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'YTD Giving',
                data: givingData,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.05)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
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
    const ctx = document.getElementById('expenseChart')?.getContext('2d');
    if (!ctx) return;

    const expenses = dashboardData.top_expense_categories || {};
    const labels = Object.keys(expenses);
    const data = Object.values(expenses);

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

function renderMonthlyChart() {
    const ctx = document.getElementById('monthlyChart')?.getContext('2d');
    if (!ctx) return;

    const monthly = dashboardData.giving_monthly_averages || {};
    const labels = Object.keys(monthly);
    const data = Object.values(monthly);

    if (charts.monthlyChart) charts.monthlyChart.destroy();
    charts.monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '% of Budget',
                data,
                backgroundColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderBudgetPieChart() {
    const ctx = document.getElementById('budgetPieChart')?.getContext('2d');
    if (!ctx) return;

    const summary = dashboardData.financial_summary;
    const data = [
        summary.total_budget_ytd || 0,
        Math.max(0, (summary.total_actual_ytd || 0) - (summary.total_budget_ytd || 0))
    ];

    if (charts.budgetPieChart) charts.budgetPieChart.destroy();
    charts.budgetPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Budget', 'Over Budget'],
            datasets: [{
                data,
                backgroundColor: ['#2563eb', '#ef4444']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderWeeklyOfferingChart() {
    const ctx = document.getElementById('weeklyOfferingChart')?.getContext('2d');
    if (!ctx) return;

    const weekly = dashboardData.packets
        .flatMap(p => p.financial_data.weekly_offerings || [])
        .filter(w => w.offering_amount);

    if (charts.weeklyOfferingChart) charts.weeklyOfferingChart.destroy();
    charts.weeklyOfferingChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weekly.map((_, i) => `Week ${i + 1}`),
            datasets: [{
                label: 'Weekly Offering',
                data: weekly.map(w => w.offering_amount || 0),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderWeeklyBudgetChart() {
    const ctx = document.getElementById('weeklyBudgetChart')?.getContext('2d');
    if (!ctx) return;

    const weekly = dashboardData.packets
        .flatMap(p => p.financial_data.weekly_offerings || [])
        .filter(w => w.offering_amount);

    if (charts.weeklyBudgetChart) charts.weeklyBudgetChart.destroy();
    charts.weeklyBudgetChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weekly.map((_, i) => `Week ${i + 1}`),
            datasets: [
                {
                    label: 'Offering',
                    data: weekly.map(w => w.offering_amount || 0),
                    backgroundColor: '#2563eb'
                },
                {
                    label: 'Budget',
                    data: weekly.map(w => w.budget_amount || 0),
                    backgroundColor: '#e2e8f0'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderAssetsChart() {
    const ctx = document.getElementById('assetsChart')?.getContext('2d');
    if (!ctx) return;

    const bs = dashboardData.packets
        .map(p => p.financial_data.balance_sheet)
        .filter(b => b)[0] || { current_assets: 0, fixed_assets: 0 };

    if (charts.assetsChart) charts.assetsChart.destroy();
    charts.assetsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Current Assets', 'Fixed Assets'],
            datasets: [{
                data: [bs.current_assets || 0, bs.fixed_assets || 0],
                backgroundColor: ['#2563eb', '#f59e0b']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderLiabilitiesChart() {
    const ctx = document.getElementById('liabilitiesChart')?.getContext('2d');
    if (!ctx) return;

    const bs = dashboardData.packets
        .map(p => p.financial_data.balance_sheet)
        .filter(b => b)[0] || { current_liabilities: 0, long_term_debt: 0 };

    if (charts.liabilitiesChart) charts.liabilitiesChart.destroy();
    charts.liabilitiesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Current Liabilities', 'Long-term Debt'],
            datasets: [{
                data: [bs.current_liabilities || 0, bs.long_term_debt || 0],
                backgroundColor: ['#ef4444', '#f59e0b']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderBudgetTrendChart() {
    const ctx = document.getElementById('budgetTrendChart')?.getContext('2d');
    if (!ctx) return;

    const trend = dashboardData.trend || [];

    if (charts.budgetTrendChart) charts.budgetTrendChart.destroy();
    charts.budgetTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trend.map(t => t.display_date || 'Unknown'),
            datasets: [
                {
                    label: 'Budget',
                    data: trend.map(t => t.budget_ytd || 0),
                    borderColor: '#2563eb',
                    tension: 0.4
                },
                {
                    label: 'Actual',
                    data: trend.map(t => t.actual_ytd || 0),
                    borderColor: '#ef4444',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderBudgetUtilChart() {
    const ctx = document.getElementById('budgetUtilChart')?.getContext('2d');
    if (!ctx) return;

    const summary = dashboardData.financial_summary;
    const pctSpent = summary.total_budget_ytd > 0 ? (summary.total_actual_ytd / summary.total_budget_ytd * 100) : 0;

    if (charts.budgetUtilChart) charts.budgetUtilChart.destroy();
    charts.budgetUtilChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Spent', 'Remaining'],
            datasets: [{
                data: [Math.min(pctSpent, 100), Math.max(0, 100 - pctSpent)],
                backgroundColor: [pctSpent > 100 ? '#ef4444' : '#10b981', '#e2e8f0']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderLineItemChart() {
    const ctx = document.getElementById('lineItemChart')?.getContext('2d');
    if (!ctx) return;

    const bd = dashboardData.packets
        .map(p => p.financial_data.budget_detail)
        .filter(b => b && b.line_items && b.line_items.length > 0)[0];

    if (!bd || !bd.line_items) return;

    const labels = bd.line_items.map(li => li[0]);
    const budgets = bd.line_items.map(li => li[1] || 0);
    const actuals = bd.line_items.map(li => li[2] || 0);

    if (charts.lineItemChart) charts.lineItemChart.destroy();
    charts.lineItemChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Budget', data: budgets, backgroundColor: '#2563eb' },
                { label: 'Actual', data: actuals, backgroundColor: '#f59e0b' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y'
        }
    });
}

function renderKeywordChart() {
    const ctx = document.getElementById('keywordChart')?.getContext('2d');
    if (!ctx) return;

    const keywords = dashboardData.finance_keyword_totals || {};
    const labels = Object.keys(keywords).slice(0, 8);
    const data = labels.map(k => keywords[k]);

    if (charts.keywordChart) charts.keywordChart.destroy();
    charts.keywordChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Frequency',
                data,
                backgroundColor: '#8b5cf6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderScatterChart() {
    const ctx = document.getElementById('scatterChart')?.getContext('2d');
    if (!ctx) return;

    const trend = dashboardData.trend || [];
    const data = trend.map(t => ({
        x: t.currency_mentions || 0,
        y: t.finance_score || 0
    }));

    if (charts.scatterChart) charts.scatterChart.destroy();
    charts.scatterChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Finance Score vs Mentions',
                data,
                backgroundColor: '#ec4899'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Currency Mentions' } },
                y: { title: { display: true, text: 'Finance Score' } }
            }
        }
    });
}

function renderGivingTrendChart() {
    const ctx = document.getElementById('givingTrendChart')?.getContext('2d');
    if (!ctx) return;

    const trend = dashboardData.trend || [];

    if (charts.givingTrendChart) charts.givingTrendChart.destroy();
    charts.givingTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trend.map(t => t.display_date || 'Unknown'),
            datasets: [{
                label: 'YTD Giving',
                data: trend.map(t => t.giving_ytd || 0),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderGivingBarChart() {
    const ctx = document.getElementById('givingBarChart')?.getContext('2d');
    if (!ctx) return;

    const monthly = dashboardData.giving_monthly_averages || {};
    const labels = Object.keys(monthly);
    const data = Object.values(monthly);

    if (charts.givingBarChart) charts.givingBarChart.destroy();
    charts.givingBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '% of Budget',
                data,
                backgroundColor: data.map(v => v >= 100 ? '#10b981' : '#f59e0b')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Populate Tables
function populateTables() {
    populateRecentPacketsTable();
    populateWeeklyOfferingsTable();
    populateBalanceSheetTable();
    populateBudgetSummaryTable();
    populateBudgetDetailTable();
    populateFinancialSummaryTable();
    populateGivingReportTable();
    populatePacketsTable();
}

function populateRecentPacketsTable() {
    const tbody = document.getElementById('recentPacketsTable')?.querySelector('tbody');
    if (!tbody) return;

    const recent = (dashboardData.packets || []).slice(-5);
    tbody.innerHTML = recent.map(p => `
        <tr>
            <td>${p.display_date || p.sent_date || 'N/A'}</td>
            <td>${p.title}</td>
            <td>${p.page_count}</td>
            <td>${p.currency_mentions}</td>
            <td>${p.finance_score}</td>
        </tr>
    `).join('');
}

function populateWeeklyOfferingsTable() {
    const tbody = document.getElementById('weeklyOfferingsTable')?.querySelector('tbody');
    if (!tbody) return;

    const weekly = dashboardData.packets
        .flatMap(p => p.financial_data.weekly_offerings || [])
        .filter(w => w.offering_amount);

    tbody.innerHTML = weekly.map((w, i) => {
        const status = (w.percent_of_budget || 0) >= 100 ? 'On Target' : 'Below Target';
        const statusClass = (w.percent_of_budget || 0) >= 100 ? 'status-good' : 'status-warning';
        return `
            <tr>
                <td>Week ${i + 1}</td>
                <td>${FORMAT.format(w.offering_amount || 0)}</td>
                <td>${FORMAT.format(w.budget_amount || 0)}</td>
                <td>${(w.percent_of_budget || 0).toFixed(1)}%</td>
                <td><span class="${statusClass}">${status}</span></td>
            </tr>
        `;
    }).join('');
}

function populateBalanceSheetTable() {
    const tbody = document.getElementById('balanceSheetTable')?.querySelector('tbody');
    if (!tbody) return;

    const bs = dashboardData.packets
        .map(p => p.financial_data.balance_sheet)
        .filter(b => b)[0];

    if (!bs) return;

    const total = bs.total_assets || 0;
    const items = [
        ['Current Assets', bs.current_assets || 0],
        ['Fixed Assets', bs.fixed_assets || 0],
        ['Current Liabilities', bs.current_liabilities || 0],
        ['Long-term Debt', bs.long_term_debt || 0]
    ];

    tbody.innerHTML = items.map(([name, amount]) => {
        const pct = total > 0 ? (amount / total * 100).toFixed(1) : 0;
        return `
            <tr>
                <td>${name}</td>
                <td class="amount">${FORMAT.format(amount)}</td>
                <td style="text-align: right;">${pct}%</td>
            </tr>
        `;
    }).join('');
}

function populateBudgetSummaryTable() {
    const tbody = document.getElementById('budgetSummaryTable')?.querySelector('tbody');
    if (!tbody) return;

    const summary = dashboardData.financial_summary;
    const variance = summary.average_variance_ytd || 0;
    const status = variance >= 0 ? '<span class="status-good">Positive</span>' : '<span class="status-danger">Negative</span>';

    tbody.innerHTML = `
        <tr>
            <td>YTD Budget</td>
            <td class="amount">${FORMAT.format(summary.total_budget_ytd || 0)}</td>
            <td class="amount">${FORMAT.format(summary.total_budget_ytd || 0)}</td>
            <td class="amount">$0</td>
            <td>—</td>
        </tr>
        <tr>
            <td>YTD Actual</td>
            <td class="amount">${FORMAT.format(summary.total_budget_ytd || 0)}</td>
            <td class="amount">${FORMAT.format(summary.total_actual_ytd || 0)}</td>
            <td class="amount">${FORMAT.format(Math.abs(variance))}</td>
            <td>${status}</td>
        </tr>
    `;
}

function populateBudgetDetailTable() {
    const tbody = document.getElementById('budgetDetailTable')?.querySelector('tbody');
    if (!tbody) return;

    const bd = dashboardData.packets
        .map(p => p.financial_data.budget_detail)
        .filter(b => b && b.line_items)[0];

    if (!bd || !bd.line_items) return;

    tbody.innerHTML = bd.line_items.map(([name, budget, actual]) => {
        const variance = actual - budget;
        const pctUsed = budget > 0 ? (actual / budget * 100) : 0;
        const status = pctUsed > 100 ? '<span class="status-danger">Over</span>' : '<span class="status-good">Under</span>';

        return `
            <tr>
                <td>${name}</td>
                <td class="amount">${FORMAT.format(budget)}</td>
                <td class="amount">${FORMAT.format(actual)}</td>
                <td class="amount" style="color: ${variance > 0 ? '#ef4444' : '#10b981'};">${FORMAT.format(variance)}</td>
                <td>${pctUsed.toFixed(1)}%</td>
                <td>${status}</td>
            </tr>
        `;
    }).join('');
}

function populateFinancialSummaryTable() {
    const tbody = document.getElementById('financialSummaryBody');
    if (!tbody) return;

    const summary = dashboardData.financial_summary;
    const variance = summary.average_variance_ytd || 0;

    tbody.innerHTML = `
        <tr>
            <td>YTD Giving</td>
            <td>${FORMAT.format(summary.total_giving_ytd || 0)}</td>
            <td><span class="status-good">✓</span></td>
        </tr>
        <tr>
            <td>YTD Budget</td>
            <td>${FORMAT.format(summary.total_budget_ytd || 0)}</td>
            <td>—</td>
        </tr>
        <tr>
            <td>YTD Actual Spend</td>
            <td>${FORMAT.format(summary.total_actual_ytd || 0)}</td>
            <td>—</td>
        </tr>
        <tr>
            <td><strong>Budget Variance</strong></td>
            <td><strong>${FORMAT.format(variance)}</strong></td>
            <td><strong>${variance >= 0 ? '<span class="status-good">Positive</span>' : '<span class="status-danger">Negative</span>'}</strong></td>
        </tr>
    `;
}

function populateGivingReportTable() {
    const tbody = document.getElementById('givingReportBody');
    if (!tbody) return;

    const monthly = dashboardData.giving_monthly_averages || {};
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    tbody.innerHTML = months.map(month => {
        const pct = monthly[month] || 0;
        const status = pct >= 100 ? '<span class="status-good">✓ On Target</span>' : '<span class="status-warning">Below Target</span>';
        return `
            <tr>
                <td>${month}</td>
                <td>${pct.toFixed(1)}%</td>
                <td>${status}</td>
            </tr>
        `;
    }).join('');
}

function populatePacketsTable() {
    const tbody = document.getElementById('packetsTable')?.querySelector('tbody');
    if (!tbody) return;

    const packets = dashboardData.packets || [];
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

// Tab Navigation
function attachTabEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    const tab = document.getElementById(tabName);
    if (tab) {
        tab.classList.add('active');
    }

    // Mark button as active
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if (btn) {
        btn.classList.add('active');
    }

    // Trigger chart refresh
    setTimeout(() => {
        Object.values(charts).forEach(chart => {
            if (chart && chart.resize) chart.resize();
        });
    }, 100);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', loadDashboard);
