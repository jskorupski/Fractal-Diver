---
name: adaptive-performance-and-camera
description: >-
  Tune and debug Fractal Diver's 4-tier closed-loop adaptive performance controller, progressive
  settling, demand-driven React Three Fiber WebGPU lifecycle, DPR budgeting, camera navigation
  physics, DebugPanel overrides, and 4K wallpaper export. Use when modifying
  usePerformanceAdaptation.ts, dpr.ts, useFractalInteraction.ts, FractalCanvas.tsx,
  DebugPanel.tsx, App.tsx frame-timing/locking logic, or screenshot.ts.
---

# Adaptive Performance, R3F Lifecycle & Camera Physics

Use this runbook when adjusting performance tuning knobs, debugging frame-rate, DPR, or resize behavior, modifying camera controls, or updating the wallpaper capture pipeline.

For state transitions, exact EMA weights, and mathematical formulas, see [references/state-and-control-loop.md](./references/state-and-control-loop.md).

---

## 1. Closed-Loop 4-Tier Quality Adaptation ([`usePerformanceAdaptation.ts`](../../../src/hooks/usePerformanceAdaptation.ts), [`dpr.ts`](../../../src/utils/dpr.ts) & [`App.tsx`](../../../src/App.tsx))

1. **Dual-Regime Targets & Strict 4-Tier Cascade**:
   - **Interactive (`activeInteracting = isInteracting || isDragging`)**: Targets **30 FPS (`33.3ms`)**. When lagging, sheds load strictly in 4-tier priority with multiplicative spillover:
     1. **Tier 1 — Dynamic Resolution Scaling (`interactiveResolutionScale` -> `DPR`)**: Bounded by `getDprBounds` (`src/utils/dpr.ts`), dropping internal DPR first (`1.5x -> 1.25x -> 1.0x` on high-DPI mobile; down to `0.75x` interactive floor on large `>= 750k` CSS-pixel tablet/desktop viewports) quantized to `0.25x` increments to avoid WebGPU swapchain thrashing ($O(\text{DPR}^2)$ savings, zero fractal shape change).
     2. **Tier 2 — Grazing-Ray Step Cap (`interactiveSteps`)**: Adapts dynamically within `[config.minInteractiveSteps, config.interactiveSteps]` so silhouette grazing rays and deep dark crevices bail early while front-facing surfaces remain crisp.
     3. **Tier 3 — Pixel-Bounded Surface Threshold (`interactiveEpsilon`)**: `maxInteractiveEpsilon` is tightened to `0.0015–0.002` (~1.5–2px cone max instead of `0.004–0.008`) so thin tendrils never bloat into "melted clay" blobs.
     4. **Tier 4 — Emergency Survival Floor (`interactiveIterations`)**: Remains **locked** at `defaultInteractiveIterations` (+ zoom-LOD boost in [`src/App.tsx`](../../../src/App.tsx)) during normal drags so 3D topology and orbit-trap colors never pop mid-drag; only drops toward `minInteractiveIterations` if Tiers 1–3 are exhausted and FPS still lags.
   - **Reverse-Order Recovery**: On fast interactive frames, restores strictly in reverse order: `interactiveIterations -> defaultInteractiveIterations` (never exceeds default automatically) -> `interactiveEpsilon -> defaultInteractiveEpsilon` -> `interactiveSteps -> config.interactiveSteps` -> `interactiveResolutionScale -> 1.0`, and applies sub-pixel polish (`interactiveEpsilon -> minInteractiveEpsilon`) only once Tiers 1 and 2 are back at full defaults.
   - **Settled (`!activeInteracting`)**: Targets **5 FPS (`200ms`)** progressive refinement. On release, inherits `interactiveEpsilon` and `interactiveIterations` and resets `settledResolutionScale = 1.0` (paired with `FractalCanvas`'s `150ms` settled DPR step-up up to `2.25x` within the `2.2M` pixel budget). Refines `settledEpsilon` and `settledIterations` via symmetric `sqrt(multiplier)`; under severe settled lag (`multiplier > 2.5`), sheds `settledResolutionScale` toward `minSettledScale` first before backing off `settledEpsilon` / `settledIterations` down to the interactive floor.
2. **Tuning Per-Fractal Bounds ([`src/constants/fractals.ts`](../../../src/constants/fractals.ts))**:
   - Current calibrated bounds:
     - `0` Mandelbulb: `minInteractiveSteps: 64`, `interactiveSteps: 120`, `maxInteractiveEpsilon: 0.0015`, settled iters `8–14` (`+6` zoom cap)
     - `1` Menger Sponge: `minInteractiveSteps: 64`, `interactiveSteps: 120`, `maxInteractiveEpsilon: 0.0015`, settled iters `8–20` (`+16` zoom cap)
     - `2` Julia Set: `minInteractiveSteps: 48`, `interactiveSteps: 80`, `maxInteractiveEpsilon: 0.0015`, settled iters `24–96` (`+16` zoom cap)
     - `3` Sierpinski: `minInteractiveSteps: 40`, `interactiveSteps: 60`, `maxInteractiveEpsilon: 0.0018`, settled iters `12–28` (`+16` zoom cap)
     - `4` Mandelbox: `minInteractiveSteps: 56`, `interactiveSteps: 100`, `maxInteractiveEpsilon: 0.0015`, settled iters `24–64` (`+16` zoom cap)
     - `5` Apollonian: `minInteractiveSteps: 40`, `interactiveSteps: 60`, `maxInteractiveEpsilon: 0.002`, settled iters `8–24` (`+16` zoom cap)
   - Keep Mandelbulb's zoom iteration boost strictly capped (`maxZoomIterBoost = fractalType === 0 ? 6 : 16` in [`src/App.tsx`](../../../src/App.tsx)) so $8^k$ derivative growth cannot overflow single-precision `f32`.
3. **Settled Quality Lock & [`DebugPanel`](../../../src/components/DebugPanel.tsx) Overrides**:
   - [`src/App.tsx`](../../../src/App.tsx) locks quality and stops calling `invalidate()` once `!activeInteracting && (updated === false || delta >= 0.2) && settleTimeRef.current >= 1.0 && !isActuallyMoving`.
   - Any action that invalidates visuals (interaction start, parameter/slicer update, fractal change, significant window resize > 5px, or manual DebugPanel edit) **must** reset or update `isSettledQualityLocked` appropriately.
   - [`DebugPanel`](../../../src/components/DebugPanel.tsx) displays live `DPR` (`{values.dpr.toFixed(2)}x`) alongside `FPS`, `Settle`, `Epsilon`, `Iterations`, and `Steps`, and routes `interactiveSteps` / `settledSteps` overrides directly through `usePerformanceAdaptation.overrideKnobs` (with settled overrides setting `setIsSettledQualityLocked(true)` so automatic adaptation doesn't overwrite manual edits).

---

## 2. R3F, `WebGPURenderer` Lifecycle & DPR Budgeting ([`FractalCanvas.tsx`](../../../src/components/FractalCanvas.tsx) & [`dpr.ts`](../../../src/utils/dpr.ts))

Preserve every lifecycle guard inside [`src/components/FractalCanvas.tsx`](../../../src/components/FractalCanvas.tsx) and [`src/utils/dpr.ts`](../../../src/utils/dpr.ts):

- **DPR Module Separation**: [`src/utils/dpr.ts`](../../../src/utils/dpr.ts) holds `getDprBounds`, `calculateTargetDpr`, and DPR/pixel-budget constants (`re-exported` from [`FractalCanvas.tsx`](../../../src/components/FractalCanvas.tsx)). Keep `src/App.tsx` importing `getDprBounds` from `src/utils/dpr.ts` rather than `FractalCanvas.tsx` so `App.test.tsx`'s `FractalCanvas` mock remains intact.
- **Responsive Resize**: R3F's `setSize` writes inline pixel dimensions directly onto `<canvas>`, pinning `canvas.clientWidth`. Always read dimensions from `containerRef.current` (driven by both `window.addEventListener('resize', ...)` and a `ResizeObserver` on `containerRef.current`), then call `rendererRef.current.setSize(width, height, true)` followed by `root.configure(...)`.
- **Adaptive Pixel-Budget DPR & `CAMERA_CONFIG`**: Compute `dpr` via `calculateTargetDpr` / `getDprBounds` (bounded to `1.1M` pixels / max `1.5x` while interacting, stepping up after `150ms` idle settle to `2.2M` pixels / max `2.25x` on high-DPI phones/tablets, and scaling down to a `0.75x` interactive floor on large `>= 750k` CSS-pixel tablet/desktop viewports in `0.25x` quantized steps), pass both `dpr` and module-level `CAMERA_CONFIG = { position: [0, 0, 1], fov: 50 }` on every `root.configure(...)`, and keep `uniformResolution` synced to physical pixels (`size * activeDpr`) so shader pixel-cone anti-aliasing matches the framebuffer.
- **Never Drop Slow Frames**: Always report frame time via `onFrameTime(Math.min(delta, 1.0), isStillSmoothing)`. Filtering out `delta >= 0.5` starves the adaptation controller during GPU stalls and blocks `settleTimeRef` from reaching `1.0` to lock.
- **WebGPU `device.lost` & Shader HMR**: Keep `device.lost` auto-retry (`retryCount` bump) intact, and keep `[uniforms, renderFractal]` as the `useMemo` dependency array for `MeshBasicNodeMaterial` so shader edits recompile under Vite HMR.
- **Suppress Context Menu**: Keep `onContextMenu={(e) => e.preventDefault()}` on `<canvas>` so right-click panning works cleanly.

---

## 3. Camera Navigation Physics (`useFractalInteraction.ts`)

Inside [`src/hooks/useFractalInteraction.ts`](../../../src/hooks/useFractalInteraction.ts):

- **Rotation**: 1-finger drag and primary mouse drag call `calculateRotation`, flipping horizontal yaw direction when the transformed up vector (`(0,1,0).applyQuaternion(currentRotation)`) has `y < 0` to keep orbit intuitive upside-down.
- **Panning**: Supports `Shift` + left-drag, right-click + drag (`isRightClickPanRef` / `(e.buttons & 2) !== 0`), and 2-finger drag (disambiguated against pinch via `PINCH_THRESHOLD = 15`, `PAN_THRESHOLD = 10`). World-space sensitivity scales inversely with zoom (`defaultConfig.zoom / current.zoom`).
- **Progressive Zoom Deceleration (`getZoomDamping`) & Rotation Scaling (`getRotationScale`)**:
  - Zoom-in slows logarithmically as magnification deepens (`1 / (1 + 0.35 * max(0, log2(zoom / defaultZoom)))`), while zoom-out gets a `min(1.0, damping * 1.35)` recovery boost.
  - Camera transforms smooth inside `FractalMesh` via frame-rate independent exponential damping (`1 - Math.exp(-12 * delta)`).
- **Throttle**: Mouse/touch/wheel state updates are throttled at `~60 Hz` (`16ms`) with `wheelTimeoutRef` ending wheel interaction after `200ms`.

---

## 4. Wallpaper Export (`screenshot.ts`)

[`takeWallpaperScreenshot`](../../../src/utils/screenshot.ts) creates an isolated offscreen `WebGPURenderer`:

- Explicitly configure `renderer.outputColorSpace = THREE.SRGBColorSpace` and `renderer.toneMapping = THREE.ACESFilmicToneMapping` to match R3F's default color pipeline; without this, exports render flat (`NoToneMapping`).
- Cap max render dimension at `3840px` (2x supersampling only when `devicePixelRatio < 2`), downsample via a high-smoothing 2D canvas, export `image/jpeg` at `0.95` quality, and immediately dispose geometry, material, scene references, and renderer.

---

## 5. Verification

After any changes to performance adaptation, canvas lifecycle, camera interaction, or screenshot logic, run:
```bash
npm run lint && npx vitest run --coverage
```
Confirm all tests in `usePerformanceAdaptation.test.ts`, `FractalCanvas.test.tsx`, `DebugPanel.test.tsx`, `fractals.test.ts`, `screenshot.test.ts`, and `App.test.tsx` (plus any DPR helper tests) pass.
