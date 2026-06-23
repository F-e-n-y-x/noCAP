/**
 * Cap Hashcat Web — WebSocket Client
 */

let ws = null;
let reconnectTimeout = null;
let connectAttempts = 0;

window.connectWebSocket = function() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log(`[WS] Connecting to ${wsUrl}...`);
    ws = new WebSocket(wsUrl);
    
    const indicator = document.getElementById('ws-indicator');
    
    ws.onopen = () => {
        console.log('[WS] Connected');
        connectAttempts = 0;
        
        if (indicator) {
            indicator.className = 'status-dot connected';
            indicator.querySelector('.status-text').textContent = 'Online';
            indicator.title = 'WebSocket connected';
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleWSMessage(msg.type, msg.data);
        } catch (err) {
            console.error('[WS] Error parsing message:', err);
        }
    };
    
    ws.onclose = () => {
        console.log('[WS] Disconnected');
        
        if (indicator) {
            indicator.className = 'status-dot disconnected';
            indicator.querySelector('.status-text').textContent = 'Offline';
            indicator.title = 'WebSocket disconnected — Reconnecting...';
        }
        
        // Auto-reconnect with exponential backoff
        connectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, connectAttempts), 30000);
        
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(window.connectWebSocket, delay);
    };
    
    ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        ws.close();
    };
};

/**
 * Handle incoming WebSocket messages and dispatch to components
 */
function handleWSMessage(type, data) {
    switch (type) {
        // ── Hashcat Job Events ──────────────────────────
        case 'connected': {
            // data = { state, job } from getStatus(); job.status is the parsed metrics.
            // On a page refresh while a job is running, restore the live view.
            const active = data.state && !['idle', 'completed', 'exhausted', 'aborted', 'error'].includes(data.state);
            if (data.job) {
                if (window.restoreLog) window.restoreLog(data.job.output);
                if (data.job.crackedPasswords && data.job.crackedPasswords.length && window.updateCrackedList) {
                    window.updateCrackedList(data.job.crackedPasswords);
                }
            }
            if (window.updateMonitorStatus) {
                window.updateMonitorStatus({ state: data.state, status: data.job && data.job.status, job: data.job });
            }
            if (active) showToast('Reconnected to a job already running — see live progress below', 'info');
            break;
        }

        case 'job:status':
            // data IS the parsed status object (metrics) — wrap it into the expected shape
            if (window.updateMonitorStatus) {
                window.updateMonitorStatus({ state: 'running', status: data });
            }
            break;
            
        case 'job:output':
            if (window.appendLogOutput) window.appendLogOutput(data.line);
            break;
            
        case 'job:starting':
            showToast('Hashcat job starting...', 'info');
            if (window.setCrackerState) window.setCrackerState('running');
            if (window.clearLogOutput) window.clearLogOutput();
            if (window.hideJobResult) window.hideJobResult();
            if (window.loadSessions) window.loadSessions();
            break;
            
        case 'job:finished':
            if (window.setCrackerState) window.setCrackerState('idle');
            if (window.showJobResult) window.showJobResult(data);
            if (window.loadHistory) window.loadHistory();
            if (window.loadSessions) window.loadSessions();
            if (data.crackedPasswords && data.crackedPasswords.length > 0) {
                if (window.updateCrackedList) window.updateCrackedList(data.crackedPasswords);
                if (window.loadPotfile) window.loadPotfile();
                showNotification('Password recovered', data.crackedPasswords.map(p => p.password).join(', '));
            }
            break;

        case 'job:error':
            // Spawn-level failure (e.g. binary missing) — surface it like any other outcome
            if (window.setCrackerState) window.setCrackerState('idle');
            if (window.showJobResult) {
                window.showJobResult({ state: 'error', error: data.error, crackedPasswords: [] });
            } else {
                showToast(`hashcat error: ${data.error}`, 'error');
            }
            break;
            
        case 'job:pausing':
            showToast('Saving checkpoint...', 'info');
            if (window.setCrackerState) window.setCrackerState('pausing');
            break;
            
        case 'job:resumed':
            showToast(`Resumed session: ${data.session}`, 'info');
            if (window.setCrackerState) window.setCrackerState('running');
            break;
            
        // ── Dictionary Download Events ──────────────────
        case 'dict:download:start':
            showToast(`Started downloading ${data.name}...`, 'info');
            if (window.updateDictDownloadState) window.updateDictDownloadState(data.id, 'starting');
            break;
            
        case 'dict:download:progress':
            if (window.updateDictDownloadProgress) {
                window.updateDictDownloadProgress(data.id, data.progress, data.downloaded, data.total);
            }
            break;
            
        case 'dict:download:complete':
            showToast(`Downloaded ${data.name} successfully`, 'success');
            if (window.updateDictDownloadState) window.updateDictDownloadState(data.id, 'complete');
            if (window.loadDictionaries) window.loadDictionaries(); // Refresh lists
            break;
            
        case 'dict:download:error':
            showToast(`Failed to download: ${data.error}`, 'error');
            if (window.updateDictDownloadState) window.updateDictDownloadState(data.id, 'error', data.error);
            break;
            
        default:
            console.log(`[WS] Unhandled message type: ${type}`, data);
    }
}
