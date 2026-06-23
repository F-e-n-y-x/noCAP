/**
 * NoCAP — Live Devices (task-manager style hardware telemetry)
 * Polls /api/system/stats while the System tab is open and renders meters.
 * Cross-platform (Windows + Linux) via the systeminformation-backed endpoint.
 */
let devicesTimer = null;

function fmtGB(bytes) {
    if (!bytes) return '0';
    return (bytes / (1024 ** 3)).toFixed(1);
}

function toneFor(pct) {
    if (pct >= 90) return 'danger';
    if (pct >= 70) return 'warn';
    return 'ok';
}
function tempTone(t) {
    if (t == null) return 'ok';
    if (t >= 85) return 'danger';
    if (t >= 70) return 'warn';
    return 'ok';
}

function meter(label, value, pct, tone) {
    const p = Math.max(0, Math.min(100, pct || 0));
    return `
        <div class="meter">
            <div class="meter-head"><span class="meter-label">${escapeHtml(label)}</span><span class="meter-value">${escapeHtml(value)}</span></div>
            <div class="meter-track"><div class="meter-fill ${tone}" style="width:${p}%"></div></div>
        </div>`;
}

function renderDevices(d) {
    const el = document.getElementById('devices-content');
    if (!el) return;

    const memBlock = `
        <div class="device-block">
            <div class="device-block-head"><span class="device-title">Memory</span>
                <span class="device-sub">${fmtGB(d.memory.used)} / ${fmtGB(d.memory.total)} GB</span></div>
            ${meter('In use', d.memory.percent + '%', d.memory.percent, toneFor(d.memory.percent))}
        </div>`;

    // All GPUs combined into a single preview block
    const gpus = d.gpus || [];
    const gpuBlock = gpus.length ? `
        <div class="device-block device-block-wide">
            <div class="device-block-head"><span class="device-title">Graphics</span>
                <span class="device-sub">${gpus.length} device${gpus.length > 1 ? 's' : ''}</span></div>
            <div class="gpu-list">
                ${gpus.map((g) => {
                    const vramPct = (g.memUsed != null && g.memTotal) ? (g.memUsed / g.memTotal) * 100 : null;
                    return `
                    <div class="gpu-item">
                        <div class="gpu-item-head">
                            <span class="gpu-item-name">${escapeHtml(g.model)}</span>
                            <span class="device-sub">${g.temp != null ? `<span class="temp ${tempTone(g.temp)}">${g.temp}°C</span>` : ''}${g.power != null ? ` · ${g.power}W` : ''}</span>
                        </div>
                        ${g.util != null ? meter('Load', g.util + '%', g.util, toneFor(g.util)) : '<div class="meter-na">Load not reported (integrated / no driver telemetry)</div>'}
                        ${vramPct != null ? meter('VRAM', `${g.memUsed} / ${g.memTotal} MB`, vramPct, toneFor(vramPct)) : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>` : '';

    el.innerHTML = `<div class="devices-grid">${memBlock}${gpuBlock}</div>`;
}

async function pollDevices() {
    const sys = document.getElementById('tab-system');
    if (!sys || !sys.classList.contains('active')) return; // only when visible
    try {
        const res = await fetch('/api/system/stats');
        if (!res.ok) return;
        renderDevices(await res.json());
    } catch { /* transient — keep last frame */ }
}

window.initDevices = function () {
    // Refresh immediately when the System tab is opened
    document.querySelectorAll('.nav-tab[data-tab="system"]').forEach((t) =>
        t.addEventListener('click', () => setTimeout(pollDevices, 50)));
    if (devicesTimer) clearInterval(devicesTimer);
    devicesTimer = setInterval(pollDevices, 2000);
    pollDevices();
};
