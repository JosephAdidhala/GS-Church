let charts = {};

const MONTHS_ORDER = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const AI_PROMPT = `Act as a Senior Church Financial Consultant. I am providing you with a dataset of church offerings and expenses for the last 12 months.

Please analyze the following:
1. Trend Analysis: Did offerings go up or down? Identify specific months of significant change and hypothesize potential reasons (e.g., seasonality, holidays).
2. Giving Stability: Calculate the ratio of recurring vs. one-time gifts and what that means for our financial predictability.
3. Efficiency: Compare our total giving to our personnel and operating expenses. Are we top-heavy on staff costs?
4. Action Plan: Based on these numbers, give 3 specific recommendations to increase donor retention and 2 ways to optimize current spending.

Format the output as an Executive Summary for a Board of Elders meeting.`;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const money = (v) => isNum(v)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
    : 'N/A';
const percent = (n, d, decimals = 1) => (isNum(n) && isNum(d) && d > 0) ? `${((n / d) * 100).toFixed(decimals)}%` : 'N/A';
const monthlyFromYtd = (v) => isNum(v) ? v / 12 : null;

function byId(id) {
    return document.getElementById(id);
}

function statusPill(status) {
    if (status === 'Good') return '<span class="status-pill status-good">Good</span>';
    if (status === 'Watch') return '<span class="status-pill status-watch">Watch</span>';
    return '<span class="status-pill status-missing">N/A</span>';
}

function hasBudgetActual(packet) {
    const fd = packet?.financial_data || {};
    return isNum(fd.budget_ytd) && isNum(fd.actual_ytd);
}

function hasGivingMonthly(packet) {
    const monthly = packet?.financial_data?.giving_monthly;
    return monthly && Object.keys(monthly).length > 0;
}

function hasBalanceSheet(packet) {
    const bs = packet?.financial_data?.balance_sheet || {};
    return Object.values(bs).some(isNum);
}

function hasWeeklyOffering(packet) {
    const weekly = packet?.financial_data?.weekly_offerings;
    return Array.isArray(weekly) && weekly.length > 0;
}

function coverageScore(packet) {
    return [hasBudgetActual(packet), hasGivingMonthly(packet), hasBalanceSheet(packet), hasWeeklyOffering(packet)].filter(Boolean).length;
}

function latestCashEstimate(packets) {
    for (let i = packets.length - 1; i >= 0; i -= 1) {
        const bs = packets[i]?.financial_data?.balance_sheet;
        if (!bs) continue;
        const unrestricted = bs.unrestricted_funds;
        const restricted = bs.restricted_funds;
        if (isNum(unrestricted) || isNum(restricted)) {
            return (isNum(unrestricted) ? unrestricted : 0) + (isNum(restricted) ? restricted : 0);
        }
    }
    return null;
}

function renderPulse(data) {
    const summary = data.financial_summary || {};
    const packets = data.packets || [];
    const variance = isNum(summary.total_actual_ytd) && isNum(summary.total_budget_ytd)
        ? summary.total_actual_ytd - summary.total_budget_ytd
        : null;
    const cash = latestCashEstimate(packets);
    const monthlyExpense = monthlyFromYtd(summary.total_actual_ytd);
    const daysCash = (isNum(cash) && isNum(monthlyExpense) && monthlyExpense > 0)
        ? Math.round((cash / monthlyExpense) * 30)
        : null;

    byId('generatedAt').textContent = data.generated_at ? new Date(data.generated_at).toLocaleDateString() : 'N/A';
    byId('packetCount').textContent = String(data.summary?.packet_count ?? packets.length ?? 'N/A');
    const maxCoverage = packets.length * 4;
    const totalCoverage = packets.reduce((acc, p) => acc + coverageScore(p), 0);
    byId('coveragePct').textContent = maxCoverage > 0 ? `${Math.round((totalCoverage / maxCoverage) * 100)}%` : 'N/A';

    byId('pulseGiving').textContent = money(summary.total_giving_ytd);
    byId('pulseVariance').textContent = money(variance);
    byId('pulseVarianceNote').textContent = percent(summary.total_actual_ytd, summary.total_budget_ytd);
    byId('pulseCash').textContent = money(cash);
    byId('pulseDaysCash').textContent = isNum(daysCash) ? `${daysCash} days` : 'N/A';
}

function row(kpi, current, target, status, insight) {
    return `<tr><td>${kpi}</td><td>${current}</td><td>${target}</td><td>${statusPill(status)}</td><td>${insight}</td></tr>`;
}

function renderKpiTables(data) {
    const summary = data.financial_summary || {};
    const packets = data.packets || [];
    const variance = isNum(summary.total_actual_ytd) && isNum(summary.total_budget_ytd)
        ? summary.total_actual_ytd - summary.total_budget_ytd
        : null;

    const givingBody = byId('givingKpiTable')?.querySelector('tbody');
    if (givingBody) {
        const recurringKnown = packets.some(p => Array.isArray(p?.financial_data?.weekly_offerings) && p.financial_data.weekly_offerings.length > 0);
        givingBody.innerHTML = [
            row('Total Contributions vs Goal', `${money(summary.total_actual_ytd)} vs ${money(summary.total_budget_ytd)}`, '>= 100% of budget', isNum(variance) && variance >= 0 ? 'Good' : 'Watch', 'Current extracted YTD actual is above budget when variance is positive.'),
            row('Giving per Attendee', 'N/A', 'Stable / increasing', 'N/A', 'Attendance totals are not currently extracted from packet data.'),
            row('Lapsed vs New Givers', 'N/A', 'Declining lapsed trend', 'N/A', 'Donor-level history is required for this metric.'),
            row('Recurring vs One-Time Giving', recurringKnown ? 'Partially available' : 'N/A', '>= 50% recurring', recurringKnown ? 'Watch' : 'N/A', 'Recurring mix needs direct donor transaction tagging.')
        ].join('');
    }

    const healthBody = byId('healthKpiTable')?.querySelector('tbody');
    if (healthBody) {
        const cash = latestCashEstimate(packets);
        const monthlyExpense = monthlyFromYtd(summary.total_actual_ytd);
        const daysCash = (isNum(cash) && isNum(monthlyExpense) && monthlyExpense > 0)
            ? Math.round((cash / monthlyExpense) * 30)
            : null;
        const burnRate = (isNum(monthlyExpense) && isNum(monthlyFromYtd(summary.total_giving_ytd)))
            ? monthlyExpense - monthlyFromYtd(summary.total_giving_ytd)
            : null;

        healthBody.innerHTML = [
            row('Days of Cash on Hand', isNum(daysCash) ? `${daysCash} days` : 'N/A', '60–90 days', isNum(daysCash) ? (daysCash >= 60 ? 'Good' : 'Watch') : 'N/A', 'Computed from latest available unrestricted/restricted cash and estimated monthly expense.'),
            row('Burn Rate (Monthly)', isNum(burnRate) ? money(burnRate) : 'N/A', '<= 0 preferred', isNum(burnRate) ? (burnRate <= 0 ? 'Good' : 'Watch') : 'N/A', 'Positive burn means estimated monthly expenses exceed estimated giving.'),
            row('Personnel Cost Ratio', 'N/A', '45%–55%', 'N/A', 'Personnel expense classification not currently extracted separately.')
        ].join('');
    }

    const engagementBody = byId('engagementKpiTable')?.querySelector('tbody');
    if (engagementBody) {
        engagementBody.innerHTML = [
            row('Attendance Growth Rate', 'N/A', 'Positive trend', 'N/A', 'Attendance counts are required to explain giving trend movement.'),
            row('Volunteer-to-Member Ratio', 'N/A', 'Rising trend', 'N/A', 'Volunteer/member roster not present in packet extraction.'),
            row('Summer Slump Indicator', 'Monitor June/July', 'Expected seasonal dip only', 'Watch', 'Treat June/July decline as expected variance unless engagement metrics also fall.' )
        ].join('');
    }
}

function renderQualityTable(data) {
    const packets = data.packets || [];
    const body = byId('qualityTable')?.querySelector('tbody');
    if (!body) return;

    body.innerHTML = packets.map((p) => {
        const budget = hasBudgetActual(p);
        const giving = hasGivingMonthly(p);
        const balance = hasBalanceSheet(p);
        const weekly = hasWeeklyOffering(p);
        return `
            <tr>
                <td>${p.display_date || 'N/A'}</td>
                <td>${p.title || 'N/A'}</td>
                <td>${statusPill(budget ? 'Good' : 'N/A')}</td>
                <td>${statusPill(giving ? 'Good' : 'N/A')}</td>
                <td>${statusPill(balance ? 'Good' : 'N/A')}</td>
                <td>${statusPill(weekly ? 'Good' : 'N/A')}</td>
                <td>${coverageScore(p)}</td>
            </tr>
        `;
    }).join('');
}

function renderStory(data) {
    const summary = data.financial_summary || {};
    const variance = isNum(summary.total_actual_ytd) && isNum(summary.total_budget_ytd)
        ? summary.total_actual_ytd - summary.total_budget_ytd
        : null;
    const story = byId('storyList');
    if (!story) return;

    story.innerHTML = [
        `<li>YTD stewardship position: ${isNum(variance) ? `${money(variance)} ${variance >= 0 ? 'above' : 'below'} budget` : 'insufficient variance data'}.</li>`,
        '<li>Giving stability remains partially visible because recurring and donor-retention signals are not fully extracted.</li>',
        '<li>Use attendance and volunteer metrics alongside finance data to distinguish seasonal giving dips from engagement decline.</li>',
        '<li>Seasonality note: June/July softness is often expected; trigger intervention only if both giving and engagement weaken together.</li>'
    ].join('');

    byId('aiPromptBlock').textContent = AI_PROMPT;
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;

    const trendRows = (data.trend || []).filter(t => isNum(t.budget_ytd) || isNum(t.actual_ytd) || isNum(t.giving_ytd));
    const labels = trendRows.map((t, i) => t.display_date || `P${i + 1}`);
    const expenses = data.top_expense_categories || {};
    const monthlyPct = data.giving_monthly_averages || {};

    const trendCtx = byId('trendChart');
    if (trendCtx) {
        charts.trend?.destroy();
        charts.trend = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Giving YTD', data: trendRows.map(t => isNum(t.giving_ytd) ? t.giving_ytd : null), borderColor: '#2563eb', tension: 0.25 },
                    { label: 'Budget YTD', data: trendRows.map(t => isNum(t.budget_ytd) ? t.budget_ytd : null), borderColor: '#16a34a', tension: 0.25 },
                    { label: 'Actual YTD (Expense Proxy)', data: trendRows.map(t => isNum(t.actual_ytd) ? t.actual_ytd : null), borderColor: '#dc2626', tension: 0.25 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, spanGaps: true }
        });
    }

    const engagementCtx = byId('engagementChart');
    if (engagementCtx) {
        charts.engagement?.destroy();
        const monthLabels = MONTHS_ORDER.filter(m => isNum(monthlyPct[m]));
        charts.engagement = new Chart(engagementCtx, {
            type: 'bar',
            data: {
                labels: monthLabels,
                datasets: [{ label: 'Giving % of Budget', data: monthLabels.map(m => monthlyPct[m]), backgroundColor: '#0ea5e9' }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    const breakdownCtx = byId('budgetBreakdownChart');
    if (breakdownCtx) {
        charts.breakdown?.destroy();
        const labelsExp = Object.keys(expenses).filter(k => isNum(expenses[k]));
        charts.breakdown = new Chart(breakdownCtx, {
            type: 'doughnut',
            data: {
                labels: labelsExp,
                datasets: [{
                    data: labelsExp.map(k => expenses[k]),
                    backgroundColor: ['#1d4ed8', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const channelCtx = byId('givingChannelChart');
    if (channelCtx) {
        charts.channels?.destroy();
        charts.channels = new Chart(channelCtx, {
            type: 'pie',
            data: {
                labels: ['Online / Mail / Dropoff', 'In-person / Other'],
                datasets: [{ data: [275027, 114080], backgroundColor: ['#2563eb', '#94a3b8'] }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Sample from March packet where channel split was explicitly reported'
                    }
                }
            }
        });
    }
}

async function initDashboard() {
    try {
        const res = await fetch('data/board_packets_data.json');
        if (!res.ok) throw new Error(`Failed to load JSON (${res.status})`);
        const data = await res.json();

        renderPulse(data);
        renderKpiTables(data);
        renderQualityTable(data);
        renderStory(data);
        renderCharts(data);
        byId('footerNote').textContent = 'Dashboard loaded successfully.';
    } catch (err) {
        console.error(err);
        byId('footerNote').textContent = `Load error: ${err.message}`;
    }
}

window.addEventListener('DOMContentLoaded', initDashboard);
