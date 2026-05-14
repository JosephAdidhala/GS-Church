let charts = {};
let baseData = null;
let csvRows = [];

const MONTHS_ORDER = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const AI_PROMPT = `Act as a Senior Church Financial Consultant. I am providing you with a dataset of church offerings and expenses for the last 12 months.

Please analyze the following:
1. Trend Analysis: Did offerings go up or down? Identify specific months of significant change and hypothesize potential reasons (e.g., seasonality, holidays).
2. Giving Stability: Calculate the ratio of recurring vs. one-time gifts and what that means for our financial predictability.
3. Efficiency: Compare our total giving to our personnel and operating expenses. Are we top-heavy on staff costs?
4. Action Plan: Based on these numbers, give 3 specific recommendations to increase donor retention and 2 ways to optimize current spending.

Format the output as an Executive Summary for a Board of Elders meeting.`;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const parsed = Number(String(v).replace(/[$,%\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
};
const money = (v) => isNum(v) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v) : 'N/A';
const percent = (n, d, decimals = 1) => (isNum(n) && isNum(d) && d > 0) ? `${((n / d) * 100).toFixed(decimals)}%` : 'N/A';
const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
const sumBy = (rows, key) => rows.map(r => num(r[key])).filter(isNum).reduce((a, b) => a + b, 0);

function byId(id) { return document.getElementById(id); }

function statusPill(status) {
    if (status === 'Good') return '<span class="status-pill status-good">Good</span>';
    if (status === 'Watch') return '<span class="status-pill status-watch">Watch</span>';
    return '<span class="status-pill status-missing">N/A</span>';
}

function row(kpi, current, target, status, insight) {
    return `<tr><td>${kpi}</td><td>${current}</td><td>${target}</td><td>${statusPill(status)}</td><td>${insight}</td></tr>`;
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
        if (isNum(unrestricted) || isNum(restricted)) return (isNum(unrestricted) ? unrestricted : 0) + (isNum(restricted) ? restricted : 0);
    }
    return null;
}

function parseCsv(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim());
        const rowObj = {};
        headers.forEach((h, i) => { rowObj[h] = cols[i] ?? ''; });
        return rowObj;
    });
}

function bindCsvUpload() {
    const input = byId('metricsCsvInput');
    if (!input) return;
    const status = byId('uploadStatus');
    if (status) status.textContent = 'Using board packet trends now (CSV optional).';
    input.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        csvRows = parseCsv(text);
        byId('uploadStatus').textContent = csvRows.length ? `Loaded ${csvRows.length} monthly rows from ${file.name}` : 'CSV selected, but no usable rows found. Using board packet trends.';
        rerender();
    });
}

function renderPulse(data) {
    const summary = data.financial_summary || {};
    const packets = data.packets || [];
    const givingYtd = csvRows.length ? sumBy(csvRows, 'total_giving') : summary.total_giving_ytd;
    const budgetYtd = csvRows.length ? sumBy(csvRows, 'budget_goal') : summary.total_budget_ytd;
    const actualYtd = csvRows.length ? sumBy(csvRows, 'operating_expense') : summary.total_actual_ytd;
    const variance = (isNum(actualYtd) && isNum(budgetYtd)) ? actualYtd - budgetYtd : null;
    const cash = csvRows.length ? num(csvRows[csvRows.length - 1]?.cash_balance) : latestCashEstimate(packets);
    const monthlyExpense = csvRows.length ? avg(csvRows.map(r => num(r.operating_expense)).filter(isNum)) : (isNum(actualYtd) ? actualYtd / 12 : null);
    const daysCash = (isNum(cash) && isNum(monthlyExpense) && monthlyExpense > 0) ? Math.round((cash / monthlyExpense) * 30) : null;

    byId('generatedAt').textContent = data.generated_at ? new Date(data.generated_at).toLocaleDateString() : 'N/A';
    byId('packetCount').textContent = String(data.summary?.packet_count ?? packets.length ?? 'N/A');
    const maxCoverage = packets.length * 4;
    const totalCoverage = packets.reduce((acc, p) => acc + coverageScore(p), 0);
    byId('coveragePct').textContent = maxCoverage > 0 ? `${Math.round((totalCoverage / maxCoverage) * 100)}%` : 'N/A';

    byId('pulseGiving').textContent = money(givingYtd);
    byId('pulseVariance').textContent = money(variance);
    byId('pulseVarianceNote').textContent = percent(actualYtd, budgetYtd);
    byId('pulseCash').textContent = money(cash);
    byId('pulseDaysCash').textContent = isNum(daysCash) ? `${daysCash} days` : 'N/A';
}

function renderKpiTables(data) {
    const summary = data.financial_summary || {};
    const givingYtd = csvRows.length ? sumBy(csvRows, 'total_giving') : summary.total_giving_ytd;
    const budgetYtd = csvRows.length ? sumBy(csvRows, 'budget_goal') : summary.total_budget_ytd;
    const actualYtd = csvRows.length ? sumBy(csvRows, 'operating_expense') : summary.total_actual_ytd;
    const variance = (isNum(actualYtd) && isNum(budgetYtd)) ? actualYtd - budgetYtd : null;

    const givingBody = byId('givingKpiTable')?.querySelector('tbody');
    if (givingBody) {
        const attendance = sumBy(csvRows, 'attendance');
        const recurring = sumBy(csvRows, 'recurring_giving');
        const oneTime = sumBy(csvRows, 'one_time_giving');
        const newGivers = sumBy(csvRows, 'new_givers');
        const lapsedGivers = sumBy(csvRows, 'lapsed_givers');
        givingBody.innerHTML = [
            row('Total Contributions vs Goal', `${money(givingYtd)} vs ${money(budgetYtd)}`, '>= 100% of budget', isNum(variance) && variance <= 0 ? 'Good' : 'Watch', 'Compares cumulative giving to stated budget goals.'),
            row('Giving per Attendee', (isNum(givingYtd) && isNum(attendance) && attendance > 0) ? money(givingYtd / attendance) : 'N/A', 'Stable / increasing', isNum(givingYtd) && isNum(attendance) ? 'Good' : 'N/A', 'Requires attendance counts per month.'),
            row('Lapsed vs New Givers', (isNum(lapsedGivers) || isNum(newGivers)) ? `${lapsedGivers || 0} vs ${newGivers || 0}` : 'N/A', 'New >= Lapsed', isNum(newGivers) && isNum(lapsedGivers) ? (newGivers >= lapsedGivers ? 'Good' : 'Watch') : 'N/A', 'Donor retention signal.'),
            row('Recurring vs One-Time Giving', (isNum(recurring) || isNum(oneTime)) ? percent(recurring, (recurring || 0) + (oneTime || 0)) : 'N/A', '>= 50% recurring', isNum(recurring) && isNum(oneTime) ? (((recurring / ((recurring || 0) + (oneTime || 0))) >= 0.5) ? 'Good' : 'Watch') : 'N/A', 'Higher recurring share improves predictability.')
        ].join('');
    }

    const healthBody = byId('healthKpiTable')?.querySelector('tbody');
    if (healthBody) {
        const cash = csvRows.length ? num(csvRows[csvRows.length - 1]?.cash_balance) : latestCashEstimate(data.packets || []);
        const opExpenses = csvRows.map(r => num(r.operating_expense)).filter(isNum);
        const personnel = csvRows.map(r => num(r.personnel_expense)).filter(isNum);
        const incomes = csvRows.map(r => num(r.total_giving)).filter(isNum);
        const monthlyExpense = opExpenses.length ? avg(opExpenses) : (isNum(actualYtd) ? actualYtd / 12 : null);
        const daysCash = (isNum(cash) && isNum(monthlyExpense) && monthlyExpense > 0) ? Math.round((cash / monthlyExpense) * 30) : null;
        const burnRate = (opExpenses.length && incomes.length) ? avg(opExpenses) - avg(incomes) : null;
        const totalPersonnel = personnel.reduce((a, b) => a + b, 0);
        const totalOps = opExpenses.reduce((a, b) => a + b, 0);
        const personnelRatio = (totalPersonnel + totalOps) > 0 ? (totalPersonnel / (totalPersonnel + totalOps)) : null;

        healthBody.innerHTML = [
            row('Days of Cash on Hand', isNum(daysCash) ? `${daysCash} days` : 'N/A', '60–90 days', isNum(daysCash) ? (daysCash >= 60 ? 'Good' : 'Watch') : 'N/A', 'Liquidity runway for operations.'),
            row('Burn Rate (Monthly)', isNum(burnRate) ? money(burnRate) : 'N/A', '<= 0 preferred', isNum(burnRate) ? (burnRate <= 0 ? 'Good' : 'Watch') : 'N/A', 'Positive burn indicates monthly deficit.'),
            row('Personnel Cost Ratio', isNum(personnelRatio) ? `${(personnelRatio * 100).toFixed(1)}%` : 'N/A', '45%–55%', isNum(personnelRatio) ? (personnelRatio >= 0.45 && personnelRatio <= 0.55 ? 'Good' : 'Watch') : 'N/A', 'Staff cost share of core operating spend.')
        ].join('');
    }

    const engagementBody = byId('engagementKpiTable')?.querySelector('tbody');
    if (engagementBody) {
        const attendanceSeries = csvRows.map(r => num(r.attendance)).filter(isNum);
        const volunteerSeries = csvRows.map(r => num(r.volunteers)).filter(isNum);
        const membersSeries = csvRows.map(r => num(r.members)).filter(isNum);
        const growth = attendanceSeries.length >= 2 ? ((attendanceSeries[attendanceSeries.length - 1] - attendanceSeries[0]) / attendanceSeries[0]) : null;
        const latestVolunteer = volunteerSeries.length ? volunteerSeries[volunteerSeries.length - 1] : null;
        const latestMembers = membersSeries.length ? membersSeries[membersSeries.length - 1] : null;

        engagementBody.innerHTML = [
            row('Attendance Growth Rate', isNum(growth) ? `${(growth * 100).toFixed(1)}%` : 'N/A', 'Positive trend', isNum(growth) ? (growth >= 0 ? 'Good' : 'Watch') : 'N/A', 'Tracks attendance momentum over uploaded months.'),
            row('Volunteer-to-Member Ratio', (isNum(latestVolunteer) && isNum(latestMembers) && latestMembers > 0) ? `${((latestVolunteer / latestMembers) * 100).toFixed(1)}%` : 'N/A', 'Rising trend', isNum(latestVolunteer) && isNum(latestMembers) ? 'Good' : 'N/A', 'High volunteer engagement often supports giving consistency.'),
            row('Summer Slump Indicator', 'Monitor June/July', 'Expected seasonal dip only', 'Watch', 'If giving dips with attendance decline, treat as engagement risk; otherwise likely seasonal.')
        ].join('');
    }
}

function renderQualityTable(data) {
    const packets = data.packets || [];
    const body = byId('qualityTable')?.querySelector('tbody');
    if (!body) return;
    body.innerHTML = packets.map((p) => `
        <tr>
            <td>${p.display_date || 'N/A'}</td>
            <td>${p.title || 'N/A'}</td>
            <td>${statusPill(hasBudgetActual(p) ? 'Good' : 'N/A')}</td>
            <td>${statusPill(hasGivingMonthly(p) ? 'Good' : 'N/A')}</td>
            <td>${statusPill(hasBalanceSheet(p) ? 'Good' : 'N/A')}</td>
            <td>${statusPill(hasWeeklyOffering(p) ? 'Good' : 'N/A')}</td>
            <td>${coverageScore(p)}</td>
        </tr>`).join('');
}

function renderStory() {
    const story = byId('storyList');
    if (!story) return;
    story.innerHTML = [
        '<li>Use this dashboard to combine stewardship numbers with ministry engagement trends.</li>',
        '<li>Seasonal note: a June/July dip can be normal (summer slump) unless attendance and volunteer ratios also weaken.</li>',
        '<li>For board decisions, focus on recurring share, burn rate direction, and cash runway.</li>',
        `<li>${csvRows.length ? `CSV-enhanced metrics are active (${csvRows.length} rows loaded).` : 'Upload CSV to unlock currently unavailable donor and attendance KPIs.'}</li>`
    ].join('');
}

function renderTrendTable(data) {
    const rows = (data.trend || []).slice();
    const body = byId('trendTableBody');
    if (!body) return;

    rows.sort((a, b) => String(a.meeting_date || '').localeCompare(String(b.meeting_date || '')));
    body.innerHTML = rows.map(r => `
        <tr>
            <td>${r.display_date || r.meeting_date || 'N/A'}</td>
            <td>${money(num(r.giving_ytd))}</td>
            <td>${money(num(r.budget_ytd))}</td>
            <td>${money(num(r.actual_ytd))}</td>
            <td>${isNum(num(r.finance_score)) ? num(r.finance_score) : 'N/A'}</td>
            <td>${isNum(num(r.currency_mentions)) ? num(r.currency_mentions) : 'N/A'}</td>
        </tr>
    `).join('');

    const first = rows[0];
    const last = rows[rows.length - 1];
    const scoreDelta = isNum(num(first?.finance_score)) && isNum(num(last?.finance_score))
        ? num(last.finance_score) - num(first.finance_score)
        : null;
    const mentionDelta = isNum(num(first?.currency_mentions)) && isNum(num(last?.currency_mentions))
        ? num(last.currency_mentions) - num(first.currency_mentions)
        : null;

    const summary = byId('trendSummary');
    if (summary) {
        const scoreText = isNum(scoreDelta) ? `${scoreDelta >= 0 ? 'up' : 'down'} ${Math.abs(scoreDelta)} finance-score points` : 'finance-score trend unavailable';
        const mentionText = isNum(mentionDelta) ? `${mentionDelta >= 0 ? 'up' : 'down'} ${Math.abs(mentionDelta)} currency mentions` : 'currency-mention trend unavailable';
        summary.textContent = `Packet trend: ${scoreText}, ${mentionText}.`;
    }
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;

    const trendCtx = byId('trendChart');
    if (trendCtx) {
        charts.trend?.destroy();
        let labels = [];
        let givingSeries = [];
        let expenseSeries = [];
        let scoreSeries = [];
        let mentionSeries = [];
        if (csvRows.length) {
            labels = csvRows.map(r => r.month || 'Month');
            givingSeries = csvRows.map(r => num(r.total_giving));
            expenseSeries = csvRows.map(r => num(r.operating_expense));
            scoreSeries = csvRows.map(() => null);
            mentionSeries = csvRows.map(() => null);
        } else {
            const rows = (data.trend || []).slice().sort((a, b) => String(a.meeting_date || '').localeCompare(String(b.meeting_date || '')));
            labels = rows.map((t, i) => t.display_date || t.meeting_date || `P${i + 1}`);
            givingSeries = rows.map(t => num(t.giving_ytd));
            expenseSeries = rows.map(t => num(t.actual_ytd));
            scoreSeries = rows.map(t => num(t.finance_score));
            mentionSeries = rows.map(t => num(t.currency_mentions));
        }

        const datasets = !csvRows.length
            ? [
                { label: 'Finance Score', data: scoreSeries, borderColor: '#16a34a', tension: 0.25, yAxisID: 'y' },
                { label: 'Currency Mentions', data: mentionSeries, borderColor: '#a855f7', tension: 0.25, yAxisID: 'y1' },
                { label: 'Giving YTD', data: givingSeries, borderColor: '#2563eb', tension: 0.25, borderDash: [6, 4], yAxisID: 'y2' },
                { label: 'Actual YTD', data: expenseSeries, borderColor: '#dc2626', tension: 0.25, borderDash: [6, 4], yAxisID: 'y2' }
            ]
            : [
                { label: 'Giving', data: givingSeries, borderColor: '#2563eb', tension: 0.25, yAxisID: 'y' },
                { label: 'Expenses', data: expenseSeries, borderColor: '#dc2626', tension: 0.25, yAxisID: 'y' }
            ];

        charts.trend = new Chart(trendCtx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                spanGaps: true,
                scales: {
                    y: { beginAtZero: true, position: 'left' },
                    y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } },
                    y2: { beginAtZero: true, position: 'right', display: false, grid: { drawOnChartArea: false } }
                }
            }
        });
    }

    const engagementCtx = byId('engagementChart');
    if (engagementCtx) {
        charts.engagement?.destroy();
        const labels = csvRows.length ? csvRows.map(r => r.month || 'Month') : MONTHS_ORDER.filter(m => isNum(data.giving_monthly_averages?.[m]));
        const datasets = csvRows.length
            ? [
                { label: 'Attendance', data: csvRows.map(r => num(r.attendance)), borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,.2)', yAxisID: 'y' },
                { label: 'Volunteers', data: csvRows.map(r => num(r.volunteers)), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.2)', yAxisID: 'y' }
            ]
            : [{ label: 'Giving % Budget', data: labels.map(m => num(data.giving_monthly_averages?.[m])), borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,.2)' }];
        charts.engagement = new Chart(engagementCtx, {
            type: csvRows.length ? 'line' : 'bar',
            data: { labels, datasets },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    const breakdownCtx = byId('budgetBreakdownChart');
    if (breakdownCtx) {
        charts.breakdown?.destroy();
        let labels = [];
        let values = [];
        if (csvRows.length) {
            const personnel = sumBy(csvRows, 'personnel_expense');
            const operating = sumBy(csvRows, 'operating_expense');
            labels = ['Personnel', 'Operating'];
            values = [personnel, operating];
        } else {
            const exp = data.top_expense_categories || {};
            labels = Object.keys(exp).filter(k => isNum(exp[k]));
            values = labels.map(k => exp[k]);
        }
        charts.breakdown = new Chart(breakdownCtx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data: values, backgroundColor: ['#1d4ed8', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const channelCtx = byId('givingChannelChart');
    if (channelCtx) {
        charts.channels?.destroy();
        const online = csvRows.length ? sumBy(csvRows, 'online_giving') : 275027;
        const inperson = csvRows.length ? sumBy(csvRows, 'inperson_giving') : 114080;
        charts.channels = new Chart(channelCtx, {
            type: 'pie',
            data: { labels: ['Online/Recurring Channels', 'In-person/Other'], datasets: [{ data: [online, inperson], backgroundColor: ['#2563eb', '#94a3b8'] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function rerender() {
    if (!baseData) return;
    try { renderPulse(baseData); } catch (e) { console.error('renderPulse failed', e); }
    try { renderKpiTables(baseData); } catch (e) { console.error('renderKpiTables failed', e); }
    try { renderQualityTable(baseData); } catch (e) { console.error('renderQualityTable failed', e); }
    try { renderStory(); } catch (e) { console.error('renderStory failed', e); }
    try { renderCharts(baseData); } catch (e) { console.error('renderCharts failed', e); }
    try { renderTrendTable(baseData); } catch (e) { console.error('renderTrendTable failed', e); }
    byId('footerNote').textContent = csvRows.length ? 'Dashboard loaded with supplemental CSV metrics.' : 'Dashboard loaded successfully.';
}

async function initDashboard() {
    try {
        const trendSummary = byId('trendSummary');
        if (trendSummary) trendSummary.textContent = 'Loading trend data…';
        bindCsvUpload();
        const res = await fetch('data/board_packets_data.json');
        if (!res.ok) throw new Error(`Failed to load JSON (${res.status})`);
        baseData = await res.json();
        const status = byId('uploadStatus');
        if (status) status.textContent = 'Using board packet trends now (CSV optional).';
        rerender();
    } catch (err) {
        console.error(err);
        byId('footerNote').textContent = `Load error: ${err.message}`;
        const trendSummary = byId('trendSummary');
        if (trendSummary) trendSummary.textContent = `Unable to load trend data: ${err.message}`;
        const trendBody = byId('trendTableBody');
        if (trendBody) {
            trendBody.innerHTML = '<tr><td colspan="6">Trend data unavailable. Refresh the page and try again.</td></tr>';
        }
    }
}

window.addEventListener('DOMContentLoaded', initDashboard);
