/**
 * Cap Hashcat Web — Hashcat Utility Functions
 * Locate hashcat, parse version, list hash modes, etc.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('./config');

/**
 * Get hashcat version string.
 */
function getHashcatVersion() {
    if (!config.hashcatBinary) return null;

    try {
        const out = execSync(`"${config.hashcatBinary}" --version`, {
            encoding: 'utf-8',
            timeout: 10000,
        }).trim();
        return out; // e.g., "v6.2.6"
    } catch {
        return null;
    }
}

/**
 * Run hashcat benchmark for mode 22000 (or specified mode).
 * Returns parsed results.
 */
function runBenchmark(hashMode = 22000) {
    if (!config.hashcatBinary) {
        return { error: 'hashcat not found' };
    }

    try {
        const out = execSync(
            `"${config.hashcatBinary}" -m ${hashMode} -b --machine-readable`,
            { encoding: 'utf-8', timeout: 120000 }
        ).trim();

        // Parse benchmark output
        const lines = out.split('\n');
        const results = [];
        for (const line of lines) {
            // Machine readable format: DEVICE_ID:HASH_TYPE:EXEC_RUNTIME:SPEED:HASHRATE_UNIT
            const parts = line.split(':');
            if (parts.length >= 4) {
                results.push({
                    device: parts[0],
                    hashType: parts[1],
                    speed: parts[3],
                });
            }
        }

        return { success: true, mode: hashMode, results, raw: out };
    } catch (err) {
        return { error: err.message };
    }
}

/**
 * Validate a hash file — check if hashcat can recognize it.
 */
function validateHashFile(hashFilePath) {
    if (!fs.existsSync(hashFilePath)) {
        return { valid: false, error: 'File not found' };
    }

    const content = fs.readFileSync(hashFilePath, 'utf-8').trim();
    const lines = content.split('\n').filter(Boolean);

    if (lines.length === 0) {
        return { valid: false, error: 'File is empty' };
    }

    // Check if lines look like WPA hashes
    const wpaLines = lines.filter((l) => l.startsWith('WPA*'));
    if (wpaLines.length > 0) {
        return {
            valid: true,
            hashMode: 22000,
            hashCount: wpaLines.length,
            type: 'WPA-PBKDF2-PMKID+EAPOL',
        };
    }

    // Generic hash — just count lines
    return {
        valid: true,
        hashCount: lines.length,
        type: 'unknown',
    };
}

/**
 * Read hashcat potfile and return cracked results.
 */
function readPotfile() {
    // Find potfile
    const potfilePaths = [
        path.join(config.dirs.sessions, 'hashcat.potfile'),
    ];

    // Add default hashcat potfile locations
    if (config.isWindows) {
        potfilePaths.push(
            path.join(process.env.APPDATA || '', 'hashcat', 'hashcat.potfile'),
            path.join(process.env.USERPROFILE || '', '.hashcat', 'hashcat.potfile'),
        );
    } else {
        potfilePaths.push(
            path.join(process.env.HOME || '', '.local', 'share', 'hashcat', 'hashcat.potfile'),
            path.join(process.env.HOME || '', '.hashcat', 'hashcat.potfile'),
        );
    }

    const results = [];

    for (const potfile of potfilePaths) {
        if (fs.existsSync(potfile)) {
            const content = fs.readFileSync(potfile, 'utf-8').trim();
            const lines = content.split('\n').filter(Boolean);
            for (const line of lines) {
                // Potfile format: hash:password
                const sepIndex = line.lastIndexOf(':');
                if (sepIndex > 0) {
                    const hash = line.substring(0, sepIndex);
                    const password = line.substring(sepIndex + 1);

                    // Extract ESSID from WPA hash if possible
                    let essid = '';
                    if (hash.startsWith('WPA*')) {
                        const parts = hash.split('*');
                        if (parts.length >= 6) {
                            try {
                                essid = Buffer.from(parts[5], 'hex').toString('utf-8');
                            } catch { /* ignore */ }
                        }
                    }

                    results.push({ hash: hash.substring(0, 60) + '...', password, essid });
                }
            }
        }
    }

    return results;
}

/**
 * List available rule files.
 */
function listRuleFiles() {
    const rules = [];

    // Check bundled rules
    if (fs.existsSync(config.dirs.rules)) {
        const files = fs.readdirSync(config.dirs.rules);
        for (const file of files) {
            if (file.endsWith('.rule')) {
                const fullPath = path.join(config.dirs.rules, file);
                const stat = fs.statSync(fullPath);
                rules.push({
                    name: file,
                    path: fullPath,
                    size: stat.size,
                    source: 'bundled',
                });
            }
        }
    }

    // Check hashcat's own rules directory
    if (config.hashcatBinary) {
        const hashcatDir = path.dirname(config.hashcatBinary);
        const hashcatRules = path.join(hashcatDir, 'rules');
        if (fs.existsSync(hashcatRules)) {
            try {
                const files = fs.readdirSync(hashcatRules);
                for (const file of files) {
                    if (file.endsWith('.rule')) {
                        const fullPath = path.join(hashcatRules, file);
                        const stat = fs.statSync(fullPath);
                        rules.push({
                            name: file,
                            path: fullPath,
                            size: stat.size,
                            source: 'hashcat',
                        });
                    }
                }
            } catch { /* permission denied or similar */ }
        }
    }

    return rules;
}

/**
 * Get system health information.
 */
async function getSystemHealth() {
    const si = require('systeminformation');

    try {
        const [cpu, mem, disk, temp] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.cpuTemperature(),
        ]);

        return {
            cpu: {
                load: Math.round(cpu.currentLoad),
            },
            memory: {
                total: Math.round(mem.total / (1024 ** 3)),
                used: Math.round(mem.active / (1024 ** 3)),
                percent: Math.round((mem.active / mem.total) * 100),
            },
            disk: disk.map((d) => ({
                mount: d.mount,
                total: Math.round(d.size / (1024 ** 3)),
                used: Math.round(d.used / (1024 ** 3)),
                percent: Math.round(d.use),
            })),
            temperature: temp.main || null,
            hashcatInstalled: !!config.hashcatBinary,
            hashcatVersion: getHashcatVersion(),
            hashcatPath: config.hashcatBinary,
            pythonAvailable: !!config.python,
            hcxpcapngtoolAvailable: !!config.hcxpcapngtool,
            platform: config.platform,
        };
    } catch (err) {
        return {
            error: err.message,
            hashcatInstalled: !!config.hashcatBinary,
            hashcatVersion: getHashcatVersion(),
            platform: config.platform,
        };
    }
}

module.exports = {
    getHashcatVersion,
    runBenchmark,
    validateHashFile,
    readPotfile,
    listRuleFiles,
    getSystemHealth,
};
