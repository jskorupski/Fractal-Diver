---
name: lan-webgpu-preview-and-deploy
description: >-
  Run local or LAN HTTPS WebGPU live previews for testing Fractal Diver on external laptops or mobile
  devices, execute full pre-release verification, and build or deploy to Cloudflare Workers. Use when
  asked to share a preview URL on the local network, troubleshoot WebGPU secure-context errors, or
  validate and deploy a build.
---

# LAN HTTPS WebGPU Preview & Cloudflare Workers Deployment

Follow this workflow to serve **Fractal Diver** over a local network with WebGPU enabled, verify builds without overloading older local hardware, and deploy to Cloudflare Workers.

---

## 1. Why LAN Previews Require HTTPS

Browsers only expose `navigator.gpu` (**WebGPU**) inside **Secure Contexts** (`https://...` or `http://localhost`). Opening `http://<LAN-IP>:3000/` from a laptop or phone on the same Wi-Fi/LAN disables WebGPU even on WebGPU-capable hardware.

Use the included dual HTTP + self-signed HTTPS script whenever the user asks to preview on another device on their LAN.

---

## 2. Launching & Stopping the LAN Preview Server

1. **Run the preview helper in the background** (use `IsDaemon: true`; port binding/reading local certs if restricted may require running outside the sandbox if sandboxed execution blocks socket binding):
   ```bash
   node .agents/skills/lan-webgpu-preview-and-deploy/scripts/lan-https-preview.mjs
   ```
   The script automatically:
   - Detects the machine's primary IPv4 LAN interface via `os.networkInterfaces()` (never guess an IP).
   - Generates an ephemeral 1-day self-signed TLS cert in `/tmp/fractal-diver-lan-{key,cert}.pem` with `subjectAltName=IP:<LAN_IP>,DNS:localhost`.
   - Starts Vite HTTP on `0.0.0.0:3000` and Vite HTTPS on `0.0.0.0:3443`.
2. **Share only local LAN URLs** (never expose external tunnels):
   - Give the user `https://<detected-lan-ip>:3443/` (recommended for WebGPU) and `http://<detected-lan-ip>:3000/`.
   - Remind them to accept the browser's one-time self-signed certificate warning ("Advanced -> Proceed") and press `Cmd + R` after shader edits so Three.js recompiles `MeshBasicNodeMaterial`.
3. **Clean Shutdown**:
   - Terminate the background task cleanly (`manage_task` `kill`); the script's signal handler unlinks the `/tmp/fractal-diver-lan-*.pem` files automatically, or verify with `rm -f /tmp/fractal-diver-lan-key.pem /tmp/fractal-diver-lan-cert.pem` and `lsof -i :3000 -i :3443 || true`.

---

## 3. Hardware & Performance Testing Discipline

- **CPU-First Verification on Older Hosts**: On older/integrated GPUs (e.g., 2018 Intel Macs), prefer fast CPU shader verification (`npm test` + `node .agents/skills/wgsl-fractal-authoring/scripts/probe-raymarch.mjs`) during tight edit loops instead of spinning up heavy headless WebGPU browser instances.
- **High-DPI Check**: Remember [`src/utils/dpr.ts`](../../../src/utils/dpr.ts) (`getDprBounds` / `calculateTargetDpr`, re-exported by [`FractalCanvas.tsx`](../../../src/components/FractalCanvas.tsx)) drives `0.25x`-quantized 4-tier Dynamic Resolution Scaling (`1.5x -> 1.0x` on high-DPI phones, `1.0x -> 0.75x` interactive floor on large `>= 750k` CSS-pixel viewports, and `2.25x` settled on high-DPI mobile), with live `DPR` shown in [`DebugPanel`](../../../src/components/DebugPanel.tsx), while `takeWallpaperScreenshot` supersamples offscreen up to `3840px`.

---

## 4. Pre-Release Checks & Cloudflare Workers Deployment

Static SPA hosting is configured in [`wrangler.jsonc`](../../../wrangler.jsonc) (`"not_found_handling": "single-page-application"`).

Run these steps in order before committing or deploying:

1. **Type check & Test suite**:
   ```bash
   npm run lint && npx vitest run --coverage
   ```
2. **Production build**:
   ```bash
   npm run build
   ```
3. **Local Workers preview** (optional):
   ```bash
   npm run preview
   ```
4. **Deploy to Cloudflare Workers** (only when explicitly requested by the user):
   ```bash
   npm run deploy
   ```
