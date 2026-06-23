/**
 * Cap Hashcat Web — Upload Component
 */

window.initUpload = function() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    
    if (!dropZone || !fileInput) return;
    
    // Browse click
    browseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });
    
    // Drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        }, false);
    });
    
    // Handle drop
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) handleUpload(files[0]);
    }, false);
    
    // Handle select
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) handleUpload(this.files[0]);
    });
};

/**
 * Handle file upload with progress tracking
 */
function handleUpload(file) {
    // Validate extension
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const allowed = ['.cap', '.pcap', '.pcapng', '.hc22000', '.hccapx'];
    
    if (!allowed.includes(ext)) {
        showToast(`Invalid file type. Allowed: ${allowed.join(', ')}`, 'error');
        return;
    }
    
    if (file.size > 100 * 1024 * 1024) {
        showToast('File too large. Maximum size is 100MB', 'error');
        return;
    }
    
    // UI setup
    document.getElementById('upload-progress').classList.remove('hidden');
    document.getElementById('conversion-result').classList.add('hidden');
    document.getElementById('upload-filename').textContent = file.name;
    const progressBar = document.getElementById('upload-progress-bar');
    const statusBadge = document.getElementById('upload-status');
    const msgEl = document.getElementById('upload-message');
    
    progressBar.style.width = '0%';
    statusBadge.textContent = 'Uploading...';
    statusBadge.className = 'status-badge';
    msgEl.textContent = 'Transferring file to server...';
    
    // Create FormData
    const formData = new FormData();
    formData.append('file', file);
    
    // Upload via XHR for progress event
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = `${percent}%`;
            
            if (percent === 100) {
                statusBadge.textContent = 'Converting...';
                msgEl.textContent = 'Parsing handshakes and converting to hc22000 format...';
                // Add indeterminate animation class
                progressBar.style.animation = 'pulse 1s infinite alternate';
            }
        }
    });
    
    xhr.addEventListener('load', () => {
        progressBar.style.animation = ''; // remove indeterminate
        
        try {
            const response = JSON.parse(xhr.responseText);
            
            if (xhr.status >= 200 && xhr.status < 300) {
                if (response.success) {
                    statusBadge.textContent = 'Success';
                    statusBadge.className = 'status-badge success';
                    progressBar.style.width = '100%';
                    msgEl.textContent = 'File uploaded and converted successfully.';
                    showConversionResult(response.conversion);
                    
                    // Refresh file lists
                    if (window.loadFiles) window.loadFiles();
                    
                    showToast('File ready for cracking!', 'success');
                } else {
                    // Upload succeeded but conversion failed
                    handleConversionError(response.conversion, statusBadge, progressBar, msgEl);
                }
            } else {
                // Server error
                statusBadge.textContent = 'Error';
                statusBadge.className = 'status-badge error';
                msgEl.textContent = response.error || 'Upload failed';
                showToast(response.error || 'Upload failed', 'error');
            }
        } catch (err) {
            statusBadge.textContent = 'Error';
            statusBadge.className = 'status-badge error';
            msgEl.textContent = 'Failed to parse server response';
            showToast('Server returned invalid response', 'error');
        }
    });
    
    xhr.addEventListener('error', () => {
        progressBar.style.animation = '';
        statusBadge.textContent = 'Error';
        statusBadge.className = 'status-badge error';
        msgEl.textContent = 'Network error occurred during upload';
        showToast('Network error during upload', 'error');
    });
    
    xhr.open('POST', '/api/upload');
    xhr.send(formData);
}

function handleConversionError(conversion, badge, bar, msg) {
    badge.textContent = 'Failed';
    badge.className = 'status-badge error';
    bar.style.backgroundColor = 'var(--danger)';
    
    const errors = conversion.errors || ['Conversion failed'];
    msg.textContent = errors[0];
    
    const details = document.getElementById('conversion-details');
    details.innerHTML = `
        <p class="error"><strong>Error:</strong> ${errors.join('<br>')}</p>
        <p><strong>Method used:</strong> ${conversion.method}</p>
        <p>Make sure the capture file contains a complete 4-way WPA handshake or PMKID.</p>
    `;
    
    const resBox = document.getElementById('conversion-result');
    resBox.classList.remove('hidden');
    resBox.style.borderColor = 'rgba(255,51,51,0.3)';
    resBox.style.backgroundColor = 'rgba(255,51,51,0.05)';
    resBox.querySelector('h3').style.color = 'var(--danger)';
    resBox.querySelector('h3').textContent = 'Conversion Failed';
}

function showConversionResult(conv) {
    const resBox = document.getElementById('conversion-result');
    resBox.classList.remove('hidden');
    
    // Reset styles in case of previous error
    resBox.style.borderColor = '';
    resBox.style.backgroundColor = '';
    resBox.querySelector('h3').style.color = '';
    resBox.querySelector('h3').textContent = 'Conversion Complete';
    
    const details = document.getElementById('conversion-details');
    
    let networksHtml = '';
    if (conv.networks && conv.networks.length > 0) {
        networksHtml = `<div style="margin-top:0.8rem"><strong>Networks found:</strong><ul>`;
        for (const net of conv.networks) {
            networksHtml += `<li>${net.essid || '&lt;Hidden SSID&gt;'} <span style="opacity:0.5">(${net.bssid})</span></li>`;
        }
        networksHtml += `</ul></div>`;
    } else {
        networksHtml = `<p><strong>Networks:</strong> None detected in handshakes</p>`;
    }
    
    details.innerHTML = `
        <p><strong>Output File:</strong> ${conv.outputFile}</p>
        <p><strong>Hashes Extracted:</strong> ${conv.hashes} (WPA*02: ${conv.handshakes}, WPA*01: ${conv.pmkids})</p>
        <p><strong>Method:</strong> ${conv.method}</p>
        ${networksHtml}
    `;
}

window.renderFilesList = function(files) {
    const section = document.getElementById('uploaded-files');
    const list = document.getElementById('files-list');
    
    if (!section || !list) return;
    
    if (files.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    section.classList.remove('hidden');
    
    // Sort by modified desc
    files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    
    list.innerHTML = files.map(f => `
        <div class="file-item">
            <div class="file-info">
                <div class="file-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                </div>
                <div>
                    <div class="file-name">${f.name}</div>
                    <div class="file-meta">
                        ${f.hashCount} hashes · ${(f.size/1024).toFixed(1)} KB · ${new Date(f.modified).toLocaleString()}
                    </div>
                </div>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="selectFileForCracking('${f.name}')">Select</button>
        </div>
    `).join('');
};

window.selectFileForCracking = function(filename) {
    switchTab('workspace');
    const select = document.getElementById('hash-file-select');
    if (select) {
        // Need to match the full path value
        const option = Array.from(select.options).find(opt => opt.text.includes(filename));
        if (option) select.value = option.value;
    }
};
