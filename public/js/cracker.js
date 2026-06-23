/**
 * Cap Hashcat Web — Cracker Component
 */

let currentAttackMode = 0;

window.initCracker = function() {
    const startBtn = document.getElementById('btn-start-crack');
    const stopBtn = document.getElementById('btn-stop-crack');
    const pauseBtn = document.getElementById('btn-pause-crack');
    const modeBtns = document.querySelectorAll('.attack-mode-btn');
    
    // Attack Mode selection
    modeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentAttackMode = parseInt(btn.dataset.mode);
            updateConfigVisibility(currentAttackMode);
        });
    });
    
    // Initial visibility
    updateConfigVisibility(0);
    
    // Action buttons
    if (startBtn) startBtn.addEventListener('click', startCracking);
    if (stopBtn) stopBtn.addEventListener('click', stopCracking);
    if (pauseBtn) pauseBtn.addEventListener('click', pauseCracking);
};

function updateConfigVisibility(mode) {
    const dictGroup = document.getElementById('dict-group');
    const dict2Group = document.getElementById('dict2-group');
    const maskGroup = document.getElementById('mask-group');
    const ruleGroup = document.getElementById('rule-group');
    
    // Reset all
    [dictGroup, dict2Group, maskGroup, ruleGroup].forEach(g => {
        if(g) g.classList.add('hidden');
    });
    
    switch (mode) {
        case 0: // Dictionary
            if (dictGroup) dictGroup.classList.remove('hidden');
            if (ruleGroup) ruleGroup.classList.remove('hidden');
            break;
        case 1: // Combinator
            if (dictGroup) dictGroup.classList.remove('hidden');
            if (dict2Group) dict2Group.classList.remove('hidden');
            break;
        case 3: // Brute-force/Mask
            if (maskGroup) maskGroup.classList.remove('hidden');
            break;
        case 6: // Hybrid WL+Mask
        case 7: // Hybrid Mask+WL
            if (dictGroup) dictGroup.classList.remove('hidden');
            if (maskGroup) maskGroup.classList.remove('hidden');
            break;
    }
}

window.updateHashSelect = function(files) {
    const select = document.getElementById('hash-file-select');
    if (!select) return;
    
    // Keep current selection if possible
    const currentVal = select.value;
    
    let html = '<option value="">— Select a hash file —</option>';
    files.forEach(f => {
        html += `<option value="${f.path}">${f.name} (${f.hashCount} hashes)</option>`;
    });
    
    select.innerHTML = html;
    if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
        select.value = currentVal;
    }
};

window.updateDictSelects = function(dicts) {
    const selects = [
        document.getElementById('dict-select'),
        document.getElementById('dict2-select')
    ];
    
    selects.forEach(select => {
        if (!select) return;
        
        const currentVal = select.value;
        let html = '<option value="">— Select a dictionary —</option>';
        
        // Group by source
        const downloaded = dicts.filter(d => d.source !== 'system');
        const system = dicts.filter(d => d.source === 'system');
        
        if (downloaded.length > 0) {
            html += '<optgroup label="Downloaded & Uploaded">';
            downloaded.forEach(d => {
                html += `<option value="${d.path}">${d.name} (${d.sizeFormatted})</option>`;
            });
            html += '</optgroup>';
        }
        
        if (system.length > 0) {
            html += '<optgroup label="System Wordlists">';
            system.forEach(d => {
                html += `<option value="${d.path}">${d.name} (${d.sizeFormatted})</option>`;
            });
            html += '</optgroup>';
        }
        
        select.innerHTML = html;
        if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
            select.value = currentVal;
        }
    });
};

window.updateRuleSelect = function(rules) {
    const select = document.getElementById('rule-select');
    if (!select) return;
    
    const currentVal = select.value;
    let html = '<option value="">— No rules —</option>';
    
    rules.forEach(r => {
        html += `<option value="${r.path}">${r.name}</option>`;
    });
    
    select.innerHTML = html;
    if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
        select.value = currentVal;
    }
};

window.renderGPUPreset = function(gpuInfo) {
    const card = document.getElementById('gpu-preset-card');
    if (!card) return;
    
    if (!gpuInfo || !gpuInfo.preset) {
        card.innerHTML = `<span class="error">GPU detection failed</span>`;
        return;
    }
    
    const preset = gpuInfo.preset;
    
    card.innerHTML = `
        <span class="gpu-preset-name">${escapeHtml(preset.name)}</span>
        <span class="gpu-preset-desc">${escapeHtml(preset.description)}</span>
        <div style="margin-top:0.5rem; font-family:var(--font-mono); font-size:var(--text-xs); color:var(--subtle-foreground);">
            -w ${escapeHtml(String(preset.workload))} &middot; abort ${escapeHtml(String(preset.tempAbort))}&deg;C &middot; ~${escapeHtml(String(preset.estimatedSpeed))}
        </div>
    `;

    // Tier indicator (uses semantic tokens, not hardcoded neon)
    card.style.borderLeftColor =
        preset.tier === 'integrated' ? 'var(--warning)' :
        preset.tier === 'unknown'    ? 'var(--border-strong)' :
        'var(--accent)';
};

async function startCracking() {
    const hashFile = document.getElementById('hash-file-select').value;
    if (!hashFile) {
        showToast('Please select a hash file first', 'error');
        return;
    }
    
    const payload = {
        hashFile,
        attackMode: currentAttackMode,
        hashMode: 22000,
        applyPreset: true
    };
    
    // Add mode-specific params
    const dict = document.getElementById('dict-select')?.value;
    const mask = document.getElementById('mask-input')?.value;
    
    if ([0, 1, 6, 7].includes(currentAttackMode)) {
        if (!dict) {
            showToast('Please select a dictionary', 'error');
            return;
        }
        payload.dictionary = dict;
    }
    
    if (currentAttackMode === 1) {
        const dict2 = document.getElementById('dict2-select')?.value;
        if (!dict2) {
            showToast('Please select a second dictionary', 'error');
            return;
        }
        payload.dictionary2 = dict2;
    }
    
    if ([3, 6, 7].includes(currentAttackMode)) {
        if (!mask) {
            showToast('Please enter a mask pattern', 'error');
            return;
        }
        payload.mask = mask;
    }
    
    if (currentAttackMode === 0) {
        const rule = document.getElementById('rule-select')?.value;
        if (rule) payload.ruleFile = rule;
    }
    
    const customArgs = document.getElementById('custom-args')?.value;
    if (customArgs) {
        // Simple split by space, not handling quotes properly for now
        payload.customArgs = customArgs.trim().split(/\s+/);
    }
    
    // Call API
    try {
        const res = await fetch('/api/hashcat/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        // The workspace already shows live progress beside the controls
        switchTab('workspace');
    } catch (err) {
        showToast(`Failed to start: ${err.message}`, 'error');
    }
}

async function stopCracking() {
    try {
        const res = await fetch('/api/hashcat/stop', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

async function pauseCracking() {
    try {
        const res = await fetch('/api/hashcat/pause', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

window.resumeSession = async function(sessionName) {
    try {
        const res = await fetch('/api/hashcat/resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionName })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        switchTab('workspace');
    } catch (err) {
        showToast(`Failed to resume: ${err.message}`, 'error');
    }
};

window.setCrackerState = function(state) {
    const startBtn = document.getElementById('btn-start-crack');
    const stopBtn = document.getElementById('btn-stop-crack');
    const pauseBtn = document.getElementById('btn-pause-crack');
    
    if (!startBtn || !stopBtn || !pauseBtn) return;
    
    if (state === 'running') {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        pauseBtn.disabled = false;
        pauseBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause';
    } else if (state === 'pausing' || state === 'stopping') {
        startBtn.disabled = true;
        stopBtn.disabled = true;
        pauseBtn.disabled = true;
    } else {
        // idle
        startBtn.disabled = false;
        stopBtn.disabled = true;
        pauseBtn.disabled = true;
    }
};
