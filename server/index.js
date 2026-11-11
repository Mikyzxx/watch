import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { MarketEngine } from './engine/marketEngine.js';
import { RoomManager } from './roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../dist');

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

export function createPulseServer({ tickIntervalMs = 1200 } = {}) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const marketEngine = new MarketEngine();
  const roomManager = new RoomManager(marketEngine);

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'PulseStop', ts: Date.now() });
  });

  app.get('/api/network-info', (req, res) => {
    const hostHeader = req.get('host') || '';
    const requestPort = hostHeader.includes(':') ? hostHeader.split(':')[1] : String(server.address()?.port || 3000);
    const lanIps = getLanAddresses();
    const preferredIp = lanIps[0] || 'localhost';
    res.json({
      lanIps,
      preferredOrigin: `http://${preferredIp}:${requestPort}`,
      port: Number(requestPort),
    });
  });

  app.get('/api/qr', async (req, res) => {
    const text = String(req.query.text || '').slice(0, 512);
    if (!text) {
      res.status(400).json({ error: 'Missing ?text parameter' });
      return;
    }
    try {
      const svg = await QRCode.toString(text, {
        type: 'svg',
        margin: 1,
        width: 220,
        color: {
          dark: '#0B1220',
          light: '#FFFFFF',
        },
      });
      res.type('image/svg+xml').send(svg);
    } catch {
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        return next();
      }
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      roomManager.handleMessage(ws, data);
    });
    ws.on('close', () => {
      roomManager.detachClient(ws);
    });
    ws.on('error', () => {
      roomManager.detachClient(ws);
    });
  });

  const intervalId =
    tickIntervalMs > 0
      ? setInterval(() => {
          roomManager.broadcastMarketTick();
        }, tickIntervalMs)
      : null;

  return {
    app,
    server,
    wss,
    marketEngine,
    roomManager,
    close: () =>
      new Promise((resolve) => {
        if (intervalId) clearInterval(intervalId);
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close(() => {
          server.close(() => resolve());
        });
      }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const requestedPort = Number(process.env.PORT || 3050);
  const allowFallback = !process.env.PORT;
  const { server } = createPulseServer();

  function listenOnPort(portToTry, retriesLeft) {
    const onError = (err) => {
      if (err.code === 'EADDRINUSE' && allowFallback && retriesLeft > 0) {
        server.removeListener('error', onError);
        listenOnPort(portToTry + 1, retriesLeft - 1);
        return;
      }
      throw err;
    };

    server.once('error', onError);
    server.listen(portToTry, '0.0.0.0', () => {
      server.removeListener('error', onError);
      const actualPort = server.address()?.port || portToTry;
      const lanIps = getLanAddresses();
      console.log(`\n  PulseStop Server activo en puerto ${actualPort}`);
      console.log(`  Local: http://localhost:${actualPort}`);
      for (const ip of lanIps) {
        console.log(`  Red Wi-Fi (Teléfono / Smartwatch): http://${ip}:${actualPort}`);
      }
      console.log('');
    });
  }

  listenOnPort(requestedPort, 10);
}
