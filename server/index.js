/**
 * Cap Hashcat Web — Main Server
 * Express HTTP + WebSocket server.
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const config = require('./config');
const hashcatManager = require('./hashcat-manager');
const dictManager = require('./dictionary-manager');

// ── Express App ───────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic security headers (no external deps)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});

// Optional token auth for the API. Enabled only when AUTH_TOKEN is set.
function checkAuthToken(req) {
    if (!config.authToken) return true;
    const header = req.headers['authorization'] || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || req.headers['x-auth-token'] || req.query.token;
    return token === config.authToken;
}

if (config.authToken) {
    app.use('/api', (req, res, next) => {
        if (checkAuthToken(req)) return next();
        res.status(401).json({ error: 'Unauthorized' });
    });
}

// Serve static frontend files
app.use(express.static(config.dirs.public));

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/upload', require('./routes/upload'));
app.use('/api/hashcat', require('./routes/hashcat'));
app.use('/api/system', require('./routes/system'));
app.use('/api/dictionaries', require('./routes/dictionary'));

// Fallback to index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(config.dirs.public, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Server] Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// ── WebSocket Server ──────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

wss.on('connection', (ws, req) => {
    // Enforce auth token when configured
    if (config.authToken) {
        const url = new URL(req.url, 'http://localhost');
        if (url.searchParams.get('token') !== config.authToken) {
            ws.close(1008, 'Unauthorized');
            return;
        }
    }

    clients.add(ws);
    console.log(`[WS] Client connected (total: ${clients.size})`);

    // Send current status immediately
    const status = hashcatManager.getStatus();
    ws.send(JSON.stringify({ type: 'connected', data: status, ts: Date.now() }));

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`[WS] Client disconnected (total: ${clients.size})`);
    });

    ws.on('error', (err) => {
        console.error('[WS] Error:', err.message);
        clients.delete(ws);
    });
});

/**
 * Broadcast a message to all connected WebSocket clients.
 */
function broadcast(message) {
    for (const client of clients) {
        if (client.readyState === 1) { // OPEN
            try {
                client.send(message);
            } catch { /* ignore */ }
        }
    }
}

// Wire up WebSocket broadcasting to managers
hashcatManager.setWSBroadcast(broadcast);
dictManager.setWSBroadcast(broadcast);

// ── Start Server ──────────────────────────────────────────────────────
server.listen(config.port, config.host, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║              🛜  NoCAP — Started                  ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  URL: http://localhost:${config.port}                    ║`);
    console.log(`║  Platform: ${config.platform.padEnd(37)}║`);
    console.log(`║  Hashcat: ${(config.hashcatBinary ? '✅ Found' : '❌ Not found').padEnd(38)}║`);
    console.log(`║  hcxpcapngtool: ${(config.hcxpcapngtool ? '✅ Found' : '⚠️  N/A').padEnd(32)}║`);
    console.log(`║  Auth: ${(config.authToken ? '🔒 Token required' : '🔓 Disabled').padEnd(41)}║`);
    console.log('╚══════════════════════════════════════════════════╝');
    if (config.host === '0.0.0.0' && !config.authToken) {
        console.warn('[Security] Listening on 0.0.0.0 with no AUTH_TOKEN — the GUI is reachable by anyone on your network. Set AUTH_TOKEN or bind to 127.0.0.1.');
    }
    console.log('');
});

// Don't let a stray rejection/exception take the whole server down silently
process.on('unhandledRejection', (err) => {
    console.error('[Server] Unhandled rejection:', err && err.stack ? err.stack : err);
});
process.on('uncaughtException', (err) => {
    // Log and keep running — a crack finishing or a flaky sensor read must never kill the server
    console.error('[Server] Uncaught exception (server stays up):', err && err.stack ? err.stack : err);
});

module.exports = { app, server };
