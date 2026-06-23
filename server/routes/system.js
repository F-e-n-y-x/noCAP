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
