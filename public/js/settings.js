/**
 * NoCAP — Settings card
 * Lets the user change network access, access password, port, and status refresh
 * rate. Network/port/password changes are saved and applied on the next restart.
 */
window.initSettings = function () {
    loadSettings();
};

async function loadSettings() {
    const el = document.getElementById('settings-content');
    if (!el) return;
    let s;
    try {
        s = await (await fetch('/api/system/settings')).json();
    } catch (err) {
        el.innerHTML = `<div class="empty-state">Couldn't load settings: ${escapeHtml(err.message)}</div>`;
        return;
    }

    const lockNote = (k) => s.envLocked && s.envLocked[k]
        ? `<span class="setting-lock" title="Set by an environment variable">env-locked</span>` : '';

    const pendingBanner = s.restartPending
        ? `<div class="update-note warn" style="margin-bottom:var(--space-3)">Saved — <strong>restart NoCAP</strong> to apply the network / port / password change.</div>`
        : '';

    el.innerHTML = pendingBanner + `
        <label class="setting-row">
            <span class="setting-text">
                <span class="setting-label">Allow other devices on the network ${lockNote('host')}</span>
                <span class="setting-help">Let phones/PCs on your WiFi open NoCAP. Off = this computer only.</span>
            </span>
            <input type="checkbox" id="set-network" class="switch" ${s.networkAccess ? 'checked' : ''} ${s.envLocked.host ? 'disabled' : ''}>
        </label>

        <div class="setting-row">
            <span class="setting-text">
                <span class="setting-label">Access password ${lockNote('authToken')}</span>
                <span class="setting-help">${s.hasAuth ? 'A password is set. Type a new one to change it, or clear it to remove.' : 'Recommended if you turn on network access.'}</span>
            </span>
            <input type="password" id="set-token" class="config-input setting-input" placeholder="${s.hasAuth ? '•••••••• (set)' : 'none'}" ${s.envLocked.authToken ? 'disabled' : ''}>
        </div>

        <div class="setting-row">
            <span class="setting-text">
                <span class="setting-label">Port ${lockNote('port')}</span>
                <span class="setting-help">The address becomes http://localhost:&lt;port&gt;.</span>
            </span>
            <input type="number" id="set-port" class="config-input setting-input" value="${s.port}" min="1" max="65535" ${s.envLocked.port ? 'disabled' : ''}>
        </div>

        <div class="setting-row">
            <span class="setting-text">
                <span class="setting-label">Status refresh</span>
                <span class="setting-help">How often live progress updates (1–30s). Applies right away.</span>
            </span>
            <input type="number" id="set-status" class="config-input setting-input" value="${Math.round(s.statusInterval / 1000)}" min="1" max="30">
        </div>

        <div class="setting-actions">
            <button id="btn-save-settings" class="btn btn-primary btn-sm">Save settings</button>
            <span id="settings-status" class="setting-save-status"></span>
        </div>
    `;

    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
}

async function saveSettings() {
    const status = document.getElementById('settings-status');
    const payload = {
        networkAccess: document.getElementById('set-network').checked,
        port: parseInt(document.getElementById('set-port').value, 10),
        statusInterval: Math.round(parseFloat(document.getElementById('set-status').value) * 1000),
    };
    const tok = document.getElementById('set-token').value;
    if (tok !== '') payload.authToken = tok; // only change the password if something was typed

    try {
        const res = await fetch('/api/system/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Save failed');
        showToast('Settings saved', 'success');
        if (status) {
            status.textContent = d.restartRequired
                ? 'Saved — restart NoCAP to apply network/port/password changes.'
                : 'Saved.';
            status.className = 'setting-save-status ' + (d.restartRequired ? 'warn' : 'ok');
        }
        loadSettings();
    } catch (err) {
        showToast(`Couldn't save: ${err.message}`, 'error');
        if (status) { status.textContent = err.message; status.className = 'setting-save-status err'; }
    }
}
