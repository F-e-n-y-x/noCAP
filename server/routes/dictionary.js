/**
 * Cap Hashcat Web — Dictionary Routes
 * List, download, and delete wordlists.
 */

const express = require('express');
const router = express.Router();
const dictManager = require('../dictionary-manager');

/**
 * GET /api/dictionaries
 * List all available dictionaries and download sources.
 */
router.get('/', (req, res) => {
    try {
        const result = dictManager.listDictionaries();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/dictionaries/download
 * Download a dictionary from a known source.
 */
router.post('/download', (req, res) => {
    const { sourceId } = req.body;
    if (!sourceId) {
        return res.status(400).json({ error: 'sourceId required' });
    }

    const result = dictManager.downloadDictionary(sourceId);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * DELETE /api/dictionaries
 * Delete a downloaded dictionary.
 */
router.delete('/', (req, res) => {
    const { filePath } = req.body;
    if (!filePath) {
        return res.status(400).json({ error: 'filePath required' });
    }

    const result = dictManager.deleteDictionary(filePath);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

module.exports = router;
