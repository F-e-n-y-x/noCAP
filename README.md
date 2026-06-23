# 🛜 NoCAP

A professional, cross-platform web console for cracking WiFi handshakes using **hashcat**. Built for security education and authorized penetration testing.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| ⚡ **Single-page crack console** | Upload, configure, and watch live progress side-by-side — no tab hopping |
| 🎯 **Auto GPU detection & presets** | Detects NVIDIA / AMD / Intel GPUs and applies tuned workload/temperature presets |
| 🔄 **Built-in cap conversion** | Native `.cap/.pcap/.pcapng` → `.hc22000` parser (handshakes + PMKID), with `hcxpcapngtool` used when available |
| 📚 **Dictionary manager** | One-click download of curated WiFi & general wordlists (tiny WPA lists → RockYou → 1.5 GB lists) with progress |
| 📊 **Real-time monitoring** | Live status, speed, ETA, GPU temperature, and a redesigned keyspace progress panel over WebSocket |
| 🧠 **Clear outcomes** | Tells you *why* a job ended — cracked / no match / error — with the real hashcat error and next steps |
| 🗂️ **Persistent history** | Every job saved (attack, wordlist, result, passwords, duration) with CSV export |
| 🖥️ **Live device telemetry** | Task-manager style RAM + GPU (load / temp / VRAM) panel, cross-platform |
| ⏸️ **Sessions** | Pause, resume, restore, and delete checkpointed sessions |
| ⬆️ **hashcat updater** | Check for and install the latest hashcat from the UI (safe swap with backup) |
| 🔧 **All attack modes** | Dictionary, Combinator, Brute-force/Mask, Hybrid, and rule-based |
| 🎨 **Token-based design system** | Clean Geist/Vercel-neutral UI with light & dark themes (no neon/glassmorphism) |
| 🔐 **Secure by default** | Binds to localhost; optional bearer-token auth; validated inputs |

---

## 📋 Prerequisites

- **Node.js** ≥ 18.0.0 ([Download](https://nodejs.org/))
- **Python** ≥ 3.8 ([Download](https://www.python.org/downloads/))
- **hashcat** ([Download](https://hashcat.net/hashcat/))
- **GPU Drivers** (CUDA for NVIDIA, ROCm for AMD, or OpenCL runtime for Intel)

### Optional (Linux)
- `hcxtools` — For native .cap conversion (auto-detected if installed)

---

## 🚀 Quick Start

### Windows
```batch
# Double-click or run in terminal:
start.bat
```

### Linux
```bash
chmod +x start.sh
./start.sh
```

The setup script will:
1. ✅ Check all dependencies (Node.js, Python, hashcat)
2. ✅ Install npm packages if needed
3. ✅ Start the web server
4. ✅ Open your browser to `http://localhost:3000`

---

## 🎮 Usage

The UI has four pages:

- **Crack** — drop a `.cap`, pick the hash file, choose an attack mode + dictionary, hit **Start**, and watch live telemetry beside the controls.
- **Dictionaries** — download curated wordlists or upload your own.
- **History** — review past jobs and export to CSV.
- **System** — live RAM/GPU telemetry, dependency status, potfile vault, sessions, and a one-click **hashcat update** check.

> **Tip for getting cracks:** WPA needs the network's beacon (for the ESSID) in the capture, and the password must be in your wordlist. Start with a WiFi list, then RockYou, then a larger list.

---

## 🏗️ Architecture

```
Frontend (vanilla JS + token design system)
        │  REST API + WebSocket
        ▼
Express server ── hashcat process manager ──► hashcat
        ├─ native cap → hc22000 parser
        ├─ GPU detector + presets
        ├─ dictionary downloader
        └─ live system telemetry / updater
```

---

## 🔐 Security & Network Access

By default the server binds to **`127.0.0.1` (localhost only)** — it is *not* reachable from
other machines. This is deliberate: the app spawns processes and reads local files.

To expose it on your LAN, set both of these (never one without the other):

```bash
# Windows (PowerShell)
$env:HOST="0.0.0.0"; $env:AUTH_TOKEN="choose-a-long-secret"; npm start

# Linux / macOS
HOST=0.0.0.0 AUTH_TOKEN="choose-a-long-secret" npm start
```

When `AUTH_TOKEN` is set, API requests must include it as `Authorization: Bearer <token>`,
an `X-Auth-Token` header, or a `?token=` query parameter (the WebSocket uses `?token=`).

| Env var | Default | Purpose |
|---------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address (`0.0.0.0` for LAN) |
| `AUTH_TOKEN` | *(unset)* | Required bearer token when set |

---

## ⚠️ Disclaimer

> **This tool is for educational and authorized security testing purposes only.**
> 
> - Only use this tool on networks you own or have explicit written permission to test.
> - Unauthorized access to computer networks is illegal in most jurisdictions.
> - The authors are not responsible for misuse of this tool.
> - This project was developed as part of an MCA security research curriculum.

---

## 👤 Author

Made by **Ayush** — [GitHub](https://github.com/F-e-n-y-x/) · [LinkedIn](https://www.linkedin.com/in/ayushsoni2911/)

Repository: [github.com/F-e-n-y-x/noCAP](https://github.com/F-e-n-y-x/noCAP)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
