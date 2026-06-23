/**
 * Cap Hashcat Web — History Component
 * Persistent record of past jobs: attack, wordlist, result, passwords found.
 */

window.initHistory = function () {
    const refreshBtn = document.getElementById('btn-refresh-history');
    const clearBtn = document.getElementById('btn-clear-history');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            window.loadHistory();
            showToast('History refreshed', 'success');
        });
    }

    const exportBtn = document.getElementById('btn-export-history');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportHistoryCsv);
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            if (!confirm('Clear all saved crack history? This cannot be undone.')) return;
            try {
                const res = await fetch('/api/hashcat/history', { method: 'DELETE' });
                if (!res.ok) throw new Error('Request failed');
                showToast('History cleared', 'success');
                window.loadHistory();
            } catch (err) {
                showToast(`Failed to clear history: ${err.message}`, 'error');
            }
        });
    }
};

let lastHistory = [];

async function exportHistoryCsv() {
    if (!lastHistory.length) { showToast('No history to export', 'warning'); return; }
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['When', 'Attack', 'Wordlist/Mask', 'Rules', 'Result', 'Passwords', 'Duration(ms)']];
    for (const h of lastHistory) {
        rows.push([
            new Date(h.endTime || h.startTime).toISOString(),
            h.attackModeName || '',
            h.dictionary || h.mask || '',
            h.ruleFile || '',
            h.state || '',
            (h.crackedPasswords || []).map(p => p.password).join(' | '),
            h.duration || 0,
        ].map(esc).join(','));
    }
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nocap-history.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}

// state → { label, tone }
const HISTORY_RESULT = {
    cracked:   { label: 'Cracked',  tone: 'success' },
    exhausted: { label: 'No match', tone: 'warning' },
    error:     { label: 'Error',    tone: 'error' },
    aborted:   { label: 'Stopped',  tone: 'neutral' },
    completed: { label: 'Finished', tone: 'neutral' },
};

function fmtDuration(ms) {
    if (!ms || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), rs = s % 60;
    if (m < 60) return `${m}m ${rs}s`;
    const h = Math.floor(m / 60), rm = m % 60;
    return `${h}h ${rm}m`;
}

function historyTarget(h) {
    if (h.dictionary && h.mask) return `${h.dictionary} + ${h.mask}`;
    if (h.dictionary) return h.dictionary + (h.ruleFile ? ` (+${h.ruleFile})` : '');
    if (h.mask) return h.mask;
    return '—';
}

function historyPasswords(h) {
    if (h.crackedPasswords && h.crackedPasswords.length) {
        return h.crackedPasswords.map(p =>
            `<div class="hist-pass"><span class="mono">${escapeHtml(p.password)}</span>${
                p.essid ? ` <span class="hist-essid">${escapeHtml(p.essid)}</span>` : ''}</div>`
        ).join('');
    }
    if (h.state === 'error' && h.error) {
        return `<span class="hist-error">${escapeHtml(h.error)}</span>`;
    }
    return '<span class="text-muted">—</span>';
}

window.loadHistory = async function () {
    const container = document.getElementById('history-content');
    const summary = document.getElementById('history-summary');
    if (!container) return;

    let history = [];
    try {
        const res = await fetch('/api/hashcat/history');
        const data = await res.json();
        history = data.history || [];
        lastHistory = history;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">Failed to load history: ${escapeHtml(err.message)}</div>`;
        return;
    }

    if (summary) {
        const crackedJobs = history.filter(h => h.crackedCount > 0).length;
        const totalPw = history.reduce((n, h) => n + (h.crackedCount || 0), 0);
        summary.textContent = history.length
            ? `${history.length} job${history.length > 1 ? 's' : ''} · ${crackedJobs} cracked · ${totalPw} password${totalPw === 1 ? '' : 's'} recovered`
            : '';
    }

    if (history.length === 0) {
        container.innerHTML = '<div class="empty-state">No crack history yet. Completed jobs will be saved here.</div>';
        return;
    }

    container.innerHTML = `
        <div class="history-table-wrap">
        <table class="history-table">
            <thead>
                <tr>
                    <th>When</th>
                    <th>Attack</th>
                    <th>Wordlist / Mask</th>
                    <th>Result</th>
                    <th>Passwords / Detail</th>
                    <th>Duration</th>
                </tr>
            </thead>
            <tbody>
                ${history.map(h => {
                    const r = HISTORY_RESULT[h.state] || { label: h.state || 'Unknown', tone: 'neutral' };
                    return `
                    <tr>
                        <td class="hist-when">${escapeHtml(new Date(h.endTime || h.startTime).toLocaleString())}</td>
                        <td>${escapeHtml(h.attackModeName || '—')}</td>
                        <td class="hist-target mono">${escapeHtml(historyTarget(h))}</td>
                        <td><span class="badge badge-${r.tone}">${escapeHtml(r.label)}</span></td>
                        <td class="hist-detail">${historyPasswords(h)}</td>
                        <td class="hist-dur mono">${fmtDuration(h.duration)}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        </div>`;
};
