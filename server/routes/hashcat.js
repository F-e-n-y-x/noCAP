/**
 * Cap Hashcat Web — Hashcat Control Routes
 * Start, stop, pause, resume cracking jobs.
 */

const express = require('express');
const router = express.Router();
const hashcatManager = require('../hashcat-manager');
const { readPotfile, listRuleFiles } = require('../hashcat-utils');

/**
 * POST /api/hashcat/start
 * Start a new cracking job.
 */
router.post('/start', async (req, res) => {
    try {
        const {
            hashFile,
            attackMode,
            dictionary,
            dictionary2,
            mask,
            ruleFile,
            hashMode,
            customArgs,
            sessionName,
            applyPreset,
        } = req.body;

        const result = await hashcatManager.startJob({
            hashFile,
            attackMode: parseInt(attackMode) || 0,
            dictionary,
            dictionary2,
            mask,
            ruleFile,
            hashMode: parseInt(hashMode) || 22000,
            customArgs: customArgs || [],
            sessionName,
            applyPreset: applyPreset !== false,
        });

        res.json(result);
    } catch (err) {
        console.error('[Hashcat] Start error:', err.message);
        res.status(400).json({ error: err.message });
    }
});

/**
 * POST /api/hashcat/stop
 * Stop the current cracking job.
 */
router.post('/stop', (req, res) => {
    const result = hashcatManager.stopJob();
    res.json(result);
});

/**
 * POST /api/hashcat/pause
 * Pause (checkpoint) the current job.
 */
router.post('/pause', (req, res) => {
    const result = hashcatManager.pauseJob();
    res.json(result);
});

/**
 * POST /api/hashcat/resume
 * Resume a paused/checkpointed session.
 */
router.post('/resume', async (req, res) => {
    try {
        const { sessionName } = req.body;
        if (!sessionName) {
            return res.status(400).json({ error: 'sessionName required' });
        }
        const result = await hashcatManager.resumeJob(sessionName);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * GET /api/hashcat/status
 * Get current job status.
 */
router.get('/status', (req, res) => {
    res.json(hashcatManager.getStatus());
});

/**
 * GET /api/hashcat/sessions
 * List saved sessions (restore files).
 */
router.get('/sessions', (req, res) => {
    res.json({ sessions: hashcatManager.listSessions() });
});

/**
 * GET /api/hashcat/history
 * Get job history.
 */
router.get('/history', (req, res) => {
    res.json({ history: hashcatManager.getHistory() });
});

/**
 * DELETE /api/hashcat/history
 * Clear all saved job history.
 */
router.delete('/history', (req, res) => {
    res.json(hashcatManager.clearHistory());
});

/**
 * GET /api/hashcat/potfile
 * Get cracked passwords from potfile.
 */
router.get('/potfile', (req, res) => {
    res.json({ results: readPotfile() });
});

/**
 * GET /api/hashcat/rules
 * List available rule files.
 */
router.get('/rules', (req, res) => {
    res.json({ rules: listRuleFiles() });
});

module.exports = router;
