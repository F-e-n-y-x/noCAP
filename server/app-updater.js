/**
 * NoCAP — application self-updater
 * Checks the GitHub repo for a newer NoCAP version and updates the app source in
 * two explicit steps the user controls: download, then install. Install extracts
 * the downloaded zip and copies app files over the current ones, backing up to
 * `.appbackup/` first. Runtime data (uploads, dictionaries, sessions, hashcat,
 * node_modules, .git, .gitignore) is never touched. A restart applies the update.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const unzipper = require('unzipper');
const config = require('./config');

const ROOT = config.dirs.root;
const REPO = 'F-e-n-y-x/noCAP';
const BRANCH = 'main';
const WORK = path.join(ROOT, '.appupdate');
const ZIP = path.join(WORK, 'nocap.zip');
const EXTRACT = path.join(WORK, 'extracted');
const BACKUP = path.join(ROOT, '.appbackup');

// Files/dirs the updater is allowed to replace (app source only)
const UPDATABLE = ['server', 'public', 'rules', 'package.json', 'package-lock.json', 'start.bat', 'start.sh', 'README.md', 'LICENSE'];

function localVersion() {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version; }
    catch { return null; }
}

function ghText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'NoCAP' } }, (r) => {
            if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
                r.resume(); ghText(new URL(r.headers.location, url).toString()).then(resolve, reject); return;
            }
            if (r.statusCode !== 200) { reject(new Error(`HTTP ${r.statusCode}`)); return; }
            let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve(d));
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
            r.pipe(file); file.on('finish', () => file.close(() => resolve()));
        }).on('error', reject);
        go(url);
    });
}

const normVer = (v) => (v || '').replace(/[^0-9.]/g, '');

/** Compare local NoCAP version with the repo's package.json on the main branch. */
async function checkAppUpdate() {
    const remote = JSON.parse(await ghText(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/package.json`));
    const current = localVersion();
    const latest = remote.version || null;
    return {
        current,
        latest,
        updateAvailable: !!(latest && normVer(latest) && normVer(latest) !== normVer(current)),
        repoUrl: `https://github.com/${REPO}`,
        downloaded: fs.existsSync(ZIP),
    };
}

/** Step 1: download the latest source zip into .appupdate/. */
async function downloadAppUpdate() {
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(WORK, { recursive: true });
    await download(`https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCH}`, ZIP);
    const size = fs.statSync(ZIP).size;
    if (size < 1000) { fs.rmSync(WORK, { recursive: true, force: true }); throw new Error('Downloaded archive looks invalid.'); }
    return { success: true, size };
}

/** Step 2: extract the downloaded zip and copy app files over (with backup). */
async function installAppUpdate() {
    if (!fs.existsSync(ZIP)) throw new Error('No downloaded update found — download it first.');

    fs.rmSync(EXTRACT, { recursive: true, force: true });
    await fs.createReadStream(ZIP).pipe(unzipper.Extract({ path: EXTRACT })).promise();

    const top = fs.readdirSync(EXTRACT).find((f) => fs.statSync(path.join(EXTRACT, f)).isDirectory());
    if (!top) throw new Error('Extraction produced no source folder.');
    const src = path.join(EXTRACT, top);
    if (!fs.existsSync(path.join(src, 'server', 'index.js'))) throw new Error('Downloaded source looks incomplete.');

    fs.rmSync(BACKUP, { recursive: true, force: true });
    fs.mkdirSync(BACKUP, { recursive: true });

    let updated = 0;
    for (const item of UPDATABLE) {
        const s = path.join(src, item);
        if (!fs.existsSync(s)) continue;
        const dst = path.join(ROOT, item);
        if (fs.existsSync(dst)) fs.cpSync(dst, path.join(BACKUP, item), { recursive: true });
        fs.rmSync(dst, { recursive: true, force: true });
        fs.cpSync(s, dst, { recursive: true });
        updated++;
    }

    const newVersion = localVersion();
    fs.rmSync(WORK, { recursive: true, force: true });
    return { success: true, updated, version: newVersion, restartRequired: true };
}

module.exports = { checkAppUpdate, downloadAppUpdate, installAppUpdate };
