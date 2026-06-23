# 🛜 NoCAP

A professional, cross-platform web console for cracking WiFi handshakes using **hashcat**. Built for security education and authorized penetration testing.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎯 **Auto GPU Detection** | Automatically detects your GPU (NVIDIA/AMD/Intel) and applies optimized presets |
| 🔄 **Auto Cap Conversion** | Converts .cap/.pcap/.pcapng files to hashcat-compatible .hc22000 format |
| 📁 **Drag & Drop Upload** | Easy file upload with drag-and-drop or file browser |
| 📚 **Dictionary Manager** | Download popular wordlists (RockYou, SecLists, Weakpass) with one click |
| 📊 **Real-time Monitoring** | Live progress, speed, temperature, and ETA via WebSocket |
| ⏸️ **Session Management** | Pause, resume, and restore cracking sessions |
| 🎨 **Modern Dark UI** | Premium cybersecurity-themed interface with glassmorphism design |
| 🖥️ **Cross-Platform** | Works on both Windows and Linux with one-click setup scripts |
| 🔧 **Multiple Attack Modes** | Dictionary, Combinator, Brute-force, Mask, Hybrid, and Rule-based attacks |
| 📋 **Potfile Viewer** | Browse all previously cracked passwords |
| 🔔 **Browser Notifications** | Get notified when a password is cracked |

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

1. **Upload** — Drag and drop your .cap file (or click to browse)
2. **Configure** — Select attack mode, dictionary, and review GPU preset
3. **Crack** — Click Start and monitor progress in real-time
4. **Results** — View cracked passwords in the results panel

---

## 🏗️ Architecture

```
Frontend (Vanilla JS) ←→ REST API + WebSocket ←→ Hashcat Process
                              ↓
                    GPU Detector | Cap Converter | Dict Manager
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

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
