/**
 * Cap Hashcat Web — Configuration
 * Central configuration for paths, defaults, and platform detection.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const IS_WINDOWS = os.platform() === 'win32';

// ---------------------------------------------------------------------------
// Directory paths
// ---------------------------------------------------------------------------
const DIRS = {
    root: ROOT_DIR,
    uploads: path.join(ROOT_DIR, 'uploads'),
    dictionaries: path.join(ROOT_DIR, 'dictionaries'),
    sessions: path.join(ROOT_DIR, 'sessions'),
    rules: path.join(ROOT_DIR, 'rules'),
    tools: path.join(__dirname, 'tools'),
    public: path.join(ROOT_DIR, 'public'),
    converted: path.join(ROOT_DIR, 'uploads', 'converted'),
};

// Ensure all directories exist
Object.values(DIRS).forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// ---------------------------------------------------------------------------
// Hashcat binary detection
// ---------------------------------------------------------------------------
function findHashcatBinary() {
    const candidates = IS_WINDOWS
        ? [
            path.join(ROOT_DIR, 'hashcat', 'hashcat.exe'),
            'hashcat.exe',
            path.join('C:\\', 'hashcat', 'hashcat.exe'),
            path.join('C:\\', 'Program Files', 'hashcat', 'hashcat.exe'),
            path.join('C:\\', 'Program Files (x86)', 'hashcat', 'hashcat.exe'),
            path.join(os.homedir(), 'hashcat', 'hashcat.exe'),
            path.join(os.homedir(), 'Desktop', 'hashcat', 'hashcat.exe'),
            path.join(os.homedir(), 'Downloads', 'hashcat', 'hashcat.exe'),
        ]
        : [
            path.join(ROOT_DIR, 'hashcat', 'hashcat.bin'),
            'hashcat',
            '/usr/bin/hashcat',
            '/usr/local/bin/hashcat',
            '/opt/hashcat/hashcat',
            path.join(os.homedir(), 'hashcat', 'hashcat'),
        ];

    // Check PATH first
    const { execSync } = require('child_process');
    try {
        const cmd = IS_WINDOWS ? 'where hashcat' : 'which hashcat';
        const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0];
        if (result && fs.existsSync(result.trim())) {
            return result.trim();
        }
    } catch { /* not in PATH */ }

    // Check known locations
    for (const candidate of candidates) {
        if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// hcxpcapngtool detection
// ---------------------------------------------------------------------------
function findHcxpcapngtool() {
    if (IS_WINDOWS) return null; // Linux-only tool

    const { execSync } = require('child_process');
    try {
        const result = execSync('which hcxpcapngtool', { encoding: 'utf-8', timeout: 5000 }).trim();
        if (result && fs.existsSync(result)) return result;
    } catch { /* not installed */ }

    return null;
}

// ---------------------------------------------------------------------------
// Python detection (used for health reporting)
// ---------------------------------------------------------------------------
function findPython() {
    const { execSync } = require('child_process');
    for (const cmd of IS_WINDOWS ? ['python', 'python3', 'py'] : ['python3', 'python']) {
        try {
            execSync(`${cmd} --version`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
            return cmd;
        } catch { /* try next */ }
    }
    return null;
}

/**
 * Check whether `target` resolves to a location inside one of `bases`.
 * Uses path.relative to avoid string-prefix false positives (e.g. /uploads-evil).
 */
function isPathInside(target, bases) {
    const resolved = path.resolve(target);
    return bases.some((base) => {
        const rel = path.relative(path.resolve(base), resolved);
        return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    });
}



// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    // Bind to localhost by default — this tool spawns processes and reads files,
    // so it must not be exposed to the whole network. Set HOST=0.0.0.0 to override.
    host: process.env.HOST || '127.0.0.1',
    // Optional bearer token. When set, /api and /ws require it. Off by default.
    authToken: process.env.AUTH_TOKEN || null,
    isWindows: IS_WINDOWS,
    platform: os.platform(),
    dirs: DIRS,
    hashcatBinary: findHashcatBinary(),
    hcxpcapngtool: findHcxpcapngtool(),
    python: findPython(),
    maxUploadSize: 100 * 1024 * 1024, // 100 MB
    allowedCapExtensions: ['.cap', '.pcap', '.pcapng', '.hccapx', '.hc22000'],
    allowedDictExtensions: ['.txt', '.dict', '.wordlist', '.lst'],
    hashMode: 22000, // WPA-PBKDF2-PMKID+EAPOL — the modern standard
    statusInterval: 3000, // ms between status polls
    isPathInside,
};

module.exports = config;
