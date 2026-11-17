#!/usr/bin/env node
/**
 * Ephemeral LAN HTTP (3000) & HTTPS (3443) Vite preview server for Fractal Diver.
 *
 * Browsers require a Secure Context (HTTPS or localhost) for `navigator.gpu` (WebGPU),
 * so testing on another laptop or phone on the same LAN requires an HTTPS listener.
 *
 * Usage:
 *   node .agents/skills/lan-webgpu-preview-and-deploy/scripts/lan-https-preview.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

const KEY_PATH = '/tmp/fractal-diver-lan-key.pem';
const CERT_PATH = '/tmp/fractal-diver-lan-cert.pem';

function detectLanIPv4() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, entries] of Object.entries(ifaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        candidates.push({ name, address: entry.address });
      }
    }
  }
  const preferred = candidates.find((c) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(c.address));
  return (preferred || candidates[0] || { address: '127.0.0.1' }).address;
}

function generateEphemeralCert(lanIp) {
  execFileSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    KEY_PATH,
    '-out',
    CERT_PATH,
    '-days',
    '1',
    '-subj',
    `/CN=${lanIp}`,
    '-addext',
    `subjectAltName=IP:${lanIp},DNS:localhost`,
  ]);
}

function cleanupCerts() {
  for (const p of [KEY_PATH, CERT_PATH]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // Ignore cleanup errors on shutdown
    }
  }
}

async function main() {
  const lanIp = detectLanIPv4();
  generateEphemeralCert(lanIp);

  const viteUrl = pathToFileURL(path.join(repoRoot, 'node_modules/vite/dist/node/index.js')).href;
  const reactUrl = pathToFileURL(path.join(repoRoot, 'node_modules/@vitejs/plugin-react/dist/index.js')).href;
  const tailwindUrl = pathToFileURL(path.join(repoRoot, 'node_modules/@tailwindcss/vite/dist/index.mjs')).href;

  const { createServer } = await import(viteUrl);
  const { default: react } = await import(reactUrl);
  const { default: tailwindcss } = await import(tailwindUrl);

  const commonConfig = {
    configFile: false,
    root: repoRoot,
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.join(repoRoot, 'src') } },
  };

  const httpServer = await createServer({
    ...commonConfig,
    server: { host: '0.0.0.0', port: 3000, strictPort: true },
  });
  await httpServer.listen();

  const httpsServer = await createServer({
    ...commonConfig,
    server: {
      host: '0.0.0.0',
      port: 3443,
      strictPort: true,
      https: {
        key: fs.readFileSync(KEY_PATH),
        cert: fs.readFileSync(CERT_PATH),
      },
    },
  });
  await httpsServer.listen();

  console.log(`Detected LAN IPv4: ${lanIp}`);
  console.log(`LAN HTTPS Server (WebGPU Ready): https://${lanIp}:3443/`);
  console.log(`LAN HTTP  Server (non-WebGPU):   http://${lanIp}:3000/`);

  const shutdown = async () => {
    cleanupCerts();
    await Promise.allSettled([httpServer.close(), httpsServer.close()]);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', cleanupCerts);
}

main().catch((err) => {
  cleanupCerts();
  console.error(err);
  process.exit(1);
});
