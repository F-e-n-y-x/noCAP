/**
 * Cap Hashcat Web — Monitor Component
 */

window.initMonitor = function() {
    const clearBtn = document.getElementById('btn-clear-log');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const out = document.getElementById('log-output');
            if (out) out.innerHTML = '';
        });
    }
};

window.updateMonitorStatus = function(data) {
    const state = data.state || 'running'; // running, paused, idle, etc
    const status = data.status || data.job?.status; // from hashcat-manager parseStatus()
    
    // Update general status
    const statVal = document.getElementById('monitor-status');
    const statIcon = document.querySelector('#card-status .stat-icon');
    
    if (statVal && statIcon) {
        if (state === 'idle') {
            statVal.textContent = 'Idle';
            statIcon.className = 'stat-icon status-idle';
            statVal.style.color = '';
        } else if (state === 'running' && status) {
            statVal.textContent = status.statusLabel || 'Running';
            statIcon.className = 'stat-icon status-running';
            statVal.style.color = 'var(--primary)';
        } else if (state === 'pausing') {
            statVal.textContent = 'Pausing...';
            statIcon.className = 'stat-icon status-idle';
            statVal.style.color = 'var(--warning)';
        } else {
            statVal.textContent = state.charAt(0).toUpperCase() + state.slice(1);
            statIcon.className = 'stat-icon status-idle';
            statVal.style.color = '';
        }
    }
    
    // Update metrics if we have hashcat status
    if (status) {
        // Speed
        const speedEl = document.getElementById('monitor-speed');
        if (speedEl) speedEl.textContent = status.speedFormatted || '0 H/s';
        
        // Progress
        const progVal = document.getElementById('monitor-progress');
        const progBar = document.getElementById('monitor-progress-bar');
        const progCur = document.getElementById('progress-current');
        const progTot = document.getElementById('progress-total');
        
        if (status.progressPercent !== undefined) {
            const pctText = `${status.progressPercent.toFixed(2)}%`;
            if (progVal) progVal.textContent = pctText;
            const bigPct = document.getElementById('progress-pct-big');
            if (bigPct) bigPct.textContent = pctText;
        }

        if (progBar && status.progressPercent !== undefined) {
            progBar.style.width = `${Math.min(status.progressPercent, 100)}%`;
            progBar.classList.toggle('active', state === 'running' && status.progressPercent < 100);
        }
        
        if (progCur && progTot && status.progress) {
            progCur.textContent = status.progress.current.toLocaleString();
            progTot.textContent = status.progress.total.toLocaleString();
        }
        
        // ETA
        const etaEl = document.getElementById('monitor-eta');
        if (etaEl) etaEl.textContent = status.etaFormatted || 'N/A';
        
        // Temp
        const tempEl = document.getElementById('monitor-temp');
        if (tempEl && status.temperature) {
            tempEl.textContent = `${status.temperature} °C`;
            // Color code temperature
            if (status.temperature > 85) tempEl.style.color = 'var(--danger)';
            else if (status.temperature > 75) tempEl.style.color = 'var(--warning)';
            else tempEl.style.color = '';
        }
        
        // Cracked
        const crackEl = document.getElementById('monitor-cracked');
        if (crackEl && status.recovered) {
            crackEl.textContent = `${status.recovered.cracked} / ${status.recovered.total}`;
        }
    } else if (state === 'idle') {
        // Reset metrics
        ['monitor-speed', 'monitor-progress', 'monitor-eta', 'monitor-cracked'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = id === 'monitor-progress' ? '0%' : (id === 'monitor-speed' ? '0 H/s' : (id === 'monitor-cracked' ? '0 / 0' : 'N/A'));
        });
        const bar = document.getElementById('monitor-progress-bar');
        if (bar) bar.style.width = '0%';
    }
    
    // Update Cracked Passwords list if running job has them
    if (data.job && data.job.crackedPasswords && data.job.crackedPasswords.length > 0) {
        window.updateCrackedList(data.job.crackedPasswords);
    }
    
    // Sync cracker buttons state
    if (window.setCrackerState) {
        window.setCrackerState(state);
    }
};

window.updateCrackedList = function(passwords) {
    const list = document.getElementById('cracked-list');
    if (!list) return;
    
    if (passwords.length === 0) {
        list.innerHTML = '<div class="empty-state">No passwords cracked yet</div>';
        return;
    }
    
    list.innerHTML = passwords.map(p => `
        <div class="cracked-item">
            <span class="cracked-password">${escapeHtml(p.password)}</span>
            <span class="cracked-network">${p.essid ? `SSID: ${escapeHtml(p.essid)}` : 'Recovered'}</span>
        </div>
    `).join('');
};

window.appendLogOutput = function(line) {
    const out = document.getElementById('log-output');
    if (!out) return;
    
    const div = document.createElement('div');
    
    // Basic formatting
    if (line.includes('Cracking') || line.includes('cracked')) {
        div.className = 'log-line success';
    } else if (line.includes('error') || line.includes('Warning')) {
        div.className = 'log-line error';
    } else if (line.startsWith('*')) {
        div.className = 'log-line highlight';
    } else {
        div.className = 'log-line';
    }
    
    div.textContent = line;
    out.appendChild(div);
    
    // Keep max 500 lines to prevent DOM bloat
    while (out.children.length > 500) {
        out.removeChild(out.firstChild);
    }
    
    // Auto scroll to bottom
    out.scrollTop = out.scrollHeight;
};

window.clearLogOutput = function() {
    const out = document.getElementById('log-output');
    if (out) out.innerHTML = '';
};

// Repaint the live log from saved output (used when reconnecting to a running job)
window.restoreLog = function(lines) {
    const out = document.getElementById('log-output');
    if (!out || !Array.isArray(lines) || lines.length === 0) return;
    out.innerHTML = '';
    for (const line of lines) {
        if (line && !line.startsWith('{')) window.appendLogOutput(line.replace(/^\[stderr\]\s*/, ''));
    }
};

window.hideJobResult = function() {
    const el = document.getElementById('job-result');
    if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
};

// Map a raw hashcat error line to a plain-language explanation.
function explainHashcatError(raw) {
    const r = (raw || '').toLowerCase();
    if (r.includes('no hashes loaded'))
        return 'The hash file has no usable WPA hashes. Re-upload a .cap/.pcapng that contains a complete 4-way handshake or a PMKID.';
    if (r.includes('separator unmatched') || r.includes('token length') || r.includes('on line'))
        return 'The hash file is not valid for WPA mode 22000. Try re-converting the capture file.';
    if (r.includes('no devices found') || r.includes('no opencl') || r.includes('no cuda') || r.includes('clcreatecontext'))
        return 'No usable GPU/OpenCL device was found. Install your GPU drivers and the OpenCL/CUDA runtime — or run hashcat on CPU (add -D 1 / --force in Custom Arguments).';
    if (r.includes('not enough'))
        return 'Not enough device memory for this attack. Close other GPU apps, lower the workload, or use a smaller wordlist.';
    if (r.includes('permission denied') || r.includes('no such file'))
        return "hashcat couldn't access a required file. Check the file still exists and is readable.";
    return null;
}

/**
 * Render the outcome banner after a job ends. Explains WHAT happened:
 * cracked / no-match(exhausted) / stopped / error — with next-step hints.
 */
window.showJobResult = function(data) {
    const el = document.getElementById('job-result');
    if (!el) return;

    const state = data.state || 'completed';
    const cracked = data.crackedPasswords || [];
    const ctx = data.context || {};
    const source = ctx.dictionary ? `wordlist (${ctx.dictionary})`
        : ctx.mask ? `mask (${ctx.mask})`
        : 'keyspace';

    let tone, icon, title, bodyHtml, hints = [], toast;

    if (state === 'cracked' || cracked.length > 0) {
        tone = 'success'; icon = '✓';
        title = `Password recovered (${cracked.length})`;
        bodyHtml = `<div class="result-creds">` + cracked.map(p => `
            <div class="result-cred">
                <span class="result-pass">${escapeHtml(p.password)}</span>
                ${p.essid ? `<span class="result-essid">${escapeHtml(p.essid)}</span>` : ''}
            </div>`).join('') + `</div>`;
        toast = { type: 'success', msg: `Cracked: ${cracked.map(p => p.password).join(', ')}` };
    } else if (state === 'exhausted') {
        tone = 'warning'; icon = '∅';
        title = 'No password found';
        bodyHtml = `<p>hashcat searched the entire ${escapeHtml(source)} but none of the candidates matched the handshake. The network was <strong>not</strong> cracked — this is a normal result, not an error.</p>`;
        hints = [
            'Try a larger wordlist (e.g. RockYou ~14M passwords).',
            'Add a rules file (e.g. best64) to mutate each word.',
            'For short/numeric keys, try a Brute-force / Mask attack.',
        ];
        toast = { type: 'warning', msg: 'No match — the password was not in the wordlist' };
    } else if (state === 'aborted') {
        tone = 'neutral'; icon = '■';
        title = 'Job stopped';
        bodyHtml = `<p>You stopped the job before it finished. Progress was checkpointed — you can resume it from the System tab.</p>`;
        toast = { type: 'info', msg: 'Job stopped' };
    } else if (state === 'error') {
        tone = 'error'; icon = '!';
        title = 'hashcat error';
        const friendly = explainHashcatError(data.error);
        bodyHtml = (friendly ? `<p>${escapeHtml(friendly)}</p>` : `<p>hashcat could not complete the job.</p>`)
            + (data.error ? `<pre class="result-raw">${escapeHtml(data.error)}</pre>` : '');
        toast = { type: 'error', msg: data.error || 'hashcat failed' };
    } else {
        tone = 'neutral'; icon = '✓';
        title = 'Finished';
        bodyHtml = `<p>hashcat finished. The target was already solved (found in the potfile) or there was nothing to process.</p>`;
        toast = { type: 'info', msg: 'Job finished' };
    }

    el.className = `job-result ${tone}`;
    el.innerHTML = `
        <div class="result-icon">${icon}</div>
        <div class="result-body">
            <h3>${escapeHtml(title)}</h3>
            ${bodyHtml}
            ${hints.length ? `<ul class="result-hints">${hints.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul>` : ''}
        </div>`;
    el.classList.remove('hidden');

    if (toast && window.showToast) showToast(toast.msg, toast.type, 7000);
    if (window.switchTab) switchTab('workspace');
};
