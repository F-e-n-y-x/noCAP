/**
 * Cap Hashcat Web — Dictionary Manager
 * Download, list, and manage wordlist files.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createGunzip } = require('zlib');
const config = require('./config');

// ── Dictionary Sources ────────────────────────────────────────────────
// Categories: wifi · quick · essential · standard · large
// `recommendedFor`: 'wifi' for WPA-tuned lists, 'general' otherwise.
const DICTIONARY_SOURCES = [
    // ── WiFi / WPA-tuned (best first picks for this tool) ──────────────
    {
        id: 'seclists-wifi-top62',
        name: 'WiFi WPA — Top 62',
        description: 'The 62 most probable WPA passphrases. Tiny instant smoke-test before bigger lists.',
        url: 'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/WiFi-WPA/probable-v2-wpa-top62.txt',
        size: '~600 B', sizeBytes: 600, lines: 62,
        category: 'wifi', recommendedFor: 'wifi', recommended: true,
    },
    {
        id: 'seclists-wifi-top447',
        name: 'WiFi WPA — Top 447',
        description: 'Top 447 probable WPA passphrases. Very fast first pass for home routers.',
        url: 'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/WiFi-WPA/probable-v2-wpa-top447.txt',
        size: '~4 KB', sizeBytes: 4096, lines: 447,
        category: 'wifi', recommendedFor: 'wifi', recommended: true,
    },
    {
        id: 'seclists-wifi-common',
        name: 'WiFi WPA — Top 4800',
        description: 'Common WiFi passphrases (8+ chars). Purpose-built for WPA cracking — great default.',
        url: 'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/WiFi-WPA/probable-v2-wpa-top4800.txt',
        size: '~49 KB', sizeBytes: 49388, lines: 4800,
        category: 'wifi', recommendedFor: 'wifi', recommended: true,
    },
    {
        id: 'weakpass-wifi-small',
        name: 'Weakpass — WiFi Small',
        description: 'WiFi-optimized list, 8+ character candidates only (WPA needs ≥8). Efficient mid-size pass.',
        url: 'https://weakpass.com/download/90/wifi-small.txt.gz',
        size: '~11 MB (gz)', sizeBytes: 11534336, lines: 5000000,
        category: 'wifi', recommendedFor: 'wifi', compressed: 'gz', recommended: false,
    },

    // ── Quick general lists (fast, high hit-rate) ─────────────────────
    {
        id: 'seclists-500-worst',
        name: 'SecLists — 500 Worst',
        description: 'The 500 worst/most-common passwords. Instant baseline check.',
        url: 'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/500-worst-passwords.txt',
        size: '~3.5 KB', sizeBytes: 3576, lines: 500,
        category: 'quick', recommendedFor: 'general', recommended: false,
    },
    {
        id: 'seclists-common-10k',
        name: 'SecLists — Common 10K',
        description: 'Top 10,000 most common passwords. Fast and effective everyday list.',
        url: 'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt',
        size: '~82 KB', sizeBytes: 82359, lines: 10000,
        category: 'quick', recommendedFor: 'general', recommended: true,
    },
    {
        id: 'seclists-darkweb-10k',
        name: 'SecLists — Darkweb 10K',
        description: 'Top 10,000 passwords seen in dark-web breach dumps (2017). Strong quick pass.',
        url: 'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/darkweb2017-top10000.txt',
        size: '~91 KB', sizeBytes: 92900, lines: 10000,
        category: 'quick', recommendedFor: 'general', recommended: false,
    },
    {
        id: 'seclists-probable-top-12k',
        name: 'SecLists — Probable 12K',
        description: 'Statistically most-probable passwords. Excellent effort-to-result ratio.',
        url: 'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/probable-v2-top12000.txt',
        size: '~98 KB', sizeBytes: 97827, lines: 12000,
        category: 'quick', recommendedFor: 'general', recommended: false,
    },

    // ── Standard general lists ────────────────────────────────────────
    {
        id: 'seclists-common-100k',
        name: 'SecLists — Common 100K',
        description: 'Top 100,000 most common passwords (xato). Good balance of size and coverage.',
        url: 'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt',
        size: '~850 KB', sizeBytes: 868832, lines: 100000,
        category: 'standard', recommendedFor: 'general', recommended: false,
    },
    {
        id: 'seclists-common-1m',
        name: 'SecLists — Common 1M',
        description: 'Top 1,000,000 most common passwords (xato). Thorough without being huge.',
        url: 'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt',
        size: '~8.3 MB', sizeBytes: 8529945, lines: 1000000,
        category: 'standard', recommendedFor: 'general', recommended: false,
    },

    // ── Large / essential ─────────────────────────────────────────────
    {
        id: 'rockyou',
        name: 'RockYou',
        description: 'The classic — ~14M passwords from the 2009 RockYou breach. The standard go-to list.',
        url: 'https://github.com/brannondorsey/naive-hashcat/releases/download/data/rockyou.txt',
        size: '~134 MB', sizeBytes: 139921497, lines: 14344391,
        category: 'essential', recommendedFor: 'general', recommended: true,
    },
    {
        id: 'crackstation-human',
        name: 'CrackStation — Human Passwords',
        description: 'Real human passwords only (~64M). Large but high-quality. Long download.',
        url: 'https://crackstation.net/files/crackstation-human-only.txt.gz',
        size: '~247 MB → ~684 MB', sizeBytes: 684000000, lines: 63941069,
        category: 'large', recommendedFor: 'general', compressed: 'gz', recommended: false,
    },
    {
        id: 'weakpass-hashmob-founds',
        name: 'Weakpass — HashMob Founds (1.5 GB)',
        description: 'Millions of real-world cracked passwords from HashMob. Heavy-duty list for WPA — best chance on tough handshakes. Long download.',
        url: 'https://weakpass.com/download/1948/hk_hlm_founds.txt.gz',
        size: '~563 MB → ~1.5 GB', sizeBytes: 1610612736, lines: 90000000,
        category: 'large', recommendedFor: 'wifi', compressed: 'gz', recommended: true,
    },
];

// ── Active Downloads ──────────────────────────────────────────────────
const activeDownloads = new Map();
let wsBroadcast = null;

function setWSBroadcast(fn) {
    wsBroadcast = fn;
}

function broadcast(type, data) {
    if (wsBroadcast) {
        wsBroadcast(JSON.stringify({ type, data, ts: Date.now() }));
    }
}

/**
 * List all available dictionaries (downloaded + sources).
 */
function listDictionaries() {
    const downloaded = [];

    // Scan dictionaries directory
    if (fs.existsSync(config.dirs.dictionaries)) {
        const files = fs.readdirSync(config.dirs.dictionaries);
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (['.txt', '.dict', '.wordlist', '.lst'].includes(ext)) {
                const fullPath = path.join(config.dirs.dictionaries, file);
                try {
                    const stat = fs.statSync(fullPath);
                    downloaded.push({
                        name: file,
                        path: fullPath,
                        size: stat.size,
                        sizeFormatted: formatSize(stat.size),
                        modified: stat.mtime,
                        lineCount: estimateLineCount(fullPath, stat.size),
                        source: 'downloaded',
                    });
                } catch { /* skip */ }
            }
        }
    }

    // Scan uploads directory for user-uploaded wordlists
    const uploadsPath = path.join(config.dirs.uploads, 'wordlists');
    if (fs.existsSync(uploadsPath)) {
        const files = fs.readdirSync(uploadsPath);
        for (const file of files) {
            const fullPath = path.join(uploadsPath, file);
            try {
                const stat = fs.statSync(fullPath);
                downloaded.push({
                    name: file,
                    path: fullPath,
                    size: stat.size,
                    sizeFormatted: formatSize(stat.size),
                    modified: stat.mtime,
                    source: 'uploaded',
                });
            } catch { /* skip */ }
        }
    }

    // Scan system wordlists (Linux)
    if (!config.isWindows) {
        const systemPaths = ['/usr/share/wordlists', '/usr/share/seclists/Passwords'];
        for (const sysPath of systemPaths) {
            if (fs.existsSync(sysPath)) {
                try {
                    const files = fs.readdirSync(sysPath).slice(0, 20); // Limit
                    for (const file of files) {
                        if (file.endsWith('.txt') || file.endsWith('.lst')) {
                            const fullPath = path.join(sysPath, file);
                            try {
                                const stat = fs.statSync(fullPath);
                                if (stat.isFile()) {
                                    downloaded.push({
                                        name: `[system] ${file}`,
                                        path: fullPath,
                                        size: stat.size,
                                        sizeFormatted: formatSize(stat.size),
                                        source: 'system',
                                    });
                                }
                            } catch { /* skip */ }
                        }
                    }
                } catch { /* permission denied */ }
            }
        }
    }

    // Annotate sources with download status
    const sources = DICTIONARY_SOURCES.map((src) => {
        const fileName = getFileNameFromSource(src);
        const filePath = path.join(config.dirs.dictionaries, fileName);
        const isDownloaded = fs.existsSync(filePath);
        const isDownloading = activeDownloads.has(src.id);

        return {
            ...src,
            fileName,
            isDownloaded,
            isDownloading,
            downloadProgress: isDownloading ? activeDownloads.get(src.id).progress : null,
        };
    });

    return { downloaded, sources };
}

/**
 * Download a dictionary from a source.
 */
function downloadDictionary(sourceId) {
    const source = DICTIONARY_SOURCES.find((s) => s.id === sourceId);
    if (!source) {
        return { error: `Unknown dictionary source: ${sourceId}` };
    }

    if (activeDownloads.has(sourceId)) {
        return { error: 'Download already in progress' };
    }

    const fileName = getFileNameFromSource(source);
    const filePath = path.join(config.dirs.dictionaries, fileName);

    if (fs.existsSync(filePath)) {
        return { error: 'Dictionary already downloaded', path: filePath };
    }

    // Start download
    const downloadState = { progress: 0, downloaded: 0, total: 0, aborted: false };
    activeDownloads.set(sourceId, downloadState);

    broadcast('dict:download:start', { id: sourceId, name: source.name });

    const tempPath = filePath + '.tmp';
    const isCompressed = source.compressed === 'gz';
    // Use the source's known size as a fallback when the server omits Content-Length
    // (GitHub raw + gzip responses often do), so the progress bar still moves.
    const expectedTotal = source.sizeBytes || 0;
    let lastEmit = 0;

    const fail = (msg) => {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        activeDownloads.delete(sourceId);
        broadcast('dict:download:error', { id: sourceId, error: msg });
    };

    const doDownload = (url, redirects = 0) => {
        if (redirects > 5) return fail('Too many redirects');

        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, { headers: { 'User-Agent': 'CapHashcatWeb/1.0', 'Accept': '*/*' } }, (res) => {
            // Follow redirects (resolve relative Location against current url)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume(); // drain
                const next = new URL(res.headers.location, url).toString();
                doDownload(next, redirects + 1);
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                return fail(`HTTP ${res.statusCode}${res.statusMessage ? ` ${res.statusMessage}` : ''}`);
            }

            const headerTotal = parseInt(res.headers['content-length'] || '0', 10);
            // When gzip-decompressing, header total measures compressed bytes — not
            // comparable to decompressed progress, so prefer the known expected size.
            const totalForPct = isCompressed ? expectedTotal : (headerTotal || expectedTotal);
            downloadState.total = totalForPct;

            const writeStream = fs.createWriteStream(tempPath);
            let pipeline = res;
            if (isCompressed) {
                const gunzip = createGunzip();
                gunzip.on('error', (err) => fail(`Decompression failed: ${err.message}`));
                pipeline = res.pipe(gunzip);
            }

            let downloadedBytes = 0;
            pipeline.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                downloadState.downloaded = downloadedBytes;
                downloadState.progress = totalForPct > 0
                    ? Math.min(99, Math.round((downloadedBytes / totalForPct) * 100))
                    : 0;

                // Throttle broadcasts to ~3/sec so the UI updates smoothly without spam
                const now = Date.now();
                if (now - lastEmit >= 300) {
                    lastEmit = now;
                    broadcast('dict:download:progress', {
                        id: sourceId,
                        progress: downloadState.progress,
                        downloaded: formatSize(downloadedBytes),
                        total: totalForPct > 0 ? formatSize(totalForPct) : 'unknown',
                    });
                }
            });

            pipeline.pipe(writeStream);

            writeStream.on('error', (err) => fail(`Write failed: ${err.message}`));
            writeStream.on('finish', () => {
                try {
                    const size = fs.statSync(tempPath).size;
                    if (size === 0) return fail('Downloaded file was empty');
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    fs.renameSync(tempPath, filePath);

                    activeDownloads.delete(sourceId);
                    broadcast('dict:download:progress', { id: sourceId, progress: 100, downloaded: formatSize(size), total: formatSize(size) });
                    broadcast('dict:download:complete', {
                        id: sourceId, name: source.name, path: filePath, size: formatSize(size),
                    });
                } catch (err) {
                    fail(`Finalize failed: ${err.message}`);
                }
            });

            res.on('error', (err) => fail(err.message));
        });

        req.on('error', (err) => fail(err.message));
        // Abort stalled connections (no response within 30s)
        req.setTimeout(30000, () => { req.destroy(new Error('Connection timed out')); });
    };

    doDownload(source.url);

    return { success: true, id: sourceId, fileName };
}

/**
 * Delete a downloaded dictionary.
 */
function deleteDictionary(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return { error: 'File not found' };
    }

    // Safety: only allow deletion from dictionaries or uploads dir.
    // Uses path containment (not string prefix) to avoid sibling-dir bypass.
    const normalizedPath = path.resolve(filePath);
    const allowedBases = [config.dirs.dictionaries, config.dirs.uploads];

    if (!config.isPathInside(normalizedPath, allowedBases)) {
        return { error: 'Cannot delete files outside dictionaries/uploads directory' };
    }

    try {
        fs.unlinkSync(normalizedPath);
        return { success: true };
    } catch (err) {
        return { error: err.message };
    }
}

// ── Helpers ───────────────────────────────────────────────────────────

function getFileNameFromSource(source) {
    const urlPath = new URL(source.url).pathname;
    let name = path.basename(urlPath);

    // Remove compression extension
    if (name.endsWith('.gz')) name = name.slice(0, -3);
    if (name.endsWith('.bz2')) name = name.slice(0, -4);

    // Ensure .txt extension
    if (!name.endsWith('.txt') && !name.endsWith('.dict') && !name.endsWith('.lst')) {
        name += '.txt';
    }

    return name;
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

function estimateLineCount(filePath, fileSize) {
    // Quick estimate based on average line length for password files (~10 bytes)
    if (!fileSize) return null;

    try {
        // Read first 10KB to estimate average line length
        const fd = fs.openSync(filePath, 'r');
        const sampleSize = Math.min(fileSize, 10240);
        const buffer = Buffer.alloc(sampleSize);
        fs.readSync(fd, buffer, 0, sampleSize);
        fs.closeSync(fd);

        const sample = buffer.toString('utf-8');
        const newlines = (sample.match(/\n/g) || []).length;
        if (newlines === 0) return null;

        const avgLineLen = sampleSize / newlines;
        return Math.round(fileSize / avgLineLen);
    } catch {
        return Math.round(fileSize / 10); // rough fallback
    }
}

module.exports = {
    setWSBroadcast,
    listDictionaries,
    downloadDictionary,
    deleteDictionary,
    DICTIONARY_SOURCES,
};
