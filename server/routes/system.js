/**
 * Cap Hashcat Web — System Info Routes
 * GPU detection, health check, benchmarks.
 */

const express = require('express');
const router = express.Router();
const si = require('systeminformation');
const { detectGPUs, invalidateCache, isVirtualGpu } = require('../gpu-detector');
const { getSystemHealth, runBenchmark, getHashcatVersion } = require('../hashcat-utils');
const { checkUpdate, performUpdate } = require('../hashcat-updater');
const { checkAppUpdate, downloadAppUpdate, installAppUpdate } = require('../app-updater');
const config = require('../config');

let updateInProgress = false;
let appUpdateBusy = false;

/** GET /api/system/app/check — compare NoCAP version with the GitHub repo. */
router.get('/app/check', async (req, res) => {
    try { res.json(await checkAppUpdate()); }
    catch (err) { res.status(502).json({ error: `Update check failed: ${err.message}` }); }
});

/** POST /api/system/app/download — download the latest NoCAP source (step 1). */
router.post('/app/download', async (req, res) => {
    if (appUpdateBusy) return res.status(409).json({ error: 'Already busy' });
    appUpdateBusy = true;
    try { res.json(await downloadAppUpdate()); }
    catch (err) { res.status(500).json({ error: err.message }); }
    finally { appUpdateBusy = false; }
});

/** POST /api/system/app/install — extract + apply the downloaded update (step 2). */
router.post('/app/install', async (req, res) => {
    if (appUpdateBusy) return res.status(409).json({ error: 'Already busy' });
    appUpdateBusy = true;
    try { res.json(await installAppUpdate()); }
    catch (err) { res.status(500).json({ error: err.message }); }
    finally { appUpdateBusy = false; }
});

/** GET /api/system/settings — shows the SAVED/pending values (so the form doesn't
 *  revert after saving) plus whether a restart is needed. Never returns the token. */
router.get('/settings', (req, res) => {
    const saved = config.loadSettings();
    // Effective = what will be in force after restart (env vars always win and lock the field)
    const effHost = config.envLocked.host ? config.host : (saved.host || config.host);
    const effPort = config.envLocked.port ? config.port : (saved.port || config.port);
    const effHasAuth = config.envLocked.authToken ? !!config.authToken : !!saved.authToken;
    const effStatus = saved.statusInterval || config.statusInterval;

    res.json({
        networkAccess: effHost === '0.0.0.0',
        host: effHost,
        port: effPort,
        hasAuth: effHasAuth,
        statusInterval: effStatus,
        envLocked: config.envLocked,
        // running values + whether the saved settings differ (i.e. a restart is pending)
        running: { networkAccess: config.host === '0.0.0.0', port: config.port, hasAuth: !!config.authToken },
        restartPending: (effHost !== config.host) || (effPort !== config.port) || (effHasAuth !== !!config.authToken),
    });
});

/** POST /api/system/settings — persist settings to settings.json (some need a restart). */
router.post('/settings', (req, res) => {
    const body = req.body || {};
    const next = { ...config.loadSettings() };
    const errors = [];
    let restartRequired = false;

    if (body.networkAccess !== undefined && !config.envLocked.host) {
        const host = body.networkAccess ? '0.0.0.0' : '127.0.0.1';
        if (host !== config.host) restartRequired = true;
        next.host = host;
    }
    if (body.port !== undefined && !config.envLocked.port) {
        const port = parseInt(body.port, 10);
        if (!(port >= 1 && port <= 65535)) errors.push('Port must be between 1 and 65535');
        else { if (port !== config.port) restartRequired = true; next.port = port; }
    }
    if (body.authToken !== undefined && !config.envLocked.authToken) {
        const tok = String(body.authToken || '').trim();
        const newTok = tok || null;
        if (newTok !== config.authToken) restartRequired = true;
        if (newTok) next.authToken = newTok; else delete next.authToken;
    }
    if (body.statusInterval !== undefined) {
        const si = parseInt(body.statusInterval, 10);
        if (!(si >= 1000 && si <= 30000)) errors.push('Status interval must be between 1 and 30 seconds');
        else { next.statusInterval = si; config.statusInterval = si; } // applies to the next job, no restart
    }

    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    try { config.saveSettings(next); }
    catch (err) { return res.status(500).json({ error: `Failed to save: ${err.message}` }); }

    res.json({ success: true, restartRequired });
});

/**
 * GET /api/system/hashcat/check — compare installed hashcat vs latest release.
 */
router.get('/hashcat/check', async (req, res) => {
    try {
        res.json(await checkUpdate());
    } catch (err) {
        res.status(502).json({ error: `Update check failed: ${err.message}` });
    }
});

/**
 * POST /api/system/hashcat/update — download, verify, and swap in the latest hashcat.
 */
router.post('/hashcat/update', async (req, res) => {
    if (updateInProgress) return res.status(409).json({ error: 'An update is already running' });
    updateInProgress = true;
    try {
        const result = await performUpdate();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        updateInProgress = false;
    }
});

/**
 * GET /api/system/stats
 * Live, task-manager style hardware telemetry (CPU per-core, RAM, GPU, disk).
 * Works on Windows and Linux via systeminformation.
 */
router.get('/stats', async (req, res) => {
    try {
        const [load, mem, graphics, cpuTemp, fs] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.graphics(),
            si.cpuTemperature().catch(() => ({})),
            si.fsSize().catch(() => []),
        ]);

        const gpus = (graphics.controllers || [])
            .filter((c) => (c.vendor || c.model) && !isVirtualGpu(c.model, c.vendor))
            .map((c) => ({
                model: c.model || 'GPU',
                vendor: c.vendor || '',
                util: numOrNull(c.utilizationGpu),
                temp: numOrNull(c.temperatureGpu),
                memUsed: numOrNull(c.memoryUsed),
                memTotal: numOrNull(c.memoryTotal || c.vram),
                power: numOrNull(c.powerDraw),
                clock: numOrNull(c.clockCore),
            }));

        res.json({
            cpu: {
                load: round(load.currentLoad),
                cores: (load.cpus || []).map((c) => round(c.load)),
                temp: numOrNull(cpuTemp.main),
            },
            memory: {
                total: mem.total,
                used: mem.active,
                percent: round((mem.active / mem.total) * 100),
            },
            gpus,
            disks: (fs || [])
                .filter((d) => d.size > 0)
                .map((d) => ({ mount: d.mount, percent: round(d.use), used: d.used, total: d.size }))
                .slice(0, 6),
            ts: Date.now(),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function round(n) { return (n == null || isNaN(n)) ? 0 : Math.round(n); }
function numOrNull(n) { return (n == null || isNaN(n)) ? null : Math.round(n); }

/**
 * GET /api/system/gpu
 * Detect GPUs and return preset info.
 */
router.get('/gpu', async (req, res) => {
    try {
        if (req.query.refresh === 'true') invalidateCache();
        const gpuInfo = await detectGPUs();
        res.json(gpuInfo);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/system/health
 * System health check — CPU, RAM, disk, hashcat status.
 */
router.get('/health', async (req, res) => {
    try {
        const health = await getSystemHealth();
        res.json(health);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/system/benchmark
 * Run hashcat benchmark.
 */
router.get('/benchmark', (req, res) => {
    const mode = parseInt(req.query.mode) || 22000;
    const result = runBenchmark(mode);
    res.json(result);
});

/**
 * GET /api/system/info
 * Get general system info.
 */
router.get('/info', (req, res) => {
    res.json({
        platform: config.platform,
        isWindows: config.isWindows,
        hashcatBinary: config.hashcatBinary,
        hashcatVersion: getHashcatVersion(),
        hcxpcapngtoolAvailable: !!config.hcxpcapngtool,
        hashMode: config.hashMode,
        uploadsDir: config.dirs.uploads,
        dictionariesDir: config.dirs.dictionaries,
    });
});

module.exports = router;
