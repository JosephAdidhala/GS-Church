let charts = {};

const MONTHS_ORDER = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MARCH_FACTS = [
    ['Giving', 'January Offering', '$444,036 (111% of budget)'],
    ['Giving', 'February Offering', '$359,534 (90% of budget)'],
    ['Giving', 'YTD Giving', '$2,959,449 (106.6% of budget)'],
    ['Operating', 'YTD Actual vs Budget', '$2,734,619 vs $2,454,814'],
    ['Operating', 'Net Budget Impact', '+$366,168'],
    ['School', 'Projected Net Loss', '-$58,939'],
    ['School', 'Enrollment Trigger', 'Need 6 second graders by May 1, 2025'],
    ['Liquidity', 'General Operating Cash', 'Up about $95K'],
    ['Liquidity', 'Unrestricted Cash', 'Up about $65K'],
    ['Capital', 'Membrane Roof', '$49K–$55K vs expected $50K–$70K'],
    ['Capital', 'Elevator', 'Expected just under $9K'],
    ['Capital', '100s/200s Bathrooms', '$100K–$120K; timeline tied to school breaks'],
    ['Missions', 'Shelter From The Storm', 'Entire Sunday offering planned for Sep 28, 2025']
];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const money = (v) => isNum(v)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
    : 'N/A';
const pct = (n, d, decimals = 1) => (isNum(n) && isNum(d) && d > 0) ? `${((n / d) * 100).toFixed(decimals)}%` : 'N/A';

function byId(id) {
    return document.getElementById(id);
}

function statusBadge(ok) {
    return ok
        ? '<span class="badge ok">Available</span>'
        : '<span class="badge na">Missing</span>';
}

function countCompleteness(packet) {
    const fd = packet?.financial_data || {};
    const hasBudget = isNum(fd.budget_ytd) && isNum(fd.actual_ytd);
    const hasGiving = fd.giving_monthly && Object.keys(fd.giving_monthly).length > 0;
    const bs = fd.balance_sheet || {};
    const hasBalance = Object.values(bs).some(isNum);
    const hasWeekly = Array.isArray(fd.weekly_offerings) && fd.weekly_offerings.length > 0;
    return [hasBudget, hasGiving, hasBalance, hasWeekly].filter(Boolean).length;
}

function renderOverview(data) {
    const summary = data.financial_summary || {};
    const packets = data.packets || [];

    byId('generatedAt').textContent = data.generated_at ? new Date(data.generated_at).toLocaleDateString() : 'N/A';
    byId('packetCount').textContent = String(data.summary?.packet_count ?? packets.length ?? 'N/A');
    byId('pageCount').textContent = String(data.summary?.total_pages ?? 'N/A');

    byId('kpiGiving').textContent = money(summary.total_giving_ytd);
    byId('kpiBudget').textContent = money(summary.total_budget_ytd);
    byId('kpiActual').textContent = money(summary.total_actual_ytd);
    byId('kpiVariance').textContent = money(summary.average_variance_ytd);
    byId('kpiBudgetAttainment').textContent = pct(summary.total_actual_ytd, summary.total_budget_ytd);

    const maxCompleteness = packets.length * 4;
    const score = packets.reduce((acc, p) => acc + countCompleteness(p), 0);
    byId('kpiCompleteness').textContent = maxCompleteness > 0 ? `${Math.round((score / maxCompleteness) * 100)}%` : 'N/A';
}

function renderTables(data) {
    const packets = data.packets || [];

    const packetsBody = byId('packetsTable')?.querySelector('tbody');
    if (packetsBody) {
        packetsBody.innerHTML = packets.map(p => `
            <tr>
                <td>${p.display_date || 'N/A'}</td>
                <td>${p.title || 'N/A'}</td>
                <td>${isNum(p.page_count) ? p.page_count : 'N/A'}</td>
                <td>${isNum(p.currency_mentions) ? p.currency_mentions : 'N/A'}</td>
                <td>${isNum(p.finance_score) ? p.finance_score : 'N/A'}</td>
            </tr>
        `).join('');
    }

    const qualityBody = byId('qualityTable')?.querySelector('tbody');
    if (qualityBody) {
        qualityBody.innerHTML = packets.map(p => {
            const fd = p.financial_data || {};
            const bs = fd.balance_sheet || {};
            const hasBudget = isNum(fd.budget_ytd) && isNum(fd.actual_ytd);
            const hasGiving = fd.giving_monthly && Object.keys(fd.giving_monthly).length > 0;
            const hasBalance = Object.values(bs).some(isNum);
            const hasWeekly = Array.isArray(fd.weekly_offerings) && fd.weekly_offerings.length > 0;
            return `
                <tr>
                    <td>${p.display_date || 'N/A'}</td>
                    <td>${p.title || 'N/A'}</td>
                    <td>${statusBadge(hasBudget)}</td>
                    <td>${statusBadge(hasGiving)}</td>
                    <td>${statusBadge(hasBalance)}</td>
                    <td>${statusBadge(hasWeekly)}</td>
                </tr>
            `;
        }).join('');
    }

    const marchBody = byId('marchFactsTable')?.querySelector('tbody');
    if (marchBody) {
        marchBody.innerHTML = MARCH_FACTS.map(([area, metric, value]) => `
            <tr><td>${area}</td><td>${metric}</td><td>${value}</td></tr>
        `).join('');
    }

    const flags = byId('riskFlags');
    if (flags) {
        flags.innerHTML = [
            '<li class="flag-warn">February giving dropped from 111% to 90% of budget. Maintain weekly monitoring despite strong YTD.</li>',
            '<li class="flag-bad">School remains at projected net loss (-$58,939) with enrollment dependency by May 1, 2025.</li>',
            '<li class="flag-warn">Bathroom renovation is a $100K+ commitment with schedule constraints linked to school closure windows.</li>',
            '<li class="flag-warn">Sep 28, 2025 full-offering missions event may pressure operating liquidity if replacement giving is not planned.</li>',
            '<li class="flag-good">Roof project landed at or below expected cost band and mortgage debt trend is declining.</li>'
        ].join('');
    }
}

function renderCharts(data) {
    const trend = data.trend || [];
    const monthly = data.giving_monthly_averages || {};
    const expenses = data.top_expense_categories || {};
    const packets = data.packets || [];

    const trendRows = trend.filter(t => isNum(t.budget_ytd) && isNum(t.actual_ytd));
    const trendLabels = trendRows.map((t, i) => t.display_date || `P${i + 1}`);

    const budgetCtx = byId('budgetActualTrend');
    if (budgetCtx && typeof Chart !== 'undefined') {
        charts.budget?.destroy();
        charts.budget = new Chart(budgetCtx, {
            type: 'line',
            data: {
                labels: trendLabels,
                datasets: [
                    { label: 'Budget YTD', data: trendRows.map(t => t.budget_ytd), borderColor: '#1d4ed8', tension: 0.25 },
                    { label: 'Actual YTD', data: trendRows.map(t => t.actual_ytd), borderColor: '#dc2626', tension: 0.25 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const expenseLabels = Object.keys(expenses).filter(k => isNum(expenses[k]));
    const expenseCtx = byId('expenseBreakdown');
    if (expenseCtx && typeof Chart !== 'undefined') {
        charts.expenses?.destroy();
        charts.expenses = new Chart(expenseCtx, {
            type: 'doughnut',
            data: {
                labels: expenseLabels,
                datasets: [{
                    data: expenseLabels.map(k => expenses[k]),
                    backgroundColor: ['#1d4ed8', '#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const monthlyLabels = MONTHS_ORDER.filter(m => isNum(monthly[m]));
    const monthlyCtx = byId('givingMonthly');
    if (monthlyCtx && typeof Chart !== 'undefined') {
        charts.monthly?.destroy();
        charts.monthly = new Chart(monthlyCtx, {
            type: 'bar',
            data: {
                labels: monthlyLabels,
                datasets: [{ label: '% of Budget', data: monthlyLabels.map(m => monthly[m]), backgroundColor: '#2563eb' }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    const coverageCtx = byId('coverageChart');
    if (coverageCtx && typeof Chart !== 'undefined') {
        charts.coverage?.destroy();
        const labels = packets.map((p, i) => p.display_date || `P${i + 1}`);
        charts.coverage = new Chart(coverageCtx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Completeness (0-4)',
                    data: packets.map(countCompleteness),
                    backgroundColor: '#0ea5e9'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 4 }
                }
            }
        });
    }
}

async function initDashboard() {
    try {
        const res = await fetch('data/board_packets_data.json');
        if (!res.ok) throw new Error(`Unable to load data (${res.status})`);
        const data = await res.json();

        renderOverview(data);
        renderTables(data);
        renderCharts(data);
    } catch (err) {
        console.error(err);
        byId('footerNote').textContent = `Load error: ${err.message}`;
    }
}

window.addEventListener('DOMContentLoaded', initDashboard);
