/**
 * Cap Hashcat Web — GPU Detector
 * Auto-detects installed GPUs and matches performance presets.
 */

const si = require('systeminformation');
const { execSync } = require('child_process');
const os = require('os');
const { getPresetForGPU, presetToArgs } = require('./gpu-presets');

let cachedGPUInfo = null;

/**
 * Detect all GPUs on this system.
 * Returns enriched GPU info with matched presets.
 */
async function detectGPUs() {
    if (cachedGPUInfo && Date.now() - cachedGPUInfo._ts < 60000) {
        return cachedGPUInfo;
    }

    const result = {
        gpus: [],
        primaryGPU: null,
        preset: null,
        presetArgs: [],
        system: {
            platform: os.platform(),
            arch: os.arch(),
            cpuModel: '',
            totalMemoryGB: Math.round(os.totalmem() / (1024 ** 3)),
        },
        _ts: Date.now(),
    };

    try {
        // Get CPU info
        const cpu = await si.cpu();
        result.system.cpuModel = `${cpu.manufacturer} ${cpu.brand}`;
    } catch { /* ignore */ }

    try {
        const graphics = await si.graphics();

        if (graphics.controllers && graphics.controllers.length > 0) {
            for (const ctrl of graphics.controllers) {
                const gpu = {
                    model: ctrl.model || 'Unknown',
                    vendor: ctrl.vendor || 'Unknown',
                    vram: ctrl.vram || 0,
                    driver: ctrl.driverVersion || 'Unknown',
                    bus: ctrl.bus || '',
                    temperatureGpu: ctrl.temperatureGpu || null,
                    memoryTotal: ctrl.memoryTotal || null,
                    memoryUsed: ctrl.memoryUsed || null,
                    memoryFree: ctrl.memoryFree || null,
                    utilizationGpu: ctrl.utilizationGpu || null,
                };

                // Match preset
                gpu.preset = getPresetForGPU(gpu.model);

                result.gpus.push(gpu);
            }
        }
    } catch (err) {
        console.error('[GPU] systeminformation error:', err.message);
    }

    // Fallback: try native commands if systeminformation failed
    if (result.gpus.length === 0) {
        try {
            const nativeGPU = detectGPUNative();
            if (nativeGPU) {
                const gpu = {
                    model: nativeGPU,
                    vendor: guessVendor(nativeGPU),
                    vram: 0,
                    driver: 'Unknown',
                    preset: getPresetForGPU(nativeGPU),
                };
                result.gpus.push(gpu);
            }
        } catch { /* ignore */ }
    }

    // Select primary GPU (prefer discrete over integrated)
    if (result.gpus.length > 0) {
        const discrete = result.gpus.find(
            (g) => !isIntegrated(g.model)
        );
        result.primaryGPU = discrete || result.gpus[0];
        result.preset = result.primaryGPU.preset;
        result.presetArgs = presetToArgs(result.preset);
    }

    // Try to get NVIDIA-specific metrics
    for (const gpu of result.gpus) {
        if (gpu.vendor && gpu.vendor.toLowerCase().includes('nvidia')) {
            try {
                const smiData = getNvidiaSMI();
                if (smiData) {
                    gpu.temperatureGpu = smiData.temperature || gpu.temperatureGpu;
                    gpu.power = smiData.power;
                    gpu.memoryUsed = smiData.memoryUsed || gpu.memoryUsed;
                    gpu.memoryTotal = smiData.memoryTotal || gpu.memoryTotal;
                    gpu.utilizationGpu = smiData.utilization || gpu.utilizationGpu;
                }
            } catch { /* nvidia-smi not available */ }
        }
    }

    cachedGPUInfo = result;
    return result;
}

/**
 * Native GPU detection fallback using platform-specific commands.
 */
function detectGPUNative() {
    const isWin = os.platform() === 'win32';

    try {
        if (isWin) {
            const out = execSync(
                'wmic path win32_VideoController get name /format:list',
                { encoding: 'utf-8', timeout: 5000 }
            );
            const match = out.match(/Name=(.+)/i);
            return match ? match[1].trim() : null;
        } else {
            // Linux: try lspci
            const out = execSync(
                "lspci | grep -iE 'VGA|3D|Display'",
                { encoding: 'utf-8', timeout: 5000 }
            );
            // Extract model from lspci output
            const match = out.match(/:\s*(.+)/);
            return match ? match[1].trim() : null;
        }
    } catch {
        return null;
    }
}

/**
 * Get NVIDIA GPU metrics via nvidia-smi.
 */
function getNvidiaSMI() {
    try {
        const out = execSync(
            'nvidia-smi --query-gpu=temperature.gpu,power.draw,memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits',
            { encoding: 'utf-8', timeout: 5000 }
        ).trim();

        const [temp, power, memUsed, memTotal, util] = out.split(',').map((v) => v.trim());

        return {
            temperature: parseInt(temp) || null,
            power: parseFloat(power) || null,
            memoryUsed: parseInt(memUsed) || null,
            memoryTotal: parseInt(memTotal) || null,
            utilization: parseInt(util) || null,
        };
    } catch {
        return null;
    }
}

/**
 * Guess GPU vendor from model name.
 */
function guessVendor(model) {
    if (!model) return 'Unknown';
    const lower = model.toLowerCase();
    if (lower.includes('nvidia') || lower.includes('geforce') || lower.includes('rtx') || lower.includes('gtx')) return 'NVIDIA';
    if (lower.includes('amd') || lower.includes('radeon') || lower.includes('rx ')) return 'AMD';
    if (lower.includes('intel') || lower.includes('uhd') || lower.includes('iris') || lower.includes('arc')) return 'Intel';
    return 'Unknown';
}

/**
 * Check if GPU model name suggests integrated graphics.
 */
function isIntegrated(model) {
    if (!model) return false;
    const lower = model.toLowerCase();
    return (
        lower.includes('uhd') ||
        lower.includes('hd graphics') ||
        lower.includes('iris') ||
        lower.includes('apu') ||
        lower.includes('radeon graphics') || // AMD APU naming
        lower.includes('integrated')
    );
}

/**
 * Invalidate cache so next call re-detects.
 */
function invalidateCache() {
    cachedGPUInfo = null;
}

module.exports = { detectGPUs, invalidateCache };
