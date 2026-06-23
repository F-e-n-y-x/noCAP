/**
 * Cap Hashcat Web — GPU Component
 */

window.initGPU = function() {
    const refreshGpuBtn = document.getElementById('btn-refresh-gpu');
    const refreshPotfileBtn = document.getElementById('btn-refresh-potfile');
    const refreshSessionsBtn = document.getElementById('btn-refresh-sessions');
    
    if (refreshGpuBtn) {
        refreshGpuBtn.addEventListener('click', async () => {
            const btn = refreshGpuBtn;
            btn.disabled = true;
            btn.textContent = 'Refreshing...';
            try {
                const res = await fetch('/api/system/gpu?refresh=true');
                const data = await res.json();
                window.appState.gpuInfo = data;
                if (window.renderGPUInfo) window.renderGPUInfo(data);
                if (window.renderGPUPreset) window.renderGPUPreset(data);
                showToast('GPU info refreshed', 'success');
            } catch (err) {
                showToast(`Failed to refresh GPU: ${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Refresh';
            }
        });
    }
    
    if (refreshPotfileBtn) {
        refreshPotfileBtn.addEventListener('click', () => {
            if (window.loadPotfile) {
                window.loadPotfile();
                showToast('Potfile refreshed', 'success');
            }
        });
    }
    
    if (refreshSessionsBtn) {
        refreshSessionsBtn.addEventListener('click', () => {
            if (window.loadSessions) {
                window.loadSessions();
                showToast('Sessions refreshed', 'success');
            }
        });
    }
};

window.renderGPUInfo = function(data) {
    const container = document.getElementById('gpu-info');
    if (!container) return;
    
    if (!data || !data.gpus || data.gpus.length === 0) {
        container.innerHTML = '<div class="empty-state">No compatible GPUs detected</div>';
        return;
    }
    
    let html = '';
    
    data.gpus.forEach((gpu, index) => {
        const isPrimary = data.primaryGPU && data.primaryGPU.model === gpu.model;
        
        let iconColor = 'var(--primary)';
        if (gpu.vendor === 'NVIDIA') iconColor = '#76b900';
        else if (gpu.vendor === 'AMD') iconColor = '#ed1c24';
        else if (gpu.vendor === 'Intel') iconColor = '#0071c5';
        
        html += `
            <div class="info-row" style="align-items:flex-start; margin-bottom:1rem; padding-bottom:1rem; border-bottom:1px solid var(--border)">
                <div style="display:flex; gap:1rem; align-items:center; width:100%">
                    <div style="width:40px; height:40px; border-radius:var(--radius-md); background:var(--surface-2); display:flex; align-items:center; justify-content:center; color:${iconColor}">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    </div>
                    <div style="flex:1">
                        <div style="display:flex; justify-content:space-between; align-items:center">
                            <span style="font-weight:600; font-family:var(--font-mono); font-size:1.1rem">${gpu.model}</span>
                            ${isPrimary ? '<span class="badge-recommended" style="font-size:0.7rem">Primary</span>' : ''}
                        </div>
                        <div style="font-size:0.85rem; color:var(--text-muted); display:flex; gap:1rem; margin-top:0.3rem">
                            <span>Vendor: ${gpu.vendor}</span>
                            ${gpu.vram ? `<span>VRAM: ${gpu.vram} MB</span>` : ''}
                        </div>
                        ${gpu.temperatureGpu ? `
                            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.3rem">
                                Temp: <span style="color:${gpu.temperatureGpu > 85 ? 'var(--danger)' : 'var(--success)'}">${gpu.temperatureGpu}°C</span>
                                ${gpu.power ? ` | Power: ${gpu.power}W` : ''}
                                ${gpu.utilizationGpu !== null ? ` | Util: ${gpu.utilizationGpu}%` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        if (isPrimary && gpu.preset) {
            html += `
                <div style="background:var(--surface-2); padding:1rem; border-radius:var(--radius-md); border-left:3px solid var(--accent); margin-top:0.5rem">
                    <div style="font-weight:600; color:var(--foreground); margin-bottom:0.3rem">Applied Preset: ${gpu.preset.name}</div>
                    <div style="font-size:0.9rem; color:var(--text-muted); margin-bottom:0.5rem">${gpu.preset.description}</div>
                    <div style="font-family:var(--font-mono); font-size:0.85rem; background:var(--background); padding:0.5rem; border-radius:var(--radius-sm); color:var(--muted-foreground)">
                        Flags: ${window.appState.gpuInfo.presetArgs ? window.appState.gpuInfo.presetArgs.join(' ') : ''}
                    </div>
                </div>
            `;
        }
    });
    
    container.innerHTML = html;
};
