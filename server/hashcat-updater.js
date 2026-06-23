/**
 * NoCAP — hashcat updater
 * Checks GitHub for the latest hashcat release and (optionally) updates the
 * bundled copy. The update is fail-safe: it downloads to a temp folder, verifies
 * the new binary runs (`--version`), and only then swaps it in — keeping the
 * previous install as `hashcat_backup/` so a bad update can never brick cracking.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync, execSync } = require('child_process');
const config = require('./config');
const { getHashcatVersion } = require('./hashcat-utils');

const ROOT = config.dirs.root;
const IS_WIN = config.isWindows;
const LATEST_API = 'https://api.github.com/repos/hashcat/hashcat/releases/latest';

function ghJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'NoCAP', 'Accept': 'application/vnd.github+json' } }, (r) => {
            if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
                r.resume(); ghJson(new URL(r.headers.location, url).toString()).then(resolve, reject); return;
            }
            let d = '';
            r.on('data', (c) => (d += c));
            r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Bad response from GitHub')); } });
        }).on('error', reject);
    });
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const go = (u) => https.get(u, { headers: { 'User-Agent': 'NoCAP' } }, (r) => {
            if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
                r.resume(); go(new URL(r.headers.location, u).toString()); return;
            }
            if (r.statusCode !== 200) { reject(new Error(`HTTP ${r.statusCode}`)); return; }
            r.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
        }).on('error', reject);
        go(url);
    });
}

const normVer = (v) => (v || '').replace(/[^0-9.]/g, '');

/** Compare hashcat's installed version against the latest GitHub release. */
async function checkUpdate() {
    const rel = await ghJson(LATEST_API);
    const latest = rel.tag_name || null;
    const asset = (rel.assets || []).find((a) => /^hashcat-.*\.7z$/.test(a.name));
    const current = getHashcatVersion();
    return {
        current: current || null,
        latest,
        updateAvailable: !!(current && latest && normVer(current) && normVer(current) !== normVer(latest)),
        releaseUrl: rel.html_url || 'https://hashcat.net/hashcat/',
        assetUrl: asset ? asset.browser_download_url : null,
        assetName: asset ? asset.name : null,
    };
}

function find7z(workDir) {
    if (!IS_WIN) {
        for (const cmd of ['7z', '7za', '7zr']) {
            try { execSync(`${cmd} --help`, { stdio: 'ignore' }); return cmd; } catch { /* next */ }
        }
        throw new Error('7-Zip (p7zip) is required to extract the update. Install it (e.g. `apt install p7zip-full`) and retry.');
    }
    // Windows: prefer an installed 7z, else fetch the tiny standalone 7zr.exe
    for (const cmd of ['7z', '7za']) {
        try { execSync(`where ${cmd}`, { stdio: 'ignore' }); return cmd; } catch { /* next */ }
    }
    return null; // signal caller to download 7zr.exe into workDir
}

/** Download, verify, and swap in the latest hashcat. Returns the new version. */
async function performUpdate() {
    const info = await checkUpdate();
    if (!info.assetUrl) throw new Error('Could not find a downloadable hashcat release.');

    const work = path.join(ROOT, '.hcupdate');
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });

    try {
        const archive = path.join(work, 'hashcat.7z');
        await download(info.assetUrl, archive);

        let sevenZip = find7z(work);
        if (!sevenZip) {
            sevenZip = path.join(work, '7zr.exe');
            await download('https://www.7-zip.org/a/7zr.exe', sevenZip);
        }
        execFileSync(sevenZip, ['x', archive, '-o' + work, '-y'], { stdio: 'ignore' });

        const extracted = fs.readdirSync(work).find(
            (f) => /^hashcat-/.test(f) && fs.statSync(path.join(work, f)).isDirectory()
        );
        if (!extracted) throw new Error('The downloaded archive did not contain a hashcat folder.');

        const newDir = path.join(work, extracted);
        const newBin = path.join(newDir, IS_WIN ? 'hashcat.exe' : 'hashcat.bin');
        if (!fs.existsSync(newBin)) throw new Error('Updated hashcat binary not found after extraction.');

        // Verify the new binary actually runs before trusting it
        const version = execFileSync(newBin, ['--version'], { encoding: 'utf-8', timeout: 20000 }).trim();

        // Swap: back up the current install, then move the new one into place
        const target = path.join(ROOT, 'hashcat');
        const backup = path.join(ROOT, 'hashcat_backup');
        if (fs.existsSync(target)) {
            fs.rmSync(backup, { recursive: true, force: true });
            fs.renameSync(target, backup);
        }
        try {
            fs.renameSync(newDir, target);
        } catch {
            fs.cpSync(newDir, target, { recursive: true }); // cross-device fallback
        }

        // Point the running server at the new binary
        config.hashcatBinary = path.join(target, IS_WIN ? 'hashcat.exe' : 'hashcat.bin');
        return { success: true, version };
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

module.exports = { checkUpdate, performUpdate };
