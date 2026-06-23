/**
 * Cap Hashcat Web — Cap Converter Orchestrator
 * Converts .cap/.pcap/.pcapng files to hashcat .hc22000 format.
 * Strategy:
 *   1. If file is already .hc22000 → skip
 *   2. Try hcxpcapngtool (Linux, if available)
 *   3. Fallback to native Node.js parser
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const config = require('./config');
const { convertToHc22000 } = require('./cap-parser');

/**
 * Convert a capture file to .hc22000 format.
 * @param {string} inputPath — Path to the uploaded .cap/.pcap/.pcapng file
 * @returns {Promise<object>} Conversion result
 */
async function convertCapFile(inputPath) {
    const ext = path.extname(inputPath).toLowerCase();
    const basename = path.basename(inputPath, ext);
    const outputPath = path.join(config.dirs.converted, `${basename}.hc22000`);

    // Already in hc22000 format — just copy/validate
    if (ext === '.hc22000') {
        fs.copyFileSync(inputPath, outputPath);
        const content = fs.readFileSync(outputPath, 'utf-8').trim();
        const lines = content.split('\n').filter((l) => l.startsWith('WPA*'));
        return {
            success: lines.length > 0,
            inputFile: path.basename(inputPath),
            outputFile: path.basename(outputPath),
            outputPath,
            method: 'passthrough',
            hashes: lines.length,
            handshakes: lines.filter((l) => l.startsWith('WPA*02*')).length,
            pmkids: lines.filter((l) => l.startsWith('WPA*01*')).length,
            networks: extractNetworkInfo(lines),
            errors: lines.length === 0 ? ['File contains no valid WPA hashes'] : [],
        };
    }

    // Legacy .hccapx — inform user it's deprecated
    if (ext === '.hccapx') {
        return {
            success: false,
            inputFile: path.basename(inputPath),
            method: 'none',
            hashes: 0,
            errors: [
                'The .hccapx format is deprecated. Please re-capture using a modern tool ' +
                'and provide a .cap, .pcap, or .pcapng file instead.'
            ],
        };
    }

    // Strategy 1: Try hcxpcapngtool (Linux native, best quality)
    if (config.hcxpcapngtool) {
        try {
            const result = convertWithHcxpcapngtool(inputPath, outputPath);
            if (result.success) return result;
        } catch (err) {
            console.warn('[Converter] hcxpcapngtool failed, falling back to Node.js parser:', err.message);
        }
    }

    // Strategy 2: Native Node.js Parser
    try {
        const parsedResult = convertToHc22000(inputPath, outputPath);
        
        if (parsedResult.success) {
            return {
                success: true,
                inputFile: path.basename(inputPath),
                outputFile: path.basename(outputPath),
                outputPath,
                method: 'nodejs',
                hashes: parsedResult.hashes,
                handshakes: parsedResult.handshakes,
                pmkids: parsedResult.pmkids,
                networks: parsedResult.networks,
                errors: []
            };
        } else {
            return {
                success: false,
                inputFile: path.basename(inputPath),
                method: 'nodejs',
                hashes: 0,
                errors: [parsedResult.error || 'Native parser found no valid handshakes']
            };
        }
    } catch (err) {
        console.error('[Converter] Node.js parser crashed:', err);
        return {
            success: false,
            inputFile: path.basename(inputPath),
            method: 'nodejs',
            hashes: 0,
            errors: [err.message]
        };
    }
}

/**
 * Convert using native hcxpcapngtool (Linux).
 */
function convertWithHcxpcapngtool(inputPath, outputPath) {
    const cmd = `"${config.hcxpcapngtool}" -o "${outputPath}" "${inputPath}"`;

    try {
        const stdout = execSync(cmd, {
            encoding: 'utf-8',
            timeout: 30000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (fs.existsSync(outputPath)) {
            const content = fs.readFileSync(outputPath, 'utf-8').trim();
            const lines = content.split('\n').filter((l) => l.startsWith('WPA*'));

            return {
                success: lines.length > 0,
                inputFile: path.basename(inputPath),
                outputFile: path.basename(outputPath),
                outputPath,
                method: 'hcxpcapngtool',
                hashes: lines.length,
                handshakes: lines.filter((l) => l.startsWith('WPA*02*')).length,
                pmkids: lines.filter((l) => l.startsWith('WPA*01*')).length,
                networks: extractNetworkInfo(lines),
                log: stdout,
                errors: lines.length === 0 ? ['No handshakes found in capture file'] : [],
            };
        }

        return {
            success: false,
            inputFile: path.basename(inputPath),
            method: 'hcxpcapngtool',
            hashes: 0,
            errors: ['hcxpcapngtool produced no output file. The capture may not contain valid handshakes.'],
        };
    } catch (err) {
        throw new Error(`hcxpcapngtool error: ${err.stderr || err.message}`);
    }
}

/**
 * Extract network info (ESSID, BSSID) from hc22000 hash lines.
 */
function extractNetworkInfo(hashLines) {
    const networks = new Map();

    for (const line of hashLines) {
        const parts = line.split('*');
        if (parts.length >= 6) {
            const bssid = parts[3];
            const essidHex = parts[5];
            try {
                const essid = Buffer.from(essidHex, 'hex').toString('utf-8');
                const bssidFormatted = bssid.match(/.{2}/g)?.join(':') || bssid;
                if (!networks.has(bssid)) {
                    networks.set(bssid, { bssid: bssidFormatted, essid });
                }
            } catch { /* invalid hex */ }
        }
    }

    return Array.from(networks.values());
}

module.exports = { convertCapFile };
