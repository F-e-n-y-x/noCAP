/**
 * Cap Hashcat Web — System Info Routes
 * GPU detection, health check, benchmarks.
 */

const express = require('express');
const router = express.Router();
const { detectGPUs, invalidateCache } = require('../gpu-detector');
const { getSystemHealth, runBenchmark, getHashcatVersion } = require('../hashcat-utils');
const config = require('../config');

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
