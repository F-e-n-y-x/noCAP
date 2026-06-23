# 🛜 NoCAP - WiFi Handshake Cracker

**NoCAP is a simple web app that checks how strong a WiFi password is.**

You give it a .cap/.pcap/.pcapng/.hc22000 file, NoCAP tries a huge list of
passwords very fast using your graphics card, and tells you if it finds the right
one — all from a clean page in your browser. No commands to memorize.

> ⚠️ **Only use this on your own WiFi, or a network you have written permission to test.**
> Cracking someone else's WiFi is illegal.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)

---

## What it does (in plain words)

1. You upload a file captured from a WiFi network (a `.cap` file).
2. NoCAP turns it into a format the cracking engine understands.
3. It tries a big list of passwords against it, very fast, using your GPU.
4. If one matches, it shows you the password.

Under the hood it uses **hashcat**, a popular and powerful password-cracking tool.
NoCAP just gives it a friendly screen so you don't have to type commands.

---

## ✨ Features

- 🖥️ **All in one page** — upload, set up, and watch progress side by side.
- 🎮 **Knows your GPU** — finds your graphics card and picks good settings automatically.
- 📂 **Reads capture files for you** — `.cap`, `.pcap`, `.pcapng`. No extra tools needed.
- 📚 **One-click password lists** — download good wordlists, from tiny to 1.5 GB.
- 📊 **Live progress** — speed, time remaining, GPU temperature, and a clear progress bar.
- ✅ **Plain results** — tells you if the password was *found*, *not found*, or there was an
  *error* — and explains why and what to try next.
- 🕘 **History** — keeps a record of every attempt, with CSV export.
- 🔧 **Live system info** — see your RAM and GPU usage while it runs.
- 🌙 **Light and dark themes.**
- 🔄 **Built-in updates** — update hashcat and NoCAP itself from inside the app.
- 🔒 **Safe by default** — only runs on your own computer unless you choose otherwise.

---

## ✅ What you need

- A **Windows or Linux** computer with a graphics card (NVIDIA, AMD, or Intel).
- **[Node.js](https://nodejs.org/)** version 18 or newer.
- **[hashcat](https://hashcat.net/hashcat/)** — the cracking engine. NoCAP can download this
  for you on first run if you don't have it.
- Up-to-date **GPU drivers**.

That's it. (Python is optional and only helps in rare cases.)

---

## 🚀 How to run it

**Windows** — double-click:
```
start.bat
```

**Linux**:
```bash
./start.sh
```

The script checks what's installed, grabs anything missing, starts the app, and opens
it in your browser at **http://localhost:3000**. Done.

---

## 🎮 How to use it (step by step)

1. Open the **Crack** page and drag in your `.cap` file. NoCAP converts it automatically.
2. Pick the converted file, choose a **password list**, and leave the attack type as
   *Dictionary* (a good default).
3. Click **Start**. On the right you'll see live speed, progress, and GPU temperature.
4. When it finishes, NoCAP tells you what happened:
   - ✅ **Found** — shows you the password.
   - ⭕ **Not found** — the password wasn't in your list. Try a bigger one.
   - ❌ **Error** — shows the reason in plain language.

> 💡 **Tip:** Small lists are fast but find fewer passwords. If nothing is found, try a
> bigger list like **RockYou**, then one of the large lists. Also, your capture must
> include the network's name (it usually does) for cracking to work.

---

## 📄 The four pages

| Page | What it's for |
|------|---------------|
| **Crack** | Do the actual cracking and watch it live. |
| **Dictionaries** | Download ready-made password lists, or upload your own. |
| **History** | See past attempts and export them to a spreadsheet. |
| **System** | Live GPU/RAM info, check for updates, and view all found passwords. |

---

## 🔒 Is it safe to run?

Yes. By default NoCAP only runs on **your own computer** — nobody else on your network can
open it. You don't need to change anything.

<details>
<summary>Advanced: open it to other devices (e.g. your phone)</summary>

If you want to reach NoCAP from another device, run it like this (set a password so only
you can use it):

```bash
# Windows (PowerShell)
$env:HOST="0.0.0.0"; $env:AUTH_TOKEN="pick-a-secret"; npm start

# Linux / macOS
HOST=0.0.0.0 AUTH_TOKEN="pick-a-secret" npm start
```

| Setting | Default | Meaning |
|--------|---------|---------|
| `PORT` | `3000` | Which port the app uses. |
| `HOST` | `127.0.0.1` | `127.0.0.1` = this computer only. `0.0.0.0` = reachable on your network. |
| `AUTH_TOKEN` | *(off)* | When set, the app asks for this secret before letting anyone in. |

</details>

---

## ⚠️ Please read — legal note

This tool is for **learning** and **testing your own security** only.

- Only use it on networks you **own** or have **written permission** to test.
- Accessing networks without permission is **illegal** in most places.
- The author isn't responsible for misuse.

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and share.
