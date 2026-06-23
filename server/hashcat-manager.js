/**
 * Cap Hashcat Web — Hashcat Process Manager
 * Spawns, monitors, pauses, resumes, and kills hashcat processes.
 * Streams real-time status via WebSocket.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const { getPresetForGPU, presetToArgs } = require('./gpu-presets');
const { detectGPUs } = require('./gpu-detector');

// ── State ─────────────────────────────────────────────────────────────
const HISTORY_FILE = path.join(config.dirs.sessions, 'history.json');
const HISTORY_LIMIT = 200;

function loadHistoryFromDisk() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const raw = fs.readFileSync(HISTORY_FILE, 'utf-8').replace(/^﻿/, ''); // tolerate BOM
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch { /* ignore corrupt/missing history */ }
    return [];
}

let currentJob = null;
let jobHistory = loadHistoryFromDisk();
let statusTimer = null;
let wsBroadcast = null; // Set by server

/** Persist the history array so it survives restarts (for future reference). */
function persistHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(jobHistory, null, 2));
    } catch (err) {
        console.error('[History] Failed to persist:', err.message);
    }
}

/** Human-readable attack-mode label. */
function attackModeName(mode) {
    if (mode === null || mode === undefined) return 'Restored session';
    return ({
        0: 'Dictionary',
        1: 'Combinator',
        3: 'Brute-force / Mask',
        6: 'Hybrid (Wordlist + Mask)',
        7: 'Hybrid (Mask + Wordlist)',
    })[parseInt(mode)] || `Mode ${mode}`;
}

/** Build + store an enriched history record when a job ends, then persist. */
function recordHistory(job) {
    const endTime = job.endTime || Date.now();
    const record = {
        id: job.id,
        session: job.session,
        state: job.state,
        attackMode: job.attackMode,
        attackModeName: attackModeName(job.attackMode),
        dictionary: job.dictionary || null,
        mask: job.mask || null,
        ruleFile: job.ruleFile || null,
        hashFile: job.hashFile ? path.basename(job.hashFile) : null,
        hashMode: job.hashMode || null,
        startTime: job.startTime,
        endTime,
        duration: endTime - job.startTime,
        crackedCount: job.crackedPasswords.length,
        crackedPasswords: job.crackedPasswords,
        error: job.error || null,
    };
    jobHistory.push(record);
    if (jobHistory.length > HISTORY_LIMIT) jobHistory = jobHistory.slice(-HISTORY_LIMIT);
    persistHistory();
    return record;
}

// ── Input validation ──────────────────────────────────────────────────
// Custom CLI flags that could read/write arbitrary files, hijack the
// session/potfile, or otherwise escape the intended sandbox.
const DANGEROUS_ARG_FLAGS = new Set([
    '-o', '--outfile', '--outfile-format', '--outfile-autohex-disable',
    '--potfile-path', '--potfile-disable',
    '--session', '--restore', '--restore-file-path', '--restore-disable',
    '--stdout', '--remove', '--remove-timer',
    '--induction-dir', '--outfile-check-dir', '--outfile-check-timer',
    '--debug-file', '--debug-mode',
    '-r', '--rules-file', '-g', '--generate-rules',
    '--cwd', '--markov-hcstat2', '--brain-server', '--brain-client',
]);

/** Directories an input file is allowed to live in, by role. */
function allowedBasesFor(role) {
    const bases = {
        hash: [config.dirs.uploads, config.dirs.converted],
        dict: [config.dirs.dictionaries, config.dirs.uploads],
        rule: [config.dirs.rules],
    }[role] || [];

    if (role === 'rule' && config.hashcatBinary) {
        bases.push(path.join(path.dirname(config.hashcatBinary), 'rules'));
    }
    if (role === 'dict' && !config.isWindows) {
        bases.push('/usr/share/wordlists', '/usr/share/seclists');
    }
    return bases;
}

/** Ensure a user-supplied file path exists and is inside an allowed directory. */
function validateInputFile(filePath, role, label) {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error(`${label} is required`);
    }
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} not found: ${path.basename(filePath)}`);
    }
    if (!config.isPathInside(filePath, allowedBasesFor(role))) {
        throw new Error(`${label} is outside the allowed directory`);
    }
    return path.resolve(filePath);
}

/** Parse hashcat's potfile and merge any cracked passwords into the job. */
function readCrackedFromPotfile(potfile, job) {
    try {
        if (!fs.existsSync(potfile)) return;
        const potContent = fs.readFileSync(potfile, 'utf-8').trim();
        const potLines = potContent.split('\n').filter(Boolean);
        for (const potLine of potLines) {
            const sepIdx = potLine.lastIndexOf(':');
            if (sepIdx <= 0) continue;

            const password = potLine.substring(sepIdx + 1);
            const hash = potLine.substring(0, sepIdx);

            let essid = '';
            if (hash.startsWith('WPA*')) {
                const parts = hash.split('*');
                if (parts.length >= 6) {
                    try {
                        essid = Buffer.from(parts[5], 'hex').toString('utf-8');
                    } catch { /* ignore */ }
                }
            }

            if (!job.crackedPasswords.find((p) => p.password === password && p.essid === essid)) {
                job.crackedPasswords.push({ password, essid });
            }
        }
    } catch { /* ignore */ }
}

// Lines hashcat prints (to stdout or stderr) that signal a real failure.
const HASHCAT_ERROR_PATTERNS = [
    /no hashes loaded/i,
    /separator unmatched/i,
    /token length exception/i,
    /hashfile .* on line/i,
    /no devices found\/left/i,
    /no opencl|no cuda|clcreatecontext|cucontext/i,
    /not enough (memory|allocatable)/i,
    /permission denied/i,
    /no such file or directory/i,
    /unsupported/i,
    /\bfailed\b/i,
    /\berror\b/i,
];

/** Pull the most meaningful failure line out of a job's captured output. */
function extractHashcatError(job) {
    const clean = (l) => String(l).replace(/^\[stderr\]\s*/, '').trim();

    // Prefer stderr (newest first), then non-JSON stdout, matching known signatures.
    const pools = [job.errorLines, job.outputLines.filter((l) => !l.startsWith('{'))];
    for (const pool of pools) {
        for (let i = pool.length - 1; i >= 0; i--) {
            const line = clean(pool[i]);
            if (line && HASHCAT_ERROR_PATTERNS.some((re) => re.test(line))) return line;
        }
    }
    // Fallback: last non-empty stderr line.
    for (let i = job.errorLines.length - 1; i >= 0; i--) {
        const line = clean(job.errorLines[i]);
        if (line) return line;
    }
    return null;
}

/**
 * Turn a hashcat exit code + captured output into a clear outcome.
 * states: cracked | exhausted | aborted | completed | error
 */
function classifyOutcome(job, code, signal) {
    if (job.crackedPasswords.length > 0) {
        return { state: 'cracked', error: null };
    }
    if (job.userStopped) {
        return { state: 'aborted', error: null };
    }
    switch (code) {
        case 1:           // exhausted — keyspace fully searched, nothing matched
            return { state: 'exhausted', error: null };
        case 2:           // user aborted
        case 3:           // aborted by checkpoint
        case 4:           // aborted by runtime limit
            return { state: 'aborted', error: null };
        case 0:           // finished cleanly with nothing to crack (e.g. all in potfile)
            return { state: 'completed', error: null };
        default:          // -1 / 255 / null(signal) / anything else → genuine failure
            return {
                state: 'error',
                error: extractHashcatError(job)
                    || (signal ? `hashcat was terminated (${signal})` : `hashcat exited with code ${code}`),
            };
    }
}

// hashcat's interactive keypress menu — noise we don't want in the live log.
const HC_MENU_RE = /\[s\]tatus|\[p\]ause|\[b\]ypass|\[c\]heckpoint|\[f\]inish|\[q\]uit/i;

/** Split on CR and/or LF — hashcat uses '\r' between status/info messages. */
function splitLines(buffer) {
    return buffer.split(/\r\n|\r|\n/);
}

/**
 * Try to parse a hashcat --status-json object embedded anywhere in `text`.
 * hashcat often prints the keypress menu and the JSON on the same segment
 * (e.g. "... [q]uit => {"status":3,...}"), so we can't require it to start with '{'.
 * Returns true if a status was found and broadcast.
 */
function tryParseStatus(job, text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return false;
    try {
        const status = JSON.parse(text.slice(start, end + 1));
        if (status.status !== undefined || status.progress) {
            job.lastStatus = parseStatus(status);
            broadcast('job:status', job.lastStatus);
            return true;
        }
    } catch { /* not a complete JSON object */ }
    return false;
}

// A "Label........: value" line from hashcat's plain-text status table.
const HC_TABLE_RE = /^[A-Za-z][\w.#*]*\.{2,}\s*:/;

/** Convert "12,345.6" + unit (k/M/G/T) → hashes per second. */
function speedToHs(numStr, unit) {
    const n = parseFloat(String(numStr).replace(/,/g, '')) || 0;
    const mult = { k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[unit] || 1;
    return n * mult;
}

/**
 * Fallback: parse hashcat's human-readable status table (used when --status-json
 * isn't emitting). Accumulates fields across lines and broadcasts a status object
 * shaped exactly like parseStatus() output. Returns true if the line was a status field.
 */
function updateStatusFromText(job, line) {
    const acc = job._statusAccum || (job._statusAccum = {});
    let m, matched = false;

    if ((m = line.match(/^Status\.+:\s*(.+?)\s*$/i))) { acc.label = m[1]; matched = true; }
    else if ((m = line.match(/^Speed\.#([*\d]+)\.+:\s*([\d,]+(?:\.\d+)?)\s*([kKMGT]?)\s*H\/s/i))) {
        const v = speedToHs(m[2], m[3]);
        if (m[1] === '*' || acc.speed === undefined) acc.speed = v; // prefer the #* total
        matched = true;
    }
    else if ((m = line.match(/^Progress\.+:\s*(\d+)\/(\d+)/i))) { acc.progress = [+m[1], +m[2]]; matched = true; }
    else if ((m = line.match(/^Recovered\.+:\s*(\d+)\/(\d+)/i))) { acc.recovered = [+m[1], +m[2]]; matched = true; }
    else if ((m = line.match(/^Time\.Estimated\.+:.*\(([^)]+)\)\s*$/i))) { acc.etaText = m[1].trim(); matched = true; }
    else if ((m = line.match(/Temp:\s*(\d+)\s*c/i))) { acc.temp = +m[1]; matched = true; }

    if (!matched) return false;

    broadcast('job:status', {
        status: 3,
        statusLabel: acc.label || 'Running',
        speed: acc.speed || 0,
        speedFormatted: formatSpeed(acc.speed || 0),
        progress: acc.progress ? { current: acc.progress[0], total: acc.progress[1] } : null,
        progressPercent: acc.progress && acc.progress[1] > 0
            ? Math.round((acc.progress[0] / acc.progress[1]) * 10000) / 100 : 0,
        eta: null,
        etaFormatted: acc.etaText || 'N/A',
        recovered: acc.recovered ? { cracked: acc.recovered[0], total: acc.recovered[1] } : { cracked: 0, total: 0 },
        temperature: acc.temp != null ? acc.temp : null,
    });
    return true;
}

/**
 * Ingest a single stdout line from hashcat: parse JSON status into live metrics,
 * or stream meaningful text to the log (skipping status-table + keypress menu noise).
 */
function ingestStdoutLine(job, rawLine) {
    const line = rawLine.trim();
    if (!line) return;

    job.outputLines.push(line);
    if (job.outputLines.length > 1000) job.outputLines.shift();

    // 1) JSON status (possibly prefixed with menu text) → parse + broadcast metrics
    if (line.includes('{') && tryParseStatus(job, line)) return;

    // 2) Plain-text status table → parse + broadcast metrics
    if (HC_TABLE_RE.test(line)) { updateStatusFromText(job, line); return; }

    // 3) Noise we don't want in the log
    if (HC_MENU_RE.test(line)) return; // the [s]tatus [p]ause … keypress menu

    // 4) Everything else (banners, warnings, the cracked result) → live log
    broadcast('job:output', { line, stream: 'stdout' });
}

/** Reject custom CLI args that touch the filesystem or escape the sandbox. */
function sanitizeCustomArgs(customArgs) {
    if (!Array.isArray(customArgs)) return [];
    const out = [];
    for (const raw of customArgs) {
        const arg = String(raw);
        if (/[\\/]/.test(arg) || arg.includes('..')) {
            throw new Error(`Custom argument not allowed (paths are blocked): ${arg}`);
        }
        const flagName = arg.split('=')[0];
        if (DANGEROUS_ARG_FLAGS.has(flagName)) {
            throw new Error(`Custom argument not allowed: ${flagName}`);
        }
        out.push(arg);
    }
    return out;
}

/**
 * Set the WebSocket broadcast function.
 */
function setWSBroadcast(fn) {
    wsBroadcast = fn;
}

/**
 * Broadcast a message to all connected WebSocket clients.
 */
function broadcast(type, data) {
    if (wsBroadcast) {
        wsBroadcast(JSON.stringify({ type, data, ts: Date.now() }));
    }
}

/**
 * Get current job status.
 */
function getStatus() {
    if (!currentJob) {
        return { state: 'idle', job: null };
    }
    return {
        state: currentJob.state,
        job: {
            id: currentJob.id,
            hashFile: currentJob.hashFile,
            attackMode: currentJob.attackMode,
            dictionary: currentJob.dictionary,
            mask: currentJob.mask,
            startTime: currentJob.startTime,
            status: currentJob.lastStatus,
            output: currentJob.outputLines.slice(-50),
            crackedPasswords: currentJob.crackedPasswords,
        },
    };
}

/**
 * Start a hashcat cracking job.
 * @param {object} opts — Job options
 */
async function startJob(opts) {
    if (currentJob && currentJob.state === 'running') {
        throw new Error('A job is already running. Stop or wait for it to finish.');
    }

    if (!config.hashcatBinary) {
        throw new Error('hashcat binary not found. Please install hashcat and restart the server.');
    }

    const {
        hashFile,         // path to .hc22000 file
        attackMode = 0,   // 0=dict, 1=combinator, 3=mask, 6=hybrid-wl+mask, 7=hybrid-mask+wl
        dictionary,       // path to wordlist (for modes 0, 1, 6, 7)
        dictionary2,      // second wordlist (for combinator mode 1)
        mask,             // mask pattern (for modes 3, 6, 7)
        ruleFile,         // path to rule file (optional, for mode 0)
        hashMode = 22000, // hash mode
        customArgs = [],  // additional CLI args
        sessionName,      // session name for restore
        applyPreset = true,
    } = opts;

    // Validate hash file (must exist inside our upload/converted dirs)
    const safeHashFile = validateInputFile(hashFile, 'hash', 'Hash file');

    // Validate optional file inputs up front so we fail before spawning
    const safeDictionary = dictionary ? validateInputFile(dictionary, 'dict', 'Dictionary') : null;
    const safeDictionary2 = dictionary2 ? validateInputFile(dictionary2, 'dict', 'Second dictionary') : null;
    const safeRuleFile = ruleFile ? validateInputFile(ruleFile, 'rule', 'Rule file') : null;
    const safeCustomArgs = sanitizeCustomArgs(customArgs);

    // Build command args
    const args = [];

    // Hash mode
    args.push('-m', String(hashMode));

    // Attack mode
    args.push('-a', String(attackMode));

    // Session name
    const session = sessionName || `cap_${Date.now()}`;
    args.push('--session', session);

    // Status output — plain-text status table every N seconds (reliably emitted;
    // parsed by updateStatusFromText). --status-json proved unreliable here.
    args.push('--status');
    args.push('--status-timer', String(Math.max(1, Math.round(config.statusInterval / 1000))));

    // Potfile in our sessions dir
    const potfile = path.join(config.dirs.sessions, 'hashcat.potfile');
    args.push('--potfile-path', potfile);

    // GPU presets
    if (applyPreset) {
        try {
            const gpuInfo = await detectGPUs();
            if (gpuInfo.presetArgs.length > 0) {
                args.push(...gpuInfo.presetArgs);
            }
        } catch {
            args.push('-w', '2', '-O'); // safe defaults
        }
    }

    // Custom args (sanitized — no file paths or sandbox-escaping flags)
    if (safeCustomArgs.length > 0) {
        args.push(...safeCustomArgs);
    }

    // Hash file
    args.push(safeHashFile);

    // Attack-specific args
    switch (parseInt(attackMode)) {
        case 0: // Dictionary
            if (!safeDictionary) throw new Error('Dictionary file required for dictionary attack');
            args.push(safeDictionary);
            if (safeRuleFile) args.push('-r', safeRuleFile);
            break;
        case 1: // Combinator
            if (!safeDictionary || !safeDictionary2) throw new Error('Two dictionary files required for combinator attack');
            args.push(safeDictionary, safeDictionary2);
            break;
        case 3: // Brute-force / Mask
            if (!mask) throw new Error('Mask required for brute-force/mask attack');
            args.push(mask);
            break;
        case 6: // Hybrid wordlist+mask
            if (!safeDictionary || !mask) throw new Error('Dictionary and mask required for hybrid attack');
            args.push(safeDictionary, mask);
            break;
        case 7: // Hybrid mask+wordlist
            if (!mask || !safeDictionary) throw new Error('Mask and dictionary required for hybrid attack');
            args.push(mask, safeDictionary);
            break;
        default:
            throw new Error(`Unsupported attack mode: ${attackMode}`);
    }

    // Create job
    const job = {
        id: uuidv4(),
        state: 'starting',
        session,
        hashFile,
        hashMode,
        attackMode,
        dictionary: dictionary ? path.basename(dictionary) : null,
        mask,
        ruleFile: ruleFile ? path.basename(ruleFile) : null,
        startTime: Date.now(),
        endTime: null,
        process: null,
        lastStatus: null,
        outputLines: [],
        errorLines: [],
        userStopped: false,
        crackedPasswords: [],
        exitCode: null,
        error: null,
    };

    currentJob = job;

    broadcast('job:starting', {
        id: job.id,
        session: job.session,
        attackMode: job.attackMode,
        dictionary: job.dictionary,
        mask: job.mask,
    });

    // Spawn hashcat
    console.log(`[Hashcat] Spawning: "${config.hashcatBinary}" ${args.join(' ')}`);

    const proc = spawn(config.hashcatBinary, args, {
        cwd: path.dirname(config.hashcatBinary),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
    });

    job.process = proc;
    job.state = 'running';

    // Handle stdout — split on CR/LF so JSON status lines are isolated
    let stdoutBuffer = '';
    proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = splitLines(stdoutBuffer);
        stdoutBuffer = lines.pop(); // keep partial line in buffer
        for (const line of lines) ingestStdoutLine(job, line);
    });

    // Handle stderr — capture for diagnosis and stream to the live log
    let stderrBuffer = '';
    proc.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString();
        const lines = splitLines(stderrBuffer);
        stderrBuffer = lines.pop();
        for (const line of lines) {
            if (!line.trim()) continue;
            job.outputLines.push(`[stderr] ${line}`);
            job.errorLines.push(line.trim());
            broadcast('job:output', { line, stream: 'stderr' });
        }
    });

    // Handle exit
    proc.on('close', (code, signal) => {
        // Flush any buffered partial lines
        if (stdoutBuffer.trim()) ingestStdoutLine(job, stdoutBuffer);
        if (stderrBuffer.trim()) { job.errorLines.push(stderrBuffer.trim()); broadcast('job:output', { line: stderrBuffer, stream: 'stderr' }); }

        // Read potfile for results, then classify what actually happened
        readCrackedFromPotfile(potfile, job);
        const outcome = classifyOutcome(job, code, signal);
        job.state = outcome.state;
        job.exitCode = code;
        job.error = outcome.error;
        job.endTime = Date.now();

        broadcast('job:finished', {
            id: job.id,
            state: outcome.state,
            exitCode: code,
            signal: signal || null,
            duration: job.endTime - job.startTime,
            crackedPasswords: job.crackedPasswords,
            error: outcome.error,
            context: { attackMode: job.attackMode, dictionary: job.dictionary, mask: job.mask },
        });

        recordHistory(job);

        console.log(`[Hashcat] Process exited (code=${code}, signal=${signal || 'none'}) → ${outcome.state}${outcome.error ? `: ${outcome.error}` : ''}`);
    });

    proc.on('error', (err) => {
        job.state = 'error';
        job.error = err.message;
        job.endTime = Date.now();
        broadcast('job:error', { id: job.id, error: err.message });
        console.error('[Hashcat] Process error:', err.message);
    });

    return {
        id: job.id,
        session: job.session,
        state: job.state,
    };
}

/**
 * Stop the current hashcat job.
 */
function stopJob() {
    if (!currentJob || !currentJob.process) {
        return { error: 'No running job' };
    }

    try {
        // Mark as user-initiated so the outcome is reported as "aborted", not "error"
        currentJob.userStopped = true;
        // Send 'q' to hashcat for graceful quit
        currentJob.process.stdin.write('q');
        currentJob.state = 'stopping';

        // Force kill after 5 seconds if still running
        setTimeout(() => {
            if (currentJob && currentJob.process && !currentJob.process.killed) {
                currentJob.process.kill('SIGTERM');
            }
        }, 5000);

        broadcast('job:stopping', { id: currentJob.id });
        return { success: true, id: currentJob.id };
    } catch (err) {
        return { error: err.message };
    }
}

/**
 * Pause the current job (checkpoint save).
 */
function pauseJob() {
    if (!currentJob || !currentJob.process || currentJob.state !== 'running') {
        return { error: 'No running job to pause' };
    }

    try {
        // Send 'c' for checkpoint quit
        currentJob.process.stdin.write('c');
        currentJob.state = 'pausing';
        broadcast('job:pausing', { id: currentJob.id, session: currentJob.session });
        return { success: true, id: currentJob.id, session: currentJob.session };
    } catch (err) {
        return { error: err.message };
    }
}

/**
 * Resume a paused/checkpointed job.
 */
async function resumeJob(sessionName) {
    if (currentJob && currentJob.state === 'running') {
        throw new Error('A job is already running');
    }

    if (!config.hashcatBinary) {
        throw new Error('hashcat binary not found');
    }

    const potfile = path.join(config.dirs.sessions, 'hashcat.potfile');
    const args = ['--session', sessionName, '--restore', '--potfile-path', potfile];

    // Extra args for status (plain-text table — see startJob)
    args.push('--status', '--status-timer', String(Math.max(1, Math.round(config.statusInterval / 1000))));

    const job = {
        id: uuidv4(),
        state: 'resuming',
        session: sessionName,
        hashFile: 'restored',
        attackMode: null,
        dictionary: null,
        mask: null,
        startTime: Date.now(),
        endTime: null,
        process: null,
        lastStatus: null,
        outputLines: [],
        errorLines: [],
        userStopped: false,
        crackedPasswords: [],
        exitCode: null,
        error: null,
    };

    currentJob = job;

    const proc = spawn(config.hashcatBinary, args, {
        cwd: path.dirname(config.hashcatBinary),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
    });

    job.process = proc;
    job.state = 'running';

    // Same event handlers as startJob
    let stdoutBuffer = '';
    proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = splitLines(stdoutBuffer);
        stdoutBuffer = lines.pop();
        for (const line of lines) ingestStdoutLine(job, line);
    });

    let stderrBuffer = '';
    proc.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString();
        const lines = splitLines(stderrBuffer);
        stderrBuffer = lines.pop();
        for (const line of lines) {
            if (!line.trim()) continue;
            job.outputLines.push(`[stderr] ${line}`);
            job.errorLines.push(line.trim());
            broadcast('job:output', { line, stream: 'stderr' });
        }
    });

    proc.on('close', (code, signal) => {
        if (stdoutBuffer.trim()) ingestStdoutLine(job, stdoutBuffer);
        if (stderrBuffer.trim()) { job.errorLines.push(stderrBuffer.trim()); broadcast('job:output', { line: stderrBuffer, stream: 'stderr' }); }

        readCrackedFromPotfile(potfile, job);
        const outcome = classifyOutcome(job, code, signal);
        job.state = outcome.state;
        job.exitCode = code;
        job.error = outcome.error;
        job.endTime = Date.now();

        broadcast('job:finished', {
            id: job.id,
            state: outcome.state,
            exitCode: code,
            signal: signal || null,
            duration: job.endTime - job.startTime,
            crackedPasswords: job.crackedPasswords,
            error: outcome.error,
            context: { attackMode: null, dictionary: null, mask: null },
        });

        recordHistory(job);
    });

    proc.on('error', (err) => {
        job.state = 'error';
        job.error = err.message;
        job.endTime = Date.now();
        broadcast('job:error', { id: job.id, error: err.message });
    });

    broadcast('job:resumed', { id: job.id, session: sessionName });
    return { id: job.id, session: sessionName, state: job.state };
}

/**
 * Parse hashcat JSON status into a friendlier format.
 */
function parseStatus(raw) {
    const result = {
        status: raw.status,
        statusLabel: getStatusLabel(raw.status),
        progress: null,
        progressPercent: 0,
        speed: 0,
        speedFormatted: '0 H/s',
        eta: null,
        etaFormatted: 'N/A',
        recovered: { total: 0, cracked: 0 },
        temperature: null,
        timeStarted: raw.time_start ? new Date(raw.time_start * 1000).toISOString() : null,
        estimatedStop: raw.estimated_stop ? new Date(raw.estimated_stop * 1000).toISOString() : null,
        raw,
    };

    // Progress
    if (raw.progress && raw.progress.length >= 2) {
        result.progress = { current: raw.progress[0], total: raw.progress[1] };
        result.progressPercent = raw.progress[1] > 0
            ? Math.round((raw.progress[0] / raw.progress[1]) * 10000) / 100
            : 0;
    }

    // hashcat --status-json uses the "devices" array (older builds: "devices_status")
    const devices = raw.devices || raw.devices_status;

    // Speed (sum of all devices)
    if (Array.isArray(devices)) {
        let totalSpeed = 0;
        for (const dev of devices) {
            totalSpeed += dev.speed || 0;
        }
        result.speed = totalSpeed;
        result.speedFormatted = formatSpeed(totalSpeed);
    } else if (raw.speed) {
        // Alternative format
        let totalSpeed = 0;
        for (const s of raw.speed) {
            totalSpeed += s[0] || 0;
        }
        result.speed = totalSpeed;
        result.speedFormatted = formatSpeed(totalSpeed);
    }

    // Recovered
    if (raw.recovered_hashes && raw.recovered_hashes.length >= 2) {
        result.recovered = {
            cracked: raw.recovered_hashes[0],
            total: raw.recovered_hashes[1],
        };
    }

    // ETA
    if (raw.estimated_stop) {
        const eta = raw.estimated_stop - Math.floor(Date.now() / 1000);
        result.eta = eta > 0 ? eta : 0;
        result.etaFormatted = formatETA(result.eta);
    }

    // Temperature (max across devices)
    if (Array.isArray(devices)) {
        const temps = devices
            .map((d) => d.temp)
            .filter((t) => t != null && t >= 0);
        if (temps.length > 0) {
            result.temperature = Math.max(...temps);
        }
    }

    return result;
}

/**
 * Format speed (H/s) with appropriate unit.
 */
function formatSpeed(speed) {
    if (speed >= 1e12) return `${(speed / 1e12).toFixed(2)} TH/s`;
    if (speed >= 1e9) return `${(speed / 1e9).toFixed(2)} GH/s`;
    if (speed >= 1e6) return `${(speed / 1e6).toFixed(2)} MH/s`;
    if (speed >= 1e3) return `${(speed / 1e3).toFixed(2)} kH/s`;
    return `${Math.round(speed)} H/s`;
}

/**
 * Format ETA in human-readable form.
 */
function formatETA(seconds) {
    if (!seconds || seconds <= 0) return 'Complete';
    if (seconds > 86400 * 365) return '> 1 year';

    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

/**
 * Get human-readable status label from hashcat status code.
 */
function getStatusLabel(code) {
    const labels = {
        0: 'Initializing',
        1: 'Autotuning',
        2: 'Self-testing',
        3: 'Running',
        4: 'Paused',
        5: 'Exhausted',
        6: 'Cracked',
        7: 'Aborted',
        8: 'Quit',
        9: 'Bypass',
        10: 'Aborted (Checkpoint)',
        11: 'Aborted (Runtime)',
    };
    return labels[code] || `Unknown (${code})`;
}

/**
 * List saved sessions (restore files).
 */
function listSessions() {
    const sessions = [];

    const searchDirs = [config.dirs.sessions];
    if (config.hashcatBinary) {
        const hcDir = path.dirname(config.hashcatBinary);
        if (hcDir !== config.dirs.sessions) {
            searchDirs.push(hcDir);
        }
    }

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                if (file.endsWith('.restore')) {
                    const sessionName = path.basename(file, '.restore');
                    const fullPath = path.join(dir, file);
                    const stat = fs.statSync(fullPath);
                    sessions.push({
                        name: sessionName,
                        file: fullPath,
                        modified: stat.mtime,
                        size: stat.size,
                    });
                }
            }
        } catch { /* ignore */ }
    }

    return sessions;
}

/**
 * Delete a saved session and its related files (.restore / .log / etc.).
 */
function deleteSession(sessionName) {
    if (!sessionName || !/^[A-Za-z0-9_.-]+$/.test(sessionName)) {
        return { error: 'Invalid session name' };
    }
    if (currentJob && currentJob.session === sessionName && currentJob.state === 'running') {
        return { error: 'Cannot delete a running session — stop it first' };
    }

    const protectedFiles = new Set(['hashcat.potfile', 'history.json']);
    const searchDirs = [config.dirs.sessions];
    if (config.hashcatBinary) searchDirs.push(path.dirname(config.hashcatBinary));

    let removed = 0;
    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            for (const file of fs.readdirSync(dir)) {
                if (protectedFiles.has(file)) continue;
                if (file === sessionName || file.startsWith(sessionName + '.')) {
                    const full = path.join(dir, file);
                    if (config.isPathInside(full, [dir])) { fs.unlinkSync(full); removed++; }
                }
            }
        } catch (err) { return { error: err.message }; }
    }

    if (removed === 0) return { error: 'Session not found' };
    return { success: true, removed };
}

/**
 * Get job history.
 */
function getHistory() {
    // Newest first for display
    return jobHistory.slice().reverse();
}

/** Clear all saved history. */
function clearHistory() {
    jobHistory = [];
    persistHistory();
    return { success: true };
}

module.exports = {
    setWSBroadcast,
    getStatus,
    startJob,
    stopJob,
    pauseJob,
    resumeJob,
    listSessions,
    deleteSession,
    getHistory,
    clearHistory,
    parseStatus,      // exposed for testing / status inspection
    ingestStdoutLine, // exposed for testing
};
