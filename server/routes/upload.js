/**
 * Cap Hashcat Web — Upload Routes
 * Handle file uploads for cap files and wordlists.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { convertCapFile } = require('../cap-converter');

const router = express.Router();

// ── Multer configuration for cap files ────────────────────────────────
const capStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, config.dirs.uploads);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${timestamp}_${safeName}`);
    },
});

const capUpload = multer({
    storage: capStorage,
    limits: { fileSize: config.maxUploadSize },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (config.allowedCapExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${ext}. Allowed: ${config.allowedCapExtensions.join(', ')}`));
        }
    },
});

// ── Multer configuration for wordlists ────────────────────────────────
const dictDir = path.join(config.dirs.uploads, 'wordlists');
if (!fs.existsSync(dictDir)) fs.mkdirSync(dictDir, { recursive: true });

const dictStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, dictDir);
    },
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, safeName);
    },
});

const dictUpload = multer({
    storage: dictStorage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB for wordlists
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.txt', '.dict', '.wordlist', '.lst', '.rule'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${ext}. Allowed: .txt, .dict, .wordlist, .lst, .rule`));
        }
    },
});

// ── Routes ────────────────────────────────────────────────────────────

/**
 * POST /api/upload
 * Upload a cap/pcap/pcapng/hc22000 file and auto-convert.
 */
router.post('/', capUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const uploadedPath = req.file.path;
        const ext = path.extname(req.file.originalname).toLowerCase();

        console.log(`[Upload] File received: ${req.file.originalname} (${req.file.size} bytes)`);

        // Auto-convert cap files
        const convertResult = await convertCapFile(uploadedPath);

        res.json({
            success: convertResult.success,
            file: {
                originalName: req.file.originalname,
                size: req.file.size,
                extension: ext,
            },
            conversion: convertResult,
        });
    } catch (err) {
        console.error('[Upload] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/upload/dictionary
 * Upload a custom wordlist file.
 */
router.post('/dictionary', dictUpload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log(`[Upload] Dictionary received: ${req.file.originalname} (${req.file.size} bytes)`);

        res.json({
            success: true,
            file: {
                name: req.file.filename,
                path: req.file.path,
                size: req.file.size,
                originalName: req.file.originalname,
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/upload/files
 * List uploaded files.
 */
router.get('/files', (req, res) => {
    try {
        const files = [];

        // List converted hash files
        if (fs.existsSync(config.dirs.converted)) {
            const convertedFiles = fs.readdirSync(config.dirs.converted);
            for (const file of convertedFiles) {
                if (file.endsWith('.hc22000')) {
                    const fullPath = path.join(config.dirs.converted, file);
                    const stat = fs.statSync(fullPath);
                    const content = fs.readFileSync(fullPath, 'utf-8').trim();
                    const hashCount = content.split('\n').filter((l) => l.startsWith('WPA*')).length;

                    files.push({
                        name: file,
                        path: fullPath,
                        size: stat.size,
                        modified: stat.mtime,
                        hashCount,
                        type: 'hc22000',
                    });
                }
            }
        }

        res.json({ files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Error handling middleware for multer
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large. Maximum size: 100MB' });
        }
        return res.status(400).json({ error: err.message });
    }
    if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
});

module.exports = router;
