/**
 * Cap Hashcat Web — GPU Performance Presets
 * Auto-applied based on detected GPU model.
 * Based on hashcat benchmarks for WPA2 mode 22000.
 */

const GPU_PRESETS = [
    // ── NVIDIA RTX 40 Series ──────────────────────────────────────
    {
        pattern: /RTX\s*40(90|80)/i,
        tier: 'ultra',
        name: 'NVIDIA RTX 4090/4080',
        workload: 4,
        optimized: true,
        tempAbort: 95,
        tempRetain: 85,
        description: 'Ultra-tier GPU. Max performance preset applied.',
        estimatedSpeed: '~2500 kH/s (WPA2)',
    },
    {
        pattern: /RTX\s*40(70|60)/i,
        tier: 'high',
        name: 'NVIDIA RTX 4070/4060',
        workload: 3,
        optimized: true,
        tempAbort: 93,
        tempRetain: 83,
        description: 'High-end GPU. Aggressive performance preset.',
        estimatedSpeed: '~1100 kH/s (WPA2)',
    },
    // ── NVIDIA RTX 30 Series ──────────────────────────────────────
    {
        pattern: /RTX\s*30(90|80)/i,
        tier: 'high',
        name: 'NVIDIA RTX 3090/3080',
        workload: 3,
        optimized: true,
        tempAbort: 93,
        tempRetain: 83,
        description: 'High-end GPU. Aggressive performance preset.',
        estimatedSpeed: '~900 kH/s (WPA2)',
    },
    {
        pattern: /RTX\s*30(70|60)/i,
        tier: 'mid-high',
        name: 'NVIDIA RTX 3070/3060',
        workload: 3,
        optimized: true,
        tempAbort: 93,
        tempRetain: 80,
        description: 'Mid-high GPU. High performance preset.',
        estimatedSpeed: '~500 kH/s (WPA2)',
    },
    // ── NVIDIA RTX 20 Series ──────────────────────────────────────
    {
        pattern: /RTX\s*20(80|70)/i,
        tier: 'mid-high',
        name: 'NVIDIA RTX 2080/2070',
        workload: 3,
        optimized: true,
        tempAbort: 93,
        tempRetain: 80,
        description: 'Mid-high GPU. High performance preset.',
        estimatedSpeed: '~450 kH/s (WPA2)',
    },
    {
        pattern: /RTX\s*20(60|50)/i,
        tier: 'mid',
        name: 'NVIDIA RTX 2060/2050',
        workload: 3,
        optimized: true,
        tempAbort: 90,
        tempRetain: 80,
        description: 'Mid-range GPU. Balanced preset.',
        estimatedSpeed: '~350 kH/s (WPA2)',
    },
    // ── NVIDIA GTX 10 Series ──────────────────────────────────────
    {
        pattern: /GTX\s*1080\s*Ti/i,
        tier: 'mid-high',
        name: 'NVIDIA GTX 1080 Ti',
        workload: 3,
        optimized: true,
        tempAbort: 92,
        tempRetain: 80,
        description: 'Legendary GPU. High performance preset.',
        estimatedSpeed: '~400 kH/s (WPA2)',
    },
    {
        pattern: /GTX\s*1080(?!\s*Ti)/i,
        tier: 'mid',
        name: 'NVIDIA GTX 1080',
        workload: 3,
        optimized: true,
        tempAbort: 92,
        tempRetain: 80,
        description: 'Mid-range GPU. Balanced preset.',
        estimatedSpeed: '~330 kH/s (WPA2)',
    },
    {
        pattern: /GTX\s*1070/i,
        tier: 'mid',
        name: 'NVIDIA GTX 1070',
        workload: 3,
        optimized: true,
        tempAbort: 92,
        tempRetain: 78,
        description: 'Mid-range GPU. Balanced preset.',
        estimatedSpeed: '~280 kH/s (WPA2)',
    },
    {
        pattern: /GTX\s*1060/i,
        tier: 'mid-low',
        name: 'NVIDIA GTX 1060',
        workload: 2,
        optimized: true,
        tempAbort: 90,
        tempRetain: 78,
        description: 'Mid-low GPU. Conservative preset.',
        estimatedSpeed: '~180 kH/s (WPA2)',
    },
    {
        pattern: /GTX\s*1050/i,
        tier: 'low',
        name: 'NVIDIA GTX 1050',
        workload: 2,
        optimized: true,
        tempAbort: 88,
        tempRetain: 75,
        description: 'Entry-level GPU. Conservative preset.',
        estimatedSpeed: '~100 kH/s (WPA2)',
    },
    // ── NVIDIA GTX 16 Series ──────────────────────────────────────
    {
        pattern: /GTX\s*16(80|60)/i,
        tier: 'mid',
        name: 'NVIDIA GTX 1660/1680',
        workload: 3,
        optimized: true,
        tempAbort: 90,
        tempRetain: 78,
        description: 'Mid-range GPU. Balanced preset.',
        estimatedSpeed: '~250 kH/s (WPA2)',
    },
    {
        pattern: /GTX\s*16(50|30)/i,
        tier: 'mid-low',
        name: 'NVIDIA GTX 1650/1630',
        workload: 2,
        optimized: true,
        tempAbort: 88,
        tempRetain: 75,
        description: 'Entry-level GPU. Conservative preset.',
        estimatedSpeed: '~120 kH/s (WPA2)',
    },
    // ── NVIDIA RTX 50 Series ──────────────────────────────────────
    {
        pattern: /RTX\s*50(90|80)/i,
        tier: 'ultra',
        name: 'NVIDIA RTX 5090/5080',
        workload: 4,
        optimized: true,
        tempAbort: 95,
        tempRetain: 85,
        description: 'Next-gen ultra-tier GPU. Max performance.',
        estimatedSpeed: '~3500+ kH/s (WPA2)',
    },
    {
        pattern: /RTX\s*50(70|60)/i,
        tier: 'high',
        name: 'NVIDIA RTX 5070/5060',
        workload: 3,
        optimized: true,
        tempAbort: 93,
        tempRetain: 83,
        description: 'Next-gen high-end GPU.',
        estimatedSpeed: '~1800 kH/s (WPA2)',
    },
    // ── AMD Radeon RX 7000 Series ─────────────────────────────────
    {
        pattern: /RX\s*7(900|800)/i,
        tier: 'high',
        name: 'AMD Radeon RX 7900/7800',
        workload: 3,
        optimized: true,
        tempAbort: 95,
        tempRetain: 85,
        description: 'High-end AMD GPU. Aggressive preset (ensure ROCm/HIP drivers).',
        estimatedSpeed: '~800 kH/s (WPA2)',
    },
    {
        pattern: /RX\s*7(700|600)/i,
        tier: 'mid-high',
        name: 'AMD Radeon RX 7700/7600',
        workload: 3,
        optimized: true,
        tempAbort: 93,
        tempRetain: 83,
        description: 'Mid-high AMD GPU.',
        estimatedSpeed: '~550 kH/s (WPA2)',
    },
    // ── AMD Radeon RX 6000 Series ─────────────────────────────────
    {
        pattern: /RX\s*6(900|800)/i,
        tier: 'high',
        name: 'AMD Radeon RX 6900/6800',
        workload: 3,
        optimized: true,
        tempAbort: 93,
        tempRetain: 83,
        description: 'High-end AMD GPU.',
        estimatedSpeed: '~700 kH/s (WPA2)',
    },
    {
        pattern: /RX\s*6(700|600)/i,
        tier: 'mid',
        name: 'AMD Radeon RX 6700/6600',
        workload: 3,
        optimized: true,
        tempAbort: 93,
        tempRetain: 80,
        description: 'Mid-range AMD GPU.',
        estimatedSpeed: '~500 kH/s (WPA2)',
    },
    // ── AMD Radeon RX 5000 Series ─────────────────────────────────
    {
        pattern: /RX\s*5(700|600|500)/i,
        tier: 'mid',
        name: 'AMD Radeon RX 5000 Series',
        workload: 3,
        optimized: true,
        tempAbort: 90,
        tempRetain: 78,
        description: 'Mid-range AMD GPU.',
        estimatedSpeed: '~350 kH/s (WPA2)',
    },
    // ── AMD APU (Integrated) ──────────────────────────────────────
    {
        pattern: /Radeon.*Graphics|AMD.*APU|Ryzen.*Radeon|Vega\s*\d/i,
        tier: 'integrated',
        name: 'AMD APU (Integrated Graphics)',
        workload: 2,
        optimized: true,
        tempAbort: 85,
        tempRetain: 75,
        description: 'Integrated APU. Moderate preset, shared memory limits speed.',
        estimatedSpeed: '~20-40 kH/s (WPA2)',
    },
    // ── Intel Arc ─────────────────────────────────────────────────
    {
        pattern: /Arc\s*A(770|750|580)/i,
        tier: 'mid',
        name: 'Intel Arc A-Series',
        workload: 3,
        optimized: true,
        tempAbort: 90,
        tempRetain: 80,
        description: 'Intel Arc discrete GPU. Ensure Intel Compute Runtime drivers.',
        estimatedSpeed: '~300 kH/s (WPA2)',
    },
    {
        pattern: /Arc\s*A(380|310)/i,
        tier: 'low',
        name: 'Intel Arc A380/A310',
        workload: 2,
        optimized: true,
        tempAbort: 88,
        tempRetain: 78,
        description: 'Entry-level Intel Arc.',
        estimatedSpeed: '~100 kH/s (WPA2)',
    },
    // ── Intel Integrated (UHD / Iris) ─────────────────────────────
    {
        pattern: /Iris\s*(Xe|Plus|Pro)/i,
        tier: 'integrated',
        name: 'Intel Iris Xe/Plus',
        workload: 2,
        optimized: true,
        tempAbort: 85,
        tempRetain: 75,
        description: 'Intel Iris integrated GPU. Moderate preset.',
        estimatedSpeed: '~15-25 kH/s (WPA2)',
    },
    {
        pattern: /UHD\s*(Graphics|7\d\d|6\d\d)|Intel.*HD\s*Graphics/i,
        tier: 'integrated',
        name: 'Intel UHD/HD Graphics',
        workload: 1,
        optimized: true,
        tempAbort: 85,
        tempRetain: 70,
        description: 'Intel integrated GPU. Low workload to keep system responsive.',
        estimatedSpeed: '~5-15 kH/s (WPA2)',
    },
    // ── NVIDIA Laptop GPUs ────────────────────────────────────────
    {
        pattern: /MX\s*(550|450|350|250|150)|GeForce\s*MX/i,
        tier: 'low',
        name: 'NVIDIA MX Series (Laptop)',
        workload: 2,
        optimized: true,
        tempAbort: 87,
        tempRetain: 75,
        description: 'Laptop entry GPU. Conservative preset.',
        estimatedSpeed: '~50-80 kH/s (WPA2)',
    },
];

// ---------------------------------------------------------------------------
// Fallback preset — used when no GPU matches
// ---------------------------------------------------------------------------
const DEFAULT_PRESET = {
    tier: 'unknown',
    name: 'Unknown GPU',
    workload: 2,
    optimized: true,
    tempAbort: 90,
    tempRetain: 78,
    description: 'Could not match your GPU. Safe default preset applied.',
    estimatedSpeed: 'Run benchmark to determine',
};

/**
 * Match a GPU model string against the presets database.
 * @param {string} gpuModel — e.g., "NVIDIA GeForce RTX 3070"
 * @returns {object} The matching preset (or DEFAULT_PRESET)
 */
function getPresetForGPU(gpuModel) {
    if (!gpuModel) return { ...DEFAULT_PRESET };

    for (const preset of GPU_PRESETS) {
        if (preset.pattern.test(gpuModel)) {
            return { ...preset, matchedModel: gpuModel, pattern: undefined };
        }
    }

    return { ...DEFAULT_PRESET, matchedModel: gpuModel };
}

/**
 * Build hashcat CLI arguments from a preset.
 * @param {object} preset
 * @returns {string[]} CLI args to append
 */
function presetToArgs(preset) {
    const args = [];
    if (preset.workload) args.push('-w', String(preset.workload));
    if (preset.optimized) args.push('-O');
    if (preset.tempAbort) args.push('--hwmon-temp-abort', String(preset.tempAbort));
    return args;
}

module.exports = { GPU_PRESETS, DEFAULT_PRESET, getPresetForGPU, presetToArgs };
