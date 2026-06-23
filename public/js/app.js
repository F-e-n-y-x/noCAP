/**
 * Cap Hashcat Web — Main App Controller
 */

// Global State
window.appState = {
    connected: false,
    uploadedFiles: [],
    dictionaries: [],
    rules: [],
    systemInfo: null,
    gpuInfo: null,
    currentJobId: null
};

/**
 * Escape a string for safe interpolation into innerHTML.
 * Used for any value derived from capture files, potfiles, or cracked output.
 */
window.escapeHtml = function(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// Main DOM Elements
const ui = {
    tabs: document.querySelectorAll('.nav-tab'),
    panels: document.querySelectorAll('.tab-panel'),
    toastContainer: document.getElementById('toast-container')
};

/**
 * Initialize App
 */
async function initApp() {
    console.log('Cap Hashcat Web initializing...');
    
    // Tab switching
    ui.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Theme toggle (theme is pre-set in <head> to avoid a flash)
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const root = document.documentElement;
            const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
        });
    }
    
    // Check Notification permissions
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
    
    // Load initial data
    try {
        await Promise.all([
            loadSystemInfo(),
            loadGPUInfo(),
            loadFiles(),
            loadDictionaries(),
            loadRules(),
            loadSessions(),
            loadPotfile(),
            window.loadHistory ? window.loadHistory() : Promise.resolve()
        ]);
    } catch (err) {
        console.error('Initialization error:', err);
        showToast('Failed to load some data from server', 'error');
    }
    
    // Initialize specific modules
    if (window.initUpload) window.initUpload();
    if (window.initCracker) window.initCracker();
    if (window.initMonitor) window.initMonitor();
    if (window.initDictionary) window.initDictionary();
    if (window.initGPU) window.initGPU();
    if (window.initHistory) window.initHistory();
    if (window.initDevices) window.initDevices();
    if (window.initSettings) window.initSettings();
    if (window.initCustomSelects) window.initCustomSelects();
    setupHashcatUpdate();
    setupAppUpdate();
    
    // Connect WebSocket last
    if (window.connectWebSocket) window.connectWebSocket();
}

/**
 * Switch Tab
 */
function switchTab(tabId) {
    ui.tabs.forEach(t => t.classList.remove('active'));
    ui.panels.forEach(p => p.classList.remove('active'));
    
    const targetTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    const targetPanel = document.getElementById(`tab-${tabId}`);
    
    if (targetTab && targetPanel) {
        targetTab.classList.add('active');
        targetPanel.classList.add('active');
    }
}

/**
 * Show Toast Notification
 */
function showToast(message, type = 'info', duration = 5000) {
    if (!ui.toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    if (type === 'success') icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    else if (type === 'error') icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    else if (type === 'warning') icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    else icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    
    toast.innerHTML = `
        ${icon}
        <span class="toast-message">${message}</span>
    `;
    
    ui.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Show Browser Notification
 */
function showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body,
            icon: '/favicon.ico'
        });
    }
}

// ── API Calls ─────────────────────────────────────────────────────────

const APP_VERSION = '2.0';

async function loadSystemInfo() {
    const res = await fetch('/api/system/health');
    const data = await res.json();
    window.appState.systemInfo = data;

    // Server / About card
    const serverInfo = document.getElementById('server-info');
    if (serverInfo) {
        serverInfo.innerHTML = `
            <div class="brand-line">
                <span class="brand-name">NoCAP</span>
                <span class="brand-ver">v${APP_VERSION}</span>
            </div>
            <div class="info-row"><span class="info-label">Version</span><span class="info-value">v${APP_VERSION}</span></div>
            <div class="info-row"><span class="info-label">Served at</span><span class="info-value">${escapeHtml(location.host)}</span></div>
            <div class="info-row"><span class="info-label">Platform</span><span class="info-value">${escapeHtml(data.platform || '—')}</span></div>
            <div class="info-row"><span class="info-label">Hash mode</span><span class="info-value">22000 · WPA</span></div>
            <div class="info-row"><span class="info-label">Author</span><span class="info-value">
                <a href="https://github.com/F-e-n-y-x/" target="_blank" rel="noopener">Ayush</a> ·
                <a href="https://www.linkedin.com/in/ayushsoni2911/" target="_blank" rel="noopener">LinkedIn</a>
            </span></div>
            <div id="app-update-status" class="update-status"></div>
        `;
    }

    // Dependencies card (single source of truth for tool status)
    const depsInfo = document.getElementById('deps-info');
    if (depsInfo) {
        depsInfo.innerHTML = `
            <div class="info-row">
                <span class="info-label">hashcat</span>
                <span class="info-value ${data.hashcatInstalled ? 'success' : 'error'}">${data.hashcatInstalled ? escapeHtml(data.hashcatVersion || 'installed') : 'not found'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">hcxpcapngtool</span>
                <span class="info-value ${data.hcxpcapngtoolAvailable ? 'success' : (data.platform === 'win32' ? '' : 'error')}">${data.hcxpcapngtoolAvailable ? 'found' : (data.platform === 'win32' ? 'N/A (Linux only)' : 'not found')}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Python</span>
                <span class="info-value ${data.pythonAvailable ? 'success' : ''}">${data.pythonAvailable ? 'found' : 'not detected'}</span>
            </div>
            <div id="hashcat-update-status" class="update-status"></div>
        `;
    }
    
    const healthInfo = document.getElementById('health-info');
    if (healthInfo && data.memory) {
        healthInfo.innerHTML = `
            <div class="info-row">
                <span class="info-label">CPU Load</span>
                <span class="info-value">${data.cpu.load}%</span>
            </div>
            <div class="info-row">
                <span class="info-label">Memory</span>
                <span class="info-value">${data.memory.used}GB / ${data.memory.total}GB (${data.memory.percent}%)</span>
            </div>
        `;
    }
}

async function loadGPUInfo() {
    const res = await fetch('/api/system/gpu');
    const data = await res.json();
    window.appState.gpuInfo = data;
    
    // Update UI components that need GPU info
    if (window.renderGPUInfo) window.renderGPUInfo(data);
    if (window.renderGPUPreset) window.renderGPUPreset(data);
}

async function loadFiles() {
    const res = await fetch('/api/upload/files');
    const data = await res.json();
    window.appState.uploadedFiles = data.files;
    
    // Update UI
    if (window.renderFilesList) window.renderFilesList(data.files);
    if (window.updateHashSelect) window.updateHashSelect(data.files);
}

async function loadDictionaries() {
    const res = await fetch('/api/dictionaries');
    const data = await res.json();
    window.appState.dictionaries = data.downloaded;
    
    // Update UI
    if (window.renderDictSources) window.renderDictSources(data.sources);
    if (window.renderDownloadedDicts) window.renderDownloadedDicts(data.downloaded);
    if (window.updateDictSelects) window.updateDictSelects(data.downloaded);
}

async function loadRules() {
    const res = await fetch('/api/hashcat/rules');
    const data = await res.json();
    window.appState.rules = data.rules;
    
    // Update UI
    if (window.updateRuleSelect) window.updateRuleSelect(data.rules);
}

const ACTIVE_STATES = ['starting', 'running', 'pausing', 'paused', 'stopping', 'resuming'];

async function loadSessions() {
    const container = document.getElementById('sessions-content');
    if (!container) return;

    let sessions = [], status = null;
    try {
        const [sRes, stRes] = await Promise.all([
            fetch('/api/hashcat/sessions'),
            fetch('/api/hashcat/status'),
        ]);
        sessions = (await sRes.json()).sessions || [];
        status = await stRes.json();
    } catch { /* keep going with whatever we have */ }

    // Currently-running job (so you can jump back to it after a refresh)
    let activeHtml = '';
    if (status && status.job && ACTIVE_STATES.includes(status.state)) {
        const j = status.job;
        const pct = (j.status && j.status.progressPercent != null) ? ` · ${j.status.progressPercent.toFixed(2)}%` : '';
        const target = j.dictionary || j.mask || '';
        const file = j.hashFile ? j.hashFile.split(/[\\/]/).pop() : '';
        activeHtml = `
            <div class="info-row active-job">
                <div style="display:flex; flex-direction:column;">
                    <span class="info-value"><span class="active-dot"></span> Running now${pct}</span>
                    <span class="info-label" style="font-size:0.8rem">${escapeHtml([file, target].filter(Boolean).join(' · '))}</span>
                </div>
                <button class="btn btn-sm btn-primary" onclick="switchTab('workspace')">Open monitor</button>
            </div>`;
    }

    const savedHtml = sessions.length
        ? sessions.map(s => `
            <div class="info-row">
                <div style="display:flex; flex-direction:column;">
                    <span class="info-value">${escapeHtml(s.name)}</span>
                    <span class="info-label" style="font-size:0.8rem">${new Date(s.modified).toLocaleString()}</span>
                </div>
                <div style="display:flex; gap:var(--space-2)">
                    <button class="btn btn-sm btn-secondary" data-session="${escapeHtml(s.name)}" onclick="resumeSession(this.dataset.session)">Resume</button>
                    <button class="btn btn-sm btn-danger" data-session="${escapeHtml(s.name)}" onclick="removeSession(this.dataset.session)">Delete</button>
                </div>
            </div>`).join('')
        : '';

    if (!activeHtml && !savedHtml) {
        container.innerHTML = '<div class="empty-state">No active or saved sessions</div>';
        return;
    }
    container.innerHTML = `<div class="sessions-list">${activeHtml}${savedHtml || '<div class="empty-state" style="padding:var(--space-4)">No saved (paused) sessions</div>'}</div>`;
}

async function loadPotfile() {
    const res = await fetch('/api/hashcat/potfile');
    const data = await res.json();
    
    const container = document.getElementById('potfile-content');
    if (!container) return;
    
    if (data.results.length === 0) {
        container.innerHTML = '<div class="empty-state">No cracked passwords yet</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="cracked-list">
            ${data.results.map(r => `
                <div class="cracked-item">
                    <div style="display:flex; flex-direction:column;">
                        <span class="cracked-password">${escapeHtml(r.password)}</span>
                        <span class="cracked-network">${r.essid ? `SSID: ${escapeHtml(r.essid)}` : 'Hash'} | <span style="font-size:0.75rem; opacity:0.6">${escapeHtml(r.hash.substring(0,30))}...</span></span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ── NoCAP app update (from GitHub, two-step: download → install) ───────
function setupAppUpdate() {
    const btn = document.getElementById('btn-check-app');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const status = document.getElementById('app-update-status');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = 'Checking…';
        try {
            const res = await fetch('/api/system/app/check');
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Check failed');
            if (!status) return;
            if (d.updateAvailable) {
                status.innerHTML = `<div class="update-note warn">NoCAP <strong>v${escapeHtml(d.latest)}</strong> available (you have v${escapeHtml(d.current || '?')}).
                    <button id="btn-app-download" class="btn btn-sm btn-primary">Download</button>
                    <a href="${escapeHtml(d.repoUrl)}" target="_blank" rel="noopener">view on GitHub ↗</a></div>`;
                document.getElementById('btn-app-download').addEventListener('click', appDownload);
            } else if (d.current) {
                status.innerHTML = `<div class="update-note ok">NoCAP v${escapeHtml(d.current)} is up to date.</div>`;
            } else {
                status.innerHTML = `<div class="update-note err">Could not read local version.</div>`;
            }
        } catch (err) {
            if (status) status.innerHTML = `<div class="update-note err">${escapeHtml(err.message)}</div>`;
        } finally {
            btn.disabled = false; btn.textContent = orig;
        }
    });
}

async function appDownload() {
    const status = document.getElementById('app-update-status');
    if (status) status.innerHTML = `<div class="update-note">Downloading update from GitHub…</div>`;
    try {
        const res = await fetch('/api/system/app/download', { method: 'POST' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Download failed');
        showToast('Update downloaded — click Install to apply', 'success', 6000);
        if (status) status.innerHTML = `<div class="update-note warn">Update downloaded (${(d.size / 1024).toFixed(0)} KB).
            <button id="btn-app-install" class="btn btn-sm btn-primary">Install now</button></div>`;
        document.getElementById('btn-app-install').addEventListener('click', appInstall);
    } catch (err) {
        showToast(`Download failed: ${err.message}`, 'error', 7000);
        if (status) status.innerHTML = `<div class="update-note err">${escapeHtml(err.message)}</div>`;
    }
}

async function appInstall() {
    if (!confirm('Install the downloaded NoCAP update? App files will be replaced (your current version is backed up to .appbackup). You must restart the server afterwards.')) return;
    const status = document.getElementById('app-update-status');
    if (status) status.innerHTML = `<div class="update-note">Installing…</div>`;
    try {
        const res = await fetch('/api/system/app/install', { method: 'POST' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Install failed');
        showToast(`Updated to v${d.version || 'latest'} — restart the server to apply`, 'success', 12000);
        if (status) status.innerHTML = `<div class="update-note ok">Installed v${escapeHtml(d.version || 'latest')}. <strong>Restart the server</strong> (re-run start.bat / npm start) to apply. If dependencies changed, run <code>npm install</code>.</div>`;
    } catch (err) {
        showToast(`Install failed: ${err.message}`, 'error', 8000);
        if (status) status.innerHTML = `<div class="update-note err">${escapeHtml(err.message)} — your previous version is intact in .appbackup.</div>`;
    }
}

// ── hashcat update ────────────────────────────────────────────────────
function setupHashcatUpdate() {
    const btn = document.getElementById('btn-check-hashcat');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const status = document.getElementById('hashcat-update-status');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = 'Checking…';
        try {
            const res = await fetch('/api/system/hashcat/check');
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Check failed');
            if (!status) return;
            if (d.updateAvailable) {
                status.innerHTML = `<div class="update-note warn">Update available — <strong>${escapeHtml(d.latest)}</strong> (you have ${escapeHtml(d.current || '?')}).
                    <button id="btn-do-update" class="btn btn-sm btn-primary">Update now</button>
                    <a href="${escapeHtml(d.releaseUrl)}" target="_blank" rel="noopener">release notes ↗</a></div>`;
                document.getElementById('btn-do-update').addEventListener('click', doHashcatUpdate);
            } else if (d.current) {
                status.innerHTML = `<div class="update-note ok">hashcat ${escapeHtml(d.current)} is up to date.</div>`;
            } else {
                status.innerHTML = `<div class="update-note warn">hashcat isn't installed (latest: ${escapeHtml(d.latest || '?')}).
                    <button id="btn-do-update" class="btn btn-sm btn-primary">Install</button></div>`;
                const b = document.getElementById('btn-do-update'); if (b) b.addEventListener('click', doHashcatUpdate);
            }
        } catch (err) {
            if (status) status.innerHTML = `<div class="update-note err">${escapeHtml(err.message)}</div>`;
        } finally {
            btn.disabled = false; btn.textContent = orig;
        }
    });
}

async function doHashcatUpdate() {
    if (!confirm('Download and install the latest hashcat? Downloads ~70 MB and may take a minute. Your current install is kept as a backup.')) return;
    const status = document.getElementById('hashcat-update-status');
    if (status) status.innerHTML = `<div class="update-note">Updating… downloading &amp; extracting hashcat (this can take a minute)…</div>`;
    try {
        const res = await fetch('/api/system/hashcat/update', { method: 'POST' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Update failed');
        showToast(`hashcat updated to ${d.version || 'latest'}`, 'success', 7000);
        loadSystemInfo();
    } catch (err) {
        showToast(`Update failed: ${err.message}`, 'error', 8000);
        if (status) status.innerHTML = `<div class="update-note err">${escapeHtml(err.message)}</div>`;
    }
}

window.removeSession = async function(sessionName) {
    if (!confirm(`Delete session "${sessionName}"? This removes its restore/checkpoint files.`)) return;
    try {
        const res = await fetch('/api/hashcat/sessions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionName })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Delete failed');
        showToast('Session deleted', 'success');
        if (window.loadSessions) window.loadSessions();
    } catch (err) {
        showToast(`Failed to delete session: ${err.message}`, 'error');
    }
};

// Start app
document.addEventListener('DOMContentLoaded', initApp);
