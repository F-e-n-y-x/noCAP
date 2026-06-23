/**
 * Cap Hashcat Web — Dictionary Manager Component
 */

window.initDictionary = function() {
    const uploadZone = document.getElementById('dict-upload-zone');
    const fileInput = document.getElementById('dict-file-input');
    const browseBtn = document.getElementById('dict-browse-btn');
    
    if (!uploadZone || !fileInput) return;
    
    browseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => uploadZone.classList.add('dragover'), false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => uploadZone.classList.remove('dragover'), false);
    });
    
    uploadZone.addEventListener('drop', e => {
        if (e.dataTransfer.files.length > 0) handleDictUpload(e.dataTransfer.files[0]);
    });
    
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) handleDictUpload(this.files[0]);
    });

    const refreshBtn = document.getElementById('btn-refresh-dicts');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            const orig = refreshBtn.textContent;
            refreshBtn.textContent = 'Refreshing…';
            try { if (window.loadDictionaries) await window.loadDictionaries(); showToast('Dictionaries refreshed', 'success'); }
            catch (e) { showToast('Refresh failed', 'error'); }
            finally { refreshBtn.disabled = false; refreshBtn.textContent = orig; }
        });
    }
};

function handleDictUpload(file) {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const allowed = ['.txt', '.dict', '.wordlist', '.lst', '.rule'];
    
    if (!allowed.includes(ext)) {
        showToast(`Invalid file. Allowed: ${allowed.join(', ')}`, 'error');
        return;
    }
    
    showToast(`Uploading ${file.name}...`, 'info');
    
    const formData = new FormData();
    formData.append('file', file);
    
    fetch('/api/upload/dictionary', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('Dictionary uploaded successfully', 'success');
            if (window.loadDictionaries) window.loadDictionaries();
            if (ext === '.rule' && window.loadRules) window.loadRules();
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    })
    .catch(err => {
        showToast(err.message, 'error');
    });
}

window.renderDictSources = function(sources) {
    const container = document.getElementById('dict-sources');
    if (!container) return;

    // Recommended first, then keep the curated order (wifi → quick → … → large)
    const ordered = sources.slice().sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));

    container.innerHTML = ordered.map(s => `
        <div class="dict-card ${s.recommended ? 'recommended' : ''}" id="source-${escapeHtml(s.id)}">
            <div class="dict-header">
                <span class="dict-title">${escapeHtml(s.name)}</span>
                ${s.recommendedFor === 'wifi' ? '<span class="badge-wifi">WiFi</span>' : ''}
                ${s.recommended ? '<span class="badge-recommended">Recommended</span>' : ''}
            </div>
            <div class="dict-desc">${escapeHtml(s.description)}</div>
            <div class="dict-meta">
                <span>${escapeHtml((s.category || '').toUpperCase())}</span>
                <span>${s.lines ? `${Number(s.lines).toLocaleString()} words · ` : ''}${escapeHtml(s.size || '')}</span>
            </div>
            <div class="dict-actions" id="actions-${escapeHtml(s.id)}">
                ${s.isDownloaded 
                    ? `<button class="btn btn-sm btn-ghost" disabled>Already Downloaded</button>`
                    : s.isDownloading
                        ? `<div style="width:100%">
                             <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px">
                               <span id="dl-text-${s.id}">Downloading...</span>
                               <span id="dl-pct-${s.id}">${s.downloadProgress || 0}%</span>
                             </div>
                             <div class="progress-bar-container">
                               <div class="progress-bar" id="dl-bar-${s.id}" style="width:${s.downloadProgress || 0}%"></div>
                             </div>
                           </div>`
                        : `<button class="btn btn-sm btn-primary" onclick="downloadDictionary('${s.id}')">
                             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                             Download
                           </button>`
                }
            </div>
        </div>
    `).join('');
};

window.renderDownloadedDicts = function(dicts) {
    const container = document.getElementById('dict-downloaded');
    if (!container) return;
    
    // Filter out system dicts for the management UI (we can't delete them)
    const managed = dicts.filter(d => d.source !== 'system');
    
    if (managed.length === 0) {
        container.innerHTML = '<div class="empty-state">No dictionaries downloaded yet</div>';
        return;
    }
    
    container.innerHTML = managed.map(d => `
        <div class="dict-list-item">
            <div class="dict-list-info">
                <div class="file-icon" style="color:var(--primary)">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                </div>
                <div>
                    <div class="dict-list-name">${d.name}</div>
                    <div class="dict-list-meta">
                        <span>${d.sizeFormatted}</span>
                        ${d.lineCount ? `<span>~${d.lineCount.toLocaleString()} words</span>` : ''}
                        <span style="opacity:0.5">${d.source}</span>
                    </div>
                </div>
            </div>
            <button class="btn btn-sm btn-danger" onclick="deleteDictionary('${d.path.replace(/\\/g, '\\\\')}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div>
    `).join('');
};

window.downloadDictionary = async function(sourceId) {
    try {
        const res = await fetch('/api/dictionaries/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceId })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        // UI will update via WebSocket events
    } catch (err) {
        showToast(`Download failed: ${err.message}`, 'error');
    }
};

window.deleteDictionary = async function(filePath) {
    if (!confirm('Are you sure you want to delete this wordlist?')) return;
    
    try {
        const res = await fetch('/api/dictionaries', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        showToast('Dictionary deleted', 'success');
        if (window.loadDictionaries) window.loadDictionaries();
    } catch (err) {
        showToast(`Delete failed: ${err.message}`, 'error');
    }
};

// WebSocket update hooks
window.updateDictDownloadState = function(id, state, errorText = '') {
    const actions = document.getElementById(`actions-${id}`);
    if (!actions) return;
    
    if (state === 'starting') {
        actions.innerHTML = `
            <div style="width:100%">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px">
                    <span id="dl-text-${id}">Starting...</span>
                    <span id="dl-pct-${id}">0%</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar" id="dl-bar-${id}" style="width:0%"></div>
                </div>
            </div>
        `;
    } else if (state === 'complete') {
        actions.innerHTML = `<button class="btn btn-sm btn-ghost" disabled>Already Downloaded</button>`;
    } else if (state === 'error') {
        actions.innerHTML = `
            <div style="color:var(--danger); font-size:0.8rem; margin-right:1rem">${errorText}</div>
            <button class="btn btn-sm btn-primary" onclick="downloadDictionary('${id}')">Retry</button>
        `;
    }
};

window.updateDictDownloadProgress = function(id, progress, downloadedText, totalText) {
    const bar = document.getElementById(`dl-bar-${id}`);
    const pct = document.getElementById(`dl-pct-${id}`);
    const txt = document.getElementById(`dl-text-${id}`);
    
    if (bar) bar.style.width = `${progress}%`;
    if (pct) pct.textContent = `${progress}%`;
    if (txt) txt.textContent = `${downloadedText} / ${totalText}`;
};
